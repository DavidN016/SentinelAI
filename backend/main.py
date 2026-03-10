from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

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
    try:
        # Placeholder WebSocket loop; will later stream threat intel / anomalies
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo from SentinelAI backend: {data}")
    except WebSocketDisconnect:
        # Client disconnected; nothing special to do yet
        pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
