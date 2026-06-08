from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Literal

from fastapi import HTTPException
from openpyxl import Workbook

from ..postgres import ensure_postgres_schema, open_database_connection
from ..security import RapidPrincipal, sanitize_export_cell

MONTH_SEQUENCE = ("Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar")
MONTH_LOOKUP = {month.lower(): month for month in MONTH_SEQUENCE}
QUARTER_MONTHS = {
    "Q1": ("Apr", "May", "Jun"),
    "Q2": ("Jul", "Aug", "Sep"),
    "Q3": ("Oct", "Nov", "Dec"),
    "Q4": ("Jan", "Feb", "Mar"),
}

_DASHBOARD_BUDGET_TOTAL = (
    "coalesce(d.apr_bgt, 0) + coalesce(d.may_bgt, 0) + coalesce(d.jun_bgt, 0) + "
    "coalesce(d.jul_bgt, 0) + coalesce(d.aug_bgt, 0) + coalesce(d.sep_bgt, 0) + "
    "coalesce(d.oct_bgt, 0) + coalesce(d.nov_bgt, 0) + coalesce(d.dec_bgt, 0) + "
    "coalesce(d.jan_bgt, 0) + coalesce(d.feb_bgt, 0) + coalesce(d.mar_bgt, 0)"
)
_DASHBOARD_FORECAST_TOTAL = (
    "coalesce(d.apr_fct, 0) + coalesce(d.may_fct, 0) + coalesce(d.jun_fct, 0) + "
    "coalesce(d.jul_fct, 0) + coalesce(d.aug_fct, 0) + coalesce(d.sep_fct, 0) + "
    "coalesce(d.oct_fct, 0) + coalesce(d.nov_fct, 0) + coalesce(d.dec_fct, 0) + "
    "coalesce(d.jan_fct, 0) + coalesce(d.feb_fct, 0) + coalesce(d.mar_fct, 0)"
)
_DASHBOARD_ACTUAL_TOTAL = (
    "coalesce(d.apr_act, 0) + coalesce(d.may_act, 0) + coalesce(d.jun_act, 0) + "
    "coalesce(d.jul_act, 0) + coalesce(d.aug_act, 0) + coalesce(d.sep_act, 0) + "
    "coalesce(d.oct_act, 0) + coalesce(d.nov_act, 0) + coalesce(d.dec_act, 0) + "
    "coalesce(d.jan_act, 0) + coalesce(d.feb_act, 0) + coalesce(d.mar_act, 0)"
)
_DASHBOARD_VARIANCE_TOTAL = (
    "coalesce(d.apr_var, 0) + coalesce(d.may_var, 0) + coalesce(d.jun_var, 0) + "
    "coalesce(d.jul_var, 0) + coalesce(d.aug_var, 0) + coalesce(d.sep_var, 0) + "
    "coalesce(d.oct_var, 0) + coalesce(d.nov_var, 0) + coalesce(d.dec_var, 0) + "
    "coalesce(d.jan_var, 0) + coalesce(d.feb_var, 0) + coalesce(d.mar_var, 0)"
)

_DASHBOARD_MONTH_FIELD_MAP = {
    "budget": {
        "Apr": "coalesce(d.apr_bgt, 0)",
        "May": "coalesce(d.may_bgt, 0)",
        "Jun": "coalesce(d.jun_bgt, 0)",
        "Jul": "coalesce(d.jul_bgt, 0)",
        "Aug": "coalesce(d.aug_bgt, 0)",
        "Sep": "coalesce(d.sep_bgt, 0)",
        "Oct": "coalesce(d.oct_bgt, 0)",
        "Nov": "coalesce(d.nov_bgt, 0)",
        "Dec": "coalesce(d.dec_bgt, 0)",
        "Jan": "coalesce(d.jan_bgt, 0)",
        "Feb": "coalesce(d.feb_bgt, 0)",
        "Mar": "coalesce(d.mar_bgt, 0)",
    },
    "forecast": {
        "Apr": "coalesce(d.apr_fct, 0)",
        "May": "coalesce(d.may_fct, 0)",
        "Jun": "coalesce(d.jun_fct, 0)",
        "Jul": "coalesce(d.jul_fct, 0)",
        "Aug": "coalesce(d.aug_fct, 0)",
        "Sep": "coalesce(d.sep_fct, 0)",
        "Oct": "coalesce(d.oct_fct, 0)",
        "Nov": "coalesce(d.nov_fct, 0)",
        "Dec": "coalesce(d.dec_fct, 0)",
        "Jan": "coalesce(d.jan_fct, 0)",
        "Feb": "coalesce(d.feb_fct, 0)",
        "Mar": "coalesce(d.mar_fct, 0)",
    },
    "actual": {
        "Apr": "coalesce(d.apr_act, 0)",
        "May": "coalesce(d.may_act, 0)",
        "Jun": "coalesce(d.jun_act, 0)",
        "Jul": "coalesce(d.jul_act, 0)",
        "Aug": "coalesce(d.aug_act, 0)",
        "Sep": "coalesce(d.sep_act, 0)",
        "Oct": "coalesce(d.oct_act, 0)",
        "Nov": "coalesce(d.nov_act, 0)",
        "Dec": "coalesce(d.dec_act, 0)",
        "Jan": "coalesce(d.jan_act, 0)",
        "Feb": "coalesce(d.feb_act, 0)",
        "Mar": "coalesce(d.mar_act, 0)",
    },
    "variance": {
        "Apr": "coalesce(d.apr_var, 0)",
        "May": "coalesce(d.may_var, 0)",
        "Jun": "coalesce(d.jun_var, 0)",
        "Jul": "coalesce(d.jul_var, 0)",
        "Aug": "coalesce(d.aug_var, 0)",
        "Sep": "coalesce(d.sep_var, 0)",
        "Oct": "coalesce(d.oct_var, 0)",
        "Nov": "coalesce(d.nov_var, 0)",
        "Dec": "coalesce(d.dec_var, 0)",
        "Jan": "coalesce(d.jan_var, 0)",
        "Feb": "coalesce(d.feb_var, 0)",
        "Mar": "coalesce(d.mar_var, 0)",
    },
}

FIELD_ALIASES = {
    "financial_year": "financial_year",
    "fiscal_year": "financial_year",
    "fy_year": "financial_year",
    "year": "year",
    "month": "month",
    "quarter": "quarter",
    "customer_dimension": "customer_dimension",
    "customerdimension": "customer_dimension",
    "customer_name": "customer_name",
    "customer": "customer_name",
    "updated_customer": "customer_name",
    "project_name": "project_name",
    "project": "project_name",
    "emp_id": "emp_id",
    "employee_id": "emp_id",
    "resource_id": "emp_id",
    "resource_name": "resource_name",
    "ocn_number": "ocn_number",
    "ocn": "ocn_number",
    "ms_ps": "ms_ps",
    "ps_ms_budget": "ms_ps",
    "business_type": "ms_ps",
    "region": "region",
    "row_us": "row_us",
    "rowus": "row_us",
    "region_2": "region",
    "sales_region": "sales_region",
    "geo_head": "geo_head",
    "geohead": "geo_head",
    "practice_head": "practice_head",
    "bdm": "bdm",
    "entity": "entity",
    "company": "entity",
    "vertical": "vertical",
    "horizontal": "horizontal",
    "deal_type": "deal_type",
    "revenue_type": "deal_type",
    "type_of_projects": "type_of_projects",
    "service_line": "service_line",
    "sbu": "sbu",
    "sub_sbu": "sub_sbu",
    "dept": "dept",
    "branch": "branch",
    "buh": "buh",
    "strategic_account": "strategic_account",
    "eeennn": "eeennn",
    "group_company": "group_company",
    "delivery_manager": "delivery_manager",
}


@dataclass(frozen=True)
class ColumnSpec:
    key: str
    label: str
    expression: str


@dataclass(frozen=True)
class SourceConfig:
    key: str
    from_sql: str
    base_conditions: tuple[str, ...]
    filter_columns: dict[str, str]
    column_specs: dict[str, ColumnSpec]
    default_column_keys: tuple[str, ...]
    metric_fields: dict[str, str]
    default_metric_field: str
    searchable_columns: tuple[str, ...]
    fiscal_year_column: str | None = None
    month_column: str | None = None
    year_column: str | None = None
    date_column: str | None = None
    default_sort_key: str = "customer_name"


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def _resolve_filter_key(value: str) -> str:
    normalized = _normalize_key(value)
    return FIELD_ALIASES.get(normalized, normalized)


