from __future__ import annotations

import json
import re
import asyncio
import time
from dataclasses import dataclass
from typing import Any

from app.neural_switch.intent_extractor import RapidIntent, extract_rapid_intent
from app.neural_switch.response_guard import apply_guard
from app.prompts.rapid_prompt import RAPID_DOMAIN_CONTEXT, RAPID_EXPLANATION_PROMPT
from app.schemas.chat import ChartData, Source, TableData
from app.services.embedding_service import embed_texts
from app.services.llm_client import LLMClient
from app.services.rapid_query_executor import build_chart, build_table, ensure_rapid_query_view, run_sql
from app.services.sql_generator import generate_sql
from app.services.vector_store import get_vector_store

RAPID_CONTEXT_DOCUMENTS = (
    {
        "id": "rapid:glossary",
        "name": "RAPID Glossary",
        "text": (
            "Budget is the RAPID plan value stored in PostgreSQL. Actuals come from uploaded YTD Revenue data. "
            "Forecast comes from RAPID forecast entries. Variance can mean Actual minus Budget, Forecast minus Budget, "
            "or Forecast minus Actual depending on the question."
        ),
    },
    {
        "id": "rapid:business-rules",
        "name": "RAPID Business Rules",
        "text": (
            "PostgreSQL is the source of truth for RAPID calculations. Vector retrieval is only for semantic help, glossary, "
            "business rules, KPI definitions, example questions, and intent hints. MS records should use OCN Number as the stable "
            "reference key. PS records should use Emp ID as the stable reference key."
        ),
    },
    {
        "id": "rapid:kpi-definitions",
        "name": "RAPID KPI Definitions",
        "text": (
            "FY means April to March. Q1 is Apr-Jun. Q2 is Jul-Sep. Q3 is Oct-Dec. Q4 is Jan-Mar. MTD is the selected month only. "
            "YTD is April through the selected month. Negative variance means underperformance. Positive variance means overperformance."
        ),
    },
    {
        "id": "rapid:schema",
        "name": "RAPID Query Schema",
        "text": (
            "rapid_chat_revenue_facts contains metric_source, financial_year, source_month, month_index, fiscal_quarter, customer_name, "
            "group_company, project_name, ms_ps, region, practice_head, geo_head, bdm, entity, vertical, strategic_account, eeennn, amount."
        ),
    },
    {
        "id": "rapid:intents",
        "name": "RAPID Intent Patterns",
        "text": (
            "Common RAPID questions include budget versus actual, forecast gap, YTD revenue, MTD actuals, top customers, BDM performance, "
            "Geo Head splits, Practice Head splits, MS versus PS comparisons, company trends, vertical trends, and strategic account risk."
        ),
    },
    {
        "id": "rapid:powerbi-tools",
        "name": "RAPID PowerBI Style Tools",
        "text": (
            "For PowerBI-style analysis, first identify the business scope from the user question, then calculate exact totals in PostgreSQL. "
            "Comparison prompts like compare Saibal April budget and actuals should return budget, actual, forecast, variance, achievement percent, "
            "customer drilldown, owner drilldown, MS/PS split, and chart-ready output. A follow-up chart request should reuse the verified prior table."
        ),
    },
)

_RAPID_CONTEXT_SEEDED = False


@dataclass(slots=True)
class RapidAnswer:
    answer: str
    sources: list[Source]
    table: TableData | None
    chart: ChartData | None
    metadata: dict[str, Any]


_RAPID_ANSWER_CACHE: dict[str, tuple[float, RapidAnswer]] = {}
_RAPID_ANSWER_CACHE_TTL_SECONDS = 300
_RAPID_ANSWER_CACHE_LIMIT = 128


def _normalize_cache_text(value: Any) -> str:
    return " ".join(str(value or "").lower().split())


def _rapid_answer_cache_key(
    question: str,
    intent: RapidIntent,
    chat_context: dict[str, Any],
    *,
    debug: bool,
) -> str:
    context_bits = {
        "financial_year": chat_context.get("financial_year"),
        "selected_month": chat_context.get("selected_month"),
        "dashboard_timeframe": chat_context.get("dashboard_timeframe"),
        "debug": debug,
    }
    return json.dumps(
        {
            "question": _normalize_cache_text(question),
            "intent": intent.model_dump(),
            "context": context_bits,
        },
        sort_keys=True,
        ensure_ascii=True,
    )


