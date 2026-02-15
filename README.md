# NarrativeVerse — Multi-Agent Narrative System

> **GenAI_DSS Hackfest × Datathon Submission**

A multi-agent narrative engine where autonomous AI characters navigate a story world defined by a "Story Seed." Characters possess individual memory, emotional reasoning, and the ability to execute non-verbal physical actions — all orchestrated by an AI Director within a stateful graph loop.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Action System](#action-system)
5. [Character Memory & Information Asymmetry](#character-memory--information-asymmetry)
6. [Reasoning Layer](#reasoning-layer)
7. [Story Arc Planning](#story-arc-planning)
8. [Output Files](#output-files)
9. [Web Interface](#web-interface)
10. [API Reference](#api-reference)
11. [Project Structure](#project-structure)
12. [Configuration](#configuration)
13. [Design Decisions](#design-decisions)
14. [Extensions Beyond Base Design](#extensions-beyond-base-design)

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- At least one LLM API key (Gemini Free Tier or Groq Free Tier)

### 1. Clone & Setup Backend

```bash
git clone <repository-url>
cd datathon-genai-competition

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\Activate.ps1
# Activate (Linux/macOS)
source venv/bin/activate

# Install dependencies
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Create `backend/.env`:

```env
# LLM Provider (at least one required)
GEMINI_ENABLED=true
GEMINI_API_KEY_1=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

GROQ_ENABLED=true
GROQ_API_KEY_1=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Optional: Supabase for story history persistence
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

You can add up to 4 keys per provider (`GEMINI_API_KEY_1` through `GEMINI_API_KEY_4`) for automatic failover when free-tier rate limits are hit.

### 3. Run the Narrative (CLI Mode)

```bash
cd backend
python -m src.main
```

This reads the seed story from `backend/examples/rickshaw_accident/`, runs the full multi-agent simulation (up to 25 turns), and generates:
- `backend/story_output.json` — Complete narrative trace
- `backend/prompts_log.json` — Full LLM interaction audit log
- `backend/prompts.jsonl` — JSONL format of prompt logs

### 4. Run the API Server + Web UI

```bash
# Terminal 1: Start backend API
cd backend
uvicorn src.api:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start frontend
cd website
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to access the web interface with the Live Playground.

### 5. Setup Supabase (Optional — for story history)

```bash
cd backend
python setup_supabase.py
```

Follow the printed instructions to create the `story_runs` table, or run the SQL from `backend/migrations/001_create_story_runs.sql` in the Supabase SQL Editor.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      NarrativeVerse Engine                       │
│                                                                 │
│  ┌──────────────────── LangGraph State Machine ──────────────┐  │
│  │                                                           │  │
│  │  director_select ──► character_reason ──► process_action  │  │
│  │       ▲                                       │           │  │
│  │       │                                       ▼           │  │
│  │  check_conclusion ◄──────── memory_update                 │  │
│  │       │                                                   │  │
│  │       ▼                                                   │  │
│  │    conclude ──► END                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────┐    │
│  │  Director    │  │ Character Agents │  │  Action System   │    │
│  │  Agent       │  │ (per character)  │  │  (deterministic) │    │
│  └─────────────┘  └─────────────────┘  └──────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          Multi-API LLM Provider (Failover)              │    │
│  │    Gemini 2.5 Flash  ──►  Groq LLaMA 3.3 70B           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │                              │
    story_output.json              prompts_log.json
    prompts.jsonl
```

The system is built as a **LangGraph state machine** with 6 nodes forming a cyclic graph. Each turn executes the full pipeline:

1. **Director Select** — Picks the next speaker using hybrid rules + LLM, writes cinematic narration, enforces pacing
2. **Character Reason** — Selected character reasons about goals, emotions, and constraints, deciding TALK vs ACT
3. **Process Action** — Executes the character's decision: dialogue stored in history, or physical action validated and applied to world state
4. **Memory Update** — Updates per-character structured memory buffers with **information asymmetry** (only present characters witness events)
5. **Check Conclusion** — Deterministic checks (min turns, min actions, resolution signals) + LLM-assisted conclusion decision
6. **Conclude** — Generates cinematic ending narration via LLM

---

## Core Components

### Director Agent (`src/agents/director_agent.py`)

The orchestrator responsible for:

- **Story Arc Planning**: Before Turn 1, plans the entire narrative arc (Setup → Conflict → Climax → Resolution) with planned action beats and suggested speakers per turn
- **Speaker Selection**: Hybrid approach — deterministic rules prevent consecutive speaker repetition; LLM selects based on dramatic tension, phase requirements, and silent character tracking
- **Narrative Pacing**: Applies force-act mechanics when action count falls behind schedule (mid-game, late-game, endgame pressure)
- **Conclusion Generation**: Produces cinematic wrap-up narration when resolution conditions (world-state signals + action count) are met
- **JSON Repair**: If the LLM returns malformed JSON, a one-shot repair LLM call fixes it. If repair fails, deterministic fallback ensures the system never crashes

### Character Agents (`src/agents/character_agent.py`)

Each character is an independent agent with:

- **Personality-Driven Prompts**: Full character context injected every turn — description, goals, inventory, relationships, emotional state, recent events, world state
- **Observation → Reasoning → Decision Pipeline**: Structured JSON output with observation, reasoning, emotion, and TALK or ACT decision
- **Force-ACT Override**: When the system needs a physical action, TALK decisions are overridden to ACT with an unused action type
- **Invalid Action Mapping**: 40+ keyword mappings convert LLM-invented actions to valid catalogue entries (e.g., "EXAMINE" → "INVESTIGATE", "BRIBE" → "MAKE_PAYMENT")
- **Deterministic Fallback**: If all JSON parsing fails (including repair), a rule-based fallback produces a valid response so the system never stalls

### Base Agent (`src/agents/base_agent.py`)

Shared infrastructure for all agents:

- **Robust JSON Parser** (`safe_parse_json`): 3-strategy parser — direct parse, brace-depth extraction, trailing-comma fixing
- **LLM Provider Integration**: All agents share the failover LLM provider singleton
- **Prompt/Response Logging**: Every LLM interaction logged with timestamp, agent name, provider used, full prompt, and full response

### LLM Provider (`src/llm_provider.py`)

- Supports **Gemini** (primary) and **Groq** (fallback) with up to 4 API keys each
- **Automatic failover**: Rate-limited keys enter cooldown; auth/model errors permanently disable keys
- **Adaptive retry delay**: Parses `retry-after` from API error messages instead of hardcoded waits
- **Request throttling**: Minimum 4-second interval between requests to respect RPM limits
- **120-second timeout**: Hard timeout prevents infinite loops when all keys are rate-limited

---

## Action System

The Action System (`src/action_system.py`) provides **10 story-agnostic action types** that work with any narrative scenario:

| Action | Description | Max Uses | Precondition | World State Key |
|--------|-------------|----------|--------------|-----------------|
| `INVESTIGATE` | Examine or inspect something in the scene | 2 | — | `investigation_done` |
| `SUMMON_HELP` | Call for authority or reinforcement | 1 | — | `help_summoned` |
| `NEGOTIATE` | Propose terms or suggest a compromise | 2 | — | `negotiation_proposed` |
| `ACCEPT_TERMS` | Accept a proposed agreement | 1 | `negotiation_proposed = true` | `terms_accepted` |
| `CONFRONT` | Directly challenge or confront someone | 2 | — | `confrontation_occurred` |
| `PRESENT_EVIDENCE` | Show proof or reveal key information | 2 | — | `evidence_presented` |
| `INTERVENE` | Step in to mediate or de-escalate | 2 | — | `intervention_made` |
| `TAKE_DECISIVE_ACTION` | Bold, story-changing physical action | 2 | — | `decisive_action_taken` |
| `EXIT_SCENE` | Leave or depart from the scene | 1 | — | `{actor}_departed` |
| `MAKE_PAYMENT` | Exchange money or offer compensation | 2 | — | `payment_made` |

**Key design properties:**

- **Deterministic execution**: The LLM proposes actions with narration; the system validates preconditions, enforces max-use limits, and applies world-state updates fully deterministically — no LLM controls state mutation
- **Precondition chains**: `ACCEPT_TERMS` requires `NEGOTIATE` first, creating logical action sequences
- **Resolution signals**: 4 world-state keys (`terms_accepted`, `payment_made`, `decisive_action_taken`, `help_summoned`) signal narrative resolution, enabling story conclusion
- **Guaranteed action count**: Force-act mechanics at mid-game (50%), late-game (70%), and endgame (80%) ensure ≥5 distinct actions in 25 turns

---

## Character Memory & Information Asymmetry

Each character maintains a **structured memory buffer** (`CharacterMemory` in `src/schemas.py`):

```
CharacterMemory:
  ├── knowledge[]       — Facts learned (e.g., "I performed INVESTIGATE at turn 3")
  ├── inventory[]       — Items the character possesses
  ├── emotional_state   — Current emotion (updated each turn from reasoning output)
  ├── perceptions{}     — How they view other characters (key-value map)
  └── recent_events[]   — Rolling buffer of last 8 witnessed events
```

### Information Asymmetry

When a character performs `EXIT_SCENE`, they are marked as departed in `world_state`. After departure:

- **They stop receiving memory updates** for events they didn't witness
- Characters who remained have knowledge the departed character lacks
- If the departed character's perspective is later needed, they reason from incomplete information

This creates realistic knowledge gaps where characters genuinely don't know what happened in their absence — not simulated ignorance, but actual per-agent information isolation.

### Memory Injection

Every character prompt includes their full memory state: knowledge, inventory, emotional state, perceptions of others, and recent events. The memory buffer is capped at 8 entries (configurable) to stay within context limits while preserving the most recent and relevant information.

---

## Reasoning Layer

Every character turn follows a structured reasoning pipeline:

```json
{
  "observation": "What the character notices right now (1 sentence)",
  "reasoning": "Internal thought — weighing goals vs constraints (1-2 sentences)",
  "emotion": "Current dominant emotion (single word)",
  "mode": "TALK or ACT",
  "speech": "Dialogue if TALK — 2-4 sentences in character voice",
  "action": {
    "type": "ACTION_TYPE from allowed list",
    "target": null,
    "params": { "narration": "2-3 cinematic sentences describing the action" }
  }
}
```

The reasoning layer ensures:

1. **Goal-driven decisions**: Characters reference their goals when choosing between TALK and ACT
2. **Emotional continuity**: Emotion evolves across turns and is tracked in `emotion_history`
3. **Context awareness**: Characters react to recent events, world-state changes, and other characters' actions
4. **Phase-appropriate behavior**: Characters adapt to story phase — cautious in setup, aggressive in conflict, decisive in climax, reflective in resolution
5. **Anti-repetition**: System detects when a character repeats themselves (>50% word overlap) and warns the LLM

---

## Story Arc Planning

Before Turn 1, the Director plans the entire narrative arc by dividing the turn budget into 4 phases:

| Phase | Turns (for 25-turn story) | Purpose |
|-------|---------------------------|---------|
| **Setup** | 0–3 | Introduce characters, establish the conflict |
| **Conflict** | 4–13 | Escalate tension, drive confrontations and physical actions |
| **Climax** | 14–19 | Peak tension, decisive actions, breaking points |
| **Resolution** | 20–24 | Settlement, final words, closure |

The arc plan specifies:
- Which turns should have dialogue vs physical actions
- Suggested speaker for each beat
- Which action types to deploy for variety
- How the story should conclude

The plan is **advisory** — the LLM can deviate based on how the story unfolds, but deterministic pacing rules (force-act, endgame pressure, resolution signal requirement) ensure the plan's core constraints are met.

---

## Output Files

### `story_output.json` — Narrative Trace

```json
{
  "title": "The Rickshaw Accident",
  "seed_story": { "title": "...", "description": "..." },
  "events": [
    { "type": "narration", "content": "...", "turn": 0 },
    { "type": "dialogue", "speaker": "Saleem", "content": "...", "turn": 1 },
    { "type": "action", "speaker": "Constable Raza", "content": "...", "turn": 5,
      "metadata": { "action": { "type": "INVESTIGATE", "actor": "Constable Raza" } } }
  ],
  "conclusion": {
    "reason": "Cinematic conclusion narration...",
    "final_turn": 22,
    "actions_completed": 7,
    "world_state": { "investigation_done": true, "payment_made": true }
  },
  "metadata": {
    "total_turns": 22,
    "distinct_actions": 7,
    "actions_taken": ["INVESTIGATE", "CONFRONT", "NEGOTIATE", "..."],
    "emotion_history": [{ "turn": 1, "character": "Saleem", "emotion": "panicked" }],
    "character_memories": { "Saleem": { "knowledge": [...], "inventory": [...] } }
  }
}
```

### `prompts_log.json` — LLM Interaction Audit Log

```json
[
  {
    "timestamp": "2026-02-15T14:32:01",
    "agent": "Director",
    "prompt": "You are the DIRECTOR of...",
    "response": "{\"next_speaker\": \"Saleem\", ...}",
    "role": "Director"
  },
  {
    "timestamp": "2026-02-15T14:32:09",
    "agent": "Saleem",
    "prompt": "You are Saleem in \"The Rickshaw Accident\"...",
    "response": "{\"observation\": \"...\", \"mode\": \"ACT\", ...}",
    "role": "Character (Saleem)"
  }
]
```

### `prompts.jsonl` — JSONL Format

Same data as `prompts_log.json` but one JSON object per line for easy processing.

---

## Web Interface

The frontend (`website/`) is built with **React 19 + Vite + Tailwind CSS v4** and provides 5 pages:

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | 3D hero scene (Three.js constellation), feature overview, architecture diagram |
| **Features** | `/features` | Interactive deep-dive into Memory, Actions, Reasoning, Story Arc |
| **Showcase** | `/showcase` | Sample narrative walkthrough with JSON output viewer |
| **Live Playground** | `/live` | **Real-time story generation** with SSE streaming from the backend |
| **History** | `/history` | Browse and replay past story runs stored in Supabase |

### Live Playground

The Live Playground at `/live` allows custom story generation:

1. Enter a story title, description, and character definitions (or use defaults)
2. Click "Generate" — the backend streams SSE events in real-time
3. Watch the narrative unfold in **4 view modes**:
   - **Pipeline View**: Shows each system phase (Director → Reason → Action → Memory → Conclusion)
   - **Dialogue View**: Clean conversation transcript
   - **Movie Scene View**: Cinematic narration-focused display
   - **Agents View**: Per-character panel showing reasoning, emotion, and memory state

### Frontend Tech Stack

- **React 19** with React Router v7 for client-side routing
- **Three.js** (via React Three Fiber + Drei) for 3D agent constellation visualization
- **Framer Motion** for page transitions and scroll-triggered animations
- **Tailwind CSS v4** with custom dark/light theme toggle (persisted in localStorage)
- **Supabase JS Client** for fetching story history
- **React Syntax Highlighter** for JSON output display

---

## API Reference

### `POST /api/generate` — Stream Story Generation

Streams the full narrative generation via **Server-Sent Events (SSE)**.

**Request Body:**
```json
{
  "title": "The Rickshaw Accident",
  "description": "Late afternoon on Shahrah-e-Faisal...",
  "characters": [
    {
      "name": "Saleem",
      "description": "Poor rickshaw driver...",
      "goals": ["Get fair compensation"],
      "inventory": ["Damaged rickshaw"],
      "emotional_state": "Panicked",
      "relationships": { "Ahmed Malik": "Adversary" }
    }
  ],
  "max_turns": 25,
  "min_turns": 10,
  "min_actions": 5
}
```

**SSE Event Types:**

| Event | Description |
|-------|-------------|
| `init` | Story metadata and character list |
| `step` | Phase indicator (director_select, character_reason, etc.) |
| `director_result` | Next speaker, narration, force-act status, world state |
| `reasoning_result` | Character's observation, reasoning, emotion, mode |
| `action_result` | Dialogue text or action narration with type |
| `memory_result` | Updated memory snapshot for the active character |
| `conclusion_check` | Whether the story should end and why |
| `concluded` | Final summary with action counts |
| `done` | Complete event list |

### `GET /api/health` — System Health Check

Returns configured providers, API key count, and readiness status.

### `GET /api/history` — List Past Runs

Returns summaries of up to 50 past story runs from Supabase.

### `GET /api/history/{run_id}` — Get Full Run

Returns a single story run with complete events and timeline data.

### `DELETE /api/history/{run_id}` — Delete a Run

Removes a story run from the database.

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── main.py              # CLI entry point — runs simulation directly
│   │   ├── api.py               # FastAPI server with SSE streaming
│   │   ├── config.py            # StoryConfig dataclass (turns, tokens, temperature)
│   │   ├── schemas.py           # Pydantic models (StoryState, CharacterMemory, etc.)
│   │   ├── story_state.py       # State initialization helper
│   │   ├── action_system.py     # 10 deterministic action types with preconditions
│   │   ├── llm_provider.py      # Multi-API failover (Gemini + Groq, up to 8 keys)
│   │   ├── supabase_client.py   # Database CRUD for story persistence
│   │   ├── agents/
│   │   │   ├── base_agent.py       # Abstract agent: LLM calls, JSON parsing, logging
│   │   │   ├── director_agent.py   # Orchestrator: arc planning, speaker select, conclusion
│   │   │   └── character_agent.py  # Character: reasoning, TALK/ACT, action mapping
│   │   ├── graph/
│   │   │   └── narrative_graph.py  # LangGraph state machine (6 nodes, cyclic)
│   │   └── prompts/
│   │       ├── director_prompts.py    # 4 prompt templates for Director
│   │       └── character_prompts.py   # Character context pack builder
│   ├── examples/
│   │   └── rickshaw_accident/
│   │       ├── seed_story.json        # Story seed (Karachi traffic accident)
│   │       └── character_configs.json # 4 character definitions with goals & relationships
│   ├── migrations/
│   │   └── 001_create_story_runs.sql  # Supabase table schema
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── setup_supabase.py         # Database setup helper
├── website/                       # React 19 frontend
│   ├── src/
│   │   ├── pages/                 # 5 route pages (Home, Features, Showcase, Live, History)
│   │   ├── components/            # UI components (3D hero, features, showcase panels)
│   │   ├── context/               # ThemeContext (dark/light mode)
│   │   ├── data/                  # Static story data for showcase
│   │   └── lib/                   # Supabase client initialization
│   └── package.json
├── story_output.json              # Generated narrative output
├── prompts_log.json               # LLM interaction audit log
└── prompts.jsonl                  # JSONL format of prompt logs
```

---

## Configuration

Edit `backend/src/config.py`:

```python
@dataclass
class StoryConfig:
    model_name: str = "llama-3.3-70b-versatile"   # Default LLM model
    temperature: float = 0.8                       # Higher = more creative
    max_turns: int = 25                            # Maximum turn budget
    min_turns: int = 10                            # Minimum before conclusion allowed
    max_tokens_per_prompt: int = 800               # Max output tokens per LLM call
    max_context_length: int = 4000                 # Max input context length
    max_consecutive_same_character: int = 2         # Prevent speaker repetition
    min_actions: int = 5                           # Minimum distinct physical actions
    memory_buffer_size: int = 8                    # Recent events buffer per character
```

Override via environment variables:
```bash
MAX_TURNS=30 python -m src.main
STORY_NAME=rickshaw_accident python -m src.main
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **LangGraph state machine** | Provides compiled graph with conditional edges, automatic state propagation, and recursion limits. Each node has clear inputs/outputs — more robust than a raw while-loop because state updates are immutable (nodes return diffs, not mutations). |
| **Deterministic action execution** | The LLM decides *which* action and writes narration, but the system validates preconditions and applies world-state changes deterministically. This prevents the LLM from hallucinating impossible state transitions. |
| **Generic action catalogue** | 10 story-agnostic actions (INVESTIGATE, NEGOTIATE, etc.) work with *any* seed story — no story-specific action coding required. New stories just need a seed_story.json and character_configs.json. |
| **Structured character memory** | Per-character buffers with knowledge, inventory, emotional state, perceptions, and recent events. Injected into every prompt so characters reason from their own perspective. |
| **Information asymmetry** | Departed characters stop receiving memory updates. This creates authentic knowledge gaps — not simulated ignorance, but actual per-agent information isolation. |
| **Multi-provider LLM failover** | Free-tier APIs have strict rate limits. Automatic rotation across up to 8 keys (4 Gemini + 4 Groq) with adaptive cooldowns makes the system viable without paid credits. |
| **SSE streaming** | 25-turn simulation takes minutes. SSE shows each phase in real-time, making the system feel responsive. The frontend renders pipeline, dialogue, movie, and agent views from the same event stream. |
| **JSON repair pipeline** | LLMs sometimes return malformed JSON. A 3-strategy parser (direct, brace-extraction, comma-fix) handles most cases. If all fail, a one-shot LLM repair call fixes the response. If repair fails, deterministic fallback ensures zero crashes. |
| **Resolution signals** | 4 world-state flags track whether a meaningful resolution occurred. The Director cannot conclude the story until both sufficient actions and a resolution signal exist — preventing premature endings. |
| **Pydantic state models** | All state is defined as Pydantic models for type safety, serialization, and validation. StoryState, CharacterProfile, CharacterMemory, and DialogueTurn are all typed and serializable. |

---

## Extensions Beyond Base Design

Features implemented beyond the provided starter codebase:

| Extension | Description |
|-----------|-------------|
| **Multi-API LLM Failover** | Automatic rotation across Gemini + Groq with up to 8 API keys, adaptive retry delays, and permanent/temporary exhaustion tracking |
| **Information Asymmetry** | Characters who EXIT_SCENE stop receiving memory updates — authentic knowledge gaps |
| **Story Arc Pre-Planning** | Director plans the full narrative structure before Turn 1 |
| **Force-ACT Mechanics** | Deterministic pacing rules at mid/late/endgame ensure ≥5 distinct actions |
| **Resolution Signal System** | 4 world-state flags must be triggered before conclusion is allowed |
| **Precondition Chains** | Actions can require prior actions (ACCEPT_TERMS needs NEGOTIATE) |
| **Emotion History Tracking** | Per-character emotion recorded every turn for arc analysis |
| **JSON Repair Pipeline** | 3-strategy parser + LLM repair call + deterministic fallback — zero crashes |
| **Invalid Action Mapping** | 40+ keyword mappings convert LLM-invented actions to valid catalogue types |
| **Real-time Web UI** | SSE-streamed live playground with 4 view modes (Pipeline, Dialogue, Movie, Agents) |
| **Supabase Persistence** | Incremental story saving (per-turn) with full history replay in the web UI |
| **3D Visualization** | Three.js agent constellation with orbital rings and floating particles |
| **Anti-Repetition Detection** | Detects repeated character dialogue (>50% word overlap) and warns the LLM |
| **Cinematic Conclusion Generation** | LLM-generated wrap-up narration for every story — never ends abruptly |
| **Structured Memory Buffers** | 5-field memory per character (knowledge, inventory, emotion, perceptions, recent events) |
| **JSONL Output** | Additional prompts.jsonl output for easy log processing |

---

## Seed Story: The Rickshaw Accident

**Setting:** Late afternoon on Shahrah-e-Faisal near Karachi Airport. Rush hour traffic. Hot and humid. A rickshaw and a car have collided, both drivers blaming each other.

**Characters:**

| Character | Role | Emotional State | Key Goal |
|-----------|------|-----------------|----------|
| **Saleem** | Poor rickshaw driver, sole earner for family of 5 | Panicked, desperate | Get fair compensation for rickshaw damage |
| **Ahmed Malik** | Wealthy businessman, late for international flight | Stressed, impatient | Resolve quickly and catch his flight |
| **Constable Raza** | 15-year traffic police veteran, underpaid | Cynical, opportunistic | Clear traffic, extract facilitation fee |
| **Uncle Jameel** | Local shopkeeper, witnessed everything | Excited, nosy | Insert himself into the drama, mediate |

Each character has defined goals, inventory items, emotional state, and relationship maps that drive the narrative conflict toward resolution.

---

## Team

- **Abdul Rahman Azam**
- **Layyana Junaid**
- **Mufeez Hanif**

---

## License

MIT
