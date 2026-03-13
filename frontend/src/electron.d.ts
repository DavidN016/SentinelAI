/**
 * Types for Electron preload API (window.sentinelai).
 * Available only when the app runs inside Electron.
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface SentinelAI {
  onAlert(callback: (payload: unknown) => void): () => void;
  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void;
  sendEvent(payload: object | string): Promise<{ ok: boolean; error?: string }>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  reconnect(): Promise<ConnectionStatus>;
}

declare global {
  interface Window {
    sentinelai?: SentinelAI;
  }
}

export {};
