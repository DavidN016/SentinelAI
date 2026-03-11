# SentinelAI Implementation Plan

Step-by-step plan for the Capture → Stream → Optimize → Analyze → Alert flow. Work through each step with your AI assistant; check off as you go.

**Pro-tips baked into the steps:**
- **Step 2 + 3:** If Chroma finds a repeat, return the cached Alert and **skip the LLM call** (~48% reduction).
- **Step 4:** Use try/except inside each agent so one failure (e.g. API timeout) doesn’t kill the request; terminal node always gets data.
- **Step 5:** Stub capture with `setInterval` + fake SQL injection every 30s to test the UI before tshark.

---

## Step 1: Shared types

- [ ] **1.1** Define `PacketEvent` in `shared/` (Pydantic): `timestamp`, `source`, `query` or `payload` text, optional `metadata`.
- [ ] **1.2** Define `Alert` in `shared/`: `fault`, `severity` (`high` | `medium` | `low`), `explanation`, `is_repeat_offender`.
- [ ] **1.3** (Optional) Add matching TypeScript types in `frontend/src/types/` for WebSocket payloads.

**Files:** `shared/schemas.py` (or similar), optionally `frontend/src/types/alerts.ts`.

---

## Step 2: Backend pipeline (WebSocket)

- [ ] **2.1** In `backend/main.py` WebSocket handler: parse incoming JSON as `PacketEvent`.
- [ ] **2.2** Call Optimize (Chroma repeat check). **If `is_repeat_offender` is true and Chroma returns a cached Alert, skip the LLM/agents entirely and send that Alert back** (this gives the ~48% reduction).
- [ ] **2.3** Otherwise call Analyze (threat workflow); get one `Alert` per event, then send it to the client.
- [ ] **2.4** Send back a single `Alert` JSON to the client (no echo).

**Files:** `backend/main.py`.

---

## Step 3: ChromaDB “Repeat Offender”

- [ ] **3.1** Add an embedding step (e.g. sentence-transformers or API) to turn event text into a vector.
- [ ] **3.2** Switch to ChromaDB `PersistentClient` so data survives restarts.
- [ ] **3.3** On each event: embed → `search_similar` with threshold; if similar exists, set `is_repeat_offender: true` and **return the cached Alert** (store Alert with the event in Chroma, or store it when first analyzed so repeat lookups can return it).
- [ ] **3.4** Expose a small API used by the WebSocket handler: e.g. `check_repeat_and_store(event) -> (is_repeat_offender: bool, cached_alert: Alert | None)`. Step 2 uses `cached_alert` to skip the LLM call when present.

**Files:** `backend/database/vector_store.py`, possibly `backend/database/embeddings.py`.

---

## Step 4: Parallel agents and Alert shape

- [ ] **4.1** Run SQL agent and anomaly agent in parallel (LangGraph or `asyncio.gather`).
- [ ] **4.2** **Wrap each agent in try/except** so that if one fails (e.g. API timeout), it doesn’t crash the whole request; the terminal node always gets some data back (e.g. fallback “error”/“unknown” result for that agent).
- [ ] **4.3** Implement real (or richer stub) logic in `analyze_sql_activity` and `detect_anomalies`; both return a consistent shape that maps to `fault` + `explanation`.
- [ ] **4.4** Aggregate results into one `Alert` per event: `fault`, `severity`, `explanation`, `is_repeat_offender`.

**Files:** `backend/agents/graph.py`, `backend/agents/nodes.py`.

---

## Step 5: Electron main process (capture + stream + IPC)

- [ ] **5.1** Main process opens WebSocket to FastAPI `ws://localhost:8000/ws/threats` (or configurable URL).
- [ ] **5.2** **Packet capture stub:** use a simple `setInterval` that sends a **fake SQL injection string** (e.g. `' OR 1=1--`) as a `PacketEvent` every **30 seconds** over the WebSocket. Use this to test the UI and pipeline before wiring up real capture (e.g. tshark).
- [ ] **5.3** Later: replace stub with real packet capture; same `PacketEvent` shape.
- [ ] **5.4** On receiving an `Alert` from the backend, forward it to the renderer via IPC (e.g. `ipcMain` + preload exposing `window.sentinelai.onAlert(callback)`).
- [ ] **5.5** Preload script: expose a safe API for the renderer to subscribe to alerts.

**Files:** `frontend/src/main.js`, `frontend/src/preload.js` (create if missing).

---

## Step 6: React UI (alerts and red state)

- [ ] **6.1** Subscribe to alerts via IPC (from Step 5) in the dashboard component; store alerts in state.
- [ ] **6.2** When `severity === "high"` (and optionally `"medium"`), show a clear “danger” state: red border, banner, or dedicated alert panel.
- [ ] **6.3** Render `explanation` and `fault` so the user sees exactly why it’s dangerous.
- [ ] **6.4** Show a “Repeat offender” badge or label when `is_repeat_offender === true`.

**Files:** `frontend/src/components/ThreatDashboard.jsx`, possibly a small `AlertPanel` or `AlertBanner` component.

---

## Quick reference: flow

1. **Capture** (Electron main) → **Stream** (WebSocket to FastAPI)
2. **Optimize** (Chroma embed + repeat check) → **Analyze** (parallel agents)
3. Backend sends **Alert** → Electron main → IPC → **React** (red + explanation)

Use this plan one step at a time; complete Step 1 before Step 2, and so on.
