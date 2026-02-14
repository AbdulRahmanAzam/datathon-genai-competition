from typing import List, Dict, Tuple, Optional
from datetime import datetime
from .schemas import StoryState, CharacterProfile, DialogueTurn
from .config import StoryConfig


class StoryStateManager:
    """Helper used only for initial state construction."""

    def __init__(self, seed_story: Dict, characters: List[Dict], config: StoryConfig):
        self.config = config
        self.state = StoryState(
            seed_story=seed_story,
            total_turns=config.max_turns,
            character_profiles={
                char["name"]: CharacterProfile(
                    name=char["name"],
                    description=char["description"],
                )
                for char in characters
            },
            character_memories={char["name"]: [] for char in characters},
        )

    def should_end_story(self) -> Tuple[bool, str]:
        """Check if story should conclude based on turn limits."""
        if self.state.current_turn >= self.config.max_turns:
            return True, "Max turns reached"
        if self.state.is_concluded:
            return True, self.state.conclusion_reason or "Director concluded story"
        return False, ""

