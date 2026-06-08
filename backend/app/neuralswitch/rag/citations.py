from __future__ import annotations

from typing import Any


def build_citations(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks, start=1):
        citations.append(
            {
                "id": f"citation-{index}",
                "file_id": chunk.get("document_id"),
                "file_name": chunk.get("document_name") or chunk.get("filename") or "Document",
                "snippet": str(chunk.get("text") or "")[:500],
                "score": float(chunk.get("score") or 0),
            }
        )
    return citations
