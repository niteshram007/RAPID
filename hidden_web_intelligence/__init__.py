"""Hidden, internal live-web intelligence tools for Neural Switch."""

from .tool_router import (
    maybe_fetch_live_context,
    tool_hidden_news,
    tool_hidden_scrape,
    tool_hidden_search,
    tool_live_context,
)

__all__ = [
    "maybe_fetch_live_context",
    "tool_hidden_news",
    "tool_hidden_scrape",
    "tool_hidden_search",
    "tool_live_context",
]

