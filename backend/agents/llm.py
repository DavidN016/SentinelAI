"""
Shared Groq/Llama 3 LLM layer for threat-analysis agents.

Requires GROQ_API_KEY in the environment. Uses ChatGroq with llama-3.1-8b-instant.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from dotenv import load_dotenv

load_dotenv()

# AgentResult shape: fault (str), severity ("high"|"medium"|"low"), explanation (str)
AgentResult = Dict[str, Any]

VALID_SEVERITIES = ("high", "medium", "low")
DEFAULT_RESULT: AgentResult = {
    "fault": "unknown",
    "severity": "low",
    "explanation": "Parse error or missing LLM response.",
}


def _get_llm():
    """Lazy init of ChatGroq to avoid import-time API key requirement."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Set it in the environment or a .env file to use threat-analysis agents."
        )
    from langchain_groq import ChatGroq

    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        api_key=api_key,
        max_retries=2,
    )


def _parse_llm_response(content: str) -> AgentResult:
    """Parse LLM content into AgentResult; normalize severity; fallback to DEFAULT_RESULT on error."""
    if not content or not content.strip():
        return dict(DEFAULT_RESULT)
    text = content.strip()
    # Extract JSON object: first { to matching }
    start = text.find("{")
    if start == -1:
        return dict(DEFAULT_RESULT)
    depth = 0
    end = -1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end == -1:
        return dict(DEFAULT_RESULT)
    try:
        data = json.loads(text[start:end])
        fault = str(data.get("fault") or DEFAULT_RESULT["fault"]).strip() or DEFAULT_RESULT["fault"]
        raw_severity = (data.get("severity") or "").strip().lower()
        severity = raw_severity if raw_severity in VALID_SEVERITIES else "low"
        explanation = str(data.get("explanation") or DEFAULT_RESULT["explanation"]).strip() or DEFAULT_RESULT["explanation"]
        return {"fault": fault, "severity": severity, "explanation": explanation}
    except (json.JSONDecodeError, TypeError):
        return dict(DEFAULT_RESULT)


async def analyze_with_llm(payload: str, agent_name: str, system_prompt: str) -> AgentResult:
    """
    Run the LLM with the given system prompt and payload; return an AgentResult.

    The system prompt should instruct the model to respond with JSON containing
    "fault", "severity" (high|medium|low), and "explanation". On parse failure
    or missing key, returns a safe default AgentResult.
    """
    llm = _get_llm()
    user_message = f"[{agent_name}] Analyze this payload and respond with JSON only (fault, severity, explanation):\n\n{payload}"
    messages = [
        ("system", system_prompt),
        ("human", user_message),
    ]
    # LangChain ChatGroq supports invoke; for async use ainvoke if available
    if hasattr(llm, "ainvoke"):
        response = await llm.ainvoke(messages)
    else:
        import asyncio
        response = await asyncio.to_thread(llm.invoke, messages)
    content = getattr(response, "content", None) or str(response)
    return _parse_llm_response(content)
