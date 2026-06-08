from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

from .masterdata_dataset import (
    MASTERDATA_COLUMN_KEYS,
    MASTERDATA_DATASET_TYPES,
    MASTERDATA_FIELD_SPECS,
    MASTERDATA_JSON_LABELS,
    DatasetType,
    MasterdataFieldSpec,
    build_masterdata_business_key,
    normalize_header,
    parse_masterdata_workbook,
    validate_masterdata_row,
)
from .postgres import ensure_postgres_schema, open_database_connection
from .rapid_revenue_dataset import RAPID_REVENUE_COLUMN_KEYS
from .services.budget_processing_service import refresh_budget_data
from .services.global_revenue_processing_service import refresh_actual_revenue
from .security import sanitize_export_cell

ROOT_DIR = Path(__file__).resolve().parents[2]

UPLOAD_TABLE_BY_DATASET: dict[DatasetType, str] = {
    "budget": "budget_uploads",
    "global_revenue": "global_revenue_uploads",
    "forecast": "forecast_uploads",
}
RECORD_TABLE_BY_DATASET: dict[DatasetType, str] = {
    "budget": "budget_records",
    "global_revenue": "global_revenue_records",
    "forecast": "forecast_records",
}
RAPID_REVENUE_SOURCE_BUDGET = "budget"
RAPID_REVENUE_SOURCE_UPLOAD = "rapid_revenue"
UPLOAD_INSERT_BATCH_SIZE = 1000
BUDGET_SYNC_LOCK_NAMESPACE = 20260520
FORECAST_MONTH_KEY_BY_LABEL = {
    "Apr 2026": "apr_2026",
    "May 2026": "may_2026",
    "Jun 2026": "jun_2026",
    "Jul 2026": "jul_2026",
    "Aug 2026": "aug_2026",
    "Sep 2026": "sep_2026",
    "Oct 2026": "oct_2026",
    "Nov 2026": "nov_2026",
    "Dec 2026": "dec_2026",
    "Jan 2027": "jan_2027",
    "Feb 2027": "feb_2027",
    "Mar 2027": "mar_2027",
}
RAW_PAYLOAD_TEXT_FALLBACKS: dict[str, tuple[str, ...]] = {
    "customer_name": (
        "Customer Name",
        "Customer name",
        "Updated Customer",
        "Updated Customer Name",
        "Customer",
    ),
    "updated_customer": (
        "Updated Customer",
        "Updated Customer Name",
    ),
    "client_name": (
        "Updated Customer",
        "Updated Customer Name",
        "Customer Name",
        "Customer name",
        "Customer",
    ),
    "resource_id": ("Resource ID", "Emp ID", "Employee ID", "Employee Id"),
    "resource_name": ("Resource Name",),
    "project_name": ("Project Name", "Project"),
    "ms_ps": ("MS/PS", "PS/MS", "PS/MS budget", "MS/PS budget", "MS PS", "PS MS"),
    "entity": ("Entity", "Company"),
    "gr_entity": ("GR Entity", "Entity As per GR", "Group company", "Group Company"),
    "row_us": ("ROW/US", "Region", "Region summary", "Region Summary"),
    "strategic_account": ("Strategic Account",),
    "deal_type": ("Deal Type", "Revenue type", "Revenue Type"),
    "eeennn": ("EEENNN", "EENNN"),
    "ocn_number": ("OCN Number", "OCN", "OCN No", "OCN_NUMBER"),
    "practice_head": ("Practice Head",),
    "bdm": ("BDM",),
    "geo_head": ("Geo Head", "GeoHead", "Geo head"),
    "vertical": ("Vertical",),
    "horizontal": ("Horizontal",),
    "rate_type": ("Rate Type", "RateType"),
    "billed_currency": ("Billed currency", "Billed Currency", "Currency"),
    "type_of_projects": ("Type of Projects", "Type of Project"),
}
RAW_PAYLOAD_NUMERIC_FALLBACKS: dict[str, tuple[str, ...]] = {
    "forex": ("Forex", "FX", "FX Rate", "Forex Rate", "Exchange Rate"),
}
ACTUAL_REVENUE_VIEW_FIELD_SPECS: tuple[MasterdataFieldSpec, ...] = (
    MasterdataFieldSpec("customer_name", "Customer Name", "text"),
    MasterdataFieldSpec("project_name", "Project Name", "text"),
    MasterdataFieldSpec("resource_name", "Resource Name", "text"),
    MasterdataFieldSpec("ms_ps", "MS/PS", "text"),
    MasterdataFieldSpec("month", "Month", "text"),
    MasterdataFieldSpec("year", "Year", "text"),
    MasterdataFieldSpec("actual_revenue_value", "Actuals", "numeric"),
    MasterdataFieldSpec("revenue_book_currency", "Revenue Book currency", "numeric"),
    MasterdataFieldSpec("amount", "Amount", "numeric"),
    MasterdataFieldSpec("invoice_amount", "Invoice amount", "numeric"),
    MasterdataFieldSpec("billed_currency", "Billed currency", "text"),
    MasterdataFieldSpec("book_currency", "Book currency", "text"),
    MasterdataFieldSpec("billed_hours", "Billed Hours", "numeric"),
    MasterdataFieldSpec("billable_actual_hrs", "Billable Actual Hrs", "numeric"),
    MasterdataFieldSpec("rate_type", "Rate Type", "text"),
    MasterdataFieldSpec("type_of_projects", "Type of Projects", "text"),
    MasterdataFieldSpec("customer_id", "Customer Id", "text"),
    MasterdataFieldSpec("ocn_number", "OCN Number", "text"),
    MasterdataFieldSpec("emp_id", "Emp ID", "text"),
    MasterdataFieldSpec("revenue_type", "Revenue type", "text"),
    MasterdataFieldSpec("invoice_no", "Invoice no", "text"),
    MasterdataFieldSpec("invoice_date", "Invoice Date", "date"),
    MasterdataFieldSpec("company", "Company", "text"),
    MasterdataFieldSpec("branch", "Branch", "text"),
    MasterdataFieldSpec("region", "Region", "text"),
    MasterdataFieldSpec("sales_region", "Sales Region", "text"),
    MasterdataFieldSpec("practice_head", "Practice Head", "text"),
    MasterdataFieldSpec("bdm", "BDM", "text"),
    MasterdataFieldSpec("geo_head", "Geo Head", "text"),
    MasterdataFieldSpec("vertical", "Vertical", "text"),
    MasterdataFieldSpec("horizontal", "Horizontal", "text"),
)
ACTUAL_REVENUE_MONTH_ORDER = ("Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar")
ACTUAL_REVENUE_MONTH_RANK = {
    month.lower(): index
    for index, month in enumerate(ACTUAL_REVENUE_MONTH_ORDER)
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_optional_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))

    text = str(value).strip()
    if not text:
        return None
    negative = text.startswith("(") and text.endswith(")")
    cleaned = text.replace(",", "").replace("$", "").replace("%", "").strip()
    cleaned = cleaned.strip("()")
    cleaned = "".join(character for character in cleaned if character.isdigit() or character in ".-")
    if not cleaned:
        return None
    if negative and not cleaned.startswith("-"):
        cleaned = f"-{cleaned}"
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _convert_budget_value_to_forecast_usd(value: Any, currency: Any, forex: Any) -> Decimal:
    amount = _parse_optional_decimal(value) or Decimal("0")
    normalized_currency = str(currency or "USD").strip().upper()
    if normalized_currency == "USD":
        return amount
    forex_rate = _parse_optional_decimal(forex)
    if forex_rate and forex_rate > 0:
        return amount / forex_rate
    return amount


def _extract_raw_payload_value(raw_payload: Any, candidates: tuple[str, ...]) -> Any:
    if not isinstance(raw_payload, dict):
        return None
    normalized_payload = {
        normalize_header(str(key)): value
        for key, value in raw_payload.items()
        if normalize_header(str(key))
    }
    for candidate in candidates:
        value = normalized_payload.get(normalize_header(candidate))
        if value not in (None, ""):
            return value
    return None


