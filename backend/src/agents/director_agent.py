import json
from typing import List, Tuple, Optional, Dict, Any
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState
from ..action_system import ACTION_DEFINITIONS
from ..prompts.director_prompts import (
    build_arc_planning_prompt,
    build_director_select_prompt,
    build_director_conclusion_prompt,
    build_final_conclusion_narration_prompt,
    ALLOWED_ACTIONS,
)


def _get_phase(current_turn: int, total_turns: int) -> str:
    if total_turns <= 0:
        return "setup"
    progress = current_turn / total_turns
    if progress < 0.2:
        return "setup"
    elif progress < 0.7:
        return "conflict"
    else:
        return "resolution"


class DirectorAgent(BaseAgent):
    def __init__(self, config: StoryConfig):
        super().__init__("Director", config)

    # ── Repair helper ───────────────────────────────────────────────

    async def _repair_json(
        self, raw: str, schema_hint: str
    ) -> Optional[Dict[str, Any]]:
        """One-shot LLM repair call for malformed JSON."""
        repair_prompt = (
            "The following text was supposed to be valid JSON but failed to parse.\n"
            "Fix it and return ONLY the corrected raw JSON.\n"
            "No backticks, no markdown, no commentary — ONLY the JSON object.\n\n"
            f"EXPECTED SCHEMA:\n{schema_hint}\n\n"
            f"MALFORMED TEXT:\n{raw[:1500]}\n\n"
            "Return ONLY the fixed JSON:"
        )
        try:
            repaired = await self.generate_response(repair_prompt)
            return self.safe_parse_json(repaired)
        except Exception:
            return None

    # ════════════════════════════════════════════════════════════════
    #  STORY ARC PLANNING (called once before the loop)
    # ════════════════════════════════════════════════════════════════

    async def plan_story_arc(
        self,
        seed_story: dict,
        characters: list,
        total_turns: int,
    ) -> List[Dict[str, Any]]:
        min_actions = max(5, total_turns // 5)

        prompt = build_arc_planning_prompt(
            seed_story=seed_story,
            characters=characters,
            total_turns=total_turns,
            min_actions=min_actions,
        )

        response = await self.generate_response(prompt)

        # Attempt 1: safe parse
        data = self.safe_parse_json(response)
        if data and data.get("arc_plan"):
            arc = data["arc_plan"]
            print(
                f"[Director] Arc planned: {len(arc)} beats, "
                f"conclusion: {data.get('conclusion_type', 'unspecified')}"
            )
            return arc

        # Attempt 2: LLM repair call
        print("[Director] Arc parse failed, attempting repair…")
        schema = (
            '{"arc_plan": [{"turn": 0, "phase": "setup", "type": "narration", '
            '"beat": "...", "suggested_speaker": null}], '
            '"planned_actions": ["CONFRONT", "..."], '
            '"conclusion_type": "..."}'
        )
        data = await self._repair_json(response, schema)
        if data and data.get("arc_plan"):
            arc = data["arc_plan"]
            print(f"[Director] Arc repaired: {len(arc)} beats")
            return arc

        # Attempt 3: deterministic default
        print("[Director] Arc repair failed, using default arc")
        return self._default_arc(characters, total_turns)

    @staticmethod
    def _default_arc(
        characters: list, total_turns: int
    ) -> List[Dict[str, Any]]:
        """Deterministic fallback arc that guarantees min_actions."""
        arc = [
            {
                "turn": 0,
                "phase": "setup",
                "type": "narration",
                "beat": "Opening scene",
                "suggested_speaker": None,
            }
        ]
        char_names = []
        for c in characters:
            if isinstance(c, dict):
                char_names.append(c["name"])
            elif hasattr(c, "name"):
                char_names.append(c.name)

        min_actions = max(5, total_turns // 5)
        allowed = sorted(ACTION_DEFINITIONS.keys())

        # Spread action beats evenly through conflict/climax
        action_turns = set()
        interval = max(2, (total_turns - 4) // (min_actions + 1))
        for i in range(min_actions):
            t = min(3 + i * interval, total_turns - 2)
            action_turns.add(t)

        action_idx = 0
        for i in range(1, total_turns):
            speaker = char_names[i % len(char_names)] if char_names else None
            if i < total_turns * 0.15:
                phase = "setup"
            elif i < total_turns * 0.55:
                phase = "conflict"
            elif i < total_turns * 0.80:
                phase = "climax"
            else:
                phase = "resolution"

            beat_type = "dialogue"
            beat_text = "Story continues"
            if i in action_turns and action_idx < len(allowed):
                beat_type = "action"
                beat_text = f"Character performs {allowed[action_idx]}"
                action_idx += 1

            arc.append(
                {
                    "turn": i,
                    "phase": phase,
                    "type": beat_type,
                    "beat": beat_text,
                    "suggested_speaker": speaker,
                }
            )
        return arc

    # ════════════════════════════════════════════════════════════════
    #  SPEAKER SELECTION (hybrid: rules + LLM)
    # ════════════════════════════════════════════════════════════════

    async def select_next_speaker(
        self,
        story_state: StoryState,
        available_characters: List[str],
        force_act: bool = False,
        endgame: bool = False,
    ) -> Tuple[str, str]:
        # ── deterministic guard: no repeat speaker ──────────────────
        filtered = available_characters.copy()
        if story_state.dialogue_history:
            last_speaker = story_state.dialogue_history[-1].speaker
            run = 0
            for t in reversed(story_state.dialogue_history):
                if t.speaker == last_speaker:
                    run += 1
                else:
                    break
            if run >= self.config.max_consecutive_same_character:
                filtered = [
                    c for c in available_characters if c != last_speaker
                ]
                if not filtered:
                    filtered = available_characters

        # ── LLM speaker selection ───────────────────────────────────
        prompt = build_director_select_prompt(
            story_state=story_state,
            available_characters=filtered,
            force_act=force_act,
            endgame=endgame,
            config=self.config,
        )

        response = await self.generate_response(prompt)

        if not response or not response.strip():
            print("[Director] Empty speaker response, using fallback")
            return (
                self._fallback_speaker(story_state, filtered),
                self._fallback_narration(story_state),
            )

        # Attempt 1: safe parse
        data = self.safe_parse_json(response)
        if data:
            speaker = data.get("next_speaker", "")
            narration = data.get("narration", "")
            if speaker in filtered:
                return speaker, narration
            # fuzzy match
            for c in filtered:
                if c.lower() in speaker.lower() or speaker.lower() in c.lower():
                    return c, narration
            return filtered[0], narration

        # Attempt 2: repair
        print("[Director] Speaker parse failed, attempting repair…")
        schema = '{"next_speaker": "Character Name", "narration": "Scene narration"}'
        data = await self._repair_json(response, schema)
        if data:
            speaker = data.get("next_speaker", filtered[0])
            narration = data.get("narration", "")
            if speaker in filtered:
                return speaker, narration
            return filtered[0], narration

        # Attempt 3: fallback
        print("[Director] Repair failed, using fallback")
        return (
            self._fallback_speaker(story_state, filtered),
            self._fallback_narration(story_state),
        )

    # ── Fallback helpers ────────────────────────────────────────────

    def _fallback_speaker(
        self, story_state: StoryState, available: List[str]
    ) -> str:
        arc_plan = getattr(story_state, "story_arc_plan", [])
        for beat in arc_plan:
            if beat.get("turn") == story_state.current_turn:
                suggested = beat.get("suggested_speaker")
                if suggested and suggested in available:
                    return suggested
        if available:
            return available[story_state.current_turn % len(available)]
        return "Unknown"

    def _fallback_narration(self, story_state: StoryState) -> str:
        seed = story_state.seed_story or {}
        description = seed.get("description", "The scene unfolds.")
        turn = story_state.current_turn
        total = story_state.total_turns or 25

        arc_plan = getattr(story_state, "story_arc_plan", [])
        for beat in arc_plan:
            if beat.get("turn") == turn:
                bt = beat.get("beat", "")
                if bt:
                    return bt

        phase = _get_phase(turn, total)
        if phase == "setup":
            return description[:200] if turn == 0 else "The characters survey the scene."
        elif phase == "conflict":
            return "Tension thickens as the confrontation deepens."
        else:
            return "The moment of truth — the situation must resolve."

    # ════════════════════════════════════════════════════════════════
    #  CONCLUSION CHECK
    # ════════════════════════════════════════════════════════════════

    async def check_conclusion(
        self, story_state: StoryState
    ) -> Tuple[bool, Optional[str]]:
        prompt = build_director_conclusion_prompt(
            story_state=story_state,
            config=self.config,
        )

        response = await self.generate_response(prompt)

        if not response or not response.strip():
            return False, None

        # Attempt 1: safe parse
        data = self.safe_parse_json(response)
        if data:
            return data.get("should_end", False), data.get("conclusion_narration")

        # Attempt 2: repair
        print("[Director] Conclusion parse failed, attempting repair…")
        schema = (
            '{"should_end": false, "reason": "...", "conclusion_narration": null}'
        )
        data = await self._repair_json(response, schema)
        if data:
            return data.get("should_end", False), data.get("conclusion_narration")

        # Fallback: don't end
        print("[Director] Conclusion repair failed, defaulting to continue")
        return False, None

    # ════════════════════════════════════════════════════════════════
    #  FINAL CONCLUSION NARRATION
    # ════════════════════════════════════════════════════════════════

    async def generate_final_conclusion(
        self, story_state: StoryState
    ) -> str:
        """Generate a cinematic conclusion narration that wraps up the story."""
        prompt = build_final_conclusion_narration_prompt(
            story_state=story_state,
            config=self.config,
        )

        response = await self.generate_response(prompt)

        if not response or not response.strip():
            return self._fallback_conclusion(story_state)

        # Attempt 1: safe parse
        data = self.safe_parse_json(response)
        if data and data.get("conclusion_narration"):
            return data["conclusion_narration"]

        # Attempt 2: repair
        print("[Director] Conclusion narration parse failed, attempting repair…")
        schema = '{"conclusion_narration": "...", "final_outcome": "..."}'
        data = await self._repair_json(response, schema)
        if data and data.get("conclusion_narration"):
            return data["conclusion_narration"]

        # Attempt 3: use raw response if it looks like narration
        stripped = response.strip()
        if len(stripped) > 30 and not stripped.startswith("{"):
            return stripped[:500]

        return self._fallback_conclusion(story_state)

    def _fallback_conclusion(self, story_state: StoryState) -> str:
        """Deterministic fallback conclusion when LLM fails."""
        seed = story_state.seed_story or {}
        title = seed.get("title", "Untitled")
        chars = list((story_state.character_profiles or {}).keys())
        char_text = " and ".join(chars) if chars else "The characters"
        actions = list(set(story_state.actions_taken))

        if actions:
            return (
                f"The scene of \"{title}\" draws to a close. "
                f"After {len(actions)} decisive moments — "
                f"{', '.join(actions[:3]).lower().replace('_', ' ')} — "
                f"{char_text} part ways, each carrying the weight of what transpired. "
                f"The dust settles, and life moves on."
            )
        return (
            f"The scene of \"{title}\" finally comes to an end. "
            f"{char_text} stand in the aftermath, the tension slowly dissolving. "
            f"What happened here will not be easily forgotten."
        )
