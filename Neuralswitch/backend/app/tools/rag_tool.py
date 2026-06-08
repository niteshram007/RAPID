"""Thin wrapper around the RAG service for tool-based orchestration."""
from __future__ import annotations

from app.services import rag_service


def retrieve_context(query: str, document_ids: list[str] | None = None):
    return rag_service.retrieve(query, document_ids=document_ids)
