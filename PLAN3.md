# PLAN3.md — Comprehensive Gap Analysis & Implementation Plan

## Executive Summary

After deep-diving every file in the project, this plan identifies all remaining gaps between the current implementation and what the **problem statement + evaluation rubric** demand. Items are organized into prioritized phases.

### Current Estimated Score: ~70–75/100
### Target Score After Fixes: 90–95/100

---

## Gap Analysis: Requirements vs. Current State

### Evaluation Criteria Breakdown

| Criteria | Max | Current Est. | Gap |
|----------|-----|-------------|-----|
| GitHub Repo & Working System | 25 | 18 | Backend startup issues, dead code, README overstates features |
| JSON Files Compliance | 15 | 6 | All 3 output files from DIFFERENT runs, missing fields |
| Feature Implementation Beyond Base | 15 | 10 | Memory is shallow, no information asymmetry, no emotion tracking |
| Documentation & Report | 20 | 12 | No LaTeX report, README needs honesty pass, no website docs |
| Q/A Session | 15 | — | Depends on understanding (not code) |
| Story Narration Quality | 10 | 7 | Prompts are good, arc enforcement is weak |

---

## What's Currently Working ✅

- **Action System** — 10 deterministic actions with preconditions, max-use caps, world-state updates
- **Reasoning Layer** — Prompt-driven CoT: observe → feel → want → decide (TALK/ACT)
- **Director Agent** — Story arc planning, speaker selection, conclusion checking (all with 3-tier fallbacks)
- **Character Agent** — 3-tier resilience (parse → repair → deterministic fallback), fuzzy action mapping
- **LLM Provider** — Multi-key Gemini + Groq with failover, rate limit handling, cooldowns
- **API (FastAPI)** — SSE streaming endpoint, health, history CRUD, incremental Supabase saves
- **CLI Runner** — `main.py` runs stories end-to-end via `NarrativeGraph`
- **Website** — 5 pages (Home, Features, Showcase, Live, History), 4 view modes, 3D hero, dark/light theme
- **Supabase Integration** — Story runs persisted with incremental saves

---

## What's Missing or Broken ❌

### CRITICAL (Directly affects scoring)

| # | Issue | Rubric Impact | Location |
|---|-------|---------------|----------|
| C1 | **Output files from different runs** — `story_output.json` (25 turns), `prompts_log.json` (2 turns, failed), `prompts.jsonl` (old format, Feb 13) are all from separate runs | JSON Compliance (15 marks) | `backend/story_output.json`, `prompts_log.json`, `prompts.jsonl` |
| C2 | **Missing `conclusion` section** in `story_output.json` — PS requires a separate conclusion explaining why the story ended | JSON Compliance | `backend/story_output.json` |
| C3 | **Character Memory is just `List[str]`** — PS requires "track specific knowledge, current inventory, and evolving perceptions" | Feature Implementation (15 marks) | `backend/src/schemas.py` → `character_memories` |
| C4 | **No Information Asymmetry** — All characters get identical memory. Characters should only know what they witnessed | Feature Implementation | `backend/src/graph/narrative_graph.py` → `_memory_update_node` |
| C5 | **`character_configs.json` missing fields** — Only has `name` and `description`. Missing `goals`, `inventory`, `emotional_state`, `relationships` | JSON Compliance | `backend/examples/rickshaw_accident/character_configs.json` |
| C6 | **Backend startup failing** — Terminal history shows `exit code: 1` for `uvicorn` commands | Working System (25 marks) | Backend startup |
| C7 | **No Technical Report (PDF/LaTeX)** — Rubric explicitly requires "PDF (LaTeX) describing architecture and action logic" | Documentation (20 marks) | Missing entirely |
| C8 | **README overstates features** — Claims "Information Asymmetry" is implemented when it isn't | Documentation | `README.md` |

### HIGH (Meaningfully improves score)

