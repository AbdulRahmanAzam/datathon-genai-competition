import json
from typing import List, Tuple, Optional
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState
from ..prompts.director_prompts import (
    build_director_select_prompt,
    build_director_conclusion_prompt,
)


class DirectorAgent(BaseAgent):
    def __init__(self, config: StoryConfig):
        super().__init__("Director", config)

    # ── Speaker selection (hybrid: rules + LLM) ────────────────────────

    async def select_next_speaker(
        self,
        story_state: StoryState,
        available_characters: List[str],
        force_act: bool = False,
        endgame: bool = False,
    ) -> Tuple[str, str]:
        """Select next speaker with deterministic rules + optional LLM."""

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

        try:
            cleaned = self._clean_json_response(response)
            data = json.loads(cleaned)
            next_speaker = data.get("next_speaker", "")
            narration = data.get("narration", "")

            if next_speaker in filtered:
                return next_speaker, narration
            return filtered[0], narration
        except Exception as e:
            print(f"Error parsing director selection: {e}")
            return filtered[0], ""

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

        try:
            cleaned = self._clean_json_response(response)
            data = json.loads(cleaned)
            return data.get("should_end", False), data.get("conclusion_narration")
        except Exception as e:
            print(f"Error parsing director conclusion: {e}")
            return False, None
