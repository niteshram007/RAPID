from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

FISCAL_MONTHS = [
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar",
]

MONTH_INDEX = {month: index for index, month in enumerate(FISCAL_MONTHS, start=1)}
MONTH_ALIASES = {
    "apr": "Apr",
    "april": "Apr",
    "may": "May",
    "jun": "Jun",
    "june": "Jun",
    "jul": "Jul",
    "july": "Jul",
    "aug": "Aug",
    "august": "Aug",
    "sep": "Sep",
    "sept": "Sep",
    "september": "Sep",
    "oct": "Oct",
    "october": "Oct",
    "nov": "Nov",
    "november": "Nov",
    "dec": "Dec",
    "december": "Dec",
    "jan": "Jan",
    "january": "Jan",
    "feb": "Feb",
    "february": "Feb",
    "mar": "Mar",
    "march": "Mar",
}
QUARTER_MONTHS = {
    "Q1": ["Apr", "May", "Jun"],
    "Q2": ["Jul", "Aug", "Sep"],
    "Q3": ["Oct", "Nov", "Dec"],
    "Q4": ["Jan", "Feb", "Mar"],
}

DIMENSION_KEYWORDS = [
    ("strategic account", "Strategic Account", "strategic_account"),
    ("geo head", "Geo Head", "geo_head"),
    ("practice head", "Practice Head", "practice_head"),
    ("bdm", "BDM", "bdm"),
    ("customer", "Customer", "group_company"),
    ("project", "Project", "project_name"),
    ("ms/ps", "MS/PS", "ms_ps"),
    ("ms", "MS/PS", "ms_ps"),
    ("ps", "MS/PS", "ms_ps"),
    ("row/us", "ROW/US", "region"),
    ("region", "Region", "region"),
    ("company", "Company", "entity"),
    ("vertical", "Vertical", "vertical"),
    ("eeennn", "EEENNN", "eeennn"),
    ("month", "Month", "source_month"),
    ("trend", "Month", "source_month"),
]

TEXT_SEARCH_STOPWORDS = {
    "a",
    "about",
    "actual",
    "actuals",
    "all",
    "and",
    "are",
    "as",
    "average",
    "bdm",
    "billable",
    "billed",
    "billing",
    "bottom",
    "budget",
    "by",
    "calculate",
    "chart",
    "compare",
    "comparison",
    "company",
    "current",
    "customer",
    "difference",
    "employee",
    "emp",
    "forecast",
    "for",
    "from",
    "fy",
    "gap",
    "geo",
    "give",
    "graph",
    "growth",
    "has",
    "head",
    "highest",
    "hours",
    "id",
    "in",
    "is",
    "list",
    "lowest",
    "manager",
    "month",
    "ms",
    "mtd",
    "ocn",
    "of",
    "on",
    "percentage",
    "practice",
    "project",
    "ps",
    "q1",
    "q2",
    "q3",
    "q4",
    "quarter",
    "ratio",
    "region",
    "revenue",
    "show",
    "shortfall",
    "strategic",
    "sum",
    "table",
    "target",
    "the",
    "to",
    "top",
    "total",
    "trend",
    "us",
    "variance",
    "versus",
    "vertical",
    "vs",
    "what",
    "which",
    "who",
    "with",
    "year",
    "ytd",
}

TEXT_SEARCH_STOPWORDS.update(
    {
        "also",
        "can",
        "could",
        "just",
        "kindly",
        "me",
        "need",
        "ok",
        "okay",
        "please",
        "pls",
        "tell",
        "want",
    }
)


@dataclass(slots=True)
class RapidIntent:
    metric: str
    comparison: str
    dimension: str
    dimension_column: str | None
    filters: dict[str, Any]
    sort: str
    limit: int
    output: str

    def model_dump(self) -> dict[str, Any]:
        return {
            "metric": self.metric,
            "comparison": self.comparison,
            "dimension": self.dimension,
            "dimension_column": self.dimension_column,
            "filters": self.filters,
            "sort": self.sort,
            "limit": self.limit,
            "output": self.output,
        }


def _default_financial_year(chat_context: dict[str, Any]) -> str:
    explicit = str(chat_context.get("financial_year") or "").strip()
    if explicit:
        return explicit
    env_year = os.getenv("RAPID_DEFAULT_FINANCIAL_YEAR", "").strip()
    if env_year:
        return env_year
    now = datetime.utcnow()
    if now.month >= 4:
        return f"{now.year}-{now.year + 1}"
    return f"{now.year - 1}-{now.year}"


def _current_fiscal_month(chat_context: dict[str, Any]) -> str:
    explicit = str(chat_context.get("selected_month") or "").strip().title()
    if explicit in MONTH_INDEX:
        return explicit
    short_month = datetime.utcnow().strftime("%b")
    return short_month if short_month in MONTH_INDEX else "Mar"


def _extract_financial_year(question: str, chat_context: dict[str, Any]) -> str:
    direct_match = re.search(r"\b(20\d{2}-20\d{2})\b", question)
    if direct_match:
        return direct_match.group(1)
    fy_match = re.search(r"\bfy\s*(20\d{2})\b", question.lower())
    if fy_match:
        end_year = int(fy_match.group(1))
        return f"{end_year - 1}-{end_year}"
    return _default_financial_year(chat_context)


