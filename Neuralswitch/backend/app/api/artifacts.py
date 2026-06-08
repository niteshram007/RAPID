from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.artifacts.artifact_router import create_artifact_from_request
from app.artifacts.artifact_schemas import ArtifactRequest, ArtifactResponse
from app.artifacts.file_storage import artifact_root, to_artifact_out
from app.database import get_db
from app.models.artifact import Artifact

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

MEDIA_TYPES = {
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv; charset=utf-8",
    "pdf": "application/pdf",
    "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "chart": "image/svg+xml",
    "png": "image/png",
    "dashboard": "text/html; charset=utf-8",
    "json": "application/json",
}


def _artifact_response(artifact: ArtifactResponse | object):
    return artifact


def _create(db: Session, request: ArtifactRequest, artifact_type: str) -> ArtifactResponse:
    try:
        artifact = create_artifact_from_request(db, request, artifact_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    preview = {
        "table": artifact.metadata.get("table") if isinstance(artifact.metadata, dict) else None,
        "chart": artifact.metadata.get("chart_payload") or artifact.metadata.get("chart") if isinstance(artifact.metadata, dict) else None,
    }
    return ArtifactResponse(
        artifact_id=artifact.id,
        type=artifact.type,
        filename=artifact.filename,
        download_url=artifact.download_url,
        preview=preview,
        artifacts=[artifact],
    )


@router.post("/excel", response_model=ArtifactResponse)
def create_excel(request: ArtifactRequest, db: Session = Depends(get_db)):
    return _create(db, request, "excel")


@router.post("/csv", response_model=ArtifactResponse)
def create_csv(request: ArtifactRequest, db: Session = Depends(get_db)):
    return _create(db, request, "csv")


@router.post("/pdf", response_model=ArtifactResponse)
def create_pdf(request: ArtifactRequest, db: Session = Depends(get_db)):
    return _create(db, request, "pdf")


@router.post("/word", response_model=ArtifactResponse)
def create_word(request: ArtifactRequest, db: Session = Depends(get_db)):
    return _create(db, request, "word")


@router.post("/chart", response_model=ArtifactResponse)
def create_chart(request: ArtifactRequest, db: Session = Depends(get_db)):
    requested_type = str(request.artifact_type or "").strip().lower()
    return _create(db, request, "png" if requested_type in {"png", "chart_png", "image"} else "chart")


@router.post("/dashboard", response_model=ArtifactResponse)
def create_dashboard(request: ArtifactRequest, db: Session = Depends(get_db)):
    return _create(db, request, "dashboard")


@router.get("/{artifact_id}/preview")
def preview_artifact(artifact_id: str, db: Session = Depends(get_db)):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    meta = artifact.meta or {}
    return {
        "artifact": to_artifact_out(artifact),
        "preview": {
            "table": meta.get("table"),
            "chart": meta.get("chart_payload") or meta.get("chart"),
            "title": meta.get("title"),
        },
    }


@router.get("/{artifact_id}/download")
def download_artifact(artifact_id: str, db: Session = Depends(get_db)):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    root = artifact_root()
    path = Path(artifact.file_path).resolve()
    if root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file is unavailable.")
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(artifact.artifact_type, "application/octet-stream"),
        filename=artifact.filename,
    )


@router.delete("/{artifact_id}")
def delete_artifact(artifact_id: str, db: Session = Depends(get_db)):
    artifact = db.get(Artifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    root = artifact_root()
    path = Path(artifact.file_path).resolve()
    if root in path.parents and path.exists():
        path.unlink()
    db.delete(artifact)
    db.commit()
    return {"ok": True}
