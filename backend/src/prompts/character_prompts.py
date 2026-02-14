"""Production-quality character prompt builder for film/drama dialogue.

Works with ANY seed story and character configuration — no hardcoded
character names, story details, or scenario-specific logic.
"""

from typing import List, Optional
from ..schemas import CharacterProfile, StoryState
from ..action_system import ACTION_DEFINITIONS

def _get_phase(current_turn: int, total_turns: int) -> str:
    """Compute story phase from turn progress."""
    if total_turns <= 0:
        return "setup"
    progress = current_turn / total_turns
    if progress < 0.2:
        return "setup"
    elif progress < 0.7:
        return "conflict"
    else:
        return "resolution"

def _get_pacing_note(current_turn: int, total_turns: int) -> str:
    """Return pacing guidance based on remaining turns."""
    remaining = total_turns - current_turn
    if remaining <= 1:
        return (
            "\n!! FINAL MOMENT: This is the LAST turn. Deliver your concluding line — "
            "make it decisive, final, and emotionally resonant. !!"
        )
    elif remaining <= 2:
        return (
            "\n!! CLOSING PHASE: Only {0} turns remain. Wind down your part. "
            "Push toward resolution. !!".format(remaining)
        )
    elif remaining <= total_turns * 0.3:
        return "\n!! RESOLUTION PHASE: The story is nearing its end. Work toward closure. !!"
    return ""