def _resolve_month(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    compact = re.sub(r"[^a-z]", "", text.lower())
    if len(compact) >= 3:
        first = compact[:3]
        resolved = MONTH_LOOKUP.get(first)
        if resolved:
            return resolved
    first_token = text[:3].title()
    return first_token if first_token in MONTH_SEQUENCE else None


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return value


def _clean_string_list(values: Iterable[Any]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        lowered = text.lower()
        if not text or lowered in seen:
            continue
        seen.add(lowered)
        output.append(text)
    return output


def _normalize_row_us_value(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    compact = re.sub(r"[^a-z]", "", text.lower())
    if compact in {"us", "usa", "usn", "usw", "use", "uss", "usc", "unitedstates", "unitedstatesofamerica", "northamerica"}:
        return "USA"
    if compact in {"row", "restofworld", "restoftheworld"}:
        return "ROW"
    return text


def _dashboard_metric_fields(month: str | None = None) -> dict[str, str]:
    metric_fields: dict[str, str] = {
        "budget": _DASHBOARD_BUDGET_TOTAL,
        "forecast": _DASHBOARD_FORECAST_TOTAL,
        "outlook": _DASHBOARD_FORECAST_TOTAL,
        "actual": _DASHBOARD_ACTUAL_TOTAL,
        "revenue": _DASHBOARD_ACTUAL_TOTAL,
        "variance": _DASHBOARD_VARIANCE_TOTAL,
        "variance_pct": (
            f"case when ({_DASHBOARD_BUDGET_TOTAL}) = 0 then 0 else "
            f"(({_DASHBOARD_ACTUAL_TOTAL}) - ({_DASHBOARD_BUDGET_TOTAL})) * 100.0 / ({_DASHBOARD_BUDGET_TOTAL}) end"
        ),
    }
    if not month:
        return metric_fields
    for metric_name in ("budget", "forecast", "actual", "variance"):
        expression = _DASHBOARD_MONTH_FIELD_MAP.get(metric_name, {}).get(month)
        if expression:
            metric_fields[f"{metric_name}_{month.lower()}"] = expression
    return metric_fields


def _build_column_specs(columns: list[tuple[str, str, str]]) -> dict[str, ColumnSpec]:
    output: dict[str, ColumnSpec] = {}
    for key, label, expression in columns:
        output[key] = ColumnSpec(key=key, label=label, expression=expression)
    return output


def _source_configs(month: str | None = None) -> dict[str, SourceConfig]:
    dashboard_metric_fields = _dashboard_metric_fields(month=month)
    kiosk_unified_from_sql = """
        (
            select
                coalesce(b.fy_year, '') as financial_year,
                case lower(left(trim(coalesce(b.month, '')), 3))
                    when 'apr' then 'Apr'
                    when 'may' then 'May'
                    when 'jun' then 'Jun'
                    when 'jul' then 'Jul'
                    when 'aug' then 'Aug'
                    when 'sep' then 'Sep'
                    when 'oct' then 'Oct'
                    when 'nov' then 'Nov'
                    when 'dec' then 'Dec'
                    when 'jan' then 'Jan'
                    when 'feb' then 'Feb'
                    when 'mar' then 'Mar'
                    else left(trim(coalesce(b.month, '')), 3)
                end as month,
                case lower(left(trim(coalesce(b.month, '')), 3))
                    when 'apr' then 'Q1'
                    when 'may' then 'Q1'
                    when 'jun' then 'Q1'
                    when 'jul' then 'Q2'
                    when 'aug' then 'Q2'
                    when 'sep' then 'Q2'
                    when 'oct' then 'Q3'
                    when 'nov' then 'Q3'
                    when 'dec' then 'Q3'
                    when 'jan' then 'Q4'
                    when 'feb' then 'Q4'
                    when 'mar' then 'Q4'
                    else ''
                end as quarter,
                case
                    when coalesce(b.year::text, '') ~ '^[0-9]{4}$' then b.year::int
                    else null::int
                end as year,
                coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.customer_name), ''), '') as customer_name,
                coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''), '') as group_company,
                coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''), '') as customer_dimension,
                coalesce(nullif(trim(b.project_name), ''), '') as project_name,
                coalesce(nullif(trim(b.resource_name), ''), '') as resource_name,
                coalesce(nullif(trim(b.resource_id), ''), '') as emp_id,
                coalesce(nullif(trim(b.ms_ps), ''), '') as ms_ps,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(b.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(b.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(b.row_us, '')), '') is null
                        then ''
                    else 'ROW'
                end as row_us,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(b.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(b.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(b.row_us, '')), '') is null
                        then ''
                    else 'ROW'
                end as region,
                ''::text as sales_region,
                coalesce(nullif(trim(b.geo_head), ''), '') as geo_head,
                coalesce(nullif(trim(b.practice_head), ''), '') as practice_head,
                coalesce(nullif(trim(b.bdm), ''), '') as bdm,
                coalesce(nullif(trim(b.entity), ''), '') as entity,
                coalesce(nullif(trim(b.vertical), ''), '') as vertical,
                coalesce(nullif(trim(b.horizontal), ''), '') as horizontal,
                coalesce(nullif(trim(b.deal_type), ''), '') as deal_type,
                coalesce(nullif(trim(b.strategic_account), ''), '') as strategic_account,
                coalesce(nullif(trim(b.eeennn), ''), '') as eeennn,
                coalesce(nullif(trim(b.type_of_projects), ''), '') as type_of_projects,
                coalesce(nullif(trim(b.ocn_number), ''), '') as ocn_number,
                coalesce(b.budget_amount, 0)::numeric as budget,
                0::numeric as forecast,
                0::numeric as actual,
                (0 - coalesce(b.budget_amount, 0))::numeric as variance
            from budget_data b

            union all

            select
                coalesce(a.fy_year, '') as financial_year,
                case lower(left(trim(coalesce(a.month, '')), 3))
                    when 'apr' then 'Apr'
                    when 'may' then 'May'
                    when 'jun' then 'Jun'
                    when 'jul' then 'Jul'
                    when 'aug' then 'Aug'
                    when 'sep' then 'Sep'
                    when 'oct' then 'Oct'
                    when 'nov' then 'Nov'
                    when 'dec' then 'Dec'
                    when 'jan' then 'Jan'
                    when 'feb' then 'Feb'
                    when 'mar' then 'Mar'
                    else left(trim(coalesce(a.month, '')), 3)
                end as month,
                case lower(left(trim(coalesce(a.month, '')), 3))
                    when 'apr' then 'Q1'
                    when 'may' then 'Q1'
                    when 'jun' then 'Q1'
                    when 'jul' then 'Q2'
                    when 'aug' then 'Q2'
                    when 'sep' then 'Q2'
                    when 'oct' then 'Q3'
                    when 'nov' then 'Q3'
                    when 'dec' then 'Q3'
                    when 'jan' then 'Q4'
                    when 'feb' then 'Q4'
                    when 'mar' then 'Q4'
                    else ''
                end as quarter,
                case
                    when coalesce(a.year::text, '') ~ '^[0-9]{4}$' then a.year::int
                    else null::int
                end as year,
                coalesce(nullif(trim(a.customer_name), ''), '') as customer_name,
                coalesce(nullif(trim(a.customer_name), ''), nullif(trim(a.group_company), ''), '') as group_company,
                coalesce(nullif(trim(a.customer_name), ''), nullif(trim(a.group_company), ''), '') as customer_dimension,
                coalesce(nullif(trim(a.project_name), ''), '') as project_name,
                coalesce(nullif(trim(a.resource_name), ''), '') as resource_name,
                coalesce(nullif(trim(a.emp_id), ''), '') as emp_id,
                coalesce(nullif(trim(a.ms_ps), ''), '') as ms_ps,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), '')), '') is null
                        then ''
                    else 'ROW'
                end as row_us,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(nullif(trim(a.region), ''), nullif(trim(a.region_summary), ''), '')), '') is null
                        then ''
                    else 'ROW'
                end as region,
                coalesce(nullif(trim(a.sales_region), ''), '') as sales_region,
                coalesce(nullif(trim(a.geo_head), ''), '') as geo_head,
                coalesce(nullif(trim(a.practice_head), ''), '') as practice_head,
                coalesce(nullif(trim(a.bdm), ''), '') as bdm,
                coalesce(nullif(trim(a.company), ''), '') as entity,
                coalesce(nullif(trim(a.vertical), ''), '') as vertical,
                coalesce(nullif(trim(a.horizontal), ''), '') as horizontal,
                coalesce(nullif(trim(a.revenue_type), ''), '') as deal_type,
                coalesce(nullif(trim(a.strategic_account), ''), '') as strategic_account,
                coalesce(nullif(trim(a.eeennn), ''), '') as eeennn,
                coalesce(nullif(trim(a.type_of_projects), ''), '') as type_of_projects,
                coalesce(nullif(trim(a.ocn_number), ''), '') as ocn_number,
                0::numeric as budget,
                0::numeric as forecast,
                coalesce(a.actual_revenue_value, 0)::numeric as actual,
                coalesce(a.actual_revenue_value, 0)::numeric as variance
            from actual_revenue a

            union all

            select
                coalesce(r.financial_year, '') as financial_year,
                case lower(left(trim(coalesce(f.forecast_month, '')), 3))
                    when 'apr' then 'Apr'
                    when 'may' then 'May'
                    when 'jun' then 'Jun'
                    when 'jul' then 'Jul'
                    when 'aug' then 'Aug'
                    when 'sep' then 'Sep'
                    when 'oct' then 'Oct'
                    when 'nov' then 'Nov'
                    when 'dec' then 'Dec'
                    when 'jan' then 'Jan'
                    when 'feb' then 'Feb'
                    when 'mar' then 'Mar'
                    else left(trim(coalesce(f.forecast_month, '')), 3)
                end as month,
                case lower(left(trim(coalesce(f.forecast_month, '')), 3))
                    when 'apr' then 'Q1'
                    when 'may' then 'Q1'
                    when 'jun' then 'Q1'
                    when 'jul' then 'Q2'
                    when 'aug' then 'Q2'
                    when 'sep' then 'Q2'
                    when 'oct' then 'Q3'
                    when 'nov' then 'Q3'
                    when 'dec' then 'Q3'
                    when 'jan' then 'Q4'
                    when 'feb' then 'Q4'
                    when 'mar' then 'Q4'
                    else ''
                end as quarter,
                case
                    when substring(coalesce(f.forecast_month, '') from '([0-9]{4})') is not null
                        then substring(coalesce(f.forecast_month, '') from '([0-9]{4})')::int
                    else null::int
                end as year,
                coalesce(nullif(trim(r.customer_name), ''), '') as customer_name,
                coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''), '') as group_company,
                coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''), '') as customer_dimension,
                coalesce(nullif(trim(r.project_name), ''), '') as project_name,
                coalesce(nullif(trim(r.resource_name), ''), '') as resource_name,
                coalesce(nullif(trim(r.resource_id), ''), '') as emp_id,
                coalesce(nullif(trim(r.ms_ps), ''), '') as ms_ps,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(r.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(r.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(r.row_us, '')), '') is null
                        then ''
                    else 'ROW'
                end as row_us,
                case
                    when upper(regexp_replace(coalesce(nullif(trim(r.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('US', 'USA', 'USN', 'USW', 'USE', 'USS', 'USC', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA', 'NORTHAMERICA')
                        then 'USA'
                    when upper(regexp_replace(coalesce(nullif(trim(r.row_us), ''), ''), '[^A-Z]', '', 'g'))
                        in ('ROW', 'RESTOFWORLD', 'RESTOFTHEWORLD')
                        then 'ROW'
                    when nullif(trim(coalesce(r.row_us, '')), '') is null
                        then ''
                    else 'ROW'
                end as region,
                ''::text as sales_region,
                coalesce(nullif(trim(r.geo_head), ''), '') as geo_head,
                coalesce(nullif(trim(r.practice_head), ''), '') as practice_head,
                coalesce(nullif(trim(r.bdm), ''), '') as bdm,
                coalesce(nullif(trim(r.entity), ''), '') as entity,
                coalesce(nullif(trim(r.vertical), ''), '') as vertical,
                coalesce(nullif(trim(r.horizontal), ''), '') as horizontal,
                coalesce(nullif(trim(r.deal_type), ''), '') as deal_type,
                coalesce(nullif(trim(r.strategic_account), ''), '') as strategic_account,
                coalesce(nullif(trim(r.eeennn), ''), '') as eeennn,
                coalesce(nullif(trim(r.type_of_projects), ''), '') as type_of_projects,
                coalesce(nullif(trim(r.ocn_number), ''), '') as ocn_number,
                0::numeric as budget,
                coalesce(f.forecast_value, 0)::numeric as forecast,
                0::numeric as actual,
                0::numeric as variance
            from rapid_forecast_entries f
            join rapid_revenue_records r on r.id = f.record_id
            join rapid_revenue_uploads u on u.id = r.upload_id
            where u.is_active = true
        ) k
    """
    return {
        "actuals": SourceConfig(
            key="actuals",
            from_sql="actual_revenue a",
            base_conditions=(),
            filter_columns={
                "financial_year": "a.fy_year",
                "month": "a.month",
                "year": "a.year",
                "customer_name": "a.customer_name",
                "project_name": "a.project_name",
                "emp_id": "a.emp_id",
                "resource_name": "a.resource_name",
                "ms_ps": "a.ms_ps",
                "region": "a.region",
                "row_us": "a.region",
                "sales_region": "a.sales_region",
                "geo_head": "a.geo_head",
                "practice_head": "a.practice_head",
                "bdm": "a.bdm",
                "entity": "a.company",
                "vertical": "a.vertical",
                "horizontal": "a.horizontal",
                "deal_type": "a.revenue_type",
                "type_of_projects": "a.type_of_projects",
                "service_line": "a.service_line",
                "sbu": "a.sbu",
                "sub_sbu": "a.sub_sbu",
                "dept": "a.dept",
                "branch": "a.branch",
                "buh": "a.buh",
                "strategic_account": "a.strategic_account",
                "eeennn": "a.eeennn",
                "group_company": "a.group_company",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "a.fy_year"),
                    ("month", "Month", "a.month"),
                    ("customer_name", "Customer Name", "a.customer_name"),
                    ("project_name", "Project Name", "a.project_name"),
                    ("emp_id", "Emp ID", "a.emp_id"),
                    ("resource_name", "Resource Name", "a.resource_name"),
                    ("revenue", "Revenue", "coalesce(a.actual_revenue_value, 0)"),
                    ("billed_hours", "Billed Hours", "coalesce(a.billed_hours, 0)"),
                    ("billable_actual_hrs", "Billable Actual Hrs", "coalesce(a.billable_actual_hrs, 0)"),
                    ("actual_hours", "Actual Hours", "coalesce(a.actual_hours, 0)"),
                    ("bdm", "BDM", "a.bdm"),
                    ("geo_head", "Geo Head", "a.geo_head"),
                    ("region", "Region", "a.region"),
                    ("row_us", "ROW/US", "a.region"),
                    ("vertical", "Vertical", "a.vertical"),
                    ("horizontal", "Horizontal", "a.horizontal"),
                    ("practice_head", "Practice Head", "a.practice_head"),
                    ("delivery_manager", "Delivery Manager", "null::text"),
                    ("entity", "Company", "a.company"),
                    ("service_line", "Service Line", "a.service_line"),
                    ("sbu", "SBU", "a.sbu"),
                    ("sub_sbu", "Sub-SBU", "a.sub_sbu"),
                    ("dept", "Dept", "a.dept"),
                    ("type_of_projects", "Type of Projects", "a.type_of_projects"),
                    ("revenue_type", "Revenue Type", "a.revenue_type"),
                    ("ms_ps", "MS/PS", "a.ms_ps"),
                    ("strategic_account", "Strategic Account", "a.strategic_account"),
                    ("eeennn", "EEENNN", "a.eeennn"),
                    ("sales_region", "Sales Region", "a.sales_region"),
                ]
            ),
            default_column_keys=(
                "month",
                "customer_name",
                "project_name",
                "emp_id",
                "resource_name",
                "revenue",
                "bdm",
                "geo_head",
                "region",
                "practice_head",
                "ms_ps",
            ),
            metric_fields={
                "revenue": "coalesce(a.actual_revenue_value, 0)",
                "actual": "coalesce(a.actual_revenue_value, 0)",
                "actual_revenue": "coalesce(a.actual_revenue_value, 0)",
                "actual_revenue_value": "coalesce(a.actual_revenue_value, 0)",
                "invoice_amount": "coalesce(a.invoice_amount, 0)",
                "billed_hours": "coalesce(a.billed_hours, 0)",
                "billable_actual_hrs": "coalesce(a.billable_actual_hrs, 0)",
                "actual_hours": "coalesce(a.actual_hours, 0)",
                "expenses": "coalesce(a.expenses, 0)",
                "portal_fees": "coalesce(a.portal_fees, 0)",
                "tax": "coalesce(a.tax, 0)",
                "margin": "coalesce(a.actual_revenue_value, 0) - coalesce(a.expenses, 0) - coalesce(a.portal_fees, 0) - coalesce(a.tax, 0)",
            },
            default_metric_field="revenue",
            searchable_columns=(
                "a.customer_name",
                "a.project_name",
                "a.resource_name",
                "a.emp_id",
                "a.bdm",
                "a.geo_head",
                "a.practice_head",
                "a.region",
                "a.sales_region",
            ),
            fiscal_year_column="a.fy_year",
            month_column="a.month",
            year_column="a.year",
            date_column="a.invoice_date",
            default_sort_key="revenue",
        ),
        "budget": SourceConfig(
            key="budget",
            from_sql="budget_data b",
            base_conditions=(),
            filter_columns={
                "financial_year": "b.fy_year",
                "month": "b.month",
                "year": "b.year",
                "customer_name": "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.customer_name), ''))",
                "project_name": "b.project_name",
                "emp_id": "b.resource_id",
                "resource_name": "b.resource_name",
                "ocn_number": "b.ocn_number",
                "ms_ps": "b.ms_ps",
                "region": "b.row_us",
                "row_us": "b.row_us",
                "geo_head": "b.geo_head",
                "practice_head": "b.practice_head",
                "bdm": "b.bdm",
                "entity": "b.entity",
                "group_company": "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''))",
                "customer_dimension": "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''))",
                "vertical": "b.vertical",
                "horizontal": "b.horizontal",
                "deal_type": "b.deal_type",
                "type_of_projects": "b.type_of_projects",
                "strategic_account": "b.strategic_account",
                "eeennn": "b.eeennn",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "b.fy_year"),
                    ("month", "Month", "b.month"),
                    ("customer_name", "Customer Name", "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.customer_name), ''), '')"),
                    ("group_company", "Group Company", "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''), '')"),
                    ("customer_dimension", "Customer", "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.gr_entity), ''), nullif(trim(b.customer_name), ''))"),
                    ("project_name", "Project Name", "b.project_name"),
                    ("emp_id", "Emp ID", "b.resource_id"),
                    ("resource_name", "Resource Name", "b.resource_name"),
                    ("ocn_number", "OCN Number", "b.ocn_number"),
                    ("ms_ps", "PS/MS Budget", "b.ms_ps"),
                    ("budget_amount", "Budget", "coalesce(b.budget_amount, 0)"),
                    ("bdm", "BDM", "b.bdm"),
                    ("geo_head", "Geo Head", "b.geo_head"),
                    ("region", "Region", "b.row_us"),
                    ("row_us", "ROW/US", "b.row_us"),
                    ("vertical", "Vertical", "b.vertical"),
                    ("horizontal", "Horizontal", "b.horizontal"),
                    ("practice_head", "Practice Head", "b.practice_head"),
                    ("entity", "Company", "b.entity"),
                    ("deal_type", "Deal Type", "b.deal_type"),
                    ("bill_rate", "Bill Rate", "coalesce(b.bill_rate, 0)"),
                    ("start_date", "Start Date", "b.start_date"),
                    ("end_date", "End Date", "b.end_date"),
                    ("type_of_projects", "Type of Projects", "b.type_of_projects"),
                    ("strategic_account", "Strategic Account", "b.strategic_account"),
                    ("eeennn", "EEENNN", "b.eeennn"),
                ]
            ),
            default_column_keys=(
                "month",
                "customer_name",
                "project_name",
                "ms_ps",
                "budget_amount",
                "bdm",
                "geo_head",
                "region",
            ),
            metric_fields={
                "budget": "coalesce(b.budget_amount, 0)",
                "budget_amount": "coalesce(b.budget_amount, 0)",
                "bill_rate": "coalesce(b.bill_rate, 0)",
                "q1": "coalesce(b.budget_amount, 0)",
                "q2": "coalesce(b.budget_amount, 0)",
                "q3": "coalesce(b.budget_amount, 0)",
                "q4": "coalesce(b.budget_amount, 0)",
                "fy": "coalesce(b.budget_amount, 0)",
            },
            default_metric_field="budget",
            searchable_columns=(
                "coalesce(nullif(trim(b.updated_customer), ''), nullif(trim(b.customer_name), ''))",
                "b.project_name",
                "b.resource_name",
                "b.resource_id",
                "b.ocn_number",
                "b.bdm",
                "b.geo_head",
                "b.practice_head",
                "b.row_us",
            ),
            fiscal_year_column="b.fy_year",
            month_column="b.month",
            year_column="b.year",
            date_column="b.start_date",
            default_sort_key="budget_amount",
        ),
        "forecast": SourceConfig(
            key="forecast",
            from_sql=(
                "rapid_forecast_entries f "
                "join rapid_revenue_records r on r.id = f.record_id "
                "join rapid_revenue_uploads u on u.id = r.upload_id"
            ),
            base_conditions=("u.is_active = true",),
            filter_columns={
                "financial_year": "r.financial_year",
                "customer_name": "r.customer_name",
                "project_name": "r.project_name",
                "emp_id": "r.resource_id",
                "resource_name": "r.resource_name",
                "ocn_number": "r.ocn_number",
                "ms_ps": "r.ms_ps",
                "region": "r.row_us",
                "row_us": "r.row_us",
                "geo_head": "r.geo_head",
                "practice_head": "r.practice_head",
                "bdm": "r.bdm",
                "entity": "r.entity",
                "group_company": "coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''))",
                "customer_dimension": "coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''))",
                "vertical": "r.vertical",
                "horizontal": "r.horizontal",
                "deal_type": "r.deal_type",
                "type_of_projects": "r.type_of_projects",
                "strategic_account": "r.strategic_account",
                "eeennn": "r.eeennn",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "r.financial_year"),
                    ("forecast_month", "Forecast Month", "f.forecast_month"),
                    ("customer_name", "Customer Name", "r.customer_name"),
                    ("group_company", "Group Company", "coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''), '')"),
                    ("customer_dimension", "Customer", "coalesce(nullif(trim(r.customer_name), ''), nullif(trim(r.gr_entity), ''))"),
                    ("project_name", "Project Name", "r.project_name"),
                    ("emp_id", "Emp ID", "r.resource_id"),
                    ("resource_name", "Resource Name", "r.resource_name"),
                    ("ocn_number", "OCN Number", "r.ocn_number"),
                    ("ms_ps", "MS/PS", "r.ms_ps"),
                    ("budget_value", "Budget", "coalesce(f.budget_value, 0)"),
                    ("forecast_value", "Forecast", "coalesce(f.forecast_value, 0)"),
                    (
                        "variance",
                        "Variance",
                        "coalesce(f.forecast_value, 0) - coalesce(f.budget_value, 0)",
                    ),
                    ("billed_hours", "Billed Hours", "coalesce(f.billed_hours, 0)"),
                    ("billable_actual_hrs", "Billable Actual Hrs", "coalesce(f.billable_actual_hrs, 0)"),
                    ("bdm", "BDM", "r.bdm"),
                    ("geo_head", "Geo Head", "r.geo_head"),
                    ("practice_head", "Practice Head", "r.practice_head"),
                    ("region", "ROW/US", "r.row_us"),
                    ("entity", "Entity", "r.entity"),
                    ("vertical", "Vertical", "r.vertical"),
                    ("horizontal", "Horizontal", "r.horizontal"),
                ]
            ),
            default_column_keys=(
                "forecast_month",
                "customer_name",
                "project_name",
                "ms_ps",
                "budget_value",
                "forecast_value",
                "variance",
                "bdm",
            ),
            metric_fields={
                "forecast": "coalesce(f.forecast_value, 0)",
                "forecast_value": "coalesce(f.forecast_value, 0)",
                "budget": "coalesce(f.budget_value, 0)",
                "budget_value": "coalesce(f.budget_value, 0)",
                "variance": "coalesce(f.forecast_value, 0) - coalesce(f.budget_value, 0)",
                "billed_hours": "coalesce(f.billed_hours, 0)",
                "billable_actual_hrs": "coalesce(f.billable_actual_hrs, 0)",
            },
            default_metric_field="forecast",
            searchable_columns=(
                "r.customer_name",
                "r.project_name",
                "r.resource_name",
                "r.resource_id",
                "r.ocn_number",
                "r.bdm",
                "f.forecast_month",
            ),
            fiscal_year_column="r.financial_year",
            month_column=None,
            date_column=None,
            default_sort_key="forecast_value",
        ),
        "combined": SourceConfig(
            key="combined",
            from_sql="trend_summary t",
            base_conditions=(),
            filter_columns={
                "financial_year": "t.fy_year",
                "month": "t.month",
                "quarter": "t.quarter",
                "year": "t.year",
                "customer_name": "t.customer_name",
                "project_name": "t.project_name",
                "ms_ps": "t.ms_ps",
                "region": "t.region",
                "row_us": "t.region",
                "sales_region": "t.sales_region",
                "geo_head": "t.geo_head",
                "practice_head": "t.practice_head",
                "bdm": "t.bdm",
                "vertical": "t.vertical",
                "horizontal": "t.horizontal",
                "strategic_account": "t.strategic_account",
                "entity": "t.entity",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "t.fy_year"),
                    ("month", "Month", "t.month"),
                    ("quarter", "Quarter", "t.quarter"),
                    ("customer_name", "Customer Name", "t.customer_name"),
                    ("project_name", "Project Name", "t.project_name"),
                    ("ms_ps", "MS/PS", "t.ms_ps"),
                    ("region", "Region", "t.region"),
                    ("sales_region", "Sales Region", "t.sales_region"),
                    ("bdm", "BDM", "t.bdm"),
                    ("geo_head", "Geo Head", "t.geo_head"),
                    ("practice_head", "Practice Head", "t.practice_head"),
                    ("vertical", "Vertical", "t.vertical"),
                    ("horizontal", "Horizontal", "t.horizontal"),
                    ("entity", "Entity", "t.entity"),
                    ("budget", "Budget", "coalesce(t.budget_amount, 0)"),
                    ("actual", "Actual", "coalesce(t.actual_revenue, 0)"),
                    ("forecast", "Forecast", "coalesce(t.predicted_revenue, 0)"),
                    ("variance", "Variance", "coalesce(t.budget_variance, 0)"),
                    ("variance_percent", "Variance %", "coalesce(t.budget_variance_percent, 0)"),
                    ("achievement_percent", "Achievement %", "coalesce(t.budget_achievement_percent, 0)"),
                ]
            ),
            default_column_keys=(
                "month",
                "customer_name",
                "project_name",
                "ms_ps",
                "region",
                "budget",
                "actual",
                "forecast",
                "variance",
            ),
            metric_fields={
                "budget": "coalesce(t.budget_amount, 0)",
                "actual": "coalesce(t.actual_revenue, 0)",
                "revenue": "coalesce(t.actual_revenue, 0)",
                "forecast": "coalesce(t.predicted_revenue, 0)",
                "predicted_revenue": "coalesce(t.predicted_revenue, 0)",
                "variance": "coalesce(t.budget_variance, 0)",
                "variance_percent": "coalesce(t.budget_variance_percent, 0)",
                "achievement_percent": "coalesce(t.budget_achievement_percent, 0)",
            },
            default_metric_field="actual",
            searchable_columns=(
                "t.customer_name",
                "t.project_name",
                "t.bdm",
                "t.practice_head",
                "t.geo_head",
                "t.vertical",
                "t.horizontal",
                "t.entity",
                "t.region",
                "t.sales_region",
            ),
            fiscal_year_column="t.fy_year",
            month_column="t.month",
            year_column="t.year",
            default_sort_key="actual",
        ),
        "kiosk_unified": SourceConfig(
            key="kiosk_unified",
            from_sql=kiosk_unified_from_sql,
            base_conditions=(),
            filter_columns={
                "financial_year": "k.financial_year",
                "month": "k.month",
                "quarter": "k.quarter",
                "year": "k.year",
                "customer_dimension": "k.customer_dimension",
                "group_company": "k.group_company",
                "customer_name": "k.customer_name",
                "project_name": "k.project_name",
                "resource_name": "k.resource_name",
                "emp_id": "k.emp_id",
                "ms_ps": "k.ms_ps",
                "region": "k.region",
                "row_us": "k.row_us",
                "sales_region": "k.sales_region",
                "geo_head": "k.geo_head",
                "practice_head": "k.practice_head",
                "bdm": "k.bdm",
                "vertical": "k.vertical",
                "horizontal": "k.horizontal",
                "strategic_account": "k.strategic_account",
                "deal_type": "k.deal_type",
                "eeennn": "k.eeennn",
                "type_of_projects": "k.type_of_projects",
                "ocn_number": "k.ocn_number",
                "entity": "k.entity",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "k.financial_year"),
                    ("month", "Month", "k.month"),
                    ("quarter", "Quarter", "k.quarter"),
                    ("customer_dimension", "Customer", "k.customer_dimension"),
                    ("group_company", "Group Company", "k.group_company"),
                    ("customer_name", "Customer Name", "k.customer_name"),
                    ("project_name", "Project Name", "k.project_name"),
                    ("resource_name", "Resource Name", "k.resource_name"),
                    ("emp_id", "Emp ID", "k.emp_id"),
                    ("ms_ps", "MS/PS", "k.ms_ps"),
                    ("region", "ROW/US", "k.region"),
                    ("row_us", "ROW/US Bucket", "k.row_us"),
                    ("sales_region", "Sales Region", "k.sales_region"),
                    ("bdm", "BDM", "k.bdm"),
                    ("geo_head", "Geo Head", "k.geo_head"),
                    ("practice_head", "Practice Head", "k.practice_head"),
                    ("vertical", "Vertical", "k.vertical"),
                    ("horizontal", "Horizontal", "k.horizontal"),
                    ("deal_type", "Deal Type", "k.deal_type"),
                    ("strategic_account", "Strategic Account", "k.strategic_account"),
                    ("eeennn", "EEENNN", "k.eeennn"),
                    ("type_of_projects", "Type of Projects", "k.type_of_projects"),
                    ("ocn_number", "OCN Number", "k.ocn_number"),
                    ("entity", "Entity", "k.entity"),
                    ("budget", "Budget (Plan)", "coalesce(k.budget, 0)"),
                    ("forecast", "Forecast (Projected)", "coalesce(k.forecast, 0)"),
                    ("actual", "YTD Revenue$", "coalesce(k.actual, 0)"),
                    ("variance", "Variance (Actuals - Budget)", "coalesce(k.variance, 0)"),
                ]
            ),
            default_column_keys=(
                "month",
                "customer_dimension",
                "group_company",
                "customer_name",
                "project_name",
                "ms_ps",
                "region",
                "budget",
                "forecast",
                "actual",
                "variance",
            ),
            metric_fields={
                "budget": "coalesce(k.budget, 0)",
                "actual": "coalesce(k.actual, 0)",
                "revenue": "coalesce(k.actual, 0)",
                "forecast": "coalesce(k.forecast, 0)",
                "predicted_revenue": "coalesce(k.forecast, 0)",
                "variance": "coalesce(k.variance, 0)",
            },
            default_metric_field="actual",
            searchable_columns=(
                "k.customer_dimension",
                "k.group_company",
                "k.customer_name",
                "k.project_name",
                "k.resource_name",
                "k.emp_id",
                "k.bdm",
                "k.practice_head",
                "k.geo_head",
                "k.vertical",
                "k.horizontal",
                "k.entity",
                "k.region",
                "k.sales_region",
            ),
            fiscal_year_column="k.financial_year",
            month_column="k.month",
            year_column="k.year",
            default_sort_key="actual",
        ),
        "variance": SourceConfig(
            key="variance",
            from_sql="trend_summary t",
            base_conditions=(),
            filter_columns={
                "financial_year": "t.fy_year",
                "month": "t.month",
                "quarter": "t.quarter",
                "year": "t.year",
                "customer_name": "t.customer_name",
                "project_name": "t.project_name",
                "ms_ps": "t.ms_ps",
                "region": "t.region",
                "row_us": "t.region",
                "sales_region": "t.sales_region",
                "geo_head": "t.geo_head",
                "practice_head": "t.practice_head",
                "bdm": "t.bdm",
                "vertical": "t.vertical",
                "horizontal": "t.horizontal",
                "strategic_account": "t.strategic_account",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "t.fy_year"),
                    ("month", "Month", "t.month"),
                    ("quarter", "Quarter", "t.quarter"),
                    ("customer_name", "Customer Name", "t.customer_name"),
                    ("project_name", "Project Name", "t.project_name"),
                    ("ms_ps", "MS/PS", "t.ms_ps"),
                    ("region", "Region", "t.region"),
                    ("bdm", "BDM", "t.bdm"),
                    ("geo_head", "Geo Head", "t.geo_head"),
                    ("practice_head", "Practice Head", "t.practice_head"),
                    ("vertical", "Vertical", "t.vertical"),
                    ("horizontal", "Horizontal", "t.horizontal"),
                    ("budget", "Budget", "coalesce(t.budget_amount, 0)"),
                    ("actual", "Actual", "coalesce(t.actual_revenue, 0)"),
                    ("forecast", "Forecast", "coalesce(t.predicted_revenue, 0)"),
                    ("variance", "Variance", "coalesce(t.budget_variance, 0)"),
                    ("variance_percent", "Variance %", "coalesce(t.budget_variance_percent, 0)"),
                ]
            ),
            default_column_keys=(
                "month",
                "customer_name",
                "project_name",
                "ms_ps",
                "region",
                "budget",
                "actual",
                "variance",
                "variance_percent",
            ),
            metric_fields={
                "variance": "coalesce(t.budget_variance, 0)",
                "variance_percent": "coalesce(t.budget_variance_percent, 0)",
                "actual": "coalesce(t.actual_revenue, 0)",
                "budget": "coalesce(t.budget_amount, 0)",
                "forecast": "coalesce(t.predicted_revenue, 0)",
            },
            default_metric_field="variance",
            searchable_columns=(
                "t.customer_name",
                "t.project_name",
                "t.bdm",
                "t.practice_head",
                "t.geo_head",
                "t.vertical",
                "t.horizontal",
                "t.region",
            ),
            fiscal_year_column="t.fy_year",
            month_column="t.month",
            year_column="t.year",
            default_sort_key="variance",
        ),
        "dashboard": SourceConfig(
            key="dashboard",
            from_sql="financial_records d join financial_workbook_uploads u on u.id = d.upload_id",
            base_conditions=("u.is_active = true",),
            filter_columns={
                "financial_year": "d.financial_year",
                "customer_name": "d.customer_name",
                "project_name": "d.project_name",
                "emp_id": "d.resource_id",
                "resource_name": "d.resource_name",
                "ms_ps": "d.ms_ps",
                "region": "d.region",
                "geo_head": "d.geo_head",
                "practice_head": "d.practice_head",
                "bdm": "d.bdm",
                "deal_type": "d.deal_type",
                "type_of_projects": "d.business_type",
                "row_us": "d.region",
            },
            column_specs=_build_column_specs(
                [
                    ("financial_year", "Financial Year", "d.financial_year"),
                    ("customer_name", "Customer Name", "d.customer_name"),
                    ("project_name", "Project Name", "d.project_name"),
                    ("emp_id", "Emp ID", "d.resource_id"),
                    ("resource_name", "Resource Name", "d.resource_name"),
                    ("ms_ps", "MS/PS", "d.ms_ps"),
                    ("region", "Region", "d.region"),
                    ("practice_head", "Practice Head", "d.practice_head"),
                    ("geo_head", "Geo Head", "d.geo_head"),
                    ("bdm", "BDM", "d.bdm"),
                    ("deal_type", "Deal Type", "d.deal_type"),
                    ("budget", "Budget", _DASHBOARD_BUDGET_TOTAL),
                    ("forecast", "Forecast", _DASHBOARD_FORECAST_TOTAL),
                    ("actual", "Actual", _DASHBOARD_ACTUAL_TOTAL),
                    ("variance", "Variance", _DASHBOARD_VARIANCE_TOTAL),
                    (
                        "variance_percent",
                        "Variance %",
                        f"case when ({_DASHBOARD_BUDGET_TOTAL}) = 0 then 0 else "
                        f"(({_DASHBOARD_ACTUAL_TOTAL}) - ({_DASHBOARD_BUDGET_TOTAL})) * 100.0 / ({_DASHBOARD_BUDGET_TOTAL}) end",
                    ),
                    ("start_date", "Start Date", "d.start_date"),
                    ("end_date", "End Date", "d.end_date"),
                ]
            ),
            default_column_keys=(
                "customer_name",
                "project_name",
                "emp_id",
                "resource_name",
                "region",
                "practice_head",
                "bdm",
                "budget",
                "forecast",
                "actual",
                "variance",
            ),
            metric_fields=dashboard_metric_fields,
            default_metric_field="actual",
            searchable_columns=(
                "d.customer_name",
                "d.project_name",
                "d.resource_name",
                "d.resource_id",
                "d.region",
                "d.practice_head",
                "d.geo_head",
                "d.bdm",
            ),
            fiscal_year_column="d.financial_year",
            default_sort_key="actual",
        ),
    }


