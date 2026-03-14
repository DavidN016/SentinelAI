import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

# Disable ChromaDB telemetry before any chromadb import (avoids capture() signature errors)
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Allow importing `shared/` when running via `uvicorn main:app` from `backend/`.
_REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from shared.schemas import Alert, PacketEvent

from backend.database.vector_store import ThreatVectorStore, embed_text, fingerprint_text
from backend.agents.graph import run_threat_workflow

app = FastAPI(title="SentinelAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "service": "sentinelai-backend"}


@app.websocket("/ws/threats")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    vector_store = ThreatVectorStore()
    try:
        while True:
            raw_text = await websocket.receive_text()

            # 2.1.1 Accept JSON, validate to PacketEvent
            try:
                incoming: Any = json.loads(raw_text)
            except json.JSONDecodeError as e:
                await websocket.send_text(
                    json.dumps(
                        {
                            "error": "invalid_json",
                            "message": str(e),
                        }
                    )
                )
                continue

            if not isinstance(incoming, dict):
                await websocket.send_text(
                    json.dumps(
                        {
                            "error": "invalid_payload",
                            "message": "Expected a JSON object",
                        }
                    )
                )
                continue

            # Normalize common client field name `query` -> canonical `payload`
            if "payload" not in incoming and "query" in incoming:
                incoming = {**incoming, "payload": incoming.get("query")}

            # Tolerate clients that omit timestamp by filling server time
            if "timestamp" not in incoming:
                incoming = {
                    **incoming,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

            try:
                event = PacketEvent.model_validate(incoming)
            except Exception as e:
                await websocket.send_text(
                    json.dumps(
                        {
                            "error": "validation_error",
                            "message": str(e),
                        }
                    )
                )
                continue

            # 2.1.2 Normalize payload to a single string field used for embedding + agents
            normalized_text = event.payload.strip()

            # 2.2 Optimize-first (Chroma cache)
            # 2.2.1 Compute fingerprint/key for the event (normalized text)
            cache_key = fingerprint_text(normalized_text)

            # 2.2.2 Query Chroma for near-duplicate
            is_repeat_offender, cached_alert = vector_store.find_cached_alert(
                normalized_text
            )

            # 2.2.3 If hit: return cached Alert immediately (skip agents/LLM).
            # We never echo the raw input back to the client; only the Alert JSON.
            if cached_alert is not None:
                cached_alert["is_repeat_offender"] = True
                cached_alert["event_id"] = cache_key
                await websocket.send_text(json.dumps(cached_alert))
                continue

            # 2.3 Analyze path (only if not cached): run the threat workflow to
            # produce a single Alert, then persist it alongside the embedding +
            # metadata so later repeats can be served from cache.
            alert = await run_threat_workflow(
                event,
                is_repeat_offender=is_repeat_offender,
                event_id=cache_key,
            )

            vector_store.upsert_event(
                event_id=cache_key,
                embedding=embed_text(normalized_text),
                metadata={
                    "fingerprint": cache_key,
                    "normalized_text": normalized_text,
                    # Chroma metadata values must be scalar; store alert as JSON string.
                    "alert_json": alert.model_dump_json(),
                    "fault": alert.fault,
                    "severity": alert.severity,
                    "is_repeat_offender": bool(alert.is_repeat_offender),
                },
            )

            # 2.4 WebSocket output handling:
            # 2.4.1 Send Alert JSON back over WS
            # 2.4.2 Never echo raw input
            await websocket.send_text(alert.model_dump_json())
    except WebSocketDisconnect:
        # Client disconnected; nothing special to do yet
        pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