def _clone_rapid_answer(answer: RapidAnswer, *, cache_hit: bool) -> RapidAnswer:
    metadata = dict(answer.metadata or {})
    metadata["cache_hit"] = cache_hit
    return RapidAnswer(
        answer=answer.answer,
        sources=list(answer.sources or []),
        table=answer.table,
        chart=answer.chart,
        metadata=metadata,
    )


def _get_cached_rapid_answer(cache_key: str) -> RapidAnswer | None:
    cached = _RAPID_ANSWER_CACHE.get(cache_key)
    if cached is None:
        return None
    cached_at, answer = cached
    if time.monotonic() - cached_at > _RAPID_ANSWER_CACHE_TTL_SECONDS:
        _RAPID_ANSWER_CACHE.pop(cache_key, None)
        return None
    return _clone_rapid_answer(answer, cache_hit=True)


def _store_cached_rapid_answer(cache_key: str, answer: RapidAnswer) -> RapidAnswer:
    if len(_RAPID_ANSWER_CACHE) >= _RAPID_ANSWER_CACHE_LIMIT:
        oldest_key = min(_RAPID_ANSWER_CACHE, key=lambda key: _RAPID_ANSWER_CACHE[key][0])
        _RAPID_ANSWER_CACHE.pop(oldest_key, None)
    _RAPID_ANSWER_CACHE[cache_key] = (time.monotonic(), _clone_rapid_answer(answer, cache_hit=False))
    return answer


def _seed_rapid_context() -> None:
    global _RAPID_CONTEXT_SEEDED
    if _RAPID_CONTEXT_SEEDED:
        return
    store = get_vector_store()
    try:
        store.delete(where={"scope": "rapid"})
    except Exception:
        pass
    embeddings = embed_texts([item["text"] for item in RAPID_CONTEXT_DOCUMENTS])
    store.add(
        ids=[item["id"] for item in RAPID_CONTEXT_DOCUMENTS],
        embeddings=embeddings,
        documents=[item["text"] for item in RAPID_CONTEXT_DOCUMENTS],
        metadatas=[
            {
                "scope": "rapid",
                "document_id": item["id"],
                "document_name": item["name"],
            }
            for item in RAPID_CONTEXT_DOCUMENTS
        ],
    )
    _RAPID_CONTEXT_SEEDED = True


def _retrieve_rapid_context(question: str, intent: RapidIntent, top_k: int = 5) -> tuple[str, list[Source]]:
    _seed_rapid_context()
    store = get_vector_store()
    query_embedding = embed_texts([f"{question}\n{json.dumps(intent.model_dump(), ensure_ascii=True)}"])[0]
    matches = store.query(query_embedding, top_k=top_k, where={"scope": "rapid"})
    blocks: list[str] = []
    sources: list[Source] = []
    for match in matches:
        document = str(match.get("document") or "").strip()
        metadata = match.get("metadata") or {}
        if not document:
            continue
        name = str(metadata.get("document_name") or "RAPID context")
        blocks.append(f"[{name}]\n{document}")
        sources.append(
            Source(
                document_id=str(metadata.get("document_id") or ""),
                document_name=name,
                page=None,
                chunk_text=document[:500],
                score=round(float(match.get("score") or 0.0), 4),
            )
        )
    return "\n\n".join(blocks), sources


def _build_markdown_table(rows: list[dict[str, Any]], max_rows: int = 8) -> str:
    if not rows:
        return ""
    columns = list(rows[0].keys())
    header = "| " + " | ".join(columns) + " |"
    divider = "|" + "|".join("---" for _ in columns) + "|"
    body: list[str] = []
    for row in rows[:max_rows]:
        body.append("| " + " | ".join(str(row.get(column, "")) for column in columns) + " |")
    return "\n".join([header, divider, *body])


def _sql_literal(value: Any) -> str:
    return str(value or "").replace("'", "''")


def _format_money(value: Any) -> str:
    try:
        numeric = float(value or 0)
    except (TypeError, ValueError):
        numeric = 0.0
    sign = "-" if numeric < 0 else ""
    absolute = abs(numeric)
    if absolute >= 1_000_000:
        return f"{sign}${absolute / 1_000_000:.2f}M"
    if absolute >= 1_000:
        return f"{sign}${absolute / 1_000:.1f}K"
    return f"{sign}${absolute:,.0f}"


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _format_percentage(value: Any) -> str:
    numeric = _safe_float(value)
    return f"{numeric:.1f}%"


