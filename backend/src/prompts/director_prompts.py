"""Director prompt builders for speaker‑selection and conclusion checks."""

from ..schemas import StoryState


def build_director_select_prompt(
    story_state: StoryState,
    available_characters: list,
    force_act: bool,
    endgame: bool,
    config,
) -> str:
    desc = story_state.seed_story.get("description", "")

    recent = story_state.dialogue_history[-5:]
    if recent:
        recent_text = "\n".join(
            f"[T{t.turn_number}] {t.speaker}: {t.dialogue[:100]}"
            for t in recent
        )
    else:
        recent_text = (
            "No dialogue yet. The story is just starting. "
            "Select the character most likely to speak first."
        )

    distinct_actions_count = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))

    state_summary = (
        f"Turn {story_state.current_turn}/{config.max_turns} | "
        f"Tension: {story_state.tension_level}/10 | "
        f"Police: {story_state.police_present} | "
        f"Lane blocked: {story_state.lane_blocked} | "
        f"Distinct actions: {distinct_actions_count}/{config.min_actions} | "
        f"Used actions: {used_actions}"
    )

    extra = ""
    if force_act:
        extra += (
            "\n!! The next character MUST perform a physical ACTION "
            "(not dialogue). Hint at this in narration. !!"
        )
        if distinct_actions_count < config.min_actions:
            extra += (
                f"\n!! We need NEW action types. Already used: {used_actions}. "
                "Pick a character who can perform a DIFFERENT action type. "
                "Avoid repeating CHECK_DAMAGE. !!"
            )
    if story_state.current_turn >= 12 and distinct_actions_count < config.min_actions:
        extra += (
            f"\n!! URGENT: Only {distinct_actions_count}/{config.min_actions} distinct actions so far. "
            f"Already used: {used_actions}. "
            "Prioritize choosing a character who will perform a NEW action type not in the list above. "
            "Avoid repeating CHECK_DAMAGE. "
            f"By turn 18, distinct_actions must be >= {config.min_actions}. !!"
        )
    if endgame:
        extra += (
            "\n!! ENDGAME phase (turns 23‑25). Push the story toward "
            "resolution — settlement, departure, or wrap‑up. !!"
        )

    return f"""You are the Director of a Karachi street‑accident narrative.
Context: {desc}

ROLE REMINDER: Ahmed Malik = CAR owner/businessman (late for flight). Saleem = poor RICKSHAW driver. Constable Raza = traffic police. Uncle Jameel = shopkeeper/bystander. ISSUE_CHALLAN is police-only (Constable Raza).

STATE: {state_summary}

Recent:
{recent_text}

Available Characters: {", ".join(available_characters)}
{extra}

Select the next speaker to advance the story. Consider:
1. Who would naturally respond to the last event?
2. What advances the plot (new info, escalation, or resolution)?
3. Avoid same character speaking more than {config.max_consecutive_same_character} times in a row.

Respond with JSON ONLY:
{{
  "next_speaker": "Character Name",
  "narration": "brief scene narration (1‑2 sentences)"
}}
"""


def build_director_conclusion_prompt(story_state: StoryState, config) -> str:
    recent = story_state.dialogue_history[-5:]
    recent_text = (
        "\n".join(f"{t.speaker}: {t.dialogue[:100]}" for t in recent)
        if recent
        else "No dialogue"
    )

    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))
    resolution_info = (
        f"Resolution flags: {story_state.resolution_flags}"
        if story_state.resolution_flags
        else "No resolution yet"
    )

    return f"""You are the Director. Should this story conclude?

Context: {story_state.seed_story.get('description', '')}
Turn: {story_state.current_turn}/{config.max_turns} (min: {config.min_turns})
Distinct actions: {distinct_actions}/{config.min_actions}
Used actions: {used_actions}
{resolution_info}

Recent:
{recent_text}

STRICT RULES (you MUST obey):
1. DO NOT conclude if current turn < {config.min_turns}.
2. DO NOT conclude if distinct_actions < {config.min_actions} (currently {distinct_actions}), UNLESS current_turn >= {config.max_turns}.
3. If distinct_actions < {config.min_actions}, you MUST set should_end to false regardless of story state.
4. Only conclude when BOTH conditions are met: distinct_actions >= {config.min_actions} AND a natural resolution has occurred (settlement, departure, etc.) OR turn >= {config.max_turns - 2}.

Respond with JSON ONLY:
{{
  "should_end": true or false,
  "reason": "brief explanation",
  "conclusion_narration": "final wrap‑up narration (2‑3 sentences, if ending)"
}}
"""


# ── Keep old names importable (unused but safe) ─────────────────────────
DIRECTOR_SELECT_SPEAKER_PROMPT = ""
DIRECTOR_CONCLUSION_PROMPT = ""
