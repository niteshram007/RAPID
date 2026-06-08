"""SQL safety validation for the (future) RAPID analytics mode.

The LLM never executes SQL directly. Generated SQL must pass `validate_sql`
before a read-only query is run against an approved schema.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import sqlparse

FORBIDDEN_KEYWORDS = {
    "DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE",
    "CREATE", "GRANT", "REVOKE", "COPY", "EXECUTE", "MERGE",
    "REPLACE", "CALL", "VACUUM", "ATTACH", "DETACH",
}

# Approved RAPID tables -> approved columns.
APPROVED_SCHEMA: dict[str, set[str]] = {
    "rapid_chat_revenue_facts": {
        "metric_source",
        "financial_year",
        "source_month",
        "month_index",
        "fiscal_quarter",
        "customer_name",
        "group_company",
        "project_name",
        "ms_ps",
        "region",
        "practice_head",
        "geo_head",
        "bdm",
        "entity",
        "vertical",
        "strategic_account",
        "eeennn",
        "amount",
    },
}


@dataclass
class SQLValidationResult:
    ok: bool
    reason: str = ""
    normalized_sql: str = ""


def _approved_tables() -> set[str]:
    return set(APPROVED_SCHEMA.keys())


def validate_sql(sql: str) -> SQLValidationResult:
    if not sql or not sql.strip():
        return SQLValidationResult(False, "Empty query.")

    cleaned = sql.strip().rstrip(";").strip()

    # Single statement only
    statements = [s for s in sqlparse.parse(cleaned) if str(s).strip()]
    if len(statements) != 1:
        return SQLValidationResult(False, "Only a single SQL statement is allowed.")

    statement = statements[0]
    stmt_type = statement.get_type()
    upper = cleaned.upper()
    if stmt_type != "SELECT" and not upper.startswith("WITH "):
        return SQLValidationResult(False, "Only read-only SELECT queries are allowed.")

    # Forbidden keywords (word-boundary match)
    for kw in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{kw}\b", upper):
            return SQLValidationResult(False, f"Forbidden operation detected: {kw}.")

    # Block SELECT *
    if re.search(r"SELECT\s+\*", upper):
        return SQLValidationResult(False, "SELECT * is not allowed; select explicit columns.")

    # Block multiple statements / comments used to smuggle SQL
    if "--" in cleaned or "/*" in cleaned:
        return SQLValidationResult(False, "SQL comments are not allowed.")
    if ";" in cleaned:
        return SQLValidationResult(False, "Multiple statements are not allowed.")
    if not re.search(r"\bLIMIT\s+\d+\b", upper):
        return SQLValidationResult(False, "Queries must include a LIMIT clause.")

    # Only approved tables may be referenced
    referenced = _extract_table_names(cleaned)
    unapproved = referenced - _approved_tables()
    if unapproved:
        return SQLValidationResult(
            False, f"Query references unapproved tables: {', '.join(sorted(unapproved))}."
        )

    return SQLValidationResult(True, "ok", normalized_sql=cleaned)


def _extract_table_names(sql: str) -> set[str]:
    """Best-effort extraction of table names following FROM / JOIN."""
    names: set[str] = set()
    for match in re.finditer(r"\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_\.]*)", sql, re.IGNORECASE):
        token = match.group(1).split(".")[-1].lower()
        names.add(token)
    return names


def schema_description() -> str:
    """Human-readable approved schema for the SQL generation prompt."""
    lines = []
    for table, cols in APPROVED_SCHEMA.items():
        lines.append(f"- {table}({', '.join(sorted(cols))})")
    return "\n".join(lines)


# ---- Prompt-injection guard for RAG document text -------------------------

_INJECTION_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"reveal (the )?system prompt",
    r"disregard (the )?(above|previous)",
    r"you are now",
    r"bypass( all)? (security|safety)",
    r"delete (all )?data",
    r"run (the following )?command",
]


def contains_prompt_injection(text: str) -> bool:
    lowered = text.lower()
    return any(re.search(p, lowered) for p in _INJECTION_PATTERNS)
