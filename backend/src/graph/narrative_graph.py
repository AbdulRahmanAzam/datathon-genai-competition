"""
Narrative graph – orchestrates the multi‑agent story loop.

Nodes (matching the website's graphNodes):
  director_select → character_reason → process_action → memory_update
      → check_conclusion → (conclude | director_select)
"""

from typing import Dict, List, Any, Optional
from langgraph.graph import StateGraph, END
from ..config import StoryConfig
from ..schemas import StoryState, DialogueTurn
from ..agents.character_agent import CharacterAgent
from ..agents.director_agent import DirectorAgent
from ..action_system import ActionSystem


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

        # director can short‑circuit to conclude when hard‑stop fires
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

    # ── suggested action picker ───────────────────────────────────────────

    _CORE_ACTIONS = {
        "CALL_POLICE", "RECORD_VIDEO", "MOVE_VEHICLE_ASIDE",
        "REQUEST_DOCUMENTS", "CHECK_DAMAGE", "PROPOSE_SETTLEMENT",
        "PAY_FACILITATION_FEE", "ISSUE_CHALLAN", "EXCHANGE_CONTACTS",
    }

    def _pick_suggested_action(self, state: StoryState):
        """Return the best unused+allowed action type, or None."""
        used = set(state.actions_taken)
        missing = self._CORE_ACTIONS - used
        allowed = set(self.action_system.get_allowed_actions(state))
        candidates = missing & allowed
        if not candidates:
            return None
        # preference order
        preferred = []
        if not state.police_present:
            preferred.append("CALL_POLICE")
        preferred.append("EXCHANGE_CONTACTS")
        if state.police_present:
            preferred.extend(["ISSUE_CHALLAN", "PAY_FACILITATION_FEE"])
        preferred.extend(["RECORD_VIDEO", "MOVE_VEHICLE_ASIDE",
                          "PROPOSE_SETTLEMENT", "REQUEST_DOCUMENTS",
                          "CHECK_DAMAGE"])
        for p in preferred:
            if p in candidates:
                return p
        return sorted(candidates)[0]

    # ════════════════════════════════════════════════════════════════════
    #  NODE IMPLEMENTATIONS
    # ════════════════════════════════════════════════════════════════════

    async def _director_select_node(self, state: StoryState) -> Dict:
        """Director selects the next speaker + enforces deterministic rules."""

        # ── Hard stop ───────────────────────────────────────────────────
        if state.current_turn >= self.config.max_turns:
            return {
                "is_concluded": True,
                "conclusion_reason": "Maximum turns reached",
                "events": state.events
                + [
                    {
                        "type": "narration",
                        "content": (
                            "The commotion on Shahrah‑e‑Faisal finally winds down "
                            "as the parties reach an uneasy resolution."
                        ),
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    }
                ],
            }

        # ── Deterministic pacing rules ──────────────────────────────────
        distinct_actions = len(set(state.actions_taken))
        remaining = self.config.max_turns - state.current_turn
        force_act = False
        suggested_action = None

        # quota pacing: ensure enough room for required actions
        actions_needed = self.config.min_actions - distinct_actions
        if actions_needed > 0 and remaining <= actions_needed + 1:
            force_act = True

        # loop‑breaking: 2 turns without any state change → force ACT
        if state.turns_since_state_change >= 2:
            force_act = True

        # Rule: turn >= 12 and distinct < 3 → force ACT + nudge unused
        if state.current_turn >= 12 and distinct_actions < 3:
            force_act = True

        # Rule: turn >= 18 and distinct < min_actions → MUST use missing type
        if state.current_turn >= 18 and distinct_actions < self.config.min_actions:
            force_act = True

        # Compute suggested_action when force_act and need more distinct actions
        if force_act and distinct_actions < self.config.min_actions:
            suggested_action = self._pick_suggested_action(state)

        endgame = state.current_turn >= (self.config.max_turns - 3)  # turns 23‑25

        # ── LLM‑assisted speaker selection ──────────────────────────────
        available = list(self.characters.keys())
        next_speaker, narration = await self.director.select_next_speaker(
            state, available, force_act=force_act, endgame=endgame
        )

        print("=" * 60)
        print(
            f"Director | Turn {state.current_turn + 1}/{self.config.max_turns} "
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

        # If suggested_action is set, restrict allowed to just that action
        if state.suggested_action and state.suggested_action in allowed_actions:
            allowed_actions = [state.suggested_action]

        memories = state.character_memories.get(next_speaker, [])

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
                    "type": "narration",
                    "content": narration,
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
        """Update per‑character short‑term memory buffers."""

        memories = {k: list(v) for k, v in state.character_memories.items()}
        for name in self.characters:
            memories.setdefault(name, [])

        last_event = state.events[-1] if state.events else None
        if not last_event:
            return {"character_memories": memories}

        speaker = state.next_speaker or "Unknown"
        max_mem = self.config.memory_buffer_size

        # ── create memory line ──────────────────────────────────────────
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

        # add to every character (all present at the scene)
        for name in self.characters:
            mem = memories[name]
            mem.append(memory_line)
            memories[name] = mem[-max_mem:]

        # ── global fact for state‑changing actions ──────────────────────
        if action_meta:
            fact_parts = [f"[FACT] {action_meta['type']} executed"]
            if state.police_present:
                fact_parts.append("police are present")
            if not state.lane_blocked:
                fact_parts.append("lane is clear")
            if state.evidence:
                fact_parts.append(f"evidence: {list(state.evidence.keys())}")
            if state.settlement_offer:
                fact_parts.append(f"settlement offered: {state.settlement_offer}")

            global_fact = " | ".join(fact_parts)
            for name in self.characters:
                mem = memories[name]
                mem.append(global_fact)
                memories[name] = mem[-max_mem:]

        return {"character_memories": memories}

    # ────────────────────────────────────────────────────────────────────

    async def _check_conclusion_node(self, state: StoryState) -> Dict:
        """Decide whether the story should end."""

        # hard stop
        if state.current_turn >= self.config.max_turns:
            wrap = (
                "The Shahrah‑e‑Faisal scene finally wraps up as the parties "
                "reach an uneasy resolution under the fading Karachi sun."
            )
            return {
                "is_concluded": True,
                "conclusion_reason": "Maximum turns reached",
                "events": state.events
                + [
                    {
                        "type": "narration",
                        "content": wrap,
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    }
                ],
            }

        # don't conclude too early
        if state.current_turn < self.config.min_turns:
            return {"is_concluded": False}

        # STRICT: do not end unless distinct_actions >= min_actions
        distinct_actions = len(set(state.actions_taken))
        if distinct_actions < self.config.min_actions and state.current_turn < self.config.max_turns:
            return {"is_concluded": False}

        # LLM‑assisted check
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
        """Final node – marks story concluded."""
        return {"is_concluded": True}

    # ════════════════════════════════════════════════════════════════════
    #  RUN
    # ════════════════════════════════════════════════════════════════════

    async def run(
        self,
        seed_story: Dict,
        character_profiles: Optional[Dict[str, Any]] = None,
    ) -> StoryState:
        """Execute the narrative game loop and return final state."""

        memories = {name: [] for name in (character_profiles or {})}

        initial_state = StoryState(
            seed_story=seed_story,
            character_profiles=character_profiles or {},
            dialogue_history=[],
            director_notes=[],
            character_memories=memories,
        )

        final_state = await self.graph.ainvoke(
            initial_state, config={"recursion_limit": 200}
        )
        return final_state
