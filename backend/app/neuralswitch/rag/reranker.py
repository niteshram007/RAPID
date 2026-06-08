from __future__ import annotations

from typing import Any


def rerank_chunks(chunks: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    return sorted(chunks, key=lambda chunk: float(chunk.get("score") or 0), reverse=True)[:limit]
