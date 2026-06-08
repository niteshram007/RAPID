"""Settings endpoints: read effective config, update, and test LLM connection."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.settings import LLMSettings, TestConnectionResponse
from app.services import settings_service
from app.services.llm_client import LLMClient

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    return settings_service.public_settings(db)


@router.post("")
def update_settings(patch: LLMSettings, db: Session = Depends(get_db)):
    # Don't overwrite the stored API key when client sends the masked placeholder.
    data = patch.model_dump(exclude_none=True)
    if data.get("llm_api_key") == "********":
        data.pop("llm_api_key", None)
    settings_service.update_settings(db, data)
    return settings_service.public_settings(db)


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(patch: LLMSettings | None = None, db: Session = Depends(get_db)):
    """Test the LLM connection. If a base_url/api_key is supplied, test that;
    otherwise test the currently saved settings."""
    cfg = settings_service.get_effective_settings(db)
    base_url = (patch.llm_base_url if patch else None) or cfg["llm_base_url"]
    api_key = (patch.llm_api_key if patch else None) or cfg.get("llm_api_key") or "local-key"
    if api_key == "********":
        api_key = cfg.get("llm_api_key") or "local-key"

    client = LLMClient(base_url=base_url, api_key=api_key)
    result = await client.health()
    return TestConnectionResponse(
        ok=result["ok"], message=result["message"], models=result.get("models", [])
    )
