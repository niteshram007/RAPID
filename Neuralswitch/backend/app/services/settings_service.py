"""Effective settings = .env defaults overridden by the `settings` DB table.

Provides a single `get_effective_settings(db)` used across services so that the
`/settings` page can change LLM/RAG behaviour at runtime without a restart.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.config import settings as env_settings
from app.models.settings import Setting
from app.prompts.system_prompt import DEFAULT_SYSTEM_PROMPT
from app.services.llm_client import LLMClient

SETTINGS_KEY = "llm_config"


def _defaults() -> dict[str, Any]:
    return {
        "provider_name": "Local LLM",
        "llm_base_url": env_settings.llm_base_url,
        "llm_api_key": env_settings.llm_api_key,
        "llm_model": env_settings.llm_model,
        "default_model": env_settings.default_model,
        "available_models": env_settings.available_models,
        "temperature": env_settings.llm_temperature,
        "max_tokens": env_settings.llm_max_tokens,
        "top_p": env_settings.llm_top_p,
        "streaming": env_settings.llm_streaming,
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "rag_enabled": env_settings.rag_enabled,
        "rag_top_k": env_settings.rag_top_k,
        "rag_score_threshold": env_settings.rag_score_threshold,
        "embedding_model": env_settings.embedding_model,
        "vector_db": env_settings.vector_db,
        "chunk_size": env_settings.chunk_size,
        "chunk_overlap": env_settings.chunk_overlap,
        "web_search_enabled": env_settings.web_search_enabled,
        "web_search_provider": env_settings.web_search_provider,
        "web_search_api_key": env_settings.web_search_api_key,
        "web_search_max_results": env_settings.web_search_max_results,
        "auto_web_for_realtime": env_settings.auto_web_for_realtime,
    }


def get_effective_settings(db: Session) -> dict[str, Any]:
    merged = _defaults()
    row = db.get(Setting, SETTINGS_KEY)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if v is not None:
                merged[k] = v
    return merged


def update_settings(db: Session, patch: dict[str, Any]) -> dict[str, Any]:
    row = db.get(Setting, SETTINGS_KEY)
    current: dict[str, Any] = dict(row.value) if (row and isinstance(row.value, dict)) else {}
    for k, v in patch.items():
        if v is not None:
            current[k] = v
    if row is None:
        row = Setting(key=SETTINGS_KEY, value=current)
        db.add(row)
    else:
        row.value = current
    db.commit()
    return get_effective_settings(db)


def public_settings(db: Session) -> dict[str, Any]:
    """Effective settings with the API key masked for client display."""
    cfg = get_effective_settings(db)
    cfg = dict(cfg)
    if cfg.get("llm_api_key"):
        cfg["llm_api_key"] = "********"
    return cfg


def llm_client_from_settings(db: Session) -> LLMClient:
    cfg = get_effective_settings(db)
    return LLMClient(base_url=cfg["llm_base_url"], api_key=cfg.get("llm_api_key") or "local-key")
