"""Schemas for tool endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ToolRouteRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    use_rag: bool = True
    use_web: bool = True


class ToolRouteResponse(BaseModel):
    route: str
    reasons: list[str] = Field(default_factory=list)


class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=5000)
    max_results: int | None = Field(default=None, ge=1, le=20)


class CalculateRequest(BaseModel):
    expression: str = Field(..., min_length=1, max_length=500)
