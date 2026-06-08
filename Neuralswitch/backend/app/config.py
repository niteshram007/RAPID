"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "Local AI Chat Agent"
    environment: str = "development"

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ai_chat_agent"

    # LLM
    llm_base_url: str = "http://localhost:1234/v1"
    llm_api_key: str = "local-key"
    llm_model: str = "qwen2.5:7b-instruct"
    default_model: str = "qwen2.5:7b-instruct"
    available_models: Annotated[List[str], NoDecode] = [
        "qwen2.5:7b-instruct",
        "phi3-mini",
        "llama3.2:3b",
        "deepseek-coder",
    ]
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048
    llm_top_p: float = 1.0
    llm_streaming: bool = True

    # Embeddings
    embedding_provider: str = "sentence_transformers"
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Vector store
    vector_db: str = "chroma"
    vector_db_path: str = "./storage/vector_db"
    vector_db_url: str = ""

    # Uploads
    upload_dir: str = "./storage/uploads"
    max_upload_mb: int = 50

    # RAG
    rag_enabled: bool = True
    rag_top_k: int = 5
    rag_score_threshold: float = 0.35
    rag_max_context_tokens: int = 6000
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # Tools / real-time
    web_search_enabled: bool = True
    web_search_provider: str = "duckduckgo"
    web_search_api_key: str = ""
    web_search_max_results: int = 5
    auto_web_for_realtime: bool = True

    # Security
    # NoDecode: keep pydantic-settings from JSON-parsing the env value so the
    # comma-splitting validator below handles "a,b,c" strings.
    cors_origins: Annotated[List[str], NoDecode] = ["http://localhost:3000"]
    rate_limit_per_minute: int = 120

    # RAPID (future)
    rapid_database_url: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("available_models", mode="before")
    @classmethod
    def split_models(cls, v):
        if isinstance(v, str):
            return [m.strip() for m in v.split(",") if m.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
