from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from .financial_dataset import MONTH_SEQUENCE, REVENUE_COLUMN_KEYS, parse_financial_workbook
from .masterdata_dataset import MASTERDATA_DATASET_TYPES
from .masterdata_store import (
    import_masterdata_upload,
    reconcile_budget_sync_to_rapid_revenue,
)
from .postgres import ensure_postgres_schema, get_database_status, open_database_connection
from .rapid_revenue_store import (
    import_rapid_revenue_upload,
    try_parse_rapid_revenue_workbook,
)
from .revenue_analytics import (
    build_revenue_budget_kiosk_payload,
    build_revenue_dashboard_payload,
    build_revenue_monthly_comparison_payload,
    build_revenue_overview_payload,
    list_revenue_variance_comments,
    save_revenue_variance_comment,
)
from .services.trend_summary_service import refresh_trend_analytics
from .services.budget_upload_mapping_service import import_budget_upload_with_mapping
from .upload_security import (
    safe_store_upload,
    validate_upload_extension,
    reject_formula_injection,
)

ROOT_DIR = Path(__file__).resolve().parents[2]
RBAC_STORE_PATH = ROOT_DIR / "data" / "rbac-store.json"
PLATFORM_STORE_PATH = ROOT_DIR / "data" / "platform-backend.json"
UPLOADS_DIR = ROOT_DIR / "backend" / "storage" / "uploads"

DEFAULT_PLATFORM_STORE = {
    "settings": {
        "assistantName": "RAPID Revenue Agent",
        "localLlmEnabled": True,
        "localLlmBaseUrl": "http://172.16.5.225",
        "localLlmPlatformBaseUrl": "",
        "localLlmApiKey": "",
        "localLlmModel": "auto",
        "localLlmTemperature": 0.2,
        "defaultFinancialYear": "2026-2027",
        "showRestrictedRoleBudgets": False,
    },
    "uploads": [],
}

FILTER_COLUMN_MAP = {
    "financialYear": "r.financial_year",
    "region": "r.region",
    "practiceHead": "r.practice_head",
    "geoHead": "r.geo_head",
    "customerName": "r.customer_name",
    "dealType": "r.deal_type",
    "businessType": "r.business_type",
}

