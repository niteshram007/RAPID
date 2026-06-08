from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.artifacts.artifact_schemas import ArtifactOut
from app.config import settings
from app.models.artifact import Artifact

ARTIFACT_EXTENSIONS = {
    "excel": ".xlsx",
    "csv": ".csv",
    "pdf": ".pdf",
    "word": ".docx",
    "chart": ".svg",
    "png": ".png",
    "dashboard": ".html",
    "json": ".json",
}


def artifact_root() -> Path:
    configured = os.getenv("ARTIFACT_DIR", "").strip()
    if configured:
        root = Path(configured)
    else:
        upload_root = Path(settings.upload_dir)
        root = upload_root.parent / "artifacts"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def sanitize_filename(value: str | None, *, fallback: str, extension: str) -> str:
    base = str(value or fallback).strip().replace("\\", "_").replace("/", "_")
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base)
    base = re.sub(r"\s+", "_", base).strip("._-")[:110]
    if not base:
        base = fallback
    if not base.lower().endswith(extension.lower()):
        base = f"{base}{extension}"
    return base


def artifact_download_url(artifact_id: str) -> str:
    return f"/artifacts/{artifact_id}/download"


def artifact_preview_url(artifact_id: str) -> str:
    return f"/artifacts/{artifact_id}/preview"


def register_artifact(
    db: Session,
    *,
    artifact_id: str | None = None,
    artifact_type: str,
    filename: str,
    file_path: Path,
    chat_id: str | None,
    message_id: str | None,
    metadata: dict[str, Any] | None = None,
) -> ArtifactOut:
    root = artifact_root()
    resolved_path = file_path.resolve()
    if root not in resolved_path.parents and resolved_path != root:
        raise ValueError("Artifact path is outside the configured artifact storage directory.")
    artifact_kwargs: dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": message_id,
        "artifact_type": artifact_type,
        "filename": filename,
        "file_path": str(resolved_path),
        "meta": metadata or {},
    }
    if artifact_id:
        artifact_kwargs["id"] = artifact_id
    artifact = Artifact(**artifact_kwargs)
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return to_artifact_out(artifact)


def to_artifact_out(artifact: Artifact) -> ArtifactOut:
    return ArtifactOut(
        id=artifact.id,
        type=artifact.artifact_type,
        filename=artifact.filename,
        download_url=artifact_download_url(artifact.id),
        preview_url=artifact_preview_url(artifact.id),
        preview_available=True,
        created_at=artifact.created_at,
        metadata=artifact.meta or {},
    )


def stored_artifact_path(artifact_type: str, artifact_id: str, filename: str) -> Path:
    extension = ARTIFACT_EXTENSIONS.get(artifact_type, Path(filename).suffix or ".dat")
    safe_name = sanitize_filename(filename, fallback=f"{artifact_type}_{artifact_id}", extension=extension)
    return artifact_root() / f"{artifact_id}_{safe_name}"
