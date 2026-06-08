"""Model listing helpers with live endpoint + fallback."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.services import settings_service
from app.services.llm_client import LLMError


async def list_models(db: Session) -> dict:
    cfg = settings_service.get_effective_settings(db)
    default_model = cfg.get("default_model") or cfg.get("llm_model")
    available = cfg.get("available_models") or []
    if isinstance(available, str):
        available = [m.strip() for m in available.split(",") if m.strip()]

    client = settings_service.llm_client_from_settings(db)
    live_models: list[str] = []
    try:
        live_models = await client.list_models()
    except LLMError:
        live_models = []
    except Exception:
        live_models = []

    final_models = live_models or available or [default_model]
    items = []
    for m in final_models:
        items.append(
            {
                "id": m,
                "name": m.replace("-", " ").replace(":", " ").title(),
                "provider": "local",
                "available": True,
            }
        )
    if default_model not in {i["id"] for i in items}:
        items.insert(
            0,
            {
                "id": default_model,
                "name": default_model.replace("-", " ").replace(":", " ").title(),
                "provider": "local",
                "available": True,
            },
        )
    return {"default_model": default_model, "models": items}
