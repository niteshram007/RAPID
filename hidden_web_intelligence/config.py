from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _to_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _to_float(value: str | None, default: float) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class HiddenWebConfig:
    debug_mode: bool
    headless: bool
    user_agent: str
    navigation_timeout_ms: int
    load_state_timeout_ms: int
    polite_delay_ms: int
    max_scroll_steps: int
    scroll_pause_ms: int
    request_timeout_seconds: float
    max_context_chars: int
    max_extract_chars: int
    max_search_results: int
    max_news_results: int
    search_provider: str
    news_provider: str
    log_file: Path
    debug_dir: Path


@lru_cache(maxsize=1)
def get_config() -> HiddenWebConfig:
    root_dir = Path(__file__).resolve().parent
    log_dir = root_dir / ".logs"
    debug_dir = root_dir / ".debug"
    log_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)

    return HiddenWebConfig(
        debug_mode=_to_bool(os.getenv("HWI_DEBUG_MODE"), False),
        headless=_to_bool(os.getenv("HWI_HEADLESS"), True),
        user_agent=os.getenv(
            "HWI_USER_AGENT",
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
        ),
        navigation_timeout_ms=_to_int(os.getenv("HWI_NAVIGATION_TIMEOUT_MS"), 20000),
        load_state_timeout_ms=_to_int(os.getenv("HWI_LOAD_STATE_TIMEOUT_MS"), 8000),
        polite_delay_ms=_to_int(os.getenv("HWI_POLITE_DELAY_MS"), 250),
        max_scroll_steps=_to_int(os.getenv("HWI_MAX_SCROLL_STEPS"), 4),
        scroll_pause_ms=_to_int(os.getenv("HWI_SCROLL_PAUSE_MS"), 350),
        request_timeout_seconds=_to_float(os.getenv("HWI_REQUEST_TIMEOUT_SECONDS"), 12.0),
        max_context_chars=_to_int(os.getenv("HWI_MAX_CONTEXT_CHARS"), 6000),
        max_extract_chars=_to_int(os.getenv("HWI_MAX_EXTRACT_CHARS"), 12000),
        max_search_results=_to_int(os.getenv("HWI_MAX_SEARCH_RESULTS"), 5),
        max_news_results=_to_int(os.getenv("HWI_MAX_NEWS_RESULTS"), 5),
        search_provider=os.getenv("HWI_SEARCH_PROVIDER", "duckduckgo_html"),
        news_provider=os.getenv("HWI_NEWS_PROVIDER", "google_news_rss"),
        log_file=log_dir / "hidden_web_intelligence.log",
        debug_dir=debug_dir,
    )