def _global_revenue_upload_month_rank(upload_month: Any) -> int:
    normalized = str(upload_month or "").strip().lower()
    return ACTUAL_REVENUE_MONTH_RANK.get(normalized, -1)


def _global_revenue_month_rank_sql(column: str = "upload_month") -> str:
    cases = " ".join(
        f"when lower(trim(coalesce({column}, ''))) = '{month.lower()}' then {index}"
        for index, month in enumerate(ACTUAL_REVENUE_MONTH_ORDER)
    )
    return f"case {cases} else -1 end"


def _activate_latest_global_revenue_upload(cursor: Any, financial_year: str) -> str | None:
    cursor.execute(
        """
        with ranked_uploads as (
            select
                id,
                case lower(left(trim(coalesce(upload_month, '')), 3))
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
                    else ''
                end as upload_month_key,
                row_number() over (
                    partition by
                        case lower(left(trim(coalesce(upload_month, '')), 3))
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
                            else ''
                        end
                    order by uploaded_at desc nulls last, id desc
                ) as month_rank
            from global_revenue_uploads
            where financial_year = %s
        )
        update global_revenue_uploads uploads
        set is_active = ranked_uploads.month_rank = 1
        from ranked_uploads
        where uploads.id = ranked_uploads.id
        returning
            uploads.id::text as id,
            uploads.is_active,
            uploads.upload_month,
            uploads.uploaded_at
        """,
        (financial_year,),
    )
    rows = [row for row in cursor.fetchall() if bool(row.get("is_active"))]
    if not rows:
        return None
    rows.sort(
        key=lambda row: (
            _global_revenue_upload_month_rank(row.get("upload_month")),
            row.get("uploaded_at"),
            str(row.get("id") or ""),
        ),
        reverse=True,
    )
    return str(rows[0].get("id") or "") or None


def _hydrate_masterdata_values_from_raw_payload(
    values: dict[str, Any],
    raw_payload: dict[str, Any],
) -> dict[str, Any]:
    hydrated = dict(values)

    for field_key, candidates in RAW_PAYLOAD_TEXT_FALLBACKS.items():
        current_value = str(hydrated.get(field_key) or "").strip()
        if current_value:
            continue
        raw_value = _extract_raw_payload_value(raw_payload, candidates)
        if raw_value in (None, ""):
            continue
        hydrated[field_key] = str(raw_value).strip()

    for field_key, candidates in RAW_PAYLOAD_NUMERIC_FALLBACKS.items():
        if hydrated.get(field_key) not in (None, "", Decimal(0), 0, 0.0):
            continue
        raw_value = _extract_raw_payload_value(raw_payload, candidates)
        parsed = _parse_optional_decimal(raw_value)
        if parsed is not None:
            hydrated[field_key] = parsed

    if not str(hydrated.get("billed_currency") or "").strip():
        hydrated["billed_currency"] = "USD"

    return hydrated


def ensure_valid_dataset_type(dataset_type: str) -> DatasetType:
    normalized = dataset_type.strip().lower()
    if normalized not in MASTERDATA_DATASET_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Choose a valid dataset type: budget, global_revenue, or forecast.",
        )
    return normalized  # type: ignore[return-value]


def preview_masterdata_upload(
    dataset_type: str,
    workbook_path: Path,
) -> dict[str, Any]:
    normalized_dataset = ensure_valid_dataset_type(dataset_type)
    parsed = parse_masterdata_workbook(workbook_path, normalized_dataset)
    preview_rows = [
        _serialize_public_row(row.values)
        for row in parsed.rows[:200]
    ]
    return {
        "datasetType": normalized_dataset,
        "previewRows": preview_rows,
        "summary": {
            "validRows": len(parsed.rows),
            "invalidRows": len(parsed.invalid_rows),
            "missingRequiredColumns": parsed.missing_required_columns,
            "parsedSheets": parsed.parsed_sheets,
            "matchedColumns": parsed.matched_columns,
        },
        "invalidRows": parsed.invalid_rows[:200],
    }


def import_masterdata_upload(
    financial_year: str,
    dataset_type: str,
    workbook: UploadFile,
    stored_filename: str,
    stored_path: Path,
    upload_month: str | None = None,
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_dataset = ensure_valid_dataset_type(dataset_type)
    parsed = parse_masterdata_workbook(stored_path, normalized_dataset)
    if parsed.missing_required_columns:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing required columns: "
                + ", ".join(parsed.missing_required_columns)
            ),
        )
    if not parsed.rows:
        raise HTTPException(
            status_code=400,
            detail="No rows matching the expected upload schema were found.",
        )

    upload_table = UPLOAD_TABLE_BY_DATASET[normalized_dataset]
    record_table = RECORD_TABLE_BY_DATASET[normalized_dataset]
    upload_id = str(uuid4())
    uploaded_at = utc_now_iso()
    insert_columns = [
        "upload_id",
        "financial_year",
        "source_sheet",
        "source_row_number",
        "business_key",
        "raw_payload",
        *MASTERDATA_COLUMN_KEYS,
        "updated_by",
        "updated_at",
    ]
    insert_sql = f"""
        insert into {record_table} ({", ".join(insert_columns)})
        values (
          {", ".join(["%s", "%s", "%s", "%s", "%s", "%s::jsonb", *["%s"] * len(MASTERDATA_COLUMN_KEYS), "%s", "%s::timestamptz"])}
        )
    """

    inserted_rows = 0
    invalid_rows = list(parsed.invalid_rows)
    active_upload_id = upload_id
    budget_refresh_rows = 0
    actual_refresh_rows = 0

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            if normalized_dataset != "global_revenue":
                cursor.execute(
                    f"update {upload_table} set is_active = false where financial_year = %s and is_active = true",
                    (financial_year,),
                )
            cursor.execute(
                f"""
                insert into {upload_table} (
                    id,
                    financial_year,
                    upload_month,
                    original_filename,
                    stored_filename,
                    content_type,
                    size_bytes,
                    uploaded_at,
                    imported_rows,
                    parsed_sheets,
                    matched_columns,
                    is_active
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s, %s)
                """,
                (
                    upload_id,
                    financial_year,
                    upload_month,
                    workbook.filename,
                    stored_filename,
                    workbook.content_type or "application/octet-stream",
                    stored_path.stat().st_size,
                    uploaded_at,
                    len(parsed.rows),
                    parsed.parsed_sheets,
                    parsed.matched_columns,
                    normalized_dataset != "global_revenue",
                ),
            )

            if parsed.rows:
                batch: list[list[Any]] = []
                for row in parsed.rows:
                    normalized_values = _hydrate_masterdata_values_from_raw_payload(
                        row.values,
                        row.raw_payload,
                    )
                    validation_errors = validate_masterdata_row(normalized_dataset, normalized_values)
                    if validation_errors:
                        invalid_rows.append(
                            {
                                "sheet": row.sheet_name,
                                "rowNumber": row.row_number,
                                "errors": validation_errors,
                            }
                        )
                        continue
                    business_key = _derive_row_business_key(
                        normalized_dataset,
                        normalized_values,
                        source_sheet=row.sheet_name,
                        source_row_number=row.row_number,
                    )
                    batch.append(
                        [
                            upload_id,
                            financial_year,
                            row.sheet_name,
                            row.row_number,
                            business_key,
                            json.dumps(row.raw_payload),
                            *[
                                normalized_values.get(column_key)
                                for column_key in MASTERDATA_COLUMN_KEYS
                            ],
                            "admin-upload",
                            uploaded_at,
                        ]
                    )
                    if len(batch) >= UPLOAD_INSERT_BATCH_SIZE:
                        cursor.executemany(insert_sql, batch)
                        inserted_rows += len(batch)
                        batch.clear()

                if batch:
                    cursor.executemany(insert_sql, batch)
                    inserted_rows += len(batch)

                if inserted_rows == 0 and invalid_rows:
                    raise HTTPException(
                        status_code=400,
                        detail="Workbook rows failed schema validation. Fix the required values and upload again.",
                    )

                if normalized_dataset == "budget":
                    _sync_budget_upload_into_rapid_revenue(
                        cursor=cursor,
                        financial_year=financial_year,
                        source_upload_id=upload_id,
                        source_filename=workbook.filename or stored_filename,
                        stored_filename=stored_filename,
                        content_type=workbook.content_type or "application/octet-stream",
                        size_bytes=stored_path.stat().st_size,
                        uploaded_at=uploaded_at,
                        parsed_sheets=parsed.parsed_sheets,
                        matched_columns=parsed.matched_columns,
                    )
                    budget_refresh = refresh_budget_data(financial_year, connection)
                    budget_refresh_rows = int(budget_refresh.get("rowsProcessed") or 0)
                elif normalized_dataset == "global_revenue":
                    active_upload_id = _activate_latest_global_revenue_upload(
                        cursor,
                        financial_year,
                    ) or upload_id
                    actual_refresh = refresh_actual_revenue(financial_year, connection)
                    actual_refresh_rows = int(actual_refresh.get("rowsProcessed") or 0)
        connection.commit()

    return {
        "id": upload_id,
        "financialYear": financial_year,
        "uploadMonth": upload_month,
        "originalFilename": workbook.filename,
        "storedFilename": stored_filename,
        "contentType": workbook.content_type or "application/octet-stream",
        "sizeBytes": stored_path.stat().st_size,
        "uploadedAt": uploaded_at,
        "importedRows": inserted_rows,
        "parsedSheets": parsed.parsed_sheets,
        "matchedColumns": parsed.matched_columns,
        "active": upload_id == active_upload_id,
        "activeUploadId": active_upload_id,
        "datasetType": normalized_dataset,
        "invalidRows": len(invalid_rows),
        "skippedRows": 0,
        "budgetRefreshRows": budget_refresh_rows if normalized_dataset == "budget" else None,
        "actualRefreshRows": actual_refresh_rows if normalized_dataset == "global_revenue" else None,
    }


