"""Simple web-search tool (DuckDuckGo instant answer API)."""
from __future__ import annotations

import httpx


async def search(query: str, max_results: int = 5) -> list[dict]:
    url = "https://api.duckduckgo.com/"
    params = {
        "q": query,
        "format": "json",
        "no_redirect": "1",
        "no_html": "1",
        "skip_disambig": "1",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    out: list[dict] = []
    if data.get("AbstractText"):
        out.append(
            {
                "title": data.get("Heading") or "DuckDuckGo Instant Answer",
                "url": data.get("AbstractURL") or "https://duckduckgo.com/",
                "snippet": data.get("AbstractText"),
                "published_date": None,
            }
        )
    for topic in data.get("RelatedTopics", [])[: max_results * 2]:
        if len(out) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text") and topic.get("FirstURL"):
            out.append(
                {
                    "title": topic["Text"][:120],
                    "url": topic["FirstURL"],
                    "snippet": topic["Text"],
                    "published_date": None,
                }
            )
        elif isinstance(topic, dict) and topic.get("Topics"):
            for sub in topic["Topics"]:
                if len(out) >= max_results:
                    break
                if sub.get("Text") and sub.get("FirstURL"):
                    out.append(
                        {
                            "title": sub["Text"][:120],
                            "url": sub["FirstURL"],
                            "snippet": sub["Text"],
                            "published_date": None,
                        }
                    )
    return out[:max_results]
