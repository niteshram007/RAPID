"""Pydantic schemas for document endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    chat_id: str | None = None
    filename: str
    file_type: str
    status: str
    chunk_count: int
    size_bytes: int
    error: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime


class DocumentUploadResponse(BaseModel):
    id: str
    filename: str
    status: str
    message: str