def _extract_month(question: str, chat_context: dict[str, Any]) -> str | None:
    lowered = question.lower()
    for alias, month in MONTH_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", lowered):
            return month
    if "mtd" in lowered or "current month" in lowered:
        return _current_fiscal_month(chat_context)
    return None


def _extract_quarter(question: str) -> str | None:
    lowered = question.lower()
    for quarter in QUARTER_MONTHS:
        if quarter.lower() in lowered:
            return quarter
    return None


def _detect_metric(question: str) -> str:
    lowered = question.lower()
    if "billed hours" in lowered:
        return "billed_hours"
    if "billable hours" in lowered:
        return "billable_hours"
    if any(token in lowered for token in ("variance", "gap", "shortfall")):
        return "variance"
    if "forecast" in lowered:
        return "forecast"
    if "actual" in lowered or "actuals" in lowered:
        return "actual"
    if "budget" in lowered:
        return "budget"
    return "revenue"


def _detect_comparison(question: str) -> str:
    lowered = question.lower()
    has_budget = "budget" in lowered
    has_actual = "actual" in lowered or "actuals" in lowered or "revenue" in lowered
    has_forecast = "forecast" in lowered
    if has_budget and has_actual:
        return "budget_vs_actual"
    if has_forecast and has_budget:
        return "forecast_vs_budget"
    if has_forecast and has_actual:
        return "forecast_vs_actual"
    return "none"


def _detect_dimension(question: str) -> tuple[str, str | None]:
    lowered = question.lower()
    for keyword, label, column in DIMENSION_KEYWORDS:
        if keyword in lowered:
            return label, column
    return "Overall", None


def _detect_sort(question: str) -> str:
    lowered = question.lower()
    if any(token in lowered for token in ("lowest", "bottom", "worst", "ascending")):
        return "lowest"
    if any(token in lowered for token in ("highest", "top", "best", "descending")):
        return "highest"
    return "descending"


def _detect_limit(question: str) -> int:
    match = re.search(r"\b(?:top|bottom)\s+(\d{1,2})\b", question.lower())
    if match:
        return max(1, min(int(match.group(1)), 25))
    return 10


def _detect_output(question: str) -> str:
    lowered = question.lower()
    if any(token in lowered for token in ("chart", "graph", "trend", "plot")):
        return "chart"
    if any(token in lowered for token in ("table", "list", "top ", "bottom ", "show")):
        return "table"
    return "summary"


def _extract_text_search(question: str) -> str | None:
    lowered = question.lower()
    lowered = re.sub(r"\b20\d{2}-20\d{2}\b", " ", lowered)
    lowered = re.sub(r"\bfy\s*20\d{2}\b", " ", lowered)
    tokens = re.findall(r"[a-z0-9][a-z0-9.'&/-]*", lowered)
    search_tokens: list[str] = []
    month_tokens = set(MONTH_ALIASES)
    for token in tokens:
        normalized = token.strip("'\".,:;()[]{}")
        normalized = re.sub(r"(?:'s|s')$", "", normalized)
        compact = normalized.replace("/", "")
        if not normalized:
            continue
        if normalized in TEXT_SEARCH_STOPWORDS or compact in TEXT_SEARCH_STOPWORDS:
            continue
        if normalized in month_tokens:
            continue
        if normalized.isdigit():
            continue
        if len(normalized) < 2:
            continue
        search_tokens.append(normalized)
    if not search_tokens:
        return None
    return " ".join(search_tokens[:4])


def _extract_filters(question: str, chat_context: dict[str, Any]) -> dict[str, Any]:
    lowered = question.lower()
    fy = _extract_financial_year(question, chat_context)
    month = _extract_month(question, chat_context)
    quarter = _extract_quarter(question)
    filters: dict[str, Any] = {
        "fy": fy,
        "month": month,
        "quarter": quarter,
        "bdm": None,
        "geo_head": None,
        "practice_head": None,
        "customer": None,
        "project": None,
        "ms_ps": None,
        "text_search": _extract_text_search(question),
        "timeframe": "ytd" if "ytd" in lowered else "mtd" if "mtd" in lowered else "quarter" if quarter else "month" if month else "fy",
        "selected_month_index": MONTH_INDEX.get(month or _current_fiscal_month(chat_context), 12),
    }
    if " ms " in f" {lowered} " or re.search(r"\bms\b", lowered):
        filters["ms_ps"] = "MS"
    elif " ps " in f" {lowered} " or re.search(r"\bps\b", lowered):
        filters["ms_ps"] = "PS"
    return filters


def extract_rapid_intent(question: str, chat_context: dict[str, Any] | None = None) -> RapidIntent:
    chat_context = chat_context or {}
    metric = _detect_metric(question)
    comparison = _detect_comparison(question)
    dimension, dimension_column = _detect_dimension(question)
    output = _detect_output(question)
    filters = _extract_filters(question, chat_context)

    if output == "chart" and dimension_column is None:
        dimension = "Month"
        dimension_column = "source_month"

    return RapidIntent(
        metric=metric,
        comparison=comparison,
        dimension=dimension,
        dimension_column=dimension_column,
        filters=filters,
        sort=_detect_sort(question),
        limit=_detect_limit(question),
        output=output,
    )
