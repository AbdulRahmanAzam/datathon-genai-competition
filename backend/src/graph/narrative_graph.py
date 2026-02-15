"""
Narrative graph — orchestrates the multi-agent story loop.

Fully generic: works with any seed story and character set.
Plans the story arc upfront and drives toward conclusion within
the turn budget.

Nodes:
  director_select → character_reason → process_action → memory_update
      → check_conclusion → (conclude | director_select)
"""

from typing import Dict, List, Any, Optional
from langgraph.graph import StateGraph, END
from ..config import StoryConfig
from ..schemas import StoryState, CharacterProfile, CharacterMemory, DialogueTurn
from ..agents.character_agent import CharacterAgent
from ..agents.director_agent import DirectorAgent
from ..action_system import ActionSystem, RESOLUTION_SIGNALS


class NarrativeGraph:
    def __init__(
        self,
        config: StoryConfig,
        characters: List[CharacterAgent],
        director: DirectorAgent,
    ):
        self.config = config
        self.characters = {c.name: c for c in characters}
        self.director = director
        self.action_system = ActionSystem()
        self.graph = self._build_graph()

    # ── graph construction ──────────────────────────────────────────────

    def _build_graph(self) -> StateGraph:
        workflow = StateGraph(StoryState)

        workflow.add_node("director_select", self._director_select_node)
        workflow.add_node("character_reason", self._character_reason_node)
        workflow.add_node("process_action", self._process_action_node)
        workflow.add_node("memory_update", self._memory_update_node)
        workflow.add_node("check_conclusion", self._check_conclusion_node)
        workflow.add_node("conclude", self._conclude_node)

        workflow.set_entry_point("director_select")

        workflow.add_conditional_edges(
            "director_select",
            self._route_after_director,
            {"character_reason": "character_reason", "conclude": "conclude"},
        )

        workflow.add_edge("character_reason", "process_action")
        workflow.add_edge("process_action", "memory_update")
        workflow.add_edge("memory_update", "check_conclusion")

        workflow.add_conditional_edges(
            "check_conclusion",
            self._route_conclusion,
            {"conclude": "conclude", "continue": "director_select"},
        )

        workflow.add_edge("conclude", END)

        return workflow.compile()

    # ── routing helpers ─────────────────────────────────────────────────

    @staticmethod
    def _route_after_director(state: StoryState) -> str:
        return "conclude" if state.is_concluded else "character_reason"

    @staticmethod
    def _route_conclusion(state: StoryState) -> str:
        return "conclude" if state.is_concluded else "continue"

    # ── suggested action picker (generic) ─────────────────────────────

    def _pick_suggested_action(
        self, state: StoryState, prefer_resolution: bool = False
    ) -> Optional[str]:
        """Return an unused+allowed action type, or None.

        When *prefer_resolution* is True (endgame), prioritise actions
        that create resolution signals (NEGOTIATE, ACCEPT_TERMS,
        MAKE_PAYMENT, TAKE_DECISIVE_ACTION, SUMMON_HELP).
        """
        used = set(state.actions_taken)
        allowed = set(self.action_system.get_allowed_actions(state))
        candidates = allowed - used
        if not candidates:
            return None

        if prefer_resolution:
            resolution_actions = [
                "NEGOTIATE", "ACCEPT_TERMS", "MAKE_PAYMENT",
                "TAKE_DECISIVE_ACTION", "SUMMON_HELP",
            ]
            for ra in resolution_actions:
                if ra in candidates:
                    return ra

        return sorted(candidates)[0]

    # ════════════════════════════════════════════════════════════════════
    #  NODE IMPLEMENTATIONS
    # ════════════════════════════════════════════════════════════════════

    async def _director_select_node(self, state: StoryState) -> Dict:
        """Director selects the next speaker + enforces deterministic rules."""

        total = state.total_turns or self.config.max_turns

        # ── Hard stop — generate proper LLM conclusion ──────────────────
        if state.current_turn >= total:
            try:
                conclusion_narration = await self.director.generate_final_conclusion(state)
            except Exception:
                conclusion_narration = "The scene finally draws to a close as the moment passes."

            return {
                "is_concluded": True,
                "conclusion_reason": conclusion_narration,
                "events": state.events
                + [
                    {
                        "type": "narration",
                        "content": conclusion_narration,
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    }
                ],
            }

        # ── Deterministic pacing rules ──────────────────────────────────
        distinct_actions = len(set(state.actions_taken))
        remaining = total - state.current_turn
        min_actions = max(5, total // 5)
        force_act = False
        suggested_action = None

        actions_needed = min_actions - distinct_actions
        if actions_needed > 0 and remaining <= actions_needed + 1:
            force_act = True

        if state.turns_since_state_change >= 2:
            force_act = True

        # ── Dialogue streak breaker: force action after 2+ talk-only turns
        dialogue_streak = 0
        for t in reversed(state.dialogue_history):
            if "[ACTION:" not in t.dialogue:
                dialogue_streak += 1
            else:
                break
        if dialogue_streak >= 2 and distinct_actions < min_actions:
            force_act = True

        # Mid-story action pressure
        mid_point = max(3, total // 2)
        if state.current_turn >= mid_point and distinct_actions < max(2, min_actions // 2):
            force_act = True

        # Late-game action pressure
        late_point = max(4, int(total * 0.7))
        if state.current_turn >= late_point and distinct_actions < min_actions:
            force_act = True

        endgame = remaining <= max(2, int(total * 0.2))

        # ── Endgame resolution push ────────────────────────────────
        # In the last ~20% of turns, if no resolution signal yet,
        # force resolution-oriented actions even if min_actions are met.
        if endgame:
            world = state.world_state or {}
            has_resolution = any(world.get(k) for k in RESOLUTION_SIGNALS)
            if not has_resolution:
                force_act = True
                suggested_action = self._pick_suggested_action(
                    state, prefer_resolution=True
                )

        if force_act and distinct_actions < min_actions:
            suggested_action = self._pick_suggested_action(
                state, prefer_resolution=endgame
            )

        # ── LLM-assisted speaker selection ──────────────────────────────
        available = list(self.characters.keys())
        next_speaker, narration = await self.director.select_next_speaker(
            state, available, force_act=force_act, endgame=endgame
        )

        print("=" * 60)
        print(
            f"Director | Turn {state.current_turn + 1}/{total} "
            f"| Force ACT: {force_act} | Endgame: {endgame}"
        )
        print(f"  Narration : {narration}")
        print(f"  Speaker   : {next_speaker}")
        print(
            f"  Actions   : {distinct_actions} distinct "
            f"({state.actions_taken})"
        )
        if suggested_action:
            print(f"  Suggested : {suggested_action}")
        print("=" * 60, "\n")

        events_update: list = []
        if narration:
            events_update.append(
                {"type": "narration", "content": narration, "turn": state.current_turn}
            )

        return {
            "next_speaker": next_speaker,
            "force_act": force_act,
            "suggested_action": suggested_action,
            "director_notes": state.director_notes
            + [
                f"Turn {state.current_turn + 1}: {next_speaker}"
                + (" [FORCE ACT]" if force_act else "")
            ],
            "story_narration": (
                state.story_narration + [narration] if narration else state.story_narration
            ),
            "events": state.events + events_update,
        }

    # ────────────────────────────────────────────────────────────────────

    async def _character_reason_node(self, state: StoryState) -> Dict:
        """Character uses reasoning layer to decide TALK vs ACT."""

        next_speaker = state.next_speaker
        if not next_speaker or next_speaker not in self.characters:
            next_speaker = list(self.characters.keys())[0]

        character = self.characters[next_speaker]
        allowed_actions = self.action_system.get_allowed_actions(state)

        if state.suggested_action and state.suggested_action in allowed_actions:
            # Put suggested action first but keep others as fallback
            allowed_actions = [state.suggested_action] + [
                a for a in allowed_actions if a != state.suggested_action
            ]

        memories = state.character_memories.get(next_speaker, CharacterMemory())

        decision = await character.reason_and_decide(
            story_state=state,
            memories=memories,
            allowed_actions=allowed_actions,
            force_act=state.force_act,
        )

        mode = decision.get("mode", "TALK")
        print(f"  {next_speaker} decides: {mode}")
        if mode == "ACT":
            print(f"    Action: {decision.get('action', {}).get('type', '?')}")
        else:
            print(f"    Speech: {(decision.get('speech') or '')[:80]}…")
        print()

        return {"pending_decision": decision}

    # ────────────────────────────────────────────────────────────────────

    async def _process_action_node(self, state: StoryState) -> Dict:
        """Execute the character's decision (TALK or ACT)."""

        decision = state.pending_decision
        speaker = state.next_speaker or list(self.characters.keys())[0]
        mode = (decision.get("mode") or "TALK").upper()

        # ── ACT path ───────────────────────────────────────────────────
        if mode == "ACT" and decision.get("action"):
            action = decision["action"]
            success, effects, narration = self.action_system.execute(
                action, state, speaker
            )

            if success:
                updates: Dict[str, Any] = {
                    "current_turn": state.current_turn + 1,
                    "actions_taken": state.actions_taken + [action["type"]],
                    "turns_since_state_change": 0,
                    "force_act": False,
                    "suggested_action": None,
                    "pending_decision": {},
                }
                updates.update(effects)

                new_event = {
                    "type": "action",
                    "content": narration,
                    "speaker": speaker,
                    "turn": state.current_turn + 1,
                    "metadata": {
                        "action": {"type": action["type"], "actor": speaker}
                    },
                }
                updates["events"] = state.events + [new_event]

                new_turn = DialogueTurn(
                    turn_number=state.current_turn + 1,
                    speaker=speaker,
                    dialogue=f"[ACTION: {action['type']}] {narration}",
                    metadata={"action_type": action["type"]},
                )
                updates["dialogue_history"] = state.dialogue_history + [new_turn]

                return updates

            # action failed → fall through to TALK
            print(f"  Action failed: {narration}. Falling back to TALK.")
            decision = {
                "mode": "TALK",
                "speech": decision.get("speech")
                or f"*{speaker} hesitates, unsure what to do*",
            }

        # ── TALK path (default) ─────────────────────────────────────────
        speech = decision.get("speech") or "…"

        new_turn = DialogueTurn(
            turn_number=state.current_turn + 1,
            speaker=speaker,
            dialogue=speech,
        )
        new_event = {
            "type": "dialogue",
            "speaker": speaker,
            "content": speech,
            "turn": state.current_turn + 1,
        }

        return {
            "dialogue_history": state.dialogue_history + [new_turn],
            "current_turn": state.current_turn + 1,
            "events": state.events + [new_event],
            "turns_since_state_change": state.turns_since_state_change + 1,
            "force_act": False,
            "suggested_action": None,
            "pending_decision": {},
        }

    # ────────────────────────────────────────────────────────────────────

    async def _memory_update_node(self, state: StoryState) -> Dict:
        """Update per-character structured memory with information asymmetry."""

        # Deep copy existing memories
        memories: Dict[str, CharacterMemory] = {}
        for name in self.characters:
            existing = state.character_memories.get(name)
            if existing and isinstance(existing, CharacterMemory):
                memories[name] = existing.model_copy(deep=True)
            elif existing and isinstance(existing, dict):
                memories[name] = CharacterMemory(**existing)
            else:
                memories[name] = CharacterMemory()

        last_event = state.events[-1] if state.events else None
        if not last_event:
            return {"character_memories": memories}

        speaker = state.next_speaker or "Unknown"
        max_mem = self.config.memory_buffer_size

        # ── Determine present characters (information asymmetry) ────────
        present_characters = set()
        world = state.world_state or {}
        for name in self.characters:
            departed_key = f"{name}_departed"
            if not world.get(departed_key, False):
                present_characters.add(name)
        # The active speaker always witnesses their own event
        present_characters.add(speaker)

        # ── Create memory line ──────────────────────────────────────────
        action_meta = (last_event.get("metadata") or {}).get("action")
        if last_event["type"] == "dialogue":
            preview = (last_event.get("content") or "")[:80]
            memory_line = f'T{last_event["turn"]}: {speaker} said: "{preview}"'
        elif action_meta:
            memory_line = (
                f"T{last_event['turn']}: {action_meta['actor']} "
                f"performed {action_meta['type']}"
            )
        else:
            preview = (last_event.get("content") or "")[:80]
            memory_line = f"T{last_event['turn']}: {preview}"

        # ── Update only PRESENT characters (information asymmetry) ──────
        for name in present_characters:
            if name in memories:
                mem = memories[name]
                mem.recent_events.append(memory_line)
                mem.recent_events = mem.recent_events[-max_mem:]

        # ── Update knowledge and facts for state-changing actions ───────
        if action_meta:
            actor = action_meta.get("actor", speaker)
            action_type = action_meta.get("type", "UNKNOWN")

            # Actor gains specific knowledge about their action
            if actor in memories:
                memories[actor].knowledge.append(
                    f"I performed {action_type} at turn {last_event['turn']}"
                )

            # All present characters learn the observable fact
            fact_parts = [f"{action_type} by {actor}"]
            for k, v in world.items():
                if isinstance(v, bool) and v:
                    fact_parts.append(k.replace("_", " "))
            global_fact = "[FACT] " + " | ".join(fact_parts)

            for name in present_characters:
                if name in memories:
                    mem = memories[name]
                    mem.knowledge.append(global_fact)
                    mem.recent_events.append(global_fact)
                    mem.recent_events = mem.recent_events[-max_mem:]

        # ── Update speaker's emotional state from their decision ────────
        decision = state.pending_decision or {}
        emotion = decision.get("emotion")
        if emotion and speaker in memories:
            memories[speaker].emotional_state = emotion

        # ── Track emotion history ───────────────────────────────────────
        emotion_entry = None
        if emotion and speaker:
            emotion_entry = {
                "turn": last_event.get("turn", state.current_turn),
                "character": speaker,
                "emotion": emotion,
            }

        updates = {"character_memories": memories}
        if emotion_entry:
            updates["emotion_history"] = state.emotion_history + [emotion_entry]

        return updates

    # ────────────────────────────────────────────────────────────────────

    async def _check_conclusion_node(self, state: StoryState) -> Dict:
        """Decide whether the story should end.
        
        Uses deterministic checks first to avoid unnecessary LLM calls.
        Only calls LLM in the final 30% of turns when action requirements are met.
        """

        total = state.total_turns or self.config.max_turns
        min_actions = max(5, total // 5)
        min_turns = max(3, int(total * 0.6))
        distinct_actions = len(set(state.actions_taken))

        # hard stop — generate proper LLM conclusion
        if state.current_turn >= total:
            try:
                conclusion_narration = await self.director.generate_final_conclusion(state)
            except Exception:
                conclusion_narration = "The scene draws to its inevitable close."

            return {
                "is_concluded": True,
                "conclusion_reason": conclusion_narration,
                "events": state.events
                + [
                    {
                        "type": "narration",
                        "content": conclusion_narration,
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    }
                ],
            }

        # don't conclude too early
        if state.current_turn < min_turns:
            return {"is_concluded": False}

        # STRICT: do not end unless distinct_actions >= min_actions
        if distinct_actions < min_actions and state.current_turn < total:
            return {"is_concluded": False}

        # STRICT: do not end unless a resolution signal exists in world_state
        world = state.world_state or {}
        has_resolution = any(world.get(k) for k in RESOLUTION_SIGNALS)
        if not has_resolution and state.current_turn < total:
            return {"is_concluded": False}

        # LLM-assisted check (only reached with enough actions + resolution)
        should_end, reason = await self.director.check_conclusion(state)

        if should_end:
            events_update = []
            if reason:
                events_update.append(
                    {
                        "type": "narration",
                        "content": reason,
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    }
                )
            return {
                "is_concluded": True,
                "conclusion_reason": str(reason),
                "events": state.events + events_update,
            }

        return {"is_concluded": False}

    # ────────────────────────────────────────────────────────────────────

    async def _conclude_node(self, state: StoryState) -> Dict:
        """Final node — ensures a proper conclusion narration exists."""
        updates = {"is_concluded": True}

        # If no proper conclusion narration was generated yet, generate one now
        has_conclusion_event = any(
            isinstance(e, dict) and (e.get("metadata") or {}).get("conclusion")
            for e in state.events
        )
        if not has_conclusion_event:
            try:
                conclusion_narration = await self.director.generate_final_conclusion(state)
            except Exception:
                conclusion_narration = "The story reaches its end."

            updates["conclusion_reason"] = conclusion_narration
            updates["events"] = state.events + [
                {
                    "type": "narration",
                    "content": conclusion_narration,
                    "turn": state.current_turn,
                    "metadata": {"conclusion": True},
                }
            ]

        return updates

    # ════════════════════════════════════════════════════════════════════
    #  RUN
    # ════════════════════════════════════════════════════════════════════

    async def run(
        self,
        seed_story: Dict,
        character_profiles: Optional[Dict[str, Any]] = None,
        total_turns: Optional[int] = None,
    ) -> StoryState:
        """Execute the narrative game loop and return final state."""

        turns = total_turns or self.config.max_turns

        # Initialize structured per-character memory
        memories: Dict[str, CharacterMemory] = {}
        for name, profile in (character_profiles or {}).items():
            memories[name] = CharacterMemory(
                inventory=list(getattr(profile, 'inventory', []) or []),
                emotional_state=getattr(profile, 'emotional_state', 'neutral') or 'neutral',
                perceptions=dict(getattr(profile, 'relationships', {}) or {}),
            )

        # ── Plan the story arc ─────────────────────────────────────────
        char_list = []
        for name, profile in (character_profiles or {}).items():
            char_list.append({"name": name, "description": profile.description
                              if hasattr(profile, "description") else str(profile)})

        arc_plan = await self.director.plan_story_arc(
            seed_story=seed_story,
            characters=char_list,
            total_turns=turns,
        )

        initial_state = StoryState(
            seed_story=seed_story,
            total_turns=turns,
            character_profiles=character_profiles or {},
            dialogue_history=[],
            director_notes=[],
            character_memories=memories,
            story_arc_plan=arc_plan,
        )

        final_state = await self.graph.ainvoke(
            initial_state, config={"recursion_limit": 200}
        )
        return final_state
