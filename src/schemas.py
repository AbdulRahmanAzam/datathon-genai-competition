from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class DialogueTurn(BaseModel):
    turn_number: int
    speaker: str
    dialogue: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CharacterProfile(BaseModel):
    name: str
    description: str

class StoryState(BaseModel):
    seed_story: Dict[str, Any]
    current_turn: int = 0
    story_narration: List[str] = []
    dialogue_history: List[DialogueTurn] = Field(default_factory=list)
    events: List[Dict[str, Any]] = Field(default_factory=list)
    character_profiles: Dict[str, CharacterProfile] = Field(default_factory=dict)
    director_notes: List[str] = Field(default_factory=list)
    next_speaker: Optional[str] = None
    is_concluded: bool = False
    conclusion_reason: Optional[str] = None