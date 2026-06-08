from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.chat import ChartData, TableData


class ArtifactRequest(BaseModel):
    chat_id: str | None = None
    message_id: str | None = None
    artifact_type: str | None = None
    filename: str | None = None
    title: str | None = None
    answer: str | None = None
    table: TableData | None = None
    chart: ChartData | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArtifactOut(BaseModel):
    id: str
    type: str
    filename: str
    download_url: str
    preview_url: str
    preview_available: bool = True
    created_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArtifactResponse(BaseModel):
    artifact_id: str
    type: str
    filename: str
    download_url: str
    preview: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[ArtifactOut] = Field(default_factory=list)
