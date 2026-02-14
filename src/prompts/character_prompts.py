"""Context‑pack based character prompt builder."""

from typing import List
from ..schemas import CharacterProfile, StoryState
from ..action_system import ACTION_DEFINITIONS


def build_character_context_pack(
    character_name: str,
    character_profile: CharacterProfile,
    story_state: StoryState,
    memories: List[str],
    allowed_actions: List[str],
    force_act: bool,
    config,
) -> str:
    """Build a compact context pack for a character's reasoning turn."""

    seed_desc = story_state.seed_story.get("description", "Unknown event")

    # ── World‑state snapshot (only key fields) ──────────────────────────
    state_lines = [
        f"Turn: {story_state.current_turn}/{config.max_turns}",
        f"Lane blocked: {story_state.lane_blocked}",
        f"Traffic level: {story_state.traffic_level}/10",
        f"Tension level: {story_state.tension_level}/10",
        f"Crowd size: {story_state.crowd_size}",
        f"Police present: {story_state.police_present}",
        f"Bribe pressure: {story_state.bribe_pressure}/10",
        f"Evidence: {story_state.evidence or 'none'}",
        f"Settlement offer: {story_state.settlement_offer or 'none'}",
    ]

    # ── Memory bullets ──────────────────────────────────────────────────
    if memories:
        memory_text = "\n".join(f"- {m}" for m in memories)
    else:
        memory_text = "- No memories yet. The scene is just starting."

    # ── Recent dialogue (last 3 turns, compact) ─────────────────────────
    recent = story_state.dialogue_history[-3:]
    if recent:
        recent_text = "\n".join(
            f"{t.speaker}: {t.dialogue[:120]}" for t in recent
        )
    else:
        recent_text = "(No dialogue yet)"

    # ── Allowed actions list ────────────────────────────────────────────
    action_lines = []
    for act in allowed_actions:
        desc = ACTION_DEFINITIONS.get(act, {}).get("description", act)
        action_lines.append(f"- {act}: {desc}")
    actions_text = "\n".join(action_lines) if action_lines else "- No actions available"

    # ── Force ACT instruction ───────────────────────────────────────────
    force_instruction = ""
    if force_act:
        force_instruction = (
            "\n!! IMPORTANT: You MUST choose mode \"ACT\" this turn. "
            "Pick an action from ALLOWED ACTIONS. !!\n"
        )

    # Suggested action override (deterministic enforcement)
    suggested = getattr(story_state, "suggested_action", None) if story_state else None
    if suggested:
        force_instruction += (
            f"\n!! CRITICAL: You MUST perform the action '{suggested}'. "
            f"Set mode to \"ACT\" and action.type to \"{suggested}\". "
            "This is non-negotiable. !!\n"
        )

    # ── Persona safety: prevent role confusion ─────────────────────────
    persona_guard = (
        "\nROLE REMINDER: Ahmed Malik is the CAR owner/businessman late for his flight. "
        "Saleem is the poor RICKSHAW driver. Constable Raza is the traffic police officer. "
        "Uncle Jameel is the local shopkeeper/bystander. Never swap or mix these roles."
    )

    return f"""You are {character_name} in a street‑accident scene in Karachi, Pakistan.

PERSONA: {character_profile.description}
{persona_guard}

SCENE: {seed_desc}

CURRENT STATE:
{chr(10).join(state_lines)}

YOUR MEMORY:
{memory_text}

RECENT DIALOGUE:
{recent_text}

ALLOWED ACTIONS:
{actions_text}
{force_instruction}
RULES:
- Do NOT invent facts outside this context.
- Stay in character as {character_name}.
- Keep dialogue under {config.max_dialogue_length} characters.
- Output ONLY valid JSON (no markdown, no explanation).

Choose TALK to speak dialogue, or ACT to perform an action.

JSON OUTPUT (strict schema):
{{
  "mode": "TALK" or "ACT",
  "speech": "your dialogue text" or null,
  "action": {{"type": "ACTION_TYPE", "target": null, "params": {{}}}} or null
}}"""


# ── Legacy helper kept for import‑compatibility ─────────────────────────

def get_character_prompt(character_name, character_profile, context, config):
    """Deprecated – kept so old imports don't break."""
    return build_character_context_pack(
        character_name=character_name,
        character_profile=character_profile,
        story_state=None,
        memories=[],
        allowed_actions=[],
        force_act=False,
        config=config,
    )
