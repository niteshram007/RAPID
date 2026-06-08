from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Callable, Iterable, TypeVar
from urllib.parse import urlparse

from .config import get_config

T = TypeVar("T")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def domain_from_url(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower()


def dedupe_by(items: Iterable[T], key: Callable[[T], str]) -> list[T]:
    seen: set[str] = set()
    output: list[T] = []
    for item in items:
        marker = key(item).strip()
        if not marker or marker in seen:
            continue
        seen.add(marker)
        output.append(item)
    return output


def extract_first_url(text: str) -> str | None:
    match = re.search(r"https?://[^\s]+", text)
    if not match:
        return None
    return match.group(0).rstrip(").,]")


async def polite_delay(ms: int | None = None) -> None:
    config = get_config()
    duration_ms = config.polite_delay_ms if ms is None else max(0, ms)
    if duration_ms <= 0:
        return
    await asyncio.sleep(duration_ms / 1000)

