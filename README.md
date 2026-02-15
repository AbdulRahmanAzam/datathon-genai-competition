# Multi-Agent Narrative System — Hackfest x Datathon 2026

A **Multi-Agent Narrative System** where autonomous characters navigate conflict through dialogue and physical actions, orchestrated by a Director agent using **LangGraph**.

## Quick Start

```bash
cd backend
pip install -r requirements.txt
```

Create `.env` in `backend/`:
```ini
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

Run the simulation:
```bash
cd backend
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

Run the website:
```bash
npm install
npm run dev
```

**Outputs generated:**
- `backend/story_output.json` — Narrative trace
- `backend/prompts_log.json` — LLM interaction logs

---

## Features Implemented

| Feature | Description |
|---------|-------------|
| **Structured Character Memory** | Per-character memory with knowledge, inventory, emotional state, and perceptions of others |
| **Information Asymmetry** | Characters only receive memories for events they witnessed; departed characters miss subsequent events |
| **Action System** | 10 distinct non-verbal actions (INVESTIGATE, CONFRONT, NEGOTIATE, etc.) with preconditions |
| **Reasoning Layer** | Characters reason through observation → emotion → goal → decision before acting |
| **3-Act Story Arc** | Director plans SETUP → CONFLICT → CLIMAX → RESOLUTION pacing |
| **World State** | Dynamic state updates from actions (evidence found, payment made, etc.) |
| **Emotion Tracking** | Per-character emotion evolution tracked across turns |
| **Character Goals & Inventory** | Characters have explicit goals, inventory items, and relationship maps |

---

## Architecture

```
┌─────────────────┐
│  Director Agent │ ──→ Plans story arc, selects speakers, writes narration
└────────┬────────┘
         ▼
┌─────────────────┐
│ Character Agent │ ──→ Reasons, decides TALK or ACT, generates response
└────────┬────────┘
         ▼
┌─────────────────┐
│  Action System  │ ──→ Validates preconditions, executes actions, updates world state
└────────┬────────┘
         ▼
┌─────────────────┐
│  Memory Update  │ ──→ Updates per-character memories
└────────┬────────┘
         ▼
┌─────────────────┐
│Check Conclusion │ ──→ Ends on max turns or resolution signal
└─────────────────┘
```

**Graph Flow:**
```
director_select → character_reason → process_action → memory_update → check_conclusion → (conclude | loop)
```

---

## Output Files

### 1. Narration Output (`story_output.json`)

```json
{
  "title": "The Rickshaw Accident",
  "seed_story": { "title": "...", "description": "..." },
  "events": [
    { "type": "narration", "content": "...", "turn": 0 },
    { "type": "dialogue", "speaker": "Saleem", "content": "...", "turn": 1 },
    { "type": "action", "content": "...", "speaker": "Constable Raza", "turn": 3, "metadata": { "action": { "type": "CONFRONT", "actor": "Constable Raza" } } }
  ],
  "conclusion": {
    "reason": "Story reached natural resolution",
    "final_turn": 25,
    "actions_completed": 8,
    "world_state": { "confrontation_occurred": true, "payment_made": true }
  },
  "metadata": {
    "total_turns": 25,
    "conclusion_reason": "Story reached natural resolution",
    "distinct_actions": 8,
    "actions_taken": ["CONFRONT", "EXIT_SCENE", "INTERVENE", "..."],
    "world_state": { "confrontation_occurred": true, "payment_made": true },
    "emotion_history": [
      { "turn": 1, "character": "Saleem", "emotion": "panicked" },
      { "turn": 2, "character": "Ahmed Malik", "emotion": "impatient" }
    ]
  }
}
```

### 2. Prompts Log (`prompts_log.json`)

```json
[
  {
    "timestamp": "2026-02-15T10:26:40.949472",
    "agent": "Director",
    "prompt": "You are a FILM DIRECTOR planning...",
    "response": "{ \"arc_plan\": [...], \"planned_actions\": [...] }",
    "role": "Director"
  },
  {
    "timestamp": "2026-02-15T10:26:49.059751",
    "agent": "Saleem",
    "prompt": "You are Saleem in \"The Rickshaw Accident\"...",
    "response": "{ \"observation\": \"...\", \"reasoning\": \"...\", \"mode\": \"ACT\", ... }",
    "role": "Character (Saleem)"
  }
]
```

---

## Project Structure

```
backend/
├── src/
│   ├── main.py              # Entry point
│   ├── config.py            # Model & turn configuration
│   ├── schemas.py           # Pydantic state models
│   ├── action_system.py     # Generic action definitions & execution
│   ├── story_state.py       # State manager with memory
│   ├── agents/
│   │   ├── director_agent.py
│   │   └── character_agent.py
│   ├── graph/
│   │   └── narrative_graph.py  # LangGraph workflow
│   └── prompts/
│       ├── director_prompts.py
│       └── character_prompts.py
├── examples/
│   └── rickshaw_accident/
│       ├── seed_story.json
│       └── character_configs.json
├── story_output.json        # Generated narrative
└── prompts_log.json         # LLM interaction logs
```

---

## Action System

10 generic actions that work across any narrative:

| Action | Description | World State Key |
|--------|-------------|-----------------|
| INVESTIGATE | Examine/inspect something | `investigation_done` |
| CONFRONT | Physically confront someone | `confrontation_occurred` |
| NEGOTIATE | Propose terms/compromise | `negotiation_proposed` |
| ACCEPT_TERMS | Accept a proposed deal | `terms_accepted` |
| INTERVENE | Mediate/de-escalate conflict | `intervention_made` |
| PRESENT_EVIDENCE | Show proof/reveal information | `evidence_presented` |
| SUMMON_HELP | Call for authority/reinforcement | `help_summoned` |
| MAKE_PAYMENT | Exchange money/compensation | `payment_made` |
| TAKE_DECISIVE_ACTION | Bold, story-changing action | `decisive_action_taken` |
| EXIT_SCENE | Leave the current scene | `{actor}_departed` |

Actions have **preconditions** (e.g., `ACCEPT_TERMS` requires `negotiation_proposed: true`) and **max-use limits**.

---

## Configuration

Edit `backend/src/config.py`:

```python
@dataclass
class StoryConfig:
    model_name: str = "llama-3.3-70b-versatile"
    temperature: float = 0.8
    max_turns: int = 25
    min_turns: int = 10
    min_actions: int = 5
    memory_buffer_size: int = 8
```

Override via environment:
```bash
MAX_TURNS=30 python -m src.main
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **LangGraph state machine** | Clean separation of director/character/action nodes |
| **Generic action catalogue** | Story-agnostic actions work with any seed |
| **Structured character memory** | Per-character knowledge, inventory, emotional state, and perceptions |
| **Information asymmetry** | Only present characters witness events; departed characters miss updates |
| **Structured JSON prompts** | Reliable parsing, full audit trail |
| **Resolution signals** | Actions like `ACCEPT_TERMS`, `MAKE_PAYMENT` trigger conclusion |
| **Multi-provider LLM** | Gemini primary + Groq fallback with automatic key rotation |

---

## Team

- **Abdul Rahman Azam**
- **Layyana Junaid**
- **Mufeez Hanif**

---

## License

MIT
