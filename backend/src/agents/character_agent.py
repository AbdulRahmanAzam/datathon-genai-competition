import json
from typing import List, Dict, Any, Optional
from .base_agent import BaseAgent
from ..config import StoryConfig
from ..schemas import StoryState, CharacterProfile
from ..action_system import ACTION_DEFINITIONS
from ..prompts.character_prompts import build_character_context_pack


class CharacterAgent(BaseAgent):
    def __init__(self, name: str, config: StoryConfig):
        super().__init__(name, config)

    # ════════════════════════════════════════════════════════════════
    #  MAIN DECISION ENTRY POINT
    # ════════════════════════════════════════════════════════════════

    async def reason_and_decide(
        self,
        story_state: StoryState,
        memories: List[str],
        allowed_actions: List[str],
        force_act: bool = False,
    ) -> Dict[str, Any]:
        """
        Character decides TALK vs ACT.  Includes:
        - safe_parse_json (brace extraction, trailing-comma fix)
        - one LLM repair call on parse failure
        - force_act override (TALK → ACT with unused action)
        - deterministic fallback that never crashes
        """
        character_profile = story_state.character_profiles.get(self.name)

        prompt = build_character_context_pack(
            character_name=self.name,
            character_profile=character_profile,
            story_state=story_state,
            memories=memories,
            allowed_actions=allowed_actions,
            force_act=force_act,
            config=self.config,
        )

        try:
            content = await self.generate_response(prompt)

            if content and content.strip():
                decision = self._parse_decision(content, allowed_actions)
                if decision is not None:
                    if force_act and decision["mode"] == "TALK" and allowed_actions:
                        decision = self._force_act_override(
                            decision, story_state, allowed_actions, character_profile
                        )
                    return decision

            # ── Repair attempt ──────────────────────────────────────
            print(f"  [{self.name}] Parse failed, attempting repair…")
            profile_desc = (
                character_profile.description
                if character_profile
                else "A character"
            )
            repair = (
                f"You are {self.name} — {profile_desc}\n"
                "Your previous response was not valid JSON.\n"
                "Return ONLY valid JSON. No backticks. No markdown. No commentary.\n\n"
                '{"observation": "what you notice", "reasoning": "your thought", '
                '"emotion": "emotion", "mode": "TALK", '
                '"speech": "your dialogue 2-3 sentences", "action": null}\n\n'
                "Return ONLY the JSON object:"
            )
            content = await self.generate_response(repair)
            if content and content.strip():
                decision = self._parse_decision(content, allowed_actions)
                if decision is not None:
                    if force_act and decision["mode"] == "TALK" and allowed_actions:
                        decision = self._force_act_override(
                            decision, story_state, allowed_actions, character_profile
                        )
                    return decision

        except Exception as e:
            print(f"  [{self.name}] Error: {e}")

        # ── Deterministic fallback ──────────────────────────────────
        return self._build_fallback(
            story_state, allowed_actions, force_act, character_profile
        )

    # ════════════════════════════════════════════════════════════════
    #  FORCE-ACT OVERRIDE
    # ════════════════════════════════════════════════════════════════

    def _force_act_override(
        self,
        decision: Dict[str, Any],
        story_state: StoryState,
        allowed_actions: List[str],
        profile: Optional[CharacterProfile],
    ) -> Dict[str, Any]:
        """When force_act is True but the LLM chose TALK, override to ACT."""
        action_type = self._pick_best_action(story_state, allowed_actions)
        if not action_type:
            return decision  # nothing valid, keep TALK

        hint = ACTION_DEFINITIONS.get(action_type, {}).get(
            "narration_hint", "takes action"
        )
        print(f"  [{self.name}] Force-ACT override: TALK → ACT ({action_type})")

        return {
            "observation": decision.get("observation", "The situation demands action."),
            "reasoning": decision.get("reasoning", "I must act now."),
            "emotion": decision.get("emotion", "determined"),
            "mode": "ACT",
            "speech": decision.get("speech"),
            "action": {
                "type": action_type,
                "target": None,
                "params": {
                    "narration": (
                        f"{self.name} {hint}."
                    )
                },
            },
        }

    # ════════════════════════════════════════════════════════════════
    #  ACTION PICKER (prefer unused for diversity)
    # ════════════════════════════════════════════════════════════════

    @staticmethod
    def _pick_best_action(
        story_state: StoryState, allowed_actions: List[str]
    ) -> Optional[str]:
        if not allowed_actions:
            return None
        used = set(story_state.actions_taken)
        unused = [a for a in allowed_actions if a not in used]
        return unused[0] if unused else allowed_actions[0]

    # ════════════════════════════════════════════════════════════════
    #  DETERMINISTIC FALLBACK
    # ════════════════════════════════════════════════════════════════

    def _build_fallback(
        self,
        story_state: StoryState,
        allowed_actions: List[str],
        force_act: bool,
        profile: Optional[CharacterProfile],
    ) -> Dict[str, Any]:
        seed = story_state.seed_story or {}
        scene_desc = seed.get("description", "the scene")
        profile_desc = profile.description if profile else "a character"

        if force_act and allowed_actions:
            action_type = self._pick_best_action(story_state, allowed_actions)
            hint = ACTION_DEFINITIONS.get(action_type, {}).get(
                "narration_hint", "takes action"
            )
            return {
                "observation": f"The situation at {scene_desc[:50]} demands action.",
                "reasoning": f"As {self.name}, I must act now.",
                "emotion": "determined",
                "mode": "ACT",
                "speech": None,
                "action": {
                    "type": action_type,
                    "target": None,
                    "params": {
                        "narration": (
                            f"{self.name} {hint}."
                        )
                    },
                },
            }

        # TALK fallback — context-aware, never generic
        recent = (
            story_state.dialogue_history[-1:]
            if story_state.dialogue_history
            else []
        )
        if recent:
            last = recent[0].speaker
            fallback_speech = (
                f"Wait — I need to say something about this."
            )
        elif "police" in profile_desc.lower() or "constable" in profile_desc.lower():
            fallback_speech = (
                "Everyone stay calm. I need to understand what happened here."
            )
        elif "driver" in profile_desc.lower() or "rickshaw" in profile_desc.lower():
            fallback_speech = (
                "This wasn't my fault — look at the damage yourself."
            )
        elif "aunty" in profile_desc.lower() or "mother" in profile_desc.lower():
            fallback_speech = (
                "What is going on here? Someone needs to explain this to me."
            )
        else:
            fallback_speech = "Let me see what's really happening here."

        return {
            "observation": "The scene demands attention.",
            "reasoning": "I need to assess the situation.",
            "emotion": "alert",
            "mode": "TALK",
            "speech": fallback_speech,
            "action": None,
        }

    # ════════════════════════════════════════════════════════════════
    #  STRICT JSON PARSER WITH ACTION VALIDATION
    # ════════════════════════════════════════════════════════════════

    def _parse_decision(
        self, content: str, allowed_actions: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Parse character decision — validates action type strictly."""
        data = self.safe_parse_json(content)
        if data is None:
            return None

        mode = (data.get("mode") or "TALK").upper()
        if mode not in ("TALK", "ACT"):
            mode = "TALK"

        base = {
            "observation": str(data.get("observation", "")),
            "reasoning": str(data.get("reasoning", "")),
            "emotion": str(data.get("emotion", "neutral")),
        }

        if mode == "TALK":
            speech = data.get("speech") or data.get("dialogue") or "..."
            return {**base, "mode": "TALK", "speech": str(speech), "action": None}

        # mode == "ACT"
        action = data.get("action")
        if not action or not isinstance(action, dict):
            speech = data.get("speech") or "I need to think about this."
            return {**base, "mode": "TALK", "speech": str(speech), "action": None}

        action_type = (action.get("type") or "").upper().replace(" ", "_")

        # ── Strict validation ───────────────────────────────────────
        if action_type not in allowed_actions:
            mapped = self._map_to_allowed(action_type, allowed_actions)
            if mapped is None:
                speech = data.get("speech") or "I'll reconsider my approach."
                print(
                    f"  [{self.name}] Invalid action '{action_type}' "
                    f"not in {allowed_actions[:5]}… — degrading to TALK"
                )
                return {**base, "mode": "TALK", "speech": str(speech), "action": None}
            print(
                f"  [{self.name}] Mapped invalid '{action_type}' → '{mapped}'"
            )
            action_type = mapped

        return {
            **base,
            "mode": "ACT",
            "speech": data.get("speech"),
            "action": {
                "type": action_type,
                "target": action.get("target"),
                "params": action.get("params") or {},
            },
        }

    # ════════════════════════════════════════════════════════════════
    #  INVALID→ALLOWED ACTION MAPPER
    # ════════════════════════════════════════════════════════════════

    @staticmethod
    def _map_to_allowed(
        action_type: str, allowed_actions: List[str]
    ) -> Optional[str]:
        """Map an invalid action type to the closest allowed one."""
        if not allowed_actions:
            return None

        at = action_type.upper()

        # Direct substring match
        for allowed in allowed_actions:
            if at in allowed or allowed in at:
                return allowed

        # Keyword mapping
        _KEYWORD_MAP = {
            "CHECK": "INVESTIGATE",
            "EXAMINE": "INVESTIGATE",
            "INSPECT": "INVESTIGATE",
            "LOOK": "INVESTIGATE",
            "ASSESS": "INVESTIGATE",
            "SEARCH": "INVESTIGATE",
            "CALL": "SUMMON_HELP",
            "PHONE": "SUMMON_HELP",
            "HELP": "SUMMON_HELP",
            "BARGAIN": "NEGOTIATE",
            "DEAL": "NEGOTIATE",
            "OFFER": "NEGOTIATE",
            "PROPOSE": "NEGOTIATE",
            "COMPROMISE": "NEGOTIATE",
            "AGREE": "ACCEPT_TERMS",
            "ACCEPT": "ACCEPT_TERMS",
            "FIGHT": "CONFRONT",
            "CHALLENGE": "CONFRONT",
            "APPROACH": "CONFRONT",
            "THREATEN": "CONFRONT",
            "SHOW": "PRESENT_EVIDENCE",
            "REVEAL": "PRESENT_EVIDENCE",
            "PROVE": "PRESENT_EVIDENCE",
            "DISPLAY": "PRESENT_EVIDENCE",
            "MEDIATE": "INTERVENE",
            "STOP": "INTERVENE",
            "BREAK": "INTERVENE",
            "SEPARATE": "INTERVENE",
            "CALM": "INTERVENE",
            "LEAVE": "EXIT_SCENE",
            "DEPART": "EXIT_SCENE",
            "WALK": "EXIT_SCENE",
            "GO": "EXIT_SCENE",
            "FLEE": "EXIT_SCENE",
            "RUN": "EXIT_SCENE",
            "PAY": "MAKE_PAYMENT",
            "MONEY": "MAKE_PAYMENT",
            "BRIBE": "MAKE_PAYMENT",
            "COMPENSATE": "MAKE_PAYMENT",
            "ACT": "TAKE_DECISIVE_ACTION",
            "DECIDE": "TAKE_DECISIVE_ACTION",
            "BOLD": "TAKE_DECISIVE_ACTION",
        }
        for keyword, mapped in _KEYWORD_MAP.items():
            if keyword in at and mapped in allowed_actions:
                return mapped

        return None

    # ── Legacy compat ───────────────────────────────────────────────

    async def respond(self, story_state: StoryState, context: str) -> str:
        decision = await self.reason_and_decide(story_state, [], [], False)
        if decision["mode"] == "ACT" and decision.get("action"):
            return f"[ACTION: {decision['action']['type']}]"
        return decision.get("speech", "...")
