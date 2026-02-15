"""
Generic Deterministic Action System.

Story-agnostic action categories that work across ANY narrative scenario.
The LLM generates contextual narration; this module validates preconditions,
enforces max-use limits, and applies world-state updates deterministically.
"""

from typing import Dict, Any, Tuple, List


# ── Generic action catalogue ───────────────────────────────────────────────
# These actions are universal narrative beats, not tied to any specific story.

# World-state keys that indicate a resolution has been reached.
# Used by the Director and graph to decide when to conclude the story.
RESOLUTION_SIGNALS = {
    "terms_accepted",
    "payment_made",
    "decisive_action_taken",
    "help_summoned",
}

ACTION_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "INVESTIGATE": {
        "description": "Examine, inspect, or carefully assess something in the scene",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "carefully examines the scene, inspecting every detail",
        "world_state_key": "investigation_done",
    },
    "SUMMON_HELP": {
        "description": "Call for help — summon an authority, aide, or reinforcement",
        "max_uses": 1,
        "preconditions": {},
        "narration_hint": "calls for help, reaching out to bring someone to the scene",
        "world_state_key": "help_summoned",
    },
    "NEGOTIATE": {
        "description": "Propose terms, offer a deal, or suggest a compromise",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "proposes terms to resolve the situation",
        "world_state_key": "negotiation_proposed",
    },
    "ACCEPT_TERMS": {
        "description": "Accept a proposed deal, agreement, or resolution",
        "max_uses": 1,
        "preconditions": {"negotiation_proposed": True},
        "narration_hint": "agrees to the proposed terms",
        "world_state_key": "terms_accepted",
    },
    "CONFRONT": {
        "description": "Directly challenge, approach, or physically confront someone",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "steps forward to confront the other party directly",
        "world_state_key": "confrontation_occurred",
    },
    "PRESENT_EVIDENCE": {
        "description": "Show proof, reveal key information, or present evidence",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "presents crucial evidence for everyone to see",
        "world_state_key": "evidence_presented",
    },
    "INTERVENE": {
        "description": "Step in to mediate, de-escalate, or break up a conflict",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "steps between the parties to intervene",
        "world_state_key": "intervention_made",
    },
    "TAKE_DECISIVE_ACTION": {
        "description": "Perform a bold, story-changing physical action",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "takes a decisive, bold action that changes the situation",
        "world_state_key": "decisive_action_taken",
    },
    "EXIT_SCENE": {
        "description": "Leave or depart from the current scene",
        "max_uses": 1,
        "preconditions": {},
        "narration_hint": "turns and leaves the scene",
        "world_state_key": None,  # handled specially per-actor
    },
    "MAKE_PAYMENT": {
        "description": "Exchange money, pay a fee, or offer financial compensation",
        "max_uses": 2,
        "preconditions": {},
        "narration_hint": "hands over money to settle the matter",
        "world_state_key": "payment_made",
    },
}


# ── ActionSystem class ──────────────────────────────────────────────────────

class ActionSystem:
    """Validates and deterministically executes character actions."""

    @staticmethod
    def _action_use_count(state, action_type: str) -> int:
        """Count how many times *action_type* appears in actions_taken."""
        taken = getattr(state, "actions_taken", None) or []
        return taken.count(action_type)

    @classmethod
    def get_allowed_actions(cls, state) -> List[str]:
        """Return action types whose preconditions are met and max-use not exceeded."""
        allowed: List[str] = []
        world = getattr(state, "world_state", {}) or {}

        for action_type, defn in ACTION_DEFINITIONS.items():
            max_uses = defn.get("max_uses", 0)
            if max_uses > 0 and cls._action_use_count(state, action_type) >= max_uses:
                continue

            preconds = defn.get("preconditions", {})
            ok = True
            for field, required in preconds.items():
                if world.get(field) != required:
                    ok = False
                    break
            if ok:
                allowed.append(action_type)
        return allowed

    @staticmethod
    def get_action_descriptions() -> Dict[str, str]:
        """Return {ACTION_TYPE: description} for prompt building."""
        return {k: v["description"] for k, v in ACTION_DEFINITIONS.items()}

    def execute(
        self, action: Dict[str, Any], state, actor: str
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Validate and execute *action* proposed by *actor*.

        The LLM provides narration via action.params.narration.
        This method only validates preconditions and updates world_state.

        Returns (success, state_updates_dict, narration_text)
        """
        action_type = (action.get("type") or "").upper()
        params = action.get("params") or {}

        if action_type not in ACTION_DEFINITIONS:
            return (
                False,
                {},
                f"{actor} attempted an unknown action '{action_type}'.",
            )

        defn = ACTION_DEFINITIONS[action_type]

        # ── max-use cap ─────────────────────────────────────────────────
        max_uses = defn.get("max_uses", 0)
        if max_uses > 0 and self._action_use_count(state, action_type) >= max_uses:
            return (
                False,
                {},
                f"{actor} tried to {defn['description'].lower()} but "
                f"it has already been done the maximum number of times.",
            )

        # ── check preconditions against world_state ─────────────────────
        world = getattr(state, "world_state", {}) or {}
        for field, required in defn.get("preconditions", {}).items():
            if world.get(field) != required:
                return (
                    False,
                    {},
                    f"{actor} tried to {defn['description'].lower()} but "
                    f"conditions were not met.",
                )

        # ── narration (LLM-provided or generic fallback) ───────────────
        narration = params.get("narration") or (
            f"{actor} {defn.get('narration_hint', 'takes action')}."
        )

        # ── update world_state deterministically ────────────────────────
        world_updates = dict(world)
        ws_key = defn.get("world_state_key")
        if ws_key:
            world_updates[ws_key] = True
        if action_type == "EXIT_SCENE":
            world_updates[f"{actor}_departed"] = True

        return True, {"world_state": world_updates}, narration
