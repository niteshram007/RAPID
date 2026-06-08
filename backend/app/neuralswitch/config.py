from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class NeuralSwitchRuntimeConfig:
    debug_trace_default: bool = False
    max_rows_per_table: int = 200
    max_sql_rows: int = 500
    ai_query_timeout_ms: int = 30000
    enable_sql_preview: bool = False
    enable_streaming: bool = True
    enable_live_web_tool: bool = False
    rag_max_chunks: int = 8
    embedding_model: str = "hashing-384"
    vector_db_url: str = ""
    model_registry_override: dict[str, Any] = field(default_factory=dict)
    local_llm: dict[str, Any] | None = None


def default_runtime_config() -> NeuralSwitchRuntimeConfig:
    return NeuralSwitchRuntimeConfig()
