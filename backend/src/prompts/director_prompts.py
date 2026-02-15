"""Director prompt builders — strict JSON-only output.

Every prompt enforces raw JSON with no markdown, no commentary,
no trailing commas.  Allowed actions are always provided explicitly
so the LLM never invents action types.
"""

from ..schemas import StoryState
from ..action_system import ACTION_DEFINITIONS, RESOLUTION_SIGNALS

# ── Canonical allowed actions (exported for other modules) ──────────
ALLOWED_ACTIONS = sorted(ACTION_DEFINITIONS.keys())


# ── Phase helpers ───────────────────────────────────────────────────

def _get_phase(current_turn: int, total_turns: int) -> str:
    if total_turns <= 0:
        return "SETUP"
    progress = current_turn / total_turns
    if progress < 0.15:
        return "SETUP"
    elif progress < 0.55:
        return "CONFLICT"
    elif progress < 0.80:
        return "CLIMAX"
    else:
        return "RESOLUTION"


def _phase_guidance(phase: str) -> str:
    return {
        "SETUP": (
            "Introduce characters and establish the conflict. "
            "Let them discover the situation and react."
        ),
        "CONFLICT": (
            "Escalate tension. Create confrontations. Drive PHYSICAL ACTIONS. "
            "Characters clash — emotionally AND through decisive moves."
        ),
        "CLIMAX": (
            "PEAK TENSION. Force decisive action. Someone must act NOW. "
            "Push toward resolution — no more stalling."
        ),
        "RESOLUTION": (
            "Bring closure through settlement, authority, or departure. "
            "Final lines should feel earned and emotionally resonant."
        ),
    }.get(phase, "Continue the story.")


# ════════════════════════════════════════════════════════════════════
#  ARC PLANNING PROMPT
# ════════════════════════════════════════════════════════════════════

def build_arc_planning_prompt(
    seed_story: dict,
    characters: list,
    total_turns: int,
    min_actions: int,
) -> str:
    title = seed_story.get("title", "Untitled")
    description = seed_story.get("description", "")

    char_lines = []
    for char in characters:
        if isinstance(char, dict):
            char_lines.append(f"  - {char['name']}: {char['description']}")
        elif hasattr(char, "name"):
            char_lines.append(f"  - {char.name}: {char.description}")
    chars_text = "\n".join(char_lines) or "  - (No characters)"

    actions_list = ", ".join(ALLOWED_ACTIONS)

    return f"""You are a FILM DIRECTOR planning a short dramatic film.

TITLE: "{title}"
SCENARIO: {description}

CAST:
{chars_text}

TOTAL TURNS: {total_turns}
MINIMUM DISTINCT ACTIONS: {min_actions}
ALLOWED ACTION TYPES (use ONLY these): [{actions_list}]

Plan a complete dramatic arc:
- SETUP  (turns 0-{max(1, int(total_turns * 0.15))}): Introduce conflict, establish characters.
- CONFLICT (turns {int(total_turns * 0.15)+1}-{int(total_turns * 0.55)}): Escalate, clashes, physical actions.
- CLIMAX (turns {int(total_turns * 0.55)+1}-{int(total_turns * 0.80)}): Peak tension, decisive actions.
- RESOLUTION (turns {int(total_turns * 0.80)+1}-{total_turns}): Closure, settlement, final moments.

RULES:
1. Story concludes by turn {total_turns}.
2. At least {min_actions} DISTINCT actions from the allowed list.
3. Every character speaks at least once.
4. Actions MUST come ONLY from the allowed list. No invented actions.

OUTPUT RULES (MANDATORY):
- Return ONLY raw JSON. No backticks. No markdown fences. No prose before or after.
- No trailing commas inside arrays or objects.
- If you cannot comply, output {{}}.

REQUIRED JSON SCHEMA:
{{
  "arc_plan": [
    {{"turn": 0, "phase": "setup", "type": "narration", "beat": "Opening — set the scene", "suggested_speaker": null}},
    {{"turn": 1, "phase": "setup", "type": "dialogue", "beat": "First character reacts", "suggested_speaker": "Character Name"}},
    {{"turn": 5, "phase": "conflict", "type": "action", "beat": "Character confronts other", "suggested_speaker": "Character Name"}}
  ],
  "planned_actions": ["CONFRONT", "INVESTIGATE", "INTERVENE", "NEGOTIATE", "MAKE_PAYMENT"],
  "conclusion_type": "One sentence describing how the story ends"
}}"""