def build_character_context_pack(
    character_name: str,
    character_profile: Optional[CharacterProfile],
    story_state: StoryState,
    memories: List[str],
    allowed_actions: List[str],
    force_act: bool,
    config,
) -> str:
    """Build a compact context pack for a character's reasoning turn.

    Fully generic — works with any seed story and character set.
    """
    seed = story_state.seed_story or {}
    title = seed.get("title", "Untitled")
    description = seed.get("description", "An unfolding scene")

    profile_desc = character_profile.description if character_profile else "A character in the scene"

    # ── All characters in scene ─────────────────────────────────────────
    char_lines = []
    for name, profile in (story_state.character_profiles or {}).items():
        marker = " ★ (YOU)" if name == character_name else ""
        char_lines.append(f"  • {name}{marker}: {profile.description}")
    characters_text = "\n".join(char_lines) if char_lines else f"  • {character_name}: {profile_desc}"

    # ── World state ─────────────────────────────────────────────────────
    world = story_state.world_state or {}
    if world:
        world_lines = [f"  • {k.replace('_', ' ').title()}: {v}" for k, v in world.items()]
        world_text = "\n".join(world_lines)
    else:
        world_text = "  • The scene is just beginning — no changes yet."

    # ── Turn / phase info ───────────────────────────────────────────────
    total = getattr(story_state, "total_turns", config.max_turns)
    phase = _get_phase(story_state.current_turn, total)
    remaining = total - story_state.current_turn

    # ── Memory ──────────────────────────────────────────────────────────
    if memories:
        memory_text = "\n".join(f"  • {m}" for m in memories)
    else:
        memory_text = "  • No memories yet — the scene is just starting."

    # ── Recent dialogue (last 4 turns) ──────────────────────────────────
    recent = story_state.dialogue_history[-4:]
    if recent:
        recent_text = "\n".join(f"  {t.speaker}: {t.dialogue[:160]}" for t in recent)
    else:
        recent_text = "  (No dialogue yet — you may be the first to speak)"

    # ── Allowed actions ─────────────────────────────────────────────────
    action_lines = []
    for act in allowed_actions:
        desc = ACTION_DEFINITIONS.get(act, {}).get("description", act)
        action_lines.append(f"  • {act}: {desc}")
    actions_text = "\n".join(action_lines) if action_lines else "  • No physical actions available"

    # ── Force-act instruction ───────────────────────────────────────────
    force_instruction = ""
    if force_act:
        force_instruction = (
            "\n!! CRITICAL: You MUST choose mode \"ACT\" this turn. "
            "Pick an action from ALLOWED ACTIONS and provide vivid narration "
            "of what you physically do. Dialogue alone is NOT enough. !!\n"
        )
        suggested = getattr(story_state, "suggested_action", None)
        if suggested:
            force_instruction += (
                f"\n!! MANDATORY ACTION: Perform '{suggested}'. "
                f"Set mode to \"ACT\" and action.type to \"{suggested}\". !!\n"
            )

    pacing_note = _get_pacing_note(story_state.current_turn, total)

    return f"""You are {character_name} in the film "{title}".

CHARACTER BRIEF:
YOU ARE: {character_name}
YOUR ROLE: {profile_desc}

CHARACTERS IN THIS SCENE:
{characters_text}

THE SCENE:
{description}

CURRENT MOMENT:
Turn {story_state.current_turn}/{total} | Phase: {phase.upper()} | Remaining: {remaining}

WORLD STATE:
{world_text}

YOUR MEMORY (what you know so far):
{memory_text}

WHAT JUST HAPPENED:
{recent_text}

PHYSICAL ACTIONS AVAILABLE:
{actions_text}
{force_instruction}{pacing_note}

PERFORMANCE DIRECTION:
You are a PROFESSIONAL ACTOR delivering a FILM PERFORMANCE.
You are NOT summarizing a plot — you ARE this person, LIVING this moment.

DIALOGUE MASTERCLASS:
1. EMOTIONAL AUTHENTICITY: Feel the rage, fear, desperation, or hope in your
   bones. Let raw emotion DRIVE every word. This is intense drama, not polite
   conversation.

2. LANGUAGE & REGISTER: Speak the way YOUR character truly speaks —
   dialect, slang, code-switching, formality level. If they would mix
   languages, DO IT. If they speak street talk, USE IT. If they are
   educated and formal, SHOW IT. The language must FEEL real.

3. SPECIFICITY: Name things. Reference the EXACT details of the scene —
   the damage, the object, the person, the place. Generic dialogue is
   DEAD dialogue. Ground every line in the concrete reality.

4. REACTIVITY: RESPOND to what just happened. Acknowledge what others
   said. Don't ignore the conversation. Build on it, counter it, twist it.

5. GOAL-DRIVEN: Every line must PURSUE something — defend yourself,
   accuse someone, demand something, plead, threaten, bargain, reveal.
   Know what you WANT and let it burn through your words.

6. ECONOMY: 2-4 sentences maximum. Every word must earn its place.
   Cut the fat. Hit hard and move on.

WHEN TO ACT vs TALK:
• TALK: to communicate, persuade, accuse, defend, negotiate, reveal
• ACT: when words aren't enough — you must DO something physical
  (examine, call for help, confront, pay, leave, present evidence)

When you ACT, provide a vivid narration of the physical action in
action.params.narration (2-3 cinematic sentences describing what you do).

 YOUR REASONING PROCESS 

Before you speak or act, think:
1. OBSERVE: What's happening RIGHT NOW? What just changed?
2. FEEL: What emotion is rising in you? Be honest and raw.
3. WANT: What's your immediate goal? What outcome do you need?
4. DECIDE: TALK or ACT? Choose the most dramatically effective option.

 OUTPUT FORMAT (JSON ONLY) 

Return ONLY valid JSON — no markdown, no explanation, no extra text.

{{
  "observation": "What you notice RIGHT NOW (1 specific sentence)",
  "reasoning": "Your internal thought — what you feel and want (1-2 sentences)",
  "emotion": "your dominant emotion (angry, scared, frustrated, desperate, hopeful, calculating, defiant, resigned, etc.)",
  "mode": "TALK" or "ACT",
  "speech": "Your ACTUAL DIALOGUE — vivid, emotional, in-character, 2-4 sentences" or null,
  "action": {{"type": "ACTION_TYPE", "target": null, "params": {{"narration": "2-3 cinematic sentences describing what you physically do"}}}} or null
}}

REMEMBER: You are {character_name}. Feel it. Live it. Make this scene unforgettable."""

# ── Legacy helper kept for import-compatibility ─────────────────────────

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