"""
Shared types and schemas for SentinelAI.

Add Pydantic models or dataclasses here that are used by both
the FastAPI backend and any Python-side tooling.
"""

from shared.schemas import Alert, PacketEvent, Severity

__all__ = ["Alert", "PacketEvent", "Severity"]

