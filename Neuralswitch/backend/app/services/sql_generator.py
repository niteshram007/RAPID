from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.neural_switch.intent_extractor import RapidIntent
from app.prompts.sql_prompt import SQL_GENERATION_PROMPT
from app.services.llm_client import LLMClient
from app.services.sql_validator import approved_schema_description, validate_read_only_sql

SAFE_VIEW_NAME = "rapid_chat_revenue_facts"


@dataclass(slots=True)
class SQLGenerationResult:
    sql: str
    source: str
    validation_reason: str = "ok"


def _extract_sql(response_text: str) -> str:
    text_value = str(response_text or "").strip()
    if text_value.startswith("```"):
        text_value = text_value.strip("`")
        if text_value.lower().startswith("sql"):
            text_value = text_value[3:].strip()
    return text_value.strip().rstrip(";")


def _sql_literal(value: str) -> str:
    return value.replace("'", "''")


def _metric_select(metric_source: str, alias: str) -> str:
    return f"sum(case when metric_source = '{metric_source}' then amount else 0 end) as {alias}"


def _text_search_tokens(text_search: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9.'&/-]*", text_search)
    cleaned: list[str] = []
    for token in tokens:
        normalized = token.strip("'\".,:;()[]{}")
        normalized = re.sub(r"(?:'s|s')$", "", normalized)
        if len(normalized) < 2:
            continue
        if normalized.lower() in {item.lower() for item in cleaned}:
            continue
        cleaned.append(normalized)
    return cleaned[:4]


def _build_where_clauses(intent: RapidIntent) -> list[str]:
    filters = intent.filters or {}
    clauses: list[str] = []
    fy = str(filters.get("fy") or "").strip()
    if fy:
        clauses.append(f"financial_year = '{_sql_literal(fy)}'")
    quarter = str(filters.get("quarter") or "").strip().upper()
    if quarter:
        clauses.append(f"fiscal_quarter = '{_sql_literal(quarter)}'")
    month = str(filters.get("month") or "").strip().title()
    if month:
        clauses.append(f"source_month = '{_sql_literal(month)}'")
    elif str(filters.get("timeframe") or "") == "ytd":
        clauses.append(f"month_index <= {int(filters.get('selected_month_index') or 12)}")
    if filters.get("ms_ps"):
        clauses.append(f"ms_ps = '{_sql_literal(str(filters['ms_ps']).upper())}'")
    text_search = str(filters.get("text_search") or "").strip()
    if text_search:
        search_columns = (
            "bdm",
            "customer_name",
            "group_company",
            "project_name",
            "geo_head",
            "practice_head",
            "entity",
            "vertical",
            "strategic_account",
            "eeennn",
        )
        token_clauses: list[str] = []
        for token in _text_search_tokens(text_search):
            pattern = f"%{_sql_literal(token)}%"
            token_clauses.append(
                "("
                + " or ".join(f"{column} ilike '{pattern}'" for column in search_columns)
                + ")"
            )
        if token_clauses:
            clauses.append("(" + " and ".join(token_clauses) + ")")
    return clauses


def build_fallback_sql(intent: RapidIntent) -> str:
    dimension_column = intent.dimension_column
    where_clauses = _build_where_clauses(intent)
    where_sql = f" where {' and '.join(where_clauses)}" if where_clauses else ""
    direction = "asc" if intent.sort == "lowest" else "desc"
    limit = max(1, min(int(intent.limit or 10), 100))
    comparison = intent.comparison
    metric = intent.metric

    if dimension_column == "source_month":
        return (
            "select source_month, month_index, "
            + (
                _metric_select("actual", "actual_total")
                if metric in {"actual", "revenue"} and comparison == "none"
                else _metric_select("budget", "budget_total")
                if metric == "budget" and comparison == "none"
                else _metric_select("forecast", "forecast_total")
                if metric == "forecast" and comparison == "none"
                else _metric_select("actual", "actual_total")
            )
            + f" from {SAFE_VIEW_NAME}{where_sql} group by source_month, month_index order by month_index asc limit {limit}"
        )

    if comparison != "none":
        select_bits = [
            _metric_select("budget", "budget_total"),
            _metric_select("forecast", "forecast_total"),
            _metric_select("actual", "actual_total"),
            "sum(case when metric_source = 'actual' then amount else 0 end) - sum(case when metric_source = 'budget' then amount else 0 end) as variance_vs_budget",
        ]
        rank_column = "actual_total"
        if metric == "variance":
            rank_column = "variance_vs_budget"
        elif metric == "budget":
            rank_column = "budget_total"
        elif metric == "forecast":
            rank_column = "forecast_total"
        if dimension_column:
            return (
                f"select {dimension_column}, "
                + ", ".join(select_bits)
                + f" from {SAFE_VIEW_NAME}{where_sql} group by {dimension_column} order by {rank_column} {direction} nulls last limit {limit}"
            )
        return (
            "select "
            + ", ".join(select_bits)
            + f" from {SAFE_VIEW_NAME}{where_sql} limit 1"
        )

    metric_source = "actual"
    alias = "actual_total"
    if metric == "budget":
        metric_source = "budget"
        alias = "budget_total"
    elif metric == "forecast":
        metric_source = "forecast"
        alias = "forecast_total"

    if dimension_column:
        return (
            f"select {dimension_column}, {_metric_select(metric_source, alias)} "
            f"from {SAFE_VIEW_NAME}{where_sql} group by {dimension_column} order by {alias} {direction} nulls last limit {limit}"
        )
    return f"select {_metric_select(metric_source, alias)} from {SAFE_VIEW_NAME}{where_sql} limit 1"


async def generate_sql(
    *,
    question: str,
    intent: RapidIntent,
    semantic_context: str,
    history_context: str,
    client: LLMClient,
    model: str,
) -> SQLGenerationResult:
    if (intent.filters or {}).get("text_search"):
        fallback_sql = build_fallback_sql(intent)
        fallback_validation = validate_read_only_sql(fallback_sql)
        if not fallback_validation.ok:
            raise RuntimeError(f"Rapid SQL validation failed: {fallback_validation.reason}")
        return SQLGenerationResult(
            sql=fallback_validation.normalized_sql,
            source="fallback_text_search",
        )

    prompt = SQL_GENERATION_PROMPT.format(
        schema=approved_schema_description(),
        question=(
            f"{question}\n\n"
            f"Structured intent:\n{json.dumps(intent.model_dump(), ensure_ascii=True)}\n\n"
            f"Semantic RAPID context:\n{semantic_context or 'No semantic context available.'}\n\n"
            f"Recent chat context:\n{history_context or 'No prior chat context.'}\n\n"
            "Always query rapid_chat_revenue_facts. Use explicit columns only. "
            "Use SUM(amount) and metric_source filters for budget, actual, and forecast. "
            "For month trends, group by source_month and month_index and order by month_index."
        ),
    )
    try:
        result = await client.chat_completion(
            messages=[
                {"role": "system", "content": "Generate a single safe PostgreSQL SELECT query only."},
                {"role": "user", "content": prompt},
            ],
            model=model,
            temperature=0.0,
            max_tokens=600,
            top_p=1.0,
        )
        generated_sql = _extract_sql(result.get("content") or "")
        validation = validate_read_only_sql(generated_sql)
        if validation.ok:
            return SQLGenerationResult(sql=validation.normalized_sql, source="llm")
    except Exception:
        generated_sql = ""

    fallback_sql = build_fallback_sql(intent)
    fallback_validation = validate_read_only_sql(fallback_sql)
    if not fallback_validation.ok:
        raise RuntimeError(f"Rapid SQL validation failed: {fallback_validation.reason}")
    return SQLGenerationResult(
        sql=fallback_validation.normalized_sql,
        source="fallback",
        validation_reason=fallback_validation.reason,
    )