| # | Issue | Rubric Impact | Location |
|---|-------|---------------|----------|
| H1 | **No Emotion Tracking** — Characters don't track emotional state evolution across turns | Feature Beyond Base | Missing from `schemas.py` |
| H2 | **No Relationship Matrix** — Characters don't track evolving perceptions of each other | Feature Beyond Base | Missing from `schemas.py` |
| H3 | **Story Arc weakly enforced** — Arc is planned but `current_phase` is never updated in state, phase boundaries inconsistent between modules | Narration Quality (10 marks) | `schemas.py`, `narrative_graph.py`, prompt files |
| H4 | **`CharacterProfile` too thin** — Pydantic model only has `name` + `description`, no goals/inventory | Feature Beyond Base | `backend/src/schemas.py` |
| H5 | **Duplicate loop logic** — `api.py` reimplements the narrative loop inline instead of reusing `NarrativeGraph` | Working System, maintainability | `backend/src/api.py` vs `narrative_graph.py` |
| H6 | **Dead code** — `_clean_json_response`, `should_end_story()`, `current_phase`, `max_context_length`, unused `config.js`, unused `supabase.js` in frontend | Code Quality | Multiple files |

### MEDIUM (Polish & robustness)

| # | Issue | Rubric Impact | Location |
|---|-------|---------------|----------|
| M1 | **Duplicate components** — LivePage.jsx and HistoryPage.jsx duplicate ~400 lines of card components | Code Quality | `website/src/pages/` |
| M2 | **`character_prompts.py` has duplicate trailing code** — Copy-paste artifact after the f-string | Code Quality | `backend/src/prompts/character_prompts.py` |
| M3 | **Supabase async functions are synchronous** — `async def` wrappers around sync SDK calls block the event loop | Robustness | `backend/src/supabase_client.py` |
| M4 | **Phase boundary inconsistency** — `director_agent.py` uses 20%/70% thresholds vs `character_prompts.py`/`director_prompts.py` using 15%/55%/80% | Narration Quality | Multiple prompt files |
| M5 | **Footer placeholder links** — GitHub URL points to `https://github.com`, email is `team@narrativeverse.dev` | Polish | `website/src/components/home/Footer.jsx` |
| M6 | **`config.js` unused** — API endpoints hardcoded in LivePage/HistoryPage instead of using config | Code Quality | `website/src/config.js` |
| M7 | **No `.env.example`** — Users need to know which env vars to set | Documentation | Missing |
| M8 | **`pyproject.toml` inconsistent** with `requirements.txt` — missing deps, version mismatches | Working System | `backend/pyproject.toml` |

---

## Implementation Phases

---

### Phase 1: Fix Critical JSON & Output Compliance (JSON Compliance — 15 marks)

**Goal:** All output files match the problem statement format and are from the SAME run.

#### 1.1 — Enhance `story_output.json` format
**File:** `backend/src/api.py` + `backend/src/graph/narrative_graph.py` + `backend/src/main.py`

- Add a top-level `"conclusion"` object to the output with fields: `reason`, `final_narration`, `story_summary`
- Add `"type": "action"` as a distinct event type (currently actions are logged as `"narration"`)
- Ensure events have consistent fields: `type` ("dialogue" | "narration" | "action"), `speaker`, `content`, `turn`
- Add enhanced metadata: `emotion_history`, `relationship_changes`, `story_arc_phases`

**Changes needed in `api.py`:**
```python
# In the final save section, add conclusion object:
"conclusion": {
    "reason": conclusion_reason,
    "final_narration": final_narration_text,
    "turn_count": current_turn,
    "actions_taken": len(actions_taken),
    "world_state": dict(state.world_state)
}
```

**Changes needed in `main.py`:**
- Mirror the same output format changes for CLI runs

#### 1.2 — Enhance `character_configs.json`
**File:** `backend/examples/rickshaw_accident/character_configs.json`

Add required fields per character:
```json
{
    "name": "Saleem",
    "description": "Poor rickshaw driver...",
    "goals": ["Get fair compensation for damages", "Protect his livelihood"],
    "inventory": ["Damaged rickshaw", "Old phone", "Daily earnings"],
    "emotional_state": "Panicked and desperate",
    "relationships": {
        "Ahmed Malik": "Adversary - wealthy car owner who caused the accident",
        "Constable Raza": "Authority figure - hopes for fair judgment",
        "Uncle Jameel": "Potential ally - trusted community elder"
    }
}
```

#### 1.3 — Update `CharacterProfile` Pydantic model
**File:** `backend/src/schemas.py`

