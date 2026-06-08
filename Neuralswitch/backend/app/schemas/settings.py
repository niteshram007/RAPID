"""Pydantic schemas for the settings endpoints."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LLMSettings(BaseModel):
    """Runtime-configurable settings. All optional on update (partial patch)."""

    provider_name: Optional[str] = "Local LLM"
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    default_model: Optional[str] = None
    available_models: Optional[list[str]] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=131072)
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0)
    streaming: Optional[bool] = None

    # System prompt / RAG
    system_prompt: Optional[str] = None
    rag_enabled: Optional[bool] = None
    rag_top_k: Optional[int] = Field(None, ge=1, le=50)
    rag_score_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    chunk_size: Optional[int] = Field(None, ge=100, le=8000)
    chunk_overlap: Optional[int] = Field(None, ge=0, le=2000)
    embedding_model: Optional[str] = None
    vector_db: Optional[str] = None

    # Real-time tools
    web_search_enabled: Optional[bool] = None
    web_search_provider: Optional[str] = None
    web_search_api_key: Optional[str] = None
    web_search_max_results: Optional[int] = Field(None, ge=1, le=20)
    auto_web_for_realtime: Optional[bool] = None


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str
    models: list[str] = Field(default_factory=list)