# ════════════════════════════════════════════════════════════════════
#  SPEAKER SELECTION PROMPT
# ════════════════════════════════════════════════════════════════════

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

    # Character descriptions
    char_descriptions = []
    for name, profile in (story_state.character_profiles or {}).items():
        char_descriptions.append(f"  - {name}: {profile.description}")
    chars_text = "\n".join(char_descriptions) or "  (No profiles)"

    # Recent dialogue
    recent = story_state.dialogue_history[-5:]
    if recent:
        recent_text = "\n".join(
            f"  [{t.turn_number}] {t.speaker}: {t.dialogue[:130]}"
            for t in recent
        )
    else:
        recent_text = "  No dialogue yet."

    total = getattr(story_state, "total_turns", config.max_turns)
    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))
    # Scale min_actions proportionally: ~20% of total turns
    min_actions = max(3, total // 5)
    remaining = total - story_state.current_turn
    phase = _get_phase(story_state.current_turn, total)
    phase_guide = _phase_guidance(phase)

    # Arc plan hint
    arc_plan = getattr(story_state, "story_arc_plan", [])
    arc_hint = ""
    for beat in arc_plan:
        if beat.get("turn") == story_state.current_turn:
            arc_hint = (
                f"\nPLANNED BEAT: {beat.get('beat', '')} "
                f"(Speaker: {beat.get('suggested_speaker', 'any')})"
            )
            break

    # Allowed / unused actions
    actions_list = ", ".join(ALLOWED_ACTIONS)
    unused_actions = sorted(set(ALLOWED_ACTIONS) - set(story_state.actions_taken))

    # Anti-repetition
    last_speaker = ""
    dialogue_streak = 0
    if story_state.dialogue_history:
        last_speaker = story_state.dialogue_history[-1].speaker
        for t in reversed(story_state.dialogue_history):
            if "[ACTION:" not in t.dialogue:
                dialogue_streak += 1
            else:
                break

    silent_chars = [
        c for c in available_characters
        if c not in {t.speaker for t in story_state.dialogue_history[-5:]}
    ]

    # Build extra directives
    extra = ""
    if last_speaker:
        extra += f"\nLAST SPEAKER: {last_speaker} — avoid picking them again."
    if dialogue_streak >= 2:
        extra += (
            f"\n!! {dialogue_streak} consecutive TALK turns. "
            "A PHYSICAL ACTION is OVERDUE. Pick someone who will ACT. !!"
        )
    if silent_chars:
        extra += f"\nSILENT CHARACTERS: {', '.join(silent_chars)} — consider them."
    if force_act:
        extra += (
            "\n!! FORCE ACT: A physical action MUST happen this turn. "
            "Pick a character likely to ACT (not just talk). !!"
        )
        if distinct_actions < min_actions and unused_actions:
            extra += (
                f"\n!! UNUSED ACTIONS: {', '.join(unused_actions[:5])}. "
                "Prioritize variety. !!"
            )
    if endgame:
        extra += f"\n!! FINAL {remaining} TURNS. Drive to conclusion. !!"
        world = story_state.world_state or {}
        has_resolution = any(world.get(k) for k in RESOLUTION_SIGNALS)
        if not has_resolution:
            extra += (
                "\n!! NO RESOLUTION SIGNAL YET. Push for NEGOTIATE, "
                "MAKE_PAYMENT, or ACCEPT_TERMS to close the story. !!"
            )
    if remaining <= 1:
        extra += "\n!! LAST TURN. Story MUST end. Write concluding narration. !!"

    safe_default = available_characters[0] if available_characters else "Unknown"

    return f"""You are the DIRECTOR of "{title}".

SCENE: {desc}

CAST:
{chars_text}

Turn {story_state.current_turn}/{total} | Phase: {phase} | Remaining: {remaining}
Distinct actions: {distinct_actions}/{min_actions} min ({used_actions or 'none yet'})
ALLOWED ACTIONS: [{actions_list}]
UNUSED ACTIONS: [{', '.join(unused_actions)}]

PHASE DIRECTION: {phase_guide}
{arc_hint}

RECENT:
{recent_text}

AVAILABLE: {', '.join(available_characters)}
{extra}

Select the next character. Write cinematic narration (2-3 sentences):
camera angles, lighting, body language, atmosphere.
Narration must be unique and vivid — NEVER repeat the same narration twice.
Describe specific visual details: what the character's hands are doing, their
facial expression, the lighting, the sounds in the background.

NARRATION STYLE:
- Write narration in English (it's the camera direction / stage direction).
- Make each narration UNIQUE — describe NEW visual details every turn.
- Include at least one sensory detail (sound, light, texture, smell).
- Reference the specific character who is about to speak.

OUTPUT RULES (MANDATORY):
- Return ONLY raw JSON. No backticks. No markdown. No prose.
- No trailing commas.
- If you cannot comply, output: {{"next_speaker": "{safe_default}", "narration": "The scene continues."}}

REQUIRED JSON:
{{
  "next_speaker": "Character Name from available list",
  "narration": "Cinematic 2-3 sentence narration"
}}"""


# ════════════════════════════════════════════════════════════════════
#  CONCLUSION CHECK PROMPT
# ════════════════════════════════════════════════════════════════════

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
    # Scale min_actions proportionally: ~20% of total turns
    min_actions = max(2, total // 5)
    remaining = total - story_state.current_turn
    # Conclusion can happen after 50% of turns (for movie-like pacing)
    min_turns = max(3, total // 2)

    world = story_state.world_state or {}
    world_text = (
        "\n".join(f"  - {k}: {v}" for k, v in world.items())
        if world
        else "  No state changes"
    )

    has_resolution = any(world.get(k) for k in RESOLUTION_SIGNALS)

    return f"""You are the DIRECTOR of "{title}". Should this scene conclude?

Turn: {story_state.current_turn}/{total} | Remaining: {remaining}
Distinct Actions: {distinct_actions}/{min_actions} min | Used: {used_actions or 'none'}
Resolution signal present: {has_resolution}

WORLD STATE:
{world_text}

RECENT:
{recent_text}

MANDATORY RULES:
1. DO NOT conclude before turn {min_turns}.
2. DO NOT conclude if distinct_actions < {min_actions} UNLESS remaining <= 1.
3. DO NOT conclude if no resolution signal UNLESS remaining <= 1.
   Resolution signals: terms_accepted, payment_made, decisive_action_taken, help_summoned.
4. CONCLUDE when ALL conditions met:
   a) distinct_actions >= {min_actions}
   b) resolution signal is present
   c) OR remaining <= 1
5. If remaining <= 1, MUST conclude regardless.

If concluding, write a CINEMATIC wrap-up (3-5 sentences):
- Describe the aftermath and each character's final moment
- Create visual closure — like a film's final shot
- Emotionally resonant and vivid

OUTPUT RULES (MANDATORY):
- Return ONLY raw JSON. No backticks. No markdown. No prose.
- No trailing commas.
- If you cannot comply, output: {{"should_end": false, "reason": "continue", "conclusion_narration": null}}

REQUIRED JSON:
{{
  "should_end": true or false,
  "reason": "Brief explanation",
  "conclusion_narration": "Cinematic conclusion if ending, else null"
}}"""


# ════════════════════════════════════════════════════════════════════
#  FINAL CONCLUSION NARRATION PROMPT
# ════════════════════════════════════════════════════════════════════

def build_final_conclusion_narration_prompt(story_state: StoryState, config) -> str:
    """Generate a cinematic conclusion narration that wraps up the entire story."""
    seed = story_state.seed_story or {}
    title = seed.get("title", "Untitled")
    desc = seed.get("description", "")

    # Character summaries
    char_lines = []
    for name, profile in (story_state.character_profiles or {}).items():
        char_lines.append(f"  - {name}: {profile.description}")
    chars_text = "\n".join(char_lines) or "  (No characters)"

    # Recent dialogue (last 8 turns for more context)
    recent = story_state.dialogue_history[-8:]
    recent_text = (
        "\n".join(f"  [{t.turn_number}] {t.speaker}: {t.dialogue[:160]}" for t in recent)
        if recent
        else "  No dialogue"
    )

    # World state
    world = story_state.world_state or {}
    world_text = (
        "\n".join(f"  - {k}: {v}" for k, v in world.items())
        if world
        else "  No state changes"
    )

    total = getattr(story_state, "total_turns", config.max_turns)
    distinct_actions = len(set(story_state.actions_taken))
    used_actions = sorted(set(story_state.actions_taken))

    # Key events summary
    key_events = []
    for evt in story_state.events:
        if isinstance(evt, dict):
            if evt.get("type") == "action":
                meta = (evt.get("metadata") or {}).get("action", {})
                key_events.append(f"  - Turn {evt.get('turn')}: {meta.get('actor', '?')} performed {meta.get('type', '?')}")
    key_events_text = "\n".join(key_events[-6:]) if key_events else "  No major actions"

    return f"""You are the DIRECTOR of "{title}". The story has reached its final moment.
Write a CINEMATIC CONCLUSION that wraps up the entire story.

TITLE: "{title}"
SCENARIO: {desc}

CAST:
{chars_text}

STORY STATS: {story_state.current_turn}/{total} turns completed | {distinct_actions} distinct actions ({used_actions or 'none'})

WORLD STATE:
{world_text}

KEY ACTIONS THAT OCCURRED:
{key_events_text}

RECENT DIALOGUE (the last moments):
{recent_text}

YOUR TASK:
Write a powerful, cinematic conclusion that:
1. RESOLVES the central conflict — what was the outcome?
2. Gives each character a FINAL MOMENT — their last action, expression, or words
3. Creates VISUAL CLOSURE — describe the final "shot" like a film ending
4. Is EMOTIONALLY RESONANT — the audience should feel something
5. Is 4-6 sentences long — concise but complete

DO NOT leave anything unresolved. This is THE END of the story.
Describe what happens to each character. Paint the final image.

OUTPUT RULES (MANDATORY):
- Return ONLY raw JSON. No backticks. No markdown. No prose before or after.
- No trailing commas.

REQUIRED JSON:
{{
  "conclusion_narration": "Your 4-6 sentence cinematic conclusion wrapping up the entire story",
  "final_outcome": "One sentence summary of how the story resolved"
}}"""


# ── Keep old names importable ───────────────────────────────────────
DIRECTOR_SELECT_SPEAKER_PROMPT = ""
DIRECTOR_CONCLUSION_PROMPT = ""
