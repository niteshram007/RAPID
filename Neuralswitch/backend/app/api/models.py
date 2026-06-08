"""Model discovery endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.model import ModelListResponse
from app.services import model_service

router = APIRouter(tags=["models"])


@router.get("/models", response_model=ModelListResponse)
async def get_models(db: Session = Depends(get_db)):
    data = await model_service.list_models(db)
    return ModelListResponse(**data)
