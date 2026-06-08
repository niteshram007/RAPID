"""Document endpoints: upload (with async processing), list, get, delete."""
from __future__ import annotations

import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models.document import Document
from app.schemas.document import DocumentOut, DocumentUploadResponse
from app.services.document_processor import (
    DocumentProcessingError,
    delete_document_vectors,
    process_document,
)
from app.utils.file_utils import detect_file_type, human_size, sanitize_filename

router = APIRouter(prefix="/documents", tags=["documents"])


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        chat_id=doc.chat_id,
        filename=doc.filename,
        file_type=doc.file_type,
        status=doc.status,
        chunk_count=doc.chunk_count,
        size_bytes=doc.size_bytes,
        error=doc.error,
        metadata=doc.meta,
        created_at=doc.created_at,
    )


def _process_in_background(document_id: str):
    """Runs in a FastAPI BackgroundTask with its own DB session."""
    db = SessionLocal()
    try:
        doc = db.get(Document, document_id)
        if doc is None:
            return
        try:
            process_document(db, doc)
        except DocumentProcessingError as exc:
            print(f"[documents] processing failed for {document_id}: {exc}")
    finally:
        db.close()


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_type = detect_file_type(file.filename or "")
    if not file_type:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, DOCX, TXT, CSV, XLSX, Markdown.",
        )

    contents = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Limit is {settings.max_upload_mb} MB.",
        )
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_name = sanitize_filename(file.filename or "upload")

    doc = Document(
        filename=safe_name,
        file_type=file_type,
        file_path="",
        status="uploaded",
        size_bytes=len(contents),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # store with a unique, id-prefixed path to avoid collisions
    stored_path = os.path.join(settings.upload_dir, f"{doc.id}_{safe_name}")
    with open(stored_path, "wb") as f:
        f.write(contents)
    doc.file_path = stored_path
    db.commit()

    background_tasks.add_task(_process_in_background, doc.id)

    return DocumentUploadResponse(
        id=doc.id,
        filename=doc.filename,
        status="processing",
        message=f"Uploaded {safe_name} ({human_size(len(contents))}). Processing started.",
    )


@router.get("", response_model=list[DocumentOut])
def list_documents(chat_id: str | None = Query(default=None), db: Session = Depends(get_db)):
    stmt = select(Document)
    if chat_id:
        stmt = stmt.where(Document.chat_id == chat_id)
    docs = db.scalars(stmt.order_by(Document.created_at.desc())).all()
    return [_to_out(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return _to_out(doc)


@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    delete_document_vectors(document_id)
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    db.delete(doc)
    db.commit()
    return {"ok": True, "deleted": document_id}
