from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LinkData(StrictModel):
    text: str = Field(default="", max_length=400)
    url: str = Field(min_length=1, max_length=2000)
    domain: str | None = Field(default=None, max_length=200)


class TableData(StrictModel):
    caption: str = Field(default="", max_length=400)
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class CardData(StrictModel):
    title: str = Field(default="", max_length=400)
    snippet: str = Field(default="", max_length=2000)
    url: str | None = Field(default=None, max_length=2000)


class SearchResult(StrictModel):
    title: str = Field(min_length=1, max_length=400)
    url: str = Field(min_length=1, max_length=2000)
    snippet: str = Field(default="", max_length=2000)


class NewsArticle(StrictModel):
    title: str = Field(min_length=1, max_length=400)
    url: str = Field(min_length=1, max_length=2000)
    source: str = Field(default="", max_length=200)
    snippet: str = Field(default="", max_length=3000)
    published_at: str | None = Field(default=None, max_length=120)


class PageData(StrictModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str = Field(default="", max_length=400)
    clean_text: str = Field(default="", max_length=20000)
    headings: list[str] = Field(default_factory=list)
    links: list[LinkData] = Field(default_factory=list)
    tables: list[TableData] = Field(default_factory=list)
    cards: list[CardData] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class HiddenContextResponse(StrictModel):
    triggered: bool
    query: str = Field(min_length=1, max_length=500)
    strategy: Literal["search", "news", "page", "none"]
    context: str | None = None
    sources: list[str] = Field(default_factory=list)
    payload: dict[str, Any] | None = None

