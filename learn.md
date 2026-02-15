# Learn — How to Explain Everything to the Judges

This document teaches you **every technical concept** in your project so you can confidently answer any question a judge throws at you. Read this fully before judging day.

---

## Table of Contents

1. [The Big Picture — What You Built](#1-the-big-picture)
2. [What is a Multi-Agent System?](#2-what-is-a-multi-agent-system)
3. [LangGraph — Why and How](#3-langgraph--why-and-how)
4. [The 6-Node Pipeline — Every Step Explained](#4-the-6-node-pipeline)
5. [The Director Agent — How It Works](#5-the-director-agent)
6. [Character Agents — How They Think](#6-character-agents--how-they-think)
7. [The Action System — Why Deterministic?](#7-the-action-system--why-deterministic)
8. [Character Memory & Information Asymmetry](#8-character-memory--information-asymmetry)
9. [The Reasoning Layer — Observation → Reasoning → Decision](#9-the-reasoning-layer)
10. [Story Arc Planning](#10-story-arc-planning)
11. [LLM Provider & Multi-API Failover](#11-llm-provider--multi-api-failover)
12. [The FastAPI Backend & SSE Streaming](#12-the-fastapi-backend--sse-streaming)
13. [Pydantic — Why We Use It](#13-pydantic--why-we-use-it)
14. [JSON Repair Pipeline — Never Crash](#14-json-repair-pipeline)
15. [Force-ACT Mechanics — Guaranteeing Actions](#15-force-act-mechanics)
16. [Resolution Signals — Knowing When to End](#16-resolution-signals)
17. [The Frontend — React + Three.js + SSE](#17-the-frontend)
18. [Supabase — Database Persistence](#18-supabase--database-persistence)
19. [Output Files — What They Contain and Why](#19-output-files)
20. [Common Judge Questions & Answers](#20-common-judge-questions--answers)
21. [Key Words to Use When Speaking](#21-key-words-to-use-when-speaking)

---

## 1. The Big Picture

**What you built:** A system where multiple AI characters have a conversation and take physical actions inside a story, all managed by a "Director" AI. The story runs for up to 25 turns and produces a coherent narrative with a beginning, middle, and end.

**How to say it to judges:**

> "We built a multi-agent narrative system where autonomous AI characters navigate a story world. Each character has its own memory, goals, and emotions. A Director agent orchestrates the narrative — deciding who speaks, enforcing pacing, and ensuring the story reaches a satisfying conclusion. The entire system runs as a LangGraph state machine with 6 nodes."

---

## 2. What is a Multi-Agent System?

A **multi-agent system** means you have multiple independent AI "agents" that each make their own decisions. In your project:

- **Director Agent** = The orchestrator / narrator. Like a film director. It decides who should speak next, writes cinematic narration, and decides when the story should end.
- **Character Agents** = One agent per character (Saleem, Ahmed Malik, Constable Raza, Uncle Jameel). Each one reasons independently — observing the situation, thinking about their goals, and deciding whether to talk or act.

**Why not just one agent?** Because one LLM prompt can't simulate 4 different perspectives simultaneously. By giving each character their own agent with their own memory and goals, they behave more authentically — they don't know each other's private thoughts.

**How to say it:**

> "Each character is a separate agent instance. When it's Saleem's turn, the LLM only sees Saleem's perspective — his goals, his memory of recent events, his emotional state. He doesn't know what Ahmed privately thinks. This creates authentic multi-perspective storytelling."

---

## 3. LangGraph — Why and How

### What is LangGraph?

LangGraph is a library built on top of LangChain that lets you build **state machines** (graphs) for AI workflows. Instead of just calling an LLM in a loop, you define:

- **Nodes** = Functions that do something (e.g., "Director selects speaker", "Character reasons")
- **Edges** = Connections between nodes (after the Director selects, go to Character Reason)
- **Conditional edges** = "If the story should end, go to Conclude. Otherwise, loop back to Director."
- **State** = A shared data object (StoryState) that flows through the graph and gets updated at each node

### Why LangGraph instead of a simple while-loop?

1. **State immutability**: Each node returns a *diff* (what changed), not mutations. LangGraph merges the diff into the state. This prevents bugs where one node accidentally overwrites another's changes.
2. **Conditional routing**: The graph can branch — after `check_conclusion`, it either loops back to `director_select` or goes to `conclude`. This is natural in a graph, messy in a while-loop.
3. **Recursion limit**: LangGraph has a built-in `recursion_limit` (we set 200) that prevents infinite loops.
4. **Clean separation**: Each node is a self-contained function. Easy to test, debug, and explain.

### How to say it:

> "We use LangGraph because it provides a compiled state machine. Each turn of the story is a cycle through 6 nodes. The state — which includes dialogue history, character memories, world state, and action tracking — flows through the graph immutably. Each node returns only what changed, and LangGraph merges it. This is safer and more modular than a raw while-loop."

### Where is this in the code?

File: `backend/src/graph/narrative_graph.py`

- `_build_graph()` defines all 6 nodes and their edges
- `workflow = StateGraph(StoryState)` creates the graph with our Pydantic state model
- `workflow.add_conditional_edges()` handles branching (conclude vs continue)
- `self.graph = workflow.compile()` compiles it into an executable graph
- `self.graph.ainvoke()` runs the entire loop asynchronously

---

## 4. The 6-Node Pipeline

Every turn of the story goes through these 6 nodes in order:

```
director_select → character_reason → process_action → memory_update → check_conclusion → (conclude OR loop back)
```

### Node 1: `director_select`

**What:** The Director decides who should speak next and writes a cinematic narration line.

**How:**
1. Calculates pacing rules: Are we behind on actions? Is it endgame?
2. Sends a prompt to the LLM with the full story context, recent dialogue, phase guidance
3. LLM returns `{ "next_speaker": "Saleem", "narration": "The camera pans to..." }`
4. If the LLM response is broken, a JSON repair call attempts to fix it
5. If repair fails, deterministic fallback picks the next speaker using round-robin + arc plan

**Deterministic rules enforced:**
- No character can speak more than 2 turns in a row
- Silent characters are highlighted for the LLM to consider
- If actions are behind schedule, `force_act = true` is set

### Node 2: `character_reason`

**What:** The selected character observes the scene, reasons about their goals, and decides TALK or ACT.

**How:**
1. Build a massive prompt with: character description, goals, inventory, emotional state, relationships, recent dialogue, world state, allowed actions, memory buffer
2. LLM returns structured JSON: observation, reasoning, emotion, mode (TALK/ACT), speech or action
3. If `force_act` is true but the character chose TALK, the system overrides to ACT with an unused action
4. If the action type is invalid (LLM invented it), the 40+ keyword mapper converts it

### Node 3: `process_action`

**What:** Executes the character's decision.

- If **TALK**: Adds dialogue to history, increments turn counter
- If **ACT**: Validates preconditions (e.g., ACCEPT_TERMS requires NEGOTIATE first), updates world state, records action

**Key point:** The LLM writes the narration text, but the **world-state update is deterministic**. The system sets `world_state["payment_made"] = True` — the LLM can't hallucinate state changes.

### Node 4: `memory_update`

**What:** Updates each character's memory buffer.

**Information asymmetry logic:**
1. Check which characters are still present (not `_departed` in world_state)
2. Only present characters receive the new memory entry
3. If an action happened, all present characters learn the observable fact
4. The actor gets extra personal knowledge ("I performed INVESTIGATE at turn 3")
5. Speaker's emotional state is updated from their reasoning output

### Node 5: `check_conclusion`

**What:** Should the story end?

**Deterministic checks (no LLM needed):**
- Turn < 50% of max? → Don't end (too early)
- Distinct actions < minimum? → Don't end (need more actions)
- No resolution signal in world_state? → Don't end (no meaningful resolution yet)

**LLM check (only if all deterministic checks pass):**
- Ask the Director: "Should this scene conclude?"
- LLM returns `{ "should_end": true/false, "conclusion_narration": "..." }`

### Node 6: `conclude`

**What:** Generates the final cinematic ending narration via LLM. This is the "fade to black" moment.

---

## 5. The Director Agent

**File:** `backend/src/agents/director_agent.py`

The Director is like a **film director** — it doesn't act in the scene, but it controls:

### 1. Story Arc Planning (`plan_story_arc`)

Called **once** before Turn 1. The LLM plans the entire story:

- Divides turns into phases: Setup (0-15%), Conflict (15-55%), Climax (55-80%), Resolution (80-100%)
- Plans which turns should have actions vs dialogue
- Suggests which character should speak at each beat
- Plans which action types to use

**Why plan ahead?** Without a plan, the LLM tends to make all turns dialogue-heavy and never gets to a resolution. The plan gives structure.

### 2. Speaker Selection (`select_next_speaker`)

Uses hybrid rules + LLM:

- **Rule**: No character can speak 3+ times in a row (prevents monopolization)
- **Rule**: Silent characters are flagged for the LLM to consider
- **LLM**: Picks the most dramatically appropriate speaker based on current tension

### 3. Conclusion Check (`check_conclusion`)

Only called after deterministic guards pass (enough turns, enough actions, resolution signal present). The LLM decides if the narrative has reached a natural conclusion.

### 4. Final Conclusion (`generate_final_conclusion`)

Writes a cinematic wrap-up. Think of it as the narrator's closing monologue.

**How to say it:**

> "The Director has 4 responsibilities: planning the story arc before Turn 1, selecting the next speaker with hybrid rules, checking for natural conclusion points, and generating cinematic wrap-up narration. It never participates in the dialogue — it's the orchestrator."

---

## 6. Character Agents — How They Think

**File:** `backend/src/agents/character_agent.py`

### The Decision Pipeline

Every character turn:

1. **Build context prompt** — Inject everything the character knows: their profile, goals, inventory, relationships, emotional state, recent events, world state, allowed actions
2. **LLM generates structured JSON** — observation, reasoning, emotion, mode, speech/action
3. **Parse and validate** — Robust JSON parser handles markdown, brace extraction, trailing commas
4. **Force-ACT override** — If the system needs an action but the character chose TALK, override to ACT
5. **Action mapping** — If the LLM invented an action (e.g., "EXAMINE"), map it to a valid one ("INVESTIGATE")
6. **Fallback** — If everything fails, generate a safe deterministic response

### The Invalid Action Mapper

LLMs often invent their own action names. The mapper has 40+ keyword mappings:

```
EXAMINE → INVESTIGATE
CALL → SUMMON_HELP
BARGAIN → NEGOTIATE
AGREE → ACCEPT_TERMS
FIGHT → CONFRONT
SHOW → PRESENT_EVIDENCE
LEAVE → EXIT_SCENE
PAY → MAKE_PAYMENT
BRIBE → MAKE_PAYMENT
```

**How to say it:**

> "Characters follow an observe-reason-decide pipeline. The LLM outputs structured JSON with observation, reasoning, emotion, and a TALK or ACT decision. We validate every action against our allowed catalogue — if the LLM invents an action, our keyword mapper converts it to a valid type. If everything fails, we have a deterministic fallback."

---

## 7. The Action System — Why Deterministic?

**File:** `backend/src/action_system.py`

### The Problem

If you let the LLM update the story state, it will hallucinate. It might say "Saleem paid Ahmed" but never actually update the world state. Or it might say "the police arrived" when no one summoned them.

### The Solution: Split Responsibility

1. **LLM decides**: "I want to perform INVESTIGATE" and writes narration
2. **System validates**: Check preconditions (e.g., ACCEPT_TERMS requires negotiation_proposed = true), check max-use limits
3. **System updates state**: `world_state["investigation_done"] = True` — deterministically, no LLM involvement

### Why 10 Generic Actions?

These actions work with **any** story, not just the rickshaw accident:

- INVESTIGATE = examine something (works in mystery, crime, drama)
- NEGOTIATE = propose a deal (works in business, conflict, diplomacy)
- EXIT_SCENE = leave (works everywhere)

**How to say it:**

> "We split action execution into LLM-driven and system-driven parts. The LLM decides which action to take and writes narrative text, but the world-state update is fully deterministic. The system validates preconditions and max-use limits before applying the change. This prevents the LLM from hallucinating state transitions."

---

## 8. Character Memory & Information Asymmetry

**File:** `backend/src/schemas.py` (CharacterMemory model)

### What Each Character Remembers

```
CharacterMemory:
  knowledge[]       → "I performed INVESTIGATE at turn 3"
  inventory[]       → "Damaged rickshaw", "Old Nokia phone"
  emotional_state   → "panicked" (updated every turn)
  perceptions{}     → {"Ahmed Malik": "Adversary — wealthy car owner"}
  recent_events[]   → Last 8 events witnessed (rolling buffer)
```

### Information Asymmetry — The Key Innovation

When a character performs `EXIT_SCENE`:
1. `world_state["Ahmed Malik_departed"] = True`
2. From that point on, Ahmed Malik's memory **stops being updated**
3. He doesn't know about conversations or actions that happened after he left
4. If he somehow returns, he reasons from incomplete information

**This is real isolation, not fake.** We don't tell him to "pretend you don't know." He genuinely doesn't get the data.

### Memory Buffer

We cap recent_events at 8 entries. Why? LLM context windows are limited. We keep the most recent events because they're most relevant. Older events "fade" naturally.

**How to say it:**

> "Each character has a structured memory buffer with 5 fields: knowledge, inventory, emotional state, perceptions of others, and recent events. We implement information asymmetry — when a character exits the scene, they stop receiving memory updates. This isn't simulated ignorance; the data is genuinely not in their prompt. The memory buffer is capped at 8 recent events to stay within context limits."

---

## 9. The Reasoning Layer

### What the LLM Outputs

```json
{
  "observation": "The constable is examining the damage closely",
  "reasoning": "If he sees the dent was pre-existing, I might lose this argument. I need to present my evidence now.",
  "emotion": "anxious",
  "mode": "ACT",
  "speech": null,
  "action": {
    "type": "PRESENT_EVIDENCE",
    "params": { "narration": "Saleem reaches into his rickshaw..." }
  }
}
```

### Why Structured Reasoning?

Without it, the LLM just generates random dialogue. With structured reasoning:

1. **Observation** = Forces the character to notice something specific
2. **Reasoning** = Forces goal-oriented thinking ("What do I want? How do I get it?")
3. **Emotion** = Tracked across turns for emotional arc
4. **Mode decision** = Explicit choice between TALK and ACT
5. **Speech/Action** = The actual output

**How to say it:**

> "Every character turn follows an observation-reasoning-decision pipeline. The LLM first observes the scene, then reasons about goals versus constraints, outputs a dominant emotion, and explicitly decides between TALK and ACT. This structured approach produces more coherent and goal-driven behavior than free-form generation."

---

## 10. Story Arc Planning

### What Happens Before Turn 1

The Director sends a prompt to the LLM:

> "You are a FILM DIRECTOR planning a short dramatic film. Here's the scenario, here are the characters, you have 25 turns. Plan a complete dramatic arc."

The LLM returns:

```json
{
  "arc_plan": [
    { "turn": 0, "phase": "setup", "type": "narration", "beat": "Opening scene" },
    { "turn": 1, "phase": "setup", "type": "dialogue", "beat": "Saleem reacts", "suggested_speaker": "Saleem" },
    { "turn": 5, "phase": "conflict", "type": "action", "beat": "Constable investigates" }
  ],
  "planned_actions": ["CONFRONT", "INVESTIGATE", "NEGOTIATE", "MAKE_PAYMENT", "ACCEPT_TERMS"],
  "conclusion_type": "Payment resolves the dispute"
}
```

### How It's Used

The arc plan is **advisory** — the LLM can deviate. But:
- If the Director's speaker selection fails, the fallback uses the arc plan's `suggested_speaker`
- If the narration generation fails, the fallback uses the arc plan's `beat` text
- The deterministic pacing rules (force-act) enforce the plan's action requirements independently

**How to say it:**

> "Before Turn 1, the Director plans the complete 4-phase arc: Setup, Conflict, Climax, Resolution. It maps which turns should have actions, which characters should speak, and how the story should end. This plan is advisory — the system can deviate — but deterministic pacing rules independently enforce minimum action counts and resolution requirements."

---

## 11. LLM Provider & Multi-API Failover

**File:** `backend/src/llm_provider.py`

### The Problem

Free-tier API keys have rate limits:
- Gemini Free: ~15 requests/minute
- Groq Free: ~30 requests/minute

A 25-turn story makes ~75-100 LLM calls. One key is not enough.

### The Solution

We support up to **8 API keys** (4 Gemini + 4 Groq):

```env
GEMINI_API_KEY_1=key1
GEMINI_API_KEY_2=key2
GROQ_API_KEY_1=key3
GROQ_API_KEY_2=key4
```

**Failover logic:**
1. Try the current key
2. If rate limited (429 error): Parse the retry delay from the error message, put key on cooldown, try next key
3. If auth error (401/403): Permanently disable key, try next
4. If model error (404): Permanently disable key, try next
5. If all keys are on cooldown: Wait for the shortest cooldown, then retry
6. Hard timeout: 120 seconds max, then fail gracefully

### Priority

Gemini is tried first (higher quality for free tier), then Groq as fallback.

### Request Throttling

Minimum 4-second gap between requests to avoid hitting RPM limits even within a single key.

**How to say it:**

> "Free-tier APIs have strict rate limits, so we built a multi-API failover system. We support up to 8 API keys across Gemini and Groq. When a key is rate-limited, we parse the retry delay from the actual API error, put that key on cooldown, and immediately try the next key. Auth errors permanently disable a key. This lets us complete a full 25-turn simulation using only free-tier APIs."

---

## 12. The FastAPI Backend & SSE Streaming

**File:** `backend/src/api.py`

### What is FastAPI?

FastAPI is a Python web framework for building APIs. We use it to serve the backend as a REST API.

### What is SSE (Server-Sent Events)?

SSE is a protocol where the server pushes data to the client in real-time. Unlike WebSockets (bidirectional), SSE is one-way (server → client). Perfect for our use case — the client just watches the story unfold.

### How It Works

1. Client sends `POST /api/generate` with story config
2. Server starts generating the story turn by turn
3. After each phase (director_select, character_reason, etc.), the server sends an SSE event
4. The frontend receives each event and renders it immediately
5. When done, server sends a `done` event

### SSE Event Format

```
event: director_result
data: {"turn": 3, "nextSpeaker": "Saleem", "narration": "The camera pans...", "forceAct": false}

event: action_result
data: {"type": "dialogue", "speaker": "Saleem", "content": "Bhai, look at my rickshaw!", "emotion": "desperate"}
```

### Why SSE Instead of WebSockets?

- Simpler protocol — just HTTP with `text/event-stream` content type
- One-way is all we need (server pushes to client)
- Built into browsers via `EventSource` API
- No special server infrastructure needed

**How to say it:**

> "The backend is a FastAPI server that streams narrative generation via Server-Sent Events. Each phase of each turn — director selection, character reasoning, action execution, memory update, conclusion check — is sent as a separate SSE event. The frontend renders each event in real-time, so judges can watch the story unfold live rather than waiting for it to finish."

---

## 13. Pydantic — Why We Use It

**File:** `backend/src/schemas.py`

### What is Pydantic?

Pydantic is a Python library for data validation. You define models as classes, and Pydantic validates data against them automatically.

### Our Models

```python
class CharacterMemory(BaseModel):
    knowledge: List[str]       # Facts learned
    inventory: List[str]       # Items possessed
    emotional_state: str       # Current emotion
    perceptions: Dict[str, str]  # Views of others
    recent_events: List[str]   # Recent buffer
```

### Why?

1. **Type safety**: If someone tries to set `emotional_state` to a list, Pydantic catches it
2. **Serialization**: `.model_dump()` converts to dict, `.model_dump_json()` to JSON string — perfect for output files
3. **Default values**: `Field(default_factory=list)` means new lists don't share references
4. **LangGraph integration**: LangGraph uses Pydantic models as state definitions. StoryState is both the graph state and the data model.

**How to say it:**

> "We use Pydantic for all our data models — StoryState, CharacterMemory, CharacterProfile, DialogueTurn. This gives us type validation, automatic serialization for JSON output, and clean integration with LangGraph which uses Pydantic models as state definitions."

---

## 14. JSON Repair Pipeline

### The Problem

LLMs often return broken JSON:
- Wrapped in markdown code fences (```json ... ```)
- Trailing commas `{ "key": "value", }`
- Extra text before/after the JSON
- Truncated responses

### Our 4-Level Solution

**Level 1: Safe Parse** (`base_agent.py` → `safe_parse_json`)
1. Strip markdown fences
2. Try `json.loads()`
3. If that fails, find the first `{` and use brace-depth matching to extract the JSON block
4. If that fails, remove trailing commas and retry

**Level 2: LLM Repair** (`director_agent.py` → `_repair_json`)
- Send the broken text back to the LLM with: "This was supposed to be valid JSON. Fix it and return ONLY the JSON."
- Parse the repair response

**Level 3: Raw Text Fallback**
- If the response looks like narration (long text, doesn't start with `{`), use it directly as narration text

**Level 4: Deterministic Fallback**
- If everything fails, use a hardcoded response that's guaranteed to be valid
- Characters get a fallback speech; Director gets a round-robin speaker selection

**How to say it:**

> "LLMs sometimes return malformed JSON, so we built a 4-level repair pipeline. Level 1 is a robust parser that handles markdown fences, brace extraction, and trailing comma removal. Level 2 sends broken text back to the LLM for repair. Level 3 uses raw text as narration if it looks like prose. Level 4 is a deterministic fallback that guarantees the system never crashes. In testing, Level 1 handles ~95% of cases."

---

## 15. Force-ACT Mechanics

### The Problem

The problem statement requires ≥5 distinct actions in 25 turns. Left to its own devices, the LLM prefers dialogue over physical actions because dialogue is easier to generate.

### The Solution: Multi-Stage Pressure

**Stage 1 — Dialogue Streak Breaker**: After 2 consecutive dialogue-only turns, `force_act = true`

**Stage 2 — Mid-Game Pressure** (50% of turns): If fewer than half the required actions are done, `force_act = true`

**Stage 3 — Late-Game Pressure** (70% of turns): If actions are still fewer than required, `force_act = true`

**Stage 4 — Endgame Pressure** (last 20% of turns): If no resolution signal exists, force resolution-oriented actions (NEGOTIATE, ACCEPT_TERMS, MAKE_PAYMENT)

**Stage 5 — Countdown Pressure**: If remaining turns ≤ remaining needed actions + 1, every turn forces an action

### How Force-ACT Works

1. The Director prompt gets `!! FORCE ACT !!` instruction
2. The Character prompt gets `!! YOU MUST CHOOSE mode "ACT" THIS TURN !!`
3. If the character still chooses TALK, the code overrides it to ACT with an unused action
4. The override picks the "best" unused action (prioritizing unused ones for diversity)

**How to say it:**

> "We guarantee ≥5 distinct actions through multi-stage pressure. Dialogue streaks, mid-game checkpoints, late-game pressure, and endgame countdown all trigger force-act mode. If a character still chooses TALK under force-act, the system overrides to ACT with an unused action type, ensuring diversity."

---

## 16. Resolution Signals

### The Concept

4 specific world-state keys indicate meaningful resolution:

1. `terms_accepted` — Someone accepted a deal
2. `payment_made` — Money changed hands
3. `decisive_action_taken` — A bold action occurred
4. `help_summoned` — Authority/help was called

### How They Work

- The `check_conclusion` node **will not conclude** until at least one resolution signal is present
- In endgame, if no signal exists, the system forces resolution-oriented actions
- This prevents premature endings like "they talked for 10 turns and then... the end"

**How to say it:**

> "We define 4 resolution signals in world state — terms accepted, payment made, decisive action taken, help summoned. The story cannot conclude until at least one of these flags is set AND the minimum action count is met. This prevents premature endings and ensures every story reaches a meaningful resolution."

---

## 17. The Frontend

**Folder:** `website/`

### Tech Stack

| Technology | What It Does | Why We Chose It |
|------------|-------------|-----------------|
| **React 19** | UI framework | Latest version, component-based |
| **Vite** | Build tool / dev server | Fast HMR, ES modules |
| **Tailwind CSS v4** | Styling | Utility-first, easy dark/light themes |
| **Three.js** (React Three Fiber) | 3D visualization | Interactive hero scene with agent nodes |
| **Framer Motion** | Animations | Scroll reveals, page transitions |
| **React Router v7** | Client-side routing | 5 pages, no page reloads |
| **Supabase JS** | Database client | Fetch story history |
| **React Syntax Highlighter** | Code display | Show JSON outputs beautifully |

### 5 Pages

1. **Home** (`/`) — 3D hero with floating agent nodes, feature grid, architecture overview
2. **Features** (`/features`) — Interactive cards for Memory, Actions, Reasoning, Story Arc
3. **Showcase** (`/showcase`) — Sample narrative walkthrough, JSON viewer
4. **Live Playground** (`/live`) — Enter a story seed → watch it generate in real-time via SSE
5. **History** (`/history`) — Browse past story runs from Supabase

### The Live Playground — The Star Feature

1. User enters story title, description, and characters (or uses defaults)
2. Frontend sends `POST /api/generate` to the backend
3. Backend returns SSE stream
4. Frontend has 4 view modes for the same data:
   - **Pipeline**: Shows each system phase step-by-step
   - **Dialogue**: Clean conversation view
   - **Movie Scene**: Cinematic narration focus
   - **Agents**: Per-character panels with reasoning, emotion, memory

### The 3D Hero Scene

Uses Three.js to render:
- Agent nodes as glowing spheres
- Orbital rings around a central "Director" node
- Floating particles and data fragments
- Animated connections between agents

**How to say it:**

> "The frontend is a React 19 app with 5 pages. The star feature is the Live Playground where you enter a story seed and watch it generate in real-time via SSE streaming from the backend. We have 4 view modes — Pipeline, Dialogue, Movie Scene, and Agents — giving different perspectives on the same story. The 3D hero uses Three.js to visualize agent relationships."

---

## 18. Supabase — Database Persistence

### What is Supabase?

Supabase is an open-source Firebase alternative. It gives you a PostgreSQL database with a REST API.

### What We Store

```sql
CREATE TABLE story_runs (
    id UUID PRIMARY KEY,
    title TEXT,
    description TEXT,
    characters JSONB,     -- Array of character profiles
    events JSONB,         -- Full event log (dialogue + actions + narration)
    timeline JSONB,       -- SSE event stream for replay
    summary JSONB,        -- Final stats (turns, actions, conclusion)
    created_at TIMESTAMPTZ
);
```

### Incremental Saving

We don't wait until the story finishes to save. We save **after every turn**:
1. At generation start: Create a record with `status: "in_progress"`
2. After each turn: Update events and timeline
3. At conclusion: Update with final summary and `status: "completed"`

This means if the server crashes mid-story, we still have partial data.

**How to say it:**

> "We use Supabase for persistent storage. Story runs are saved incrementally — after every turn, not just at the end. If the server crashes mid-generation, we still have all the turns that completed. The History page on the frontend lets you browse and replay past stories."

---

## 19. Output Files

### story_output.json

Contains everything about the story:
- **events[]**: Every dialogue line, every action, every narration segment — chronological
- **conclusion**: Why the story ended, final turn count, world state
- **metadata**: Statistics — total turns, distinct actions, emotion history, final character memories

### prompts_log.json

Every single LLM call:
- The exact prompt sent (so judges can see the full context we give to the LLM)
- The exact response received (so judges can see what the LLM said)
- Which agent made the call (Director or Character name)
- Timestamp

### prompts.jsonl

Same data, but one JSON per line instead of an array. Easier for log processing tools.

---

## 20. Common Judge Questions & Answers

### "How does your system differ from a chatbot?"

> "A chatbot generates text in response to user input. Our system is a multi-agent simulation — multiple independent AI agents interact with each other autonomously. There's no user in the loop during generation. The Director orchestrates, characters reason independently, and physical actions modify world state deterministically."

### "Why LangGraph and not just a while-loop?"

> "LangGraph gives us a compiled state machine with conditional edges, immutable state updates, and built-in recursion limits. Each node is self-contained and testable. The conditional branching — conclude vs continue — is naturally expressed as graph edges. It's more robust and modular than imperative loop code."

### "How do you prevent the LLM from hallucinating?"

> "Three ways: First, the action system is deterministic — the LLM proposes actions, but precondition validation and world-state updates are code, not LLM output. Second, every action type is strictly validated against our 10-type catalogue. Third, we force structured JSON output and have a 4-level repair pipeline for malformed responses."

### "What if the LLM returns garbage?"

> "We have 4 fallback levels: robust JSON parser, LLM repair call, raw text usage, and deterministic fallback. In the worst case, the system generates a safe dialogue line or a default action. It never crashes."

### "How do characters know what happened?"

> "Each character has a structured memory buffer with knowledge, recent events, emotional state, and perceptions. Only characters present in the scene receive memory updates. If a character exits, they genuinely don't know what happened after they left — this is real information asymmetry, not simulated."

### "Why these 10 actions?"

> "They're story-agnostic narrative beats: investigate, confront, negotiate, accept terms, present evidence, intervene, make payment, take decisive action, summon help, exit scene. These cover the common patterns in any conflict narrative. Precondition chains like ACCEPT_TERMS requiring NEGOTIATE create logical sequences."

### "How do you ensure the story ends well?"

> "Three mechanisms: Resolution signals (4 world-state flags that must be set before conclusion), minimum action count enforcement, and a dedicated LLM call for cinematic conclusion narration. The story can't end until there's a meaningful resolution."

### "What extensions did you add beyond the starter code?"

> "Multi-API failover with up to 8 keys, information asymmetry for departed characters, story arc pre-planning, force-act mechanics with 5 pressure stages, resolution signal system, precondition chains, emotion tracking, JSON repair pipeline, invalid action mapping, real-time SSE streaming web UI with 4 view modes, Supabase persistence with incremental saving, 3D visualization, anti-repetition detection, and cinematic conclusion generation."

### "What models do you use?"

> "We primarily use Gemini 2.5 Flash (Google's free tier) and fall back to LLaMA 3.3 70B on Groq's free tier. Both are free and open-source compatible. The multi-API failover system handles rate limits automatically."

### "How does the Director decide when to end the story?"

> "It's a multi-gate system. First, deterministic checks: Is it past 50% of turns? Are there enough distinct actions? Is there a resolution signal in world state? Only if ALL gates pass does the Director LLM get asked. This prevents premature endings and saves LLM calls."

---

## 21. Key Words to Use When Speaking

Use these technical terms naturally when explaining to judges:

- **"State machine"** — when describing the LangGraph loop
- **"Deterministic"** — when explaining action execution (world-state updates are deterministic)
- **"Information asymmetry"** — when explaining memory (departed characters don't get updates)
- **"Structured memory buffer"** — when describing CharacterMemory
- **"Multi-agent orchestration"** — when describing the Director + Characters system
- **"Failover"** / **"automatic key rotation"** — when describing the LLM provider
- **"Precondition chains"** — when explaining ACCEPT_TERMS requiring NEGOTIATE
- **"Resolution signals"** — when explaining how the story knows when to end
- **"SSE streaming"** — when describing real-time updates to the frontend
- **"Force-act mechanics"** — when explaining how we guarantee action counts
- **"4-level repair pipeline"** — when explaining JSON robustness
- **"Story-agnostic"** — when explaining why the actions work with any story
- **"Immutable state updates"** — when explaining LangGraph's state management
- **"Observation → Reasoning → Decision pipeline"** — when explaining character reasoning
- **"Cinematic narration"** — when describing the Director's narration style
- **"Incremental persistence"** — when describing per-turn Supabase saving

---

## Your 2-Minute Elevator Pitch

If a judge says "Explain your project in 2 minutes," say this:

> "We built NarrativeVerse, a multi-agent narrative system where AI characters autonomously navigate a story world. The system has two types of agents: a Director that orchestrates pacing and narration, and Character agents that each reason independently with their own goals, memory, and emotions.
>
> The architecture is a LangGraph state machine with 6 nodes: the Director selects a speaker, the character reasons and decides to talk or act, the system processes the action deterministically, character memories are updated with information asymmetry, and a conclusion check gates story ending behind resolution signals and action count requirements.
>
> The action system has 10 story-agnostic action types with preconditions — for example, you can't accept terms without negotiating first. Actions are validated deterministically; the LLM writes narration but doesn't control state changes.
>
> We also built a React frontend with live SSE streaming — you can watch the story generate in real-time with pipeline, dialogue, movie scene, and agent view modes. Past stories are stored in Supabase with incremental per-turn saving.
>
> The whole system runs on free-tier APIs using our multi-provider failover — up to 8 API keys across Gemini and Groq with automatic rate-limit handling."
