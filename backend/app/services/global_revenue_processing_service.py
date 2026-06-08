from __future__ import annotations

import re
from datetime import date
from typing import Any

from .trend_common import (
    build_payload_lookup,
    coerce_float,
    first_present_value,
    fiscal_year_for_calendar_month,
    get_date_value,
    get_float_value,
    get_lookup_value,
    get_text_value,
    normalize_month_name,
    normalize_text,
    parse_date,
    parse_financial_year,
    safe_pct,
    scan_monthly_payload_values,
    upsert_uploaded_file,
)

INSERT_BATCH_SIZE = 1000
FISCAL_UPLOAD_MONTH_ORDER = ("Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar")
FISCAL_UPLOAD_MONTH_INDEX = {
    month: index
    for index, month in enumerate(FISCAL_UPLOAD_MONTH_ORDER)
}
MONTH_VALUE_PATTERN = re.compile(
    r"(?i)\b("
    + "|".join(
        [
            "jan",
            "january",
            "feb",
            "february",
            "mar",
            "march",
            "apr",
            "april",
            "may",
            "jun",
            "june",
            "jul",
            "july",
            "aug",
            "august",
            "sep",
            "sept",
            "september",
            "oct",
            "october",
            "nov",
            "november",
            "dec",
            "december",
        ]
    )
    + r")[\s\-_/,]*(\d{2,4})?\b"
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


def _normalize_ms_ps(value: Any) -> str:
    text = normalize_text(value).upper()
    compact = text.replace(" ", "").replace("-", "").replace("/", "")
    if compact.startswith("MS"):
        return "MS"
    if compact.startswith("PS"):
        return "PS"
    return text


def _normalize_region_bucket(value: Any) -> str:
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


def _upload_month_rank_sql(column: str = "u.upload_month") -> str:
    cases = " ".join(
        f"when lower(trim(coalesce({column}, ''))) = '{month.lower()}' then {index}"
        for index, month in enumerate(FISCAL_UPLOAD_MONTH_ORDER)
    )
    return f"case {cases} else -1 end"


def _activate_latest_upload_for_year(cursor: Any, financial_year: str) -> None:
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
        """,
        (financial_year,),
    )


def _ensure_actual_revenue_identifier_schema(cursor: Any) -> None:
    cursor.execute(
        "alter table if exists actual_revenue add column if not exists ocn_number text"
    )
    cursor.execute(
        """
        create index if not exists actual_revenue_ocn_idx
          on actual_revenue (lower(coalesce(ocn_number, '')))
        """
    )
    cursor.execute(
        """
        create index if not exists actual_revenue_emp_id_idx
          on actual_revenue (lower(coalesce(emp_id, '')))
        """
    )


def refresh_actual_revenue(
    financial_year: str,
    connection: Any,
) -> dict[str, Any]:
    with connection.cursor() as cursor:
        _ensure_actual_revenue_identifier_schema(cursor)
        _activate_latest_upload_for_year(cursor, financial_year)
        active_rank_sql = _upload_month_rank_sql("u.upload_month")
        cursor.execute(
            f"""
            select
                u.id::text as upload_id,
                u.original_filename,
                u.upload_month,
                u.uploaded_at,
                u.imported_rows
            from global_revenue_uploads u
            where u.financial_year = %s
              and u.is_active = true
            order by {active_rank_sql} asc, u.uploaded_at desc, u.id desc
            """,
            (financial_year,),
        )
        upload_rows = cursor.fetchall()

        cursor.execute("delete from actual_revenue where fy_year = %s", (financial_year,))

        if not upload_rows:
            return {
                "financialYear": financial_year,
                "fileId": None,
                "rowsProcessed": 0,
                "rowsFailed": 0,
            }

        start_year, _ = parse_financial_year(financial_year)
        active_upload_ids: list[str] = []
        insert_sql = """
            insert into actual_revenue (
                emp_id,
                ocn_number,
                customer_id,
                customer_name,
                project_name,
                resource_name,
                billed_hours,
                billable_actual_hrs,
                actual_hours,
                revenue_type,
                tp_plan,
                effort_month,
                rate_type,
                rate,
                billed_currency,
                amount,
                tax_rate,
                invoice_no,
                invoice_date,
                invoice_amount,
                revenue,
                expenses,
                portal_fees,
                tax,
                company,
                branch,
                region,
                state,
                sbu,
                sub_sbu,
                dept,
                service_line,
                type_of_projects,
                ms_ps,
                month,
                year,
                book_currency,
                fx_rate_book_currency,
                revenue_book_currency,
                actual_revenue_value,
                bdm,
                vertical,
                horizontal,
                practice_head,
                geo_head,
                group_company,
                buh,
                region_summary,
                sales_region,
                strategic_account,
                eeennn,
                uploaded_file_id,
                fy_year,
                created_at,
                updated_at
            )
            values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::uuid, %s, now(), now()
            )
        """

        batch: list[list[Any]] = []
        rows_processed = 0

        for upload_row in upload_rows:
            upload_id = str(upload_row.get("upload_id") or "").strip()
            if not upload_id:
                continue
            active_upload_ids.append(upload_id)
            upsert_uploaded_file(
                cursor,
                file_id=upload_id,
                file_name=normalize_text(upload_row.get("original_filename")) or "global-revenue-upload.xlsx",
                file_type="global_revenue",
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
                    project_name,
                    resource_id,
                    resource_name,
                    ocn_number,
                    ms_ps,
                    bill_rate,
                    rate_type,
                    billed_currency,
                    type_of_projects,
                    billed_hours,
                    billable_actual_hrs,
                    bdm,
                    vertical,
                    horizontal,
                    practice_head,
                    geo_head,
                    raw_payload
                from global_revenue_records
                where upload_id = %s::uuid
                order by id asc
                """,
                (upload_id,),
            )
            rows = cursor.fetchall()

            for row in rows:
                raw_payload = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
                lookup = build_payload_lookup(raw_payload)
                expanded_rows = _expand_actual_rows(
                    financial_year=financial_year,
                    upload_month=normalize_text(upload_row.get("upload_month")) or None,
                    row=row,
                    lookup=lookup,
                )
                for expanded in expanded_rows:
                    batch.append(
                        [
                            expanded["emp_id"],
                            expanded["ocn_number"],
                            expanded["customer_id"],
                            expanded["customer_name"],
                            expanded["project_name"],
                            expanded["resource_name"],
                            expanded["billed_hours"],
                            expanded["billable_actual_hrs"],
                            expanded["actual_hours"],
                            expanded["revenue_type"],
                            expanded["tp_plan"],
                            expanded["effort_month"],
                            expanded["rate_type"],
                            expanded["rate"],
                            expanded["billed_currency"],
                            expanded["amount"],
                            expanded["tax_rate"],
                            expanded["invoice_no"],
                            expanded["invoice_date"],
                            expanded["invoice_amount"],
                            expanded["revenue"],
                            expanded["expenses"],
                            expanded["portal_fees"],
                            expanded["tax"],
                            expanded["company"],
                            expanded["branch"],
                            expanded["region"],
                            expanded["state"],
                            expanded["sbu"],
                            expanded["sub_sbu"],
                            expanded["dept"],
                            expanded["service_line"],
                            expanded["type_of_projects"],
                            expanded["ms_ps"],
                            expanded["month"],
                            expanded["year"],
                            expanded["book_currency"],
                            expanded["fx_rate_book_currency"],
                            expanded["revenue_book_currency"],
                            expanded["actual_revenue_value"],
                            expanded["bdm"],
                            expanded["vertical"],
                            expanded["horizontal"],
                            expanded["practice_head"],
                            expanded["geo_head"],
                            expanded["group_company"],
                            expanded["buh"],
                            expanded["region_summary"],
                            expanded["sales_region"],
                            expanded["strategic_account"],
                            expanded["eeennn"],
                            upload_id,
                            financial_year,
                        ]
                    )
                    if len(batch) >= INSERT_BATCH_SIZE:
                        cursor.executemany(insert_sql, batch)
                        rows_processed += len(batch)
                        batch.clear()

        if batch:
            cursor.executemany(insert_sql, batch)
            rows_processed += len(batch)

    return {
        "financialYear": financial_year,
        "fileId": active_upload_ids[-1] if active_upload_ids else None,
        "fileIds": active_upload_ids,
        "rowsProcessed": rows_processed,
        "rowsFailed": 0,
    }


