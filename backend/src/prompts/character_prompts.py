"""Character prompt builder — strict JSON, action-validated.

Works with ANY seed story.  Action types are constrained to the
explicit ALLOWED list passed in; the prompt tells the LLM that
any other action will be rejected.
"""

from typing import List, Optional, Any
from ..schemas import CharacterProfile, CharacterMemory, StoryState
from ..action_system import ACTION_DEFINITIONS

ALLOWED_ACTIONS = sorted(ACTION_DEFINITIONS.keys())


def _get_phase(current_turn: int, total_turns: int) -> str:
    if total_turns <= 0:
        return "setup"
    progress = current_turn / total_turns
    if progress < 0.15:
        return "setup"
    elif progress < 0.55:
        return "conflict"
    elif progress < 0.80:
        return "climax"
    else:
        return "resolution"


def _char_phase_hint(phase: str, name: str) -> str:
    return {
        "setup": f"{name}, discover the situation. React with first impressions.",
        "conflict": f"{name}, tensions HIGH. Confront, accuse, defend, bargain — make your move.",
        "climax": f"{name}, BREAKING POINT. Take decisive action or say the words that change everything.",
        "resolution": f"{name}, story resolving. Deliver final words. Accept, resist, or walk away.",
    }.get(phase, f"{name}, continue naturally.")


