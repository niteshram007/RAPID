from __future__ import annotations

import asyncio
from typing import Any

from .config import HiddenWebConfig, get_config
from .debug import get_logger
from .exceptions import BrowserStartupError

try:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright
except Exception:  # pragma: no cover - handled at runtime for optional setup
    Browser = Any  # type: ignore[assignment]
    BrowserContext = Any  # type: ignore[assignment]
    Page = Any  # type: ignore[assignment]
    Playwright = Any  # type: ignore[assignment]
    async_playwright = None


class HiddenBrowserManager:
    def __init__(self, config: HiddenWebConfig | None = None):
        self.config = config or get_config()
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._contexts: set[BrowserContext] = set()
        self._lock = asyncio.Lock()
        self._logger = get_logger().bind(module="browser")

    async def start(self):
        async with self._lock:
            if self._browser is not None:
                return

            if async_playwright is None:
                raise BrowserStartupError(
                    "Playwright is not installed. Run: pip install playwright && python -m playwright install chromium"
                )

            self._logger.debug("Starting hidden browser manager.")
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=self.config.headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
            )

    async def stop(self):
        async with self._lock:
            self._logger.debug("Stopping hidden browser manager.")

            for context in list(self._contexts):
                try:
                    await context.close()
                except Exception:
                    continue

            self._contexts.clear()

            if self._browser is not None:
                await self._browser.close()
                self._browser = None

            if self._playwright is not None:
                await self._playwright.stop()
                self._playwright = None

    async def new_page(self):
        if self._browser is None:
            await self.start()

        if self._browser is None:
            raise BrowserStartupError("Browser did not initialize.")

        context = await self._browser.new_context(
            user_agent=self.config.user_agent,
            locale="en-US",
            java_script_enabled=True,
            viewport={"width": 1366, "height": 900},
            ignore_https_errors=True,
        )
        context.set_default_timeout(self.config.navigation_timeout_ms)
        page = await context.new_page()
        page.set_default_timeout(self.config.navigation_timeout_ms)
        self._contexts.add(context)
        return context, page

    async def close_page(self, context: BrowserContext | None, page: Page | None) -> None:
        if page is not None:
            try:
                await page.close()
            except Exception:
                pass

        if context is not None:
            try:
                await context.close()
            except Exception:
                pass
            self._contexts.discard(context)


_MANAGER: HiddenBrowserManager | None = None
_MANAGER_LOCK = asyncio.Lock()


async def get_browser_manager() -> HiddenBrowserManager:
    global _MANAGER
    async with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = HiddenBrowserManager()
        return _MANAGER

