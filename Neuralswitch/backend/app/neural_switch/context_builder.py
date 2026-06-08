from __future__ import annotations

import json
from typing import Any

from app.models.chat import Message
from app.schemas.chat import Source
from app.services import memory_service


def build_history_context(history: list[Message], max_tokens: int = 1600) -> str:
    history_text = memory_service.format_history_text(history, max_tokens=max_tokens)
    return history_text or "No prior chat context."


def build_search_context(results: list[dict[str, Any]]) -> tuple[str, list[Source]]:
    context_blocks: list[str] = []
    sources: list[Source] = []
    for result in results:
        title = str(result.get("title") or "Source").strip()
        url = str(result.get("url") or "").strip()
        snippet = str(result.get("snippet") or "").strip()
        published_date = str(result.get("published_date") or "").strip()
        lines = [f"Title: {title}"]
        if url:
            lines.append(f"URL: {url}")
        if published_date:
            lines.append(f"Published: {published_date}")
        if snippet:
            lines.append(f"Snippet: {snippet}")
        context_blocks.append("\n".join(lines))
        sources.append(
            Source(
                document_id=url or title,
                document_name=title,
                page=None,
                chunk_text=snippet[:500],
                score=float(result.get("score") or 1.0),
            )
        )
    return "\n\n".join(context_blocks) or "No search context available.", sources


def build_search_fallback(results: list[dict[str, Any]], lead: str) -> str:
    if not results:
        return "I could not find enough reliable source material to answer that clearly."
    lines = [lead]
    for result in results[:3]:
        title = str(result.get("title") or "Source").strip()
        url = str(result.get("url") or "").strip()
        snippet = str(result.get("snippet") or "").strip()
        if url:
            lines.append(f"- [{title}]({url}): {snippet}")
        else:
            lines.append(f"- {title}: {snippet}")
    return "\n".join(lines)


def build_rag_fallback(question: str, sources: list[Source]) -> str:
    if not sources:
        return "I could not find enough information in the uploaded document to answer that."
    first = sources[0]
    return (
        f"From the uploaded material, the closest match for '{question.strip()}' comes from "
        f"{first.document_name}.\n\n{first.chunk_text}"
    )


def serialize_structured_payload(*, table: Any = None, chart: Any = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = dict(extra or {})
    if table is not None:
        payload["table"] = table.model_dump() if hasattr(table, "model_dump") else table
    if chart is not None:
        payload["chart"] = chart.model_dump() if hasattr(chart, "model_dump") else chart
    return json.loads(json.dumps(payload, ensure_ascii=True, default=str))
