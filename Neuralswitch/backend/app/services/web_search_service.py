from __future__ import annotations

import html
import re
from urllib.parse import parse_qs, unquote, urlparse

import httpx

from app.tools import web_search_tool

_DDG_HTML_URL = "https://html.duckduckgo.com/html/"
_RESULT_LINK_RE = re.compile(
    r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
_RESULT_SNIPPET_RE = re.compile(
    r'class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</',
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")
_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "what",
    "which",
    "latest",
    "recent",
    "current",
    "today",
    "about",
}
_LOW_CONFIDENCE_HOSTS = ("reddit.com", "quora.com", "medium.com")
_TRUSTED_HOSTS = ("apple.com", "microsoft.com", "openai.com", "google.com", "wikipedia.org")


def _clean_fragment(value: str) -> str:
    stripped = _TAG_RE.sub(" ", value or "")
    return " ".join(html.unescape(stripped).split())


def _decode_result_url(value: str) -> str:
    if value.startswith("//"):
        value = f"https:{value}"
    parsed = urlparse(value)
    if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
        encoded = parse_qs(parsed.query).get("uddg", [""])[0]
        if encoded:
            return unquote(encoded)
    return value


def _extract_date(text: str) -> str | None:
    match = re.search(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b", text)
    if match:
        return match.group(0)
    match = re.search(r"\b20\d{2}-\d{2}-\d{2}\b", text)
    if match:
        return match.group(0)
    return None


def _query_tokens(query: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", query.lower())
        if len(token) > 2 and token not in _STOPWORDS
    }


def _score_result(result: dict, query: str, *, prefer_current: bool) -> float:
    url = str(result.get("url") or "")
    host = urlparse(url).netloc.lower()
    title = str(result.get("title") or "").lower()
    snippet = str(result.get("snippet") or "").lower()
    tokens = _query_tokens(query)
    score = 1.0
    if any(host.endswith(trusted) for trusted in _TRUSTED_HOSTS):
        score += 4.0
    if host.endswith(".gov") or host.endswith(".edu"):
        score += 3.5
    if any(low in host for low in _LOW_CONFIDENCE_HOSTS):
        score -= 2.0
    if any(token in host for token in tokens):
        score += 2.0
    if any(token in title for token in tokens):
        score += 1.5
    if prefer_current and result.get("published_date"):
        score += 1.5
    if any(keyword in url for keyword in ("newsroom", "press", "blog", "news")):
        score += 0.8
    if len(snippet) > 80:
        score += 0.3
    return score


async def _search_duckduckgo_html(query: str, max_results: int) -> list[dict]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(_DDG_HTML_URL, params={"q": query, "kl": "us-en"}, headers=headers)
        response.raise_for_status()
    html_text = response.text
    links = list(_RESULT_LINK_RE.finditer(html_text))
    snippets = [_clean_fragment(match.group("snippet")) for match in _RESULT_SNIPPET_RE.finditer(html_text)]
    results: list[dict] = []
    for index, match in enumerate(links):
        title = _clean_fragment(match.group("title"))
        url = _decode_result_url(match.group("href"))
        snippet = snippets[index] if index < len(snippets) else ""
        if not title or not url:
            continue
        results.append(
            {
                "title": title,
                "url": url,
                "snippet": snippet,
                "published_date": _extract_date(snippet) or _extract_date(title),
            }
        )
        if len(results) >= max_results:
            break
    return results


def _dedupe_results(results: list[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for result in results:
        key = str(result.get("url") or result.get("title") or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(result)
    return deduped


async def search(query: str, max_results: int = 5, *, prefer_current: bool = False) -> list[dict]:
    results: list[dict] = []
    try:
        results = await _search_duckduckgo_html(query, max_results=max_results * 2)
    except Exception:
        results = []
    if not results:
        results = await web_search_tool.search(query, max_results=max_results)
    deduped = _dedupe_results(results)
    for item in deduped:
        item["score"] = _score_result(item, query, prefer_current=prefer_current)
    deduped.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return deduped[:max_results]
