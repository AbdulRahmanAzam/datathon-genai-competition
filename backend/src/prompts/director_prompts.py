"""Director prompt builders — fully generic for any film/drama scenario.

The Director acts as the FILM DIRECTOR, orchestrating the scene:
- Plans a complete story arc before the first turn
- Selects which character speaks next to maximize dramatic tension
- Injects cinematic narration to guide the visual feel
- Monitors pacing and pushes toward resolution within the turn budget
"""

from ..schemas import StoryState

def _get_phase(current_turn: int, total_turns: int) -> str:
    if total_turns <= 0:
        return "setup"
    progress = current_turn / total_turns
    if progress < 0.2:
        return "SETUP"
    elif progress < 0.7:
        return "CONFLICT"
    else:
        return "RESOLUTION"

# ── Arc Planning Prompt (called once before the story starts) ──────────

def build_arc_planning_prompt(
    seed_story: dict,
    characters: list,
    total_turns: int,
    min_actions: int,
) -> str:
    """Build a prompt for the director to plan the complete story arc."""
    title = seed_story.get("title", "Untitled")
    description = seed_story.get("description", "")

    char_lines = []
    for char in characters:
        if isinstance(char, dict):
            char_lines.append(f"  • {char['name']}: {char['description']}")
        elif hasattr(char, "name"):
            char_lines.append(f"  • {char.name}: {char.description}")
    chars_text = "\n".join(char_lines) if char_lines else "  • (No characters defined)"

    return f"""You are a PROFESSIONAL FILM DIRECTOR planning a short dramatic film.

FILM BRIEF:
TITLE: "{title}"
SCENARIO: {description}

CAST:
{chars_text}

TOTAL TURNS: {total_turns}
MINIMUM PHYSICAL ACTIONS: {min_actions} (must be different action types)

PLANNING TASK:
Plan the COMPLETE dramatic arc for this {total_turns}-turn film.

STRUCTURE:
• SETUP (first ~20% of turns): Introduce the conflict, establish characters
  and the world. Open with narration setting the scene, then first dialogue.
• CONFLICT (middle ~50% of turns): Escalate tension, create confrontations,
  reveal stakes. Characters clash. Physical actions happen here.
• RESOLUTION (final ~30% of turns): Climax and denouement. Reach a
  meaningful conclusion. Final turn should have closing narration.

RULES:
1. The story MUST conclude by turn {total_turns} — plan the ending.
2. At least {min_actions} physical actions must occur (different types).
3. Turn 0 should be opening narration (no dialogue).
4. The final turn should include concluding narration.
5. Every character should speak at least once.
6. The pacing must feel natural for a {total_turns}-turn story.

Return ONLY valid JSON:

{{
  "arc_plan": [
    {{
      "turn": 0,
      "phase": "setup",
      "type": "narration",
      "beat": "Opening — set the scene",
      "suggested_speaker": null
    }},
    {{
      "turn": 1,
      "phase": "setup",
      "type": "dialogue",
      "beat": "First character breaks the silence",
      "suggested_speaker": "Character Name"
    }}
  ],
  "conclusion_type": "How the story should naturally end (1 sentence)"
}}"""

# ── Speaker Selection Prompt (called each turn) ───────────────────────