```python
class CharacterProfile(BaseModel):
    name: str
    description: str
    goals: List[str] = []
    inventory: List[str] = []
    emotional_state: str = "neutral"
    relationships: Dict[str, str] = {}
```

#### 1.4 — Regenerate all output files from one successful run
After implementing all changes, run the system once and ensure:
- `story_output.json` — Full 25-turn narrative with conclusion section
- `prompts_log.json` — Complete LLM interaction log from the same run
- `prompts.jsonl` — Same interactions in JSONL format from the same run

---

### Phase 2: Structured Character Memory (Feature Implementation — 15 marks)

**Goal:** Replace `List[str]` memory with structured memory that tracks knowledge, inventory, perceptions.

#### 2.1 — Create `CharacterMemory` Pydantic model
**File:** `backend/src/schemas.py`

```python
class CharacterMemory(BaseModel):
    """Structured memory buffer for a character"""
    knowledge: List[str] = []          # Facts the character has learned
    inventory: List[str] = []          # Items the character currently has
    emotional_state: str = "neutral"   # Current emotional state
    perceptions: Dict[str, str] = {}   # Evolving perceptions of other characters
    recent_events: List[str] = []      # Short-term event buffer (capped)
```

#### 2.2 — Update `StoryState` to use structured memory
**File:** `backend/src/schemas.py`

Change `character_memories: Dict[str, List[str]]` → `character_memories: Dict[str, CharacterMemory]`

#### 2.3 — Implement Information Asymmetry
**File:** `backend/src/graph/narrative_graph.py` → `_memory_update_node`

Currently ALL characters get the same memory entry. Fix:
- Only the **active character** and **characters present in the scene** should receive the memory
- Characters who `EXIT_SCENE` should NOT receive subsequent memories
- Track character presence in world_state (e.g., `character_X_present: True/False`)

#### 2.4 — Update memory in `_memory_update_node`
- Parse the event to extract knowledge facts
- Update the active character's emotional state from their reasoning output
- Update perceptions based on interactions
- Respect `memory_buffer_size` cap on `recent_events` only (knowledge and perceptions grow unbounded)

#### 2.5 — Update `character_prompts.py` to use structured memory
- Display knowledge as "What you know:" section
- Display inventory as "What you have:" section
- Display emotional state prominently
- Display perceptions as "How you see others:" section
- Display recent events as short-term context

#### 2.6 — Wire up initial character state from `character_configs.json`
- Load `goals`, `inventory`, `emotional_state`, `relationships` from config
- Initialize `CharacterMemory` with these values at story start

---

### Phase 3: Emotion & Relationship Tracking (Feature Beyond Base)

**Goal:** Track how characters' emotions and relationships evolve across the story.

#### 3.1 — Add emotion tracking to character reasoning output
**File:** `backend/src/agents/character_agent.py`

The character response JSON already includes an `emotion` field. Use it:
- After each character turn, update `CharacterMemory.emotional_state` from the response
- Store emotion history in state for output metadata

#### 3.2 — Add relationship evolution
**File:** `backend/src/agents/character_agent.py` + `backend/src/schemas.py`

- Add `relationship_updates` as an optional field in character response JSON
- After each turn, update `CharacterMemory.perceptions` with any relationship changes
- Example: After a CONFRONT action, the confronted character's perception should shift

#### 3.3 — Add tracking fields to `StoryState`
**File:** `backend/src/schemas.py`

```python
class StoryState(BaseModel):
    # ... existing fields ...
    emotion_history: List[Dict[str, str]] = []      # [{turn: 1, character: "Saleem", emotion: "angry"}]
    relationship_changes: List[Dict[str, str]] = []  # [{turn: 3, from: "Saleem", to: "Ahmed", change: "hostile"}]
```

#### 3.4 — Include in output files
- Add `emotion_history` and `relationship_changes` to `story_output.json` metadata
- These demonstrate "meaningful extensions beyond the starter kit"

---

### Phase 4: Story Arc Enforcement & Narration Quality (Narration Quality — 10 marks)

**Goal:** Make the 3-act structure actually drive behavior, not just decorate prompts.

#### 4.1 — Fix phase boundary inconsistency
**Files:** `backend/src/agents/director_agent.py`, `backend/src/prompts/character_prompts.py`, `backend/src/prompts/director_prompts.py`