def _sync_budget_upload_into_rapid_revenue(
    cursor: Any,
    financial_year: str,
    source_upload_id: str,
    source_filename: str,
    stored_filename: str,
    content_type: str,
    size_bytes: int,
    uploaded_at: Any,
    parsed_sheets: list[str],
    matched_columns: list[str],
) -> None:
    rapid_upload_id = str(uuid4())
    rapid_columns = ", ".join(RAPID_REVENUE_COLUMN_KEYS)
    cursor.execute(
        """
        update rapid_revenue_uploads
        set is_active = false
        where financial_year = %s and is_active = true
        """,
        (financial_year,),
    )
    cursor.execute(
        """
        insert into rapid_revenue_uploads (
            id,
            financial_year,
            source_dataset_type,
            source_upload_id,
            original_filename,
            stored_filename,
            content_type,
            size_bytes,
            uploaded_at,
            imported_rows,
            parsed_sheets,
            matched_columns,
            is_active
        )
        values (%s, %s, %s, %s::uuid, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s, true)
        """,
        (
            rapid_upload_id,
            financial_year,
            RAPID_REVENUE_SOURCE_BUDGET,
            source_upload_id,
            source_filename,
            stored_filename,
            content_type,
            size_bytes,
            uploaded_at,
            0,
            parsed_sheets,
            matched_columns,
        ),
    )
    cursor.execute(
        f"""
        insert into rapid_revenue_records (
            upload_id,
            financial_year,
            source_sheet,
            source_row_number,
            raw_payload,
            {rapid_columns}
        )
        select
            %s as upload_id,
            b.financial_year,
            b.source_sheet,
            b.source_row_number,
            b.raw_payload,
            {", ".join(f"b.{column}" for column in RAPID_REVENUE_COLUMN_KEYS)}
        from budget_records b
        where b.upload_id = %s
        """,
        (rapid_upload_id, source_upload_id),
    )
    cursor.execute(
        """
        update rapid_revenue_uploads
        set imported_rows = (
            select count(*) from rapid_revenue_records where upload_id = %s
        )
        where id = %s
        """,
        (rapid_upload_id, rapid_upload_id),
    )
    _sync_budget_forecast_baseline(
        cursor,
        rapid_upload_id=rapid_upload_id,
        submitted_at=uploaded_at,
    )


def _sync_budget_forecast_baseline(
    cursor: Any,
    *,
    rapid_upload_id: str,
    submitted_at: Any,
) -> None:
    if not str(rapid_upload_id or "").strip():
        return
    submitted_at_value = submitted_at or utc_now_iso()
    for month_label, month_key in FORECAST_MONTH_KEY_BY_LABEL.items():
        cursor.execute(
            f"""
            select
                r.id as record_id,
                r.upload_id,
                r.financial_year,
                coalesce(r.{month_key}, 0) as budget_value,
                coalesce(nullif(trim(r.billed_currency), ''), 'USD') as billed_currency,
                coalesce(r.forex, 0) as forex
            from rapid_revenue_records r
            where r.upload_id = %s::uuid
            """,
            (rapid_upload_id,),
        )
        rows = cursor.fetchall()
        if not rows:
            continue

        cursor.executemany(
            """
            insert into rapid_forecast_entries (
                id,
                upload_id,
                record_id,
                financial_year,
                forecast_month,
                budget_value,
                forecast_value,
                billed_hours,
                billable_actual_hrs,
                submitted_by_user_id,
                submitted_by_name,
                submitted_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, 0, 0, %s, %s, %s::timestamptz)
            on conflict (record_id, forecast_month)
            do update set
                budget_value = excluded.budget_value,
                forecast_value = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.forecast_value
                    else rapid_forecast_entries.forecast_value
                end,
                billed_hours = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.billed_hours
                    else rapid_forecast_entries.billed_hours
                end,
                billable_actual_hrs = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.billable_actual_hrs
                    else rapid_forecast_entries.billable_actual_hrs
                end,
                submitted_by_user_id = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.submitted_by_user_id
                    else rapid_forecast_entries.submitted_by_user_id
                end,
                submitted_by_name = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.submitted_by_name
                    else rapid_forecast_entries.submitted_by_name
                end,
                submitted_at = case
                    when rapid_forecast_entries.submitted_by_user_id = 'budget-sync'
                    then excluded.submitted_at
                    else rapid_forecast_entries.submitted_at
                end
            """,
            [
                (
                    str(uuid4()),
                    row.get("upload_id"),
                    row.get("record_id"),
                    str(row.get("financial_year") or ""),
                    month_label,
                    _parse_optional_decimal(row.get("budget_value")) or Decimal("0"),
                    _convert_budget_value_to_forecast_usd(
                        row.get("budget_value"),
                        row.get("billed_currency"),
                        row.get("forex"),
                    ),
                    "budget-sync",
                    "Budget Upload Baseline",
                    submitted_at_value,
                )
                for row in rows
            ],
        )


def _normalize_rapid_revenue_source(value: Any) -> str:
    return str(value or "").strip().lower()


def _select_active_budget_upload(cursor: Any, financial_year: str) -> dict[str, Any] | None:
    cursor.execute(
        """
        select
            id::text as id,
            financial_year,
            original_filename,
            stored_filename,
            content_type,
            size_bytes,
            uploaded_at,
            parsed_sheets,
            matched_columns
        from budget_uploads
        where financial_year = %s and is_active = true
        order by uploaded_at desc
        limit 1
        """,
        (financial_year,),
    )
    return cursor.fetchone()


