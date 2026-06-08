from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.config import settings
from app.schemas.chat import ChartData, TableData

MONTH_INDEX_SQL = """
    case source_month
        when 'Apr' then 1
        when 'May' then 2
        when 'Jun' then 3
        when 'Jul' then 4
        when 'Aug' then 5
        when 'Sep' then 6
        when 'Oct' then 7
        when 'Nov' then 8
        when 'Dec' then 9
        when 'Jan' then 10
        when 'Feb' then 11
        when 'Mar' then 12
        else 0
    end
""".strip()

QUARTER_SQL = """
    case source_month
        when 'Apr' then 'Q1'
        when 'May' then 'Q1'
        when 'Jun' then 'Q1'
        when 'Jul' then 'Q2'
        when 'Aug' then 'Q2'
        when 'Sep' then 'Q2'
        when 'Oct' then 'Q3'
        when 'Nov' then 'Q3'
        when 'Dec' then 'Q3'
        when 'Jan' then 'Q4'
        when 'Feb' then 'Q4'
        when 'Mar' then 'Q4'
        else ''
    end
""".strip()

MONTH_INDEX_BUDGET_SQL = MONTH_INDEX_SQL.replace("source_month", "b.month")
MONTH_INDEX_ACTUAL_SQL = MONTH_INDEX_SQL.replace("source_month", "a.month")
MONTH_INDEX_FORECAST_SQL = MONTH_INDEX_SQL.replace("source_month", "f.forecast_month")
QUARTER_BUDGET_SQL = QUARTER_SQL.replace("source_month", "b.month")
QUARTER_ACTUAL_SQL = QUARTER_SQL.replace("source_month", "a.month")
QUARTER_FORECAST_SQL = QUARTER_SQL.replace("source_month", "f.forecast_month")

RAPID_FACTS_VIEW_SQL = f"""
create or replace view rapid_chat_revenue_facts as
select
    'budget'::text as metric_source,
    b.fy_year as financial_year,
    b.month as source_month,
    {MONTH_INDEX_BUDGET_SQL} as month_index,
    {QUARTER_BUDGET_SQL} as fiscal_quarter,
    coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.customer_name), ''), 'Unassigned') as customer_name,
    coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''), 'Unassigned') as group_company,
    coalesce(nullif(trim(b.project_name), ''), 'Unassigned') as project_name,
    upper(coalesce(b.ms_ps, '')) as ms_ps,
    coalesce(nullif(trim(b.row_us), ''), 'Unassigned') as region,
    coalesce(nullif(trim(b.practice_head), ''), 'Unassigned') as practice_head,
    coalesce(nullif(trim(b.geo_head), ''), 'Unassigned') as geo_head,
    coalesce(nullif(trim(b.bdm), ''), 'Unassigned') as bdm,
    coalesce(nullif(trim(b.entity), ''), 'Unassigned') as entity,
    coalesce(nullif(trim(b.vertical), ''), 'Unassigned') as vertical,
    coalesce(nullif(trim(b.strategic_account), ''), 'Unassigned') as strategic_account,
    coalesce(nullif(trim(b.eeennn), ''), 'Unassigned') as eeennn,
    coalesce(b.budget_amount, 0)::numeric as amount
from budget_data b

union all

select
    'actual'::text as metric_source,
    a.fy_year as financial_year,
    a.month as source_month,
    {MONTH_INDEX_ACTUAL_SQL} as month_index,
    {QUARTER_ACTUAL_SQL} as fiscal_quarter,
    coalesce(nullif(trim(a.customer_name), ''), 'Unassigned') as customer_name,
    coalesce(nullif(trim(a.group_company), ''), nullif(trim(a.customer_name), ''), 'Unassigned') as group_company,
    coalesce(nullif(trim(a.project_name), ''), 'Unassigned') as project_name,
    upper(coalesce(a.ms_ps, '')) as ms_ps,
    coalesce(nullif(trim(a.region), ''), 'Unassigned') as region,
    coalesce(nullif(trim(a.practice_head), ''), 'Unassigned') as practice_head,
    coalesce(nullif(trim(a.geo_head), ''), 'Unassigned') as geo_head,
    coalesce(nullif(trim(a.bdm), ''), 'Unassigned') as bdm,
    coalesce(nullif(trim(a.company), ''), 'Unassigned') as entity,
    coalesce(nullif(trim(a.vertical), ''), 'Unassigned') as vertical,
    coalesce(nullif(trim(a.strategic_account), ''), 'Unassigned') as strategic_account,
    coalesce(nullif(trim(a.eeennn), ''), 'Unassigned') as eeennn,
    coalesce(a.actual_revenue_value, 0)::numeric as amount
from actual_revenue a
join global_revenue_uploads u
  on u.id = a.uploaded_file_id
 and u.is_active = true
 and u.financial_year = a.fy_year

union all

select
    'forecast'::text as metric_source,
    f.financial_year as financial_year,
    f.forecast_month as source_month,
    {MONTH_INDEX_FORECAST_SQL} as month_index,
    {QUARTER_FORECAST_SQL} as fiscal_quarter,
    coalesce(nullif(trim(r.client_name), ''), nullif(trim(r.customer_name), ''), 'Unassigned') as customer_name,
    coalesce(nullif(trim(r.gr_entity), ''), nullif(trim(r.customer_name), ''), 'Unassigned') as group_company,
    coalesce(nullif(trim(r.project_name), ''), 'Unassigned') as project_name,
    upper(coalesce(r.ms_ps, '')) as ms_ps,
    coalesce(nullif(trim(r.row_us), ''), 'Unassigned') as region,
    coalesce(nullif(trim(r.practice_head), ''), 'Unassigned') as practice_head,
    coalesce(nullif(trim(r.geo_head), ''), 'Unassigned') as geo_head,
    coalesce(nullif(trim(r.bdm), ''), 'Unassigned') as bdm,
    coalesce(nullif(trim(r.entity), ''), 'Unassigned') as entity,
    coalesce(nullif(trim(r.vertical), ''), 'Unassigned') as vertical,
    coalesce(nullif(trim(r.strategic_account), ''), 'Unassigned') as strategic_account,
    coalesce(nullif(trim(r.eeennn), ''), 'Unassigned') as eeennn,
    coalesce(f.forecast_value, 0)::numeric as amount
from rapid_forecast_entries f
join rapid_revenue_records r
  on r.id = f.record_id
join rapid_revenue_uploads u
  on u.id = r.upload_id
 and u.is_active = true
"""


