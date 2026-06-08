from __future__ import annotations

from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .cleaners import normalize_text, truncate_for_llm
from .config import get_config
from .debug import get_logger, persist_debug_artifact
from .exceptions import SearchProviderError
from .policies import enforce_public_url, enforce_safe_query
from .schemas import SearchResult
from .utils import dedupe_by


def _resolve_duckduckgo_redirect(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        params = parse_qs(parsed.query)
        target = params.get("uddg")
        if target:
            return unquote(target[0])
    return url


def _is_unwanted_search_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    query = parse_qs(parsed.query)

    if parsed.scheme not in {"http", "https"}:
        return True

    if host.endswith("duckduckgo.com") and path in {"/y.js", "/y"}:
        return True

    if host.endswith("bing.com") and path.startswith("/aclick"):
        return True

    if any(key in query for key in ("ad_domain", "click_metadata", "rlid", "vqd")):
        return True

    if any(ad_host in host for ad_host in ("doubleclick.net", "googlesyndication.com")):
        return True

    return False


@retry(
    retry=retry_if_exception_type((httpx.RequestError, SearchProviderError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
async def _fetch_duckduckgo_html(query: str) -> str:
    config = get_config()
    headers = {"User-Agent": config.user_agent}
    params = {"q": query, "kl": "us-en"}
    async with httpx.AsyncClient(
        timeout=config.request_timeout_seconds,
        follow_redirects=True,
        headers=headers,
    ) as client:
        response = await client.get("https://duckduckgo.com/html/", params=params)
        response.raise_for_status()
        if not response.text.strip():
            raise SearchProviderError("Search provider returned empty HTML.")
        return response.text


def _parse_search_results(html: str, max_results: int) -> list[SearchResult]:
    soup = BeautifulSoup(html, "html.parser")
    rows: list[SearchResult] = []

    containers = soup.select("div.result, article, .web-result")
    if not containers:
        containers = soup.select("a.result__a")

    for container in containers:
        if getattr(container, "name", None) == "a":
            anchor = container
            snippet_node = None
        else:
            anchor = container.select_one("a.result__a") or container.find("a", href=True)
            snippet_node = (
                container.select_one(".result__snippet")
                or container.select_one(".result-snippet")
                or container.find("a", class_="result__snippet")
                or container.find("p")
            )

        if anchor is None:
            continue

        href = _resolve_duckduckgo_redirect(str(anchor.get("href", "")).strip())
        if not href:
            continue

        if _is_unwanted_search_url(href):
            continue

        try:
            enforce_public_url(href)
        except Exception:
            continue

        title = normalize_text(anchor.get_text(" ", strip=True))
        if not title:
            continue
        if "official site" in title.lower() and "amazon" in title.lower():
            # Avoid ad-like shopping rows for recommendation queries.
            continue

        snippet = ""
        if snippet_node is not None:
            snippet = normalize_text(snippet_node.get_text(" ", strip=True))

        rows.append(
            SearchResult(
                title=truncate_for_llm(title, max_chars=400),
                url=href,
                snippet=truncate_for_llm(snippet, max_chars=1200),
            )
        )

        if len(rows) >= max_results * 2:
            break

    rows = dedupe_by(rows, key=lambda item: item.url)
    return rows[:max_results]


async def hidden_search_web(query: str, max_results: int = 5) -> dict:
    enforce_safe_query(query)

    config = get_config()
    provider = (config.search_provider or "duckduckgo_html").lower()
    limit = max(1, min(max_results, max(config.max_search_results, 1) * 3))
    logger = get_logger().bind(module="hidden_search")
    logger.info("Hidden search started.")

    if provider != "duckduckgo_html":
        raise SearchProviderError(
            f"Unsupported search provider '{provider}'. Supported: duckduckgo_html"
        )

    html = await _fetch_duckduckgo_html(query)
    if config.debug_mode:
        persist_debug_artifact("search-provider-html", html)

    parsed = _parse_search_results(html, limit)
    if not parsed:
        raise SearchProviderError("No search results were extracted.")

    logger.info("Hidden search completed.")
    return {
        "query": query.strip(),
        "results": [result.model_dump() for result in parsed[: max_results or 5]],
        "provider": provider,
    }
