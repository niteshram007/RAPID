from __future__ import annotations

from bs4 import BeautifulSoup

from .cleaners import normalize_text
from .utils import domain_from_url


def extract_headings(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    headings: list[str] = []
    seen: set[str] = set()

    for element in soup.find_all(["h1", "h2", "h3", "h4"]):
        text = normalize_text(element.get_text(" ", strip=True))
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        headings.append(text)
        if len(headings) >= 40:
            break

    return headings


def extract_links(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[dict] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if (
            not href
            or href.startswith("#")
            or href.startswith("javascript:")
            or href.startswith("mailto:")
        ):
            continue

        key = href.lower()
        if key in seen:
            continue
        seen.add(key)

        links.append(
            {
                "text": normalize_text(anchor.get_text(" ", strip=True))[:400],
                "url": href[:2000],
                "domain": domain_from_url(href) if href.startswith("http") else None,
            }
        )
        if len(links) >= 120:
            break

    return links


def extract_tables(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    tables: list[dict] = []

    for table in soup.find_all("table"):
        headers = [
            normalize_text(cell.get_text(" ", strip=True))
            for cell in table.find_all("th")
        ]

        rows: list[list[str]] = []
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            values = [normalize_text(cell.get_text(" ", strip=True)) for cell in cells]
            if any(values):
                rows.append(values)
            if len(rows) >= 25:
                break

        if not headers and not rows:
            continue

        caption = ""
        if table.caption:
            caption = normalize_text(table.caption.get_text(" ", strip=True))

        tables.append(
            {
                "caption": caption[:400],
                "headers": headers[:20],
                "rows": rows[:25],
            }
        )
        if len(tables) >= 10:
            break

    return tables


def extract_cards(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cards: list[dict] = []
    seen: set[str] = set()

    candidates = soup.select(
        "article, [role='article'], .card, [class*='card'], .result, .news-item, li"
    )
    for node in candidates:
        title_node = node.find(["h1", "h2", "h3", "h4", "strong"])
        snippet_node = node.find(["p", "span", "div"])
        link_node = node.find("a", href=True)

        title = normalize_text(title_node.get_text(" ", strip=True)) if title_node else ""
        snippet = (
            normalize_text(snippet_node.get_text(" ", strip=True))
            if snippet_node
            else ""
        )
        url = link_node.get("href", "").strip() if link_node else ""

        if not title and not snippet:
            continue

        key = f"{title.lower()}|{url.lower()}"
        if key in seen:
            continue
        seen.add(key)

        cards.append(
            {
                "title": title[:400],
                "snippet": snippet[:1800],
                "url": url[:2000] if url else None,
            }
        )
        if len(cards) >= 40:
            break

    return cards

