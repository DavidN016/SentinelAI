from typing import Any, Dict


def analyze_sql_activity(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stub SQL analysis agent.

    In the future, this will use LLM + database metadata to detect risky queries,
    privilege escalation, or exfiltration patterns.
    """
    return {
        "agent": "sql",
        "status": "stub",
        "details": "SQL analysis not yet implemented.",
        "input_sample": {k: event.get(k) for k in list(event.keys())[:5]},
    }


def detect_anomalies(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stub anomaly detection agent.

    This will ultimately combine statistical techniques, embeddings, and LLM reasoning.
    """
    return {
        "agent": "anomaly",
        "status": "stub",
        "details": "Anomaly detection not yet implemented.",
        "input_sample": {k: event.get(k) for k in list(event.keys())[:5]},
    }
