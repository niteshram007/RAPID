from __future__ import annotations

import re

from bs4 import BeautifulSoup, Comment


def normalize_text(text: str) -> str:
    normalized = text.replace("\u00a0", " ")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n\s*\n+", "\n\n", normalized)
    return normalized.strip()


def truncate_for_llm(text: str, max_chars: int = 6000) -> str:
    value = normalize_text(text)
    if len(value) <= max_chars:
        return value
    return value[: max_chars - 1].rstrip() + "…"


def clean_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "iframe", "svg", "canvas"]):
        tag.decompose()

    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()

    return str(soup)


def extract_visible_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    blocks: list[str] = []

    selectors = [
        "main",
        "article",
        "section",
        "h1",
        "h2",
        "h3",
        "p",
        "li",
        "blockquote",
        "td",
        "th",
    ]

    for node in soup.select(",".join(selectors)):
        text = normalize_text(node.get_text(" ", strip=True))
        if len(text) < 3:
            continue
        blocks.append(text)

    if not blocks:
        fallback = normalize_text(soup.get_text("\n", strip=True))
        return truncate_for_llm(fallback, max_chars=12000)

    deduped: list[str] = []
    seen: set[str] = set()
    for block in blocks:
        marker = block.lower()
        if marker in seen:
            continue
        seen.add(marker)
        deduped.append(block)

    return truncate_for_llm("\n".join(deduped), max_chars=12000)

