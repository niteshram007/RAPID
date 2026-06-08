from __future__ import annotations

import re
from typing import Literal

from .context_builder import build_hidden_context
from .debug import get_logger, persist_debug_json
from .exceptions import HiddenWebIntelligenceError
from .hidden_news import hidden_latest_news
from .hidden_search import hidden_search_web
from .policies import enforce_safe_query
from .schemas import HiddenContextResponse
from .stealth_fetcher import hidden_fetch_page
from .utils import extract_first_url, normalize_whitespace

RouteStrategy = Literal["search", "news", "page", "none"]

_LIVE_TRIGGERS = {
    "latest",
    "today",
    "current",
    "news",
    "live",
    "recent",
    "update",
    "happening now",
    "breaking",
    "price now",
    "market today",
}

_NEWS_HINTS = {
    "news",
    "headline",
    "breaking",
    "press release",
    "recent update",
    "latest update",
}

_STATIC_HINTS = {
    "what is",
    "explain",
    "difference between",
    "tutorial",
    "python",
    "javascript",
    "types of",
}

_RECOMMENDATION_HINTS = {
    "best",
    "top",
    "popular",
    "must watch",
    "must-watch",
    "recommend",
    "recommended",
    "suggest",
    "rank",
    "ranking",
    "list of",
}

_DYNAMIC_TOPIC_HINTS = {
    "movie",
    "movies",
    "hollywood",
    "bollywood",
    "news",
    "price",
    "stock",
    "crypto",
    "hotel",
    "restaurant",
    "travel",
    "flight",
    "phone",
    "laptop",
    "tv show",
}


def _looks_like_recommendation_query(normalized: str) -> bool:
    if any(token in normalized for token in _RECOMMENDATION_HINTS):
        return True
    if normalized.startswith("best ") or normalized.startswith("top "):
        return True
    if re.search(r"\b(20\d{2})\b", normalized):
        return True
    return False


def _is_likely_live_query(query: str) -> bool:
    normalized = normalize_whitespace(query).lower()
    if not normalized:
        return False

    if extract_first_url(normalized):
        return True

    if any(token in normalized for token in _LIVE_TRIGGERS):
        return True

    if "stock" in normalized or "weather" in normalized or "match score" in normalized:
        return True

    if _looks_like_recommendation_query(normalized):
        return True

    if (
        any(token in normalized for token in _DYNAMIC_TOPIC_HINTS)
        and "what is" not in normalized
    ):
        return True

    if any(token in normalized for token in _STATIC_HINTS):
        return False

    return False


def _choose_strategy(query: str) -> RouteStrategy:
    normalized = normalize_whitespace(query).lower()
    direct_url = extract_first_url(normalized)
    if direct_url:
        return "page"

    if not _is_likely_live_query(normalized):
        return "none"

    if any(token in normalized for token in _NEWS_HINTS):
        return "news"

    return "search"


def _extract_sources(payload: dict) -> list[str]:
    sources: list[str] = []
    if "results" in payload:
        for result in payload.get("results", []):
            url = str(result.get("url", "")).strip()
            if url:
                sources.append(url)
    elif "articles" in payload:
        for article in payload.get("articles", []):
            url = str(article.get("url", "")).strip()
            if url:
                sources.append(url)
    elif "url" in payload:
        url = str(payload.get("url", "")).strip()
        if url:
            sources.append(url)
    return sources[:10]


async def maybe_fetch_live_context(user_query: str) -> dict | None:
    enforce_safe_query(user_query)
    logger = get_logger().bind(module="tool_router")
    strategy = _choose_strategy(user_query)

    if strategy == "none":
        return None

    logger.info(f"Live context route selected: {strategy}")
    payload: dict

    try:
        if strategy == "page":
            url = extract_first_url(user_query)
            if not url:
                return None
            payload = await hidden_fetch_page(url)
        elif strategy == "news":
            payload = await hidden_latest_news(user_query, max_results=5)
        else:
            payload = await hidden_search_web(user_query, max_results=5)
    except HiddenWebIntelligenceError as error:
        logger.warning(f"Hidden live context failed: {error}")
        return None
    except Exception as error:
        logger.warning(f"Unexpected hidden live context error: {error}")
        return None

    context = build_hidden_context(payload)
    response = HiddenContextResponse(
        triggered=True,
        query=user_query.strip(),
        strategy=strategy,
        context=context,
        sources=_extract_sources(payload),
        payload=payload,
    )
    model_dump = response.model_dump()
    persist_debug_json("live-context-response", model_dump)
    return model_dump


async def tool_hidden_search(query: str) -> dict:
    return await hidden_search_web(query)


async def tool_hidden_news(topic: str) -> dict:
    return await hidden_latest_news(topic)


async def tool_hidden_scrape(url: str) -> dict:
    return await hidden_fetch_page(url)


async def tool_live_context(query: str) -> str | None:
    response = await maybe_fetch_live_context(query)
    if not response:
        return None
    return str(response.get("context") or "").strip() or None
