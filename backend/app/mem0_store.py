from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from typing import Any, Iterable

from .store import get_settings

try:
    from mem0 import Memory
except Exception:  # pragma: no cover
    Memory = None  # type: ignore[assignment]

ROOT_DIR = Path(__file__).resolve().parents[2]
MEM0_DIR = ROOT_DIR / "backend" / "storage" / "mem0"
MEM0_QDRANT_PATH = MEM0_DIR / "qdrant"
MEM0_HISTORY_DB = MEM0_DIR / "history.db"
MEM0_COLLECTION_NAME = "rapid_workspace_memories"
FASTEMBED_MODEL = "BAAI/bge-small-en-v1.5"
FASTEMBED_DIMS = 384
MAX_MEMORIES_PER_THREAD_SYNC = 16

_MEM0_LOCK = Lock()
_MEM0_CLIENT: Any = None
_MEM0_SIGNATURE = ""


def _clean_text(value: Any, limit: int = 600) -> str:
    text = " ".join(str(value or "").split()).strip()
    return text[:limit]


def _normalize_openai_base_url() -> str:
    settings = get_settings()
    for raw_base in (
        str(settings.get("localLlmBaseUrl", "")).strip(),
        str(settings.get("localLlmPlatformBaseUrl", "")).strip(),
    ):
        if not raw_base:
            continue
        base = raw_base.rstrip("/")
        return base if base.endswith("/v1") else f"{base}/v1"
    return "https://api.openai.com/v1"


def _build_signature() -> str:
    settings = get_settings()
    return "|".join(
        [
            _normalize_openai_base_url(),
            str(settings.get("localLlmModel", "")).strip(),
            str(bool(settings.get("localLlmApiKey"))),
        ]
    )


def _build_config() -> dict[str, Any]:
    settings = get_settings()
    api_key = str(settings.get("localLlmApiKey", "")).strip()

    MEM0_DIR.mkdir(parents=True, exist_ok=True)
    MEM0_QDRANT_PATH.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MEM0_DIR", str(MEM0_DIR))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

    return {
        "llm": {
            "provider": "openai",
            "config": {
                "model": str(settings.get("localLlmModel", "")).strip() or "rapid-general",
                "api_key": api_key or "placeholder-key",
                "openai_base_url": _normalize_openai_base_url(),
            },
        },
        "embedder": {
            "provider": "fastembed",
            "config": {
                "model": FASTEMBED_MODEL,
                "embedding_dims": FASTEMBED_DIMS,
            },
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": MEM0_COLLECTION_NAME,
                "path": str(MEM0_QDRANT_PATH),
                "on_disk": True,
                "embedding_model_dims": FASTEMBED_DIMS,
            },
        },
        "history_db_path": str(MEM0_HISTORY_DB),
    }


def get_mem0_client() -> Any | None:
    global _MEM0_CLIENT, _MEM0_SIGNATURE

    if Memory is None:
        return None

    signature = _build_signature()
    with _MEM0_LOCK:
        if _MEM0_CLIENT is not None and _MEM0_SIGNATURE == signature:
            return _MEM0_CLIENT

        try:
            _MEM0_CLIENT = Memory.from_config(_build_config())
            _MEM0_SIGNATURE = signature
        except Exception:
            _MEM0_CLIENT = None
            _MEM0_SIGNATURE = ""

        return _MEM0_CLIENT


def _extract_memory_strings(payload: Any, limit: int) -> list[str]:
    if not isinstance(payload, dict):
        return []

    results = payload.get("results")
    if not isinstance(results, list):
        return []

    output: list[str] = []
    seen: set[str] = set()
    for item in results:
        if not isinstance(item, dict):
            continue
        memory = _clean_text(item.get("memory"), limit=600)
        if not memory:
            continue
        fingerprint = memory.lower()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        output.append(memory)
        if len(output) >= limit:
            break
    return output


def search_mem0_memories(user_id: str, query: str, limit: int = 5) -> list[str]:
    client = get_mem0_client()
    if client is None:
        return []

    cleaned_user_id = _clean_text(user_id, limit=120)
    cleaned_query = _clean_text(query, limit=400)
    if not cleaned_user_id or not cleaned_query:
        return []

    try:
        payload = client.search(
            cleaned_query,
            user_id=cleaned_user_id,
            limit=max(1, min(limit, 8)),
            rerank=False,
        )
    except Exception:
        return []

    return _extract_memory_strings(payload, limit=max(1, min(limit, 8)))


def add_mem0_memories(user_id: str, thread_id: str, memories: Iterable[str]) -> int:
    client = get_mem0_client()
    if client is None:
        return 0

    cleaned_user_id = _clean_text(user_id, limit=120)
    cleaned_thread_id = _clean_text(thread_id, limit=120)
    if not cleaned_user_id or not cleaned_thread_id:
        return 0

    count = 0
    seen: set[str] = set()
    for raw_memory in list(memories)[:MAX_MEMORIES_PER_THREAD_SYNC]:
        memory = _clean_text(raw_memory, limit=600)
        if not memory:
            continue
        fingerprint = memory.lower()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)

        try:
            payload = client.add(
                memory,
                user_id=cleaned_user_id,
                metadata={"thread_id": cleaned_thread_id, "source": "rapid-workspace"},
                infer=False,
            )
            if isinstance(payload, dict):
                count += len(payload.get("results", []) or [])
            else:
                count += 1
        except Exception:
            continue

    return count


def delete_thread_memories(user_id: str, thread_ids: Iterable[str]) -> int:
    client = get_mem0_client()
    if client is None:
        return 0

    cleaned_user_id = _clean_text(user_id, limit=120)
    if not cleaned_user_id:
        return 0

    deleted = 0
    for raw_thread_id in thread_ids:
        cleaned_thread_id = _clean_text(raw_thread_id, limit=120)
        if not cleaned_thread_id:
            continue

        try:
            payload = client.get_all(
                user_id=cleaned_user_id,
                filters={"thread_id": cleaned_thread_id},
                limit=200,
            )
        except Exception:
            continue

        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list):
            continue

        for item in results:
            if not isinstance(item, dict):
                continue
            memory_id = _clean_text(item.get("id"), limit=160)
            if not memory_id:
                continue
            try:
                client.delete(memory_id)
                deleted += 1
            except Exception:
                continue

    return deleted