ACTUAL_KEYS = tuple(
    actual_key for _, _, _, actual_key, _ in MONTH_SEQUENCE if actual_key
)
VARIANCE_KEYS = tuple(
    variance_key for _, _, _, _, variance_key in MONTH_SEQUENCE if variance_key
)
SUPPORTED_UPLOAD_DATASET_TYPES = {
    "financial_workbook",
    "rapid_revenue",
    *MASTERDATA_DATASET_TYPES,
}
UPLOAD_TABLE_BY_DATASET_TYPE = {
    "financial_workbook": "financial_workbook_uploads",
    "rapid_revenue": "rapid_revenue_uploads",
    "budget": "budget_uploads",
    "global_revenue": "global_revenue_uploads",
    "forecast": "forecast_uploads",
}
UPLOAD_MONTH_OPTIONS = (
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def deep_default_store() -> Dict[str, Any]:
    return deepcopy(DEFAULT_PLATFORM_STORE)


def read_json(path: Path, fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{json.dumps(fallback, indent=2)}\n", encoding="utf8")
        return deepcopy(fallback)

    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf8")


def read_rbac_store() -> Dict[str, Any]:
    return read_json(
        RBAC_STORE_PATH,
        {
            "catalogs": {"geos": [], "practices": [], "actions": []},
            "roles": [],
            "users": [],
        },
    )


def write_rbac_store(payload: Dict[str, Any]) -> None:
    write_json(RBAC_STORE_PATH, payload)


def read_platform_store() -> Dict[str, Any]:
    store = read_json(PLATFORM_STORE_PATH, deep_default_store())
    changed = False

    for key, value in DEFAULT_PLATFORM_STORE.items():
        if key not in store:
            store[key] = deepcopy(value)
            changed = True

    for setting_key, setting_value in DEFAULT_PLATFORM_STORE["settings"].items():
        if setting_key not in store["settings"]:
            store["settings"][setting_key] = setting_value
            changed = True

    # Migrate deprecated assistant defaults to current external endpoint.
    legacy_base = str(store["settings"].get("localLlmBaseUrl") or "").strip().rstrip("/")
    if legacy_base in {"http://172.16.5.130:8000", "http://172.16.5.130"}:
        store["settings"]["localLlmBaseUrl"] = DEFAULT_PLATFORM_STORE["settings"]["localLlmBaseUrl"]
        changed = True

    legacy_key = str(store["settings"].get("localLlmApiKey") or "").strip()
    if legacy_key.startswith("ns_"):
        store["settings"]["localLlmApiKey"] = ""
        changed = True

    legacy_model = str(store["settings"].get("localLlmModel") or "").strip().lower()
    if legacy_model.endswith("-auto"):
        store["settings"]["localLlmModel"] = DEFAULT_PLATFORM_STORE["settings"]["localLlmModel"]
        changed = True

    if changed:
        write_platform_store(store)

    return store


def write_platform_store(payload: Dict[str, Any]) -> None:
    write_json(PLATFORM_STORE_PATH, payload)


def list_financial_years(start_year: int = 2020) -> list[str]:
    current_year = datetime.now(timezone.utc).year
    return [f"{year}-{year + 1}" for year in range(start_year, current_year + 1)]


def sanitize_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-") or "workbook.xlsx"


def normalize_upload_month(dataset_type: str, upload_month: str | None) -> str | None:
    normalized_dataset_type = str(dataset_type or "").strip().lower()
    raw_value = str(upload_month or "").strip()

    if normalized_dataset_type != "global_revenue":
        return raw_value or None

    if not raw_value:
        raise HTTPException(
            status_code=400,
            detail="Choose an upload month for actuals.",
        )

    normalized_lookup = {value.lower(): value for value in UPLOAD_MONTH_OPTIONS}
    matched_value = normalized_lookup.get(raw_value.lower())
    if matched_value:
        return matched_value

    raise HTTPException(
        status_code=400,
        detail="Choose a valid upload month from April through March.",
    )


def build_user_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "title": user["title"],
        "roleId": user["roleId"],
        "geo": user["geo"],
        "practice": user["practice"],
        "active": user["active"],
        "mfaRequired": user["mfaRequired"],
        "totpEnabled": user["totpEnabled"],
        "passwordResetRequired": user["passwordResetRequired"],
        "lastTotpVerifiedAt": user["lastTotpVerifiedAt"],
        "updatedAt": user["updatedAt"],
    }


def get_user_summaries() -> list[Dict[str, Any]]:
    store = read_rbac_store()
    return [build_user_summary(user) for user in store.get("users", [])]


def get_locations_summary() -> Dict[str, Any]:
    store = read_rbac_store()
    catalogs = store.get("catalogs", {})

    dashboard = get_revenue_dashboard_data()
    filters = dashboard["filters"]

    geographies = _merge_distinct_values(
        catalogs.get("geos", []),
        filters.get("regions", []),
        filters.get("geoHeads", []),
    )
    practices = _merge_distinct_values(
        catalogs.get("practices", []),
        filters.get("practiceHeads", []),
    )

    return {
        "geographies": geographies,
        "practices": practices,
        "total": len(geographies) + len(practices),
    }


def add_location(kind: str, name: str) -> Dict[str, Any]:
    normalized_name = name.strip()

    if kind not in {"geo", "practice"}:
        raise HTTPException(status_code=400, detail="Choose either geo or practice.")

    if not normalized_name:
        raise HTTPException(status_code=400, detail="Enter a location name.")

    store = read_rbac_store()
    target_key = "geos" if kind == "geo" else "practices"
    current_values = store["catalogs"].setdefault(target_key, [])

    if any(value.lower() == normalized_name.lower() for value in current_values):
        raise HTTPException(status_code=409, detail="That location already exists.")

    current_values.append(normalized_name)
    write_rbac_store(store)

    return {
        "kind": kind,
        "name": normalized_name,
        "catalog": current_values,
    }


def save_upload(
    financial_year: str,
    workbook: UploadFile,
    dataset_type: str = "financial_workbook",
    upload_month: str | None = None,
) -> Dict[str, Any]:
    if financial_year not in list_financial_years():
        raise HTTPException(status_code=400, detail="Choose a valid financial year.")

    if not workbook.filename:
        raise HTTPException(status_code=400, detail="Select a workbook first.")

    normalized_dataset_type = str(dataset_type or "financial_workbook").strip().lower()
    if normalized_dataset_type not in SUPPORTED_UPLOAD_DATASET_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Choose a valid dataset type for upload.",
        )
    normalized_upload_month = normalize_upload_month(normalized_dataset_type, upload_month)

    validate_upload_extension(workbook.filename, normalized_dataset_type)

    safe_name = sanitize_filename(workbook.filename)
    stored_filename = f"{uuid4()}-{safe_name}"
    stored_path = UPLOADS_DIR / stored_filename
    safe_store_upload(workbook, stored_path)
    reject_formula_injection(stored_path)

    try:
        ensure_postgres_schema()
        if normalized_dataset_type == "budget":
            record = import_budget_upload_with_mapping(
                financial_year=financial_year,
                workbook_path=stored_path,
                original_filename=workbook.filename,
                stored_filename=stored_filename,
                content_type=workbook.content_type or "application/octet-stream",
                size_bytes=int(stored_path.stat().st_size),
                upload_month=normalized_upload_month,
                created_by="admin-upload",
                overwrite_existing=False,
            )
        elif normalized_dataset_type in MASTERDATA_DATASET_TYPES:
            record = import_masterdata_upload(
                financial_year=financial_year,
                dataset_type=normalized_dataset_type,
                workbook=workbook,
                stored_filename=stored_filename,
                stored_path=stored_path,
                upload_month=normalized_upload_month,
            )
        elif normalized_dataset_type == "rapid_revenue":
            record = import_rapid_revenue_upload(
                financial_year=financial_year,
                workbook=workbook,
                stored_filename=stored_filename,
                stored_path=stored_path,
            )
        else:
            rapid_revenue_workbook = try_parse_rapid_revenue_workbook(stored_path)
            if rapid_revenue_workbook is not None:
                record = import_rapid_revenue_upload(
                    financial_year=financial_year,
                    workbook=workbook,
                    stored_filename=stored_filename,
                    stored_path=stored_path,
                )
            else:
                parsed_workbook = parse_financial_workbook(stored_path)
                if not parsed_workbook.rows:
                    stored_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=400,
                        detail="No workbook rows matching the expected financial headers were found.",
                    )

                record = _import_workbook_rows(
                    financial_year=financial_year,
                    workbook=workbook,
                    stored_filename=stored_filename,
                    stored_path=stored_path,
                    parsed_workbook=parsed_workbook,
                )
    except RuntimeError as error:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPException:
        stored_path.unlink(missing_ok=True)
        raise
    except Exception as error:  # pragma: no cover
        stored_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"Workbook import failed: {error}",
        ) from error

    if "datasetType" not in record:
        record["datasetType"] = normalized_dataset_type
    if "uploadMonth" not in record:
        record["uploadMonth"] = normalized_upload_month
    if normalized_dataset_type in {"budget", "global_revenue"} and not bool(record.get("trendRefreshHandled")):
        try:
            trend_refresh = refresh_trend_analytics(
                financial_year=financial_year,
                upload_month=normalized_upload_month,
            )
        except Exception as error:
            record["trendRefreshError"] = str(error)
        else:
            record["summaryRefreshed"] = bool(trend_refresh.get("summaryRefreshed"))
            record["riskScoresUpdated"] = bool(trend_refresh.get("riskScoresUpdated"))
            record["anomaliesDetected"] = int(trend_refresh.get("anomaliesDetected") or 0)
            record["insightsGenerated"] = int(trend_refresh.get("insightsGenerated") or 0)

    _sync_legacy_upload_record(record)
    _push_upload_notification(record)
    return record


