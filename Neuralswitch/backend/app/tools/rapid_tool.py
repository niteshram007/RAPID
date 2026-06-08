"""RAPID tool metadata for the NeuralSwitch PostgreSQL + vector query path."""
from __future__ import annotations


def explain_placeholder(question: str) -> dict:
    return {
        "status": "configured",
        "message": (
            "RAPID mode uses vector-backed context retrieval, validated read-only SQL against "
            "PostgreSQL, and an LLM explanation layer for the final answer."
        ),
        "question": question,
    }
