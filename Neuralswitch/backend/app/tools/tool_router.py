"""Deterministic tool routing for chat requests."""
from __future__ import annotations

from app.neural_switch.router import classify_question


def classify(message: str, *, use_rag: bool = True, use_web: bool = True, has_attachments: bool = False) -> tuple[str, list[str]]:
    decision = classify_question(
        message,
        {
            "has_attachments": has_attachments or use_rag,
            "use_web": use_web,
        },
    )
    return decision.mode, decision.reasons
