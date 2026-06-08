from __future__ import annotations

import re
from typing import Any

from .trend_common import (
    FISCAL_MONTH_ORDER,
    build_payload_lookup,
    build_fiscal_month_specs,
    coerce_float,
    get_text_value,
    normalize_text,
    parse_financial_year,
    upsert_uploaded_file,
)

BUDGET_MONTH_FIELD_BY_NAME = {
    "Apr": "apr_2026",
    "May": "may_2026",
    "Jun": "jun_2026",
    "Jul": "jul_2026",
    "Aug": "aug_2026",
    "Sep": "sep_2026",
    "Oct": "oct_2026",
    "Nov": "nov_2026",
    "Dec": "dec_2026",
    "Jan": "jan_2027",
    "Feb": "feb_2027",
    "Mar": "mar_2027",
}
INSERT_BATCH_SIZE = 1000
BUDGET_DATA_INSERT_COLUMNS = (
    "customer_name",
    "updated_customer",
    "original_customer_name",
    "standard_customer_name",
    "customer_group_key",
    "project_name",
    "original_project_name",
    "standard_project_name",
    "project_group_key",
    "ms_ps",
    "entity",
    "gr_entity",
    "row_us",
    "strategic_account",
    "resource_id",
    "resource_name",
    "deal_type",
    "eeennn",
    "bill_rate",
    "start_date",
    "end_date",
    "rate_type",
    "billed_currency",
    "type_of_projects",
    "practice_head",
    "bdm",
    "geo_head",
    "vertical",
    "horizontal",
    "ocn_number",
    "month",
    "year",
    "quarter",
    "primary_reference_type",
    "primary_reference_value",
    "mapping_status",
    "mapping_confidence",
    "mapping_reason",
    "needs_manual_review",
    "budget_amount",
    "fy_year",
    "uploaded_file_id",
)
US_GEOGRAPHY_ALIASES = {
    "US",
    "USA",
    "USN",
    "USW",
    "USE",
    "USS",
    "USC",
    "US-CENTRAL",
    "US-EAST",
    "US-WEST",
    "US-SOUTH",
    "NORTH AMERICA",
    "UNITED STATES",
    "UNITED STATES OF AMERICA",
}
ROW_GEOGRAPHY_ALIASES = {
    "ROW",
    "REST OF WORLD",
    "REST-OF-WORLD",
}


def _build_customer_group_key(value: Any) -> str:
    normalized = normalize_text(value).lower()
    if not normalized:
        return ""
    cleaned = re.sub(r"[^\w\s]", " ", normalized)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.replace(" ", "_")


def _build_project_group_key(customer_group_key: str, project_name: Any) -> str:
    project_key = _build_customer_group_key(project_name)
    if customer_group_key and project_key:
        return f"{customer_group_key}_{project_key}"
    return project_key or customer_group_key


def _normalize_ms_ps(value: Any) -> str:
    text = normalize_text(value).upper()
    compact = text.replace(" ", "").replace("-", "").replace("/", "")
    if compact.startswith("MS"):
        return "MS"
    if compact.startswith("PS"):
        return "PS"
    return text


