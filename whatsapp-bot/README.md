# NarrativeVerse WhatsApp Bot

WhatsApp bot integration for the NarrativeVerse multi-agent AI storytelling engine. Uses [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp Web API.

## Setup

### 1. Install Dependencies
```bash
cd whatsapp-bot
npm install
```

### 2. Configure Environment
The `.env` file contains:
- `GROQ_API_KEY` — Dedicated Groq API key for seed story parsing (not used by the main backend)
- `GROQ_MODEL` — Model to use (default: `llama-3.3-70b-versatile`)
- `BACKEND_URL` — URL of the NarrativeVerse backend API (default: `http://localhost:8000`)

### 3. Start the Backend API
Make sure the backend is running first:
```bash
cd backend
uvicorn src.api:app --host 0.0.0.0 --port 8000
```

### 4. Start the Bot
```bash
cd whatsapp-bot
npm start
```

A QR code will appear in the terminal. Scan it with WhatsApp (Linked Devices → Link a Device).

## Usage

### Activation
Send **"narrative verse"** or **"narrativeverse"** to the linked WhatsApp number.

### Send Seed Story
After activation, send your story seed in one message:

```
Title: The Rickshaw Accident
Scenario: Late afternoon on Shahrah-e-Faisal near Karachi Airport. Rush hour traffic. Hot and humid. A rickshaw and a car have collided, both drivers blaming each other.

Saleem: Poor rickshaw driver, sole earner for family of 5. Speaks Urdu-English mix.
Ahmed Malik: Wealthy car owner and businessman, late for an international flight.
Constable Raza: 15-year traffic police veteran, underpaid and cynical.
Uncle Jameel: Local shopkeeper who witnessed everything. Nosy, loves drama.
```

### Generation
The bot will:
1. Parse your seed story (using Groq LLM for intelligent extraction)
2. Generate the full story via the backend multi-agent API
3. Send progress updates during generation
4. Send 2 PDFs:
   - **Pipeline View** — Full multi-agent pipeline with phases, reasoning, actions, and memories
   - **Movie Scene View** — Cinematic narrative with title card, narration, dialogue, and "The End"

### Deactivation
Send **"narrative verse end"** or **"narrativeverse end"** to stop the bot from listening to your messages.

## Architecture

```
whatsapp-bot/
├── src/
│   ├── index.js          # Main bot entry point (Baileys connection, message routing)
│   ├── sessionManager.js # User session management (activation/deactivation/state)
│   ├── seedParser.js     # Seed story parser (rule-based + LLM fallback)
│   ├── storyGenerator.js # Backend API client (SSE stream processing)
│   └── pdfGenerator.js   # PDF generation (Pipeline + Movie Scene views)
├── auth_info/            # WhatsApp auth credentials (auto-generated)
├── output/               # Temporary PDF files (auto-cleaned)
├── .env                  # Configuration
└── package.json
```

## Flow Diagram

```
User sends "narrative verse"
    → Bot activates, sends welcome message
    → User sends seed story (title + scenario + characters)
    → Bot parses seed (rule-based or LLM)
    → Bot calls backend POST /api/generate (SSE)
    → Bot processes all events into timeline
    → Bot generates Pipeline PDF + Movie Scene PDF
    → Bot sends both PDFs to user
    → User can send another seed or "narrative verse end"
```
