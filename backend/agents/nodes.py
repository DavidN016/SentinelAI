from __future__ import annotations

import asyncio
from typing import Any, Dict

from shared.schemas import PacketEvent, Severity


AgentResult = Dict[str, Any]


async def analyze_sql_activity(event: PacketEvent) -> AgentResult:
    """
    Lightweight SQL analysis stub.

    Looks for very simple SQL injection-style patterns in the payload and
    returns a fault + severity + explanation.
    """

    text = (event.payload or "").lower()

    # Extremely naive heuristics – this is intentionally simple and cheap.
    indicators_high = [
        "' or 1=1",
        "\" or 1=1",
        " or 1=1--",
        " or 1=1 ;",
        "union select",
        "drop table",
        "xp_cmdshell",
    ]
    indicators_medium = [
        "select ",
        "insert ",
        "update ",
        "delete ",
        " where ",
    ]

    if any(indicator in text for indicator in indicators_high):
        return {
            "fault": "sql_injection_suspected",
            "severity": "high",
            "explanation": "Payload contains classic SQL injection patterns (e.g. OR 1=1 / UNION SELECT / DROP TABLE).",
        }

    if any(indicator in text for indicator in indicators_medium):
        return {
            "fault": "sql_activity_observed",
            "severity": "medium",
            "explanation": "Payload appears to contain SQL statements; monitor for potential abuse.",
        }

    return {
        "fault": "no_sql_threat_detected",
        "severity": "low",
        "explanation": "No obvious SQL injection or dangerous SQL patterns were detected in the payload.",
    }


async def detect_anomalies(event: PacketEvent) -> AgentResult:
    """
    Simple anomaly detector stub.

    Uses a few cheap heuristics (length, character diversity) to flag
    unusual payloads. This is deliberately lightweight and easily
    replaceable with a real model later.
    """

    payload = event.payload or ""
    length = len(payload)
    unique_chars = len(set(payload))

    # Heuristic: extremely long or highly "noisy" payloads are suspicious.
    if length > 2000 or unique_chars > 80:
        return {
            "fault": "suspicious_payload_anomaly",
            "severity": "medium",
            "explanation": "Payload length/entropy is unusually high for typical queries; treat as anomalous.",
        }

    if length == 0:
        return {
            "fault": "empty_payload",
            "severity": "low",
            "explanation": "Payload is empty; no content to analyze.",
        }

    return {
        "fault": "no_anomaly_detected",
        "severity": "low",
        "explanation": "Payload shape appears within normal bounds for length and character diversity.",
    }


async def _safe_run(agent_fn, event: PacketEvent) -> AgentResult:
    """
    Run an agent with a safety net so one failure does not crash the request.
    """

    try:
        return await agent_fn(event)
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "fault": "agent_error",
            "severity": "low",
            "explanation": f"Agent {agent_fn.__name__} failed: {exc}",
        }


async def run_agents_in_parallel(event: PacketEvent) -> list[AgentResult]:
    """
    Entry point used by the threat workflow to fan out to all agents.
    """

    results = await asyncio.gather(
        _safe_run(analyze_sql_activity, event),
        _safe_run(detect_anomalies, event),
    )
    return list(results)
