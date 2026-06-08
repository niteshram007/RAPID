from __future__ import annotations

from app.services.safety_service import SQLValidationResult, schema_description, validate_sql


def validate_read_only_sql(sql: str) -> SQLValidationResult:
    return validate_sql(sql)


def approved_schema_description() -> str:
    return schema_description()