def _push_upload_notification(record: Dict[str, Any]) -> None:
    dataset_type = str(record.get("datasetType") or "").strip().lower()
    if dataset_type not in {"rapid_revenue", "budget", "global_revenue", "forecast"}:
        return

    filename = str(record.get("originalFilename") or "workbook")
    financial_year = str(record.get("financialYear") or "")
    upload_month = str(record.get("uploadMonth") or "").strip()
    label = {
        "rapid_revenue": "Rapid Revenue",
        "budget": "Budget",
        "global_revenue": "Actuals",
        "forecast": "Forecast",
    }.get(dataset_type, dataset_type.title())
    now_iso = utc_now_iso()

    try:
        ensure_postgres_schema()
        with open_database_connection(require=True) as connection:
            assert connection is not None
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    insert into rapid_notifications (
                        id,
                        category,
                        audience_role,
                        audience_user_id,
                        title,
                        message,
                        link,
                        created_at,
                        metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s::jsonb)
                    """,
                    [
                        (
                            str(uuid4()),
                            "upload_completed",
                            "bdm",
                            None,
                            f"{label} upload is available",
                            f"{label} data for {financial_year}{f' {upload_month}' if upload_month else ''} was uploaded ({filename}). Refresh forecast to review your rows.",
                            "/bdm/forecast/ms",
                            now_iso,
                            json.dumps(
                                {
                                    "datasetType": dataset_type,
                                    "financialYear": financial_year,
                                    "uploadMonth": upload_month or None,
                                    "filename": filename,
                                }
                            ),
                        ),
                        (
                            str(uuid4()),
                            "upload_completed",
                            "executive",
                            None,
                            f"{label} upload is available",
                            f"{label} data for {financial_year}{f' {upload_month}' if upload_month else ''} was uploaded ({filename}).",
                            "/executive/master-data",
                            now_iso,
                            json.dumps(
                                {
                                    "datasetType": dataset_type,
                                    "financialYear": financial_year,
                                    "uploadMonth": upload_month or None,
                                    "filename": filename,
                                }
                            ),
                        ),
                    ],
                )
            connection.commit()
    except Exception:
        # Upload should not fail because notification insertion failed.
        return


def delete_upload(upload_id: str) -> Dict[str, Any]:
    normalized_upload_id = upload_id.strip()
    if not normalized_upload_id:
        raise HTTPException(status_code=400, detail="Upload id is required.")

    try:
        ensure_postgres_schema()
        with open_database_connection(require=True) as connection:
            assert connection is not None
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select *
                    from (
                        select
                            id::text as id,
                            financial_year,
                            null::text as upload_month,
                            original_filename,
                            stored_filename,
                            uploaded_at,
                            is_active,
                            'financial_workbook'::text as dataset_type
                        from financial_workbook_uploads
                        where id::text = %s
                        union all
                        select
                            id::text as id,
                            financial_year,
                            null::text as upload_month,
                            original_filename,
                            stored_filename,
                            uploaded_at,
                            is_active,
                            'rapid_revenue'::text as dataset_type
                        from rapid_revenue_uploads
                        where id::text = %s
                        union all
                        select
                            id::text as id,
                            financial_year,
                            upload_month,
                            original_filename,
                            stored_filename,
                            uploaded_at,
                            is_active,
                            'budget'::text as dataset_type
                        from budget_uploads
                        where id::text = %s
                        union all
                        select
                            id::text as id,
                            financial_year,
                            upload_month,
                            original_filename,
                            stored_filename,
                            uploaded_at,
                            is_active,
                            'global_revenue'::text as dataset_type
                        from global_revenue_uploads
                        where id::text = %s
                        union all
                        select
                            id::text as id,
                            financial_year,
                            upload_month,
                            original_filename,
                            stored_filename,
                            uploaded_at,
                            is_active,
                            'forecast'::text as dataset_type
                        from forecast_uploads
                        where id::text = %s
                    ) uploads
                    order by uploaded_at desc
                    limit 1
                    """,
                    (
                        normalized_upload_id,
                        normalized_upload_id,
                        normalized_upload_id,
                        normalized_upload_id,
                        normalized_upload_id,
                    ),
                )
                upload_row = cursor.fetchone()

                if not upload_row:
                    raise HTTPException(status_code=404, detail="Upload record not found.")

                dataset_type = str(upload_row.get("dataset_type") or "financial_workbook")
                table_name = UPLOAD_TABLE_BY_DATASET_TYPE.get(
                    dataset_type,
                    "financial_workbook_uploads",
                )

                cursor.execute(f"delete from {table_name} where id::text = %s", (normalized_upload_id,))

                if upload_row.get("is_active"):
                    cursor.execute(
                        f"""
                        with next_active as (
                            select id
                            from {table_name}
                            where financial_year = %s
                            order by uploaded_at desc
                            limit 1
                        )
                        update {table_name}
                        set is_active = true
                        where id in (select id from next_active)
                        """,
                        (upload_row.get("financial_year"),),
                    )

                if dataset_type in {"budget", "rapid_revenue"}:
                    reconcile_budget_sync_to_rapid_revenue(
                        cursor,
                        str(upload_row.get("financial_year") or ""),
                    )

            connection.commit()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    stored_filename = str(upload_row.get("stored_filename") or "")
    if stored_filename:
        (UPLOADS_DIR / stored_filename).unlink(missing_ok=True)

    store = read_platform_store()
    existing_uploads = store.get("uploads", [])
    filtered_uploads = [
        upload for upload in existing_uploads if upload.get("id") != normalized_upload_id
    ]
    if len(filtered_uploads) != len(existing_uploads):
        store["uploads"] = filtered_uploads
        write_platform_store(store)

    deleted_dataset_type = str(upload_row.get("dataset_type") or "").strip().lower()
    deleted_financial_year = str(upload_row.get("financial_year") or "").strip()
    if deleted_dataset_type in {"budget", "global_revenue"} and deleted_financial_year:
        try:
            refresh_trend_analytics(financial_year=deleted_financial_year)
        except Exception:
            pass

    return {
        "id": normalized_upload_id,
        "financialYear": str(upload_row.get("financial_year") or ""),
        "uploadMonth": str(upload_row.get("upload_month") or "") or None,
        "originalFilename": str(upload_row.get("original_filename") or ""),
        "storedFilename": stored_filename,
        "datasetType": str(upload_row.get("dataset_type") or "financial_workbook"),
        "deletedAt": utc_now_iso(),
    }


