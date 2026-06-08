"""Placeholder external API tool module."""
from __future__ import annotations


def call_external_api(name: str, payload: dict) -> dict:
    return {
        "status": "not_implemented",
        "tool": name,
        "payload": payload,
    }
