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
    goals: List[str] = Field(default_factory=list)
    inventory: List[str] = Field(default_factory=list)
    emotional_state: str = "neutral"
    relationships: Dict[str, str] = Field(default_factory=dict)


class CharacterMemory(BaseModel):
    """Structured memory buffer for a character."""
    knowledge: List[str] = Field(default_factory=list)
    inventory: List[str] = Field(default_factory=list)
    emotional_state: str = "neutral"
    perceptions: Dict[str, str] = Field(default_factory=dict)
    recent_events: List[str] = Field(default_factory=list)


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

    # ── Story arc ───────────────────────────────────────────────────────
    total_turns: int = 25
    current_phase: str = "setup"
    story_arc_plan: List[Dict[str, Any]] = Field(default_factory=list)

    # ── Generic world state (dynamic, story-specific) ───────────────────
    world_state: Dict[str, Any] = Field(default_factory=dict)

    # ── Per‑character structured memory ──────────────────────────────────
    character_memories: Dict[str, Any] = Field(default_factory=dict)

    # ── Action tracking ─────────────────────────────────────────────────
    actions_taken: List[str] = Field(default_factory=list)
    turns_since_state_change: int = 0

    # ── Emotion & relationship tracking ─────────────────────────────────
    emotion_history: List[Dict[str, Any]] = Field(default_factory=list)
    relationship_changes: List[Dict[str, Any]] = Field(default_factory=list)

    # ── Internal flow control (transient per turn) ──────────────────────
    force_act: bool = False
    suggested_action: Optional[str] = None
    pending_decision: Dict[str, Any] = Field(default_factory=dict)