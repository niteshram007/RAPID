"""Shared model helpers (DB-agnostic UUID + timestamps)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
