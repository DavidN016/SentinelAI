const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sentinelai", {
  onAlert(callback) {
    const handler = (_, payload) => callback(payload);
    ipcRenderer.on("sentinelai:alert", handler);
    return () => ipcRenderer.removeListener("sentinelai:alert", handler);
  },
  onConnectionStatus(callback) {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("sentinelai:connectionStatus", handler);
    return () => ipcRenderer.removeListener("sentinelai:connectionStatus", handler);
  },
  sendEvent(payload) {
    return ipcRenderer.invoke("sentinelai:sendEvent", payload);
  },
  getConnectionStatus() {
    return ipcRenderer.invoke("sentinelai:getConnectionStatus");
  },
  reconnect() {
    return ipcRenderer.invoke("sentinelai:reconnect");
  },
});
