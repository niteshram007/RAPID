"""Pluggable embedding service.

Providers (set via EMBEDDING_PROVIDER):
- sentence_transformers : local model (default, recommended, fully offline)
- openai                : use the LLM server's /embeddings endpoint
- hash                  : deterministic offline fallback (no ML deps; low quality)

The interface is intentionally tiny so the implementation can be swapped.
"""
from __future__ import annotations

import hashlib
import math
from typing import Protocol

from app.config import settings


class Embedder(Protocol):
    dimension: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer  # lazy import

        self.model = SentenceTransformer(model_name)
        self.dimension = self.model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(
            texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        )
        return [v.tolist() for v in vectors]


class HashEmbedder:
    """Deterministic bag-of-hashed-words embedding. Offline, dependency-free.

    Quality is far lower than a real model, but it keeps the system runnable in
    constrained environments and is fully deterministic for tests.
    """

    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dimension
        for token in text.lower().split():
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dimension
            sign = 1.0 if (h >> 7) & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


# Lazily-built singleton so model load happens once.
_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is not None:
        return _embedder

    provider = settings.embedding_provider
    if provider == "sentence_transformers":
        try:
            _embedder = SentenceTransformerEmbedder(settings.embedding_model)
        except Exception as exc:  # model download/load failed -> degrade gracefully
            print(f"[embedding] sentence-transformers unavailable ({exc}); using hash fallback")
            _embedder = HashEmbedder()
    elif provider == "hash":
        _embedder = HashEmbedder()
    else:
        # 'openai' provider is handled at call sites that have an LLMClient;
        # default to hash here to avoid hard failures.
        _embedder = HashEmbedder()
    return _embedder


def embed_texts(texts: list[str]) -> list[list[float]]:
    return get_embedder().embed(texts)


def embedding_dimension() -> int:
    return get_embedder().dimension