def _text_search_tokens(text_search: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9.'&/-]*", text_search)
    cleaned: list[str] = []
    for token in tokens:
        normalized = re.sub(r"(?:'s|s')$", "", token.strip("'\".,:;()[]{}"))
        if len(normalized) < 2:
            continue
        if normalized.lower() in {item.lower() for item in cleaned}:
            continue
        cleaned.append(normalized)
    return cleaned[:4]


def _rapid_period_clauses(intent: RapidIntent) -> list[str]:
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
    ms_ps = str(filters.get("ms_ps") or "").strip().upper()
    if ms_ps:
        clauses.append(f"ms_ps = '{_sql_literal(ms_ps)}'")
    return clauses


def _rapid_text_search_clause(text_search: str) -> str:
    search_columns = (
        "bdm",
        "practice_head",
        "geo_head",
        "customer_name",
        "group_company",
        "project_name",
        "entity",
        "vertical",
        "strategic_account",
        "eeennn",
    )
    token_clauses: list[str] = []
    for token in _text_search_tokens(text_search):
        pattern = f"%{_sql_literal(token)}%"
        token_clauses.append(
            "(" + " or ".join(f"{column} ilike '{pattern}'" for column in search_columns) + ")"
        )
    return "(" + " and ".join(token_clauses) + ")" if token_clauses else ""


def _build_budget_profile_answer(
    question: str,
    intent: RapidIntent,
    semantic_sources: list[Source],
    *,
    debug: bool,
) -> RapidAnswer | None:
    filters = intent.filters or {}
    text_search = str(filters.get("text_search") or "").strip()
    if intent.metric != "budget" or not text_search:
        return None

    where_clauses = ["metric_source = 'budget'", *_rapid_period_clauses(intent)]
    search_clause = _rapid_text_search_clause(text_search)
    if search_clause:
        where_clauses.append(search_clause)
    where_sql = " and ".join(where_clauses)

    summary_rows = run_sql(
        "select "
        "sum(amount) as budget_total, "
        "count(*) as fact_rows, "
        "count(distinct nullif(group_company, 'Unassigned')) as customer_count, "
        "count(distinct nullif(project_name, 'Unassigned')) as project_count "
        f"from rapid_chat_revenue_facts where {where_sql}"
    )
    summary = summary_rows[0] if summary_rows else {}
    total_budget = float(summary.get("budget_total") or 0.0)
    if total_budget == 0:
        return None

    owner_rows = run_sql(
        "select bdm, practice_head, geo_head, sum(amount) as budget "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by bdm, practice_head, geo_head "
        "order by budget desc nulls last limit 5"
    )
    customer_rows_raw = run_sql(
        "select group_company as customer, sum(amount) as budget, count(distinct project_name) as projects "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by group_company order by budget desc nulls last limit 8"
    )
    vertical_rows_raw = run_sql(
        "select vertical, sum(amount) as budget, count(distinct group_company) as customers "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by vertical order by budget desc nulls last limit 8"
    )

    display_name = " ".join(_text_search_tokens(text_search)).strip() or text_search
    display_name = display_name.title()
    fy = str(filters.get("fy") or "selected FY")
    timeframe = str(filters.get("timeframe") or "fy").upper()
    customer_count = int(summary.get("customer_count") or 0)
    project_count = int(summary.get("project_count") or 0)

    answer_lines = [
        f"**{display_name}'s budget for {fy} is {_format_money(total_budget)}.**",
        (
            f"This is calculated from RAPID PostgreSQL budget facts for the {timeframe} scope, "
            f"covering {customer_count:,} customer group(s) and {project_count:,} project(s)."
        ),
    ]
    if owner_rows:
        owner = owner_rows[0]
        answer_lines.append(
            "Primary owner match: "
            f"BDM **{owner.get('bdm') or 'Unassigned'}**, "
            f"Practice Head **{owner.get('practice_head') or 'Unassigned'}**, "
            f"Geo Head **{owner.get('geo_head') or 'Unassigned'}**."
        )

    customer_rows = [
        {
            "Customer": row.get("customer") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Projects": int(row.get("projects") or 0),
        }
        for row in customer_rows_raw
    ]
    vertical_rows = [
        {
            "Vertical": row.get("vertical") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Customers": int(row.get("customers") or 0),
        }
        for row in vertical_rows_raw
    ]

    if customer_rows:
        answer_lines.append("")
        answer_lines.append("Top customer groups:")
        answer_lines.append(_build_markdown_table(customer_rows, max_rows=8))
    if vertical_rows:
        answer_lines.append("")
        answer_lines.append("Vertical split:")
        answer_lines.append(_build_markdown_table(vertical_rows, max_rows=8))
    answer_lines.append("")
    answer_lines.append("Suggested chart: use a bar chart by customer group using the table returned with this answer.")

    table = TableData(
        columns=["Customer", "Budget", "Projects"],
        rows=[
            [row.get("customer") or "Unassigned", float(row.get("budget") or 0.0), int(row.get("projects") or 0)]
            for row in customer_rows_raw
        ],
    )
    chart = ChartData(type="bar", x="Customer", y="Budget")
    sources = [
        *semantic_sources,
        Source(
            document_id="rapid:postgresql",
            document_name="RAPID PostgreSQL",
            page=None,
            chunk_text="Budget profile calculated from rapid_chat_revenue_facts.",
            score=1.0,
        ),
    ]
    metadata: dict[str, Any] = {
        "model": "deterministic-rapid-sql",
        "mode": "rapid_analytics",
        "tool_route": "rapid_analytics",
        "rapid_sql_rows": len(customer_rows_raw),
        "intent": intent.model_dump(),
        "table": table.model_dump(),
        "chart": chart.model_dump(),
        "sql_generation_source": "deterministic_budget_profile",
    }
    if debug:
        metadata["sql_used"] = f"select ... from rapid_chat_revenue_facts where {where_sql}"
    return RapidAnswer(
        answer="\n".join(answer_lines),
        sources=sources,
        table=table,
        chart=chart,
        metadata=metadata,
    )


def _build_actual_profile_answer(
    question: str,
    intent: RapidIntent,
    semantic_sources: list[Source],
    *,
    debug: bool,
) -> RapidAnswer | None:
    if intent.metric not in {"actual", "revenue"} or intent.comparison != "none":
        return None

    filters = intent.filters or {}
    where_clauses = ["metric_source = 'actual'", *_rapid_period_clauses(intent)]
    text_search = str(filters.get("text_search") or "").strip()
    search_clause = _rapid_text_search_clause(text_search)
    if search_clause:
        where_clauses.append(search_clause)
    where_sql = " and ".join(where_clauses)

    summary_rows = run_sql(
        "select "
        "sum(amount) as actual_total, "
        "count(*) as fact_rows, "
        "count(distinct nullif(group_company, 'Unassigned')) as customer_count, "
        "count(distinct nullif(project_name, 'Unassigned')) as project_count "
        f"from rapid_chat_revenue_facts where {where_sql}"
    )
    summary = summary_rows[0] if summary_rows else {}
    total_actual = float(summary.get("actual_total") or 0.0)
    if total_actual == 0:
        return None

    customer_rows_raw = run_sql(
        "select group_company as customer, sum(amount) as actual, count(distinct project_name) as projects "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by group_company order by actual desc nulls last limit 10"
    )
    msps_rows_raw = run_sql(
        "select ms_ps, sum(amount) as actual, count(distinct group_company) as customers "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by ms_ps order by actual desc nulls last"
    )
    entity_rows_raw = run_sql(
        "select entity as company, sum(amount) as actual, count(distinct group_company) as customers "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by entity order by actual desc nulls last limit 8"
    )
    vertical_rows_raw = run_sql(
        "select vertical, sum(amount) as actual, count(distinct group_company) as customers "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by vertical order by actual desc nulls last limit 8"
    )
    month_rows_raw = run_sql(
        "select source_month as month, sum(amount) as actual "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by source_month, month_index order by month_index asc"
    )

    fy = str(filters.get("fy") or "selected FY")
    timeframe = str(filters.get("timeframe") or "fy").upper()
    customer_count = int(summary.get("customer_count") or 0)
    project_count = int(summary.get("project_count") or 0)
    scope_label = "matching scope" if text_search else "overall RAPID scope"
    answer_lines = [
        f"**Actual revenue for {fy} is {_format_money(total_actual)}.**",
        (
            f"This is from RAPID PostgreSQL actual facts for the {timeframe} {scope_label}, "
            f"covering {customer_count:,} customer group(s) and {project_count:,} project(s)."
        ),
    ]

    customer_rows = [
        {
            "Customer": row.get("customer") or "Unassigned",
            "Actual": _format_money(row.get("actual")),
            "Projects": int(row.get("projects") or 0),
        }
        for row in customer_rows_raw
    ]
    msps_rows = [
        {
            "MS/PS": row.get("ms_ps") or "Unassigned",
            "Actual": _format_money(row.get("actual")),
            "Customers": int(row.get("customers") or 0),
        }
        for row in msps_rows_raw
    ]
    entity_rows = [
        {
            "Company": row.get("company") or "Unassigned",
            "Actual": _format_money(row.get("actual")),
            "Customers": int(row.get("customers") or 0),
        }
        for row in entity_rows_raw
    ]
    vertical_rows = [
        {
            "Vertical": row.get("vertical") or "Unassigned",
            "Actual": _format_money(row.get("actual")),
            "Customers": int(row.get("customers") or 0),
        }
        for row in vertical_rows_raw
    ]
    month_rows = [
        {
            "Month": row.get("month") or "Unassigned",
            "Actual": _format_money(row.get("actual")),
        }
        for row in month_rows_raw
    ]

    for title, rows in (
        ("Top customer groups", customer_rows),
        ("MS/PS split", msps_rows),
        ("Company split", entity_rows),
        ("Vertical split", vertical_rows),
        ("Month trend", month_rows),
    ):
        if rows:
            answer_lines.append("")
            answer_lines.append(f"{title}:")
            answer_lines.append(_build_markdown_table(rows, max_rows=10))
    answer_lines.append("")
    answer_lines.append("Suggested chart: use the returned customer table for a bar or pie chart, and the month table for a line trend.")

    table = TableData(
        columns=["Customer", "Actual", "Projects"],
        rows=[
            [row.get("customer") or "Unassigned", float(row.get("actual") or 0.0), int(row.get("projects") or 0)]
            for row in customer_rows_raw
        ],
    )
    chart = ChartData(type="bar", x="Customer", y="Actual")
    sources = [
        *semantic_sources,
        Source(
            document_id="rapid:postgresql",
            document_name="RAPID PostgreSQL",
            page=None,
            chunk_text="Actual revenue profile calculated from rapid_chat_revenue_facts.",
            score=1.0,
        ),
    ]
    metadata: dict[str, Any] = {
        "model": "deterministic-rapid-sql",
        "mode": "rapid_analytics",
        "tool_route": "rapid_analytics",
        "rapid_sql_rows": len(customer_rows_raw),
        "intent": intent.model_dump(),
        "table": table.model_dump(),
        "chart": chart.model_dump(),
        "actual_profile": {
            "ms_ps": msps_rows_raw,
            "company": entity_rows_raw,
            "vertical": vertical_rows_raw,
            "month": month_rows_raw,
        },
        "sql_generation_source": "deterministic_actual_profile",
    }
    if debug:
        metadata["sql_used"] = f"select ... from rapid_chat_revenue_facts where {where_sql}"
    return RapidAnswer(
        answer="\n".join(answer_lines),
        sources=sources,
        table=table,
        chart=chart,
        metadata=metadata,
    )


def _build_comparison_answer(
    question: str,
    intent: RapidIntent,
    semantic_sources: list[Source],
    *,
    debug: bool,
) -> RapidAnswer | None:
    if intent.comparison == "none":
        return None

    filters = intent.filters or {}
    where_clauses = ["metric_source in ('budget', 'actual', 'forecast')", *_rapid_period_clauses(intent)]
    text_search = str(filters.get("text_search") or "").strip()
    search_clause = _rapid_text_search_clause(text_search)
    if search_clause:
        where_clauses.append(search_clause)
    where_sql = " and ".join(where_clauses)

    metric_select = (
        "sum(case when metric_source = 'budget' then amount else 0 end) as budget, "
        "sum(case when metric_source = 'forecast' then amount else 0 end) as forecast, "
        "sum(case when metric_source = 'actual' then amount else 0 end) as actual, "
        "sum(case when metric_source = 'actual' then amount else 0 end) "
        "- sum(case when metric_source = 'budget' then amount else 0 end) as variance"
    )
    summary_rows = run_sql(
        "select "
        f"{metric_select}, "
        "count(*) as fact_rows, "
        "count(distinct nullif(group_company, 'Unassigned')) as customer_count, "
        "count(distinct nullif(project_name, 'Unassigned')) as project_count "
        f"from rapid_chat_revenue_facts where {where_sql}"
    )
    summary = summary_rows[0] if summary_rows else {}
    fact_rows = int(summary.get("fact_rows") or 0)
    budget_total = _safe_float(summary.get("budget"))
    forecast_total = _safe_float(summary.get("forecast"))
    actual_total = _safe_float(summary.get("actual"))
    variance_total = _safe_float(summary.get("variance"))
    if fact_rows == 0 or (budget_total == 0 and forecast_total == 0 and actual_total == 0):
        return None

    customer_rows_raw = run_sql(
        "select "
        "group_company as customer, "
        f"{metric_select}, "
        "count(distinct project_name) as projects "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by group_company "
        "having sum(abs(amount)) <> 0 "
        "order by abs(sum(case when metric_source = 'actual' then amount else 0 end) "
        "- sum(case when metric_source = 'budget' then amount else 0 end)) desc nulls last "
        "limit 12"
    )
    owner_rows_raw = run_sql(
        "select "
        "bdm, practice_head, geo_head, "
        f"{metric_select} "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by bdm, practice_head, geo_head "
        "having sum(abs(amount)) <> 0 "
        "order by abs(sum(case when metric_source = 'actual' then amount else 0 end) "
        "- sum(case when metric_source = 'budget' then amount else 0 end)) desc nulls last "
        "limit 8"
    )
    msps_rows_raw = run_sql(
        "select "
        "ms_ps, "
        f"{metric_select}, "
        "count(distinct group_company) as customers "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by ms_ps "
        "having sum(abs(amount)) <> 0 "
        "order by abs(sum(case when metric_source = 'actual' then amount else 0 end) "
        "- sum(case when metric_source = 'budget' then amount else 0 end)) desc nulls last"
    )
    month_rows_raw = run_sql(
        "select "
        "source_month as month, month_index, "
        f"{metric_select} "
        f"from rapid_chat_revenue_facts where {where_sql} "
        "group by source_month, month_index "
        "having sum(abs(amount)) <> 0 "
        "order by month_index asc"
    )

    fy = str(filters.get("fy") or "selected FY")
    month = str(filters.get("month") or "").strip()
    quarter = str(filters.get("quarter") or "").strip().upper()
    timeframe = str(filters.get("timeframe") or "fy").upper()
    if month:
        period_label = month
    elif quarter:
        period_label = quarter
    elif timeframe == "YTD":
        period_label = "YTD"
    elif timeframe == "MTD":
        period_label = "MTD"
    else:
        period_label = "full FY"
    display_scope = " ".join(_text_search_tokens(text_search)).strip().title() if text_search else "Overall RAPID"
    achievement = (actual_total / budget_total * 100.0) if budget_total else 0.0
    variance_direction = (
        "under budget" if variance_total < 0 else "above budget" if variance_total > 0 else "exactly on budget"
    )

    answer_lines = [
        (
            f"**{display_scope} {period_label} budget vs actual for {fy}: "
            f"Budget {_format_money(budget_total)}, Actual {_format_money(actual_total)}, "
            f"Variance {_format_money(variance_total)} ({variance_direction}).**"
        ),
        (
            f"Achievement is {_format_percentage(achievement)} against budget. "
            f"Forecast for the same scope is {_format_money(forecast_total)}."
        ),
        (
            "This is calculated directly from RAPID PostgreSQL facts across budget, actual, and forecast, "
            f"covering {int(summary.get('customer_count') or 0):,} customer group(s), "
            f"{int(summary.get('project_count') or 0):,} project(s), and {fact_rows:,} fact row(s)."
        ),
    ]
    if text_search:
        answer_lines.append(
            f"Search scope matched **{display_scope}** across BDM, Practice Head, Geo Head, customer, project, company, vertical, strategic account, and EEENNN fields."
        )

    customer_rows = [
        {
            "Customer": row.get("customer") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Actual": _format_money(row.get("actual")),
            "Forecast": _format_money(row.get("forecast")),
            "Variance": _format_money(row.get("variance")),
            "Achievement": _format_percentage((_safe_float(row.get("actual")) / _safe_float(row.get("budget")) * 100.0) if _safe_float(row.get("budget")) else 0.0),
            "Projects": int(row.get("projects") or 0),
        }
        for row in customer_rows_raw
    ]
    owner_rows = [
        {
            "BDM": row.get("bdm") or "Unassigned",
            "Practice Head": row.get("practice_head") or "Unassigned",
            "Geo Head": row.get("geo_head") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Actual": _format_money(row.get("actual")),
            "Variance": _format_money(row.get("variance")),
        }
        for row in owner_rows_raw
    ]
    msps_rows = [
        {
            "MS/PS": row.get("ms_ps") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Actual": _format_money(row.get("actual")),
            "Variance": _format_money(row.get("variance")),
            "Customers": int(row.get("customers") or 0),
        }
        for row in msps_rows_raw
    ]
    month_rows = [
        {
            "Month": row.get("month") or "Unassigned",
            "Budget": _format_money(row.get("budget")),
            "Actual": _format_money(row.get("actual")),
            "Variance": _format_money(row.get("variance")),
        }
        for row in month_rows_raw
    ]

    for title, rows in (
        ("Customer drilldown", customer_rows),
        ("Owner drilldown", owner_rows),
        ("MS/PS split", msps_rows),
        ("Month view", month_rows),
    ):
        if rows:
            answer_lines.append("")
            answer_lines.append(f"{title}:")
            answer_lines.append(_build_markdown_table(rows, max_rows=10))
    answer_lines.append("")
    answer_lines.append("Suggested chart: use the returned customer table for a variance bar chart, or ask for a pie chart to reuse this verified table.")

    table = TableData(
        columns=["Customer", "Budget", "Actual", "Forecast", "Variance", "Projects"],
        rows=[
            [
                row.get("customer") or "Unassigned",
                _safe_float(row.get("budget")),
                _safe_float(row.get("actual")),
                _safe_float(row.get("forecast")),
                _safe_float(row.get("variance")),
                int(row.get("projects") or 0),
            ]
            for row in customer_rows_raw
        ],
    )
    chart = ChartData(type="bar", x="Customer", y="Variance")
    sources = [
        *semantic_sources,
        Source(
            document_id="rapid:postgresql",
            document_name="RAPID PostgreSQL",
            page=None,
            chunk_text="Budget, forecast, and actual comparison calculated from rapid_chat_revenue_facts.",
            score=1.0,
        ),
    ]
    metadata: dict[str, Any] = {
        "model": "deterministic-rapid-sql",
        "mode": "rapid_analytics",
        "tool_route": "rapid_analytics",
        "rapid_sql_rows": len(customer_rows_raw),
        "intent": intent.model_dump(),
        "table": table.model_dump(),
        "chart": chart.model_dump(),
        "comparison_summary": {
            "budget": budget_total,
            "actual": actual_total,
            "forecast": forecast_total,
            "variance": variance_total,
            "achievement_percent": achievement,
            "period": period_label,
            "scope": display_scope,
        },
        "comparison_breakdowns": {
            "owner": owner_rows_raw,
            "ms_ps": msps_rows_raw,
            "month": month_rows_raw,
        },
        "sql_generation_source": "deterministic_comparison_tool",
    }
    if debug:
        metadata["sql_used"] = f"select ... from rapid_chat_revenue_facts where {where_sql}"
    return RapidAnswer(
        answer="\n".join(answer_lines),
        sources=sources,
        table=table,
        chart=chart,
        metadata=metadata,
    )


async def _polish_rapid_answer(
    answer: RapidAnswer,
    *,
    question: str,
    intent: RapidIntent,
    client: LLMClient,
    model: str,
    temperature: float,
    max_tokens: int,
) -> RapidAnswer:
    payload = {
        "question": question,
        "intent": intent.model_dump(),
        "verified_answer": answer.answer,
        "table": answer.table.model_dump() if answer.table else None,
        "chart": answer.chart.model_dump() if answer.chart else None,
    }
    fallback = answer.answer
    try:
        explanation = await asyncio.wait_for(
            client.chat_completion(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are NeuralSwitch, a RAPID revenue analytics agent. "
                            "Use only the verified PostgreSQL payload. Keep every amount and table value exact. "
                            "Do not invent missing facts, do not expose SQL, and do not say you lack database access."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "Polish this verified RAPID answer for an executive. "
                            "Lead with the direct answer, keep the customer/vertical detail, and mention that the chart below uses the returned table.\n\n"
                            f"{json.dumps(payload, ensure_ascii=True)}"
                        ),
                    },
                ],
                model=model,
                temperature=min(float(temperature), 0.2),
                max_tokens=max_tokens,
                top_p=1.0,
            ),
            timeout=18,
        )
        polished = str(explanation.get("content") or "").strip()
        polished = apply_guard(polished, "rapid_analytics", fallback)
        if not polished:
            return answer
        metadata = dict(answer.metadata)
        metadata["model"] = str(explanation.get("model") or model)
        metadata["llm_polished"] = True
        return RapidAnswer(
            answer=polished,
            sources=answer.sources,
            table=answer.table,
            chart=answer.chart,
            metadata=metadata,
        )
    except Exception:
        return answer


