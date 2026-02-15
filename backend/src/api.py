"""
FastAPI server – streams multi-agent narrative generation turn-by-turn.

Endpoints:
  POST /api/generate  – accepts seed story + characters, streams SSE events
"""

import asyncio
import json
import sys
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Ensure project root is importable
current_dir = Path(__file__).parent
project_root = current_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.config import StoryConfig
from src.schemas import StoryState, CharacterProfile, CharacterMemory, DialogueTurn
from src.agents.character_agent import CharacterAgent
from src.agents.director_agent import DirectorAgent
from src.action_system import ActionSystem
from src.supabase_client import (
    save_story_run, list_story_runs, get_story_run, delete_story_run,
    create_story_run, update_story_run,
)

app = FastAPI(title="NarrativeVerse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request schemas ─────────────────────────────────────────────────────

class CharacterInput(BaseModel):
    name: str
    description: str
    goals: List[str] = []
    inventory: List[str] = []
    emotional_state: str = "neutral"
    relationships: Dict[str, str] = {}

class GenerateRequest(BaseModel):
    title: str
    description: str
    characters: List[CharacterInput]
    max_turns: int = 25
    min_turns: int = 10
    min_actions: int = 5


# ── Helpers ─────────────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event line."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _pick_suggested_action(state: StoryState, action_system: ActionSystem):
    """Pick any unused+allowed action for the current story."""
    used = set(state.actions_taken)
    allowed = set(action_system.get_allowed_actions(state))
    candidates = allowed - used
    if not candidates:
        return None
    return sorted(candidates)[0]


# ── Main generation endpoint ────────────────────────────────────────────

@app.post("/api/generate")
async def generate_story(req: GenerateRequest):
    """Stream the narrative generation step-by-step via SSE."""

    async def event_stream():
        config = StoryConfig()
        config.max_turns = req.max_turns
        config.min_turns = req.min_turns
        config.min_actions = req.min_actions

        seed_story = {"title": req.title, "description": req.description}

        characters_agents = {
            c.name: CharacterAgent(name=c.name, config=config)
            for c in req.characters
        }
        director = DirectorAgent(config)
        action_system = ActionSystem()

        char_profiles = {
            c.name: CharacterProfile(
                name=c.name, description=c.description,
                goals=c.goals, inventory=c.inventory,
                emotional_state=c.emotional_state,
                relationships=c.relationships,
            )
            for c in req.characters
        }
        memories: Dict[str, CharacterMemory] = {
            c.name: CharacterMemory(
                inventory=list(c.inventory),
                emotional_state=c.emotional_state,
                perceptions=dict(c.relationships),
            )
            for c in req.characters
        }

        total_turns = config.max_turns
        min_actions = max(2, total_turns // 5)
        config.min_actions = min_actions

        state = StoryState(
            seed_story=seed_story,
            total_turns=total_turns,
            character_profiles=char_profiles,
            character_memories=memories,
        )

        # Collect timeline events for Supabase storage
        sse_timeline: List[Dict[str, Any]] = []

        def _track(event_type: str, data: dict):
            """Track SSE events for later storage."""
            sse_timeline.append({"sseType": event_type, **data})

        # ── Plan story arc ──────────────────────────────────────────
        char_list = [{"name": c.name, "description": c.description} for c in req.characters]
        arc_plan = await director.plan_story_arc(
            seed_story=seed_story,
            characters=char_list,
            total_turns=total_turns,
        )
        state.story_arc_plan = arc_plan

        # Send init event
        yield _sse("init", {
            "title": req.title,
            "characters": [c.model_dump() for c in req.characters],
            "maxTurns": config.max_turns,
        })

        # ── Create story run in Supabase (incremental saving) ──────────
        current_run_id = None
        try:
            current_run_id = await create_story_run(
                title=req.title,
                description=req.description,
                characters=[c.model_dump() for c in req.characters],
            )
            if current_run_id:
                print(f"[Supabase] Story run created: {current_run_id}")
        except Exception as e:
            print(f"[Supabase] Failed to create story run: {e}")

        # ── Main loop ──────────────────────────────────────────────────
        while not state.is_concluded and state.current_turn < config.max_turns:
            turn_num = state.current_turn

            # ── 1) Director Select ─────────────────────────────────────
            yield _sse("step", {"phase": "director_select", "turn": turn_num})
            _track("step", {"phase": "director_select", "turn": turn_num})

            # Hard stop
            if turn_num >= config.max_turns:
                narration = "The scene draws to its inevitable close."
                state.is_concluded = True
                state.conclusion_reason = "Maximum turns reached"
                state.events.append({
                    "type": "narration", "content": narration,
                    "turn": turn_num, "metadata": {"conclusion": True},
                })
                yield _sse("narration", {"content": narration, "turn": turn_num, "conclusion": True})
                break

            # Determine force_act / endgame
            distinct_actions = len(set(state.actions_taken))
            remaining = config.max_turns - turn_num
            force_act = False
            suggested_action = None

            actions_needed = min_actions - distinct_actions
            if actions_needed > 0 and remaining <= actions_needed + 1:
                force_act = True
            if state.turns_since_state_change >= 2:
                force_act = True
            # Mid-story action pressure
            mid_point = max(3, total_turns // 2)
            if turn_num >= mid_point and distinct_actions < max(1, min_actions // 2):
                force_act = True
            # Late-game action pressure
            late_point = max(4, int(total_turns * 0.7))
            if turn_num >= late_point and distinct_actions < min_actions:
                force_act = True

            if force_act and distinct_actions < min_actions:
                suggested_action = _pick_suggested_action(state, action_system)

            endgame = remaining <= max(2, int(total_turns * 0.2))

            # LLM speaker selection
            available = list(characters_agents.keys())
            filtered = available.copy()
            if state.dialogue_history:
                last_speaker = state.dialogue_history[-1].speaker
                run = sum(1 for t in reversed(state.dialogue_history) if t.speaker == last_speaker)
                if run >= config.max_consecutive_same_character:
                    filtered = [c for c in available if c != last_speaker] or available

            next_speaker, narration = await director.select_next_speaker(
                state, filtered, force_act=force_act, endgame=endgame
            )

            state.next_speaker = next_speaker
            state.force_act = force_act
            state.suggested_action = suggested_action

            if narration:
                state.events.append({"type": "narration", "content": narration, "turn": turn_num})
                state.story_narration.append(narration)

            yield _sse("director_result", {
                "turn": turn_num,
                "nextSpeaker": next_speaker,
                "narration": narration or "",
                "forceAct": force_act,
                "endgame": endgame,
                "distinctActions": distinct_actions,
                "suggestedAction": suggested_action,
                "worldState": state.world_state or {},
            })
            _track("director_result", {
                "turn": turn_num, "nextSpeaker": next_speaker,
                "narration": narration or "", "forceAct": force_act,
                "endgame": endgame, "distinctActions": distinct_actions,
            })

            # ── Incremental save after director result ─────────────────
            if current_run_id:
                try:
                    await update_story_run(current_run_id, state.events, sse_timeline)
                except Exception as e:
                    print(f"[Supabase] Incremental save failed: {e}")

            # ── 2) Character Reason ────────────────────────────────────
            yield _sse("step", {"phase": "character_reason", "turn": turn_num})
            _track("step", {"phase": "character_reason", "turn": turn_num})

            character = characters_agents.get(next_speaker) or list(characters_agents.values())[0]
            allowed_actions = action_system.get_allowed_actions(state)
            if suggested_action and suggested_action in allowed_actions:
                allowed_actions = [suggested_action]

            char_memories = state.character_memories.get(next_speaker, CharacterMemory())

            decision = await character.reason_and_decide(
                story_state=state,
                memories=char_memories,
                allowed_actions=allowed_actions,
                force_act=force_act,
            )

            state.pending_decision = decision

            mode = decision.get("mode", "TALK")
            yield _sse("reasoning_result", {
                "turn": turn_num,
                "speaker": next_speaker,
                "mode": mode,
                "action": decision.get("action"),
                "speechPreview": (decision.get("speech") or "")[:120],
                "observation": decision.get("observation", ""),
                "reasoning": decision.get("reasoning", ""),
                "emotion": decision.get("emotion", "neutral"),
            })
            _track("reasoning_result", {
                "turn": turn_num, "speaker": next_speaker, "mode": mode,
                "observation": decision.get("observation", ""),
                "reasoning": decision.get("reasoning", ""),
                "emotion": decision.get("emotion", "neutral"),
            })

            # ── 3) Process Action ──────────────────────────────────────
            yield _sse("step", {"phase": "process_action", "turn": turn_num})
            _track("step", {"phase": "process_action", "turn": turn_num})

            actual_mode = (decision.get("mode") or "TALK").upper()
            event_data = None

            if actual_mode == "ACT" and decision.get("action"):
                action = decision["action"]
                success, effects, act_narration = action_system.execute(action, state, next_speaker)

                if success:
                    state.current_turn += 1
                    state.actions_taken.append(action["type"])
                    state.turns_since_state_change = 0
                    state.force_act = False
                    state.suggested_action = None
                    state.pending_decision = {}
                    # Apply effects
                    for k, v in effects.items():
                        if hasattr(state, k):
                            setattr(state, k, v)

                    new_event = {
                        "type": "action", "content": act_narration,
                        "speaker": next_speaker,
                        "turn": state.current_turn,
                        "metadata": {"action": {"type": action["type"], "actor": next_speaker}},
                    }
                    state.events.append(new_event)
                    state.dialogue_history.append(DialogueTurn(
                        turn_number=state.current_turn, speaker=next_speaker,
                        dialogue=f"[ACTION: {action['type']}] {act_narration}",
                        metadata={"action_type": action["type"]},
                    ))

                    event_data = {
                        "type": "action", "turn": state.current_turn,
                        "speaker": next_speaker,
                        "actionType": action["type"],
                        "content": act_narration,
                        "emotion": decision.get("emotion", "neutral"),
                        "observation": decision.get("observation", ""),
                        "reasoning": decision.get("reasoning", ""),
                    }
                else:
                    # Fallback to talk
                    decision = {"mode": "TALK", "speech": decision.get("speech") or f"*{next_speaker} hesitates*"}
                    actual_mode = "TALK"

            if actual_mode == "TALK" or event_data is None:
                speech = decision.get("speech") or "…"
                state.current_turn += 1
                state.dialogue_history.append(DialogueTurn(
                    turn_number=state.current_turn, speaker=next_speaker, dialogue=speech,
                ))
                state.events.append({
                    "type": "dialogue", "speaker": next_speaker,
                    "content": speech, "turn": state.current_turn,
                })
                state.turns_since_state_change += 1
                state.force_act = False
                state.suggested_action = None
                state.pending_decision = {}
                event_data = {
                    "type": "dialogue", "turn": state.current_turn,
                    "speaker": next_speaker, "content": speech,
                    "emotion": decision.get("emotion", "neutral"),
                    "observation": decision.get("observation", ""),
                    "reasoning": decision.get("reasoning", ""),
                }

            yield _sse("action_result", event_data)
            _track("action_result", event_data)

            # ── Incremental save after character action/dialogue ───────
            if current_run_id:
                try:
                    await update_story_run(current_run_id, state.events, sse_timeline)
                except Exception as e:
                    print(f"[Supabase] Incremental save failed: {e}")

            # ── 4) Memory Update (with information asymmetry) ───────────
            yield _sse("step", {"phase": "memory_update", "turn": state.current_turn})
            _track("step", {"phase": "memory_update", "turn": state.current_turn})

            last_event = state.events[-1] if state.events else None
            if last_event:
                action_meta = (last_event.get("metadata") or {}).get("action")
                if last_event["type"] == "dialogue":
                    preview = (last_event.get("content") or "")[:80]
                    memory_line = f'T{last_event["turn"]}: {next_speaker} said: "{preview}"'
                elif action_meta:
                    memory_line = f"T{last_event['turn']}: {action_meta['actor']} performed {action_meta['type']}"
                else:
                    preview = (last_event.get("content") or "")[:80]
                    memory_line = f"T{last_event['turn']}: {preview}"

                # Determine present characters (information asymmetry)
                present_chars = set()
                world = state.world_state or {}
                for name in characters_agents:
                    departed_key = f"{name}_departed"
                    if not world.get(departed_key, False):
                        present_chars.add(name)
                present_chars.add(next_speaker)  # Speaker always witnesses

                # Update only present characters' memories
                for name in present_chars:
                    if name in characters_agents:
                        mem = state.character_memories.get(name)
                        if not mem or not isinstance(mem, CharacterMemory):
                            mem = CharacterMemory()
                        mem.recent_events.append(memory_line)
                        mem.recent_events = mem.recent_events[-config.memory_buffer_size:]
                        state.character_memories[name] = mem

                # Knowledge and facts for actions
                if action_meta:
                    actor = action_meta.get("actor", next_speaker)
                    action_type = action_meta.get("type", "UNKNOWN")

                    # Actor gains specific knowledge
                    if actor in state.character_memories:
                        mem = state.character_memories[actor]
                        if isinstance(mem, CharacterMemory):
                            mem.knowledge.append(f"I performed {action_type} at turn {last_event['turn']}")

                    # All present characters learn the fact
                    fact_parts = [f"{action_type} by {actor}"]
                    for k, v in world.items():
                        if isinstance(v, bool) and v:
                            fact_parts.append(k.replace('_', ' '))
                    global_fact = "[FACT] " + " | ".join(fact_parts)
                    for name in present_chars:
                        if name in state.character_memories:
                            mem = state.character_memories[name]
                            if isinstance(mem, CharacterMemory):
                                mem.knowledge.append(global_fact)
                                mem.recent_events.append(global_fact)
                                mem.recent_events = mem.recent_events[-config.memory_buffer_size:]

                # Update speaker's emotional state
                char_emotion = decision.get("emotion")
                if char_emotion and next_speaker in state.character_memories:
                    mem = state.character_memories[next_speaker]
                    if isinstance(mem, CharacterMemory):
                        mem.emotional_state = char_emotion

                # Track emotion history
                if char_emotion:
                    state.emotion_history.append({
                        "turn": state.current_turn,
                        "character": next_speaker,
                        "emotion": char_emotion,
                    })

            # Collect memory snapshot for SSE
            mem_obj = state.character_memories.get(next_speaker, CharacterMemory())
            if isinstance(mem_obj, CharacterMemory):
                mem_snapshot = mem_obj.recent_events[-3:]
            else:
                mem_snapshot = []
            yield _sse("memory_result", {
                "turn": state.current_turn,
                "speaker": next_speaker,
                "recentMemories": mem_snapshot,
            })
            _track("memory_result", {
                "turn": state.current_turn,
                "speaker": next_speaker,
                "recentMemories": mem_snapshot,
            })

            # ── 5) Check Conclusion ────────────────────────────────────
            yield _sse("step", {"phase": "check_conclusion", "turn": state.current_turn})
            _track("step", {"phase": "check_conclusion", "turn": state.current_turn})

            should_conclude = False
            conclusion_reason = None

            min_conclusion_turn = max(3, total_turns // 2)
            if state.current_turn >= config.max_turns:
                should_conclude = True
                conclusion_reason = "Maximum turns reached"
            elif state.current_turn < min_conclusion_turn:
                should_conclude = False
            elif len(set(state.actions_taken)) < min_actions and state.current_turn < config.max_turns:
                should_conclude = False
            else:
                should_conclude, conclusion_reason = await director.check_conclusion(state)

            yield _sse("conclusion_check", {
                "turn": state.current_turn,
                "shouldEnd": should_conclude,
                "reason": conclusion_reason,
            })
            _track("conclusion_check", {
                "turn": state.current_turn,
                "shouldEnd": should_conclude,
                "reason": conclusion_reason,
            })

            if should_conclude:
                state.is_concluded = True
                state.conclusion_reason = str(conclusion_reason or "Story concluded")
                if conclusion_reason:
                    state.events.append({
                        "type": "narration", "content": conclusion_reason,
                        "turn": state.current_turn,
                        "metadata": {"conclusion": True},
                    })

                # ── 6) Conclude ────────────────────────────────────────
                yield _sse("step", {"phase": "conclude_story", "turn": state.current_turn})
                _track("step", {"phase": "conclude_story", "turn": state.current_turn})
                concluded_data = {
                    "turn": state.current_turn,
                    "reason": state.conclusion_reason,
                    "totalActions": len(set(state.actions_taken)),
                    "actionsTaken": list(set(state.actions_taken)),
                }
                yield _sse("concluded", concluded_data)
                _track("concluded", concluded_data)
                break

            await asyncio.sleep(0.05)  # small yield

        # Final summary
        if not state.is_concluded:
            state.is_concluded = True
            state.conclusion_reason = state.conclusion_reason or "Maximum turns reached"
            yield _sse("step", {"phase": "conclude_story", "turn": state.current_turn})
            _track("step", {"phase": "conclude_story", "turn": state.current_turn})
            final_concluded_data = {
                "turn": state.current_turn,
                "reason": state.conclusion_reason,
                "totalActions": len(set(state.actions_taken)),
                "actionsTaken": list(set(state.actions_taken)),
            }
            yield _sse("concluded", final_concluded_data)
            _track("concluded", final_concluded_data)

        yield _sse("done", {"events": state.events})

        # ── Write output files ─────────────────────────────────────────
        _write_prompt_logs(characters_agents, director)
        _write_story_output(state, seed_story)
        _write_prompts_jsonl(characters_agents, director)

        # ── Final save to Supabase ─────────────────────────────────────
        try:
            summary = {
                "totalTurns": state.current_turn,
                "totalActions": len(set(state.actions_taken)),
                "actionsTaken": list(set(state.actions_taken)),
                "conclusionReason": state.conclusion_reason or "Completed",
                "worldState": state.world_state or {},
                "status": "completed",
            }
            if current_run_id:
                # Update existing record with final summary
                await update_story_run(
                    run_id=current_run_id,
                    events=state.events,
                    timeline=sse_timeline,
                    summary=summary,
                )
                print(f"[Supabase] Story run completed: {current_run_id}")
            else:
                # Fallback: create new record if incremental save wasn't available
                await save_story_run(
                    title=req.title,
                    description=req.description,
                    characters=[c.model_dump() for c in req.characters],
                    events=state.events,
                    timeline=sse_timeline,
                    summary=summary,
                )
        except Exception as e:
            print(f"[Supabase] Error saving story: {e}")

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Prompt logging ──────────────────────────────────────────────────────

def _write_prompt_logs(
    characters_agents: Dict[str, CharacterAgent],
    director: DirectorAgent,
):
    """Collect logs from all agents and write to prompts_log.json."""
    all_logs = []

    # Director logs
    for entry in director.logs:
        all_logs.append({
            "timestamp": entry["timestamp"],
            "agent": entry["agent"],
            "prompt": entry["prompt"],
            "response": entry["response"],
            "role": "Director",
        })

    # Character agent logs
    for name, agent in characters_agents.items():
        for entry in agent.logs:
            all_logs.append({
                "timestamp": entry["timestamp"],
                "agent": entry["agent"],
                "prompt": entry["prompt"],
                "response": entry["response"],
                "role": f"Character ({name})",
            })

    # Sort by timestamp
    all_logs.sort(key=lambda x: x["timestamp"])

    log_path = project_root / "prompts_log.json"
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(all_logs, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n[LOG] Wrote {len(all_logs)} prompt logs to {log_path}")
    except Exception as e:
        print(f"[LOG ERROR] Failed to write prompt logs: {e}")


def _write_story_output(state: StoryState, seed_story: dict):
    """Write story_output.json with conclusion section."""
    actions = list(state.actions_taken)
    distinct = len(set(actions))

    # Serialize character memories for output
    memories_output = {}
    for name, mem in state.character_memories.items():
        if isinstance(mem, CharacterMemory):
            memories_output[name] = mem.model_dump()
        else:
            memories_output[name] = mem

    output_data = {
        "title": seed_story.get("title"),
        "seed_story": seed_story,
        "events": state.events,
        "conclusion": {
            "reason": state.conclusion_reason or "Story concluded",
            "final_turn": state.current_turn,
            "actions_completed": distinct,
            "world_state": dict(state.world_state or {}),
        },
        "metadata": {
            "total_turns": state.current_turn,
            "conclusion_reason": state.conclusion_reason,
            "distinct_actions": distinct,
            "actions_taken": actions,
            "world_state": dict(state.world_state or {}),
            "emotion_history": state.emotion_history,
            "character_memories": memories_output,
        },
    }

    output_path = project_root / "story_output.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False, default=str)
        print(f"[OUTPUT] Story saved to {output_path}")
    except Exception as e:
        print(f"[OUTPUT ERROR] Failed to write story output: {e}")


def _write_prompts_jsonl(
    characters_agents: Dict[str, CharacterAgent],
    director: DirectorAgent,
):
    """Write prompts.jsonl — one JSON object per line for each LLM interaction."""
    all_logs = []

    for entry in director.logs:
        all_logs.append({
            "timestamp": entry["timestamp"],
            "agent": entry["agent"],
            "prompt": entry["prompt"],
            "response": entry["response"],
        })

    for name, agent in characters_agents.items():
        for entry in agent.logs:
            all_logs.append({
                "timestamp": entry["timestamp"],
                "agent": entry["agent"],
                "prompt": entry["prompt"],
                "response": entry["response"],
            })

    all_logs.sort(key=lambda x: x["timestamp"])

    jsonl_path = project_root / "prompts.jsonl"
    try:
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for log_entry in all_logs:
                f.write(json.dumps(log_entry, ensure_ascii=False, default=str) + "\n")
        print(f"[LOG] Wrote {len(all_logs)} entries to {jsonl_path}")
    except Exception as e:
        print(f"[LOG ERROR] Failed to write prompts.jsonl: {e}")


# ── Health check ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── History endpoints ──────────────────────────────────────────────────

@app.get("/api/history")
async def get_history():
    """List all past story runs (summaries only)."""
    runs = await list_story_runs(limit=50)
    return {"runs": runs}


@app.get("/api/history/{run_id}")
async def get_history_item(run_id: str):
    """Get a single story run with full timeline data."""
    run = await get_story_run(run_id)
    if not run:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Story run not found"})
    return run


@app.delete("/api/history/{run_id}")
async def delete_history_item(run_id: str):
    """Delete a story run."""
    success = await delete_story_run(run_id)
    if not success:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Failed to delete"})
    return {"status": "deleted"}
