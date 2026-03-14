from __future__ import annotations

import operator
from typing import Annotated, Any, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from shared.schemas import Alert, PacketEvent, Severity

from backend.agents.nodes import (
    AgentResult,
    _safe_run,
    analyze_payload,
    analyze_sql_activity,
    analyze_xss,
)


def _severity_rank(severity: str) -> int:
    order = {"low": 0, "medium": 1, "high": 2}
    key = (str(severity).strip().lower() if severity else "low")
    return order.get(key, 0)


class ThreatState(TypedDict, total=False):
    """State for the Root → XSS/SQL/Payload → Terminal graph."""

    event: dict
    event_id: str
    is_repeat_offender: bool
    results: Annotated[List[AgentResult], operator.add]
    alert: Optional[Alert]


def _route_to_agents(state: ThreatState) -> List[str]:
    """Route from START to all three agents in parallel."""
    return ["xss_agent", "sql_agent", "payload_agent"]


async def _xss_agent_node(state: ThreatState) -> dict:
    event = state["event"]
    result = await _safe_run(analyze_xss, event)
    return {"results": [result]}


async def _sql_agent_node(state: ThreatState) -> dict:
    event = state["event"]
    result = await _safe_run(analyze_sql_activity, event)
    return {"results": [result]}


async def _payload_agent_node(state: ThreatState) -> dict:
    event = state["event"]
    result = await _safe_run(analyze_payload, event)
    return {"results": [result]}


def _terminal_node(state: ThreatState) -> dict:
    """Aggregate agent results into a single Alert (highest severity wins)."""
    results: List[AgentResult] = state.get("results") or []
    event_id = state.get("event_id") or ""
    is_repeat_offender = state.get("is_repeat_offender", False)

    if results:
        best = max(
            results,
            key=lambda r: _severity_rank(r.get("severity", "low") if isinstance(r, dict) else "low"),
        )
        fault = str(best.get("fault", "unknown")) if isinstance(best, dict) else "unknown"
        raw_severity = best.get("severity", "low") if isinstance(best, dict) else "low"
        severity_val = (str(raw_severity).strip().lower() if raw_severity else "low")
        if severity_val not in ("high", "medium", "low"):
            severity_val = "low"
        severity: Severity = severity_val  # type: ignore[assignment]
        explanation = str(
            best.get("explanation", "No detailed explanation was provided by the analysis agents.")
        ) if isinstance(best, dict) else "No detailed explanation was provided by the analysis agents."
    else:
        fault = "analysis_unavailable"
        severity = "low"
        explanation = "No agent results were available; using fallback alert."

    alert = Alert(
        fault=fault,
        severity=severity,
        explanation=explanation,
        is_repeat_offender=is_repeat_offender,
        event_id=event_id,
    )
    return {"alert": alert}


# Build and compile the graph
_builder = StateGraph(ThreatState)
_builder.add_node("xss_agent", _xss_agent_node)
_builder.add_node("sql_agent", _sql_agent_node)
_builder.add_node("payload_agent", _payload_agent_node)
_builder.add_node("terminal", _terminal_node)

_builder.add_conditional_edges(START, _route_to_agents)
_builder.add_edge("xss_agent", "terminal")
_builder.add_edge("sql_agent", "terminal")
_builder.add_edge("payload_agent", "terminal")
_builder.add_edge("terminal", END)

_threat_graph = _builder.compile()


async def run_threat_workflow(
    event: PacketEvent,
    *,
    is_repeat_offender: bool,
    event_id: str,
) -> Alert:
    """
    Run the threat analysis graph: Root → (XSS, SQL, Payload) → Terminal.
    Returns a single Alert (highest severity among agent results).
    """
    initial: ThreatState = {
        "event": event.model_dump(),
        "event_id": event_id,
        "is_repeat_offender": is_repeat_offender,
        "results": [],
    }
    final = await _threat_graph.ainvoke(initial)
    alert = final.get("alert")
    if alert is None:
        return Alert(
            fault="analysis_unavailable",
            severity="low",
            explanation="Graph did not produce an alert.",
            is_repeat_offender=is_repeat_offender,
            event_id=event_id,
        )
    return alert
