from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

FISCAL_MONTH_ORDER = [
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
MONTH_TO_NUMBER = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}
NUMBER_TO_MONTH = {value: key for key, value in MONTH_TO_NUMBER.items()}
MONTH_TOKEN_LOOKUP = {
    "jan": "Jan",
    "january": "Jan",
    "feb": "Feb",
    "february": "Feb",
    "mar": "Mar",
    "march": "Mar",
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
}
QUARTER_BY_MONTH = {
    "Apr": "Q1",
    "May": "Q1",
    "Jun": "Q1",
    "Jul": "Q2",
    "Aug": "Q2",
    "Sep": "Q2",
    "Oct": "Q3",
    "Nov": "Q3",
    "Dec": "Q3",
    "Jan": "Q4",
    "Feb": "Q4",
    "Mar": "Q4",
}
MONTH_FIELD_KEYS = (
    ("apr_2026", "Apr"),
    ("may_2026", "May"),
    ("jun_2026", "Jun"),
    ("jul_2026", "Jul"),
    ("aug_2026", "Aug"),
    ("sep_2026", "Sep"),
    ("oct_2026", "Oct"),
    ("nov_2026", "Nov"),
    ("dec_2026", "Dec"),
    ("jan_2027", "Jan"),
    ("feb_2027", "Feb"),
    ("mar_2027", "Mar"),
)
HEADER_MONTH_PATTERN = re.compile(
    r"(?i)\b("
    + "|".join(sorted(MONTH_TOKEN_LOOKUP.keys(), key=len, reverse=True))
    + r")[-\s_/]*(\d{2,4})\b"
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value).lower())


def coerce_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if numeric == numeric else default
    text = normalize_text(value)
    if not text:
        return default
    negative = text.startswith("(") and text.endswith(")")
    cleaned = text.replace(",", "").replace("$", "").replace("%", "").strip()
    cleaned = cleaned.strip("()")
    cleaned = re.sub(r"[^0-9.\-]+", "", cleaned)
    if not cleaned:
        return default
    if negative and not cleaned.startswith("-"):
        cleaned = f"-{cleaned}"
    try:
        return float(cleaned)
    except ValueError:
        return default


def safe_pct(numerator: float, denominator: float) -> float:
    if not denominator:
        return 0.0
    return (numerator / denominator) * 100


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = normalize_text(value)
    if not text:
        return None

    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        pass

    for pattern in (
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%b-%Y",
        "%d %b %Y",
        "%d-%b-%y",
        "%b-%y",
        "%b-%Y",
        "%b %Y",
        "%B %Y",
    ):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def parse_financial_year(financial_year: str) -> tuple[int, int]:
    normalized = normalize_text(financial_year)
    matches = re.findall(r"\d{4}", normalized)
    if len(matches) >= 2:
        return int(matches[0]), int(matches[1])
    if len(matches) == 1:
        start = int(matches[0])
        return start, start + 1
    raise ValueError(f"Invalid financial year: {financial_year}")


def build_fiscal_month_specs(financial_year: str) -> list[dict[str, Any]]:
    start_year, end_year = parse_financial_year(financial_year)
    specs: list[dict[str, Any]] = []
    for index, (_, month_name) in enumerate(MONTH_FIELD_KEYS):
        year = end_year if month_name in {"Jan", "Feb", "Mar"} else start_year
        specs.append(
            {
                "month": month_name,
                "year": year,
                "quarter": QUARTER_BY_MONTH[month_name],
                "index": index,
            }
        )
    return specs


def month_sort_key(month: str, year: int, financial_year: str | None = None) -> int:
    month_name = normalize_month_name(month) or month
    month_index = FISCAL_MONTH_ORDER.index(month_name) if month_name in FISCAL_MONTH_ORDER else 0
    if financial_year:
        start_year, end_year = parse_financial_year(financial_year)
        year_rank = 0 if year == start_year else 1 if year == end_year else year
        return year_rank * 100 + month_index
    return year * 100 + month_index


def normalize_month_name(value: Any) -> str | None:
    text = normalize_text(value).lower()
    if not text:
        return None
    if text in MONTH_TOKEN_LOOKUP:
        return MONTH_TOKEN_LOOKUP[text]
    return MONTH_TOKEN_LOOKUP.get(text[:3])