def build_director_select_prompt(
    story_state: StoryState,
    available_characters: list,
    force_act: bool,
    endgame: bool,
    config,
) -> str:
    seed = story_state.seed_story or {}
    title = seed.get("title", "Untitled")
    desc = seed.get("description", "")

    # Dynamic character descriptions from profiles
    char_descriptions = []
    for name, profile in (story_state.character_profiles or {}).items():
        char_descriptions.append(f"  • {name}: {profile.description}")
    chars_text = "\n".join(char_descriptions) if char_descriptions else "  (No profiles)"

    recent = story_state.dialogue_history[-5:]
    if recent:
        recent_text = "\n".join(
            f"  [{t.turn_number}] {t.speaker}: {t.dialogue[:130]}"
            for t in recent
        )
    else:
        recent_text = "  No dialogue yet. The story is just starting."

    total = getattr(story_state, "total_turns", config.max_turns)
    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))
    min_actions = max(2, total // 5)
    remaining = total - story_state.current_turn
    phase = _get_phase(story_state.current_turn, total)

    # Arc plan hint
    arc_plan = getattr(story_state, "story_arc_plan", [])
    arc_hint = ""
    for beat in arc_plan:
        if beat.get("turn") == story_state.current_turn:
            arc_hint = f"\nPLANNED BEAT: {beat.get('beat', '')} (Speaker: {beat.get('suggested_speaker', 'any')})"
            break

    # Phase-specific guidance
    if phase == "SETUP":
        phase_guide = "Introduce characters and establish the conflict."
    elif phase == "CONFLICT":
        phase_guide = "Escalate tension. Create confrontations. Drive physical actions."
    else:
        phase_guide = "Push toward conclusion. Resolve the central conflict decisively."

    extra = ""
    if force_act:
        extra += (
            "\n!! A physical ACTION is needed this turn. Choose a character "
            "who can PERFORM an action (not just talk). !!"
        )
        if distinct_actions < min_actions:
            extra += (
                f"\n!! We need MORE VARIED actions. Already used: {used_actions}. "
                "Pick a character who can perform a DIFFERENT action type. !!"
            )
    if endgame:
        extra += f"\n!! FINAL {remaining} TURNS. Drive the story to its conclusion NOW. !!"
    if remaining <= 1:
        extra += "\n!! LAST TURN. The story MUST conclude. Write concluding narration. !!"

    return f"""You are the DIRECTOR of "{title}".

DIRECTOR'S CHAIR
FILM: "{title}"
SCENE: {desc}

CAST:
{chars_text}

SCENE STATUS:
Turn {story_state.current_turn}/{total} | Phase: {phase} | Remaining: {remaining}
Actions: {distinct_actions}/{min_actions} minimum ({used_actions or 'none yet'})

PHASE DIRECTION: {phase_guide}
{arc_hint}

RECENT SCENES:
{recent_text}

AVAILABLE CHARACTERS: {', '.join(available_characters)}
{extra}

DIRECTOR'S TASK:

Select the NEXT CHARACTER to speak/act. Consider:
1. DRAMATIC IMPACT: Who creates the most compelling moment NOW?
2. NATURAL FLOW: Who would realistically respond to what just happened?
3. STORY PROGRESSION: What advances the plot toward the planned ending?
4. PACING: Don't repeat the same speaker consecutively.

Your NARRATION should be:
• CINEMATIC: Describe what the camera sees — lighting, body language,
  sounds, atmosphere, crowd reactions, environmental details.
• TRANSITIONAL: Bridge smoothly from the last moment to the next.
• ATMOSPHERIC: Build mood and tension through sensory detail.
• 2-3 sentences maximum — tight and evocative.

OUTPUT (JSON ONLY):
{{
  "next_speaker": "Character Name",
  "narration": "Cinematic scene narration (2-3 sentences)"
}}"""

# ── Conclusion Check Prompt ────────────────────────────────────────────

def build_director_conclusion_prompt(story_state: StoryState, config) -> str:
    seed = story_state.seed_story or {}
    title = seed.get("title", "Untitled")
    desc = seed.get("description", "")

    recent = story_state.dialogue_history[-5:]
    recent_text = (
        "\n".join(f"  {t.speaker}: {t.dialogue[:130]}" for t in recent)
        if recent
        else "  No dialogue"
    )

    total = getattr(story_state, "total_turns", config.max_turns)
    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))
    min_actions = max(2, total // 5)
    remaining = total - story_state.current_turn
    min_turns = max(3, total // 2)

    world = story_state.world_state or {}
    world_text = (
        "\n".join(f"  • {k}: {v}" for k, v in world.items())
        if world
        else "  No state changes yet"
    )

    return f"""You are the DIRECTOR of "{title}". Should this scene conclude?

SCENE STATUS:
SCENE: {desc}
Turn: {story_state.current_turn}/{total} | Remaining: {remaining}
Distinct Actions: {distinct_actions}/{min_actions} minimum
Actions Used: {used_actions or 'none'}

WORLD STATE:
{world_text}

RECENT DIALOGUE:
{recent_text}

CONCLUSION RULES (MANDATORY - you MUST obey ALL):
1. DO NOT conclude before turn {min_turns}.
2. DO NOT conclude if distinct_actions < {min_actions}, UNLESS it's the final turn.
3. CONCLUDE when BOTH conditions are met:
   a) distinct_actions >= {min_actions}
   b) A natural resolution has occurred OR remaining turns <= 1
4. If remaining <= 1, you MUST conclude regardless.

If concluding, write a CINEMATIC WRAP-UP narration:
• Describe the aftermath and what each character does
• Create a sense of closure — like a film's final shot
• Make it emotionally resonant and visually rich
• 3-5 sentences that feel like the end of a movie

OUTPUT (JSON ONLY):
{{
  "should_end": true or false,
  "reason": "Brief explanation",
  "conclusion_narration": "Cinematic concluding narration if ending, else null"
}}"""

# ── Keep old names importable ───────────────────────────────────────────
DIRECTOR_SELECT_SPEAKER_PROMPT = ""
DIRECTOR_CONCLUSION_PROMPT = ""