Unify `_get_phase()` across ALL files to use consistent thresholds:
```
SETUP:      < 20% of turns
CONFLICT:   < 60% of turns
CLIMAX:     < 85% of turns
RESOLUTION: >= 85% of turns
```

#### 4.2 — Update `current_phase` in state
**File:** `backend/src/graph/narrative_graph.py`

Currently `StoryState.current_phase` is set once to "setup" and never updated. Fix:
- After each turn, compute and update `state.current_phase` based on turn progress
- This ensures all components read the same phase

#### 4.3 — Phase-driven action pressure
- SETUP phase: Actions should be exploratory (INVESTIGATE, SUMMON_HELP)
- CONFLICT phase: Actions should escalate (CONFRONT, PRESENT_EVIDENCE)
- CLIMAX phase: Force decisive actions (TAKE_DECISIVE_ACTION, NEGOTIATE)
- RESOLUTION phase: Force resolution (ACCEPT_TERMS, MAKE_PAYMENT, EXIT_SCENE)

Add phase-appropriate action suggestions to the director's speaker selection logic.

#### 4.4 — Improve conclusion detection
**File:** `backend/src/graph/narrative_graph.py` → `_check_conclusion_node`

Current: Hard-coded checks (60% turns, min actions, resolution signals) before asking LLM.
Enhancement: Also check if the narrative has reached a natural ending point (all major conflicts resolved, key characters have achieved/failed their goals).

---

### Phase 5: Code Quality & Working System (GitHub Repo — 25 marks)

**Goal:** Ensure the system runs cleanly, code is organized, dead code removed.

#### 5.1 — Fix backend startup
- Diagnose and fix the `uvicorn` startup issue (terminal shows exit code 1)
- May be port conflicts, import errors, or missing env vars
- Ensure `cd backend && uvicorn src.api:app --host 0.0.0.0 --port 8000` works reliably

#### 5.2 — Remove dead code
| File | Dead Code | Action |
|------|-----------|--------|
| `backend/src/agents/base_agent.py` | `_clean_json_response()` | Remove |
| `backend/src/story_state.py` | `should_end_story()` (never called) | Remove or wire up |
| `backend/src/schemas.py` | `current_phase` (never updated) | Fix in Phase 4.2 |
| `backend/src/config.py` | `max_context_length` (never used) | Wire up or remove |
| `backend/src/prompts/character_prompts.py` | Duplicate trailing code block | Remove |
| `website/src/config.js` | Unused config | Wire into LivePage/HistoryPage |
| `website/src/lib/supabase.js` | Unused Supabase client | Remove or use |

#### 5.3 — Unify narrative loop
**Consider:** Refactoring `api.py` to use `NarrativeGraph` with SSE event hooks instead of reimplementing the entire loop inline. This eliminates the dual-code-path drift risk.

**Alternative (simpler):** Keep both paths but ensure they share the same helper functions for force_act logic, action picking, memory updates, etc. Extract shared logic into utility functions.

#### 5.4 — Fix async Supabase calls
**File:** `backend/src/supabase_client.py`

Wrap synchronous Supabase SDK calls with `asyncio.to_thread()`:
```python
async def create_story_run(...):
    return await asyncio.to_thread(_sync_create_story_run, ...)
```

#### 5.5 — Sync `pyproject.toml` with `requirements.txt`
- Add missing deps: `supabase`, `langchain-google-genai`
- Remove unused: `pydantic-settings` (if truly unused)
- Align version pins

#### 5.6 — Create `.env.example`
```env
GEMINI_API_KEY_1=your-gemini-key-here
GEMINI_API_KEY_2=optional-second-key
GROQ_API_KEY_1=your-groq-key-here
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
GEMINI_ENABLED=true
GROQ_ENABLED=true
```

---

### Phase 6: Documentation & Report (Documentation — 20 marks)

**Goal:** Accurate, comprehensive documentation that matches actual implementation.

#### 6.1 — Update `README.md`
- Remove "Information Asymmetry" claim (or implement it first in Phase 2.3)
- Add website section with setup instructions
- Add Supabase setup instructions
- Add environment variable documentation
- Add architecture diagram showing Director ↔ Character ↔ ActionSystem ↔ Memory flow
- Add screenshots of the web interface
- Clarify which features are extensions beyond the base design

