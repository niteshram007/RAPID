from __future__ import annotations

import hashlib
import math
import re
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Sequence

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qdrant_models
except Exception:  # pragma: no cover
    QdrantClient = None  # type: ignore[assignment]
    qdrant_models = None  # type: ignore[assignment]

ROOT_DIR = Path(__file__).resolve().parents[2]
QDRANT_STORAGE_PATH = ROOT_DIR / "backend" / "storage" / "qdrant"
DEFAULT_COLLECTION_NAME = "rapid_rag_chunks_v1"
DEFAULT_VECTOR_SIZE = 384

_TOKEN_PATTERN = re.compile(r"[a-z0-9]{2,}")
_SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[\.\!\?])\s+")


def build_document_id(name: str, summary: str, chunks: Sequence[str]) -> str:
    normalized_name = name.strip().lower()
    normalized_summary = re.sub(r"\s+", " ", summary).strip().lower()
    preview_chunks = " ".join(chunks[:4]).strip().lower()
    digest_input = f"{normalized_name}|{normalized_summary}|{preview_chunks}"
    return hashlib.sha1(digest_input.encode("utf-8")).hexdigest()


def semantic_chunk_text(
    text: str,
    target_chars: int = 900,
    overlap_chars: int = 140,
    max_chunks: int = 80,
) -> List[str]:
    normalized = re.sub(r"\r\n?", "\n", text)
    normalized = re.sub(r"[ \t]+", " ", normalized).strip()
    if not normalized:
        return []

    paragraphs = [item.strip() for item in normalized.split("\n\n") if item.strip()]
    if not paragraphs:
        paragraphs = [normalized]

    chunks: List[str] = []
    current = ""

    def flush_current() -> None:
        nonlocal current
        clean = re.sub(r"\s+", " ", current).strip()
        if clean:
            chunks.append(clean)
        current = ""

    for paragraph in paragraphs:
        sentences = [
            sentence.strip()
            for sentence in _SENTENCE_BOUNDARY_PATTERN.split(paragraph)
            if sentence.strip()
        ]
        if not sentences:
            sentences = [paragraph]

        for sentence in sentences:
            if not current:
                current = sentence
                continue

            candidate = f"{current} {sentence}".strip()
            if len(candidate) <= target_chars:
                current = candidate
                continue

            flush_current()
            if len(chunks) >= max_chunks:
                break

            if chunks:
                overlap_seed = chunks[-1][-overlap_chars:].strip()
                if overlap_seed:
                    current = f"{overlap_seed} {sentence}".strip()
                else:
                    current = sentence
            else:
                current = sentence

        if len(chunks) >= max_chunks:
            break

    if len(chunks) < max_chunks and current:
        flush_current()

    deduped: List[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        fingerprint = chunk.lower()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        deduped.append(chunk)

    return deduped[:max_chunks]


class HashingEmbeddingModel:
    def __init__(self, dimension: int = DEFAULT_VECTOR_SIZE) -> None:
        self.dimension = dimension

    def embed(self, text: str) -> List[float]:
        vec = [0.0] * self.dimension
        tokens = self._tokens(text)
        if not tokens:
            return vec

        for index, token in enumerate(tokens):
            self._update_dense_vector(vec, token, 1.0)
            if index < len(tokens) - 1:
                pair = f"{token}_{tokens[index + 1]}"
                self._update_dense_vector(vec, pair, 0.65)

        norm = math.sqrt(sum(value * value for value in vec))
        if norm == 0:
            return vec
        return [value / norm for value in vec]

    def embed_batch(self, texts: Sequence[str]) -> List[List[float]]:
        return [self.embed(text) for text in texts]

    def _tokens(self, text: str) -> List[str]:
        normalized = re.sub(r"\s+", " ", text.strip().lower())
        if not normalized:
            return []
        return _TOKEN_PATTERN.findall(normalized)

    def _update_dense_vector(self, vector: List[float], feature: str, weight: float) -> None:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        numeric = int.from_bytes(digest, byteorder="big", signed=False)
        slot = numeric % self.dimension
        sign = -1.0 if (numeric >> 8) & 1 else 1.0
        vector[slot] += sign * weight


class QdrantRagStore:
    def __init__(
        self,
        collection_name: str = DEFAULT_COLLECTION_NAME,
        vector_size: int = DEFAULT_VECTOR_SIZE,
    ) -> None:
        self.collection_name = collection_name
        self.vector_size = vector_size
        self._embedder = HashingEmbeddingModel(dimension=vector_size)
        self._lock = Lock()
        self._available = False
        self._client: Any = None

        if QdrantClient is None or qdrant_models is None:
            return

        try:
            QDRANT_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
            self._client = QdrantClient(path=str(QDRANT_STORAGE_PATH))
            self._ensure_collection()
            self._available = True
        except Exception:
            self._available = False
            self._client = None

    @property
    def available(self) -> bool:
        return self._available and self._client is not None

    def _ensure_collection(self) -> None:
        if not self._client:
            return

        with self._lock:
            exists = False
            try:
                exists = bool(self._client.collection_exists(self.collection_name))
            except Exception:
                try:
                    self._client.get_collection(self.collection_name)
                    exists = True
                except Exception:
                    exists = False

            if exists:
                return

            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=qdrant_models.VectorParams(
                    size=self.vector_size,
                    distance=qdrant_models.Distance.COSINE,
                ),
            )

    def ensure_indexed_attachments(self, attachments: Sequence[Dict[str, Any]]) -> List[str]:
        if not self.available:
            return []

        document_ids: List[str] = []
        for attachment in attachments:
            prepared = self._prepare_attachment(attachment)
            if not prepared:
                continue

            document_id = prepared["document_id"]
            document_ids.append(document_id)
            if self._has_document(document_id):
                continue

            self.index_document(
                document_id=document_id,
                name=prepared["name"],
                summary=prepared["summary"],
                chunks=prepared["chunks"],
            )

        return document_ids

    def index_document(
        self,
        document_id: str,
        name: str,
        summary: str,
        chunks: Sequence[str],
    ) -> int:
        if not self.available:
            return 0

        normalized_chunks = [chunk.strip() for chunk in chunks if chunk.strip()]
        if not normalized_chunks and summary.strip():
            normalized_chunks = semantic_chunk_text(summary.strip())
        if not normalized_chunks:
            return 0

        vectors = self._embedder.embed_batch(normalized_chunks)
        points = []
        for index, (chunk, vector) in enumerate(zip(normalized_chunks, vectors)):
            payload = {
                "document_id": document_id,
                "document_name": name,
                "summary": summary,
                "chunk_index": index,
                "text": chunk,
            }
            points.append(
                qdrant_models.PointStruct(
                    id=self._point_id(document_id, index),
                    vector=vector,
                    payload=payload,
                )
            )

        if not points:
            return 0

        self._client.upsert(
            collection_name=self.collection_name,
            wait=False,
            points=points,
        )
        return len(points)

    def retrieve(
        self,
        query: str,
        limit: int = 6,
        allowed_document_ids: Sequence[str] | None = None,
    ) -> List[Dict[str, Any]]:
        if not self.available:
            return []

        cleaned_query = re.sub(r"\s+", " ", query).strip()
        if not cleaned_query:
            return []

        vector = self._embedder.embed(cleaned_query)
        raw_hits = self._search(vector, max(limit * 4, limit))
        if not raw_hits:
            return []

        allowed = set(allowed_document_ids or [])
        output: List[Dict[str, Any]] = []
        seen_texts: set[str] = set()
        for hit in raw_hits:
            payload = dict(hit.get("payload") or {})
            text = str(payload.get("text") or "").strip()
            if not text:
                continue

            document_id = str(payload.get("document_id") or "").strip()
            if allowed and document_id and document_id not in allowed:
                continue

            fingerprint = text.lower()
            if fingerprint in seen_texts:
                continue
            seen_texts.add(fingerprint)

            output.append(
                {
                    "document_id": document_id,
                    "document_name": str(payload.get("document_name") or "Document"),
                    "chunk_index": int(payload.get("chunk_index") or 0),
                    "text": text,
                    "score": float(hit.get("score") or 0.0),
                }
            )
            if len(output) >= limit:
                break

        return output

    def _search(self, vector: Sequence[float], limit: int) -> List[Dict[str, Any]]:
        if not self._client:
            return []

        try:
            points = self._client.search(
                collection_name=self.collection_name,
                query_vector=list(vector),
                limit=limit,
                with_payload=True,
            )
            return [self._normalize_hit(point) for point in points]
        except Exception:
            pass

        try:
            response = self._client.query_points(
                collection_name=self.collection_name,
                query=list(vector),
                limit=limit,
                with_payload=True,
            )
            points = getattr(response, "points", [])
            return [self._normalize_hit(point) for point in points]
        except Exception:
            return []

    def _normalize_hit(self, hit: Any) -> Dict[str, Any]:
        payload = {}
        score = 0.0

        if isinstance(hit, dict):
            payload = dict(hit.get("payload") or {})
            score = float(hit.get("score") or 0.0)
        else:
            payload = dict(getattr(hit, "payload", {}) or {})
            score = float(getattr(hit, "score", 0.0) or 0.0)

        return {
            "payload": payload,
            "score": score,
        }

    def _has_document(self, document_id: str) -> bool:
        if not self.available or not document_id:
            return False

        try:
            response = self._client.count(
                collection_name=self.collection_name,
                count_filter=qdrant_models.Filter(
                    must=[
                        qdrant_models.FieldCondition(
                            key="document_id",
                            match=qdrant_models.MatchValue(value=document_id),
                        )
                    ]
                ),
                exact=False,
            )
            return int(getattr(response, "count", 0) or 0) > 0
        except Exception:
            return False

    def _prepare_attachment(self, attachment: Dict[str, Any]) -> Dict[str, Any] | None:
        name = str(attachment.get("name") or "Document").strip()
        summary = str(attachment.get("summary") or "").strip()
        raw_chunks = attachment.get("chunks")
        chunks = self._normalize_chunks(raw_chunks)

        if not chunks and summary:
            chunks = semantic_chunk_text(summary)
        if not chunks and not summary:
            return None

        document_id = str(
            attachment.get("documentId")
            or attachment.get("document_id")
            or attachment.get("id")
            or ""
        ).strip()
        if not document_id:
            document_id = build_document_id(name, summary, chunks)

        attachment["documentId"] = document_id
        return {
            "document_id": document_id,
            "name": name,
            "summary": summary,
            "chunks": chunks,
        }

    def _normalize_chunks(self, value: Any) -> List[str]:
        if not isinstance(value, list):
            return []

        normalized = []
        for item in value:
            chunk = str(item or "").strip()
            if chunk:
                normalized.append(chunk)
        return normalized[:120]

    def _point_id(self, document_id: str, chunk_index: int) -> int:
        digest = hashlib.blake2b(
            f"{document_id}:{chunk_index}".encode("utf-8"),
            digest_size=8,
        ).digest()
        value = int.from_bytes(digest, byteorder="big", signed=False)
        bounded = value & 0x7FFF_FFFF_FFFF_FFFF
        return bounded if bounded > 0 else chunk_index + 1


_GLOBAL_RAG_STORE: QdrantRagStore | None = None


def get_rag_store() -> QdrantRagStore:
    global _GLOBAL_RAG_STORE
    if _GLOBAL_RAG_STORE is None:
        _GLOBAL_RAG_STORE = QdrantRagStore()
    return _GLOBAL_RAG_STORE


def retrieve_rag_chunks(
    query: str,
    attachments: Sequence[Dict[str, Any]],
    limit: int = 6,
) -> List[Dict[str, Any]]:
    store = get_rag_store()
    if not store.available:
        return []

    document_ids = store.ensure_indexed_attachments(attachments)
    return store.retrieve(query=query, limit=limit, allowed_document_ids=document_ids)
