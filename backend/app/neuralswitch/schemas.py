from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NeuralSwitchChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str = Field(min_length=1)
    conversation_id: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)
    stream: bool = False
    attachments: list[Any] = Field(default_factory=list)
    document_ids: list[str] = Field(default_factory=list)
    model: str | None = None


class NeuralSwitchChatResponse(BaseModel):
    answer: str
    intent: str
    confidence: str = "medium"
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    tables: list[dict[str, Any]] = Field(default_factory=list)
    charts: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    conversation_id: str | None = None
