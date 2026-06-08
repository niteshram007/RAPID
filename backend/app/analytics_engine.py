from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import uuid4

from fastapi import HTTPException

from .masterdata_dataset import MASTERDATA_JSON_LABELS
from .postgres import ensure_postgres_schema, open_database_connection

DatasetType = Literal["budget", "global_revenue", "forecast"]
AggregationType = Literal["sum", "avg", "count", "min", "max"]

DATASET_TABLES: dict[DatasetType, tuple[str, str]] = {
    "budget": ("budget_records", "budget_uploads"),
    "global_revenue": ("global_revenue_records", "global_revenue_uploads"),
    "forecast": ("forecast_records", "forecast_uploads"),
}

IGNORED_COLUMNS = {
    "id",
    "upload_id",
    "source_sheet",
    "source_row_number",
    "business_key",
    "raw_payload",
    "created_at",
    "updated_at",
    "updated_by",
}
NUMERIC_TYPES = {
    "numeric",
    "decimal",
    "double precision",
    "real",
    "integer",
    "bigint",
    "smallint",
}
DATE_TYPES = {
    "date",
    "timestamp without time zone",
    "timestamp with time zone",
}
IDENTIFIER_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*$")
INSIGHT_PRIORITY_FIELDS = (
    "revenue",
    "revenue_book_currency",
    "amount",
    "invoice_amount",
    "budget",
    "ytd_revenue",
    "apr_25",
    "may_25",
    "jun_25",
    "jul_25",
    "aug_25",
    "sep_25",
    "oct_25",
    "nov_25",
    "dec_25",
    "jan_26",
    "feb_26",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_dataset_type(dataset_type: str) -> DatasetType:
    normalized = str(dataset_type or "").strip().lower()
    if normalized not in DATASET_TABLES:
        raise HTTPException(
            status_code=400,
            detail="Choose a valid dataset type: budget, global_revenue, or forecast.",
        )
    return normalized  # type: ignore[return-value]


def quote_identifier(value: str) -> str:
    if not IDENTIFIER_PATTERN.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid column identifier: {value}")
    return f'"{value}"'


def normalize_chart_type(chart_type: str) -> str:
    allowed = {"bar", "line", "area", "pie", "donut", "scatter", "heatmap", "combo", "table"}
    normalized = str(chart_type or "bar").strip().lower()
    return normalized if normalized in allowed else "bar"


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


def _serialize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in rows:
        output.append({key: _serialize_value(value) for key, value in row.items()})
    return output


def _semantic_for_column(name: str, kind: str) -> str:
    lower = name.lower()
    if any(token in lower for token in ("budget", "revenue", "amount", "invoice", "bill", "rate")):
        return "currency" if kind == "numeric" else "business"
    if any(token in lower for token in ("pct", "percent", "percentage", "variance")):
        return "percentage" if kind == "numeric" else "business"
    if any(token in lower for token in ("date", "month", "quarter", "year", "fy", "q1", "q2", "q3", "q4")):
        return "time"
    if lower in {"region", "geo_head", "practice_head", "bdm", "customer_name", "project_name", "ms_ps"}:
        return "dimension"
    if kind == "numeric":
        return "measure"
    if kind == "date":
        return "time"
    return "dimension"


def _label_for_column(name: str) -> str:
    if name in MASTERDATA_JSON_LABELS:
        return MASTERDATA_JSON_LABELS[name]
    return name.replace("_", " ").title()


def _kind_for_column(data_type: str) -> str:
    normalized = str(data_type or "").lower()
    if normalized in NUMERIC_TYPES:
        return "numeric"
    if normalized in DATE_TYPES:
        return "date"
    return "categorical"


def _base_where_clause(financial_year: str | None) -> tuple[str, list[Any]]:
    conditions = ["u.is_active = true"]
    params: list[Any] = []
    if financial_year and str(financial_year).strip():
        conditions.append("r.financial_year = %s")
        params.append(str(financial_year).strip())
    return " where " + " and ".join(conditions), params


def _load_dataset_schema(cursor: Any, table_name: str) -> list[dict[str, Any]]:
    cursor.execute(
        """
        select
            column_name,
            data_type,
            is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = %s
        order by ordinal_position
        """,
        (table_name,),
    )
    rows = cursor.fetchall()
    output: list[dict[str, Any]] = []
    for row in rows:
        column_name = str(row.get("column_name") or "")
        if not column_name or column_name in IGNORED_COLUMNS:
            continue
        kind = _kind_for_column(str(row.get("data_type") or ""))
        output.append(
            {
                "name": column_name,
                "label": _label_for_column(column_name),
                "dataType": str(row.get("data_type") or "text"),
                "kind": kind,
                "semantic": _semantic_for_column(column_name, kind),
                "nullable": str(row.get("is_nullable") or "").upper() == "YES",
            }
        )
    return output


def get_analytics_schema(dataset_type: str, financial_year: str | None = None) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_dataset = ensure_dataset_type(dataset_type)
    record_table, upload_table = DATASET_TABLES[normalized_dataset]

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            columns = _load_dataset_schema(cursor, record_table)
            where_sql, params = _base_where_clause(financial_year)
            cursor.execute(
                f"""
                select count(*) as row_count
                from {record_table} r
                join {upload_table} u on u.id = r.upload_id
                {where_sql}
                """,
                params,
            )
            row = cursor.fetchone() or {}
            row_count = int(row.get("row_count") or 0)

    numeric_columns = [column["name"] for column in columns if column["kind"] == "numeric"]
    categorical_columns = [column["name"] for column in columns if column["kind"] == "categorical"]
    date_columns = [column["name"] for column in columns if column["kind"] == "date"]

    return {
        "datasetType": normalized_dataset,
        "tableName": record_table,
        "rowCount": row_count,
        "columns": columns,
        "numericColumns": numeric_columns,
        "categoricalColumns": categorical_columns,
        "dateColumns": date_columns,
    }


def get_chart_suggestions(dataset_type: str, financial_year: str | None = None) -> dict[str, Any]:
    schema = get_analytics_schema(dataset_type=dataset_type, financial_year=financial_year)
    columns = schema["columns"]
    numeric_columns = [column for column in columns if column["kind"] == "numeric"]
    categorical_columns = [column for column in columns if column["kind"] == "categorical"]
    time_columns = [column for column in columns if column["semantic"] == "time" or column["kind"] == "date"]

    dimension_preferences = [
        "region",
        "geo_head",
        "practice_head",
        "bdm",
        "customer_name",
        "project_name",
        "vertical",
        "horizontal",
        "ms_ps",
    ]
    measure_preferences = [
        "revenue",
        "budget",
        "amount",
        "invoice_amount",
        "revenue_book_currency",
        "ytd_revenue",
    ]

    def pick_column(candidates: list[str], fallback: list[dict[str, Any]]) -> dict[str, Any] | None:
        lookup = {column["name"]: column for column in columns}
        for candidate in candidates:
            if candidate in lookup:
                return lookup[candidate]
        return fallback[0] if fallback else None

    primary_dimension = pick_column(dimension_preferences, categorical_columns)
    secondary_dimension = categorical_columns[1] if len(categorical_columns) > 1 else None
    primary_measure = pick_column(measure_preferences, numeric_columns)
    secondary_measure = numeric_columns[1] if len(numeric_columns) > 1 else None
    time_dimension = pick_column(["month", "effort_month", "invoice_date"], time_columns)

    suggestions: list[dict[str, Any]] = []

    if primary_dimension and primary_measure:
        suggestions.append(
            {
                "id": "revenue-by-dimension",
                "title": f"{_label_for_column(primary_measure['name'])} by {_label_for_column(primary_dimension['name'])}",
                "description": "Category vs measure comparison for top performance tracking.",
                "chartType": "bar",
                "config": {
                    "xAxis": primary_dimension["name"],
                    "measures": [primary_measure["name"]],
                    "aggregation": "sum",
                    "groupBy": [primary_dimension["name"]],
                },
            }
        )

    if time_dimension and primary_measure:
        suggestions.append(
            {
                "id": "trend-over-time",
                "title": f"{_label_for_column(primary_measure['name'])} trend over {_label_for_column(time_dimension['name'])}",
                "description": "Time-series trend for budget, forecast, or revenue movement.",
                "chartType": "line",
                "config": {
                    "xAxis": time_dimension["name"],
                    "measures": [primary_measure["name"]],
                    "aggregation": "sum",
                    "groupBy": [time_dimension["name"]],
                },
            }
        )

    if primary_dimension and secondary_measure:
        suggestions.append(
            {
                "id": "forecast-vs-actual",
                "title": f"{_label_for_column(primary_measure['name'])} vs {_label_for_column(secondary_measure['name'])}",
                "description": "Compare two key measures by a business dimension.",
                "chartType": "combo",
                "config": {
                    "xAxis": primary_dimension["name"],
                    "measures": [primary_measure["name"], secondary_measure["name"]],
                    "aggregation": "sum",
                    "groupBy": [primary_dimension["name"]],
                },
            }
        )

    if primary_dimension and primary_measure and secondary_dimension:
        suggestions.append(
            {
                "id": "stacked-distribution",
                "title": f"{_label_for_column(primary_measure['name'])} distribution by {_label_for_column(primary_dimension['name'])}",
                "description": "Stacked split to analyze contribution across two dimensions.",
                "chartType": "heatmap",
                "config": {
                    "xAxis": primary_dimension["name"],
                    "measures": [primary_measure["name"]],
                    "aggregation": "sum",
                    "groupBy": [primary_dimension["name"], secondary_dimension["name"]],
                },
            }
        )

    if len(numeric_columns) >= 2:
        suggestions.append(
            {
                "id": "correlation",
                "title": f"Correlation: {_label_for_column(numeric_columns[0]['name'])} vs {_label_for_column(numeric_columns[1]['name'])}",
                "description": "Scatter view for numeric relationship analysis.",
                "chartType": "scatter",
                "config": {
                    "xAxis": numeric_columns[0]["name"],
                    "measures": [numeric_columns[1]["name"]],
                    "aggregation": "avg",
                    "groupBy": [],
                },
            }
        )

    return {
        "datasetType": schema["datasetType"],
        "rowCount": schema["rowCount"],
        "suggestions": suggestions[:8],
        "defaults": {
            "xAxis": primary_dimension["name"] if primary_dimension else None,
            "measure": primary_measure["name"] if primary_measure else None,
            "aggregation": "sum",
            "chartType": "bar",
        },
    }


def _build_filter_sql(
    filters: list[dict[str, Any]] | None,
    allowed_columns: set[str],
) -> tuple[list[str], list[Any]]:
    conditions: list[str] = []
    params: list[Any] = []
    for item in filters or []:
        field = str(item.get("field") or "").strip()
        if not field:
            continue
        if field not in allowed_columns:
            raise HTTPException(status_code=400, detail=f"Invalid filter field: {field}")

        operator = str(item.get("operator") or "eq").strip().lower()
        value = item.get("value")
        identifier = f"r.{quote_identifier(field)}"

        if operator == "eq":
            conditions.append(f"{identifier} = %s")
            params.append(value)
        elif operator == "neq":
            conditions.append(f"{identifier} <> %s")
            params.append(value)
        elif operator == "in":
            values = value if isinstance(value, list) else [value]
            values = [entry for entry in values if entry is not None and str(entry).strip() != ""]
            if not values:
                continue
            conditions.append(f"{identifier} = any(%s)")
            params.append(values)
        elif operator == "contains":
            conditions.append(f"cast({identifier} as text) ilike %s")
            params.append(f"%{str(value or '').strip()}%")
        elif operator == "gte":
            conditions.append(f"{identifier} >= %s")
            params.append(value)
        elif operator == "lte":
            conditions.append(f"{identifier} <= %s")
            params.append(value)
        elif operator == "between":
            if not isinstance(value, list) or len(value) < 2:
                continue
            conditions.append(f"{identifier} between %s and %s")
            params.extend([value[0], value[1]])
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported filter operator: {operator}")

    return conditions, params


def _aggregate_expression(aggregation: AggregationType, measure: str) -> str:
    field = f"r.{quote_identifier(measure)}"
    if aggregation == "sum":
        return f"coalesce(sum(coalesce({field}, 0)), 0)"
    if aggregation == "avg":
        return f"coalesce(avg({field}), 0)"
    if aggregation == "min":
        return f"coalesce(min({field}), 0)"
    if aggregation == "max":
        return f"coalesce(max({field}), 0)"
    return f"count({field})"


def _build_smart_insights(
    rows: list[dict[str, Any]],
    dimension_fields: list[str],
    measure_aliases: list[str],
) -> list[str]:
    if not rows or not measure_aliases:
        return ["No data is available for the selected configuration."]

    measure_key = measure_aliases[0]
    sorted_rows = sorted(
        rows,
        key=lambda row: float(row.get(measure_key) or 0),
        reverse=True,
    )
    top_row = sorted_rows[0]
    bottom_row = sorted_rows[-1]
    top_dimension = (
        str(top_row.get(dimension_fields[0]) or "Top segment")
        if dimension_fields
        else "Overall"
    )
    bottom_dimension = (
        str(bottom_row.get(dimension_fields[0]) or "Bottom segment")
        if dimension_fields
        else "Overall"
    )
    top_value = float(top_row.get(measure_key) or 0)
    bottom_value = float(bottom_row.get(measure_key) or 0)

    insights = [
        f"{top_dimension} is currently the strongest contributor at {top_value:,.2f}.",
        f"{bottom_dimension} is the weakest contributor at {bottom_value:,.2f}.",
    ]

    if len(sorted_rows) > 1 and top_value != 0:
        gap_pct = ((top_value - bottom_value) / abs(top_value)) * 100
        insights.append(
            f"Performance gap between top and bottom segments is {gap_pct:.1f}%."
        )

    return insights[:3]


def generate_chart(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_postgres_schema()
    dataset_type = ensure_dataset_type(str(payload.get("datasetType") or ""))
    record_table, upload_table = DATASET_TABLES[dataset_type]
    schema = get_analytics_schema(dataset_type, payload.get("financialYear"))
    allowed_columns = {column["name"] for column in schema["columns"]}

    chart_type = normalize_chart_type(str(payload.get("chartType") or "bar"))
    aggregation: AggregationType = str(payload.get("aggregation") or "sum").lower()  # type: ignore[assignment]
    if aggregation not in {"sum", "avg", "count", "min", "max"}:
        aggregation = "sum"

    x_axis = str(payload.get("xAxis") or "").strip()
    x_axis = x_axis if x_axis in allowed_columns else ""
    group_by = [str(field).strip() for field in payload.get("groupBy") or []]
    group_by = [field for field in group_by if field in allowed_columns]
    if x_axis and x_axis not in group_by:
        group_by = [x_axis, *group_by]

    measures = [str(field).strip() for field in payload.get("measures") or []]
    y_axis = str(payload.get("yAxis") or "").strip()
    if y_axis and y_axis not in measures:
        measures.append(y_axis)
    measures = [field for field in measures if field in allowed_columns]

    numeric_columns = set(schema["numericColumns"])
    if aggregation != "count":
        measures = [field for field in measures if field in numeric_columns]
        if not measures:
            for candidate in INSIGHT_PRIORITY_FIELDS:
                if candidate in numeric_columns:
                    measures = [candidate]
                    break
    if aggregation == "count" and not measures:
        measures = ["id"]

    if chart_type == "scatter" and len(measures) < 1:
        raise HTTPException(status_code=400, detail="Scatter chart requires numeric measures.")

    dimension_selects: list[str] = []
    for dimension in group_by:
        dimension_selects.append(f"r.{quote_identifier(dimension)} as {quote_identifier(dimension)}")

    measure_aliases: list[str] = []
    measure_selects: list[str] = []
    for measure in measures:
        alias = f"{aggregation}_{measure}".lower()
        alias = re.sub(r"[^a-z0-9_]+", "_", alias)
        measure_aliases.append(alias)
        if aggregation == "count" and measure == "id":
            measure_selects.append(f"count(*) as {quote_identifier(alias)}")
        else:
            measure_selects.append(
                f"{_aggregate_expression(aggregation, measure)} as {quote_identifier(alias)}"
            )

    if not measure_selects:
        measure_aliases = ["count_rows"]
        measure_selects = ['count(*) as "count_rows"']

    where_sql, where_params = _base_where_clause(payload.get("financialYear"))
    filter_conditions, filter_params = _build_filter_sql(payload.get("filters"), allowed_columns)
    if filter_conditions:
        where_sql += " and " + " and ".join(filter_conditions)

    select_sql = ", ".join([*dimension_selects, *measure_selects])
    if not select_sql:
        select_sql = "count(*) as count_rows"

    group_sql = ""
    if group_by:
        group_sql = " group by " + ", ".join(f"r.{quote_identifier(field)}" for field in group_by)

    order_field = str(payload.get("sortBy") or "").strip()
    sort_direction = "asc" if str(payload.get("sortDirection") or "desc").lower() == "asc" else "desc"
    selectable_order_fields = set(group_by + measure_aliases)
    if order_field not in selectable_order_fields:
        order_field = measure_aliases[0]
    order_sql = f" order by {quote_identifier(order_field)} {sort_direction}"

    limit = int(payload.get("limit") or 50)
    offset = int(payload.get("offset") or 0)
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)

    sql = f"""
        select {select_sql}
        from {record_table} r
        join {upload_table} u on u.id = r.upload_id
        {where_sql}
        {group_sql}
        {order_sql}
        limit %s offset %s
    """
    params = [*where_params, *filter_params, limit, offset]

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()

    serialized_rows = _serialize_rows(rows)
    insights = _build_smart_insights(serialized_rows, group_by, measure_aliases)

    return {
        "datasetType": dataset_type,
        "chartType": chart_type,
        "aggregation": aggregation,
        "xAxis": x_axis or (group_by[0] if group_by else None),
        "groupBy": group_by,
        "measureAliases": measure_aliases,
        "measures": measures,
        "rows": serialized_rows,
        "meta": {
            "rowCount": len(serialized_rows),
            "limit": limit,
            "offset": offset,
        },
        "insights": insights,
    }


def filter_data(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_postgres_schema()
    dataset_type = ensure_dataset_type(str(payload.get("datasetType") or ""))
    record_table, upload_table = DATASET_TABLES[dataset_type]
    schema = get_analytics_schema(dataset_type, payload.get("financialYear"))
    allowed_columns = [column["name"] for column in schema["columns"]]
    allowed_column_set = set(allowed_columns)

    requested_columns = [str(column).strip() for column in payload.get("columns") or []]
    selected_columns = [
        column for column in requested_columns if column in allowed_column_set
    ] or allowed_columns[:20]

    select_sql = ", ".join(
        f"r.{quote_identifier(column)} as {quote_identifier(column)}"
        for column in selected_columns
    )

    where_sql, where_params = _base_where_clause(payload.get("financialYear"))
    filter_conditions, filter_params = _build_filter_sql(payload.get("filters"), allowed_column_set)
    if filter_conditions:
        where_sql += " and " + " and ".join(filter_conditions)

    limit = int(payload.get("limit") or 100)
    offset = int(payload.get("offset") or 0)
    limit = max(1, min(limit, 2000))
    offset = max(0, offset)

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select count(*) as total_rows
                from {record_table} r
                join {upload_table} u on u.id = r.upload_id
                {where_sql}
                """,
                [*where_params, *filter_params],
            )
            total_rows = int((cursor.fetchone() or {}).get("total_rows") or 0)
            cursor.execute(
                f"""
                select {select_sql}
                from {record_table} r
                join {upload_table} u on u.id = r.upload_id
                {where_sql}
                limit %s offset %s
                """,
                [*where_params, *filter_params, limit, offset],
            )
            rows = cursor.fetchall()

    return {
        "datasetType": dataset_type,
        "columns": selected_columns,
        "totalRows": total_rows,
        "limit": limit,
        "offset": offset,
        "rows": _serialize_rows(rows),
    }


def drilldown(payload: dict[str, Any]) -> dict[str, Any]:
    base_config = dict(payload.get("baseConfig") or {})
    drill_field = str(payload.get("drillField") or "").strip()
    drill_value = payload.get("drillValue")
    next_dimension = str(payload.get("nextDimension") or "").strip()

    filters = list(base_config.get("filters") or [])
    if drill_field:
        filters.append({"field": drill_field, "operator": "eq", "value": drill_value})
    base_config["filters"] = filters

    if next_dimension:
        base_config["xAxis"] = next_dimension
        base_config["groupBy"] = [next_dimension]

    result = generate_chart(base_config)
    result["drillContext"] = {
        "drillField": drill_field,
        "drillValue": drill_value,
        "nextDimension": next_dimension or None,
    }
    return result


def save_dashboard(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_postgres_schema()
    user_id = str(payload.get("userId") or "").strip()
    dashboard_name = str(payload.get("name") or "").strip()
    dataset_type = ensure_dataset_type(str(payload.get("datasetType") or ""))
    layout = payload.get("layout") or {}
    charts = payload.get("charts") or []
    dashboard_id = str(payload.get("dashboardId") or "").strip()
    now_iso = utc_now_iso()

    if not user_id:
        raise HTTPException(status_code=400, detail="userId is required.")
    if not dashboard_name:
        raise HTTPException(status_code=400, detail="name is required.")

    if not dashboard_id:
        dashboard_id = str(uuid4())

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into saved_dashboards (
                    id,
                    user_id,
                    name,
                    dataset_type,
                    layout_json,
                    created_at,
                    updated_at
                )
                values (%s, %s, %s, %s, %s::jsonb, %s::timestamptz, %s::timestamptz)
                on conflict (id)
                do update set
                    user_id = excluded.user_id,
                    name = excluded.name,
                    dataset_type = excluded.dataset_type,
                    layout_json = excluded.layout_json,
                    updated_at = excluded.updated_at
                """,
                (
                    dashboard_id,
                    user_id,
                    dashboard_name,
                    dataset_type,
                    json.dumps(layout),
                    now_iso,
                    now_iso,
                ),
            )
            cursor.execute(
                "delete from saved_chart_configs where dashboard_id = %s",
                (dashboard_id,),
            )

            for chart in charts:
                cursor.execute(
                    """
                    insert into saved_chart_configs (
                        id,
                        dashboard_id,
                        user_id,
                        chart_name,
                        chart_type,
                        dataset_type,
                        x_axis,
                        y_axis,
                        config_json,
                        filters_json,
                        created_at,
                        updated_at
                    )
                    values (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::timestamptz, %s::timestamptz
                    )
                    """,
                    (
                        str(uuid4()),
                        dashboard_id,
                        user_id,
                        str(chart.get("name") or "Chart"),
                        str(chart.get("chartType") or "bar"),
                        dataset_type,
                        str(chart.get("xAxis") or "") or None,
                        str(chart.get("yAxis") or "") or None,
                        json.dumps(chart.get("config") or chart),
                        json.dumps(chart.get("filters") or []),
                        now_iso,
                        now_iso,
                    ),
                )
        connection.commit()

    return {
        "status": "saved",
        "dashboardId": dashboard_id,
        "savedCharts": len(charts),
        "savedAt": now_iso,
    }