def fiscal_year_for_calendar_month(month: str, year: int) -> str:
    month_name = normalize_month_name(month) or month
    if month_name in {"Jan", "Feb", "Mar"}:
        return f"{year - 1}-{year}"
    return f"{year}-{year + 1}"


def build_payload_lookup(raw_payload: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(raw_payload, dict):
        return {}
    lookup: dict[str, Any] = {}
    for key, value in raw_payload.items():
        normalized = normalize_header(key)
        if normalized and normalized not in lookup:
            lookup[normalized] = value
    return lookup


def get_lookup_value(lookup: dict[str, Any], *aliases: str) -> Any:
    for alias in aliases:
        value = lookup.get(normalize_header(alias))
        if value not in (None, ""):
            return value
    return None


def get_text_value(default_value: Any, lookup: dict[str, Any], *aliases: str) -> str:
    if normalize_text(default_value):
        return normalize_text(default_value)
    return normalize_text(get_lookup_value(lookup, *aliases))


def get_float_value(default_value: Any, lookup: dict[str, Any], *aliases: str) -> float:
    if default_value not in (None, ""):
        return coerce_float(default_value, 0.0)
    return coerce_float(get_lookup_value(lookup, *aliases), 0.0)


def get_date_value(default_value: Any, lookup: dict[str, Any], *aliases: str) -> date | None:
    parsed_default = parse_date(default_value)
    if parsed_default is not None:
        return parsed_default
    return parse_date(get_lookup_value(lookup, *aliases))


def first_present_value(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def scan_monthly_payload_values(
    raw_payload: dict[str, Any] | None,
    financial_year: str,
) -> list[dict[str, Any]]:
    if not isinstance(raw_payload, dict):
        return []

    start_year, end_year = parse_financial_year(financial_year)
    month_entries: list[dict[str, Any]] = []

    for key, value in raw_payload.items():
        header = normalize_text(key)
        if not header:
            continue
        match = HEADER_MONTH_PATTERN.search(header)
        if not match:
            continue
        month_name = normalize_month_name(match.group(1))
        if not month_name:
            continue

        year_token = match.group(2)
        year = int(year_token)
        if year < 100:
            year += 2000

        if year not in {start_year, end_year}:
            continue
        if month_name in {"Jan", "Feb", "Mar"} and year != end_year:
            continue
        if month_name not in {"Jan", "Feb", "Mar"} and year != start_year:
            continue

        month_entries.append(
            {
                "month": month_name,
                "year": year,
                "quarter": QUARTER_BY_MONTH[month_name],
                "value": coerce_float(value, 0.0),
                "header": header,
            }
        )

    month_entries.sort(
        key=lambda item: month_sort_key(str(item["month"]), int(item["year"]), financial_year)
    )
    return month_entries


def upsert_uploaded_file(
    cursor: Any,
    *,
    file_id: str,
    file_name: str,
    file_type: str,
    upload_month: str | None,
    upload_year: int | None,
    uploaded_by: str,
    status: str,
    rows_processed: int,
    rows_failed: int,
    error_message: str | None,
    created_at: str,
) -> None:
    cursor.execute(
        """
        insert into uploaded_files (
            id,
            file_name,
            file_type,
            upload_month,
            upload_year,
            uploaded_by,
            status,
            rows_processed,
            rows_failed,
            error_message,
            created_at
        )
        values (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz)
        on conflict (id)
        do update set
            file_name = excluded.file_name,
            file_type = excluded.file_type,
            upload_month = excluded.upload_month,
            upload_year = excluded.upload_year,
            uploaded_by = excluded.uploaded_by,
            status = excluded.status,
            rows_processed = excluded.rows_processed,
            rows_failed = excluded.rows_failed,
            error_message = excluded.error_message,
            created_at = excluded.created_at
        """,
        (
            file_id,
            file_name,
            file_type,
            upload_month,
            upload_year,
            uploaded_by,
            status,
            rows_processed,
            rows_failed,
            error_message,
            created_at,
        ),
    )

