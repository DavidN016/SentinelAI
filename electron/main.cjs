const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const WS_URL = process.env.SENTINELAI_WS_URL || "ws://127.0.0.1:8000/ws/threats";

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;

/** 5.2 Capture stub: interval (ms) between fake SQLi events */
const CAPTURE_STUB_INTERVAL_MS = 30 * 1000;

function makeStubPacketEvent() {
  return {
    timestamp: new Date().toISOString(),
    source: "electron-capture-stub",
    payload: "' OR 1=1--",
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const loadURL =
    process.env.VITE_DEV_SERVER_URL ||
    `file://${path.join(__dirname, "../dist/index.html")}`;
  win.loadURL(loadURL);

  return win;
}

let mainWindow = null;
let ws = null;
let reconnectTimer = null;
let captureStubTimer = null;
let reconnectDelay = MIN_RECONNECT_MS;
let connectionStatus = "disconnected"; // 'disconnected' | 'connecting' | 'connected'

function setStatus(status) {
  connectionStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sentinelai:connectionStatus", status);
  }
}

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  setStatus("connecting");
  try {
    ws = new (require("ws"))(WS_URL);
  } catch (e) {
    setStatus("disconnected");
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    reconnectDelay = MIN_RECONNECT_MS;
    setStatus("connected");
  });

  ws.on("message", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const text = data.toString();
        const payload = JSON.parse(text);
        mainWindow.webContents.send("sentinelai:alert", payload);
      } catch {
        mainWindow.webContents.send("sentinelai:alert", { raw: data.toString() });
      }
    }
  });

  ws.on("close", () => {
    ws = null;
    setStatus("disconnected");
    scheduleReconnect();
  });

  ws.on("error", () => {
    if (ws) {
      ws.close();
    }
    setStatus("disconnected");
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  }, reconnectDelay);
}

function sendPacketEvent(payload) {
  if (!ws || ws.readyState !== 1) {
    return { ok: false, error: "WebSocket not connected" };
  }
  try {
    const text =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    ws.send(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function startCaptureStub() {
  if (captureStubTimer) return;
  captureStubTimer = setInterval(() => {
    if (ws && ws.readyState === 1) {
      sendPacketEvent(makeStubPacketEvent());
    }
  }, CAPTURE_STUB_INTERVAL_MS);
}

function stopCaptureStub() {
  if (captureStubTimer) {
    clearInterval(captureStubTimer);
    captureStubTimer = null;
  }
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  connect();
  startCaptureStub();

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopCaptureStub();
    if (ws) {
      ws.close();
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.handle("sentinelai:sendEvent", (_, payload) => {
  return sendPacketEvent(payload);
});

ipcMain.handle("sentinelai:getConnectionStatus", () => {
  return connectionStatus;
});

ipcMain.handle("sentinelai:reconnect", () => {
  if (ws) {
    ws.close();
    ws = null;
  }
  reconnectDelay = MIN_RECONNECT_MS;
  connect();
  return connectionStatus;
});
