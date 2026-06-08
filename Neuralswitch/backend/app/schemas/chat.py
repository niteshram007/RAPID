"""Pydantic schemas for chat endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

ChatMode = Literal["auto", "general", "rag", "rapid", "sql"]


class ChatRequest(BaseModel):
    chat_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=20000)
    mode: ChatMode = "general"
    model: Optional[str] = None
    use_rag: bool = False
    use_web: bool = False
    document_ids: list[str] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class Source(BaseModel):
    document_id: Optional[str] = None
    document_name: str
    page: Optional[int] = None
    chunk_text: str
    score: float = 0.0


class TableData(BaseModel):
    columns: list[str]
    rows: list[list[Any]]


class ChartData(BaseModel):
    type: str
    x: str
    y: str


class ChatResponse(BaseModel):
    chat_id: str
    message_id: str
    answer: str
    type: str = "text"
    sources: list[Source] = Field(default_factory=list)
    table: Optional[TableData] = None
    chart: Optional[ChartData] = None
    suggested_questions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    sources: Optional[list[Any]] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatDetail(ChatSummary):
    messages: list[MessageOut] = Field(default_factory=list)


class CreateChatRequest(BaseModel):
    title: Optional[str] = "New chat"


class RenameChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