def _expand_actual_rows(
    *,
    financial_year: str,
    upload_month: str | None,
    row: dict[str, Any],
    lookup: dict[str, Any],
) -> list[dict[str, Any]]:
    base = _build_base_actual_payload(row=row, lookup=lookup)
    normalized_upload_month = normalize_month_name(upload_month)
    month_entries = [entry for entry in scan_monthly_payload_values(lookup, financial_year) if entry["value"] != 0]

    if month_entries:
        resolved_actual_value = _resolve_priority_actual_value(lookup)
        if normalized_upload_month:
            month_entries = [
                entry
                for entry in month_entries
                if normalize_month_name(entry.get("month")) == normalized_upload_month
            ] or [
                max(
                    month_entries,
                    key=lambda entry: FISCAL_UPLOAD_MONTH_INDEX.get(
                        normalize_month_name(entry.get("month")) or "",
                        -1,
                    ),
                )
            ]
        payloads: list[dict[str, Any]] = []
        for entry in month_entries:
            month_name = normalize_month_name(entry.get("month")) or str(entry.get("month") or "")
            year_value = int(entry["year"])
            payloads.append(
                {
                    **base,
                    "effort_month": f"{month_name} {year_value}",
                    "month": month_name,
                    "year": year_value,
                    "actual_revenue_value": resolved_actual_value
                    if resolved_actual_value != 0
                    else coerce_float(entry["value"], 0.0),
                }
            )
        return payloads

    single_month = _resolve_single_month_year(
        financial_year=financial_year,
        upload_month=upload_month,
        lookup=lookup,
    )
    if single_month is None:
        return []
    if normalized_upload_month:
        start_year, end_year = parse_financial_year(financial_year)
        single_month = {
            "month": normalized_upload_month,
            "year": end_year if normalized_upload_month in {"Jan", "Feb", "Mar"} else start_year,
        }

    actual_revenue_value = _resolve_priority_actual_value(lookup)
    if actual_revenue_value == 0:
        return []

    return [
        {
            **base,
            "effort_month": f"{single_month['month']} {single_month['year']}",
            "month": single_month["month"],
            "year": int(single_month["year"]),
            "actual_revenue_value": actual_revenue_value,
        }
    ]


