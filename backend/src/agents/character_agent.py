import json
from typing import List, Dict, Any, Optional
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState, CharacterProfile
from ..prompts.character_prompts import build_character_context_pack


class CharacterAgent(BaseAgent):
    def __init__(self, name: str, config: StoryConfig):
        super().__init__(name, config)

    # ── Reasoning / Decision layer ──────────────────────────────────────

    async def reason_and_decide(
        self,
        story_state: StoryState,
        memories: List[str],
        allowed_actions: List[str],
        force_act: bool = False,
    ) -> Dict[str, Any]:
        """
        Character decides TALK vs ACT and returns strict JSON.
        Includes one retry with full context + safe fallback.
        """
        character_profile = story_state.character_profiles.get(self.name)

        prompt = build_character_context_pack(
            character_name=self.name,
            character_profile=character_profile,
            story_state=story_state,
            memories=memories,
            allowed_actions=allowed_actions,
            force_act=force_act,
            config=self.config,
        )

        try:
            content = await self.generate_response(prompt)

            # If LLM returned empty response, skip straight to contextual retry
            if content and content.strip():
                decision = self._parse_decision(content, allowed_actions)
                if decision is not None:
                    return decision

            # ── retry with context-rich repair prompt ───────────────────
            seed = story_state.seed_story or {}
            scene_desc = seed.get("description", "An unfolding scene")
            profile_desc = character_profile.description if character_profile else "A character"

            recent = story_state.dialogue_history[-3:]
            recent_summary = "; ".join(
                f"{t.speaker}: {t.dialogue[:60]}" for t in recent
            ) if recent else "No dialogue yet — the scene is just starting"

            repair = (
                f"You are {self.name} — {profile_desc}\n"
                f"Scene: {scene_desc[:200]}\n"
                f"Recent: {recent_summary}\n\n"
                "Your previous response was not valid JSON. "
                "Return ONLY valid JSON matching this exact schema:\n"
                '{"observation": "what you notice right now (1 sentence)", '
                '"reasoning": "your internal thought (1 sentence)", '
                '"emotion": "your dominant emotion", '
                '"mode": "TALK", '
                '"speech": "your ACTUAL dialogue — 2-3 sentences, stay in character, respond to the scene", '
                '"action": null}\n'
                "No markdown, no explanation — ONLY the JSON object."
            )
            content = await self.generate_response(repair)
            if content and content.strip():
                decision = self._parse_decision(content, allowed_actions)
                if decision is not None:
                    return decision
        except Exception as e:
            print(f"Error in character reasoning for {self.name}: {e}")

        # ── context-aware fallback ──────────────────────────────────────
        seed = story_state.seed_story or {}
        scene_desc = seed.get("description", "the scene")
        profile_desc = (
            character_profile.description if character_profile else "a person in the scene"
        )

        if force_act and allowed_actions:
            return {
                "observation": f"The situation at {scene_desc[:50]} demands action.",
                "reasoning": f"As {self.name}, I must act now — there is no time to waste.",
                "emotion": "determined",
                "mode": "ACT",
                "speech": None,
                "action": {"type": allowed_actions[0], "target": None, "params": {}},
            }

        # Generate a contextual fallback speech
        recent = story_state.dialogue_history[-1:] if story_state.dialogue_history else []
        if recent:
            last = recent[0]
            fallback_speech = (
                f"*{self.name} turns to {last.speaker}* "
                f"Wait — let me think about this for a moment."
            )
        else:
            fallback_speech = (
                f"*{self.name} surveys the scene* "
                f"What exactly is going on here?"
            )

        return {
            "observation": f"The scene demands attention.",
            "reasoning": f"I need to assess the situation before making my move.",
            "emotion": "alert",
            "mode": "TALK",
            "speech": fallback_speech,
            "action": None,
        }

    # ── JSON parser ─────────────────────────────────────────────────────

    def _parse_decision(
        self, content: str, allowed_actions: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Return parsed decision dict or None on failure."""
        try:
            cleaned = self._clean_json_response(content)
            data = json.loads(cleaned)

            mode = (data.get("mode") or "TALK").upper()
            if mode not in ("TALK", "ACT"):
                mode = "TALK"

            # Extract reasoning trace fields
            observation = data.get("observation", "")
            reasoning = data.get("reasoning", "")
            emotion = data.get("emotion", "neutral")

            base = {
                "observation": str(observation),
                "reasoning": str(reasoning),
                "emotion": str(emotion),
            }

            if mode == "TALK":
                speech = data.get("speech") or data.get("dialogue") or "..."
                return {**base, "mode": "TALK", "speech": str(speech), "action": None}

            # mode == "ACT"
            action = data.get("action")
            if not action or not isinstance(action, dict):
                return None

            action_type = (action.get("type") or "").upper()
            if action_type not in allowed_actions:
                # action not allowed → graceful degrade to TALK
                speech = data.get("speech") or f"*{self.name} considers their options*"
                return {**base, "mode": "TALK", "speech": str(speech), "action": None}

            return {
                **base,
                "mode": "ACT",
                "speech": data.get("speech"),
                "action": {
                    "type": action_type,
                    "target": action.get("target"),
                    "params": action.get("params") or {},
                },
            }
        except (json.JSONDecodeError, Exception) as e:
            print(f"  JSON parse error for {self.name}: {e}")
            return None

    # ── legacy compat ───────────────────────────────────────────────────

    async def respond(self, story_state: StoryState, context: str) -> str:
        """Kept for backward‑compatibility; delegates to reason_and_decide."""
        decision = await self.reason_and_decide(story_state, [], [], False)
        if decision["mode"] == "ACT" and decision.get("action"):
            return f"[ACTION: {decision['action']['type']}]"
        return decision.get("speech", "...")
