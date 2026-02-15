import asyncio
import json
import sys
import os
from pathlib import Path

current_dir = Path(__file__).parent
project_root = current_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.config import StoryConfig
from src.agents.character_agent import CharacterAgent
from src.agents.director_agent import DirectorAgent
from src.graph.narrative_graph import NarrativeGraph
from src.story_state import StoryStateManager


def find_seed_story(story_name: str = None):
    """Find a seed story from the examples directory.
    
    If story_name is given, look for that specific folder.
    Otherwise, use the first available example.
    """
    examples_dir = project_root / "examples"
    
    if story_name:
        story_dir = examples_dir / story_name
        if story_dir.exists():
            return story_dir
    
    # Find any available example
    if examples_dir.exists():
        for child in sorted(examples_dir.iterdir()):
            if child.is_dir() and (child / "seed_story.json").exists():
                return child
    
    return None


async def main():
    # Determine which story to run
    story_name = os.getenv("STORY_NAME", None)
    if len(sys.argv) > 1:
        story_name = sys.argv[1]

    examples_dir = find_seed_story(story_name)
    if not examples_dir:
        print("Error: No seed story found in examples/ directory.")
        print("Create examples/<story_name>/seed_story.json and character_configs.json")
        sys.exit(1)

    seed_story = json.loads((examples_dir / "seed_story.json").read_text())
    char_configs = json.loads((examples_dir / "character_configs.json").read_text())

    # Initialize config
    config = StoryConfig()

    # Allow overriding max_turns via environment or seed story
    if "max_turns" in seed_story:
        config.max_turns = seed_story["max_turns"]
    env_turns = os.getenv("MAX_TURNS")
    if env_turns:
        config.max_turns = int(env_turns)

    # Auto-calculate min_actions based on turn budget
    config.min_actions = max(5, config.max_turns // 5)

    # Create character agents
    characters = [
        CharacterAgent(name=char["name"], config=config)
        for char in char_configs["characters"]
    ]

    # Create director
    director = DirectorAgent(config)

    # Build initial state via StoryStateManager
    story_manager = StoryStateManager(seed_story, char_configs["characters"], config)

    # Build and run narrative graph
    story_graph = NarrativeGraph(config, characters, director)

    print("Starting Narrative Film…")
    print(f"  Title      : {seed_story['title']}")
    print(f"  Scenario   : {seed_story['description']}")
    print(f"  Model      : {config.model_name}")
    print(f"  Max turns  : {config.max_turns}")
    print(f"  Min actions: {config.min_actions}")
    print(f"  Characters : {', '.join(c.name for c in characters)}\n")

    # Run the game
    final_state = await story_graph.run(
        seed_story=seed_story,
        character_profiles=story_manager.state.character_profiles,
        total_turns=config.max_turns,
    )

    # ── Print results ───────────────────────────────────────────────────
    print("\n=== STORY TRANSCRIPT ===\n")
    for event in final_state.get("events", []):
        if isinstance(event, dict):
            etype = event.get("type", "")
            turn = event.get("turn", "?")
            if etype == "dialogue":
                print(f"[Turn {turn}] {event.get('speaker')}:")
                print(f"  {event.get('content')}\n")
            elif etype == "narration":
                action_meta = (event.get("metadata") or {}).get("action")
                if action_meta:
                    print(
                        f"[Turn {turn}] ** ACTION: {action_meta['type']} "
                        f"by {action_meta['actor']} **"
                    )
                print(f"[Narration] {event.get('content')}\n")

    total_turns = final_state.get("current_turn", 0)
    actions = final_state.get("actions_taken", [])
    distinct = len(set(actions))

    print(f"\n=== SUMMARY ===")
    print(f"Total turns     : {total_turns}")
    print(f"Conclusion      : {final_state.get('conclusion_reason')}")
    print(f"Distinct actions: {distinct}")
    print(f"Actions taken   : {actions}")

    # ── Save story_output.json ──────────────────────────────────────────
    output_path = project_root / "story_output.json"
    output_data = {
        "title": seed_story.get("title"),
        "seed_story": seed_story,
        "events": final_state.get("events", []),
        "metadata": {
            "total_turns": total_turns,
            "conclusion_reason": final_state.get("conclusion_reason"),
            "distinct_actions": distinct,
            "actions_taken": actions,
            "world_state": final_state.get("world_state", {}),
        },
    }

    output_path.write_text(json.dumps(output_data, indent=2, default=str))
    print(f"\nStory saved to {output_path}")

    # ── Save prompts_log.json ───────────────────────────────────────────
    all_logs = []

    for log in director.logs:
        log["role"] = "Director"
        all_logs.append(log)

    for char in characters:
        for log in char.logs:
            log["role"] = f"Character ({char.name})"
            all_logs.append(log)

    all_logs.sort(key=lambda x: x["timestamp"])

    prompts_path = project_root / "prompts_log.json"
    prompts_path.write_text(json.dumps(all_logs, indent=2, default=str))
    print(f"Prompts saved to {prompts_path}")


if __name__ == "__main__":
    asyncio.run(main())
