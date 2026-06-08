"""Schemas for attachment upload/list APIs."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id: str
    chat_id: str | None = None
    filename: str
    file_type: str
    status: str
    chunk_count: int
    size_bytes: int
    error: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class AttachmentUploadResponse(BaseModel):
    id: str
    chat_id: str | None = None
    filename: str
    status: str
    message: str