#### 6.2 — Create Technical Report (LaTeX → PDF)
**File:** `report/report.tex` (new)

Required sections:
1. **Introduction** — Problem statement summary
2. **System Architecture** — Director, Character Agents, Action System, Memory System, LLM Provider
3. **Design Decisions** — Why Gemini + Groq fallback, why deterministic actions, why 3-tier fallback chains
4. **Feature Extensions** — What was added beyond the starter kit:
   - Structured character memory with information asymmetry
   - Emotion and relationship tracking
   - 10-action deterministic engine with preconditions
   - Multi-provider LLM with automatic failover
   - Real-time web interface with SSE streaming
   - Supabase persistence with incremental saves
   - 4 visualization modes (Pipeline, Dialogue, Movie Scene, Agents)
5. **Action System Logic** — How actions are validated, executed, and narrated
6. **Memory Architecture** — How knowledge, inventory, and perceptions are tracked
7. **Story Arc Management** — How the 3-act structure is enforced
8. **Results** — Sample output analysis
9. **Conclusion**

#### 6.3 — Add code comments where logic is non-obvious
- Focus on `narrative_graph.py` (the 5 force_act rules)
- Focus on `action_system.py` (precondition and resolution signal logic)
- Focus on `character_agent.py` (fuzzy action mapping)

---

### Phase 7: Final Polish & Validation

#### 7.1 — Extract shared components (Frontend)
- Extract `DirectorCard`, `ReasoningCard`, `EventCard`, `MemoryCard`, `ConclusionCheckCard`, `ConcludedCard` into shared components
- Import in both `LivePage.jsx` and `HistoryPage.jsx`

#### 7.2 — Fix frontend placeholder links
- Update Footer GitHub URL to actual repo
- Update email or remove

#### 7.3 — Use `config.js` in LivePage and HistoryPage
- Import API URLs from config instead of hardcoding `/api/...`

#### 7.4 — Run full end-to-end test
1. Start backend: `cd backend && uvicorn src.api:app --host 0.0.0.0 --port 8000`
2. Start frontend: `cd website && npm run dev`
3. Generate a full story via Live page
4. Verify all 25 turns complete
5. Verify ≥5 actions triggered
6. Verify `story_output.json` has correct format + conclusion
7. Verify `prompts_log.json` has all interactions from this run
8. Verify `prompts.jsonl` matches
9. Verify History page shows the run correctly
10. Verify all 4 view modes render properly

#### 7.5 — Generate final output files
- Run one clean story generation
- Copy the output files to ensure they're from the SAME run
- Verify JSON compliance against the problem statement schema

---

## Priority Order (What to Do First)

| Priority | Phase | Impact on Score | Effort |
|----------|-------|----------------|--------|
| 🔴 1st | Phase 1 (JSON Compliance) | +6-8 marks | Medium |
| 🔴 2nd | Phase 2 (Structured Memory) | +3-5 marks | Medium-High |
| 🔴 3rd | Phase 5.1 (Fix Backend Startup) | Critical — system must run | Low |
| 🟡 4th | Phase 6 (Documentation & Report) | +5-8 marks | Medium |
| 🟡 5th | Phase 3 (Emotion/Relationship) | +2-3 marks | Medium |
| 🟡 6th | Phase 4 (Arc Enforcement) | +1-3 marks | Low-Medium |
| 🟢 7th | Phase 5.2-5.6 (Code Quality) | +2-3 marks | Low |
| 🟢 8th | Phase 7 (Polish) | +1-2 marks | Low |

---

## Files That Need Changes (Complete List)

