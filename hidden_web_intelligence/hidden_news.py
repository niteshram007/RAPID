from __future__ import annotations

import warnings
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .cleaners import normalize_text, truncate_for_llm
from .config import get_config
from .debug import get_logger, persist_debug_artifact
from .exceptions import SearchProviderError
from .hidden_search import hidden_search_web
from .policies import enforce_public_url, enforce_safe_query
from .schemas import NewsArticle
from .utils import dedupe_by, domain_from_url


@retry(
    retry=retry_if_exception_type((httpx.RequestError, SearchProviderError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
async def _fetch_google_news_rss(topic: str) -> str:
    config = get_config()
    query = quote_plus(f"{topic} latest")
    url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

    async with httpx.AsyncClient(
        timeout=config.request_timeout_seconds,
        follow_redirects=True,
        headers={"User-Agent": config.user_agent},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        if not response.text.strip():
            raise SearchProviderError("Empty RSS response from news provider.")
        return response.text


def _parse_news_rss(xml: str, max_results: int) -> list[NewsArticle]:
    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
    soup = BeautifulSoup(xml, "html.parser")
    output: list[NewsArticle] = []

    for item in soup.find_all("item"):
        title = normalize_text(item.title.text if item.title else "")
        link = normalize_text(item.link.text if item.link else "")
        if not title or not link:
            continue

        try:
            enforce_public_url(link)
        except Exception:
            continue

        description_html = item.description.text if item.description else ""
        description_text = normalize_text(
            BeautifulSoup(description_html, "html.parser").get_text(" ", strip=True)
        )

        source = normalize_text(item.source.text if item.source else "")
        if not source:
            source = domain_from_url(link)

        output.append(
            NewsArticle(
                title=truncate_for_llm(title, max_chars=400),
                url=link,
                source=truncate_for_llm(source, max_chars=140),
                snippet=truncate_for_llm(description_text, max_chars=1600),
                published_at=normalize_text(item.pubDate.text) if item.pubDate else None,
            )
        )
        if len(output) >= max_results * 2:
            break

    output = dedupe_by(output, key=lambda article: article.url)
    return output[:max_results]


async def hidden_latest_news(topic: str, max_results: int = 5) -> dict:
    enforce_safe_query(topic)
    config = get_config()
    provider = (config.news_provider or "google_news_rss").lower()
    logger = get_logger().bind(module="hidden_news")
    logger.info("Hidden news fetch started.")

    limit = max(1, min(max_results, max(config.max_news_results, 1) * 3))
    if provider != "google_news_rss":
        raise SearchProviderError(
            f"Unsupported news provider '{provider}'. Supported: google_news_rss"
        )

    xml = await _fetch_google_news_rss(topic)
    if config.debug_mode:
        persist_debug_artifact("news-rss.xml", xml)

    articles = _parse_news_rss(xml, limit)

    if not articles:
        # Graceful fallback to general search when RSS extraction fails.
        search_fallback = await hidden_search_web(f"{topic} latest news", max_results=max_results)
        derived: list[NewsArticle] = []
        for result in search_fallback.get("results", []):
            title = normalize_text(str(result.get("title", "")))
            url = normalize_text(str(result.get("url", "")))
            if not title or not url:
                continue
            derived.append(
                NewsArticle(
                    title=title[:400],
                    url=url,
                    source=domain_from_url(url),
                    snippet=normalize_text(str(result.get("snippet", "")))[:1600],
                    published_at=None,
                )
            )
        articles = dedupe_by(derived, key=lambda article: article.url)[:max_results]

    if not articles:
        raise SearchProviderError("No news articles were extracted.")

    logger.info("Hidden news fetch completed.")
    return {
        "topic": topic.strip(),
        "articles": [article.model_dump() for article in articles[:max_results]],
        "provider": provider,
    }
