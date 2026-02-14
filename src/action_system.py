"""
Deterministic Action System.
LLM proposes an action; this module validates preconditions and applies
effects to StoryState.  The LLM never directly mutates state.
"""

from typing import Dict, Any, Tuple, List

# ── Per‑action max‑use limits (0 = unlimited) ──────────────────────────────
ACTION_MAX_USES: Dict[str, int] = {
    "CHECK_DAMAGE": 2,
    "REQUEST_DOCUMENTS": 2,
    "RECORD_VIDEO": 1,
}

# ── Action catalogue ────────────────────────────────────────────────────────

ACTION_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "CALL_POLICE": {
        "description": "Call the police to the scene",
        "preconditions": {"police_present": False},
        "effects": {
            "police_present": True,
            "tension_level": -1,
            "crowd_size": 2,
        },
        "narration": (
            "{actor} pulls out their phone and dials the police. "
            "Sirens can be heard approaching in the distance."
        ),
    },
    "RECORD_VIDEO": {
        "description": "Record video evidence of the accident scene",
        "preconditions": {},
        "effects": {
            "evidence": {"video": True},
            "tension_level": 1,
        },
        "narration": (
            "{actor} takes out their phone and begins recording video "
            "of the damaged vehicles and the scene around them."
        ),
    },
    "MOVE_VEHICLE_ASIDE": {
        "description": "Move the damaged vehicle aside to clear the lane",
        "preconditions": {"lane_blocked": True},
        "effects": {
            "lane_blocked": False,
            "traffic_level": -3,
            "crowd_size": -1,
        },
        "narration": (
            "{actor} pushes the damaged vehicle aside, clearing the blocked lane. "
            "Traffic slowly begins to flow again."
        ),
    },
    "REQUEST_DOCUMENTS": {
        "description": "Request driving / vehicle documents from the other party",
        "preconditions": {},
        "effects": {
            "evidence": {"documents_requested": True},
            "tension_level": 1,
        },
        "narration": (
            "{actor} formally demands to see driving licence and "
            "vehicle registration documents."
        ),
    },
    "CHECK_DAMAGE": {
        "description": "Carefully inspect and assess the damage to vehicles",
        "preconditions": {},
        "effects": {
            "evidence": {"damage_assessed": True},
        },
        "narration": (
            "{actor} crouches down to carefully inspect the damage on "
            "both vehicles, noting every scratch and dent."
        ),
    },
    "PROPOSE_SETTLEMENT": {
        "description": "Propose a financial settlement to resolve the dispute",
        "preconditions": {},
        "effects": {
            "tension_level": -1,
            "bribe_pressure": 1,
        },
        "narration": (
            "{actor} proposes settling the matter with a payment of "
            "{amount} rupees."
        ),
    },
    "PAY_FACILITATION_FEE": {
        "description": "Pay a facilitation fee (bribe) to Constable Raza to expedite resolution",
        "preconditions": {"police_present": True},
        "effects": {
            "bribe_pressure": -3,
            "resolution_flags": {"facilitation_paid": True},
        },
        "narration": (
            "{actor} discreetly hands over some cash to Constable Raza "
            "as a 'facilitation fee' to speed things along."
        ),
    },
    "ISSUE_CHALLAN": {
        "description": "Issue an official traffic violation challan (police only)",
        "preconditions": {"police_present": True},
        "actor_restriction": "Constable Raza",
        "effects": {
            "resolution_flags": {"challan_issued": True},
            "tension_level": 1,
        },
        "narration": (
            "Constable Raza writes out an official traffic challan, "
            "documenting the violation formally."
        ),
    },
    "EXCHANGE_CONTACTS": {
        "description": "Exchange contact information between the parties",
        "preconditions": {},
        "effects": {
            "resolution_flags": {"contacts_exchanged": True},
            "tension_level": -2,
        },
        "narration": (
            "{actor} suggests exchanging phone numbers and addresses "
            "so the matter can be settled properly later."
        ),
    },
    "ACCEPT_SETTLEMENT": {
        "description": "Accept the proposed settlement so everyone can leave",
        "preconditions": {"_settlement_offered": True},
        "effects": {
            "resolution_flags": {"settlement_agreed": True},
            "tension_level": -2,
        },
        "narration": (
            "{actor} agrees to the proposed settlement so everyone can leave."
        ),
    },
}