def build_character_context_pack(
    character_name: str,
    character_profile: Optional[CharacterProfile],
    story_state: StoryState,
    memories: Any,
    allowed_actions: List[str],
    force_act: bool,
    config,
) -> str:
    seed = story_state.seed_story or {}
    title = seed.get("title", "Untitled")
    description = seed.get("description", "An unfolding scene")
    profile_desc = (
        character_profile.description if character_profile else "A character"
    )

    # ── All characters ──────────────────────────────────────────────
    char_lines = []
    for name, profile in (story_state.character_profiles or {}).items():
        marker = " (YOU)" if name == character_name else ""
        char_lines.append(f"  - {name}{marker}: {profile.description}")
    characters_text = (
        "\n".join(char_lines) or f"  - {character_name}: {profile_desc}"
    )

    # ── World state ─────────────────────────────────────────────────
    world = story_state.world_state or {}
    world_text = (
        "\n".join(f"  - {k}: {v}" for k, v in world.items())
        if world
        else "  - No changes yet."
    )

    # ── Turn / phase ────────────────────────────────────────────────
    total = getattr(story_state, "total_turns", config.max_turns)
    phase = _get_phase(story_state.current_turn, total)
    remaining = total - story_state.current_turn
    phase_hint = _char_phase_hint(phase, character_name)

    # ── Action tracking ─────────────────────────────────────────────
    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))
    # Scale min_actions proportionally: ~20% of total turns
    min_actions = max(3, total // 5)
    unused_actions = sorted(set(allowed_actions) - set(story_state.actions_taken))

    # ── Repetition detection ────────────────────────────────────────
    own_recent = [
        t.dialogue
        for t in story_state.dialogue_history[-6:]
        if t.speaker == character_name and "[ACTION:" not in t.dialogue
    ]
    repetition_warning = ""
    if len(own_recent) >= 2:
        last_words = set(own_recent[-1].lower().split())
        prev_words = set(own_recent[-2].lower().split())
        overlap = len(last_words & prev_words) / max(
            len(last_words | prev_words), 1
        )
        if overlap > 0.5:
            repetition_warning = (
                "\n!! WARNING: Your last lines were repetitive. "
                "Say something COMPLETELY DIFFERENT. !!"
            )

    # ── Structured Memory ───────────────────────────────────────────
    if memories and isinstance(memories, CharacterMemory):
        knowledge_text = (
            "\n".join(f"  - {k}" for k in memories.knowledge)
            if memories.knowledge else "  - Nothing specific learned yet."
        )
        inventory_text = (
            "\n".join(f"  - {i}" for i in memories.inventory)
            if memories.inventory else "  - Nothing notable."
        )
        perception_lines = []
        for pname, view in memories.perceptions.items():
            if pname != character_name:
                perception_lines.append(f"  - {pname}: {view}")
        perception_text = (
            "\n".join(perception_lines)
            if perception_lines else "  - No strong impressions yet."
        )
        recent_text_mem = (
            "\n".join(f"  - {e}" for e in memories.recent_events[-6:])
            if memories.recent_events else "  - No recent events."
        )
        emotional = memories.emotional_state or "neutral"
        memory_text = (
            f"WHAT YOU KNOW:\n{knowledge_text}\n\n"
            f"YOUR INVENTORY:\n{inventory_text}\n\n"
            f"YOUR EMOTIONAL STATE: {emotional}\n\n"
            f"HOW YOU SEE OTHERS:\n{perception_text}\n\n"
            f"RECENT EVENTS YOU WITNESSED:\n{recent_text_mem}"
        )
    elif memories and isinstance(memories, list):
        memory_text = (
            "\n".join(f"  - {m}" for m in memories)
            if memories else "  - No memories yet."
        )
    else:
        memory_text = "  - No memories yet."

    # ── Character goals ─────────────────────────────────────────────
    goals_text = ""
    if character_profile and character_profile.goals:
        goals_text = "\nYOUR GOALS:\n" + "\n".join(f"  - {g}" for g in character_profile.goals)

    # ── Recent dialogue ─────────────────────────────────────────────
    recent = story_state.dialogue_history[-4:]
    recent_text = (
        "\n".join(f"  {t.speaker}: {t.dialogue[:160]}" for t in recent)
        if recent
        else "  (No dialogue yet)"
    )

    # ── Allowed actions with descriptions ───────────────────────────
    action_lines = []
    for act in allowed_actions:
        desc = ACTION_DEFINITIONS.get(act, {}).get("description", act)
        used_tag = " [ALREADY USED]" if act in used_actions else ""
        action_lines.append(f"  - {act}: {desc}{used_tag}")
    actions_text = (
        "\n".join(action_lines) or "  - No actions available"
    )

    # ── Force-act instruction ───────────────────────────────────────
    force_instruction = ""
    if force_act:
        force_instruction = (
            '\n!! YOU MUST CHOOSE mode "ACT" THIS TURN. !!'
            "\n!! Pick an action from the ALLOWED list below. "
            "Dialogue alone is NOT enough. !!"
        )
        if unused_actions:
            force_instruction += (
                f"\n!! PREFER AN UNUSED ACTION: "
                f"{', '.join(unused_actions[:4])} !!"
            )
        suggested = getattr(story_state, "suggested_action", None)
        if suggested and suggested in allowed_actions:
            force_instruction += (
                f'\n!! MANDATORY: Perform "{suggested}". '
                f'Set action.type to "{suggested}". !!'
            )

    # ── Pacing ──────────────────────────────────────────────────────
    pacing = ""
    if remaining <= 1:
        pacing = "\n!! FINAL TURN. Deliver your concluding line. !!"
    elif remaining <= 3:
        pacing = f"\n!! {remaining} turns left. Push toward resolution. !!"

    return f"""You are {character_name} in "{title}".

YOU: {character_name} — {profile_desc}

CHARACTERS:
{characters_text}

SCENE: {description}

Turn {story_state.current_turn}/{total} | Phase: {phase.upper()} | Remaining: {remaining}
Actions so far: {distinct_actions}/{min_actions} min distinct ({used_actions or 'none'})

WORLD STATE:
{world_text}

YOUR MEMORY:
{memory_text}
{goals_text}

RECENT:
{recent_text}

ALLOWED PHYSICAL ACTIONS (ONLY these are valid — anything else is rejected):
{actions_text}
{force_instruction}{pacing}{repetition_warning}

DIRECTION: {phase_hint}

PERFORMANCE RULES:
1. EMOTIONAL AUTHENTICITY: Feel rage, fear, desperation, hope. Raw emotion.
2. LANGUAGE CONSISTENCY (CRITICAL):
   - Speak ENTIRELY in clear, natural English.
   - NEVER use non-English words, transliteration, or code-switching.
   - Use the tone, dialect, and expressions that fit your character's background,
     but all dialogue must be in English.
   - Example: Instead of "Bhai sahab, yeh kya hai?", say "Sir, what is this?"
3. SPECIFICITY: Name things. Reference exact scene details. No generic lines.
4. REACTIVITY: Respond to what just happened. Acknowledge, counter, twist.
5. GOAL-DRIVEN: Every line pursues something — defend, accuse, demand, plead.
6. ECONOMY: 2-4 sentences max. Every word earns its place.
7. ANTI-FILLER: NEVER say "Let me think" or "What's going on?" — every line
   must reveal info, shift power, escalate, or trigger reaction.
8. FULL CONTEXT: Never give half-responses. Every line must feel complete,
   grounded in the scene, and advance the story meaningfully.
9. COMPLETION: Every sentence must be a complete thought. No trailing off,
   no incomplete ideas, no fragmented speech unless dramatically intentional.

WHEN TO ACT vs TALK:
- TALK: communicate, persuade, accuse, defend, negotiate, reveal.
  Dialogue must be COMPLETE sentences with full context. No fragments.
- ACT: when words aren't enough — examine, call help, confront, pay, leave.
  When YOU ACT, provide vivid narration in action.params.narration (2-3 complete sentences).

!! CRITICAL: action.type MUST be EXACTLY one of: {', '.join(allowed_actions)} !!
!! Any other action type is INVALID and WILL BE REJECTED. !!

DIALOGUE REQUIREMENTS:
- Every line must be a COMPLETE thought, not half-finished.
- Reference the CURRENT situation specifically — who's there, what just happened.
- Advance the scene meaningfully — reveal something, change the dynamic, create tension.
- NO vague statements like "I don't know what to say" or "This is confusing."
- Every sentence must have clear subject, verb, and complete meaning.

OUTPUT RULES (MANDATORY):
- Return ONLY raw JSON. No backticks. No markdown fences. No prose before or after.
- No trailing commas.
- Every field must contain COMPLETE content — no half-sentences, no fragments.
- Speech must be 2-4 COMPLETE sentences in clear English.
- If you cannot comply, output a valid TALK response with complete dialogue.

REQUIRED JSON:
{{
  "observation": "What you notice right now (1 complete sentence)",
  "reasoning": "Your internal thought (1-2 complete sentences)",
  "emotion": "dominant emotion",
  "mode": "TALK" or "ACT",
  "speech": "Your dialogue — 2-4 complete sentences in English" or null,
  "action": {{"type": "ACTION_TYPE_FROM_LIST", "target": null, "params": {{"narration": "2-3 complete cinematic sentences"}}}} or null
}}"""


# ── Legacy helper for import compatibility ──────────────────────────

def get_character_prompt(character_name, character_profile, context, config):
    """Deprecated — kept so old imports don't break."""
    return build_character_context_pack(
        character_name=character_name,
        character_profile=character_profile,
        story_state=None,
        memories=[],
        allowed_actions=[],
        force_act=False,
        config=config,
    )