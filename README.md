# SentinelAI

SentinelAI is a desktop security monitoring app that detects suspicious packet/query payloads in real time and explains the risk level.

It combines:
- a **FastAPI backend** for WebSocket ingestion + threat analysis,
- a **ChromaDB cache** to short-circuit repeat offenders,
- and an **Electron + React dashboard** for live alerts.

## What This Project Does

1. Captures payload-like events in the Electron process (currently a stub generator).
2. Streams events to `ws://127.0.0.1:8000/ws/threats`.
3. Checks ChromaDB for similar past events.
4. Runs AI-based analysis when no cache hit exists.
5. Sends an `Alert` back to the desktop UI with `fault`, `severity`, and explanation.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Python, FastAPI, Uvicorn, WebSocket, ChromaDB |
| AI/Analysis | LangChain/LangGraph-style workflow + Groq LLM |
| Frontend | React 19, TypeScript, Vite |
| Desktop | Electron |
| Shared types | Pydantic schemas in `shared/` |

## Repository Structure

```text
SentinelAI/
├── backend/               # FastAPI WebSocket API + analysis pipeline
│   ├── agents/            # Threat-analysis workflow/nodes
│   ├── database/          # ChromaDB vector cache
│   ├── requirements.txt
│   └── main.py
├── frontend/              # React UI + Electron desktop shell
│   ├── electron/          # Electron main/preload
│   ├── src/               # React app
│   └── package.json
├── shared/
│   └── schemas.py         # Shared PacketEvent / Alert schemas
└── scripts/
    └── clear_vectors.py   # Utility: clear ChromaDB cache
```

## Prerequisites

- Python `3.10+`
- Node.js `18+` and npm
- A Groq API key (for LLM analysis)

## Quick Start (Development)

### 1) Clone and install dependencies

```bash
# backend deps
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# frontend deps
cd ../frontend
npm install
```

### 2) Start backend

Open terminal A:

```bash
cd backend
source .venv/bin/activate   # if not already active
export GROQ_API_KEY="your-groq-api-key"
python main.py
```

Backend health: `http://127.0.0.1:8000`  
WebSocket endpoint: `ws://127.0.0.1:8000/ws/threats`

### 3) Start desktop app

Open terminal B:

```bash
cd frontend
npm run electron:dev
```

This launches Vite + Electron. Alerts stream into the React UI in real time.

## Environment Variables

| Variable | Required | Used by | Default | Purpose |
|---|---|---|---|---|
| `GROQ_API_KEY` | Yes (for analysis) | Backend | none | API key for threat-analysis LLM calls |
| `SENTINELAI_WS_URL` | No | Electron main | `ws://127.0.0.1:8000/ws/threats` | Override backend WebSocket URL |
| `SENTINELAI_CHROMA_PATH` | No | Backend | `backend/database/.chroma` | Override ChromaDB persistence directory |

## Common Commands

### Backend

```bash
cd backend
python main.py
```

Alternative:

```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend / Electron

```bash
cd frontend
npm run electron:dev     # dev mode (Vite + Electron)
npm run build            # production frontend build
npm run electron:start   # run Electron against built frontend
npm run electron:build   # package desktop app
npm run lint             # lint frontend code
```

### Utilities

```bash
python scripts/clear_vectors.py
```

Clears stored vectors/alerts from the ChromaDB repeat-offender cache.

## API Notes

- `GET /` returns service health.
- `WS /ws/threats` accepts `PacketEvent`-like JSON (`payload` or `query`) and returns one `Alert` per event.

## Current State

- Event capture is currently a **stub generator** in Electron (not full packet sniffing yet).
- Repeat-offender optimization is enabled via persistent ChromaDB caching.
