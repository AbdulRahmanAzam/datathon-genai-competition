from typing import List, Dict, Tuple, Optional
from datetime import datetime
from .schemas import StoryState, CharacterProfile, DialogueTurn
from .config import StoryConfig

class StoryStateManager:
    def __init__(self, seed_story: Dict, characters: List[Dict], config: StoryConfig):
        self.config = config
        self.state = StoryState(
            seed_story=seed_story,
            character_profiles={
                char["name"]: CharacterProfile(
                    name=char["name"],
                    description=char["description"],
                ) for char in characters
            }
        )
    
    def add_turn(self, speaker: str, dialogue: str, metadata: Dict = None) -> None:
        """Add a dialogue turn and increment turn count."""
        turn = DialogueTurn(
            turn_number=self.state.current_turn + 1,
            speaker=speaker,
            dialogue=dialogue,
            metadata=metadata or {}
        )
        self.state.dialogue_history.append(turn)
        self.state.current_turn += 1
    
    def get_context_for_character(self, character_name: str) -> str:
        """Return relevant context for a character, simulating memory."""
        # Filter history where the character was either the speaker or present (for now assume all present)
        # In a more complex system, we'd check if they were in the scene.
        # For simplicity, we give them the last N turns, but we could filter for relevance.
        
        # Taking last 15 turns to give more context since we removed explicit memory
        recent_turns = self.state.dialogue_history[-15:]
        
        history_text = "\n".join([
            f"{turn.speaker}: {turn.dialogue}"
            for turn in recent_turns
        ])
        
        return f"""
    Initial Event: {self.state.seed_story.get('description', 'Unknown event')}

    Recent Dialogue:
    {history_text}
    """
        
    def get_context_for_director(self) -> str:
        """Return full story context for director decisions."""
        history_text = "\n".join([
            f"[{turn.turn_number}] {turn.speaker}: {turn.dialogue}"
            for turn in self.state.dialogue_history
        ])
        
        return f"""
    Story Title: {self.state.seed_story.get('title', 'Untitled')}
    Description: {self.state.seed_story.get('description', '')}

    Dialogue History:
    {history_text}

    Director Notes:
    {chr(10).join(self.state.director_notes)}
"""

    def should_end_story(self) -> Tuple[bool, str]:
        """Check if story should conclude based on turn limits."""
        if self.state.current_turn >= self.config.max_turns:
            return True, "Max turns reached"
        if self.state.is_concluded:
            return True, self.state.conclusion_reason or "Director concluded story"
        return False, ""

