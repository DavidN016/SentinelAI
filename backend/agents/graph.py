from __future__ import annotations

from typing import List

from shared.schemas import Alert, PacketEvent, Severity

from backend.agents.nodes import AgentResult, run_agents_in_parallel


def _severity_rank(severity: Severity) -> int:
    order = {"low": 0, "medium": 1, "high": 2}
    return order.get(severity, 0)


async def run_threat_workflow(
    event: PacketEvent,
    *,
    is_repeat_offender: bool,
    event_id: str,
) -> Alert:
    """
    Step 2.3 / 4.x: Analyze path.

    Runs multiple lightweight agents in parallel, then aggregates their
    results into a single Alert instance.
    """

    agent_results: List[AgentResult] = await run_agents_in_parallel(event)

    # Choose the "strongest" result by severity; fall back to a generic alert.
    if agent_results:
        best = max(
            agent_results,
            key=lambda r: _severity_rank(r.get("severity", "low")),  # type: ignore[arg-type]
        )
        fault = str(best.get("fault", "unknown"))
        severity: Severity = best.get("severity", "low")  # type: ignore[assignment]
        explanation = str(
            best.get(
                "explanation",
                "No detailed explanation was provided by the analysis agents.",
            )
        )
    else:
        fault = "analysis_unavailable"
        severity = "low"
        explanation = "No agent results were available; using fallback alert."

    return Alert(
        fault=fault,
        severity=severity,
        explanation=explanation,
        is_repeat_offender=is_repeat_offender,
        event_id=event_id,
    )