def _select_active_rapid_revenue_upload(
    cursor: Any,
    financial_year: str,
) -> dict[str, Any] | None:
    cursor.execute(
        """
        select
            u.id::text as id,
            u.financial_year,
            u.source_dataset_type,
            u.source_upload_id::text as source_upload_id,
            u.original_filename,
            u.stored_filename,
            u.content_type,
            u.size_bytes,
            u.uploaded_at,
            u.parsed_sheets,
            u.matched_columns,
            (
                select count(*)
                from rapid_revenue_records r
                where r.upload_id = u.id
            ) as record_count
        from rapid_revenue_uploads u
        where u.financial_year = %s and u.is_active = true
        order by u.uploaded_at desc
        limit 1
        """,
        (financial_year,),
    )
    return cursor.fetchone()


def _reactivate_latest_manual_rapid_upload(cursor: Any, financial_year: str) -> None:
    cursor.execute(
        """
        with next_active as (
            select id
            from rapid_revenue_uploads
            where financial_year = %s
              and coalesce(lower(source_dataset_type), '') = %s
            order by uploaded_at desc
            limit 1
        )
        update rapid_revenue_uploads
        set is_active = true
        where id in (select id from next_active)
        """,
        (financial_year, RAPID_REVENUE_SOURCE_UPLOAD),
    )


def reconcile_budget_sync_to_rapid_revenue(
    cursor: Any,
    financial_year: str,
) -> int:
    budget_upload = _select_active_budget_upload(cursor, financial_year)
    rapid_upload = _select_active_rapid_revenue_upload(cursor, financial_year)

    if not budget_upload:
        if rapid_upload and _normalize_rapid_revenue_source(
            rapid_upload.get("source_dataset_type")
        ) != RAPID_REVENUE_SOURCE_UPLOAD:
            cursor.execute(
                "delete from rapid_revenue_uploads where id = %s::uuid",
                (str(rapid_upload.get("id") or ""),),
            )
            _reactivate_latest_manual_rapid_upload(cursor, financial_year)
            return 1
        return 0

    budget_upload_id = str(budget_upload.get("id") or "")
    if not budget_upload_id:
        return 0

    if rapid_upload:
        source_type = _normalize_rapid_revenue_source(rapid_upload.get("source_dataset_type"))
        linked_upload_id = str(rapid_upload.get("source_upload_id") or "")
        record_count = int(rapid_upload.get("record_count") or 0)
        same_file = (
            str(rapid_upload.get("stored_filename") or "")
            == str(budget_upload.get("stored_filename") or "")
        )

        if source_type == RAPID_REVENUE_SOURCE_UPLOAD and record_count > 0:
            return 0

        if (
            source_type == RAPID_REVENUE_SOURCE_BUDGET
            and linked_upload_id == budget_upload_id
            and record_count > 0
        ):
            _sync_budget_forecast_baseline(
                cursor,
                rapid_upload_id=str(rapid_upload.get("id") or ""),
                submitted_at=budget_upload.get("uploaded_at"),
            )
            return 0

        if not source_type and same_file and record_count > 0:
            cursor.execute(
                """
                update rapid_revenue_uploads
                set source_dataset_type = %s,
                    source_upload_id = %s::uuid
                where id = %s::uuid
                """,
                (
                    RAPID_REVENUE_SOURCE_BUDGET,
                    budget_upload_id,
                    str(rapid_upload.get("id") or ""),
                ),
            )
            _sync_budget_forecast_baseline(
                cursor,
                rapid_upload_id=str(rapid_upload.get("id") or ""),
                submitted_at=budget_upload.get("uploaded_at"),
            )
            return 0

    _sync_budget_upload_into_rapid_revenue(
        cursor=cursor,
        financial_year=financial_year,
        source_upload_id=budget_upload_id,
        source_filename=str(
            budget_upload.get("original_filename")
            or budget_upload.get("stored_filename")
            or "budget-upload.xlsx"
        ),
        stored_filename=str(budget_upload.get("stored_filename") or ""),
        content_type=str(
            budget_upload.get("content_type") or "application/octet-stream"
        ),
        size_bytes=int(budget_upload.get("size_bytes") or 0),
        uploaded_at=budget_upload.get("uploaded_at"),
        parsed_sheets=list(budget_upload.get("parsed_sheets") or []),
        matched_columns=list(budget_upload.get("matched_columns") or []),
    )
    return 1


