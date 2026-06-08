from __future__ import annotations

from typing import Any

from app.schemas.chat import TableData


def table_to_records(table: TableData | None) -> list[dict[str, Any]]:
    if table is None:
        return []
    records: list[dict[str, Any]] = []
    columns = [str(column) for column in table.columns]
    for row in table.rows:
        records.append({column: row[index] if index < len(row) else None for index, column in enumerate(columns)})
    return records


def is_numeric(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return True
    try:
        float(str(value).replace("$", "").replace(",", ""))
        return True
    except Exception:
        return False


def coerce_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace("$", "").replace(",", ""))
    except Exception:
        return None


def filename_slug(title: str | None, fallback: str) -> str:
    import re

    text = str(title or fallback).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text[:80] or fallback