def apply_metric_selection(
    context: dict[str, Any],
    config: SourceConfig,
) -> tuple[str, str]:
    aggregation = context.get("aggregation") if isinstance(context.get("aggregation"), dict) else {}
    metric_hint = _resolve_filter_key(str(aggregation.get("field") or context.get("metric") or ""))
    expression = config.metric_fields.get(metric_hint) or config.metric_fields.get(config.default_metric_field)
    if not expression:
        raise HTTPException(status_code=400, detail="Metric is not supported for this source.")
    return metric_hint or config.default_metric_field, expression


def apply_filters(
    *,
    context: dict[str, Any],
    config: SourceConfig,
    where_clauses: list[str],
    params: list[Any],
) -> dict[str, Any]:
    filters = context.get("filters", {}) if isinstance(context.get("filters"), dict) else {}
    normalized_filters: dict[str, list[Any]] = {}

    for raw_key, raw_value in filters.items():
        canonical_key = _resolve_filter_key(str(raw_key))
        values = raw_value if isinstance(raw_value, list) else [raw_value]
        cleaned = [value for value in values if str(value or "").strip()]
        if canonical_key == "row_us":
            cleaned = [
                normalized_value
                for normalized_value in (_normalize_row_us_value(value) for value in cleaned)
                if normalized_value
            ]
        if not cleaned:
            continue
        if canonical_key in {"month", "quarter"}:
            normalized_filters.setdefault(canonical_key, []).extend(cleaned)
            continue
        if canonical_key not in config.filter_columns and canonical_key not in {"financial_year", "year"}:
            continue
        normalized_filters.setdefault(canonical_key, []).extend(cleaned)

    fiscal_year = str(context.get("fiscal_year") or "").strip()
    if fiscal_year:
        normalized_filters.setdefault("financial_year", []).append(fiscal_year)

    months_from_context: list[str] = []
    if context.get("month"):
        resolved_month = _resolve_month(context["month"])
        if resolved_month:
            months_from_context.append(resolved_month)
    for value in normalized_filters.get("month", []):
        resolved = _resolve_month(value)
        if resolved:
            months_from_context.append(resolved)
    for value in normalized_filters.get("quarter", []):
        quarter = str(value or "").strip().upper()
        months_from_context.extend(list(QUARTER_MONTHS.get(quarter, ())))
    if months_from_context:
        normalized_filters["month"] = _clean_string_list(months_from_context)

    if config.fiscal_year_column and normalized_filters.get("financial_year"):
        fy_values = _clean_string_list(normalized_filters["financial_year"])
        if fy_values:
            if len(fy_values) == 1:
                where_clauses.append(f"lower(coalesce({config.fiscal_year_column}::text, '')) = %s")
                params.append(fy_values[0].lower())
            else:
                where_clauses.append(f"lower(coalesce({config.fiscal_year_column}::text, '')) = any(%s)")
                params.append([value.lower() for value in fy_values])

    if config.month_column and normalized_filters.get("month"):
        month_values = _clean_string_list(normalized_filters["month"])
        if month_values:
            if len(month_values) == 1:
                where_clauses.append(f"lower(coalesce({config.month_column}::text, '')) = %s")
                params.append(month_values[0].lower())
            else:
                where_clauses.append(f"lower(coalesce({config.month_column}::text, '')) = any(%s)")
                params.append([value.lower() for value in month_values])
    elif config.key == "forecast" and normalized_filters.get("month"):
        month_values = _clean_string_list(normalized_filters["month"])
        if month_values:
            if len(month_values) == 1:
                where_clauses.append("lower(coalesce(f.forecast_month::text, '')) like %s")
                params.append(f"{month_values[0].lower()}%")
            else:
                month_predicates: list[str] = []
                for month_value in month_values:
                    month_predicates.append("lower(coalesce(f.forecast_month::text, '')) like %s")
                    params.append(f"{month_value.lower()}%")
                where_clauses.append(f"({' or '.join(month_predicates)})")

    if config.year_column and normalized_filters.get("year"):
        year_values: list[int] = []
        for value in normalized_filters["year"]:
            try:
                year_values.append(int(str(value).strip()))
            except ValueError:
                continue
        year_values = list(dict.fromkeys(year_values))
        if year_values:
            if len(year_values) == 1:
                where_clauses.append(f"{config.year_column} = %s")
                params.append(year_values[0])
            else:
                where_clauses.append(f"{config.year_column} = any(%s)")
                params.append(year_values)

    for filter_key, filter_values in normalized_filters.items():
        if filter_key in {"financial_year", "month", "quarter", "year"}:
            continue
        column_expression = config.filter_columns.get(filter_key)
        if not column_expression:
            continue
        values = _clean_string_list(filter_values)
        if not values:
            continue
        if len(values) == 1:
            where_clauses.append(f"lower(coalesce({column_expression}::text, '')) = %s")
            params.append(values[0].lower())
        else:
            where_clauses.append(f"lower(coalesce({column_expression}::text, '')) = any(%s)")
            params.append([value.lower() for value in values])

    if config.date_column and isinstance(context.get("date_range"), dict):
        start = str(context["date_range"].get("start") or "").strip()
        end = str(context["date_range"].get("end") or "").strip()
        if start:
            where_clauses.append(f"{config.date_column} >= %s::date")
            params.append(start)
        if end:
            where_clauses.append(f"{config.date_column} <= %s::date")
            params.append(end)

    search_value = str(context.get("search") or "").strip()
    if search_value and config.searchable_columns:
        search_predicates: list[str] = []
        for column in config.searchable_columns:
            search_predicates.append(f"coalesce({column}::text, '') ilike %s")
            params.append(f"%{search_value}%")
        where_clauses.append(f"({' or '.join(search_predicates)})")

    return normalized_filters


