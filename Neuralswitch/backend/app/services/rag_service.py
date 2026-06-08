"""Retrieval-Augmented Generation: query embedding, retrieval, context assembly."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.config import settings
from app.schemas.chat import Source
from app.services.embedding_service import embed_texts
from app.services.vector_store import get_vector_store
from app.utils.token_utils import count_tokens


@dataclass
class RetrievalResult:
    context: str
    sources: list[Source] = field(default_factory=list)


def _build_where(document_ids: list[str] | None) -> dict | None:
    if not document_ids:
        return None
    if len(document_ids) == 1:
        return {"document_id": document_ids[0]}
    return {"document_id": {"$in": document_ids}}


def retrieve(
    query: str,
    *,
    top_k: int | None = None,
    score_threshold: float | None = None,
    max_context_tokens: int | None = None,
    document_ids: list[str] | None = None,
) -> RetrievalResult:
    top_k = top_k or settings.rag_top_k
    score_threshold = (
        settings.rag_score_threshold if score_threshold is None else score_threshold
    )
    max_context_tokens = max_context_tokens or settings.rag_max_context_tokens

    query_embedding = embed_texts([query])[0]
    store = get_vector_store()
    # over-fetch a little to allow threshold filtering
    raw = store.query(query_embedding, top_k=top_k * 2, where=_build_where(document_ids))

    selected: list[dict] = []
    for item in raw:
        if item["score"] >= score_threshold:
            selected.append(item)
        if len(selected) >= top_k:
            break

    # If nothing passed the threshold, keep the single best hit (better than nothing)
    if not selected and raw:
        selected = raw[:1]

    context_parts: list[str] = []
    sources: list[Source] = []
    used_tokens = 0

    for item in selected:
        meta = item.get("metadata") or {}
        text = item.get("document") or ""
        block_tokens = count_tokens(text)
        if used_tokens + block_tokens > max_context_tokens and context_parts:
            break
        used_tokens += block_tokens

        name = meta.get("document_name", "document")
        page = meta.get("page")
        header = f"[Source: {name}{f', page {page}' if page else ''}]"
        context_parts.append(f"{header}\n{text}")

        sources.append(
            Source(
                document_id=meta.get("document_id"),
                document_name=name,
                page=page,
                chunk_text=text[:500],
                score=round(float(item["score"]), 4),
            )
        )

    return RetrievalResult(context="\n\n---\n\n".join(context_parts), sources=sources)