def _backfill_budget_attribute_fields(
    cursor: Any,
    financial_year: str,
) -> None:
    text_params = [financial_year, financial_year]
    cursor.execute(
        """
        update budget_records b
        set
          customer_name = coalesce(
            nullif(trim(b.customer_name), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'Customer Name',
                  b.raw_payload->>'Customer name',
                  b.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          updated_customer = coalesce(
            nullif(trim(b.updated_customer), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'Updated Customer',
                  b.raw_payload->>'Updated Customer Name',
                  b.raw_payload->>'Customer Name',
                  b.raw_payload->>'Customer name',
                  b.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          client_name = coalesce(
            nullif(trim(b.client_name), ''),
            nullif(trim(b.updated_customer), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'Updated Customer',
                  b.raw_payload->>'Updated Customer Name',
                  b.raw_payload->>'Customer Name',
                  b.raw_payload->>'Customer name',
                  b.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          resource_id = coalesce(
            nullif(trim(b.resource_id), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'Emp ID',
                  b.raw_payload->>'Resource ID',
                  b.raw_payload->>'Employee ID',
                  b.raw_payload->>'Employee Id'
                )
              ),
              ''
            )
          ),
          resource_name = coalesce(
            nullif(trim(b.resource_name), ''),
            nullif(trim(b.raw_payload->>'Resource Name'), '')
          ),
          project_name = coalesce(
            nullif(trim(b.project_name), ''),
            nullif(trim(coalesce(b.raw_payload->>'Project Name', b.raw_payload->>'Project')), '')
          ),
          ms_ps = coalesce(
            nullif(trim(b.ms_ps), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'MS/PS',
                  b.raw_payload->>'PS/MS',
                  b.raw_payload->>'PS/MS budget',
                  b.raw_payload->>'MS/PS budget'
                )
              ),
              ''
            )
          ),
          entity = coalesce(
            nullif(trim(b.entity), ''),
            nullif(trim(coalesce(b.raw_payload->>'Entity', b.raw_payload->>'Company')), '')
          ),
          gr_entity = coalesce(
            nullif(trim(b.gr_entity), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'GR Entity',
                  b.raw_payload->>'Entity As per GR',
                  b.raw_payload->>'Group company',
                  b.raw_payload->>'Group Company'
                )
              ),
              ''
            )
          ),
          row_us = coalesce(
            nullif(trim(b.row_us), ''),
            nullif(
              trim(
                coalesce(
                  b.raw_payload->>'ROW/US',
                  b.raw_payload->>'Region',
                  b.raw_payload->>'Region summary',
                  b.raw_payload->>'Region Summary'
                )
              ),
              ''
            )
          ),
          strategic_account = coalesce(
            nullif(trim(b.strategic_account), ''),
            nullif(trim(b.raw_payload->>'Strategic Account'), '')
          ),
          deal_type = coalesce(
            nullif(trim(b.deal_type), ''),
            nullif(trim(coalesce(b.raw_payload->>'Deal Type', b.raw_payload->>'Revenue type', b.raw_payload->>'Revenue Type')), '')
          ),
          eeennn = coalesce(
            nullif(trim(b.eeennn), ''),
            nullif(trim(coalesce(b.raw_payload->>'EEENNN', b.raw_payload->>'EENNN')), '')
          ),
          ocn_number = coalesce(
            nullif(trim(b.ocn_number), ''),
            nullif(trim(coalesce(b.raw_payload->>'OCN Number', b.raw_payload->>'OCN', b.raw_payload->>'OCN No', b.raw_payload->>'OCN_NUMBER')), '')
          ),
          practice_head = coalesce(
            nullif(trim(b.practice_head), ''),
            nullif(trim(b.raw_payload->>'Practice Head'), '')
          ),
          bdm = coalesce(
            nullif(trim(b.bdm), ''),
            nullif(trim(b.raw_payload->>'BDM'), '')
          ),
          geo_head = coalesce(
            nullif(trim(b.geo_head), ''),
            nullif(trim(coalesce(b.raw_payload->>'Geo Head', b.raw_payload->>'GeoHead', b.raw_payload->>'Geo head')), '')
          ),
          vertical = coalesce(
            nullif(trim(b.vertical), ''),
            nullif(trim(b.raw_payload->>'Vertical'), '')
          ),
          horizontal = coalesce(
            nullif(trim(b.horizontal), ''),
            nullif(trim(b.raw_payload->>'Horizontal'), '')
          ),
          rate_type = coalesce(
            nullif(trim(b.rate_type), ''),
            nullif(trim(coalesce(b.raw_payload->>'Rate Type', b.raw_payload->>'RateType')), '')
          ),
          billed_currency = coalesce(
            nullif(trim(b.billed_currency), ''),
            nullif(trim(coalesce(b.raw_payload->>'Billed currency', b.raw_payload->>'Billed Currency', b.raw_payload->>'Currency')), ''),
            'USD'
          ),
          type_of_projects = coalesce(
            nullif(trim(b.type_of_projects), ''),
            nullif(trim(coalesce(b.raw_payload->>'Type of Projects', b.raw_payload->>'Type of Project')), '')
          ),
          forex = case
            when coalesce(b.forex, 0) > 0 then b.forex
            when upper(
              coalesce(
                nullif(trim(b.billed_currency), ''),
                nullif(trim(coalesce(b.raw_payload->>'Billed currency', b.raw_payload->>'Billed Currency', b.raw_payload->>'Currency')), ''),
                'USD'
              )
            ) = 'USD' then 1
            else b.forex
          end
        where b.financial_year = %s
          and exists (
            select 1
            from budget_uploads u
            where u.id = b.upload_id
              and u.is_active = true
              and u.financial_year = %s
          )
          and (
            coalesce(trim(b.customer_name), '') = ''
            or coalesce(trim(b.updated_customer), '') = ''
            or coalesce(trim(b.client_name), '') = ''
            or coalesce(trim(b.resource_id), '') = ''
            or coalesce(trim(b.resource_name), '') = ''
            or coalesce(trim(b.project_name), '') = ''
            or coalesce(trim(b.ms_ps), '') = ''
            or coalesce(trim(b.entity), '') = ''
            or coalesce(trim(b.gr_entity), '') = ''
            or coalesce(trim(b.row_us), '') = ''
            or coalesce(trim(b.strategic_account), '') = ''
            or coalesce(trim(b.deal_type), '') = ''
            or coalesce(trim(b.eeennn), '') = ''
            or coalesce(trim(b.ocn_number), '') = ''
            or coalesce(trim(b.practice_head), '') = ''
            or coalesce(trim(b.bdm), '') = ''
            or coalesce(trim(b.geo_head), '') = ''
            or coalesce(trim(b.vertical), '') = ''
            or coalesce(trim(b.horizontal), '') = ''
            or coalesce(trim(b.rate_type), '') = ''
            or coalesce(trim(b.billed_currency), '') = ''
            or coalesce(trim(b.type_of_projects), '') = ''
            or coalesce(b.forex, 0) <= 0
          )
        """,
        text_params,
    )
    cursor.execute(
        """
        update rapid_revenue_records r
        set
          customer_name = coalesce(
            nullif(trim(r.customer_name), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'Customer Name',
                  r.raw_payload->>'Customer name',
                  r.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          updated_customer = coalesce(
            nullif(trim(r.updated_customer), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'Updated Customer',
                  r.raw_payload->>'Updated Customer Name',
                  r.raw_payload->>'Customer Name',
                  r.raw_payload->>'Customer name',
                  r.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          client_name = coalesce(
            nullif(trim(r.client_name), ''),
            nullif(trim(r.updated_customer), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'Updated Customer',
                  r.raw_payload->>'Updated Customer Name',
                  r.raw_payload->>'Customer Name',
                  r.raw_payload->>'Customer name',
                  r.raw_payload->>'Customer'
                )
              ),
              ''
            )
          ),
          resource_id = coalesce(
            nullif(trim(r.resource_id), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'Emp ID',
                  r.raw_payload->>'Resource ID',
                  r.raw_payload->>'Employee ID',
                  r.raw_payload->>'Employee Id'
                )
              ),
              ''
            )
          ),
          resource_name = coalesce(
            nullif(trim(r.resource_name), ''),
            nullif(trim(r.raw_payload->>'Resource Name'), '')
          ),
          project_name = coalesce(
            nullif(trim(r.project_name), ''),
            nullif(trim(coalesce(r.raw_payload->>'Project Name', r.raw_payload->>'Project')), '')
          ),
          ms_ps = coalesce(
            nullif(trim(r.ms_ps), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'MS/PS',
                  r.raw_payload->>'PS/MS',
                  r.raw_payload->>'PS/MS budget',
                  r.raw_payload->>'MS/PS budget'
                )
              ),
              ''
            )
          ),
          entity = coalesce(
            nullif(trim(r.entity), ''),
            nullif(trim(coalesce(r.raw_payload->>'Entity', r.raw_payload->>'Company')), '')
          ),
          gr_entity = coalesce(
            nullif(trim(r.gr_entity), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'GR Entity',
                  r.raw_payload->>'Entity As per GR',
                  r.raw_payload->>'Group company',
                  r.raw_payload->>'Group Company'
                )
              ),
              ''
            )
          ),
          row_us = coalesce(
            nullif(trim(r.row_us), ''),
            nullif(
              trim(
                coalesce(
                  r.raw_payload->>'ROW/US',
                  r.raw_payload->>'Region',
                  r.raw_payload->>'Region summary',
                  r.raw_payload->>'Region Summary'
                )
              ),
              ''
            )
          ),
          strategic_account = coalesce(
            nullif(trim(r.strategic_account), ''),
            nullif(trim(r.raw_payload->>'Strategic Account'), '')
          ),
          deal_type = coalesce(
            nullif(trim(r.deal_type), ''),
            nullif(trim(coalesce(r.raw_payload->>'Deal Type', r.raw_payload->>'Revenue type', r.raw_payload->>'Revenue Type')), '')
          ),
          eeennn = coalesce(
            nullif(trim(r.eeennn), ''),
            nullif(trim(coalesce(r.raw_payload->>'EEENNN', r.raw_payload->>'EENNN')), '')
          ),
          ocn_number = coalesce(
            nullif(trim(r.ocn_number), ''),
            nullif(trim(coalesce(r.raw_payload->>'OCN Number', r.raw_payload->>'OCN', r.raw_payload->>'OCN No', r.raw_payload->>'OCN_NUMBER')), '')
          ),
          practice_head = coalesce(
            nullif(trim(r.practice_head), ''),
            nullif(trim(r.raw_payload->>'Practice Head'), '')
          ),
          bdm = coalesce(
            nullif(trim(r.bdm), ''),
            nullif(trim(r.raw_payload->>'BDM'), '')
          ),
          geo_head = coalesce(
            nullif(trim(r.geo_head), ''),
            nullif(trim(coalesce(r.raw_payload->>'Geo Head', r.raw_payload->>'GeoHead', r.raw_payload->>'Geo head')), '')
          ),
          vertical = coalesce(
            nullif(trim(r.vertical), ''),
            nullif(trim(r.raw_payload->>'Vertical'), '')
          ),
          horizontal = coalesce(
            nullif(trim(r.horizontal), ''),
            nullif(trim(r.raw_payload->>'Horizontal'), '')
          ),
          rate_type = coalesce(
            nullif(trim(r.rate_type), ''),
            nullif(trim(coalesce(r.raw_payload->>'Rate Type', r.raw_payload->>'RateType')), '')
          ),
          billed_currency = coalesce(
            nullif(trim(r.billed_currency), ''),
            nullif(trim(coalesce(r.raw_payload->>'Billed currency', r.raw_payload->>'Billed Currency', r.raw_payload->>'Currency')), ''),
            'USD'
          ),
          type_of_projects = coalesce(
            nullif(trim(r.type_of_projects), ''),
            nullif(trim(coalesce(r.raw_payload->>'Type of Projects', r.raw_payload->>'Type of Project')), '')
          ),
          forex = case
            when coalesce(r.forex, 0) > 0 then r.forex
            when upper(
              coalesce(
                nullif(trim(r.billed_currency), ''),
                nullif(trim(coalesce(r.raw_payload->>'Billed currency', r.raw_payload->>'Billed Currency', r.raw_payload->>'Currency')), ''),
                'USD'
              )
            ) = 'USD' then 1
            else r.forex
          end
        where r.financial_year = %s
          and exists (
            select 1
            from rapid_revenue_uploads u
            where u.id = r.upload_id
              and u.is_active = true
              and u.financial_year = %s
          )
          and (
            coalesce(trim(r.customer_name), '') = ''
            or coalesce(trim(r.updated_customer), '') = ''
            or coalesce(trim(r.client_name), '') = ''
            or coalesce(trim(r.resource_id), '') = ''
            or coalesce(trim(r.resource_name), '') = ''
            or coalesce(trim(r.project_name), '') = ''
            or coalesce(trim(r.ms_ps), '') = ''
            or coalesce(trim(r.entity), '') = ''
            or coalesce(trim(r.gr_entity), '') = ''
            or coalesce(trim(r.row_us), '') = ''
            or coalesce(trim(r.strategic_account), '') = ''
            or coalesce(trim(r.deal_type), '') = ''
            or coalesce(trim(r.eeennn), '') = ''
            or coalesce(trim(r.ocn_number), '') = ''
            or coalesce(trim(r.practice_head), '') = ''
            or coalesce(trim(r.bdm), '') = ''
            or coalesce(trim(r.geo_head), '') = ''
            or coalesce(trim(r.vertical), '') = ''
            or coalesce(trim(r.horizontal), '') = ''
            or coalesce(trim(r.rate_type), '') = ''
            or coalesce(trim(r.billed_currency), '') = ''
            or coalesce(trim(r.type_of_projects), '') = ''
            or coalesce(r.forex, 0) <= 0
          )
        """,
        text_params,
    )


