"""
FastAPI server – streams multi-agent narrative generation turn-by-turn.

Endpoints:
  POST /api/generate  – accepts seed story + characters, streams SSE events
"""

import asyncio
import json
import sys
import os
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
from src.schemas import StoryState, CharacterProfile, DialogueTurn
from src.agents.character_agent import CharacterAgent
from src.agents.director_agent import DirectorAgent
from src.action_system import ActionSystem

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


CORE_ACTIONS = {
    "CALL_POLICE", "RECORD_VIDEO", "MOVE_VEHICLE_ASIDE",
    "REQUEST_DOCUMENTS", "CHECK_DAMAGE", "PROPOSE_SETTLEMENT",
    "PAY_FACILITATION_FEE", "ISSUE_CHALLAN", "EXCHANGE_CONTACTS",
}


def _pick_suggested_action(state: StoryState, action_system: ActionSystem):
    used = set(state.actions_taken)
    missing = CORE_ACTIONS - used
    allowed = set(action_system.get_allowed_actions(state))
    candidates = missing & allowed
    if not candidates:
        return None
    preferred = []
    if not state.police_present:
        preferred.append("CALL_POLICE")
    preferred.append("EXCHANGE_CONTACTS")
    if state.police_present:
        preferred.extend(["ISSUE_CHALLAN", "PAY_FACILITATION_FEE"])
    preferred.extend(["RECORD_VIDEO", "MOVE_VEHICLE_ASIDE",
                      "PROPOSE_SETTLEMENT", "REQUEST_DOCUMENTS",
                      "CHECK_DAMAGE"])
    for p in preferred:
        if p in candidates:
            return p
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
            c.name: CharacterProfile(name=c.name, description=c.description)
            for c in req.characters
        }
        memories: Dict[str, List[str]] = {c.name: [] for c in req.characters}

        state = StoryState(
            seed_story=seed_story,
            character_profiles=char_profiles,
            character_memories=memories,
        )

        # Send init event
        yield _sse("init", {
            "title": req.title,
            "characters": [c.model_dump() for c in req.characters],
            "maxTurns": config.max_turns,
        })

        # ── Main loop ──────────────────────────────────────────────────
        while not state.is_concluded and state.current_turn < config.max_turns:
            turn_num = state.current_turn

            # ── 1) Director Select ─────────────────────────────────────
            yield _sse("step", {"phase": "director_select", "turn": turn_num})

            # Hard stop
            if turn_num >= config.max_turns:
                narration = "The scene finally winds down as the parties reach an uneasy resolution."
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

            actions_needed = config.min_actions - distinct_actions
            if actions_needed > 0 and remaining <= actions_needed + 1:
                force_act = True
            if state.turns_since_state_change >= 2:
                force_act = True
            if turn_num >= 12 and distinct_actions < 3:
                force_act = True
            if turn_num >= 18 and distinct_actions < config.min_actions:
                force_act = True

            if force_act and distinct_actions < config.min_actions:
                suggested_action = _pick_suggested_action(state, action_system)

            endgame = turn_num >= (config.max_turns - 3)

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
                "worldState": {
                    "tension": state.tension_level,
                    "police": state.police_present,
                    "laneBlocked": state.lane_blocked,
                    "crowd": state.crowd_size,
                    "traffic": state.traffic_level,
                },
            })

            # ── 2) Character Reason ────────────────────────────────────
            yield _sse("step", {"phase": "character_reason", "turn": turn_num})

            character = characters_agents.get(next_speaker) or list(characters_agents.values())[0]
            allowed_actions = action_system.get_allowed_actions(state)
            if suggested_action and suggested_action in allowed_actions:
                allowed_actions = [suggested_action]

            char_memories = state.character_memories.get(next_speaker, [])

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

            # ── 3) Process Action ──────────────────────────────────────
            yield _sse("step", {"phase": "process_action", "turn": turn_num})

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
                        "type": "narration", "content": act_narration,
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

            # ── 4) Memory Update ───────────────────────────────────────
            yield _sse("step", {"phase": "memory_update", "turn": state.current_turn})

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

                for name in characters_agents:
                    state.character_memories.setdefault(name, [])
                    state.character_memories[name].append(memory_line)
                    state.character_memories[name] = state.character_memories[name][-config.memory_buffer_size:]

                if action_meta:
                    fact_parts = [f"[FACT] {action_meta['type']} executed"]
                    if state.police_present:
                        fact_parts.append("police are present")
                    if not state.lane_blocked:
                        fact_parts.append("lane is clear")
                    if state.evidence:
                        fact_parts.append(f"evidence: {list(state.evidence.keys())}")
                    if state.settlement_offer:
                        fact_parts.append(f"settlement offered: {state.settlement_offer}")

                    global_fact = " | ".join(fact_parts)
                    for name in characters_agents:
                        state.character_memories[name].append(global_fact)
                        state.character_memories[name] = state.character_memories[name][-config.memory_buffer_size:]

            # Collect memory for next_speaker
            mem_snapshot = state.character_memories.get(next_speaker, [])[-3:]
            yield _sse("memory_result", {
                "turn": state.current_turn,
                "speaker": next_speaker,
                "recentMemories": mem_snapshot,
            })

            # ── 5) Check Conclusion ────────────────────────────────────
            yield _sse("step", {"phase": "check_conclusion", "turn": state.current_turn})

            should_conclude = False
            conclusion_reason = None

            if state.current_turn >= config.max_turns:
                should_conclude = True
                conclusion_reason = "Maximum turns reached"
            elif state.current_turn < config.min_turns:
                should_conclude = False
            elif len(set(state.actions_taken)) < config.min_actions and state.current_turn < config.max_turns:
                should_conclude = False
            else:
                should_conclude, conclusion_reason = await director.check_conclusion(state)

            yield _sse("conclusion_check", {
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
                yield _sse("concluded", {
                    "turn": state.current_turn,
                    "reason": state.conclusion_reason,
                    "totalActions": len(set(state.actions_taken)),
                    "actionsTaken": list(set(state.actions_taken)),
                })
                break

            await asyncio.sleep(0.05)  # small yield

        # Final summary
        if not state.is_concluded:
            state.is_concluded = True
            state.conclusion_reason = state.conclusion_reason or "Maximum turns reached"
            yield _sse("step", {"phase": "conclude_story", "turn": state.current_turn})
            yield _sse("concluded", {
                "turn": state.current_turn,
                "reason": state.conclusion_reason,
                "totalActions": len(set(state.actions_taken)),
                "actionsTaken": list(set(state.actions_taken)),
            })

        yield _sse("done", {"events": state.events})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Health check ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}