def _fallback_explanation(question: str, intent: RapidIntent, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "No matching RAPID data was found in PostgreSQL for that question."
    first_row = rows[0]
    numeric_items = [(key, value) for key, value in first_row.items() if isinstance(value, (int, float))]
    if len(rows) == 1 and numeric_items:
        key, value = numeric_items[0]
        return f"{question.strip()} is {value:,.2f}.\n\nKey metric: {key}."
    lead = f"I found {len(rows)} RAPID row group(s) for your question."
    return f"{lead}\n\n{_build_markdown_table(rows)}"


async def answer_question(
    *,
    question: str,
    client: LLMClient,
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 1200,
    chat_context: dict[str, Any] | None = None,
    debug: bool = False,
) -> RapidAnswer:
    chat_context = chat_context or {}
    ensure_rapid_query_view()
    intent = extract_rapid_intent(question, chat_context)
    cache_key = _rapid_answer_cache_key(question, intent, chat_context, debug=debug)
    cached_answer = _get_cached_rapid_answer(cache_key)
    if cached_answer is not None:
        return cached_answer
    semantic_context, semantic_sources = _retrieve_rapid_context(question, intent)
    comparison_answer = _build_comparison_answer(
        question,
        intent,
        semantic_sources,
        debug=debug,
    )
    if comparison_answer is not None:
        polished_answer = await _polish_rapid_answer(
            comparison_answer,
            question=question,
            intent=intent,
            client=client,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return _store_cached_rapid_answer(cache_key, polished_answer)
    deterministic_answer = _build_budget_profile_answer(
        question,
        intent,
        semantic_sources,
        debug=debug,
    )
    if deterministic_answer is not None:
        polished_answer = await _polish_rapid_answer(
            deterministic_answer,
            question=question,
            intent=intent,
            client=client,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return _store_cached_rapid_answer(cache_key, polished_answer)
    actual_profile_answer = _build_actual_profile_answer(
        question,
        intent,
        semantic_sources,
        debug=debug,
    )
    if actual_profile_answer is not None:
        polished_answer = await _polish_rapid_answer(
            actual_profile_answer,
            question=question,
            intent=intent,
            client=client,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return _store_cached_rapid_answer(cache_key, polished_answer)
    sql_result = await generate_sql(
        question=question,
        intent=intent,
        semantic_context=semantic_context,
        history_context=str(chat_context.get("history_context") or "No prior chat context."),
        client=client,
        model=model,
    )
    rows = run_sql(sql_result.sql)
    table = build_table(rows)
    chart = build_chart(rows)
    result_payload = {
        "answer_mode": "rapid_analytics",
        "intent": intent.model_dump(),
        "rowCount": len(rows),
        "rows": rows,
        "table": table.model_dump() if table else None,
        "chart": chart.model_dump() if chart else None,
    }
    fallback = _fallback_explanation(question, intent, rows)
    answer_text = fallback
    explanation_model = model
    if rows:
        try:
            explanation = await client.chat_completion(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a RAPID business analyst. Explain only from the supplied database result and business rules.",
                    },
                    {
                        "role": "user",
                        "content": RAPID_EXPLANATION_PROMPT.format(
                            domain=f"{RAPID_DOMAIN_CONTEXT}\n\nRetrieved RAPID context:\n{semantic_context or 'None'}",
                            question=question,
                            result=json.dumps(result_payload, ensure_ascii=True),
                        ),
                    },
                ],
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=1.0,
            )
            answer_text = str(explanation.get("content") or "").strip() or fallback
            explanation_model = str(explanation.get("model") or model)
        except Exception:
            answer_text = fallback
    answer_text = apply_guard(answer_text, "rapid_analytics", fallback)

    sources = [
        *semantic_sources,
        Source(
            document_id="rapid:postgresql",
            document_name="RAPID PostgreSQL",
            page=None,
            chunk_text=f"Returned {len(rows)} row(s) from rapid_chat_revenue_facts.",
            score=1.0,
        ),
    ]
    metadata: dict[str, Any] = {
        "model": explanation_model,
        "mode": "rapid_analytics",
        "tool_route": "rapid_analytics",
        "rapid_sql_rows": len(rows),
        "intent": intent.model_dump(),
        "table": table.model_dump() if table else None,
        "chart": chart.model_dump() if chart else None,
        "sql_generation_source": sql_result.source,
    }
    if debug:
        metadata["sql_used"] = sql_result.sql
    final_answer = RapidAnswer(
        answer=answer_text,
        sources=sources,
        table=table,
        chart=chart,
        metadata=metadata,
    )
    return _store_cached_rapid_answer(cache_key, final_answer)