def apply_rbac_filters(
    *,
    principal: RapidPrincipal | None,
    config: SourceConfig,
    normalized_filters: dict[str, list[Any]],
    where_clauses: list[str],
    params: list[Any],
) -> None:
    if principal is None or principal.is_admin:
        return

    scope_mapping = (
        ("bdm", principal.scope.get("bdms", ())),
        ("practice_head", principal.scope.get("practiceHeads", ())),
        ("geo_head", principal.scope.get("geoHeads", ())),
        ("entity", principal.scope.get("entities", ())),
        ("vertical", principal.scope.get("verticals", ())),
    )

    for filter_key, allowed_values in scope_mapping:
        allowed = _clean_string_list(allowed_values)
        column_expression = config.filter_columns.get(filter_key)
        if not allowed or not column_expression:
            continue

        requested_raw = normalized_filters.get(filter_key, [])
        requested = _clean_string_list(requested_raw)
        if requested:
            allowed_lookup = {value.lower(): value for value in allowed}
            intersected = [
                allowed_lookup[value.lower()]
                for value in requested
                if value.lower() in allowed_lookup
            ]
            scoped_values = _clean_string_list(intersected)
        else:
            scoped_values = allowed

        if not scoped_values:
            where_clauses.append("1 = 0")
            continue
        if len(scoped_values) == 1:
            where_clauses.append(f"lower(coalesce({column_expression}::text, '')) = %s")
            params.append(scoped_values[0].lower())
        else:
            where_clauses.append(f"lower(coalesce({column_expression}::text, '')) = any(%s)")
            params.append([value.lower() for value in scoped_values])