def ensure_budget_sync_to_rapid_revenue(
    financial_year: str | None = None,
    connection: Any | None = None,
) -> int:
    ensure_postgres_schema()
    normalized_year = str(financial_year or "").strip()

    def _run(active_connection: Any) -> int:
        synced_uploads = 0
        with active_connection.cursor() as cursor:
            if normalized_year:
                cursor.execute(
                    """
                    select
                        financial_year
                    from (
                        select financial_year
                        from budget_uploads
                        where is_active = true and financial_year = %s
                        union
                        select financial_year
                        from rapid_revenue_uploads
                        where is_active = true
                          and financial_year = %s
                          and coalesce(lower(source_dataset_type), %s) = %s
                    ) years
                    """,
                    (
                        normalized_year,
                        normalized_year,
                        RAPID_REVENUE_SOURCE_BUDGET,
                        RAPID_REVENUE_SOURCE_BUDGET,
                    ),
                )
            else:
                cursor.execute(
                    """
                    select distinct financial_year
                    from (
                        select financial_year
                        from budget_uploads
                        where is_active = true
                        union
                        select financial_year
                        from rapid_revenue_uploads
                        where is_active = true
                          and coalesce(lower(source_dataset_type), %s) = %s
                    ) years
                    where coalesce(financial_year, '') <> ''
                    """,
                    (
                        RAPID_REVENUE_SOURCE_BUDGET,
                        RAPID_REVENUE_SOURCE_BUDGET,
                    ),
                )
            years = [str(row.get("financial_year") or "").strip() for row in cursor.fetchall()]

            for budget_year in years:
                if not budget_year:
                    continue
                cursor.execute(
                    "select pg_try_advisory_xact_lock(%s, hashtext(%s)) as locked",
                    (BUDGET_SYNC_LOCK_NAMESPACE, budget_year),
                )
                lock_row = cursor.fetchone() or {}
                if not bool(lock_row.get("locked")):
                    # Another request is already syncing this year; avoid concurrent writes/deadlocks.
                    continue
                synced_uploads += reconcile_budget_sync_to_rapid_revenue(
                    cursor,
                    budget_year,
                )
                _backfill_budget_attribute_fields(cursor, budget_year)

        return synced_uploads

    if connection is not None:
        return _run(connection)

    with open_database_connection(require=True) as managed_connection:
        assert managed_connection is not None
        synced_uploads = _run(managed_connection)
        managed_connection.commit()
        return synced_uploads


def _select_active_upload_summary(
    cursor: Any,
    upload_table: str,
    financial_year: str | None,
) -> dict[str, Any] | None:
    where_sql = "where is_active = true"
    filter_params: list[Any] = []
    normalized_year = str(financial_year or "").strip()
    if normalized_year:
        where_sql += " and financial_year = %s"
        params.append(normalized_year)

    order_sql = "uploaded_at desc"
    if upload_table == "global_revenue_uploads":
        order_sql = f"{_global_revenue_month_rank_sql('upload_month')} desc, uploaded_at desc"

    cursor.execute(
        f"""
        select
            id::text as id,
            financial_year,
            upload_month,
            original_filename,
            stored_filename,
            uploaded_at,
            imported_rows
        from {upload_table}
        {where_sql}
        order by {order_sql}
        limit 1
        """,
        params,
    )
    row = cursor.fetchone()
    if not row:
        return None

    return {
        "id": str(row.get("id") or ""),
        "financialYear": str(row.get("financial_year") or "") or None,
        "uploadMonth": str(row.get("upload_month") or "") or None,
        "originalFilename": str(row.get("original_filename") or ""),
        "storedFilename": str(row.get("stored_filename") or ""),
        "uploadedAt": _serialize_timestamp(row.get("uploaded_at")),
        "importedRows": int(row.get("imported_rows") or 0),
    }