def _import_workbook_rows(
    financial_year: str,
    workbook: UploadFile,
    stored_filename: str,
    stored_path: Path,
    parsed_workbook: Any,
) -> Dict[str, Any]:
    upload_id = str(uuid4())
    uploaded_at = utc_now_iso()
    inserted_rows = len(parsed_workbook.rows)

    upload_record = {
        "id": upload_id,
        "financialYear": financial_year,
        "originalFilename": workbook.filename,
        "storedFilename": stored_filename,
        "contentType": workbook.content_type or "application/octet-stream",
        "sizeBytes": stored_path.stat().st_size,
        "uploadedAt": uploaded_at,
        "importedRows": inserted_rows,
        "parsedSheets": parsed_workbook.parsed_sheets,
        "matchedColumns": parsed_workbook.matched_columns,
        "active": True,
    }

    insert_columns = [
        "upload_id",
        "financial_year",
        "source_sheet",
        "source_row_number",
        "raw_payload",
        *REVENUE_COLUMN_KEYS,
    ]
    insert_sql = f"""
        insert into financial_records ({", ".join(insert_columns)})
        values ({", ".join(["%s", "%s", "%s", "%s", "%s::jsonb", *["%s"] * len(REVENUE_COLUMN_KEYS)])})
    """

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                "update financial_workbook_uploads set is_active = false where financial_year = %s and is_active = true",
                (financial_year,),
            )
            cursor.execute(
                """
                insert into financial_workbook_uploads (
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
                values (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s, true)
                """,
                (
                    upload_record["id"],
                    upload_record["financialYear"],
                    upload_record["originalFilename"],
                    upload_record["storedFilename"],
                    upload_record["contentType"],
                    upload_record["sizeBytes"],
                    upload_record["uploadedAt"],
                    upload_record["importedRows"],
                    upload_record["parsedSheets"],
                    upload_record["matchedColumns"],
                ),
            )

            rows_to_insert = []
            for parsed_row in parsed_workbook.rows:
                rows_to_insert.append(
                    [
                        upload_id,
                        financial_year,
                        parsed_row.sheet_name,
                        parsed_row.row_number,
                        json.dumps(parsed_row.raw_payload),
                        *[parsed_row.values.get(column_key) for column_key in REVENUE_COLUMN_KEYS],
                    ]
                )

            cursor.executemany(insert_sql, rows_to_insert)

        connection.commit()

    return upload_record


def _sync_legacy_upload_record(record: Dict[str, Any]) -> None:
    store = read_platform_store()
    existing_uploads = [
        upload for upload in store.get("uploads", []) if upload.get("id") != record["id"]
    ]
    current_dataset_type = str(record.get("datasetType") or "financial_workbook")

    for upload in existing_uploads:
        upload_dataset_type = str(upload.get("datasetType") or "financial_workbook")
        if (
            upload.get("financialYear") == record["financialYear"]
            and upload_dataset_type == current_dataset_type
        ):
            upload["active"] = False

    store["uploads"] = [record, *existing_uploads]
    write_platform_store(store)


def get_uploads_summary() -> Dict[str, Any]:
    uploads = _get_database_uploads()
    if uploads is None:
        uploads = sorted(
            read_platform_store().get("uploads", []),
            key=lambda upload: upload.get("uploadedAt", ""),
            reverse=True,
        )

    uploaded_years = [upload.get("financialYear", "") for upload in uploads]
    financial_years = _merge_distinct_values(list_financial_years(), uploaded_years)

    return {
        "financialYears": financial_years,
        "uploads": uploads,
        "total": len(uploads),
    }


