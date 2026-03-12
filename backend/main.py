import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Allow importing `shared/` when running via `uvicorn main:app` from `backend/`.
_REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from shared.schemas import Alert, PacketEvent

from backend.database.vector_store import ThreatVectorStore, embed_text, fingerprint_text

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

            # 2.2.3 If hit: return cached Alert immediately (skip agents/LLM)
            if cached_alert is not None:
                await websocket.send_text(
                    json.dumps(
                        {
                            "ok": True,
                            "cached": True,
                            "alert": cached_alert,
                            "event_id": cache_key,
                        }
                    )
                )
                continue

            # Cache miss: for now, create a stub alert and store it so the cache path
            # can be validated end-to-end. Step 4 will replace this with real agents.
            stub_alert = Alert(
                fault="stub",
                severity="low",
                explanation="No cached match; analysis pipeline not yet implemented.",
                is_repeat_offender=is_repeat_offender,
                event_id=cache_key,
            )
            vector_store.upsert_event(
                event_id=cache_key,
                embedding=embed_text(normalized_text),
                metadata={
                    "fingerprint": cache_key,
                    "normalized_text": normalized_text,
                    "alert": stub_alert.model_dump(mode="json"),
                },
            )

            await websocket.send_text(
                json.dumps(
                    {
                        "ok": True,
                        "cached": False,
                        "event": event.model_dump(mode="json"),
                        "normalized_text": normalized_text,
                        "event_id": cache_key,
                        "alert": stub_alert.model_dump(mode="json"),
                    }
                )
            )
    except WebSocketDisconnect:
        # Client disconnected; nothing special to do yet
        pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