def _serialize_dynamic_view_row(
    row: dict[str, Any],
    field_specs: tuple[MasterdataFieldSpec, ...],
    financial_year_key: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for field in field_specs:
        value = row.get(field.key)
        if field.kind == "numeric":
            payload[field.key] = _to_float(value)
        elif field.kind == "date":
            payload[field.key] = _serialize_date(value)
        else:
            payload[field.key] = str(value or "")
    payload["financialYear"] = str(row.get(financial_year_key) or "")
    return payload


def _get_actual_revenue_view_rows(
    cursor: Any,
    financial_year: str | None,
    limit: int,
    allowed_bdms: list[str] | None,
    allowed_practice_heads: list[str] | None,
    allowed_geo_heads: list[str] | None,
    allowed_entities: list[str] | None,
    allowed_verticals: list[str] | None,
    active_upload: dict[str, Any] | None,
) -> dict[str, Any]:
    where_sql = "where 1 = 1"
    filter_params: list[Any] = []
    normalized_year = str(financial_year or "").strip()
    if normalized_year:
        where_sql += " and fy_year = %s"
        params.append(normalized_year)

    normalized_bdms = [
        str(value).strip().lower()
        for value in (allowed_bdms or [])
        if str(value).strip()
    ]
    normalized_practice_heads = [
        str(value).strip().lower()
        for value in (allowed_practice_heads or [])
        if str(value).strip()
    ]
    normalized_geo_heads = [
        str(value).strip().lower()
        for value in (allowed_geo_heads or [])
        if str(value).strip()
    ]
    normalized_entities = [
        str(value).strip().lower()
        for value in (allowed_entities or [])
        if str(value).strip()
    ]
    normalized_verticals = [
        str(value).strip().lower()
        for value in (allowed_verticals or [])
        if str(value).strip()
    ]

    if normalized_bdms:
        where_sql += " and lower(coalesce(bdm, '')) = any(%s)"
        params.append(normalized_bdms)
    if normalized_practice_heads:
        where_sql += " and lower(coalesce(practice_head, '')) = any(%s)"
        params.append(normalized_practice_heads)
    if normalized_geo_heads:
        where_sql += " and lower(coalesce(geo_head, '')) = any(%s)"
        params.append(normalized_geo_heads)
    if normalized_entities:
        where_sql += " and lower(coalesce(company, '')) = any(%s)"
        params.append(normalized_entities)
    if normalized_verticals:
        where_sql += " and lower(coalesce(vertical, '')) = any(%s)"
        params.append(normalized_verticals)

    cursor.execute(
        f"""
        select count(*) as row_count
        from actual_revenue
        {where_sql}
        """,
        params,
    )
    count_row = cursor.fetchone() or {}
    row_count = int(count_row.get("row_count") or 0)

    order_month_sql = ", ".join(f"'{month}'" for month in ACTUAL_REVENUE_MONTH_ORDER)
    data_params = [*params, max(1, min(limit, 100000))]
    cursor.execute(
        f"""
        select
            fy_year,
            {", ".join(field.key for field in ACTUAL_REVENUE_VIEW_FIELD_SPECS)}
        from actual_revenue
        {where_sql}
        order by
            year asc nulls last,
            array_position(array[{order_month_sql}], month) asc nulls last,
            id asc
        limit %s
        """,
        data_params,
    )
    rows = cursor.fetchall()

    return {
        "datasetType": "global_revenue",
        "columns": [
            {
                "key": field.key,
                "label": field.label,
                "kind": field.kind,
            }
            for field in ACTUAL_REVENUE_VIEW_FIELD_SPECS
        ],
        "rows": [
            _serialize_dynamic_view_row(
                row,
                ACTUAL_REVENUE_VIEW_FIELD_SPECS,
                financial_year_key="fy_year",
            )
            for row in rows
        ],
        "summary": {
            "rowCount": row_count,
            "financialYear": normalized_year or active_upload.get("financialYear") if active_upload else None,
            "activeUpload": active_upload,
        },
    }


def get_masterdata_rows(
    dataset_type: str,
    financial_year: str | None = None,
    limit: int = 500,
    allowed_bdms: list[str] | None = None,
    allowed_practice_heads: list[str] | None = None,
    allowed_geo_heads: list[str] | None = None,
    allowed_entities: list[str] | None = None,
    allowed_verticals: list[str] | None = None,
    include_metadata: bool = True,
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_dataset = ensure_valid_dataset_type(dataset_type)
    upload_table = UPLOAD_TABLE_BY_DATASET[normalized_dataset]
    record_table = RECORD_TABLE_BY_DATASET[normalized_dataset]
    normalized_year = str(financial_year or "").strip() or None

    where_sql = "where u.is_active = true"
    params: list[Any] = []
    normalized_bdms = [
        str(value).strip().lower()
        for value in (allowed_bdms or [])
        if str(value).strip()
    ]
    normalized_practice_heads = [
        str(value).strip().lower()
        for value in (allowed_practice_heads or [])
        if str(value).strip()
    ]
    normalized_geo_heads = [
        str(value).strip().lower()
        for value in (allowed_geo_heads or [])
        if str(value).strip()
    ]
    normalized_entities = [
        str(value).strip().lower()
        for value in (allowed_entities or [])
        if str(value).strip()
    ]
    normalized_verticals = [
        str(value).strip().lower()
        for value in (allowed_verticals or [])
        if str(value).strip()
    ]
    if normalized_year:
        where_sql += " and r.financial_year = %s"
        filter_params.append(normalized_year)
    if normalized_bdms:
        where_sql += " and lower(coalesce(r.bdm, '')) = any(%s)"
        filter_params.append(normalized_bdms)
    if normalized_practice_heads:
        where_sql += " and lower(coalesce(r.practice_head, '')) = any(%s)"
        filter_params.append(normalized_practice_heads)
    if normalized_geo_heads:
        where_sql += " and lower(coalesce(r.geo_head, '')) = any(%s)"
        filter_params.append(normalized_geo_heads)
    if normalized_entities:
        where_sql += " and lower(coalesce(r.entity, '')) = any(%s)"
        filter_params.append(normalized_entities)
    if normalized_verticals:
        where_sql += " and lower(coalesce(r.vertical, '')) = any(%s)"
        filter_params.append(normalized_verticals)
    data_limit = max(1, min(limit, 100000))

    select_columns = (
        [
            "r.id",
            "r.financial_year",
            "r.source_sheet",
            "r.source_row_number",
            "r.business_key",
            "r.updated_at",
            "r.updated_by",
            *[f"r.{field.key}" for field in MASTERDATA_FIELD_SPECS],
        ]
        if include_metadata
        else ["r.financial_year", *[f"r.{field.key}" for field in MASTERDATA_FIELD_SPECS]]
    )

    sql = f"""
        select {", ".join(select_columns)}
        from {record_table} r
        join {upload_table} u on u.id = r.upload_id
        {where_sql}
        order by r.id asc
        limit %s
    """
    count_sql = f"""
        select count(*) as row_count
        from {record_table} r
        join {upload_table} u on u.id = r.upload_id
        {where_sql}
    """

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            active_upload = _select_active_upload_summary(
                cursor,
                upload_table,
                normalized_year,
            )
            if normalized_dataset == "global_revenue":
                actual_revenue_payload = _get_actual_revenue_view_rows(
                    cursor=cursor,
                    financial_year=normalized_year,
                    limit=limit,
                    allowed_bdms=allowed_bdms,
                    allowed_practice_heads=allowed_practice_heads,
                    allowed_geo_heads=allowed_geo_heads,
                    allowed_entities=allowed_entities,
                    allowed_verticals=allowed_verticals,
                    active_upload=active_upload,
                )
                if actual_revenue_payload["rows"] or active_upload:
                    return actual_revenue_payload

            cursor.execute(count_sql, filter_params)
            count_row = cursor.fetchone() or {}
            row_count = int(count_row.get("row_count") or 0)

            cursor.execute(sql, [*filter_params, data_limit])
            rows = cursor.fetchall()

    serialized_rows = [
        _serialize_grid_row(row) if include_metadata else _serialize_viewer_row(row)
        for row in rows
    ]
    return {
        "datasetType": normalized_dataset,
        "columns": [
            {
                "key": field.key,
                "label": field.label,
                "kind": field.kind,
            }
            for field in MASTERDATA_FIELD_SPECS
        ],
        "rows": serialized_rows,
        "summary": {
            "rowCount": row_count,
            "financialYear": normalized_year or (active_upload or {}).get("financialYear"),
            "activeUpload": active_upload,
        },
    }


def save_masterdata_grid_changes(
    dataset_type: str,
    financial_year: str,
    rows: list[dict[str, Any]],
    deleted_ids: list[int] | None = None,
    updated_by: str = "manual-editor",
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_dataset = ensure_valid_dataset_type(dataset_type)
    upload_table = UPLOAD_TABLE_BY_DATASET[normalized_dataset]
    record_table = RECORD_TABLE_BY_DATASET[normalized_dataset]
    deleted_ids = deleted_ids or []

    active_upload_id = _ensure_active_upload(upload_table, financial_year, normalized_dataset)
    now_iso = utc_now_iso()

    invalid_rows: list[dict[str, Any]] = []
    insert_rows: list[list[Any]] = []
    update_rows: list[list[Any]] = []

    for row in rows:
        values = {
            key: row.get(key)
            for key in MASTERDATA_COLUMN_KEYS
        }
        errors = validate_masterdata_row(normalized_dataset, values)
        if errors:
            invalid_rows.append(
                {
                    "rowId": row.get("id"),
                    "errors": errors,
                }
            )
            continue

        source_sheet = str(row.get("sourceSheet") or "grid")
        source_row_number = _to_int(row.get("sourceRowNumber"))
        raw_payload = json.dumps(_serialize_public_row(values))
        row_id = _to_int(row.get("id"), default=0)

        if row_id > 0:
            update_rows.append(
                [
                    active_upload_id,
                    source_sheet,
                    source_row_number,
                    raw_payload,
                    *[values.get(column_key) for column_key in MASTERDATA_COLUMN_KEYS],
                    updated_by,
                    now_iso,
                    row_id,
                    financial_year,
                ]
            )
            continue

        business_key = _derive_row_business_key(
            normalized_dataset,
            values,
            source_sheet=source_sheet,
            source_row_number=source_row_number,
        )
        insert_rows.append(
            [
                active_upload_id,
                financial_year,
                source_sheet,
                source_row_number,
                business_key,
                raw_payload,
                *[values.get(column_key) for column_key in MASTERDATA_COLUMN_KEYS],
                updated_by,
                now_iso,
            ]
        )

    insert_columns = [
        "upload_id",
        "financial_year",
        "source_sheet",
        "source_row_number",
        "business_key",
        "raw_payload",
        *MASTERDATA_COLUMN_KEYS,
        "updated_by",
        "updated_at",
    ]
    insert_sql = f"""
        insert into {record_table} ({", ".join(insert_columns)})
        values (
          {", ".join(["%s", "%s", "%s", "%s", "%s", "%s::jsonb", *["%s"] * len(MASTERDATA_COLUMN_KEYS), "%s", "%s::timestamptz"])}
        )
    """
    update_sql = f"""
        update {record_table}
        set
          upload_id = %s,
          source_sheet = %s,
          source_row_number = %s,
          raw_payload = %s::jsonb,
          {", ".join(f"{column} = %s" for column in MASTERDATA_COLUMN_KEYS)},
          updated_by = %s,
          updated_at = %s::timestamptz
        where id = %s and financial_year = %s
    """

    deleted_count = 0
    inserted_count = 0
    updated_count = 0
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            if deleted_ids:
                cursor.execute(
                    f"""
                    delete from {record_table}
                    where id = any(%s) and financial_year = %s
                    """,
                    (deleted_ids, financial_year),
                )
                deleted_count = int(cursor.rowcount or 0)

            if insert_rows:
                cursor.executemany(insert_sql, insert_rows)
                inserted_count = len(insert_rows)

            for payload in update_rows:
                cursor.execute(update_sql, payload)
                updated_count += int(cursor.rowcount or 0)

            cursor.execute(
                f"""
                update {upload_table}
                set imported_rows = (
                    select count(*) from {record_table} where upload_id = %s
                )
                where id = %s
                """,
                (active_upload_id, active_upload_id),
            )
        connection.commit()

    return {
        "datasetType": normalized_dataset,
        "financialYear": financial_year,
        "insertedOrUpdated": inserted_count + updated_count,
        "inserted": inserted_count,
        "updated": updated_count,
        "deleted": deleted_count,
        "skippedInvalid": len(invalid_rows),
        "invalidRows": invalid_rows[:200],
        "savedAt": now_iso,
    }


def export_masterdata_records(
    dataset_type: str,
    financial_year: str | None = None,
    allowed_bdms: list[str] | None = None,
    allowed_practice_heads: list[str] | None = None,
    allowed_geo_heads: list[str] | None = None,
    allowed_entities: list[str] | None = None,
    allowed_verticals: list[str] | None = None,
    generated_by: str | None = None,
) -> tuple[str, bytes]:
    payload = get_masterdata_rows(
        dataset_type=dataset_type,
        financial_year=financial_year,
        limit=50000,
        allowed_bdms=allowed_bdms,
        allowed_practice_heads=allowed_practice_heads,
        allowed_geo_heads=allowed_geo_heads,
        allowed_entities=allowed_entities,
        allowed_verticals=allowed_verticals,
        include_metadata=False,
    )
    rows = payload["rows"]
    columns = payload["columns"]

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "MasterData"
    worksheet.append([column["label"] for column in columns])

    for row in rows:
        worksheet.append(
            [
                sanitize_export_cell(row.get(column["key"]))
                for column in columns
            ]
        )

    metadata = workbook.create_sheet("Export Metadata")
    metadata.append(["generated_by", sanitize_export_cell(generated_by or "system")])
    metadata.append(["generated_at", utc_now_iso()])
    metadata.append(["dataset_type", payload["datasetType"]])
    metadata.append(["financial_year", financial_year or "active"])
    metadata.append(["row_count", len(rows)])

    output = io.BytesIO()
    workbook.save(output)
    filename = f"{payload['datasetType']}-masterdata-{financial_year or 'active'}.xlsx"
    return filename, output.getvalue()


def _ensure_active_upload(
    upload_table: str,
    financial_year: str,
    dataset_type: DatasetType,
) -> str:
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select id::text as id
                from {upload_table}
                where financial_year = %s and is_active = true
                order by uploaded_at desc
                limit 1
                """,
                (financial_year,),
            )
            row = cursor.fetchone()
            if row and row.get("id"):
                return str(row["id"])

            upload_id = str(uuid4())
            now_iso = utc_now_iso()
            cursor.execute(
                f"""
                insert into {upload_table} (
                    id,
                    financial_year,
                    original_filename,
                    stored_filename,
                    content_type,
                    size_bytes,
                    uploaded_at,
                    imported_rows,
                    parsed_sheets,
                    matched_columns,
                    is_active
                )
                values (%s, %s, %s, %s, %s, %s, %s::timestamptz, 0, %s, %s, true)
                """,
                (
                    upload_id,
                    financial_year,
                    f"{dataset_type}-manual-grid",
                    f"{dataset_type}-manual-grid",
                    "application/octet-stream",
                    0,
                    now_iso,
                    [],
                    [],
                ),
            )
        connection.commit()
    return upload_id


def _serialize_grid_row(row: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": int(row.get("id") or 0),
        "financialYear": str(row.get("financial_year") or ""),
        "sourceSheet": str(row.get("source_sheet") or ""),
        "sourceRowNumber": int(row.get("source_row_number") or 0),
        "businessKey": str(row.get("business_key") or ""),
        "updatedAt": _serialize_timestamp(row.get("updated_at")),
        "updatedBy": str(row.get("updated_by") or ""),
    }
    for field in MASTERDATA_FIELD_SPECS:
        value = row.get(field.key)
        if field.kind == "numeric":
            payload[field.key] = _to_float(value)
        elif field.kind == "date":
            payload[field.key] = _serialize_date(value)
        else:
            payload[field.key] = str(value or "")
    return payload


def _serialize_viewer_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = _serialize_public_row(row)
    payload["financialYear"] = str(row.get("financial_year") or "")
    return payload


def _serialize_public_row(values: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for field in MASTERDATA_FIELD_SPECS:
        value = values.get(field.key)
        if field.kind == "numeric":
            payload[field.key] = _to_float(value)
        elif field.kind == "date":
            payload[field.key] = _serialize_date(value)
        else:
            payload[field.key] = str(value or "")
    return payload


def _serialize_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _serialize_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    text = str(value).strip()
    return text or None


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except ValueError:
        return 0.0


def _to_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(float(text))
    except ValueError:
        return default


def _derive_row_business_key(
    dataset_type: DatasetType,
    values: dict[str, Any],
    source_sheet: str,
    source_row_number: int,
) -> str:
    derived = build_masterdata_business_key(dataset_type, values).strip()
    if derived:
        return derived
    sheet_name = source_sheet.strip() or "sheet"
    return f"row:{sheet_name}:{source_row_number}:{uuid4().hex}"
