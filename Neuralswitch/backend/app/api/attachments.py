"""Attachment endpoints for chat-input uploads."""
from __future__ import annotations

import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models.document import Document
from app.schemas.attachment import AttachmentOut, AttachmentUploadResponse
from app.services.document_processor import (
    DocumentProcessingError,
    delete_document_vectors,
    process_document,
)
from app.utils.file_utils import detect_file_type, human_size, sanitize_filename

router = APIRouter(prefix="/attachments", tags=["attachments"])


def _to_out(doc: Document) -> AttachmentOut:
    return AttachmentOut(
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


def _process_in_background(attachment_id: str):
    db = SessionLocal()
    try:
        item = db.get(Document, attachment_id)
        if item is None:
            return
        try:
            process_document(db, item)
        except DocumentProcessingError as exc:
            print(f"[attachments] processing failed for {attachment_id}: {exc}")
    finally:
        db.close()


@router.post("/upload", response_model=AttachmentUploadResponse)
async def upload_attachment(
    background_tasks: BackgroundTasks,
    chat_id: str | None = Form(default=None),
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
        raise HTTPException(status_code=413, detail=f"File too large. Limit is {settings.max_upload_mb} MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    os.makedirs(settings.upload_dir, exist_ok=True)
    safe_name = sanitize_filename(file.filename or "upload")
    item = Document(
        chat_id=chat_id,
        filename=safe_name,
        file_type=file_type,
        file_path="",
        status="uploaded",
        size_bytes=len(contents),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    stored_path = os.path.join(settings.upload_dir, f"{item.id}_{safe_name}")
    with open(stored_path, "wb") as f:
        f.write(contents)
    item.file_path = stored_path
    db.commit()
    background_tasks.add_task(_process_in_background, item.id)
    return AttachmentUploadResponse(
        id=item.id,
        chat_id=item.chat_id,
        filename=item.filename,
        status="processing",
        message=f"Uploaded {safe_name} ({human_size(len(contents))}). Processing started.",
    )


@router.get("/{attachment_id}", response_model=AttachmentOut)
def get_attachment(attachment_id: str, db: Session = Depends(get_db)):
    item = db.get(Document, attachment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return _to_out(item)


@router.delete("/{attachment_id}")
def delete_attachment(attachment_id: str, db: Session = Depends(get_db)):
    item = db.get(Document, attachment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    delete_document_vectors(attachment_id)
    if item.file_path and os.path.exists(item.file_path):
        try:
            os.remove(item.file_path)
        except OSError:
            pass
    db.delete(item)
    db.commit()
    return {"ok": True, "deleted": attachment_id}