def _get_database_uploads() -> list[Dict[str, Any]] | None:
    try:
        ensure_postgres_schema()
        with open_database_connection(require=False) as connection:
            if connection is None:
                return None

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select *
                    from (
                        select
                            id::text as id,
                            financial_year,
                            null::text as upload_month,
                            original_filename,
                            stored_filename,
                            content_type,
                            size_bytes,
                            uploaded_at,
                            imported_rows,
                            parsed_sheets,
                            matched_columns,
                            is_active,
                            'financial_workbook'::text as dataset_type
                        from financial_workbook_uploads
                        union all
                        select
                            id::text as id,
                            financial_year,
                            null::text as upload_month,
                            original_filename,
                            stored_filename,
                            content_type,
                            size_bytes,
                            uploaded_at,
                            imported_rows,
                            parsed_sheets,
                            matched_columns,
                            is_active,
                            'rapid_revenue'::text as dataset_type
                        from rapid_revenue_uploads
                        union all
                        select
                            id::text as id,
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
                            is_active,
                            'budget'::text as dataset_type
                        from budget_uploads
                        union all
                        select
                            id::text as id,
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
                            is_active,
                            'global_revenue'::text as dataset_type
                        from global_revenue_uploads
                        union all
                        select
                            id::text as id,
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
                            is_active,
                            'forecast'::text as dataset_type
                        from forecast_uploads
                    ) uploads
                    order by uploaded_at desc
                    """
                )
                rows = cursor.fetchall()

            return [_serialize_upload_row(row) for row in rows]
    except Exception:
        return None


def _serialize_upload_row(row: Dict[str, Any]) -> Dict[str, Any]:
    uploaded_at = row.get("uploaded_at")
    uploaded_at_value = (
        uploaded_at.isoformat().replace("+00:00", "Z")
        if isinstance(uploaded_at, datetime)
        else str(uploaded_at or "")
    )

    return {
        "id": str(row.get("id") or ""),
        "financialYear": str(row.get("financial_year") or ""),
        "uploadMonth": str(row.get("upload_month") or "") or None,
        "originalFilename": str(row.get("original_filename") or ""),
        "storedFilename": str(row.get("stored_filename") or ""),
        "contentType": str(row.get("content_type") or "application/octet-stream"),
        "sizeBytes": int(row.get("size_bytes") or 0),
        "uploadedAt": uploaded_at_value,
        "importedRows": int(row.get("imported_rows") or 0),
        "parsedSheets": list(row.get("parsed_sheets") or []),
        "matchedColumns": list(row.get("matched_columns") or []),
        "active": bool(row.get("is_active")),
        "datasetType": str(row.get("dataset_type") or "financial_workbook"),
    }


def get_settings() -> Dict[str, Any]:
    return read_platform_store()["settings"]


def update_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
    base_url = str(payload.get("localLlmBaseUrl", "")).strip()
    platform_base_url = str(payload.get("localLlmPlatformBaseUrl", "")).strip()
    api_key = str(payload.get("localLlmApiKey", "")).strip()
    model = str(payload.get("localLlmModel", "")).strip()
    default_financial_year = str(payload.get("defaultFinancialYear", "")).strip()
    temperature = float(payload.get("localLlmTemperature", 0.2))
    local_llm_enabled = bool(payload.get("localLlmEnabled", False))
    show_restricted_role_budgets = bool(payload.get("showRestrictedRoleBudgets", False))

    if not base_url or not model or not default_financial_year:
        raise HTTPException(status_code=400, detail="Complete every settings field.")

    if default_financial_year not in list_financial_years():
        raise HTTPException(status_code=400, detail="Choose a valid financial year.")

    if temperature < 0 or temperature > 1:
        raise HTTPException(status_code=400, detail="Temperature must be between 0 and 1.")

    store = read_platform_store()
    store["settings"] = {
        **store["settings"],
        "localLlmEnabled": local_llm_enabled,
        "localLlmBaseUrl": base_url.rstrip("/"),
        "localLlmPlatformBaseUrl": platform_base_url.rstrip("/"),
        "localLlmApiKey": api_key,
        "localLlmModel": model,
        "localLlmTemperature": round(temperature, 2),
        "defaultFinancialYear": default_financial_year,
        "showRestrictedRoleBudgets": show_restricted_role_budgets,
    }
    write_platform_store(store)
    return store["settings"]


def build_admin_overview() -> Dict[str, Any]:
    rbac_store = read_rbac_store()
    uploads_summary = get_uploads_summary()
    budget_mapping = _build_budget_mapping_overview()
    users = rbac_store.get("users", [])
    uploads = uploads_summary["uploads"]
    mfa_users = [user for user in users if user.get("mfaRequired")]
    enrolled_users = [user for user in users if user.get("totpEnabled")]

    return {
        "status": "ready",
        "totals": {
            "users": len(users),
            "activeUsers": len([user for user in users if user.get("active")]),
            "roles": len(rbac_store.get("roles", [])),
            "mfaRequired": len(mfa_users),
            "mfaEnrolled": len(enrolled_users),
            "uploads": len(uploads),
            "locations": len(rbac_store.get("catalogs", {}).get("geos", []))
            + len(rbac_store.get("catalogs", {}).get("practices", [])),
            "mappedBudgetRows": int(budget_mapping.get("summary", {}).get("mappedRows") or 0),
        },
        "latestUploads": uploads[:5],
        "localLlm": read_platform_store()["settings"],
        "users": get_user_summaries()[:6],
        "budgetMapping": budget_mapping,
    }


def _build_budget_mapping_overview() -> Dict[str, Any]:
    fallback = {
        "latestBatchId": None,
        "financialYear": None,
        "updatedAt": None,
        "summary": {
            "totalRows": 0,
            "validRows": 0,
            "mappedRows": 0,
            "autoEnrichedRows": 0,
            "manualApprovedRows": 0,
            "manualReviewRows": 0,
            "unmatchedRows": 0,
            "errorRows": 0,
            "coveragePercent": 0.0,
        },
        "mappedRows": [],
        "logicalMappings": [],
    }

    try:
        ensure_postgres_schema()
        with open_database_connection(require=False) as connection:
            if connection is None:
                return fallback

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                        b.id::text as batch_id,
                        b.financial_year,
                        b.updated_at,
                        count(p.id) as total_rows,
                        sum(case when p.validation_status = 'Valid' then 1 else 0 end) as valid_rows,
                        sum(
                            case
                                when p.match_status in ('Auto Enriched', 'Exact Match', 'Fuzzy Match', 'Manual Review Approved')
                                then 1 else 0
                            end
                        ) as mapped_rows,
                        sum(case when p.match_status = 'Auto Enriched' then 1 else 0 end) as auto_enriched_rows,
                        sum(case when p.match_status = 'Manual Review Approved' then 1 else 0 end) as manual_approved_rows,
                        sum(case when p.match_status = 'Manual Review' then 1 else 0 end) as manual_review_rows,
                        sum(case when p.match_status = 'Unmatched' then 1 else 0 end) as unmatched_rows,
                        sum(
                            case
                                when p.validation_status = 'Error' or p.match_status = 'Validation Error'
                                then 1 else 0
                            end
                        ) as error_rows
                    from budget_upload_batches b
                    left join budget_upload_processed_rows p on p.upload_batch_id = b.id
                    group by b.id, b.financial_year, b.updated_at
                    order by b.updated_at desc
                    limit 1
                    """
                )
                summary_row = cursor.fetchone()

                if not summary_row:
                    return fallback

                batch_id = str(summary_row.get("batch_id") or "").strip()
                total_rows = int(summary_row.get("total_rows") or 0)
                mapped_rows = int(summary_row.get("mapped_rows") or 0)
                coverage = round((mapped_rows / total_rows) * 100, 2) if total_rows else 0.0

                mapped_preview: list[dict[str, Any]] = []
                logical_mappings: list[dict[str, Any]] = []
                if batch_id:
                    cursor.execute(
                        """
                        select
                            row_number,
                            processed_payload->>'customer_name' as customer_name,
                            processed_payload->>'project_name' as project_name,
                            processed_payload->>'ocn_number' as ocn_number,
                            processed_payload->>'emp_id' as emp_id,
                            match_status,
                            match_source,
                            match_confidence
                        from budget_upload_processed_rows
                        where upload_batch_id = %s::uuid
                          and match_status in ('Auto Enriched', 'Exact Match', 'Fuzzy Match', 'Manual Review Approved')
                        order by match_confidence desc, row_number asc
                        limit 14
                        """,
                        (batch_id,),
                    )
                    mapped_rows_result = cursor.fetchall()
                    for row in mapped_rows_result:
                        mapped_preview.append(
                            {
                                "rowNumber": int(row.get("row_number") or 0),
                                "customerName": str(row.get("customer_name") or ""),
                                "projectName": str(row.get("project_name") or ""),
                                "ocnNumber": str(row.get("ocn_number") or ""),
                                "empId": str(row.get("emp_id") or ""),
                                "matchStatus": str(row.get("match_status") or ""),
                                "matchSource": str(row.get("match_source") or ""),
                                "matchConfidence": float(row.get("match_confidence") or 0.0),
                            }
                        )
                    cursor.execute(
                        """
                        select
                            row_number,
                            processed_payload->>'customer_name' as customer_name,
                            processed_payload->>'project_name' as project_name,
                            processed_payload->>'ocn_number' as ocn_number,
                            processed_payload->>'emp_id' as emp_id,
                            processed_payload->>'mapping_key' as mapping_key,
                            coalesce(primary_identifier_type, '') as primary_identifier_type,
                            coalesce(primary_identifier_value, '') as primary_identifier_value,
                            coalesce(validation_status, '') as validation_status,
                            coalesce(validation_message, '') as validation_message,
                            coalesce(match_status, '') as match_status,
                            coalesce(match_source, '') as match_source,
                            coalesce(match_confidence, 0) as match_confidence,
                            coalesce(manual_review_reason, '') as manual_review_reason
                        from budget_upload_processed_rows
                        where upload_batch_id = %s::uuid
                        order by row_number asc
                        limit 5000
                        """,
                        (batch_id,),
                    )
                    logical_rows_result = cursor.fetchall()
                    for row in logical_rows_result:
                        logical_mappings.append(
                            {
                                "rowNumber": int(row.get("row_number") or 0),
                                "customerName": str(row.get("customer_name") or ""),
                                "projectName": str(row.get("project_name") or ""),
                                "ocnNumber": str(row.get("ocn_number") or ""),
                                "empId": str(row.get("emp_id") or ""),
                                "mappingKey": str(row.get("mapping_key") or ""),
                                "primaryIdentifierType": str(row.get("primary_identifier_type") or ""),
                                "primaryIdentifierValue": str(row.get("primary_identifier_value") or ""),
                                "validationStatus": str(row.get("validation_status") or ""),
                                "validationMessage": str(row.get("validation_message") or ""),
                                "matchStatus": str(row.get("match_status") or ""),
                                "matchSource": str(row.get("match_source") or ""),
                                "matchConfidence": float(row.get("match_confidence") or 0.0),
                                "manualReviewReason": str(row.get("manual_review_reason") or ""),
                            }
                        )

                updated_at = summary_row.get("updated_at")
                updated_at_value = (
                    updated_at.isoformat().replace("+00:00", "Z")
                    if isinstance(updated_at, datetime)
                    else None
                )

                return {
                    "latestBatchId": batch_id or None,
                    "financialYear": str(summary_row.get("financial_year") or "") or None,
                    "updatedAt": updated_at_value,
                    "summary": {
                        "totalRows": total_rows,
                        "validRows": int(summary_row.get("valid_rows") or 0),
                        "mappedRows": mapped_rows,
                        "autoEnrichedRows": int(summary_row.get("auto_enriched_rows") or 0),
                        "manualApprovedRows": int(summary_row.get("manual_approved_rows") or 0),
                        "manualReviewRows": int(summary_row.get("manual_review_rows") or 0),
                        "unmatchedRows": int(summary_row.get("unmatched_rows") or 0),
                        "errorRows": int(summary_row.get("error_rows") or 0),
                        "coveragePercent": coverage,
                    },
                    "mappedRows": mapped_preview,
                    "logicalMappings": logical_mappings,
                }
    except Exception:
        return fallback


