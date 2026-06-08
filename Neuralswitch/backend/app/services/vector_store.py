"""Vector store abstraction.

Default backend is ChromaDB (persistent, local). If Chroma is unavailable, falls
back to a simple in-memory cosine-similarity store so the app still runs.

The interface is small and provider-agnostic so Qdrant/pgvector/FAISS can be
added later without touching callers.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any

from sqlalchemy import create_engine, text

from app.config import settings

COLLECTION_NAME = "documents"
PGVECTOR_TABLE_NAME = "neuralswitch_vectors"


class VectorRecord:
    __slots__ = ("id", "embedding", "document", "metadata")

    def __init__(self, id: str, embedding: list[float], document: str, metadata: dict):
        self.id = id
        self.embedding = embedding
        self.document = document
        self.metadata = metadata


class InMemoryVectorStore:
    """Minimal cosine-similarity store used as a fallback."""

    def __init__(self):
        self._records: dict[str, VectorRecord] = {}

    def add(self, ids, embeddings, documents, metadatas):
        for i, emb, doc, meta in zip(ids, embeddings, documents, metadatas):
            self._records[i] = VectorRecord(i, emb, doc, meta)

    def query(self, embedding, top_k, where=None):
        scored = []
        for rec in self._records.values():
            if where and not _matches(rec.metadata, where):
                continue
            scored.append((_cosine(embedding, rec.embedding), rec))
        scored.sort(key=lambda x: x[0], reverse=True)
        scored = scored[:top_k]
        return [
            {
                "id": rec.id,
                "score": score,
                "document": rec.document,
                "metadata": rec.metadata,
            }
            for score, rec in scored
        ]

    def delete(self, where: dict):
        to_del = [i for i, rec in self._records.items() if _matches(rec.metadata, where)]
        for i in to_del:
            self._records.pop(i, None)


class ChromaVectorStore:
    def __init__(self, path: str):
        import chromadb  # lazy import

        os.makedirs(path, exist_ok=True)
        self._client = chromadb.PersistentClient(path=path)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )

    def add(self, ids, embeddings, documents, metadatas):
        self._collection.add(
            ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas
        )

    def query(self, embedding, top_k, where=None):
        res = self._collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where or None,
            include=["documents", "metadatas", "distances"],
        )
        out = []
        ids = res.get("ids", [[]])[0]
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[]])[0]
        for i, doc, meta, dist in zip(ids, docs, metas, dists):
            # cosine distance -> similarity
            out.append(
                {"id": i, "score": 1.0 - float(dist), "document": doc, "metadata": meta or {}}
            )
        return out

    def delete(self, where: dict):
        self._collection.delete(where=where)


class PGVectorStore:
    def __init__(self, url: str):
        normalized_url = str(url or "").strip()
        if normalized_url.startswith("postgres://"):
            normalized_url = f"postgresql+psycopg://{normalized_url[len('postgres://'):]}"
        elif normalized_url.startswith("postgresql://"):
            normalized_url = f"postgresql+psycopg://{normalized_url[len('postgresql://'):]}"
        self._engine = create_engine(normalized_url, pool_pre_ping=True, future=True)
        self._ensure_schema()

    def _ensure_schema(self):
        with self._engine.begin() as connection:
            connection.execute(text("create extension if not exists vector"))
            connection.execute(
                text(
                    f"""
                    create table if not exists {PGVECTOR_TABLE_NAME} (
                        id text primary key,
                        embedding vector,
                        document text not null,
                        metadata jsonb not null default '{{}}'::jsonb,
                        created_at timestamptz not null default now()
                    )
                    """
                )
            )

    def add(self, ids, embeddings, documents, metadatas):
        payload = [
            {
                "id": vector_id,
                "embedding": self._serialize_embedding(embedding),
                "document": document,
                "metadata": json.dumps(metadata or {}),
            }
            for vector_id, embedding, document, metadata in zip(ids, embeddings, documents, metadatas)
        ]
        with self._engine.begin() as connection:
            connection.execute(
                text(
                    f"""
                    insert into {PGVECTOR_TABLE_NAME} (id, embedding, document, metadata)
                    values (:id, cast(:embedding as vector), :document, cast(:metadata as jsonb))
                    on conflict (id)
                    do update set
                        embedding = excluded.embedding,
                        document = excluded.document,
                        metadata = excluded.metadata
                    """
                ),
                payload,
            )

    def query(self, embedding, top_k, where=None):
        serialized_embedding = self._serialize_embedding(embedding)
        where_sql, params = self._build_where_clause(where or {}, prefix="filter")
        params["query_embedding"] = serialized_embedding
        params["limit"] = int(top_k)
        with self._engine.connect() as connection:
            result = connection.execute(
                text(
                    f"""
                    select
                        id,
                        document,
                        metadata,
                        1 - (embedding <=> cast(:query_embedding as vector)) as score
                    from {PGVECTOR_TABLE_NAME}
                    {where_sql}
                    order by embedding <=> cast(:query_embedding as vector)
                    limit :limit
                    """
                ),
                params,
            )
            rows = result.mappings().all()
        return [
            {
                "id": row["id"],
                "score": float(row["score"] or 0.0),
                "document": row["document"],
                "metadata": row.get("metadata") or {},
            }
            for row in rows
        ]

    def delete(self, where: dict):
        where_sql, params = self._build_where_clause(where or {}, prefix="delete")
        if not where_sql:
            return
        with self._engine.begin() as connection:
            connection.execute(
                text(f"delete from {PGVECTOR_TABLE_NAME} {where_sql}"),
                params,
            )

    @staticmethod
    def _serialize_embedding(embedding: list[float]) -> str:
        return "[" + ",".join(f"{float(value):.12f}" for value in embedding) + "]"

    def _build_where_clause(
        self,
        where: dict[str, Any],
        *,
        prefix: str,
        depth: int = 0,
    ) -> tuple[str, dict[str, Any]]:
        if not where:
            return "", {}

        clauses: list[str] = []
        params: dict[str, Any] = {}
        for key, condition in where.items():
            if key == "$and" and isinstance(condition, list):
                nested = [
                    self._build_where_clause(item, prefix=f"{prefix}_{index}", depth=depth + 1)
                    for index, item in enumerate(condition)
                ]
                nested_clauses = [clause for clause, _ in nested if clause]
                if nested_clauses:
                    clauses.append(
                        "("
                        + " and ".join(clause.removeprefix("where ") for clause in nested_clauses)
                        + ")"
                    )
                for _, nested_params in nested:
                    params.update(nested_params)
                continue
            if key == "$or" and isinstance(condition, list):
                nested = [
                    self._build_where_clause(item, prefix=f"{prefix}_{index}", depth=depth + 1)
                    for index, item in enumerate(condition)
                ]
                nested_clauses = [clause for clause, _ in nested if clause]
                if nested_clauses:
                    clauses.append(
                        "("
                        + " or ".join(clause.removeprefix("where ") for clause in nested_clauses)
                        + ")"
                    )
                for _, nested_params in nested:
                    params.update(nested_params)
                continue

            json_key = key.replace("'", "''")
            if isinstance(condition, dict):
                if "$in" in condition:
                    placeholders: list[str] = []
                    for index, value in enumerate(condition["$in"]):
                        param_name = f"{prefix}_{depth}_{key}_{index}"
                        placeholders.append(f":{param_name}")
                        params[param_name] = str(value)
                    if placeholders:
                        clauses.append(f"metadata ->> '{json_key}' in ({', '.join(placeholders)})")
                    continue
                if "$eq" in condition:
                    param_name = f"{prefix}_{depth}_{key}_eq"
                    clauses.append(f"metadata ->> '{json_key}' = :{param_name}")
                    params[param_name] = str(condition["$eq"])
                    continue

            param_name = f"{prefix}_{depth}_{key}"
            clauses.append(f"metadata ->> '{json_key}' = :{param_name}")
            params[param_name] = str(condition)

        if not clauses:
            return "", params
        return "where " + " and ".join(clauses), params


_store = None


def get_vector_store():
    global _store
    if _store is not None:
        return _store
    if settings.vector_db == "pgvector":
        try:
            vector_url = (
                settings.vector_db_url
                or settings.rapid_database_url
                or settings.database_url
            )
            _store = PGVectorStore(vector_url)
            return _store
        except Exception as exc:  # pragma: no cover
            print(f"[vector_store] pgvector unavailable ({exc}); falling back")
    if settings.vector_db == "chroma":
        try:
            _store = ChromaVectorStore(settings.vector_db_path)
            return _store
        except Exception as exc:  # pragma: no cover
            print(f"[vector_store] Chroma unavailable ({exc}); using in-memory store")
    _store = InMemoryVectorStore()
    return _store


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _matches(metadata: dict[str, Any], where: dict[str, Any]) -> bool:
    """Support a tiny subset of Chroma's where syntax for the in-memory store."""
    for key, cond in where.items():
        if key == "$and":
            return all(_matches(metadata, c) for c in cond)
        if key == "$or":
            return any(_matches(metadata, c) for c in cond)
        if isinstance(cond, dict):
            if "$in" in cond and metadata.get(key) not in cond["$in"]:
                return False
            if "$eq" in cond and metadata.get(key) != cond["$eq"]:
                return False
        else:
            if metadata.get(key) != cond:
                return False
    return True
