from __future__ import annotations

import importlib
import logging
import os
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

LOGGER = logging.getLogger(__name__)
_MOUNTED_SUBAPP: FastAPI | None = None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _neural_switch_backend_dir() -> Path:
    return _project_root() / "Neuralswitch" / "backend"


def _storage_root() -> Path:
    return _project_root() / "backend" / "storage" / "neural-switch"


def _seed_neural_switch_environment(rapid_settings: dict[str, Any] | None = None) -> None:
    storage_root = _storage_root()
    uploads_dir = storage_root / "uploads"
    vector_dir = storage_root / "vector_db"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    vector_dir.mkdir(parents=True, exist_ok=True)

    rapid_database_url = os.getenv("RAPID_DATABASE_URL", "").strip()
    neural_switch_database_url = os.getenv("NEURAL_SWITCH_DATABASE_URL", "").strip()
    use_rapid_database = os.getenv("NEURAL_SWITCH_USE_RAPID_DB", "").strip().lower() in {"1", "true", "yes"}
    default_sqlite_path = storage_root / "app.db"

    if neural_switch_database_url:
        resolved_database_url = neural_switch_database_url
    elif use_rapid_database and rapid_database_url:
        resolved_database_url = rapid_database_url
    else:
        resolved_database_url = f"sqlite:///{default_sqlite_path.as_posix()}"
    if resolved_database_url.startswith("postgres://"):
        resolved_database_url = f"postgresql+psycopg://{resolved_database_url[len('postgres://') :]}"
    elif resolved_database_url.startswith("postgresql://"):
        resolved_database_url = f"postgresql+psycopg://{resolved_database_url[len('postgresql://') :]}"
    os.environ["DATABASE_URL"] = resolved_database_url
    if rapid_database_url:
        os.environ.setdefault("RAPID_DATABASE_URL", rapid_database_url)
        os.environ.setdefault("VECTOR_DB_URL", rapid_database_url)

    os.environ.setdefault("APP_NAME", "Neural Switch")
    os.environ.setdefault("ENVIRONMENT", os.getenv("RAPID_ENVIRONMENT", "production"))
    os.environ.setdefault("VECTOR_DB", "pgvector" if rapid_database_url else "chroma")
    os.environ.setdefault("VECTOR_DB_PATH", str(vector_dir))
    os.environ.setdefault("UPLOAD_DIR", str(uploads_dir))
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

    if not rapid_settings:
        return

    platform_base_url = str(rapid_settings.get("localLlmPlatformBaseUrl") or "").strip()
    base_url = str(rapid_settings.get("localLlmBaseUrl") or "").strip()
    api_key = str(rapid_settings.get("localLlmApiKey") or "").strip()
    model = str(rapid_settings.get("localLlmModel") or "").strip()
    default_financial_year = str(rapid_settings.get("defaultFinancialYear") or "").strip()

    resolved_base_url = platform_base_url or base_url
    if resolved_base_url and not os.getenv("LLM_BASE_URL", "").strip():
        os.environ["LLM_BASE_URL"] = resolved_base_url
    if api_key and not os.getenv("LLM_API_KEY", "").strip():
        os.environ["LLM_API_KEY"] = api_key
    if model and not os.getenv("LLM_MODEL", "").strip():
        os.environ["LLM_MODEL"] = model
    if model and not os.getenv("DEFAULT_MODEL", "").strip():
        os.environ["DEFAULT_MODEL"] = model
    if default_financial_year and not os.getenv("RAPID_DEFAULT_FINANCIAL_YEAR", "").strip():
        os.environ["RAPID_DEFAULT_FINANCIAL_YEAR"] = default_financial_year


def _unavailable_subapp(reason: str) -> FastAPI:
    app = FastAPI(title="Neural Switch (Unavailable)")

    @app.get("/health", tags=["neural-switch"])
    def neural_switch_health() -> dict[str, str]:
        return {
            "status": "unavailable",
            "message": reason,
        }

    return app


def get_neural_switch_subapp(rapid_settings: dict[str, Any] | None = None) -> FastAPI:
    global _MOUNTED_SUBAPP
    if _MOUNTED_SUBAPP is not None:
        return _MOUNTED_SUBAPP

    backend_dir = _neural_switch_backend_dir()
    if not backend_dir.exists():
        _MOUNTED_SUBAPP = _unavailable_subapp("Neuralswitch backend folder was not found.")
        return _MOUNTED_SUBAPP

    _seed_neural_switch_environment(rapid_settings)

    backend_dir_text = str(backend_dir)
    if backend_dir_text not in sys.path:
        sys.path.insert(0, backend_dir_text)
    importlib.invalidate_caches()

    try:
        database_module = importlib.import_module("app.database")
        database_module.init_db()
        main_module = importlib.import_module("app.main")
        neural_app = getattr(main_module, "app", None)
        if not isinstance(neural_app, FastAPI):
            raise RuntimeError("Neuralswitch FastAPI app was not exposed correctly.")
        _MOUNTED_SUBAPP = neural_app
    except Exception as error:  # pragma: no cover
        LOGGER.exception("Unable to initialize mounted Neuralswitch backend")
        _MOUNTED_SUBAPP = _unavailable_subapp(str(error))

    return _MOUNTED_SUBAPP