def build_drilldown_query(
    *,
    context: dict[str, Any],
    config: SourceConfig,
    metric_expression: str,
    selected_columns: list[ColumnSpec],
    where_clauses: list[str],
    sort_key: str,
    sort_dir: Literal["asc", "desc"],
) -> tuple[str, str]:
    metric_request = str(context.get("metric") or "").strip().lower()
    metric_scope_requested = bool(context.get("strict_metric_scope"))
    apply_metric_scope_filter = (
        config.key == "kiosk_unified"
        and metric_scope_requested
        and metric_request in {"budget", "forecast", "actual", "variance", "value", "metric"}
    )
    base_where_sql = f"where {' and '.join(where_clauses)}" if where_clauses else ""
    metric_filtered_where_clauses = list(where_clauses)
    if apply_metric_scope_filter:
        metric_filtered_where_clauses.append(f"coalesce(({metric_expression}), 0) <> 0")
    metric_filtered_where_sql = (
        f"where {' and '.join(metric_filtered_where_clauses)}" if metric_filtered_where_clauses else ""
    )
    metric_column_keys = {"budget", "forecast", "actual", "variance"}
    should_aggregate_metrics = (
        config.key == "kiosk_unified"
        and any(column.key in metric_column_keys for column in selected_columns)
    )

    if should_aggregate_metrics:
        non_metric_columns = [
            column for column in selected_columns if column.key not in metric_column_keys
        ]
        selected_metric_columns = [
            column for column in selected_columns if column.key in metric_column_keys
        ]
        preferred_group_keys = {
            "financial_year",
            "month",
            "quarter",
            "year",
            "customer_dimension",
            "customer_name",
            "group_company",
            "project_name",
            "entity",
            "vertical",
        }
        group_by_columns = [
            column for column in non_metric_columns if column.key in preferred_group_keys
        ]
        passthrough_columns = [
            column for column in non_metric_columns if column.key not in preferred_group_keys
        ]
        grouped_select_parts = [
            f"{column.expression} as {column.key}" for column in group_by_columns
        ]
        grouped_select_parts.extend(
            [
                (
                    "coalesce(max(nullif(trim(coalesce(("
                    f"{column.expression}"
                    ")::text, '')), '')), '') as "
                    f"{column.key}"
                )
                for column in passthrough_columns
            ]
        )
        grouped_select_parts.extend(
            [
                f"coalesce(sum({column.expression}), 0)::numeric as {column.key}"
                for column in selected_metric_columns
            ]
        )
        grouped_select_parts.append(
            f"coalesce(sum({metric_expression}), 0)::numeric as __metric_value"
        )
        group_by_sql = (
            f"group by {', '.join(column.expression for column in group_by_columns)}"
            if group_by_columns
            else ""
        )
        having_sql = (
            f"having coalesce(sum({metric_expression}), 0) <> 0"
            if apply_metric_scope_filter
            else ""
        )
        fallback_sort_expr = group_by_columns[0].key if group_by_columns else "__metric_value"
        sort_expr = "__metric_value" if sort_key == "__metric_value" else sort_key
        order_sql = f"order by {sort_expr} {sort_dir}, {fallback_sort_expr} asc"
        details_sql = (
            f"select {', '.join(grouped_select_parts)} "
            f"from {config.from_sql} "
            f"{base_where_sql} "
            f"{group_by_sql} "
            f"{having_sql} "
            f"{order_sql} "
            f"limit %s offset %s"
        )
    else:
        select_sql = ", ".join(
            [f"{column.expression} as {column.key}" for column in selected_columns]
            + [f"{metric_expression} as __metric_value"]
        )
        default_order_column = config.column_specs.get(config.default_sort_key)
        fallback_sort_expr = default_order_column.expression if default_order_column else "1"
        sort_expr = "__metric_value" if sort_key == "__metric_value" else sort_key
        order_sql = f"order by {sort_expr} {sort_dir}, {fallback_sort_expr} asc"
        details_where_sql = metric_filtered_where_sql if apply_metric_scope_filter else base_where_sql
        details_sql = (
            f"select {select_sql} "
            f"from {config.from_sql} "
            f"{details_where_sql} "
            f"{order_sql} "
            f"limit %s offset %s"
        )

    aggregation = context.get("aggregation") if isinstance(context.get("aggregation"), dict) else {}
    aggregation_type = str(aggregation.get("type") or "sum").strip().lower()
    if aggregation_type == "count":
        agg_sql = "count(*)::numeric"
    elif aggregation_type == "avg":
        agg_sql = "coalesce(avg(metric_value), 0)::numeric"
    elif aggregation_type == "min":
        agg_sql = "coalesce(min(metric_value), 0)::numeric"
    elif aggregation_type == "max":
        agg_sql = "coalesce(max(metric_value), 0)::numeric"
    else:
        agg_sql = "coalesce(sum(metric_value), 0)::numeric"

    if should_aggregate_metrics:
        summary_group_by_sql = (
            f"group by {', '.join(column.expression for column in group_by_columns)}"
            if group_by_columns
            else ""
        )
        summary_having_sql = (
            f"having coalesce(sum({metric_expression}), 0) <> 0"
            if apply_metric_scope_filter
            else ""
        )
        summary_sql = (
            "select count(*) as total_rows, "
            f"{agg_sql} as total_value "
            "from ("
            f"select coalesce(sum({metric_expression}), 0)::numeric as metric_value "
            f"from {config.from_sql} "
            f"{base_where_sql} "
            f"{summary_group_by_sql} "
            f"{summary_having_sql}"
            ") scope"
        )
    else:
        summary_where_sql = metric_filtered_where_sql if apply_metric_scope_filter else base_where_sql
        summary_sql = (
            "select count(*) as total_rows, "
            f"{agg_sql} as total_value "
            "from ("
            f"select {metric_expression} as metric_value "
            f"from {config.from_sql} "
            f"{summary_where_sql}"
            ") scope"
        )
    return details_sql, summary_sql


