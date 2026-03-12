/**
 * Canonical Alert payload shape.
 * Mirrors backend shared/schemas.py Alert model.
 * Use this type everywhere (WebSocket, IPC, UI) for a single source of truth.
 */
export type Severity = "high" | "medium" | "low";

export interface Alert {
  /** Type or name of the fault (e.g. SQL injection, anomaly) */
  fault: string;
  /** Alert severity level */
  severity: Severity;
  /** Human-readable explanation of the threat */
  explanation: string;
  /** True if this matches a previously seen pattern (e.g. Chroma cache hit) */
  is_repeat_offender: boolean;
  /** ID of the PacketEvent this alert refers to */
  event_id: string;
}