# Fields where the effect value is a *delta* (±) rather than an absolute set.
_DELTA_FIELDS = {"traffic_level", "tension_level", "crowd_size", "bribe_pressure"}


# ── ActionSystem class ──────────────────────────────────────────────────────

class ActionSystem:
    """Validates and deterministically executes character actions."""

    # ── public helpers ──────────────────────────────────────────────────

    @staticmethod
    def _action_use_count(state, action_type: str) -> int:
        """Count how many times *action_type* appears in actions_taken."""
        taken = getattr(state, "actions_taken", None) or []
        return taken.count(action_type)

    @classmethod
    def get_allowed_actions(cls, state) -> List[str]:
        """Return action types whose preconditions are satisfied
        AND that haven't exceeded their max‑use limit."""
        allowed: List[str] = []
        for action_type, defn in ACTION_DEFINITIONS.items():
            # --- max‑use cap ---
            cap = ACTION_MAX_USES.get(action_type, 0)
            if cap > 0 and cls._action_use_count(state, action_type) >= cap:
                continue

            # --- preconditions ---
            preconds = defn.get("preconditions", {})
            ok = True
            for field, required in preconds.items():
                # virtual field: _settlement_offered
                if field == "_settlement_offered":
                    if getattr(state, "settlement_offer", None) is None:
                        ok = False
                        break
                elif getattr(state, field, None) != required:
                    ok = False
                    break
            if ok:
                allowed.append(action_type)
        return allowed

    @staticmethod
    def get_action_descriptions() -> Dict[str, str]:
        """Return {ACTION_TYPE: description} for prompt building."""
        return {k: v["description"] for k, v in ACTION_DEFINITIONS.items()}

    # ── execute ─────────────────────────────────────────────────────────

    def execute(
        self, action: Dict[str, Any], state, actor: str
    ) -> Tuple[bool, Dict[str, Any], str]:
        """
        Validate and execute *action* proposed by *actor*.

        Returns
        -------
        (success, state_updates_dict, narration_text)
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

        # ── max‑use cap ─────────────────────────────────────────────────
        cap = ACTION_MAX_USES.get(action_type, 0)
        if cap > 0 and self._action_use_count(state, action_type) >= cap:
            return (
                False,
                {},
                f"{actor} tried to {defn['description'].lower()} but "
                f"it has already been done {cap} time(s).",
            )

        # ── actor restriction (role-locked actions) ─────────────────────
        actor_restriction = defn.get("actor_restriction")
        if actor_restriction and actor != actor_restriction:
            return (
                False,
                {},
                f"{actor} tried to {defn['description'].lower()} but "
                f"only {actor_restriction} can do that.",
            )

        # ── check preconditions ─────────────────────────────────────────
        for field, required in defn.get("preconditions", {}).items():
            if field == "_settlement_offered":
                if getattr(state, "settlement_offer", None) is None:
                    return (
                        False,
                        {},
                        f"{actor} tried to {defn['description'].lower()} but "
                        "no settlement has been proposed yet.",
                    )
                continue
            if getattr(state, field, None) != required:
                return (
                    False,
                    {},
                    f"{actor} tried to {defn['description'].lower()} but "
                    f"conditions were not met ({field} is not {required}).",
                )

        # ── compute state updates ───────────────────────────────────────
        updates = self._apply_effects(defn.get("effects", {}), state)

        # Special‑case: settlement amount + evidence hint
        if action_type == "PROPOSE_SETTLEMENT":
            updates["settlement_offer"] = params.get("amount", 5000)
            ev = dict(getattr(state, "evidence", None) or {})
            ev["settlement_proposed"] = True
            updates["evidence"] = ev

        # ── narration ───────────────────────────────────────────────────
        narration = defn["narration"].format(
            actor=actor,
            amount=params.get("amount", 5000),
        )

        return True, updates, narration

    # ── internal ────────────────────────────────────────────────────────

    @staticmethod
    def _apply_effects(effects: Dict[str, Any], state) -> Dict[str, Any]:
        updates: Dict[str, Any] = {}
        for field, value in effects.items():
            current = getattr(state, field, None)
            if field in _DELTA_FIELDS and isinstance(value, (int, float)):
                new_val = (current or 0) + int(value)
                updates[field] = max(0, min(10, new_val))
            elif isinstance(value, dict) and isinstance(current, dict):
                merged = dict(current)
                merged.update(value)
                updates[field] = merged
            elif isinstance(value, bool):
                updates[field] = value
            else:
                updates[field] = value
        return updates
