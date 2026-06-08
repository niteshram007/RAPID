from __future__ import annotations

from typing import Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .browser import get_browser_manager
from .cleaners import clean_html, extract_visible_text, truncate_for_llm
from .config import get_config
from .debug import get_logger, persist_debug_artifact, persist_debug_json
from .exceptions import ExtractionError, NavigationError
from .extractor import extract_cards, extract_headings, extract_links, extract_tables
from .policies import enforce_public_url, enforce_safe_automation_scope
from .schemas import CardData, LinkData, PageData, TableData

try:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
except Exception:  # pragma: no cover
    PlaywrightTimeoutError = TimeoutError


async def _extract_metadata(page) -> dict[str, Any]:
    metadata = await page.evaluate(
        """() => {
            const meta = (name) => {
              const byName = document.querySelector(`meta[name="${name}"]`);
              const byProp = document.querySelector(`meta[property="${name}"]`);
              return (byName || byProp)?.content || "";
            };
            return {
              title: document.title || "",
              description: meta("description"),
              canonical: document.querySelector("link[rel='canonical']")?.href || "",
              lang: document.documentElement?.lang || "",
              ogTitle: meta("og:title"),
              ogDescription: meta("og:description"),
              ogType: meta("og:type"),
            };
          }"""
    )
    if not isinstance(metadata, dict):
        return {}
    return {str(key): str(value) for key, value in metadata.items() if value}


async def _scroll_page(page) -> None:
    config = get_config()
    if config.max_scroll_steps <= 0:
        return

    for _ in range(config.max_scroll_steps):
        await page.evaluate("window.scrollBy(0, Math.floor(window.innerHeight * 0.9));")
        await page.wait_for_timeout(config.scroll_pause_ms)


@retry(
    retry=retry_if_exception_type((PlaywrightTimeoutError, NavigationError, ExtractionError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.6, min=0.5, max=3),
    reraise=True,
)
async def hidden_fetch_page(url: str) -> dict:
    enforce_safe_automation_scope()
    enforce_public_url(url)

    config = get_config()
    logger = get_logger().bind(module="stealth_fetcher", url=url)
    logger.info("Hidden fetch started.")

    browser_manager = await get_browser_manager()
    context = None
    page = None

    try:
        context, page = await browser_manager.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=config.navigation_timeout_ms)

        try:
            await page.wait_for_load_state("networkidle", timeout=config.load_state_timeout_ms)
        except Exception:
            # Network-idle is best effort only for dynamic pages.
            pass

        if config.polite_delay_ms > 0:
            await page.wait_for_timeout(config.polite_delay_ms)

        await _scroll_page(page)
        html = await page.content()
        title = (await page.title()) or ""
        metadata = await _extract_metadata(page)

    except PlaywrightTimeoutError as error:
        raise NavigationError(f"Navigation timeout for {url}") from error
    except Exception as error:
        raise ExtractionError(f"Hidden fetch failed for {url}") from error
    finally:
        await browser_manager.close_page(context, page)

    cleaned_html = clean_html(html)
    text = truncate_for_llm(extract_visible_text(cleaned_html), max_chars=config.max_extract_chars)

    if config.debug_mode:
        persist_debug_artifact("page-cleaned-html", cleaned_html)
        persist_debug_json(
            "page-metadata",
            {
                "url": url,
                "title": title,
                "metadata": metadata,
                "text_chars": len(text),
            },
        )

    page_data = PageData(
        url=url,
        title=title.strip(),
        clean_text=text,
        headings=extract_headings(cleaned_html),
        links=[LinkData(**link) for link in extract_links(cleaned_html)],
        tables=[TableData(**table) for table in extract_tables(cleaned_html)],
        cards=[CardData(**card) for card in extract_cards(cleaned_html)],
        metadata=metadata,
    )
    logger.info("Hidden fetch complete.")
    return page_data.model_dump()