def _build_base_actual_payload(
    *,
    row: dict[str, Any],
    lookup: dict[str, Any],
) -> dict[str, Any]:
    ytd_revenue_value = get_float_value(
        None,
        lookup,
        "YTD Revenue$",
        "YTD Revenue",
        "YTD Revenue USD",
        "YTD Revenue$ (USD)",
        "YTD Revenue ($)",
        "YTDrevenue$",
        "YTDRevenue$",
        "YTDrevenue",
        "YTDRevenue",
    )
    revenue_book_currency = get_float_value(
        None,
        lookup,
        "Revenue Book currency",
        "Revenue Book Currency",
    )
    revenue = get_float_value(None, lookup, "Revenue")
    amount = get_float_value(None, lookup, "Amount")
    invoice_amount = get_float_value(None, lookup, "Invoice amount", "Invoice Amount")
    billed_hours = get_float_value(row.get("billed_hours"), lookup, "Billed Hours")
    billable_actual_hrs = get_float_value(
        row.get("billable_actual_hrs"),
        lookup,
        "Billable Actual Hrs",
        "Billable Actual Hours",
    )
    actual_hours = get_float_value(None, lookup, "Actual Hours")
    expenses = get_float_value(None, lookup, "Expenses")
    portal_fees = get_float_value(None, lookup, "Portal Fees")
    tax = get_float_value(None, lookup, "Tax")
    actual_revenue_value = ytd_revenue_value
    source_ms_ps = get_text_value(row.get("ms_ps"), lookup, "MS/PS", "PS/MS")
    budget_ms_ps = get_text_value(
        None,
        lookup,
        "PS/MS budget",
        "MS/PS budget",
        "PS/MS",
    )

    return {
        "emp_id": get_text_value(
            row.get("resource_id"),
            lookup,
            "Emp ID",
            "Employee ID",
            "Resource ID",
        ),
        "ocn_number": get_text_value(
            row.get("ocn_number"),
            lookup,
            "OCN Number",
            "OCN",
            "OCN No",
            "OCN_NUMBER",
        ),
        "customer_id": get_text_value(None, lookup, "Customer Id", "Customer ID"),
        "customer_name": get_text_value(
            None,
            lookup,
            "Updated Customer",
            "Updated Customer Name",
            "Customer name",
            "Customer Name",
            "Customer",
        )
        or normalize_text(row.get("customer_name")),
        "project_name": get_text_value(row.get("project_name"), lookup, "Project Name", "Project"),
        "resource_name": get_text_value(row.get("resource_name"), lookup, "Resource Name"),
        "billed_hours": billed_hours,
        "billable_actual_hrs": billable_actual_hrs,
        "actual_hours": actual_hours,
        "revenue_type": get_text_value(None, lookup, "Revenue type", "Revenue Type"),
        "tp_plan": get_text_value(None, lookup, "TP Plan"),
        "rate_type": get_text_value(row.get("rate_type"), lookup, "Rate Type", "RateType"),
        "rate": get_float_value(row.get("bill_rate"), lookup, "Rate", "Bill Rate"),
        "billed_currency": get_text_value(
            row.get("billed_currency"),
            lookup,
            "Billed currency",
            "Billed Currency",
            "Currency",
        )
        or "USD",
        "amount": amount,
        "tax_rate": get_float_value(None, lookup, "Tax Rate"),
        "invoice_no": get_text_value(None, lookup, "Invoice no", "Invoice No"),
        "invoice_date": get_date_value(None, lookup, "Date", "Invoice Date", "Invoice date"),
        "invoice_amount": invoice_amount,
        "revenue": revenue,
        "expenses": expenses,
        "portal_fees": portal_fees,
        "tax": tax,
        "company": get_text_value(None, lookup, "Company", "Entity"),
        "branch": get_text_value(None, lookup, "Branch"),
        "region": _normalize_region_bucket(
            get_text_value(
                None,
                lookup,
                "ROW/US",
                "Region",
                "Region 2",
                "Region summary",
                "Region Summary",
            )
        ),
        "state": get_text_value(None, lookup, "State"),
        "sbu": get_text_value(None, lookup, "SBU"),
        "sub_sbu": get_text_value(None, lookup, "Sub-SBU", "Sub SBU"),
        "dept": get_text_value(None, lookup, "Dept"),
        "service_line": get_text_value(None, lookup, "Service Line"),
        "type_of_projects": get_text_value(
            row.get("type_of_projects"),
            lookup,
            "Type of Projects",
            "Type of Project",
        ),
        # Actuals must use the actual file's MS/PS classification first.
        # PS/MS budget is only a fallback when the uploaded actuals column is blank.
        "ms_ps": _normalize_ms_ps(source_ms_ps or budget_ms_ps),
        "book_currency": get_text_value(None, lookup, "Book Currency"),
        "fx_rate_book_currency": get_float_value(
            None,
            lookup,
            "Fx Rate book currency",
            "FX Rate Book Currency",
        ),
        "revenue_book_currency": revenue_book_currency,
        "actual_revenue_value": actual_revenue_value,
        "bdm": get_text_value(row.get("bdm"), lookup, "BDM"),
        "vertical": get_text_value(row.get("vertical"), lookup, "Vertical"),
        "horizontal": get_text_value(row.get("horizontal"), lookup, "Horizontal"),
        "practice_head": get_text_value(row.get("practice_head"), lookup, "Practice Head"),
        "geo_head": get_text_value(row.get("geo_head"), lookup, "Geo Head", "GeoHead", "Geo head"),
        "group_company": get_text_value(
            None,
            lookup,
            "Updated Customer",
            "Updated Customer Name",
            "Group company",
            "Group Company",
        ),
        "buh": get_text_value(None, lookup, "BUH"),
        "region_summary": get_text_value(
            None,
            lookup,
            "Region summary",
            "Region Summary",
            "Region 2",
        ),
        "sales_region": get_text_value(None, lookup, "Sales Region", "Region 2"),
        "strategic_account": get_text_value(None, lookup, "Strategic Account"),
        "eeennn": get_text_value(None, lookup, "EEENNN", "EENNN"),
    }


