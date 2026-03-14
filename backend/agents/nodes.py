from __future__ import annotations

import asyncio
from typing import Any, Dict, Union

from shared.schemas import PacketEvent

from backend.agents.llm import analyze_with_llm

AgentResult = Dict[str, Any]

# System prompts for each agent; each must ask for JSON with fault, severity, explanation.
XSS_SYSTEM_PROMPT = """You are a security analyst detecting Cross-Site Scripting (XSS) in user-supplied payloads.
Analyze the payload for XSS indicators: script tags, event handlers (onclick, onerror, etc.), javascript: URIs, HTML entity encoding, SVG/embed, data URIs, or other XSS tricks.
Respond with exactly a JSON object with three keys: "fault", "severity", "explanation".
- fault: short identifier (e.g. xss_suspected, no_xss_detected).
- severity: one of high, medium, low. Use high for clear XSS payloads, medium for suspicious patterns, low for benign.
- explanation: one or two sentences for the analyst."""

SQL_SYSTEM_PROMPT = """You are a security analyst detecting SQL injection in user-supplied payloads.
Analyze the payload for SQL injection: quote breaking (' OR 1=1--), UNION SELECT, stacked queries, comment tricks (--, #), DROP/INSERT/UPDATE, xp_cmdshell, time-based patterns, or other SQLi techniques.
Respond with exactly a JSON object with three keys: "fault", "severity", "explanation".
- fault: short identifier (e.g. sql_injection_suspected, sql_activity_observed, no_sql_threat_detected).
- severity: one of high, medium, low. Use high for clear SQLi, medium for suspicious SQL-like input, low for benign.
- explanation: one or two sentences for the analyst."""

PAYLOAD_SYSTEM_PROMPT = """You are a security analyst assessing generic payload risk.
Consider: unusual length or entropy, command-injection-like patterns, encoding/obfuscation, path traversal, suspicious delimiters, or other anomalous content. Empty or trivial payloads are low risk.
Respond with exactly a JSON object with three keys: "fault", "severity", "explanation".
- fault: short identifier (e.g. suspicious_payload_anomaly, command_injection_suspected, no_anomaly_detected).
- severity: one of high, medium, low.
- explanation: one or two sentences for the analyst."""


def _payload(event: Union[PacketEvent, Dict[str, Any]]) -> str:
    """Read payload from event (dict or PacketEvent); avoids .keys() on model."""
    if isinstance(event, dict):
        return event.get("payload") or ""
    return getattr(event, "payload", None) or ""


async def analyze_xss(event: Union[PacketEvent, Dict[str, Any]]) -> AgentResult:
    """XSS analysis using Groq Llama 3."""
    payload_text = _payload(event) or ""
    return await analyze_with_llm(payload_text, "xss", XSS_SYSTEM_PROMPT)


async def analyze_sql_activity(event: Union[PacketEvent, Dict[str, Any]]) -> AgentResult:
    """SQL injection analysis using Groq Llama 3."""
    payload_text = _payload(event) or ""
    return await analyze_with_llm(payload_text, "sql", SQL_SYSTEM_PROMPT)


async def analyze_payload(event: Union[PacketEvent, Dict[str, Any]]) -> AgentResult:
    """Generic payload / anomaly analysis using Groq Llama 3."""
    payload_text = _payload(event) or ""
    return await analyze_with_llm(payload_text, "payload", PAYLOAD_SYSTEM_PROMPT)


async def _safe_run(agent_fn, event: Union[PacketEvent, Dict[str, Any]]) -> AgentResult:
    """
    Run an agent with a safety net so one failure does not crash the request.
    """
    try:
        return await agent_fn(event)
    except Exception as exc:
        return {
            "fault": "agent_error",
            "severity": "low",
            "explanation": f"Agent {agent_fn.__name__} failed: {exc}",
        }


def _event_to_dict(event: Union[PacketEvent, Dict[str, Any]]) -> Dict[str, Any]:
    """Ensure agents always receive a dict. PacketEvent has no .keys(); callers (or deps) may use mapping protocol."""
    if isinstance(event, dict):
        return event
    if hasattr(event, "model_dump") and callable(getattr(event, "model_dump")):
        return event.model_dump()
    return {}


async def run_agents_in_parallel(event: Union[PacketEvent, Dict[str, Any]]) -> list[AgentResult]:
    """
    Run XSS, SQL, and Payload agents in parallel. Used when not using the LangGraph pipeline.
    """
    event_dict = _event_to_dict(event)
    results = await asyncio.gather(
        _safe_run(analyze_xss, event_dict),
        _safe_run(analyze_sql_activity, event_dict),
        _safe_run(analyze_payload, event_dict),
    )
    return list(results)