def get_revenue_dashboard_data(filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return build_revenue_dashboard_payload(filters)


def get_revenue_overview_data(filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return build_revenue_overview_payload(filters)


def get_revenue_monthly_comparison_data(filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return build_revenue_monthly_comparison_payload(filters)


def get_revenue_budget_kiosk_data(filters: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return build_revenue_budget_kiosk_payload(filters)


def get_revenue_variance_comments(
    *,
    financial_year: str,
    comparison_month: str | None = None,
    table_ids: list[str] | None = None,
) -> Dict[str, Any]:
    return list_revenue_variance_comments(
        financial_year=financial_year,
        comparison_month=comparison_month,
        table_ids=table_ids,
    )


def save_revenue_variance_comment_entry(
    *,
    financial_year: str,
    comparison_month: str | None,
    table_id: str,
    row_label: str,
    variance_percent: float | int | None,
    comment_text: str,
    authored_by: str | None = None,
    author_role: str | None = None,
) -> Dict[str, Any]:
    return save_revenue_variance_comment(
        financial_year=financial_year,
        comparison_month=comparison_month,
        table_id=table_id,
        row_label=row_label,
        variance_percent=variance_percent,
        comment_text=comment_text,
        authored_by=authored_by,
        author_role=author_role,
    )


def _empty_revenue_dashboard(
    filters: Dict[str, str | None],
    database_status: Dict[str, str],
) -> Dict[str, Any]:
    return {
        "database": database_status,
        "selectedFilters": filters,
        "filters": {
            "financialYears": list_financial_years(),
            "regions": [],
            "practiceHeads": [],
            "geoHeads": [],
            "customerNames": [],
            "dealTypes": [],
            "businessTypes": [],
        },
        "summary": {
            "rowCount": 0,
            "resourceCount": 0,
            "customerCount": 0,
            "projectCount": 0,
            "totalBudget": 0.0,
            "totalOutlook": 0.0,
            "totalActual": 0.0,
            "totalVariance": 0.0,
        },
        "monthlySeries": [
            {"month": label, "budget": 0.0, "forecast": 0.0, "actual": 0.0, "variance": 0.0}
            for label, *_ in MONTH_SEQUENCE
        ],
        "topCustomers": [],
        "topRegions": [],
        "resourceTable": [],
        "dataset": {
            "uploadId": None,
            "financialYear": filters.get("financialYear"),
            "originalFilename": None,
            "uploadedAt": None,
            "importedRows": 0,
            "parsedSheets": [],
        },
        "highlights": [
            "Upload a workbook from admin to populate the PostgreSQL-backed revenue dashboard.",
            database_status["message"],
        ],
    }


def _normalize_dashboard_filters(filters: Dict[str, Any] | None) -> Dict[str, str | None]:
    selected = filters or {}
    return {
        "financialYear": _clean_filter_value(selected.get("financialYear")),
        "region": _clean_filter_value(selected.get("region")),
        "practiceHead": _clean_filter_value(selected.get("practiceHead")),
        "geoHead": _clean_filter_value(selected.get("geoHead")),
        "customerName": _clean_filter_value(selected.get("customerName")),
        "dealType": _clean_filter_value(selected.get("dealType")),
        "businessType": _clean_filter_value(selected.get("businessType")),
    }


def _clean_filter_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.upper() == "ALL":
        return None
    return text


def _build_revenue_where_clause(filters: Dict[str, str | None]) -> tuple[str, list[Any]]:
    conditions = ["u.is_active = true"]
    params: list[Any] = []

    for filter_key, column_name in FILTER_COLUMN_MAP.items():
        value = filters.get(filter_key)
        if not value:
            continue
        conditions.append(f"{column_name} = %s")
        params.append(value)

    return f"where {' and '.join(conditions)}", params


def _fetch_distinct_values(
    cursor: Any,
    column_name: str,
    where_sql: str = "where u.is_active = true",
    params: list[Any] | None = None,
) -> list[str]:
    resolved_column = column_name if "." in column_name else f"r.{column_name}"
    cursor.execute(
        f"""
        select distinct {resolved_column} as value
        from financial_records r
        join financial_workbook_uploads u on u.id = r.upload_id
        {where_sql}
        and nullif({resolved_column}, '') is not null
        order by value asc
        """,
        params or [],
    )
    return [str(row["value"]) for row in cursor.fetchall() if row.get("value")]


def _aggregate_sum_expression(columns: tuple[str, ...], alias: str = "r") -> str:
    if not columns:
        return "0"
    row_expression = " + ".join(f"coalesce({alias}.{column}, 0)" for column in columns)
    return f"coalesce(sum({row_expression}), 0)"


def _monthly_sum_selects(alias: str = "r") -> list[str]:
    selects: list[str] = []
    for _, budget_key, forecast_key, actual_key, variance_key in MONTH_SEQUENCE:
        selects.append(f"coalesce(sum({alias}.{budget_key}), 0) as {budget_key}")
        selects.append(f"coalesce(sum({alias}.{forecast_key}), 0) as {forecast_key}")
        if actual_key:
            selects.append(f"coalesce(sum({alias}.{actual_key}), 0) as {actual_key}")
        if variance_key:
            selects.append(f"coalesce(sum({alias}.{variance_key}), 0) as {variance_key}")
    return selects


def _build_monthly_series(monthly_row: Dict[str, Any]) -> list[Dict[str, float | str]]:
    series: list[Dict[str, float | str]] = []
    for label, budget_key, forecast_key, actual_key, variance_key in MONTH_SEQUENCE:
        series.append(
            {
                "month": label,
                "budget": _to_float(monthly_row.get(budget_key)),
                "forecast": _to_float(monthly_row.get(forecast_key)),
                "actual": _to_float(monthly_row.get(actual_key)) if actual_key else 0.0,
                "variance": _to_float(monthly_row.get(variance_key)) if variance_key else 0.0,
            }
        )
    return series


def _serialize_breakdown_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "label": str(row.get("label") or "Unassigned"),
        "budget": _to_float(row.get("fy_bgt")),
        "outlook": _to_float(row.get("fy_outlook")),
        "actual": _to_float(row.get("actual_total")),
        "variance": _to_float(row.get("variance_total")),
    }


def _serialize_resource_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "resourceId": str(row.get("resource_id") or ""),
        "resourceName": str(row.get("resource_name") or "Unnamed resource"),
        "customerName": str(row.get("customer_name") or "Unassigned"),
        "projectName": str(row.get("project_name") or "Unassigned"),
        "region": str(row.get("region") or "Unassigned"),
        "practiceHead": str(row.get("practice_head") or "Unassigned"),
        "geoHead": str(row.get("geo_head") or "Unassigned"),
        "billRate": _to_float(row.get("bill_rate")),
        "startDate": _serialize_date(row.get("start_date")),
        "endDate": _serialize_date(row.get("end_date")),
        "budget": _to_float(row.get("fy_bgt")),
        "outlook": _to_float(row.get("fy_outlook")),
        "variance": _to_float(row.get("variance_total")),
    }


def _serialize_dataset_row(row: Dict[str, Any], filters: Dict[str, str | None]) -> Dict[str, Any]:
    uploaded_at = row.get("uploaded_at")
    uploaded_at_value = (
        uploaded_at.isoformat().replace("+00:00", "Z")
        if isinstance(uploaded_at, datetime)
        else None
    )
    return {
        "uploadId": str(row.get("id") or "") or None,
        "financialYear": str(row.get("financial_year") or filters.get("financialYear") or ""),
        "originalFilename": str(row.get("original_filename") or "") or None,
        "uploadedAt": uploaded_at_value,
        "importedRows": int(row.get("imported_rows") or 0),
        "parsedSheets": list(row.get("parsed_sheets") or []),
    }


def _build_dashboard_highlights(
    summary: Dict[str, Any],
    dataset: Dict[str, Any],
    top_customers: list[Dict[str, Any]],
    filters: Dict[str, str | None],
) -> list[str]:
    highlights: list[str] = []

    if dataset.get("originalFilename"):
        highlights.append(
            f"Latest active workbook: {dataset['originalFilename']} with {dataset['importedRows']} imported rows."
        )

    if summary["resourceCount"]:
        highlights.append(
            f"{summary['resourceCount']} resources are visible in the current operating slice."
        )

    if top_customers:
        lead_customer = top_customers[0]
        highlights.append(
            f"Top customer by outlook is {lead_customer['label']} at {_format_currency_short(lead_customer['outlook'])}."
        )

    if summary["totalVariance"]:
        tone = "ahead of plan" if summary["totalVariance"] >= 0 else "below plan"
        highlights.append(
            f"Aggregate variance is {_format_currency_short(abs(summary['totalVariance']))} {tone}."
        )

    selected_parts = []
    for label, key in (
        ("year", "financialYear"),
        ("region", "region"),
        ("practice head", "practiceHead"),
        ("customer", "customerName"),
    ):
        if filters.get(key):
            selected_parts.append(f"{label}: {filters[key]}")

    if selected_parts:
        highlights.append("Current filters: " + ", ".join(selected_parts) + ".")

    if not highlights:
        highlights.append("Upload a workbook to begin exploring the operating view.")

    return highlights[:4]


def build_workspace_dashboard(role_name: str, geo: str, practice: str) -> Dict[str, Any]:
    fiscal_year = get_settings()["defaultFinancialYear"]
    dashboard = get_revenue_dashboard_data({"financialYear": fiscal_year})
    summary = dashboard["summary"]

    return {
        "headline": {
            "title": "Revenue control tower",
            "subtitle": "Interactive dashboard fed from the latest uploaded workbook in PostgreSQL.",
        },
        "cards": [
            {
                "label": "Active model year",
                "value": dashboard["dataset"]["financialYear"] or fiscal_year,
                "detail": "Current upload slice used for the executive workspace.",
            },
            {
                "label": "FY budget",
                "value": _format_currency_short(summary["totalBudget"]),
                "detail": f"{summary['resourceCount']} resources in view.",
            },
            {
                "label": "FY outlook",
                "value": _format_currency_short(summary["totalOutlook"]),
                "detail": f"{summary['customerCount']} customer accounts represented.",
            },
            {
                "label": "Role posture",
                "value": role_name,
                "detail": f"Geo scope {geo} and practice scope {practice}.",
            },
        ],
        "highlights": dashboard["highlights"],
    }


def build_workspace_slicers() -> Dict[str, Any]:
    dashboard = get_revenue_dashboard_data()
    return {
        "geographies": _merge_distinct_values(
            dashboard["filters"]["regions"],
            dashboard["filters"]["geoHeads"],
        ),
        "practices": dashboard["filters"]["practiceHeads"],
        "financialYears": dashboard["filters"]["financialYears"],
        "recommendedViews": [
            "Budget vs outlook by month",
            "Customer mix by outlook",
            "Region variance heat map",
            "Resource-level variance watchlist",
        ],
    }


def build_predictions() -> Dict[str, Any]:
    fiscal_year = get_settings()["defaultFinancialYear"]
    dashboard = get_revenue_dashboard_data({"financialYear": fiscal_year})
    summary = dashboard["summary"]

    total_budget = summary["totalBudget"]
    total_outlook = summary["totalOutlook"]
    total_actual = summary["totalActual"]
    total_variance = summary["totalVariance"]

    attainment = (total_actual / total_budget * 100) if total_budget else 0.0
    outlook_delta = ((total_outlook - total_budget) / total_budget * 100) if total_budget else 0.0
    variance_resources = len(
        [row for row in dashboard["resourceTable"][:12] if abs(row["variance"]) > 0]
    )

    return {
        "scenarios": [
            {
                "name": "Budget attainment",
                "value": f"{attainment:.1f}%",
                "detail": "Reported actuals as a share of the loaded full-year budget.",
            },
            {
                "name": "FY outlook delta",
                "value": f"{outlook_delta:+.1f}%",
                "detail": "Current uploaded outlook against the planned annual budget.",
            },
            {
                "name": "Variance watch",
                "value": f"{variance_resources} resources",
                "detail": f"Resource rows showing variance movement. Net variance: {_format_currency_short(total_variance)}.",
            },
        ]
    }


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _serialize_date(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value in (None, ""):
        return None
    return str(value)


def _format_currency_short(value: float) -> str:
    absolute = abs(value)
    if absolute >= 1_000_000_000:
        return f"{value / 1_000_000_000:.1f}B"
    if absolute >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if absolute >= 1_000:
        return f"{value / 1_000:.1f}K"
    return f"{value:.0f}"


def _merge_distinct_values(*collections: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for collection in collections:
        for value in collection:
            text = str(value or "").strip()
            if not text:
                continue
            lowered = text.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            output.append(text)
    return sorted(output, key=str.lower)
