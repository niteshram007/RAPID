from __future__ import annotations

import re

from fastapi import HTTPException


_DESTRUCTIVE_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|merge|grant|revoke|execute|call)\b",
    re.IGNORECASE,
)


def validate_select_only_sql(sql: str) -> str:
    text = str(sql or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="SQL is required.")
    if _DESTRUCTIVE_SQL.search(text):
        raise HTTPException(status_code=400, detail="Only read-only SELECT queries are allowed.")
    if ";" in text.rstrip(";"):
        raise HTTPException(status_code=400, detail="Multiple SQL statements are not allowed.")
    statement = text.rstrip(";").lstrip(" \t\r\n(").lower()
    if not (statement.startswith("select") or statement.startswith("with")):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed.")
    return sql
