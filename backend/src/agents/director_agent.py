import json
from typing import List, Tuple, Optional, Dict, Any
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState
from ..prompts.director_prompts import (
    build_arc_planning_prompt,
    build_director_select_prompt,
    build_director_conclusion_prompt,
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

    # ── Story Arc Planning (called once before the loop) ────────────────

    async def plan_story_arc(
        self,
        seed_story: dict,
        characters: list,
        total_turns: int,
    ) -> List[Dict[str, Any]]:
        """Plan the complete story arc before the narrative begins."""
        min_actions = max(2, total_turns // 5)

        prompt = build_arc_planning_prompt(
            seed_story=seed_story,
            characters=characters,
            total_turns=total_turns,
            min_actions=min_actions,
        )

        response = await self.generate_response(prompt)

        try:
            cleaned = self._clean_json_response(response)
            data = json.loads(cleaned)
            arc_plan = data.get("arc_plan", [])
            if arc_plan:
                print(f"[Director] Arc planned: {len(arc_plan)} beats, "
                      f"conclusion: {data.get('conclusion_type', 'unspecified')}")
            return arc_plan
        except Exception as e:
            print(f"[Director] Arc planning parse error: {e}")
            # Return a minimal default arc
            return self._default_arc(characters, total_turns)

    @staticmethod
    def _default_arc(characters: list, total_turns: int) -> List[Dict[str, Any]]:
        """Generate a minimal default arc if LLM planning fails."""
        arc = [{"turn": 0, "phase": "setup", "type": "narration",
                "beat": "Opening scene", "suggested_speaker": None}]
        char_names = []
        for c in characters:
            if isinstance(c, dict):
                char_names.append(c["name"])
            elif hasattr(c, "name"):
                char_names.append(c.name)
        for i in range(1, total_turns):
            speaker = char_names[i % len(char_names)] if char_names else None
            phase = "setup" if i < total_turns * 0.2 else (
                "conflict" if i < total_turns * 0.7 else "resolution")
            arc.append({"turn": i, "phase": phase, "type": "dialogue",
                        "beat": "Story continues", "suggested_speaker": speaker})
        return arc

    # ── Speaker selection (hybrid: rules + LLM) ────────────────────────

    async def select_next_speaker(
        self,
        story_state: StoryState,
        available_characters: List[str],
        force_act: bool = False,
        endgame: bool = False,
    ) -> Tuple[str, str]:
        """Select next speaker with deterministic rules + LLM assist."""

        # ── deterministic guard: cap consecutive same speaker ───────────
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
                filtered = [c for c in available_characters if c != last_speaker]
                if not filtered:
                    filtered = available_characters

        # ── LLM assist for speaker pick ─────────────────────────────────
        prompt = build_director_select_prompt(
            story_state=story_state,
            available_characters=filtered,
            force_act=force_act,
            endgame=endgame,
            config=self.config,
        )

        response = await self.generate_response(prompt)

        # If LLM returned empty response, use fallback immediately
        if not response or not response.strip():
            print("[Director] LLM returned empty response for speaker selection, using fallback")
            speaker = self._fallback_speaker(story_state, filtered)
            narration = self._fallback_narration(story_state)
            return speaker, narration

        try:
            cleaned = self._clean_json_response(response)
            data = json.loads(cleaned)
            next_speaker = data.get("next_speaker", "")
            narration = data.get("narration", "")

            if next_speaker in filtered:
                return next_speaker, narration
            return filtered[0], narration
        except Exception as e:
            print(f"[Director] Error parsing selection: {e}")
            speaker = self._fallback_speaker(story_state, filtered)
            narration = self._fallback_narration(story_state)
            return speaker, narration

    # ── Context-aware fallbacks ─────────────────────────────────────────

    def _fallback_speaker(self, story_state: StoryState, available: List[str]) -> str:
        """Pick a speaker from the arc plan or cycle through available characters."""
        arc_plan = getattr(story_state, "story_arc_plan", [])
        for beat in arc_plan:
            if beat.get("turn") == story_state.current_turn:
                suggested = beat.get("suggested_speaker")
                if suggested and suggested in available:
                    return suggested

        # Cycle through available characters based on turn
        if available:
            return available[story_state.current_turn % len(available)]
        return "Unknown"

    def _fallback_narration(self, story_state: StoryState) -> str:
        """Generate context-aware narration from the arc plan and state."""
        seed = story_state.seed_story or {}
        description = seed.get("description", "The scene unfolds.")
        turn = story_state.current_turn
        total = story_state.total_turns or 25

        # Check arc plan for this turn's beat
        arc_plan = getattr(story_state, "story_arc_plan", [])
        for beat in arc_plan:
            if beat.get("turn") == turn:
                beat_text = beat.get("beat", "")
                if beat_text:
                    return beat_text

        # Phase-based generic narration
        phase = _get_phase(turn, total)
        if phase == "setup":
            if turn == 0:
                return description[:200]
            return "The characters take in the scene, sizing up the situation."
        elif phase == "conflict":
            return "The tension in the air thickens as the confrontation deepens."
        else:
            return "The moment of truth arrives — the situation must be resolved."

    # ── Conclusion check ────────────────────────────────────────────────

    async def check_conclusion(
        self, story_state: StoryState
    ) -> Tuple[bool, Optional[str]]:
        """Check if the story should end."""
        prompt = build_director_conclusion_prompt(
            story_state=story_state,
            config=self.config,
        )

        response = await self.generate_response(prompt)

        if not response or not response.strip():
            print("[Director] LLM returned empty response for conclusion check")
            return False, None

        try:
            cleaned = self._clean_json_response(response)
            data = json.loads(cleaned)
            return data.get("should_end", False), data.get("conclusion_narration")
        except Exception as e:
            print(f"[Director] Error parsing conclusion: {e}")
            return False, None