def _normalize_row_us(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    compact = text.upper().replace("_", " ").replace("-", " ")
    compact = " ".join(compact.split())
    if compact in US_GEOGRAPHY_ALIASES:
        return "USA"
    if compact in ROW_GEOGRAPHY_ALIASES:
        return "ROW"
    return text


def _build_budget_data_insert_sql(insert_columns: tuple[str, ...]) -> str:
    placeholders = [
        "%s::uuid" if column == "uploaded_file_id" else "%s"
        for column in insert_columns
    ]
    return f"""
        insert into budget_data ({", ".join(insert_columns)})
        values ({", ".join(placeholders)})
    """


def refresh_budget_data(
    financial_year: str,
    connection: Any,
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            select
                u.id::text as upload_id,
                u.original_filename,
                u.upload_month,
                u.uploaded_at,
                u.imported_rows
            from budget_uploads u
            where u.financial_year = %s
              and u.is_active = true
            order by u.uploaded_at desc
            limit 1
            """,
            (financial_year,),
        )
        upload_row = cursor.fetchone()

        cursor.execute("delete from budget_data where fy_year = %s", (financial_year,))

        if not upload_row:
            return {
                "financialYear": financial_year,
                "fileId": None,
                "rowsProcessed": 0,
                "rowsFailed": 0,
            }

        upload_id = str(upload_row.get("upload_id") or "")
        start_year, _ = parse_financial_year(financial_year)
        upsert_uploaded_file(
            cursor,
            file_id=upload_id,
            file_name=normalize_text(upload_row.get("original_filename")) or "budget-upload.xlsx",
            file_type="budget",
            upload_month=normalize_text(upload_row.get("upload_month")) or None,
            upload_year=start_year,
            uploaded_by="admin-upload",
            status="processed",
            rows_processed=int(upload_row.get("imported_rows") or 0),
            rows_failed=0,
            error_message=None,
            created_at=upload_row.get("uploaded_at").isoformat().replace("+00:00", "Z"),
        )

        cursor.execute(
            """
            select
                customer_name,
                updated_customer,
                original_customer_name,
                standard_customer_name,
                customer_group_key,
                project_name,
                original_project_name,
                standard_project_name,
                project_group_key,
                ms_ps,
                entity,
                gr_entity,
                row_us,
                strategic_account,
                resource_id,
                resource_name,
                deal_type,
                eeennn,
                bill_rate,
                start_date,
                end_date,
                rate_type,
                billed_currency,
                type_of_projects,
                practice_head,
                bdm,
                geo_head,
                vertical,
                horizontal,
                ocn_number,
                primary_reference_type,
                primary_reference_value,
                mapping_status,
                mapping_confidence,
                mapping_reason,
                needs_manual_review,
                fy,
                raw_payload,
                apr_2026,
                may_2026,
                jun_2026,
                jul_2026,
                aug_2026,
                sep_2026,
                oct_2026,
                nov_2026,
                dec_2026,
                jan_2027,
                feb_2027,
                mar_2027
            from budget_records
            where upload_id = %s::uuid
            order by id asc
            """,
            (upload_id,),
        )
        rows = cursor.fetchall()

        insert_sql = _build_budget_data_insert_sql(BUDGET_DATA_INSERT_COLUMNS)

        month_specs = build_fiscal_month_specs(financial_year)
        batch: list[list[Any]] = []
        rows_processed = 0

        for row in rows:
            raw_payload = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
            lookup = build_payload_lookup(raw_payload)
            updated_customer = get_text_value(
                row.get("standard_customer_name"),
                lookup,
                "Standard Customer Name",
            ) or get_text_value(
                row.get("updated_customer"),
                lookup,
                "Updated Customer",
                "Updated Customer Name",
            )
            customer_name = updated_customer or get_text_value(
                row.get("standard_customer_name"),
                lookup,
                "Standard Customer Name",
                "Customer Name",
                "Customer name",
                "Customer",
            )
            original_customer_name = get_text_value(
                row.get("customer_name"),
                lookup,
                "Customer Name",
                "Customer name",
                "Customer",
            )
            if not customer_name:
                customer_name = original_customer_name
            if not updated_customer:
                updated_customer = customer_name

            project_name = get_text_value(
                row.get("standard_project_name"),
                lookup,
                "Standard Project Name",
                "Project Name",
                "Project",
            )
            original_project_name = get_text_value(
                row.get("project_name"),
                lookup,
                "Project Name",
                "Project",
            )
            if not project_name:
                project_name = original_project_name
            ms_ps = _normalize_ms_ps(
                get_text_value(
                    row.get("ms_ps"),
                    lookup,
                    "MS/PS",
                    "PS/MS",
                    "PS/MS budget",
                    "MS/PS budget",
                )
            )
            entity = get_text_value(row.get("entity"), lookup, "Entity", "Company")
            gr_entity = get_text_value(
                row.get("gr_entity"),
                lookup,
                "GR Entity",
                "Entity As per GR",
                "Group company",
                "Group Company",
            )
            row_us = _normalize_row_us(
                get_text_value(
                    row.get("row_us"),
                    lookup,
                    "ROW/US",
                )
            )
            strategic_account = get_text_value(row.get("strategic_account"), lookup, "Strategic Account")
            resource_id = get_text_value(row.get("resource_id"), lookup, "Emp ID", "Resource ID", "Employee ID")
            resource_name = get_text_value(row.get("resource_name"), lookup, "Resource Name")
            deal_type = get_text_value(row.get("deal_type"), lookup, "Deal Type", "Revenue type", "Revenue Type")
            eeennn = get_text_value(row.get("eeennn"), lookup, "EEENNN", "EENNN")
            bill_rate = coerce_float(row.get("bill_rate"), 0.0)
            rate_type = get_text_value(row.get("rate_type"), lookup, "Rate Type", "RateType")
            billed_currency = (
                get_text_value(row.get("billed_currency"), lookup, "Billed currency", "Billed Currency", "Currency")
                or "USD"
            )
            type_of_projects = get_text_value(
                row.get("type_of_projects"),
                lookup,
                "Type of Projects",
                "Type of Project",
            )
            practice_head = get_text_value(row.get("practice_head"), lookup, "Practice Head")
            bdm = get_text_value(row.get("bdm"), lookup, "BDM")
            geo_head = get_text_value(row.get("geo_head"), lookup, "Geo Head", "GeoHead", "Geo head")
            vertical = get_text_value(row.get("vertical"), lookup, "Vertical")
            horizontal = get_text_value(row.get("horizontal"), lookup, "Horizontal")
            ocn_number = get_text_value(row.get("ocn_number"), lookup, "OCN Number", "OCN", "OCN No", "OCN_NUMBER")
            customer_group_key = get_text_value(row.get("customer_group_key"), lookup, "Customer Group Key")
            if not customer_group_key:
                customer_group_key = _build_customer_group_key(updated_customer or customer_name)
            project_group_key = get_text_value(row.get("project_group_key"), lookup, "Project Group Key")
            if not project_group_key:
                project_group_key = _build_project_group_key(customer_group_key, project_name)
            primary_reference_type = get_text_value(
                row.get("primary_reference_type"),
                lookup,
                "Primary Reference Type",
            )
            primary_reference_value = get_text_value(
                row.get("primary_reference_value"),
                lookup,
                "Primary Reference Value",
            )
            mapping_status = get_text_value(row.get("mapping_status"), lookup, "Mapping Status")
            mapping_confidence = coerce_float(row.get("mapping_confidence"), 0.0)
            mapping_reason = get_text_value(row.get("mapping_reason"), lookup, "Mapping Reason")
            needs_manual_review = bool(row.get("needs_manual_review"))

            for month_spec in month_specs:
                month_name = str(month_spec["month"])
                month_field = BUDGET_MONTH_FIELD_BY_NAME[month_name]
                budget_amount = coerce_float(row.get(month_field), 0.0)
                record_values = {
                    "customer_name": customer_name,
                    "updated_customer": updated_customer,
                    "original_customer_name": original_customer_name,
                    "standard_customer_name": customer_name,
                    "customer_group_key": customer_group_key,
                    "project_name": project_name,
                    "original_project_name": original_project_name,
                    "standard_project_name": project_name,
                    "project_group_key": project_group_key,
                    "ms_ps": ms_ps,
                    "entity": entity,
                    "gr_entity": gr_entity,
                    "row_us": row_us,
                    "strategic_account": strategic_account,
                    "resource_id": resource_id,
                    "resource_name": resource_name,
                    "deal_type": deal_type,
                    "eeennn": eeennn,
                    "bill_rate": bill_rate,
                    "start_date": row.get("start_date"),
                    "end_date": row.get("end_date"),
                    "rate_type": rate_type,
                    "billed_currency": billed_currency,
                    "type_of_projects": type_of_projects,
                    "practice_head": practice_head,
                    "bdm": bdm,
                    "geo_head": geo_head,
                    "vertical": vertical,
                    "horizontal": horizontal,
                    "ocn_number": ocn_number,
                    "month": month_name,
                    "year": int(month_spec["year"]),
                    "quarter": str(month_spec["quarter"]),
                    "primary_reference_type": primary_reference_type,
                    "primary_reference_value": primary_reference_value,
                    "mapping_status": mapping_status,
                    "mapping_confidence": mapping_confidence,
                    "mapping_reason": mapping_reason,
                    "needs_manual_review": needs_manual_review,
                    "budget_amount": budget_amount,
                    "fy_year": financial_year,
                    "uploaded_file_id": upload_id,
                }
                batch.append([record_values.get(column) for column in BUDGET_DATA_INSERT_COLUMNS])
                if len(batch) >= INSERT_BATCH_SIZE:
                    cursor.executemany(insert_sql, batch)
                    rows_processed += len(batch)
                    batch.clear()

        if batch:
            cursor.executemany(insert_sql, batch)
            rows_processed += len(batch)

    return {
        "financialYear": financial_year,
        "fileId": upload_id,
        "rowsProcessed": rows_processed,
        "rowsFailed": 0,
        "months": list(FISCAL_MONTH_ORDER),
    }
