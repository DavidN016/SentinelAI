"""
Pydantic models for SentinelAI event and alert payloads.

Used by the FastAPI backend (WebSocket, agents) and any Python tooling.
"""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# --- 1.1.1 PacketEvent ---


class PacketEvent(BaseModel):
    """Incoming packet or query event from capture/stream."""

    timestamp: datetime = Field(..., description="When the event was captured or observed")
    source: str = Field(..., description="Source identifier (e.g. IP, hostname, process)")
    payload: str = Field(..., description="Query or payload text (e.g. SQL snippet, request body)")
    metadata: Optional[dict[str, Any]] = Field(default=None, description="Optional extra context")

    model_config = {"extra": "forbid"}


# --- 1.1.2 Alert ---


Severity = Literal["high", "medium", "low"]


class Alert(BaseModel):
    """Threat or anomaly alert produced by the analysis pipeline."""

    fault: str = Field(..., description="Type or name of the fault (e.g. SQL injection, anomaly)")
    severity: Severity = Field(..., description="Alert severity level")
    explanation: str = Field(..., description="Human-readable explanation of the threat")
    is_repeat_offender: bool = Field(
        default=False,
        description="True if this matches a previously seen pattern (e.g. Chroma cache hit)",
    )
    event_id: str = Field(..., description="ID of the PacketEvent this alert refers to")

    model_config = {"extra": "forbid"}