### Backend — Must Modify
| File | Changes Needed |
|------|---------------|
| `backend/src/schemas.py` | Add `CharacterMemory` model, enhance `CharacterProfile`, add emotion/relationship tracking fields to `StoryState`, add conclusion model |
| `backend/src/graph/narrative_graph.py` | Information asymmetry in `_memory_update_node`, update `current_phase`, phase-driven action suggestions |
| `backend/src/api.py` | Add conclusion section to output, wire structured memory, update event types to include "action" |
| `backend/src/main.py` | Mirror output format changes, wire structured memory |
| `backend/src/agents/character_agent.py` | Extract emotion from response, emit relationship updates |
| `backend/src/agents/base_agent.py` | Remove dead `_clean_json_response` |
| `backend/src/prompts/character_prompts.py` | Use structured memory in prompts, remove duplicate trailing code |
| `backend/src/prompts/director_prompts.py` | Unify phase thresholds |
| `backend/src/agents/director_agent.py` | Unify phase thresholds |
| `backend/src/action_system.py` | (Minor) Add phase-appropriate action metadata |
| `backend/src/story_state.py` | Remove or wire up `should_end_story()` |
| `backend/src/config.py` | Remove or wire up `max_context_length` |
| `backend/src/supabase_client.py` | Fix async wrappers with `asyncio.to_thread` |
| `backend/examples/rickshaw_accident/character_configs.json` | Add goals, inventory, emotional_state, relationships |
| `backend/requirements.txt` | (Minor) Remove unused `pydantic-settings` |
| `backend/pyproject.toml` | Sync with requirements.txt |

### Backend — Must Create
| File | Purpose |
|------|---------|
| `backend/.env.example` | Document required environment variables |

### Frontend — Must Modify
| File | Changes Needed |
|------|---------------|
| `website/src/pages/LivePage.jsx` | Import from config.js instead of hardcoded paths |
| `website/src/pages/HistoryPage.jsx` | Import from config.js, extract shared components |
| `website/src/components/home/Footer.jsx` | Fix placeholder links |

### Frontend — Consider Creating
| File | Purpose |
|------|---------|
| `website/src/components/shared/StoryCards.jsx` | Extract duplicated card components |

### Root — Must Modify
| File | Changes Needed |
|------|---------------|
| `README.md` | Accuracy pass, add website docs, add env var docs, add Supabase setup |

### Root — Must Create
| File | Purpose |
|------|---------|
| `report/report.tex` | Technical report (LaTeX → compile to PDF) |

### Must Regenerate
| File | Why |
|------|-----|
| `backend/story_output.json` | Currently from unknown run, missing conclusion section |
| `backend/prompts_log.json` | Currently from failed 2-turn run |
| `backend/prompts.jsonl` | Currently from old Feb 13 run with different format |

---

## Appendix: Problem Statement Checklist

| Requirement | Status | Phase to Fix |
|-------------|--------|-------------|
| Multi-Agent Narrative System | ✅ Done | — |
| Agents navigate world defined by Story Seed | ✅ Done | — |
| Agent Memory (knowledge, inventory, perceptions) | ❌ Partial — just `List[str]` | Phase 2 |
| Non-verbal Actions modifying Story State | ✅ Done (10 actions) | — |
| Context Length respected (`max_context_length`) | ❌ Config exists but never enforced | Phase 5.2 |
| Max Tokens Per Prompt respected | ✅ Done via config | — |
| Character Profiles (traits, goals, inventories) | ❌ Partial — missing goals/inventory | Phase 1.2-1.3 |
| Max 25 turns | ✅ Done | — |
| Temperature configurable | ✅ Done | — |
| Director: Turn-Taking | ✅ Done | — |
| Director: Narrative Pacing | ✅ Done (3-act arc) | Phase 4 enhances |
| Director: Context Management | ✅ Done | — |
| Character Memory buffers | ❌ Partial — not structured | Phase 2 |
| Action System with state updates | ✅ Done | — |
| Reasoning layer (think before talk/act) | ✅ Done | — |
| 25 turns max | ✅ Done | — |
| ≥5 distinct actions | ✅ Enforced (min_actions=5) | — |
| `story_output.json` with metadata, events, conclusion | ❌ Missing conclusion section | Phase 1.1 |
| `prompts_log.json` with timestamp, agent, prompt, response | ❌ From wrong run | Phase 1.4 |
| Technical Report (PDF/LaTeX) | ❌ Missing | Phase 6.2 |
| Clear README with setup instructions | ❌ Partial — overstates features | Phase 6.1 |
| Modular, commented code | ✅ Mostly done | Phase 5-6 polish |
| Open-source models / Free APIs | ✅ Gemini Free + Groq | — |
