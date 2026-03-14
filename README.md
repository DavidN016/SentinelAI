# SentinelAI

Real-time threat detection for packet and query events. Capture events, stream them to a FastAPI backend, optimize with ChromaDB repeat-offender caching, and analyze with parallel agents. Alerts are shown in an Electron + React dashboard with severity-based UI (e.g. red state for high severity).

## Architecture

1. **Capture** (Electron main) → **Stream** (WebSocket to FastAPI)
2. **Optimize** (ChromaDB embed + repeat check) → **Analyze** (parallel agents)
3. Backend sends **Alert** → Electron main → IPC → **React** (red + explanation)

Repeat offenders are served from ChromaDB cache, skipping the analysis agents for a significant reduction in latency and cost.

## Tech Stack

| Layer        | Stack |
|-------------|--------|
| Backend     | Python 3, FastAPI, WebSocket, ChromaDB (persistent), LangGraph-style agents |
| Shared      | Pydantic schemas (`PacketEvent`, `Alert`) in `shared/` |
| Frontend    | React 19, TypeScript, Vite |
| Desktop     | Electron 33 |
| Capture     | Stub: fake SQLi every 30s; later: real packet capture (e.g. tshark) |

## Project Structure

```
SentinelAI/
├── backend/           # FastAPI app
│   ├── main.py        # WebSocket /ws/threats, CORS
│   ├── agents/       # Threat analysis (graph, nodes)
│   └── database/     # ChromaDB vector store (repeat-offender cache)
├── shared/
│   └── schemas.py    # PacketEvent, Alert (Pydantic)
├── frontend/         # React + Vite + Electron
│   ├── src/          # App, components, WebSocket/IPC usage
│   └── electron/     # main.cjs, preload.cjs (capture stub, IPC)
├── scripts/
│   └── clear_vectors.py   # Clear ChromaDB collection
├── plan.md           # Step-by-step implementation plan
└── README.md
```

## Prerequisites

- **Python 3.10+** (backend)
- **Node.js 18+** and npm (frontend)
- Run backend and frontend from the **repo root** so `shared/` is on `PYTHONPATH` when starting the API.

## Setup

### Backend

From the repo root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Environment Variables

| Variable | Where | Description |
|----------|--------|-------------|
| `GROQ_API_KEY` | Backend (required for analysis) | Groq API key for Llama 3 threat-analysis agents. Get one at [console.groq.com](https://console.groq.com). |
| `SENTINELAI_WS_URL` | Electron (optional) | WebSocket URL. Default: `ws://127.0.0.1:8000/ws/threats` |
| `SENTINELAI_CHROMA_PATH` | Backend (optional) | ChromaDB persist directory. Default: `backend/database/.chroma` |

## Running

### 1. Start the backend

Set `GROQ_API_KEY` (required for XSS/SQL/Payload AI agents). From repo root (so `shared` is importable):

```bash
cd backend
export GROQ_API_KEY="your-groq-api-key"   # or use a .env file
python main.py
```

Or with uvicorn directly:

```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Backend: http://127.0.0.1:8000  
WebSocket: `ws://127.0.0.1:8000/ws/threats`

### 2. Run the Electron app (dev)

In another terminal:

```bash
cd frontend
npm run electron:dev
```

This starts Vite (port 5173) and Electron. The main process connects to the backend WebSocket and runs the capture stub (fake SQL injection event every 30 seconds). Alerts appear in the React UI; high/medium severity show a danger state; repeat offenders are labeled.

### 3. Production-style Electron (no Vite)

Build the frontend, then run Electron against the built files:

```bash
cd frontend
npm run build
npm run electron:start
```

## Scripts

- **Clear ChromaDB vectors** (e.g. to reset repeat-offender cache):

  From repo root:

  ```bash
  python scripts/clear_vectors.py
  ```

  Or with `PYTHONPATH` set to repo root from anywhere.

## API

- **GET /**  
  Health: `{"status":"ok","service":"sentinelai-backend"}`

- **WebSocket /ws/threats**  
  - **Client → server:** JSON object compatible with `PacketEvent`: `timestamp`, `source`, `payload` (or `query`), optional `metadata`.  
  - **Server → client:** Single `Alert` JSON per event: `fault`, `severity`, `explanation`, `is_repeat_offender`, `event_id`.  
  - On validation/parse errors, server may send `{"error":"...", "message":"..."}`.

## Implementation Plan

See [plan.md](plan.md) for the step-by-step Capture → Stream → Optimize → Analyze → Alert checklist and flow reference.
