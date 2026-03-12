import type { Alert } from "../types/alerts";

/**
 * Example alert for UI testing and development.
 * Canonical shape; use when testing dashboard, red state, and repeat-offender badge.
 */
export const exampleAlert: Alert = {
  fault: "SQL injection",
  severity: "high",
  explanation:
    "Classic tautology pattern detected: ' OR 1=1-- can bypass authentication and expose data.",
  is_repeat_offender: true,
  event_id: "evt_example_001",
};
