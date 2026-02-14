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


async def main():
    # Load seed story from examples
    examples_dir = project_root / "examples" / "rickshaw_accident"

    seed_story = json.loads((examples_dir / "seed_story.json").read_text())
    char_configs = json.loads((examples_dir / "character_configs.json").read_text())

    # Initialize config
    config = StoryConfig()

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

    print("Starting Narrative Game…")
    print(f"  Title      : {seed_story['title']}")
    print(f"  Scenario   : {seed_story['description']}")
    print(f"  Model      : {config.model_name}")
    print(f"  Max turns  : {config.max_turns}")
    print(f"  Min actions: {config.min_actions}\n")

    # Run the game
    final_state = await story_graph.run(
        seed_story=seed_story,
        character_profiles=story_manager.state.character_profiles,
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

    # ── Save story_output.json (backward‑compatible) ────────────────────
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
            "world_state": {
                "lane_blocked": final_state.get("lane_blocked", True),
                "traffic_level": final_state.get("traffic_level", 8),
                "tension_level": final_state.get("tension_level", 7),
                "police_present": final_state.get("police_present", False),
                "evidence": final_state.get("evidence", {}),
                "settlement_offer": final_state.get("settlement_offer"),
                "resolution_flags": final_state.get("resolution_flags", {}),
            },
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