def _normalize_database_url(url: str) -> str:
    normalized = str(url or "").strip()
    if normalized.startswith("postgres://"):
        return f"postgresql+psycopg://{normalized[len('postgres://'):]}"
    if normalized.startswith("postgresql://"):
        return f"postgresql+psycopg://{normalized[len('postgresql://'):]}"
    return normalized


def _resolve_rapid_database_url() -> str:
    database_url = _normalize_database_url(settings.rapid_database_url or settings.database_url)
    if not database_url.startswith("postgresql+psycopg://"):
        raise RuntimeError("RAPID PostgreSQL connection is not configured for Neural Switch.")
    return database_url


@lru_cache(maxsize=1)
def rapid_engine() -> Engine:
    return create_engine(_resolve_rapid_database_url(), pool_pre_ping=True, future=True)


def ensure_rapid_query_view() -> None:
    with rapid_engine().begin() as connection:
        connection.execute(text(RAPID_FACTS_VIEW_SQL))


def _serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def run_sql(sql: str) -> list[dict[str, Any]]:
    with rapid_engine().connect() as connection:
        result = connection.execute(text(sql))
        mappings = result.mappings().all()
    rows: list[dict[str, Any]] = []
    for mapping in mappings:
        rows.append({key: _serialize_value(value) for key, value in dict(mapping).items()})
    return rows


def build_table(rows: list[dict[str, Any]]) -> TableData | None:
    if not rows:
        return None
    columns = list(rows[0].keys())
    return TableData(columns=columns, rows=[[row.get(column) for column in columns] for row in rows])


def build_chart(rows: list[dict[str, Any]]) -> ChartData | None:
    if not rows:
        return None
    columns = list(rows[0].keys())
    if len(columns) < 2:
        return None
    first_key, second_key = columns[0], columns[1]
    first_value = rows[0].get(first_key)
    second_value = rows[0].get(second_key)
    if not isinstance(first_value, str) or not isinstance(second_value, (int, float)):
        return None
    chart_type = "line" if first_key in {"source_month", "month", "fiscal_quarter"} else "bar"
    return ChartData(type=chart_type, x=first_key, y=second_key)
