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

    # ── World‑state fields ──────────────────────────────────────────────
    lane_blocked: bool = True
    traffic_level: int = 8          # 1‑10
    tension_level: int = 7          # 1‑10
    crowd_size: int = 5
    police_present: bool = False
    bribe_pressure: int = 3         # 0‑10
    evidence: Dict[str, Any] = Field(default_factory=dict)
    settlement_offer: Optional[int] = None
    resolution_flags: Dict[str, bool] = Field(default_factory=dict)

    # ── Per‑character short‑term memory ─────────────────────────────────
    character_memories: Dict[str, List[str]] = Field(default_factory=dict)

    # ── Action tracking ─────────────────────────────────────────────────
    actions_taken: List[str] = Field(default_factory=list)
    turns_since_state_change: int = 0

    # ── Internal flow control (transient per turn) ──────────────────────
    force_act: bool = False
    suggested_action: Optional[str] = None
    pending_decision: Dict[str, Any] = Field(default_factory=dict)