def _resolve_priority_actual_value(lookup: dict[str, Any]) -> float:
    return coerce_float(
        get_lookup_value(
            lookup,
            "YTD Revenue$",
            "YTD Revenue",
            "YTD Revenue USD",
            "YTD Revenue$ (USD)",
            "YTD Revenue ($)",
            "YTDrevenue$",
            "YTDRevenue$",
            "YTDrevenue",
            "YTDRevenue",
        ),
        0.0,
    )


def _resolve_single_month_year(
    *,
    financial_year: str,
    upload_month: str | None,
    lookup: dict[str, Any],
) -> dict[str, Any] | None:
    month_like_value = first_present_value(
        get_lookup_value(lookup, "Month"),
        get_lookup_value(lookup, "Effort Month"),
        get_lookup_value(lookup, "Effort month"),
    )
    if month_like_value not in (None, ""):
        resolved = _parse_month_like_value(month_like_value, financial_year)
        if resolved is not None:
            return resolved

    resolved_date = get_date_value(None, lookup, "Date", "Invoice Date", "Invoice date")
    if resolved_date is not None:
        month_name = normalize_month_name(resolved_date.strftime("%b"))
        if month_name:
            return {
                "month": month_name,
                "year": resolved_date.year,
            }

    if upload_month:
        month_name = normalize_month_name(upload_month)
        if month_name:
            start_year, end_year = parse_financial_year(financial_year)
            return {
                "month": month_name,
                "year": end_year if month_name in {"Jan", "Feb", "Mar"} else start_year,
            }

    return None


def _parse_month_like_value(value: Any, financial_year: str) -> dict[str, Any] | None:
    parsed_date = parse_date(value)
    if parsed_date is not None:
        month_name = normalize_month_name(parsed_date.strftime("%b"))
        if month_name:
            return {"month": month_name, "year": parsed_date.year}

    text = normalize_text(value)
    if not text:
        return None
    match = MONTH_VALUE_PATTERN.search(text)
    if not match:
        month_name = normalize_month_name(text)
        if not month_name:
            return None
        start_year, end_year = parse_financial_year(financial_year)
        return {
            "month": month_name,
            "year": end_year if month_name in {"Jan", "Feb", "Mar"} else start_year,
        }

    month_name = normalize_month_name(match.group(1))
    if not month_name:
        return None
    year_token = match.group(2)
    if year_token:
        year = int(year_token)
        if year < 100:
            year += 2000
    else:
        start_year, end_year = parse_financial_year(financial_year)
        year = end_year if month_name in {"Jan", "Feb", "Mar"} else start_year

    if fiscal_year_for_calendar_month(month_name, year) != financial_year:
        return None
    return {"month": month_name, "year": year}