def validate_drilldown_context(context: dict[str, Any], principal: RapidPrincipal | None) -> dict[str, Any]:
    source = str(context.get("source") or "").strip().lower()
    if not source:
        raise HTTPException(status_code=400, detail="source is required.")
    if source not in {"actuals", "budget", "forecast", "variance", "combined", "kiosk_unified", "dashboard"}:
        raise HTTPException(status_code=400, detail="Unsupported drilldown source.")

    normalized = dict(context)
    normalized["source"] = source
    normalized["metric"] = str(normalized.get("metric") or "value").strip() or "value"
    normalized["filters"] = normalized.get("filters") if isinstance(normalized.get("filters"), dict) else {}
    normalized["columns"] = normalized.get("columns") if isinstance(normalized.get("columns"), list) else []
    normalized["page"] = max(int(normalized.get("page") or 1), 1)
    normalized["page_size"] = min(max(int(normalized.get("page_size") or 100), 1), 1000)
    normalized["sort_dir"] = (
        "asc"
        if str(normalized.get("sort_dir") or "").strip().lower() == "asc"
        else "desc"
    )
    normalized["sort_by"] = str(normalized.get("sort_by") or "").strip()
    normalized["search"] = str(normalized.get("search") or "").strip()
    normalized["display_title"] = str(normalized.get("display_title") or "").strip()
    normalized["fiscal_year"] = str(normalized.get("fiscal_year") or "").strip()
    normalized["strict_metric_scope"] = bool(normalized.get("strict_metric_scope") or False)
    normalized["aggregation"] = (
        normalized.get("aggregation")
        if isinstance(normalized.get("aggregation"), dict)
        else {"type": "sum", "field": normalized["metric"]}
    )
    normalized["date_range"] = (
        normalized.get("date_range")
        if isinstance(normalized.get("date_range"), dict)
        else {}
    )
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return normalized


