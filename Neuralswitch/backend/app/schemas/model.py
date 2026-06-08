"""Schemas for model listing endpoint."""
from __future__ import annotations

from pydantic import BaseModel


class ModelItem(BaseModel):
    id: str
    name: str
    provider: str = "local"
    available: bool = True


class ModelListResponse(BaseModel):
    default_model: str
    models: list[ModelItem]