def _resolve_selected_columns(context: dict[str, Any], config: SourceConfig) -> list[ColumnSpec]:
    requested_columns = [_resolve_filter_key(str(value)) for value in context.get("columns", [])]
    available_keys = set(config.column_specs.keys())
    selected_keys = [key for key in requested_columns if key in available_keys]
    if not selected_keys:
        selected_keys = [key for key in config.default_column_keys if key in available_keys]
    return [config.column_specs[key] for key in selected_keys]


def _resolve_sort_key(context: dict[str, Any], selected_columns: list[ColumnSpec], config: SourceConfig) -> str:
    requested_key = _resolve_filter_key(str(context.get("sort_by") or ""))
    if not requested_key:
        return "__metric_value"
    selected_keys = {column.key for column in selected_columns}
    if requested_key in selected_keys:
        return requested_key
    if requested_key in {"value", "metric", "__metric_value"}:
        return "__metric_value"
    return "__metric_value" if config.default_sort_key not in selected_keys else config.default_sort_key


def _build_response_title(context: dict[str, Any], normalized_filters: dict[str, list[Any]], metric_key: str) -> str:
    explicit_title = str(context.get("display_title") or "").strip()
    if explicit_title:
        return explicit_title
    segments = ["Underlying Records"]
    if normalized_filters.get("region"):
        segments.append(str(normalized_filters["region"][0]))
    elif normalized_filters.get("row_us"):
        segments.append(str(normalized_filters["row_us"][0]))
    if normalized_filters.get("month"):
        segments.append(str(normalized_filters["month"][0]))
    metric = str(context.get("metric") or metric_key).strip()
    if metric:
        segments.append(metric)
    return " - " + " / ".join(segments[1:]) if len(segments) > 1 else segments[0]


def get_drilldown_details(context: dict[str, Any], principal: RapidPrincipal | None) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_context = validate_drilldown_context(context, principal)
    selected_month = _resolve_month(normalized_context.get("month"))
    configs = _source_configs(month=selected_month)
    config = configs[normalized_context["source"]]
    metric_key, metric_expression = apply_metric_selection(normalized_context, config)
    selected_columns = _resolve_selected_columns(normalized_context, config)
    sort_key = _resolve_sort_key(normalized_context, selected_columns, config)

    where_clauses = list(config.base_conditions)
    params: list[Any] = []
    normalized_filters = apply_filters(
        context=normalized_context,
        config=config,
        where_clauses=where_clauses,
        params=params,
    )
    apply_rbac_filters(
        principal=principal,
        config=config,
        normalized_filters=normalized_filters,
        where_clauses=where_clauses,
        params=params,
    )

    details_sql, summary_sql = build_drilldown_query(
        context=normalized_context,
        config=config,
        metric_expression=metric_expression,
        selected_columns=selected_columns,
        where_clauses=where_clauses,
        sort_key=sort_key,
        sort_dir=normalized_context["sort_dir"],
    )
    page = normalized_context["page"]
    page_size = normalized_context["page_size"]
    offset = (page - 1) * page_size

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(summary_sql, params)
            summary_row = cursor.fetchone() or {}
            cursor.execute(details_sql, [*params, page_size, offset])
            rows = cursor.fetchall()

    serialized_rows: list[dict[str, Any]] = []
    for row in rows:
        serialized_rows.append(
            {
                key: _serialize_value(row.get(key))
                for key in [column.key for column in selected_columns]
            }
        )

    total_rows = int(summary_row.get("total_rows") or 0)
    total_value = float(summary_row.get("total_value") or 0.0)
    clicked_value = (
        float(normalized_context.get("value"))
        if normalized_context.get("value") not in (None, "")
        else None
    )
    difference = float(total_value - clicked_value) if clicked_value is not None else 0.0
    is_reconciled = clicked_value is None or abs(difference) <= 0.05
    filters_payload = {
        key: values[0] if len(values) == 1 else values
        for key, values in normalized_filters.items()
        if values
    }
    if normalized_context.get("fiscal_year"):
        filters_payload["financial_year"] = normalized_context["fiscal_year"]
    if selected_month:
        filters_payload["month"] = selected_month

    return {
        "title": _build_response_title(normalized_context, normalized_filters, metric_key),
        "filters": filters_payload,
        "summary": {
            "record_count": total_rows,
            "total_value": total_value,
            "clicked_value": clicked_value,
            "difference": difference,
            "is_reconciled": is_reconciled,
        },
        "columns": [
            {"key": column.key, "label": column.label}
            for column in selected_columns
        ],
        "rows": serialized_rows,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_rows": total_rows,
        },
        "context": {
            "source": normalized_context["source"],
            "metric": normalized_context["metric"],
            "aggregation": normalized_context.get("aggregation", {}),
        },
    }


def _build_export_rows(context: dict[str, Any], principal: RapidPrincipal | None) -> dict[str, Any]:
    normalized_context = dict(context)
    normalized_context["page"] = 1
    normalized_context["page_size"] = min(
        max(int(context.get("page_size") or 1000), 100),
        1000,
    )
    first_page = get_drilldown_details(normalized_context, principal)
    total_rows = int(first_page.get("pagination", {}).get("total_rows") or 0)
    page_size = int(first_page.get("pagination", {}).get("page_size") or 1000)
    rows = list(first_page.get("rows", []))
    if total_rows > len(rows):
        pages = (total_rows + page_size - 1) // page_size
        for page in range(2, pages + 1):
            normalized_context["page"] = page
            page_payload = get_drilldown_details(normalized_context, principal)
            rows.extend(page_payload.get("rows", []))
    first_page["rows"] = rows
    return first_page


def export_drilldown_details(
    context: dict[str, Any],
    principal: RapidPrincipal | None,
    export_format: str = "csv",
) -> tuple[str, bytes, str]:
    payload = _build_export_rows(context, principal)
    columns = payload.get("columns", [])
    rows = payload.get("rows", [])
    title = str(payload.get("title") or "drilldown").strip() or "drilldown"
    safe_title = re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("_") or "drilldown"
    generated_at = datetime.utcnow().isoformat() + "Z"

    if export_format.lower() == "xlsx":
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Details"
        worksheet.append(["generated_at", sanitize_export_cell(generated_at)])
        worksheet.append(["source", sanitize_export_cell(str(payload.get("context", {}).get("source") or ""))])
        worksheet.append([])
        worksheet.append([column.get("label") or column.get("key") for column in columns])
        for row in rows:
            worksheet.append(
                [
                    sanitize_export_cell(row.get(str(column.get("key") or "")))
                    for column in columns
                ]
            )
        buffer = io.BytesIO()
        workbook.save(buffer)
        return f"{safe_title}.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["generated_at", sanitize_export_cell(generated_at)])
    writer.writerow(["source", sanitize_export_cell(str(payload.get("context", {}).get("source") or ""))])
    writer.writerow([])
    writer.writerow([column.get("label") or column.get("key") for column in columns])
    for row in rows:
        writer.writerow(
            [
                sanitize_export_cell(row.get(str(column.get("key") or "")))
                for column in columns
            ]
        )
    return f"{safe_title}.csv", output.getvalue().encode("utf-8"), "text/csv; charset=utf-8"

