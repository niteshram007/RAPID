from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from fastapi import HTTPException

from ..masterdata_dataset import parse_masterdata_workbook
from ..masterdata_store import _sync_budget_upload_into_rapid_revenue
from ..postgres import ensure_postgres_schema, open_database_connection
from .budget_processing_service import refresh_budget_data
from .trend_summary_service import refresh_trend_analytics

try:
    from rapidfuzz import fuzz
except Exception:  # pragma: no cover
    fuzz = None  # type: ignore[assignment]

MONTH_COLUMN_KEYS = (
    "apr_2026",
    "may_2026",
    "jun_2026",
    "jul_2026",
    "aug_2026",
    "sep_2026",
    "oct_2026",
    "nov_2026",
    "dec_2026",
    "jan_2027",
    "feb_2027",
    "mar_2027",
)

BUDGET_NUMERIC_INPUT_KEYS = (
    *MONTH_COLUMN_KEYS,
    "fy",
    "q1",
    "q2",
    "q3",
    "q4",
    "bill_rate",
    "forex",
    "billed_hours",
    "billable_actual_hrs",
)

BUDGET_RECORD_INSERT_COLUMNS = (
    "upload_id",
    "financial_year",
    "source_sheet",
    "source_row_number",
    "business_key",
    "raw_payload",
    "customer_name",
    "updated_customer",
    "original_customer_name",
    "standard_customer_name",
    "customer_group_key",
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
    "rate_type",
    "billed_currency",
    "forex",
    "type_of_projects",
    "billed_hours",
    "billable_actual_hrs",
    "start_date",
    "end_date",
    "apr_2026",
    "may_2026",
    "jun_2026",
    "jul_2026",
    "aug_2026",
    "sep_2026",
    "oct_2026",
    "nov_2026",
    "dec_2026",
    "jan_2027",
    "feb_2027",
    "mar_2027",
    "fy",
    "project_name",
    "original_project_name",
    "standard_project_name",
    "project_group_key",
    "client_name",
    "ocn_number",
    "practice_head",
    "bdm",
    "geo_head",
    "vertical",
    "horizontal",
    "q1",
    "q2",
    "q3",
    "q4",
    "primary_reference_type",
    "primary_reference_value",
    "mapping_status",
    "mapping_confidence",
    "mapping_reason",
    "needs_manual_review",
    "updated_by",
    "updated_at",
)

ENRICHABLE_FIELDS = (
    "company",
    "region",
    "geo_head",
    "bdm",
    "vertical",
    "horizontal",
    "practice_head",
    "type_of_projects",
    "rate_type",
    "billed_currency",
    "strategic_account",
    "eeennn",
    "sbu",
    "sub_sbu",
    "dept",
    "service_line",
    "delivery_manager",
    "buh",
    "region_summary",
    "sales_region",
    "group_company",
    "updated_customer",
)

FIELD_ALIAS_MAP: dict[str, str] = {
    "customer name": "customer_name",
    "customer": "customer_name",
    "customer_name": "customer_name",
    "updated customer": "updated_customer",
    "updated_customer": "updated_customer",
    "project name": "project_name",
    "project": "project_name",
    "project_name": "project_name",
    "resource name": "resource_name",
    "resource_name": "resource_name",
    "ps/ms budget": "ps_ms_budget",
    "ms/ps budget": "ps_ms_budget",
    "ms/ps": "ps_ms_budget",
    "ps/ms": "ps_ms_budget",
    "ms ps": "ps_ms_budget",
    "ps ms": "ps_ms_budget",
    "ps_ms_budget": "ps_ms_budget",
    "ms_ps": "ps_ms_budget",
    "emp id": "emp_id",
    "employee id": "emp_id",
    "resource id": "emp_id",
    "emp_id": "emp_id",
    "ocn number": "ocn_number",
    "ocn": "ocn_number",
    "ocn no": "ocn_number",
    "ocn_number": "ocn_number",
    "company": "company",
    "entity": "company",
    "region": "region",
    "region 2": "region",
    "row/us": "row_us",
    "row us": "row_us",
    "row_us": "row_us",
    "geohead": "geo_head",
    "geo head": "geo_head",
    "geo_head": "geo_head",
    "bdm": "bdm",
    "vertical": "vertical",
    "horizontal": "horizontal",
    "practice head": "practice_head",
    "practice_head": "practice_head",
    "type of projects": "type_of_projects",
    "type of project": "type_of_projects",
    "type_of_projects": "type_of_projects",
    "rate type": "rate_type",
    "ratetype": "rate_type",
    "rate_type": "rate_type",
    "billed currency": "billed_currency",
    "billed currency ": "billed_currency",
    "billed_currency": "billed_currency",
    "bill rate": "bill_rate",
    "bill_rate": "bill_rate",
    "deal type": "deal_type",
    "deal_type": "deal_type",
    "eeennn": "eeennn",
    "eenenn": "eeennn",
    "sbu": "sbu",
    "sub-sbu": "sub_sbu",
    "sub sbu": "sub_sbu",
    "sub_sbu": "sub_sbu",
    "dept": "dept",
    "department": "dept",
    "service line": "service_line",
    "service_line": "service_line",
    "delivery manager": "delivery_manager",
    "delivery_manager": "delivery_manager",
    "buh": "buh",
    "region summary": "region_summary",
    "region_summary": "region_summary",
    "sales region": "sales_region",
    "sales_region": "sales_region",
    "group company": "group_company",
    "group_company": "group_company",
    "strategic account": "strategic_account",
    "strategic_account": "strategic_account",
    "start date": "start_date",
    "end date": "end_date",
    "fy": "fy",
    "q1": "q1",
    "q2": "q2",
    "q3": "q3",
    "q4": "q4",
    "apr-26": "apr_2026",
    "apr 26": "apr_2026",
    "apr-2026": "apr_2026",
    "apr 2026": "apr_2026",
    "apr_2026": "apr_2026",
    "may-26": "may_2026",
    "may 26": "may_2026",
    "may-2026": "may_2026",
    "may 2026": "may_2026",
    "may_2026": "may_2026",
    "jun-26": "jun_2026",
    "jun 26": "jun_2026",
    "jun-2026": "jun_2026",
    "jun 2026": "jun_2026",
    "jun_2026": "jun_2026",
    "jul-26": "jul_2026",
    "jul 26": "jul_2026",
    "jul-2026": "jul_2026",
    "jul 2026": "jul_2026",
    "jul_2026": "jul_2026",
    "aug-26": "aug_2026",
    "aug 26": "aug_2026",
    "aug-2026": "aug_2026",
    "aug 2026": "aug_2026",
    "aug_2026": "aug_2026",
    "sep-26": "sep_2026",
    "sep 26": "sep_2026",
    "sep-2026": "sep_2026",
    "sep 2026": "sep_2026",
    "sep_2026": "sep_2026",
    "oct-26": "oct_2026",
    "oct 26": "oct_2026",
    "oct-2026": "oct_2026",
    "oct 2026": "oct_2026",
    "oct_2026": "oct_2026",
    "nov-26": "nov_2026",
    "nov 26": "nov_2026",
    "nov-2026": "nov_2026",
    "nov 2026": "nov_2026",
    "nov_2026": "nov_2026",
    "dec-26": "dec_2026",
    "dec 26": "dec_2026",
    "dec-2026": "dec_2026",
    "dec 2026": "dec_2026",
    "dec_2026": "dec_2026",
    "jan-27": "jan_2027",
    "jan 27": "jan_2027",
    "jan-2027": "jan_2027",
    "jan 2027": "jan_2027",
    "jan_2027": "jan_2027",
    "feb-27": "feb_2027",
    "feb 27": "feb_2027",
    "feb-2027": "feb_2027",
    "feb 2027": "feb_2027",
    "feb_2027": "feb_2027",
    "mar-27": "mar_2027",
    "mar 27": "mar_2027",
    "mar-2027": "mar_2027",
    "mar 2027": "mar_2027",
    "mar_2027": "mar_2027",
}

ACTUAL_ALIAS_OVERRIDES = {
    "ms_ps": "ps_ms_budget",
}

MONTH_RANK = {
    "apr": 1,
    "may": 2,
    "jun": 3,
    "jul": 4,
    "aug": 5,
    "sep": 6,
    "oct": 7,
    "nov": 8,
    "dec": 9,
    "jan": 10,
    "feb": 11,
    "mar": 12,
}

COMPANY_SUFFIX_TOKENS = {
    "pvt",
    "private",
    "ltd",
    "limited",
    "inc",
    "llc",
    "corporation",
    "corp",
}


@dataclass
class MappingIndex:
    customer_by_alias: dict[str, dict[str, Any]]
    customer_by_reference: dict[str, dict[str, Any]]
    project_by_alias: dict[str, dict[str, Any]]
    project_by_reference: dict[str, dict[str, Any]]


@dataclass
class MatchResult:
    matched_row: dict[str, Any] | None
    match_status: str
    match_confidence: float
    match_source: str
    manual_review_reason: str
    suggestions: list[dict[str, Any]]
    ambiguous: bool = False


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_name_for_compare(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split(" ")
    while len(tokens) >= 2 and tokens[-2:] == ["private", "limited"]:
        tokens = tokens[:-2]
    while tokens and tokens[-1] in COMPANY_SUFFIX_TOKENS:
        tokens = tokens[:-1]
    return " ".join(tokens).strip()


def build_customer_group_key(value: Any) -> str:
    comparable = normalize_name_for_compare(value)
    if comparable:
        return clean_key(comparable)
    return clean_key(value)


def build_project_group_key(customer_group_key: str, project_name: Any) -> str:
    project_key = clean_key(normalize_name_for_compare(project_name) or project_name)
    if customer_group_key and project_key:
        return f"{customer_group_key}_{project_key}"
    return project_key or customer_group_key


def _normalize_reference_lookup_key(reference_type: Any, reference_value: Any) -> str:
    normalized_reference_type = str(reference_type or "").strip().upper()
    normalized_reference_value = clean_reference_key(reference_value)
    if not normalized_reference_type or not normalized_reference_value:
        return ""
    return f"{normalized_reference_type}::{normalized_reference_value}"


def normalize_column_name(column_name: str) -> str:
    normalized = re.sub(r"[_\-\s]+", " ", str(column_name or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if normalized in FIELD_ALIAS_MAP:
        return FIELD_ALIAS_MAP[normalized]
    compact = normalized.replace(" ", "")
    return FIELD_ALIAS_MAP.get(compact, normalized.replace(" ", "_"))


def normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {
        column: normalize_column_name(str(column))
        for column in df.columns
    }
    return df.rename(columns=renamed)


def normalize_ms_ps(value: Any) -> str:
    text = str(value or "").strip().lower()
    compact = re.sub(r"[^a-z]", "", text)
    if compact in {"ps", "professionalservices", "professionalservice", "professional"}:
        return "PS"
    if compact.startswith("ps") or compact.startswith("professional"):
        return "PS"
    if compact in {"ms", "managedservices", "managedservice", "managed"}:
        return "MS"
    if compact.startswith("ms") or compact.startswith("managed"):
        return "MS"
    return ""


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float):
        return pd.isna(value)
    if isinstance(value, str):
        return not value.strip()
    return False


def _json_safe_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value) if value.is_finite() else None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): _json_safe_value(inner_value) for key, inner_value in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe_value(inner_value) for inner_value in value]
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _json_dumps(value: Any) -> str:
    return json.dumps(_json_safe_value(value), allow_nan=False)


def _coerce_budget_numeric_value(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value) if value.is_finite() else default
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if math.isfinite(numeric) else default
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    if not text or text.upper() in {"#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NUM!", "#NULL!", "N/A", "NA", "NAN"}:
        return default
    negative = text.startswith("(") and text.endswith(")")
    cleaned = text.replace(",", "").replace("$", "").replace("%", "").strip()
    cleaned = cleaned.strip("()")
    cleaned = re.sub(r"[^0-9.\-]+", "", cleaned)
    if not cleaned:
        return default
    if negative and not cleaned.startswith("-"):
        cleaned = f"-{cleaned}"
    try:
        numeric = float(cleaned)
    except ValueError:
        return default
    return numeric if math.isfinite(numeric) else default


def _build_budget_record_insert_sql(insert_columns: tuple[str, ...]) -> str:
    placeholders = [
        "%s::jsonb" if column == "raw_payload"
        else "%s::timestamptz" if column == "updated_at"
        else "%s"
        for column in insert_columns
    ]
    return f"""
        insert into budget_records ({", ".join(insert_columns)})
        values ({", ".join(placeholders)})
    """


def _normalize_identifier_value(value: Any) -> str:
    if is_blank(value):
        return ""
    if isinstance(value, (int, Decimal)):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0+", text):
        return text.split(".")[0]
    return text


def clean_key(value: Any) -> str:
    text = _normalize_identifier_value(value).upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text).strip()
    text = re.sub(r"\s+", "_", text)
    return text


def clean_reference_key(value: Any) -> str:
    text = _normalize_identifier_value(value).upper()
    return re.sub(r"[^A-Z0-9]+", "", text).strip()


def generate_mapping_key(row: dict[str, Any]) -> str:
    normalized_ms_ps = normalize_ms_ps(row.get("ps_ms_budget"))
    customer_name = clean_key(row.get("customer_name"))
    project_name = clean_key(row.get("project_name"))
    if normalized_ms_ps == "PS":
        emp_id = clean_key(row.get("emp_id"))
        return f"PS_{emp_id}_{customer_name}_{project_name}"
    if normalized_ms_ps == "MS":
        ocn_number = clean_key(row.get("ocn_number"))
        return f"MS_{ocn_number}_{customer_name}_{project_name}"
    return f"NA_{clean_key(row.get('emp_id') or row.get('ocn_number'))}_{customer_name}_{project_name}"


def validate_budget_row(row: dict[str, Any], row_number: int) -> dict[str, Any]:
    normalized_ms_ps = normalize_ms_ps(row.get("ps_ms_budget"))
    if not normalized_ms_ps:
        return {
            "validation_status": "Error",
            "validation_message": "PS/MS budget is missing or invalid.",
            "primary_identifier_type": None,
            "primary_identifier_value": None,
            "normalized_ps_ms": "",
            "row_number": row_number,
        }

    if normalized_ms_ps == "PS":
        emp_id = _normalize_identifier_value(row.get("emp_id"))
        if not emp_id:
            return {
                "validation_status": "Error",
                "validation_message": "Emp ID is required for PS rows.",
                "primary_identifier_type": "Emp ID",
                "primary_identifier_value": "",
                "normalized_ps_ms": "PS",
                "row_number": row_number,
            }
        return {
            "validation_status": "Valid",
            "validation_message": "",
            "primary_identifier_type": "Emp ID",
            "primary_identifier_value": emp_id,
            "normalized_ps_ms": "PS",
            "row_number": row_number,
        }

    ocn_number = _normalize_identifier_value(row.get("ocn_number"))
    if not ocn_number:
        return {
            "validation_status": "Error",
            "validation_message": "OCN Number is required for MS rows.",
            "primary_identifier_type": "OCN Number",
            "primary_identifier_value": "",
            "normalized_ps_ms": "MS",
            "row_number": row_number,
        }
    return {
        "validation_status": "Valid",
        "validation_message": "",
        "primary_identifier_type": "OCN Number",
        "primary_identifier_value": ocn_number,
        "normalized_ps_ms": "MS",
        "row_number": row_number,
    }


def _row_month_rank(row: dict[str, Any]) -> int:
    raw_month = str(row.get("month") or row.get("effort_month") or "").strip().lower()
    token = raw_month[:3]
    return MONTH_RANK.get(token, 0)


def _build_lookup_key(*parts: Any) -> str:
    return "|".join(clean_key(part) for part in parts if not is_blank(part))


def _build_reference_lookup_key(value: Any) -> str:
    return clean_reference_key(value)


def _normalize_actual_or_master_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        alias_key = normalize_column_name(key)
        normalized[alias_key] = value
    for source_key, target_key in ACTUAL_ALIAS_OVERRIDES.items():
        if source_key in normalized and target_key not in normalized:
            normalized[target_key] = normalized[source_key]
    normalized["ps_ms_budget"] = normalize_ms_ps(normalized.get("ps_ms_budget"))
    normalized["emp_id"] = _normalize_identifier_value(normalized.get("emp_id"))
    normalized["ocn_number"] = _normalize_identifier_value(normalized.get("ocn_number"))
    return normalized


def load_mapping_index() -> MappingIndex:
    customer_by_alias: dict[str, dict[str, Any]] = {}
    customer_by_reference: dict[str, dict[str, Any]] = {}
    project_by_alias: dict[str, dict[str, Any]] = {}
    project_by_reference: dict[str, dict[str, Any]] = {}

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    cm.id::text as customer_mapping_id,
                    cm.standard_customer_name,
                    cm.customer_group_key,
                    cm.mapping_status,
                    ca.alias_customer_name,
                    ca.normalized_alias_customer_name,
                    ca.reference_type,
                    ca.reference_value
                from customer_mapping_master cm
                left join customer_mapping_alias ca on ca.customer_mapping_id = cm.id
                where lower(coalesce(cm.mapping_status, '')) = 'approved'
                  and coalesce(ca.active_flag, true) = true
                """
            )
            for row in cursor.fetchall():
                payload = {
                    "customer_mapping_id": row.get("customer_mapping_id"),
                    "standard_customer_name": row.get("standard_customer_name"),
                    "customer_group_key": row.get("customer_group_key"),
                    "mapping_status": row.get("mapping_status"),
                }
                normalized_alias = str(row.get("normalized_alias_customer_name") or "").strip()
                if normalized_alias:
                    customer_by_alias.setdefault(normalized_alias, payload)
                reference_key = _normalize_reference_lookup_key(
                    row.get("reference_type"),
                    row.get("reference_value"),
                )
                if reference_key:
                    customer_by_reference.setdefault(reference_key, payload)

            cursor.execute(
                """
                select
                    pm.id::text as project_mapping_id,
                    pm.customer_mapping_id::text as customer_mapping_id,
                    pm.standard_project_name,
                    pm.project_group_key,
                    pm.mapping_status,
                    pa.alias_project_name,
                    pa.normalized_alias_project_name,
                    pa.reference_type,
                    pa.reference_value
                from project_mapping_master pm
                left join project_mapping_alias pa on pa.project_mapping_id = pm.id
                where lower(coalesce(pm.mapping_status, '')) = 'approved'
                  and coalesce(pa.active_flag, true) = true
                """
            )
            for row in cursor.fetchall():
                payload = {
                    "project_mapping_id": row.get("project_mapping_id"),
                    "customer_mapping_id": row.get("customer_mapping_id"),
                    "standard_project_name": row.get("standard_project_name"),
                    "project_group_key": row.get("project_group_key"),
                    "mapping_status": row.get("mapping_status"),
                }
                normalized_alias = str(row.get("normalized_alias_project_name") or "").strip()
                if normalized_alias:
                    project_by_alias.setdefault(normalized_alias, payload)
                reference_key = _normalize_reference_lookup_key(
                    row.get("reference_type"),
                    row.get("reference_value"),
                )
                if reference_key:
                    project_by_reference.setdefault(reference_key, payload)

    return MappingIndex(
        customer_by_alias=customer_by_alias,
        customer_by_reference=customer_by_reference,
        project_by_alias=project_by_alias,
        project_by_reference=project_by_reference,
    )


def _resolve_standard_customer_name(
    *,
    row: dict[str, Any],
    matched_row: dict[str, Any] | None,
    mapping_index: MappingIndex | None,
) -> tuple[str, str, str]:
    reference_key = _normalize_reference_lookup_key(
        row.get("primary_identifier_type"),
        row.get("primary_identifier_value"),
    )
    if mapping_index is not None and reference_key:
        approved = mapping_index.customer_by_reference.get(reference_key)
        if approved:
            return (
                str(approved.get("standard_customer_name") or "").strip(),
                str(approved.get("customer_group_key") or "").strip(),
                "approved_customer_mapping_reference",
            )

    for candidate in (
        row.get("customer_name"),
        row.get("original_customer_name"),
        row.get("updated_customer"),
        matched_row.get("updated_customer") if matched_row else None,
        matched_row.get("customer_name") if matched_row else None,
    ):
        normalized_alias = normalize_name_for_compare(candidate)
        if not normalized_alias or mapping_index is None:
            continue
        approved = mapping_index.customer_by_alias.get(normalized_alias)
        if approved:
            return (
                str(approved.get("standard_customer_name") or "").strip(),
                str(approved.get("customer_group_key") or "").strip(),
                "approved_customer_mapping_alias",
            )

    if matched_row:
        source_value = _first_non_blank(
            [
                matched_row.get("updated_customer"),
                matched_row.get("customer_name"),
            ]
        )
        if source_value is not None and str(source_value).strip():
            standard = str(source_value).strip()
            return (
                standard,
                build_customer_group_key(standard),
                "matched_actual_customer",
            )

    fallback = str(
        _first_non_blank([row.get("updated_customer"), row.get("customer_name"), row.get("original_customer_name")]) or ""
    ).strip()
    if not fallback:
        return "", "", "missing_customer"
    return fallback, build_customer_group_key(fallback), "budget_customer_fallback"


def _resolve_standard_project_name(
    *,
    row: dict[str, Any],
    matched_row: dict[str, Any] | None,
    mapping_index: MappingIndex | None,
    customer_group_key: str,
) -> tuple[str, str, str]:
    reference_key = _normalize_reference_lookup_key(
        row.get("primary_identifier_type"),
        row.get("primary_identifier_value"),
    )
    if mapping_index is not None and reference_key:
        approved = mapping_index.project_by_reference.get(reference_key)
        if approved:
            standard = str(approved.get("standard_project_name") or "").strip()
            group_key = str(approved.get("project_group_key") or "").strip()
            if standard:
                return standard, group_key or build_project_group_key(customer_group_key, standard), "approved_project_mapping_reference"

    for candidate in (
        row.get("project_name"),
        row.get("original_project_name"),
        matched_row.get("project_name") if matched_row else None,
    ):
        normalized_alias = normalize_name_for_compare(candidate)
        if not normalized_alias or mapping_index is None:
            continue
        approved = mapping_index.project_by_alias.get(normalized_alias)
        if approved:
            standard = str(approved.get("standard_project_name") or "").strip()
            group_key = str(approved.get("project_group_key") or "").strip()
            if standard:
                return standard, group_key or build_project_group_key(customer_group_key, standard), "approved_project_mapping_alias"

    if matched_row and str(matched_row.get("project_name") or "").strip():
        standard = str(matched_row.get("project_name") or "").strip()
        return standard, build_project_group_key(customer_group_key, standard), "matched_actual_project"

    fallback = str(_first_non_blank([row.get("project_name"), row.get("original_project_name")]) or "").strip()
    if not fallback:
        return "", "", "missing_project"
    return fallback, build_project_group_key(customer_group_key, fallback), "budget_project_fallback"


def build_actuals_lookup(actuals_rows: list[dict[str, Any]]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    lookup: dict[str, dict[str, list[dict[str, Any]]]] = {
        "emp_project_customer_lookup": {},
        "emp_customer_lookup": {},
        "emp_lookup": {},
        "ocn_lookup": {},
        "ocn_project_lookup": {},
        "customer_project_lookup": {},
    }

    normalized_rows = [_normalize_actual_or_master_row(row) for row in actuals_rows]
    normalized_rows.sort(key=_row_month_rank, reverse=True)

    for row in normalized_rows:
        emp_id = row.get("emp_id")
        ocn_number = row.get("ocn_number")
        customer_name = row.get("customer_name")
        project_name = row.get("project_name")

        emp_project_customer_key = _build_lookup_key(emp_id, customer_name, project_name)
        if emp_project_customer_key:
            lookup["emp_project_customer_lookup"].setdefault(emp_project_customer_key, []).append(row)

        emp_customer_key = _build_lookup_key(emp_id, customer_name)
        if emp_customer_key:
            lookup["emp_customer_lookup"].setdefault(emp_customer_key, []).append(row)

        emp_key = _build_reference_lookup_key(emp_id)
        if emp_key:
            lookup["emp_lookup"].setdefault(emp_key, []).append(row)

        ocn_key = _build_reference_lookup_key(ocn_number)
        if ocn_key:
            lookup["ocn_lookup"].setdefault(ocn_key, []).append(row)

        ocn_project_key = _build_lookup_key(ocn_number, project_name)
        if ocn_project_key:
            lookup["ocn_project_lookup"].setdefault(ocn_project_key, []).append(row)

        customer_project_key = _build_lookup_key(customer_name, project_name)
        if customer_project_key:
            lookup["customer_project_lookup"].setdefault(customer_project_key, []).append(row)

    return lookup


def _to_suggestion(row: dict[str, Any], confidence: float) -> dict[str, Any]:
    return {
        "ps_ms_budget": row.get("ps_ms_budget"),
        "emp_id": row.get("emp_id"),
        "ocn_number": row.get("ocn_number"),
        "customer_name": row.get("customer_name"),
        "project_name": row.get("project_name"),
        "match_confidence": round(float(confidence), 2),
        "source": row.get("_match_source") or "Actuals",
    }


def _candidate_identity(row: dict[str, Any]) -> str:
    return "|".join(
        [
            normalize_ms_ps(row.get("ps_ms_budget")),
            clean_reference_key(row.get("emp_id")),
            clean_reference_key(row.get("ocn_number")),
            clean_key(row.get("customer_name")),
            clean_key(row.get("project_name")),
        ]
    )


def _dedupe_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in candidates:
        identity = _candidate_identity(row)
        if identity in seen:
            continue
        seen.add(identity)
        unique.append(row)
    return unique


def _tokenize_for_match(value: Any) -> set[str]:
    normalized = normalize_name_for_compare(value)
    if not normalized:
        return set()
    return {token for token in normalized.split(" ") if token}


def _token_overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left.intersection(right))
    union = len(left.union(right))
    if union == 0:
        return 0.0
    return intersection / union


def _candidate_customer_group(row: dict[str, Any]) -> str:
    source = _first_non_blank([row.get("updated_customer"), row.get("customer_name")])
    return build_customer_group_key(source)


def _candidate_project_group(row: dict[str, Any]) -> str:
    return clean_key(normalize_name_for_compare(row.get("project_name")) or row.get("project_name"))


def _select_best_reference_candidate(
    budget_row: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, bool]:
    if not candidates:
        return None, False

    normalized_ms_ps = normalize_ms_ps(budget_row.get("ps_ms_budget"))
    scoped = [
        candidate
        for candidate in candidates
        if not normalize_ms_ps(candidate.get("ps_ms_budget"))
        or normalize_ms_ps(candidate.get("ps_ms_budget")) == normalized_ms_ps
    ]
    scoped = _dedupe_candidates(scoped or candidates)
    if not scoped:
        return None, False
    if len(scoped) == 1:
        return scoped[0], False

    customer_groups = {
        group_key
        for group_key in (_candidate_customer_group(candidate) for candidate in scoped)
        if group_key
    }
    if len(customer_groups) > 1:
        return None, True

    budget_project_tokens = _tokenize_for_match(budget_row.get("project_name"))

    def _rank(candidate: dict[str, Any]) -> tuple[float, int, int, int]:
        candidate_project_tokens = _tokenize_for_match(candidate.get("project_name"))
        project_overlap = _token_overlap(budget_project_tokens, candidate_project_tokens)
        month_rank = _row_month_rank(candidate)
        has_updated_customer = 1 if str(candidate.get("updated_customer") or "").strip() else 0
        has_customer_name = 1 if str(candidate.get("customer_name") or "").strip() else 0
        return (project_overlap, month_rank, has_updated_customer, has_customer_name)

    best_candidate = max(scoped, key=_rank)
    return best_candidate, False


def find_exact_match(row: dict[str, Any], actuals_lookup: dict[str, dict[str, list[dict[str, Any]]]]) -> MatchResult:
    normalized_ms_ps = normalize_ms_ps(row.get("ps_ms_budget"))
    emp_id = row.get("emp_id")
    ocn_number = row.get("ocn_number")

    if normalized_ms_ps == "PS":
        key = _build_reference_lookup_key(emp_id)
        candidates = actuals_lookup["emp_lookup"].get(key, []) if key else []
        if candidates:
            deduped = _dedupe_candidates(candidates)
            if len(deduped) == 1:
                return MatchResult(
                    matched_row=deduped[0],
                    match_status="Exact Match",
                    match_confidence=100,
                    match_source=str(deduped[0].get("_match_source") or "Actuals"),
                    manual_review_reason="",
                    suggestions=[],
                )
            selected, ambiguous = _select_best_reference_candidate(row, deduped)
            if selected and not ambiguous:
                return MatchResult(
                    matched_row=selected,
                    match_status="Exact Match",
                    match_confidence=96,
                    match_source=str(selected.get("_match_source") or "Actuals"),
                    manual_review_reason="",
                    suggestions=[],
                )
            suggestions = [_to_suggestion(entry, 90) for entry in deduped[:5]]
            return MatchResult(
                matched_row=None,
                match_status="Manual Review",
                match_confidence=90,
                match_source=str(deduped[0].get("_match_source") or "Actuals"),
                manual_review_reason="Same Emp ID maps to multiple possible PS records.",
                suggestions=suggestions,
                ambiguous=True,
            )
        return MatchResult(
            matched_row=None,
            match_status="Unmatched",
            match_confidence=0,
            match_source="None",
            manual_review_reason="No Actuals record found for the PS Emp ID.",
            suggestions=[],
        )

    key = _build_reference_lookup_key(ocn_number)
    candidates = actuals_lookup["ocn_lookup"].get(key, []) if key else []
    if candidates:
        deduped = _dedupe_candidates(candidates)
        if len(deduped) == 1:
            return MatchResult(
                matched_row=deduped[0],
                match_status="Exact Match",
                match_confidence=100,
                match_source=str(deduped[0].get("_match_source") or "Actuals"),
                manual_review_reason="",
                suggestions=[],
            )
        selected, ambiguous = _select_best_reference_candidate(row, deduped)
        if selected and not ambiguous:
            return MatchResult(
                matched_row=selected,
                match_status="Exact Match",
                match_confidence=96,
                match_source=str(selected.get("_match_source") or "Actuals"),
                manual_review_reason="",
                suggestions=[],
            )
        suggestions = [_to_suggestion(entry, 90) for entry in deduped[:5]]
        return MatchResult(
            matched_row=None,
            match_status="Manual Review",
            match_confidence=90,
            match_source=str(deduped[0].get("_match_source") or "Actuals"),
            manual_review_reason="Same OCN Number maps to multiple possible MS records.",
            suggestions=suggestions,
            ambiguous=True,
        )

    return MatchResult(
        matched_row=None,
        match_status="Unmatched",
        match_confidence=0,
        match_source="None",
        manual_review_reason="No Actuals record found for the MS OCN Number.",
        suggestions=[],
    )


def find_fuzzy_match(
    row: dict[str, Any],
    actuals_rows: list[dict[str, Any]],
    auto_threshold: float = 92,
    manual_threshold: float = 80,
) -> MatchResult:
    if fuzz is None:
        return MatchResult(
            matched_row=None,
            match_status="Manual Review",
            match_confidence=0,
            match_source="None",
            manual_review_reason="RapidFuzz is unavailable; manual review required.",
            suggestions=[],
        )

    target = " ".join(
        [
            clean_key(row.get("customer_name")).replace("_", " "),
            clean_key(row.get("project_name")).replace("_", " "),
        ]
    ).strip()
    if not target:
        return MatchResult(
            matched_row=None,
            match_status="Manual Review",
            match_confidence=0,
            match_source="None",
            manual_review_reason="Customer/Project is missing for fuzzy matching.",
            suggestions=[],
        )

    scored: list[tuple[float, dict[str, Any]]] = []
    for candidate in actuals_rows:
        candidate_text = " ".join(
            [
                clean_key(candidate.get("customer_name")).replace("_", " "),
                clean_key(candidate.get("project_name")).replace("_", " "),
            ]
        ).strip()
        if not candidate_text:
            continue
        token_sort = float(fuzz.token_sort_ratio(target, candidate_text))
        token_set = float(fuzz.token_set_ratio(target, candidate_text))
        score = max(token_sort, token_set)
        scored.append((score, candidate))

    if not scored:
        return MatchResult(
            matched_row=None,
            match_status="Unmatched",
            match_confidence=0,
            match_source="None",
            manual_review_reason="No fuzzy candidates available.",
            suggestions=[],
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_row = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else -1
    suggestions = [_to_suggestion(entry[1], entry[0]) for entry in scored[:5]]

    if best_score >= auto_threshold and (best_score - second_score >= 1 or second_score < auto_threshold):
        return MatchResult(
            matched_row=best_row,
            match_status="Fuzzy Match",
            match_confidence=round(best_score, 2),
            match_source=best_row.get("_match_source") or "Actuals",
            manual_review_reason="",
            suggestions=suggestions,
        )

    if manual_threshold <= best_score < auto_threshold:
        return MatchResult(
            matched_row=None,
            match_status="Manual Review",
            match_confidence=round(best_score, 2),
            match_source="Manual",
            manual_review_reason="Fuzzy score requires review.",
            suggestions=suggestions,
        )

    return MatchResult(
        matched_row=None,
        match_status="Unmatched",
        match_confidence=round(best_score, 2),
        match_source="None",
        manual_review_reason="Fuzzy score below threshold.",
        suggestions=suggestions,
    )


def _first_non_blank(values: list[Any]) -> Any:
    for value in values:
        if not is_blank(value):
            return value
    return None


def _resolve_source_value(matched_row: dict[str, Any], key: str) -> Any:
    source_key_candidates = {
        "company": ("company", "entity"),
        "region": ("region",),
        "row_us": ("row_us",),
        "geo_head": ("geo_head",),
        "bdm": ("bdm",),
        "vertical": ("vertical",),
        "horizontal": ("horizontal",),
        "practice_head": ("practice_head",),
        "type_of_projects": ("type_of_projects",),
        "rate_type": ("rate_type",),
        "billed_currency": ("billed_currency",),
        "strategic_account": ("strategic_account",),
        "eeennn": ("eeennn",),
        "sbu": ("sbu",),
        "sub_sbu": ("sub_sbu",),
        "dept": ("dept",),
        "service_line": ("service_line",),
        "delivery_manager": ("delivery_manager",),
        "buh": ("buh",),
        "region_summary": ("region_summary",),
        "sales_region": ("sales_region",),
        "group_company": ("group_company",),
        "updated_customer": ("updated_customer", "customer_name"),
    }
    candidates = source_key_candidates.get(key, (key,))
    return _first_non_blank([matched_row.get(candidate) for candidate in candidates])


def _apply_source_truth_name_mapping(
    budget_row: dict[str, Any],
    matched_row: dict[str, Any],
) -> list[str]:
    source = str(matched_row.get("_match_source") or "").strip().lower()
    if "actual" not in source:
        return []

    normalized_ms_ps = normalize_ms_ps(budget_row.get("ps_ms_budget"))
    budget_emp = _normalize_identifier_value(budget_row.get("emp_id"))
    budget_ocn = _normalize_identifier_value(budget_row.get("ocn_number"))
    matched_emp = _normalize_identifier_value(matched_row.get("emp_id"))
    matched_ocn = _normalize_identifier_value(matched_row.get("ocn_number"))

    if normalized_ms_ps == "MS":
        if not budget_ocn or budget_ocn != matched_ocn:
            return []
    elif normalized_ms_ps == "PS":
        if not budget_emp or budget_emp != matched_emp:
            return []
    else:
        return []

    forced_fields: list[str] = []
    for field in ("customer_name", "project_name", "resource_name"):
        source_value = _first_non_blank([matched_row.get(field)])
        if source_value is None:
            continue
        source_text = str(source_value).strip()
        if not source_text:
            continue
        if str(budget_row.get(field) or "").strip() != source_text:
            budget_row[field] = source_text
            forced_fields.append(field)

    source_customer = _first_non_blank(
        [matched_row.get("updated_customer"), matched_row.get("customer_name")]
    )
    if source_customer is not None:
        source_customer_text = str(source_customer).strip()
        if source_customer_text and str(budget_row.get("updated_customer") or "").strip() != source_customer_text:
            budget_row["updated_customer"] = source_customer_text
            forced_fields.append("updated_customer")

    return forced_fields


def enrich_row_from_match(
    budget_row: dict[str, Any],
    matched_actual_row: dict[str, Any] | None,
    overwrite_existing: bool = False,
) -> tuple[dict[str, Any], list[str]]:
    if matched_actual_row is None:
        return budget_row, []

    enriched_fields: list[str] = []
    enriched = dict(budget_row)
    for field in ENRICHABLE_FIELDS:
        source_value = _resolve_source_value(matched_actual_row, field)
        if source_value is None:
            continue
        if overwrite_existing or is_blank(enriched.get(field)):
            enriched[field] = source_value
            enriched_fields.append(field)
    forced_name_fields = _apply_source_truth_name_mapping(enriched, matched_actual_row)
    for field in forced_name_fields:
        if field not in enriched_fields:
            enriched_fields.append(field)
    return enriched, enriched_fields


def _normalize_input_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        normalized_key = normalize_column_name(key)
        normalized[normalized_key] = value

    normalized["ps_ms_budget"] = normalize_ms_ps(normalized.get("ps_ms_budget"))
    normalized["emp_id"] = _normalize_identifier_value(normalized.get("emp_id"))
    normalized["ocn_number"] = _normalize_identifier_value(normalized.get("ocn_number"))

    for numeric_key in BUDGET_NUMERIC_INPUT_KEYS:
        if numeric_key in normalized:
            default_value = 1.0 if numeric_key == "forex" else 0.0
            normalized[numeric_key] = _coerce_budget_numeric_value(normalized.get(numeric_key), default_value)

    return normalized


def process_budget_upload(
    budget_rows: list[dict[str, Any]],
    actuals_rows: list[dict[str, Any]],
    master_data: list[dict[str, Any]] | None = None,
    overwrite_existing: bool = False,
    fuzzy_auto_threshold: float = 92,
    fuzzy_manual_threshold: float = 80,
    mapping_index: MappingIndex | None = None,
    enable_fuzzy_fallback: bool = False,
) -> dict[str, Any]:
    del fuzzy_auto_threshold
    del fuzzy_manual_threshold
    actual_candidates: list[dict[str, Any]] = []
    combined_candidates: list[dict[str, Any]] = []
    for row in actuals_rows:
        normalized = _normalize_actual_or_master_row(row)
        normalized["_match_source"] = "Actuals"
        actual_candidates.append(normalized)
        combined_candidates.append(normalized)
    for row in master_data or []:
        normalized = _normalize_actual_or_master_row(row)
        normalized["_match_source"] = normalized.get("_match_source") or "Customer Master"
        combined_candidates.append(normalized)

    lookup = build_actuals_lookup(actual_candidates)

    processed_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    manual_review: list[dict[str, Any]] = []
    auto_enriched_rows = 0
    reference_matched_rows = 0
    customer_standardized_rows = 0
    project_standardized_rows = 0

    for index, raw_row in enumerate(budget_rows, start=1):
        normalized_row = _normalize_input_row(raw_row)
        validation = validate_budget_row(normalized_row, index)
        original_customer_name = str(normalized_row.get("customer_name") or "").strip()
        original_project_name = str(normalized_row.get("project_name") or "").strip()
        output_row = {
            "row_number": index,
            **normalized_row,
            "ps_ms_budget": validation["normalized_ps_ms"] or normalized_row.get("ps_ms_budget"),
            "primary_identifier_type": validation["primary_identifier_type"],
            "primary_identifier_value": validation["primary_identifier_value"],
            "mapping_key": generate_mapping_key(normalized_row),
            "original_customer_name": original_customer_name,
            "original_project_name": original_project_name,
            "standard_customer_name": "",
            "standard_project_name": "",
            "customer_group_key": "",
            "project_group_key": "",
            "primary_reference_type": validation["primary_identifier_type"],
            "primary_reference_value": validation["primary_identifier_value"],
            "mapping_status": "Validation Error" if validation["validation_status"] == "Error" else "Pending",
            "mapping_confidence": 0.0,
            "mapping_reason": validation["validation_message"] or "",
            "needs_manual_review": validation["validation_status"] == "Error",
            "validation_status": validation["validation_status"],
            "validation_message": validation["validation_message"],
            "match_status": "Validation Error" if validation["validation_status"] == "Error" else "Unmatched",
            "match_confidence": 0,
            "match_source": "None",
            "manual_review_reason": "",
            "suggested_matches": [],
            "enriched_fields": [],
        }

        if validation["validation_status"] == "Error":
            errors.append(
                {
                    "row_number": index,
                    "message": validation["validation_message"],
                }
            )
            manual_review.append(
                {
                    "row_number": index,
                    "ps_ms_budget": output_row.get("ps_ms_budget"),
                    "emp_id": output_row.get("emp_id"),
                    "ocn_number": output_row.get("ocn_number"),
                    "budget_customer_name": output_row.get("original_customer_name"),
                    "budget_project_name": output_row.get("original_project_name"),
                    "reason": validation["validation_message"],
                    "confidence": 0,
                    "suggested_matches": [],
                }
            )
            processed_rows.append(output_row)
            continue

        exact = find_exact_match(output_row, lookup)
        match = exact
        if enable_fuzzy_fallback and match.matched_row is None and not match.ambiguous:
            fuzzy_match = find_fuzzy_match(
                output_row,
                combined_candidates,
                auto_threshold=92,
                manual_threshold=80,
            )
            if fuzzy_match.match_status != "Unmatched":
                match = fuzzy_match

        output_row["match_status"] = match.match_status
        output_row["match_confidence"] = round(float(match.match_confidence), 2)
        output_row["match_source"] = match.match_source
        output_row["manual_review_reason"] = match.manual_review_reason
        output_row["suggested_matches"] = match.suggestions

        if match.matched_row is not None:
            reference_matched_rows += 1
            enriched_row, enriched_fields = enrich_row_from_match(
                output_row,
                match.matched_row,
                overwrite_existing=overwrite_existing,
            )
            output_row = enriched_row
            output_row["primary_identifier_type"] = validation["primary_identifier_type"]
            output_row["primary_identifier_value"] = validation["primary_identifier_value"]
            output_row["primary_reference_type"] = validation["primary_identifier_type"]
            output_row["primary_reference_value"] = validation["primary_identifier_value"]
            output_row["mapping_key"] = generate_mapping_key(output_row)
            output_row["enriched_fields"] = enriched_fields
            output_row["matched_customer_name"] = str(match.matched_row.get("customer_name") or "").strip()
            output_row["matched_updated_customer"] = str(match.matched_row.get("updated_customer") or "").strip()
            output_row["matched_project_name"] = str(match.matched_row.get("project_name") or "").strip()

            standard_customer_name, customer_group_key, customer_reason = _resolve_standard_customer_name(
                row=output_row,
                matched_row=match.matched_row,
                mapping_index=mapping_index,
            )
            standard_project_name, project_group_key, project_reason = _resolve_standard_project_name(
                row=output_row,
                matched_row=match.matched_row,
                mapping_index=mapping_index,
                customer_group_key=customer_group_key,
            )

            output_row["standard_customer_name"] = standard_customer_name
            output_row["customer_group_key"] = customer_group_key
            output_row["standard_project_name"] = standard_project_name
            output_row["project_group_key"] = project_group_key
            if standard_customer_name:
                output_row["customer_name"] = standard_customer_name
                output_row["updated_customer"] = standard_customer_name
                customer_standardized_rows += 1
            if standard_project_name:
                output_row["project_name"] = standard_project_name
                project_standardized_rows += 1

            standardized_segments: list[str] = []
            if standard_customer_name:
                standardized_segments.append("Customer")
            if standard_project_name:
                standardized_segments.append("Project")
            if standardized_segments:
                output_row["mapping_status"] = " and ".join(standardized_segments) + " Standardized"
            else:
                output_row["mapping_status"] = "Reference Matched"
            output_row["mapping_confidence"] = round(float(match.match_confidence), 2)
            output_row["mapping_reason"] = (
                f"Matched using {validation['primary_identifier_type']}. "
                f"Customer source: {customer_reason}. Project source: {project_reason}."
            )
            output_row["needs_manual_review"] = False
            if enriched_fields:
                output_row["match_status"] = "Auto Enriched" if match.match_status in {"Exact Match", "Fuzzy Match"} else match.match_status
                auto_enriched_rows += 1
        else:
            output_row["standard_customer_name"] = str(
                output_row.get("updated_customer")
                or output_row.get("original_customer_name")
                or ""
            ).strip()
            output_row["standard_project_name"] = str(output_row.get("original_project_name") or "").strip()
            output_row["customer_group_key"] = build_customer_group_key(output_row.get("standard_customer_name"))
            output_row["project_group_key"] = build_project_group_key(
                output_row.get("customer_group_key") or "",
                output_row.get("standard_project_name"),
            )
            output_row["mapping_status"] = "Manual Review" if output_row["match_status"] == "Manual Review" else "Unmatched"
            output_row["mapping_confidence"] = round(float(output_row.get("match_confidence") or 0), 2)
            output_row["mapping_reason"] = output_row["manual_review_reason"] or "No trusted key match found."
            output_row["needs_manual_review"] = True

        if output_row["match_status"] in {"Manual Review", "Validation Error", "Unmatched"}:
            manual_review.append(
                {
                    "row_number": index,
                    "ps_ms_budget": output_row.get("ps_ms_budget"),
                    "emp_id": output_row.get("emp_id"),
                    "ocn_number": output_row.get("ocn_number"),
                    "budget_customer_name": output_row.get("original_customer_name"),
                    "suggested_standard_customer": output_row.get("standard_customer_name"),
                    "budget_project_name": output_row.get("original_project_name"),
                    "suggested_standard_project": output_row.get("standard_project_name"),
                    "match_source": output_row.get("match_source"),
                    "reason": output_row["manual_review_reason"] or output_row["validation_message"] or "Manual review required.",
                    "confidence": round(float(output_row["match_confidence"]), 2),
                    "suggested_matches": output_row["suggested_matches"],
                }
            )

        processed_rows.append(output_row)

    valid_rows = sum(1 for row in processed_rows if row.get("validation_status") == "Valid")
    error_rows = sum(1 for row in processed_rows if row.get("validation_status") == "Error")
    manual_review_rows = sum(1 for row in processed_rows if bool(row.get("needs_manual_review")))
    unmatched_rows = sum(1 for row in processed_rows if row.get("match_status") == "Unmatched")
    customer_group_count = len(
        {
            str(row.get("customer_group_key") or "").strip()
            for row in processed_rows
            if str(row.get("customer_group_key") or "").strip()
        }
    )
    project_group_count = len(
        {
            str(row.get("project_group_key") or "").strip()
            for row in processed_rows
            if str(row.get("project_group_key") or "").strip()
        }
    )

    summary = {
        "total_rows": len(processed_rows),
        "valid_rows": valid_rows,
        "error_rows": error_rows,
        "auto_enriched_rows": auto_enriched_rows,
        "manual_review_rows": manual_review_rows,
        "unmatched_rows": unmatched_rows,
        "total_budget_rows": len(processed_rows),
        "reference_matched_rows": reference_matched_rows,
        "customer_standardized_rows": customer_standardized_rows,
        "project_standardized_rows": project_standardized_rows,
        "customer_group_count": customer_group_count,
        "project_group_count": project_group_count,
    }

    return {
        "summary": summary,
        "processed_rows": processed_rows,
        "errors": errors,
        "manual_review": manual_review,
    }


def parse_budget_workbook_rows(workbook_path: Path) -> list[dict[str, Any]]:
    parsed = parse_masterdata_workbook(workbook_path, "budget")
    rows: list[dict[str, Any]] = []
    for parsed_row in parsed.rows:
        merged = dict(parsed_row.raw_payload)
        for key, value in parsed_row.values.items():
            merged[key] = value
        rows.append(merged)
    return rows


def _load_actuals_rows(financial_year: str) -> list[dict[str, Any]]:
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    emp_id,
                    customer_name,
                    project_name,
                    resource_name,
                    ocn_number,
                    company,
                    region,
                    region_summary,
                    sales_region,
                    bdm,
                    vertical,
                    horizontal,
                    practice_head,
                    geo_head,
                    type_of_projects,
                    rate_type,
                    billed_currency,
                    strategic_account,
                    eeennn,
                    sbu,
                    sub_sbu,
                    dept,
                    service_line,
                    buh,
                    group_company,
                    month,
                    year
                from actual_revenue
                where fy_year = %s
                """,
                (financial_year,),
            )
            rows = cursor.fetchall()
    return rows


def _load_master_rows(financial_year: str) -> list[dict[str, Any]]:
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    resource_id as emp_id,
                    customer_name,
                    project_name,
                    resource_name,
                    ocn_number,
                    entity as company,
                    row_us,
                    bdm,
                    vertical,
                    horizontal,
                    practice_head,
                    geo_head,
                    type_of_projects,
                    rate_type,
                    billed_currency,
                    strategic_account,
                    eeennn
                from budget_records r
                join budget_uploads u on u.id = r.upload_id
                where r.financial_year = %s
                  and u.is_active = true
                """,
                (financial_year,),
            )
            rows = cursor.fetchall()
    for row in rows:
        row["_match_source"] = "Project Master"
    return rows


def _insert_customer_alias(
    cursor: Any,
    *,
    customer_mapping_id: str,
    alias_name: str,
    source_type: str,
    reference_type: str | None,
    reference_value: str | None,
    confidence: float,
) -> None:
    alias_text = str(alias_name or "").strip()
    normalized_alias = normalize_name_for_compare(alias_text)
    if not alias_text or not normalized_alias:
        return

    now_iso = utc_now_iso()
    cursor.execute(
        """
        insert into customer_mapping_alias (
            id,
            customer_mapping_id,
            alias_customer_name,
            normalized_alias_customer_name,
            source_type,
            reference_type,
            reference_value,
            confidence,
            active_flag,
            created_at,
            updated_at
        )
        values (
            %s::uuid,
            %s::uuid,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            true,
            %s::timestamptz,
            %s::timestamptz
        )
        on conflict (
            customer_mapping_id,
            normalized_alias_customer_name,
            lower(coalesce(reference_type, '')),
            lower(coalesce(reference_value, ''))
        )
        do update set
            alias_customer_name = excluded.alias_customer_name,
            source_type = excluded.source_type,
            confidence = excluded.confidence,
            active_flag = true,
            updated_at = excluded.updated_at
        """,
        (
            str(uuid4()),
            customer_mapping_id,
            alias_text,
            normalized_alias,
            source_type,
            reference_type,
            reference_value,
            confidence,
            now_iso,
            now_iso,
        ),
    )


def _insert_project_alias(
    cursor: Any,
    *,
    project_mapping_id: str,
    alias_name: str,
    source_type: str,
    reference_type: str | None,
    reference_value: str | None,
    confidence: float,
) -> None:
    alias_text = str(alias_name or "").strip()
    normalized_alias = normalize_name_for_compare(alias_text)
    if not alias_text or not normalized_alias:
        return

    now_iso = utc_now_iso()
    cursor.execute(
        """
        insert into project_mapping_alias (
            id,
            project_mapping_id,
            alias_project_name,
            normalized_alias_project_name,
            source_type,
            reference_type,
            reference_value,
            confidence,
            active_flag,
            created_at,
            updated_at
        )
        values (
            %s::uuid,
            %s::uuid,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            true,
            %s::timestamptz,
            %s::timestamptz
        )
        on conflict (
            project_mapping_id,
            normalized_alias_project_name,
            lower(coalesce(reference_type, '')),
            lower(coalesce(reference_value, ''))
        )
        do update set
            alias_project_name = excluded.alias_project_name,
            source_type = excluded.source_type,
            confidence = excluded.confidence,
            active_flag = true,
            updated_at = excluded.updated_at
        """,
        (
            str(uuid4()),
            project_mapping_id,
            alias_text,
            normalized_alias,
            source_type,
            reference_type,
            reference_value,
            confidence,
            now_iso,
            now_iso,
        ),
    )


def persist_mapping_suggestions(
    *,
    processed_rows: list[dict[str, Any]],
    actor: str,
) -> None:
    ensure_postgres_schema()
    now_iso = utc_now_iso()
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            for row in processed_rows:
                if str(row.get("validation_status") or "") != "Valid":
                    continue
                standard_customer_name = str(row.get("standard_customer_name") or row.get("customer_name") or "").strip()
                standard_project_name = str(row.get("standard_project_name") or row.get("project_name") or "").strip()
                customer_group_key = str(row.get("customer_group_key") or build_customer_group_key(standard_customer_name)).strip()
                project_group_key = str(
                    row.get("project_group_key")
                    or build_project_group_key(customer_group_key, standard_project_name)
                ).strip()
                if not standard_customer_name or not customer_group_key:
                    continue

                reference_type = str(row.get("primary_reference_type") or row.get("primary_identifier_type") or "").strip() or None
                reference_value = str(row.get("primary_reference_value") or row.get("primary_identifier_value") or "").strip() or None
                confidence = round(float(row.get("mapping_confidence") or row.get("match_confidence") or 0), 2)
                needs_manual_review = bool(row.get("needs_manual_review"))
                status = "Manual Review" if needs_manual_review else "Suggested"

                cursor.execute(
                    """
                    select id::text as id, mapping_status
                    from customer_mapping_master
                    where lower(customer_group_key) = lower(%s)
                    limit 1
                    """,
                    (customer_group_key,),
                )
                existing_customer = cursor.fetchone()
                customer_mapping_id: str
                if existing_customer:
                    customer_mapping_id = str(existing_customer.get("id") or "")
                    existing_status = str(existing_customer.get("mapping_status") or "").strip().lower()
                    next_status = "Approved" if existing_status == "approved" else status
                    cursor.execute(
                        """
                        update customer_mapping_master
                        set
                            standard_customer_name = %s,
                            mapping_status = %s,
                            updated_at = %s::timestamptz
                        where id = %s::uuid
                        """,
                        (
                            standard_customer_name,
                            next_status,
                            now_iso,
                            customer_mapping_id,
                        ),
                    )
                else:
                    customer_mapping_id = str(uuid4())
                    cursor.execute(
                        """
                        insert into customer_mapping_master (
                            id,
                            standard_customer_name,
                            customer_group_key,
                            mapping_status,
                            created_at,
                            updated_at
                        )
                        values (
                            %s::uuid,
                            %s,
                            %s,
                            %s,
                            %s::timestamptz,
                            %s::timestamptz
                        )
                        """,
                        (
                            customer_mapping_id,
                            standard_customer_name,
                            customer_group_key,
                            status,
                            now_iso,
                            now_iso,
                        ),
                    )

                _insert_customer_alias(
                    cursor,
                    customer_mapping_id=customer_mapping_id,
                    alias_name=str(row.get("original_customer_name") or ""),
                    source_type="budget",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=confidence,
                )
                _insert_customer_alias(
                    cursor,
                    customer_mapping_id=customer_mapping_id,
                    alias_name=str(row.get("matched_customer_name") or ""),
                    source_type="actuals",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=confidence,
                )
                _insert_customer_alias(
                    cursor,
                    customer_mapping_id=customer_mapping_id,
                    alias_name=str(row.get("matched_updated_customer") or ""),
                    source_type="actuals",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=confidence,
                )
                _insert_customer_alias(
                    cursor,
                    customer_mapping_id=customer_mapping_id,
                    alias_name=standard_customer_name,
                    source_type="manual",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=100,
                )

                if not standard_project_name or not project_group_key:
                    continue

                cursor.execute(
                    """
                    select id::text as id, mapping_status
                    from project_mapping_master
                    where lower(project_group_key) = lower(%s)
                    limit 1
                    """,
                    (project_group_key,),
                )
                existing_project = cursor.fetchone()
                project_mapping_id: str
                if existing_project:
                    project_mapping_id = str(existing_project.get("id") or "")
                    existing_status = str(existing_project.get("mapping_status") or "").strip().lower()
                    next_status = "Approved" if existing_status == "approved" else status
                    cursor.execute(
                        """
                        update project_mapping_master
                        set
                            customer_mapping_id = %s::uuid,
                            standard_project_name = %s,
                            ocn_number = %s,
                            mapping_status = %s,
                            updated_at = %s::timestamptz
                        where id = %s::uuid
                        """,
                        (
                            customer_mapping_id,
                            standard_project_name,
                            str(row.get("ocn_number") or "").strip() or None,
                            next_status,
                            now_iso,
                            project_mapping_id,
                        ),
                    )
                else:
                    project_mapping_id = str(uuid4())
                    cursor.execute(
                        """
                        insert into project_mapping_master (
                            id,
                            customer_mapping_id,
                            standard_project_name,
                            project_group_key,
                            ocn_number,
                            mapping_status,
                            created_at,
                            updated_at
                        )
                        values (
                            %s::uuid,
                            %s::uuid,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s::timestamptz,
                            %s::timestamptz
                        )
                        """,
                        (
                            project_mapping_id,
                            customer_mapping_id,
                            standard_project_name,
                            project_group_key,
                            str(row.get("ocn_number") or "").strip() or None,
                            status,
                            now_iso,
                            now_iso,
                        ),
                    )

                _insert_project_alias(
                    cursor,
                    project_mapping_id=project_mapping_id,
                    alias_name=str(row.get("original_project_name") or ""),
                    source_type="budget",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=confidence,
                )
                _insert_project_alias(
                    cursor,
                    project_mapping_id=project_mapping_id,
                    alias_name=str(row.get("matched_project_name") or ""),
                    source_type="actuals",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=confidence,
                )
                _insert_project_alias(
                    cursor,
                    project_mapping_id=project_mapping_id,
                    alias_name=standard_project_name,
                    source_type="manual",
                    reference_type=reference_type,
                    reference_value=reference_value,
                    confidence=100,
                )

            cursor.execute(
                """
                update customer_mapping_master
                set updated_at = %s::timestamptz
                where lower(mapping_status) = 'approved'
                  and approved_by is null
                """,
                (now_iso,),
            )
            cursor.execute(
                """
                update project_mapping_master
                set updated_at = %s::timestamptz
                where lower(mapping_status) = 'approved'
                  and approved_by is null
                """,
                (now_iso,),
            )
        connection.commit()


def create_budget_upload_preview(
    *,
    workbook_path: Path,
    financial_year: str,
    overwrite_existing: bool = False,
    created_by: str = "budget-upload-preview",
) -> dict[str, Any]:
    ensure_postgres_schema()
    budget_rows = parse_budget_workbook_rows(workbook_path)
    actuals_rows = _load_actuals_rows(financial_year)
    master_rows = _load_master_rows(financial_year)
    mapping_index = load_mapping_index()
    processed = process_budget_upload(
        budget_rows=budget_rows,
        actuals_rows=actuals_rows,
        master_data=master_rows,
        overwrite_existing=overwrite_existing,
        mapping_index=mapping_index,
        enable_fuzzy_fallback=False,
    )

    batch_id = str(uuid4())
    now_iso = utc_now_iso()
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into budget_upload_batches (
                    id,
                    financial_year,
                    original_filename,
                    stored_filename,
                    overwrite_existing,
                    created_by,
                    created_at,
                    updated_at,
                    summary_json
                )
                values (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz, %s::jsonb)
                """,
                (
                    batch_id,
                    financial_year,
                    workbook_path.name,
                    workbook_path.name,
                    overwrite_existing,
                    created_by,
                    now_iso,
                    now_iso,
                    _json_dumps(processed["summary"]),
                ),
            )

            insert_sql = """
                insert into budget_upload_processed_rows (
                    upload_batch_id,
                    row_number,
                    raw_payload,
                    processed_payload,
                    normalized_ps_ms,
                    primary_identifier_type,
                    primary_identifier_value,
                    mapping_key,
                    validation_status,
                    validation_message,
                    match_status,
                    match_confidence,
                    match_source,
                    manual_review_reason,
                    manual_approved,
                    created_at,
                    updated_at
                )
                values (
                    %s::uuid, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, false, %s::timestamptz, %s::timestamptz
                )
            """
            for row in processed["processed_rows"]:
                cursor.execute(
                    insert_sql,
                    (
                        batch_id,
                        int(row.get("row_number") or 0),
                        _json_dumps(row),
                        _json_dumps(row),
                        row.get("ps_ms_budget"),
                        row.get("primary_identifier_type"),
                        row.get("primary_identifier_value"),
                        row.get("mapping_key"),
                        row.get("validation_status"),
                        row.get("validation_message"),
                        row.get("match_status"),
                        float(row.get("match_confidence") or 0),
                        row.get("match_source"),
                        row.get("manual_review_reason"),
                        now_iso,
                        now_iso,
                    ),
                )
        connection.commit()

    persist_mapping_suggestions(
        processed_rows=processed["processed_rows"],
        actor=created_by,
    )

    return {
        "upload_batch_id": batch_id,
        **processed,
    }


def _load_batch_rows(batch_id: str) -> list[dict[str, Any]]:
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    row_number,
                    processed_payload,
                    validation_status,
                    match_status,
                    manual_approved
                from budget_upload_processed_rows
                where upload_batch_id = %s::uuid
                order by row_number asc
                """,
                (batch_id,),
            )
            rows = cursor.fetchall()
    return rows


def _load_batch_header(batch_id: str) -> dict[str, Any]:
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    id::text as id,
                    financial_year,
                    original_filename,
                    overwrite_existing
                from budget_upload_batches
                where id = %s::uuid
                """,
                (batch_id,),
            )
            row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Upload batch not found.")
    return row


def _serialize_date_for_budget(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _build_budget_record_values(processed_payload: dict[str, Any]) -> dict[str, Any]:
    original_customer_name = str(
        processed_payload.get("original_customer_name")
        or processed_payload.get("customer_name")
        or ""
    ).strip()
    updated_customer_name = str(
        processed_payload.get("updated_customer")
        or processed_payload.get("standard_customer_name")
        or original_customer_name
        or ""
    ).strip()
    standard_customer_name = str(
        processed_payload.get("standard_customer_name")
        or updated_customer_name
        or original_customer_name
        or ""
    ).strip()
    standard_project_name = str(
        processed_payload.get("standard_project_name")
        or processed_payload.get("project_name")
        or ""
    ).strip()
    original_project_name = str(
        processed_payload.get("original_project_name")
        or processed_payload.get("project_name")
        or ""
    ).strip()

    return {
        "customer_name": original_customer_name or updated_customer_name,
        "updated_customer": updated_customer_name or standard_customer_name or original_customer_name,
        "original_customer_name": original_customer_name,
        "standard_customer_name": standard_customer_name,
        "customer_group_key": processed_payload.get("customer_group_key")
        or build_customer_group_key(updated_customer_name or standard_customer_name or original_customer_name),
        "ms_ps": processed_payload.get("ps_ms_budget") or "",
        "entity": processed_payload.get("company") or "",
        "gr_entity": processed_payload.get("group_company") or "",
        "row_us": processed_payload.get("row_us") or "",
        "strategic_account": processed_payload.get("strategic_account") or "",
        "resource_id": processed_payload.get("emp_id") or "",
        "resource_name": processed_payload.get("resource_name") or "",
        "deal_type": processed_payload.get("deal_type") or "",
        "eeennn": processed_payload.get("eeennn") or "",
        "bill_rate": _coerce_budget_numeric_value(processed_payload.get("bill_rate"), 0.0),
        "rate_type": processed_payload.get("rate_type") or "",
        "billed_currency": processed_payload.get("billed_currency") or "USD",
        "forex": _coerce_budget_numeric_value(processed_payload.get("forex"), 1.0),
        "type_of_projects": processed_payload.get("type_of_projects") or "",
        "billed_hours": _coerce_budget_numeric_value(processed_payload.get("billed_hours"), 0.0),
        "billable_actual_hrs": _coerce_budget_numeric_value(processed_payload.get("billable_actual_hrs"), 0.0),
        "start_date": _serialize_date_for_budget(processed_payload.get("start_date")),
        "end_date": _serialize_date_for_budget(processed_payload.get("end_date")),
        "apr_2026": _coerce_budget_numeric_value(processed_payload.get("apr_2026"), 0.0),
        "may_2026": _coerce_budget_numeric_value(processed_payload.get("may_2026"), 0.0),
        "jun_2026": _coerce_budget_numeric_value(processed_payload.get("jun_2026"), 0.0),
        "jul_2026": _coerce_budget_numeric_value(processed_payload.get("jul_2026"), 0.0),
        "aug_2026": _coerce_budget_numeric_value(processed_payload.get("aug_2026"), 0.0),
        "sep_2026": _coerce_budget_numeric_value(processed_payload.get("sep_2026"), 0.0),
        "oct_2026": _coerce_budget_numeric_value(processed_payload.get("oct_2026"), 0.0),
        "nov_2026": _coerce_budget_numeric_value(processed_payload.get("nov_2026"), 0.0),
        "dec_2026": _coerce_budget_numeric_value(processed_payload.get("dec_2026"), 0.0),
        "jan_2027": _coerce_budget_numeric_value(processed_payload.get("jan_2027"), 0.0),
        "feb_2027": _coerce_budget_numeric_value(processed_payload.get("feb_2027"), 0.0),
        "mar_2027": _coerce_budget_numeric_value(processed_payload.get("mar_2027"), 0.0),
        "fy": _coerce_budget_numeric_value(processed_payload.get("fy"), 0.0),
        "project_name": standard_project_name,
        "original_project_name": original_project_name,
        "standard_project_name": standard_project_name,
        "project_group_key": processed_payload.get("project_group_key")
        or build_project_group_key(
            str(
                processed_payload.get("customer_group_key")
                or build_customer_group_key(updated_customer_name or standard_customer_name or original_customer_name)
            ),
            standard_project_name,
        ),
        "client_name": updated_customer_name or standard_customer_name or "",
        "ocn_number": processed_payload.get("ocn_number") or "",
        "practice_head": processed_payload.get("practice_head") or "",
        "bdm": processed_payload.get("bdm") or "",
        "geo_head": processed_payload.get("geo_head") or "",
        "vertical": processed_payload.get("vertical") or "",
        "horizontal": processed_payload.get("horizontal") or "",
        "q1": _coerce_budget_numeric_value(processed_payload.get("q1"), 0.0),
        "q2": _coerce_budget_numeric_value(processed_payload.get("q2"), 0.0),
        "q3": _coerce_budget_numeric_value(processed_payload.get("q3"), 0.0),
        "q4": _coerce_budget_numeric_value(processed_payload.get("q4"), 0.0),
        "primary_reference_type": processed_payload.get("primary_reference_type")
        or processed_payload.get("primary_identifier_type")
        or "",
        "primary_reference_value": processed_payload.get("primary_reference_value")
        or processed_payload.get("primary_identifier_value")
        or "",
        "mapping_status": processed_payload.get("mapping_status") or processed_payload.get("match_status") or "",
        "mapping_confidence": _coerce_budget_numeric_value(
            processed_payload.get("mapping_confidence")
            or processed_payload.get("match_confidence"),
            0.0,
        ),
        "mapping_reason": processed_payload.get("mapping_reason")
        or processed_payload.get("manual_review_reason")
        or "",
        "needs_manual_review": bool(processed_payload.get("needs_manual_review")),
    }


def confirm_budget_upload_save(
    *,
    upload_batch_id: str,
    updated_by: str = "budget-confirm-save",
    skip_validation_errors: bool = True,
    save_manual_review_rows: bool = False,
) -> dict[str, Any]:
    ensure_postgres_schema()
    batch = _load_batch_header(upload_batch_id)
    rows = _load_batch_rows(upload_batch_id)
    if not rows:
        raise HTTPException(status_code=400, detail="No processed rows found for upload batch.")

    selected_rows: list[dict[str, Any]] = []
    skipped_rows = 0
    for row in rows:
        processed_payload = row.get("processed_payload")
        if not isinstance(processed_payload, dict):
            skipped_rows += 1
            continue

        validation_status = str(row.get("validation_status") or "")
        match_status = str(row.get("match_status") or "")
        manual_approved = bool(row.get("manual_approved"))

        if validation_status != "Valid":
            # Admin upload flow persists complete workbook context (including
            # validation-error rows) so website totals and row counts match source.
            if save_manual_review_rows:
                selected_rows.append(processed_payload)
                continue
            if skip_validation_errors:
                skipped_rows += 1
                continue
            raise HTTPException(
                status_code=400,
                detail=f"Row {row.get('row_number')} has validation errors.",
            )

        if match_status == "Manual Review" and not (save_manual_review_rows or manual_approved):
            skipped_rows += 1
            continue

        selected_rows.append(processed_payload)

    if not selected_rows:
        return {
            "status": "no_rows_saved",
            "upload_batch_id": upload_batch_id,
            "saved_rows": 0,
            "skipped_rows": skipped_rows,
        }

    now_iso = utc_now_iso()
    upload_id = str(uuid4())
    financial_year = str(batch.get("financial_year") or "")
    original_filename = str(batch.get("original_filename") or "budget-upload.xlsx")
    stored_filename = f"{upload_id}-{original_filename}"

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update budget_uploads
                set is_active = false
                where financial_year = %s and is_active = true
                """,
                (financial_year,),
            )
            cursor.execute(
                """
                insert into budget_uploads (
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
                values (
                    %s, %s, null, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s, true
                )
                """,
                (
                    upload_id,
                    financial_year,
                    original_filename,
                    stored_filename,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    0,
                    now_iso,
                    len(selected_rows),
                    ["Budget"],
                    [],
                ),
            )

            insert_sql = _build_budget_record_insert_sql(BUDGET_RECORD_INSERT_COLUMNS)

            for row_index, processed_payload in enumerate(selected_rows, start=1):
                record_values = _build_budget_record_values(processed_payload)
                business_key = str(processed_payload.get("mapping_key") or f"budget:{row_index}:{uuid4().hex}")
                record_payload = {
                    "upload_id": upload_id,
                    "financial_year": financial_year,
                    "source_sheet": "Budget",
                    "source_row_number": row_index,
                    "business_key": business_key,
                    "raw_payload": _json_dumps(processed_payload),
                    **record_values,
                    "updated_by": updated_by,
                    "updated_at": now_iso,
                }
                cursor.execute(
                    insert_sql,
                    tuple(record_payload.get(column) for column in BUDGET_RECORD_INSERT_COLUMNS),
                )
            _sync_budget_upload_into_rapid_revenue(
                cursor=cursor,
                financial_year=financial_year,
                source_upload_id=upload_id,
                source_filename=original_filename,
                stored_filename=stored_filename,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                size_bytes=0,
                uploaded_at=now_iso,
                parsed_sheets=["Budget"],
                matched_columns=[],
            )
            refresh_budget_data(financial_year, connection)
        connection.commit()

    trend_refresh_error: str | None = None
    try:
        refresh_trend_analytics(financial_year=financial_year, upload_month=None)
    except Exception as error:  # pragma: no cover
        trend_refresh_error = str(error)

    return {
        "status": "saved",
        "upload_batch_id": upload_batch_id,
        "saved_rows": len(selected_rows),
        "skipped_rows": skipped_rows,
        "financial_year": financial_year,
        "budget_upload_id": upload_id,
        "trend_refresh_error": trend_refresh_error,
    }


def import_budget_upload_with_mapping(
    *,
    financial_year: str,
    workbook_path: Path,
    original_filename: str,
    stored_filename: str,
    content_type: str,
    size_bytes: int,
    upload_month: str | None = None,
    created_by: str = "admin-upload",
    overwrite_existing: bool = False,
) -> dict[str, Any]:
    preview = create_budget_upload_preview(
        workbook_path=workbook_path,
        financial_year=financial_year,
        overwrite_existing=overwrite_existing,
        created_by=created_by,
    )
    confirmation = confirm_budget_upload_save(
        upload_batch_id=str(preview.get("upload_batch_id") or ""),
        updated_by=created_by,
        skip_validation_errors=True,
        save_manual_review_rows=True,
    )

    budget_upload_id = str(confirmation.get("budget_upload_id") or "")
    uploaded_at: str | None = None
    if budget_upload_id:
        with open_database_connection(require=True) as connection:
            assert connection is not None
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update budget_uploads
                    set
                        upload_month = %s,
                        original_filename = %s,
                        stored_filename = %s,
                        content_type = %s,
                        size_bytes = %s
                    where id = %s::uuid
                    returning uploaded_at
                    """,
                    (
                        upload_month,
                        original_filename,
                        stored_filename,
                        content_type,
                        int(size_bytes),
                        budget_upload_id,
                    ),
                )
                upload_row = cursor.fetchone() or {}
                uploaded_at_value = upload_row.get("uploaded_at")
                uploaded_at = (
                    uploaded_at_value.isoformat().replace("+00:00", "Z")
                    if isinstance(uploaded_at_value, datetime)
                    else None
                )
            connection.commit()

    summary = preview.get("summary") if isinstance(preview.get("summary"), dict) else {}
    return {
        "id": budget_upload_id,
        "financialYear": financial_year,
        "uploadMonth": upload_month,
        "originalFilename": original_filename,
        "storedFilename": stored_filename,
        "contentType": content_type,
        "sizeBytes": int(size_bytes),
        "uploadedAt": uploaded_at or utc_now_iso(),
        "importedRows": int(confirmation.get("saved_rows") or 0),
        "parsedSheets": ["Budget"],
        "matchedColumns": [],
        "active": True,
        "activeUploadId": budget_upload_id,
        "datasetType": "budget",
        "invalidRows": int(summary.get("error_rows") or 0),
        "skippedRows": int(confirmation.get("skipped_rows") or 0),
        "mappingSummary": summary,
        "uploadBatchId": preview.get("upload_batch_id"),
        "trendRefreshHandled": True,
        "trendRefreshError": confirmation.get("trend_refresh_error"),
    }


def _csv_join(values: set[str]) -> str:
    return ", ".join(sorted(value for value in values if str(value).strip()))


def get_budget_mapping_admin_payload(financial_year: str) -> dict[str, Any]:
    ensure_postgres_schema()
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    cm.id::text as id,
                    cm.standard_customer_name,
                    cm.customer_group_key,
                    cm.customer_id,
                    cm.mapping_status,
                    cm.approved_by,
                    cm.approved_at,
                    cm.updated_at,
                    ca.alias_customer_name,
                    ca.source_type,
                    ca.reference_type,
                    ca.reference_value,
                    ca.confidence
                from customer_mapping_master cm
                left join customer_mapping_alias ca on ca.customer_mapping_id = cm.id and coalesce(ca.active_flag, true) = true
                order by cm.updated_at desc nulls last
                """
            )
            customer_rows = cursor.fetchall()

            cursor.execute(
                """
                select
                    pm.id::text as id,
                    pm.customer_mapping_id::text as customer_mapping_id,
                    pm.standard_project_name,
                    pm.project_group_key,
                    pm.ocn_number,
                    pm.mapping_status,
                    pm.approved_by,
                    pm.approved_at,
                    pm.updated_at,
                    pa.alias_project_name,
                    pa.source_type,
                    pa.reference_type,
                    pa.reference_value,
                    pa.confidence
                from project_mapping_master pm
                left join project_mapping_alias pa on pa.project_mapping_id = pm.id and coalesce(pa.active_flag, true) = true
                order by pm.updated_at desc nulls last
                """
            )
            project_rows = cursor.fetchall()

            cursor.execute(
                """
                select
                    customer_group_key,
                    project_group_key,
                    count(*) as row_count
                from budget_records r
                join budget_uploads u on u.id = r.upload_id
                where u.is_active = true
                  and r.financial_year = %s
                group by customer_group_key, project_group_key
                """,
                (financial_year,),
            )
            budget_counts = cursor.fetchall()

            cursor.execute(
                """
                select
                    coalesce(b.id::text, '') as batch_id
                from budget_upload_batches b
                where b.financial_year = %s
                order by b.updated_at desc
                limit 1
                """,
                (financial_year,),
            )
            latest_batch_row = cursor.fetchone() or {}
            latest_batch_id = str(latest_batch_row.get("batch_id") or "").strip()
            manual_review_rows: list[dict[str, Any]] = []
            if latest_batch_id:
                cursor.execute(
                    """
                    select
                        row_number,
                        processed_payload,
                        match_source,
                        match_confidence,
                        manual_review_reason,
                        validation_message
                    from budget_upload_processed_rows
                    where upload_batch_id = %s::uuid
                      and (
                        validation_status = 'Error'
                        or match_status in ('Manual Review', 'Unmatched', 'Validation Error')
                        or coalesce((processed_payload->>'needs_manual_review')::boolean, false) = true
                      )
                    order by row_number asc
                    """,
                    (latest_batch_id,),
                )
                for row in cursor.fetchall():
                    payload = row.get("processed_payload") if isinstance(row.get("processed_payload"), dict) else {}
                    manual_review_rows.append(
                        {
                            "row_number": int(row.get("row_number") or 0),
                            "ps_ms_budget": payload.get("ps_ms_budget"),
                            "emp_id": payload.get("emp_id"),
                            "ocn_number": payload.get("ocn_number"),
                            "budget_customer_name": payload.get("original_customer_name") or payload.get("customer_name"),
                            "suggested_standard_customer": payload.get("standard_customer_name"),
                            "budget_project_name": payload.get("original_project_name") or payload.get("project_name"),
                            "suggested_standard_project": payload.get("standard_project_name"),
                            "match_source": row.get("match_source"),
                            "match_reason": payload.get("mapping_reason") or row.get("manual_review_reason"),
                            "confidence": float(row.get("match_confidence") or 0),
                            "error_reason": row.get("validation_message") or row.get("manual_review_reason"),
                            "upload_batch_id": latest_batch_id,
                        }
                    )

    budget_by_customer: dict[str, int] = {}
    budget_by_project: dict[str, int] = {}
    for row in budget_counts:
        customer_group_key = str(row.get("customer_group_key") or "").strip().lower()
        project_group_key = str(row.get("project_group_key") or "").strip().lower()
        count = int(row.get("row_count") or 0)
        if customer_group_key:
            budget_by_customer[customer_group_key] = budget_by_customer.get(customer_group_key, 0) + count
        if project_group_key:
            budget_by_project[project_group_key] = budget_by_project.get(project_group_key, 0) + count

    customer_groups: dict[str, dict[str, Any]] = {}
    for row in customer_rows:
        mapping_id = str(row.get("id") or "").strip()
        if not mapping_id:
            continue
        group = customer_groups.setdefault(
            mapping_id,
            {
                "id": mapping_id,
                "standard_customer_name": str(row.get("standard_customer_name") or "").strip(),
                "customer_group_key": str(row.get("customer_group_key") or "").strip(),
                "customer_id": str(row.get("customer_id") or "").strip(),
                "mapping_status": str(row.get("mapping_status") or "").strip(),
                "confidence": 0.0,
                "reference_type_used": "",
                "reference_values": set(),
                "budget_customer_names": set(),
                "actuals_customer_names": set(),
                "updated_customer_names": set(),
                "number_of_budget_rows": 0,
                "number_of_actual_rows": 0,
                "last_updated": row.get("updated_at"),
            },
        )
        alias_name = str(row.get("alias_customer_name") or "").strip()
        source_type = str(row.get("source_type") or "").strip().lower()
        if alias_name:
            if source_type == "actuals":
                group["actuals_customer_names"].add(alias_name)
            else:
                group["budget_customer_names"].add(alias_name)
        reference_type = str(row.get("reference_type") or "").strip()
        reference_value = str(row.get("reference_value") or "").strip()
        if reference_type and reference_value:
            group["reference_values"].add(f"{reference_type}:{reference_value}")
            existing_type = str(group["reference_type_used"] or "")
            if not existing_type:
                group["reference_type_used"] = reference_type
            elif existing_type != reference_type:
                group["reference_type_used"] = "Mixed"
        confidence = float(row.get("confidence") or 0)
        if confidence > float(group["confidence"]):
            group["confidence"] = confidence

    project_groups: dict[str, dict[str, Any]] = {}
    for row in project_rows:
        mapping_id = str(row.get("id") or "").strip()
        if not mapping_id:
            continue
        group = project_groups.setdefault(
            mapping_id,
            {
                "id": mapping_id,
                "customer_mapping_id": str(row.get("customer_mapping_id") or "").strip(),
                "standard_project_name": str(row.get("standard_project_name") or "").strip(),
                "project_group_key": str(row.get("project_group_key") or "").strip(),
                "ocn_number": str(row.get("ocn_number") or "").strip(),
                "mapping_status": str(row.get("mapping_status") or "").strip(),
                "confidence": 0.0,
                "reference_values": set(),
                "budget_project_names": set(),
                "actuals_project_names": set(),
                "number_of_budget_rows": 0,
                "number_of_actual_rows": 0,
                "last_updated": row.get("updated_at"),
            },
        )
        alias_name = str(row.get("alias_project_name") or "").strip()
        source_type = str(row.get("source_type") or "").strip().lower()
        if alias_name:
            if source_type == "actuals":
                group["actuals_project_names"].add(alias_name)
            else:
                group["budget_project_names"].add(alias_name)
        reference_type = str(row.get("reference_type") or "").strip()
        reference_value = str(row.get("reference_value") or "").strip()
        if reference_type and reference_value:
            group["reference_values"].add(f"{reference_type}:{reference_value}")
        confidence = float(row.get("confidence") or 0)
        if confidence > float(group["confidence"]):
            group["confidence"] = confidence

    for group in customer_groups.values():
        key = str(group.get("customer_group_key") or "").strip().lower()
        group["number_of_budget_rows"] = int(budget_by_customer.get(key, 0))
        group["number_of_actual_rows"] = int(len(group["actuals_customer_names"]))
        group["budget_customer_names"] = sorted(group["budget_customer_names"])
        group["actuals_customer_names"] = sorted(group["actuals_customer_names"])
        group["updated_customer_names"] = sorted(group["updated_customer_names"])
        group["reference_values"] = _csv_join(group["reference_values"])
        updated_at = group.get("last_updated")
        group["last_updated"] = (
            updated_at.isoformat().replace("+00:00", "Z")
            if isinstance(updated_at, datetime)
            else None
        )

    for group in project_groups.values():
        key = str(group.get("project_group_key") or "").strip().lower()
        group["number_of_budget_rows"] = int(budget_by_project.get(key, 0))
        group["number_of_actual_rows"] = int(len(group["actuals_project_names"]))
        group["budget_project_names"] = sorted(group["budget_project_names"])
        group["actuals_project_names"] = sorted(group["actuals_project_names"])
        group["reference_values"] = _csv_join(group["reference_values"])
        updated_at = group.get("last_updated")
        group["last_updated"] = (
            updated_at.isoformat().replace("+00:00", "Z")
            if isinstance(updated_at, datetime)
            else None
        )

    return {
        "financial_year": financial_year,
        "summary": {
            "customer_group_count": len(customer_groups),
            "project_group_count": len(project_groups),
            "manual_review_rows": len(manual_review_rows),
        },
        "customer_groups": list(customer_groups.values()),
        "project_groups": list(project_groups.values()),
        "manual_review": manual_review_rows,
    }


def apply_budget_mapping_group_action(
    *,
    entity_type: str,
    action: str,
    mapping_id: str,
    actor: str,
    standard_name: str | None = None,
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_entity = str(entity_type or "").strip().lower()
    normalized_action = str(action or "").strip().lower()
    normalized_mapping_id = str(mapping_id or "").strip()
    if normalized_entity not in {"customer", "project"}:
        raise HTTPException(status_code=400, detail="entity_type must be customer or project.")
    if not normalized_mapping_id:
        raise HTTPException(status_code=400, detail="mapping_id is required.")

    table_name = "customer_mapping_master" if normalized_entity == "customer" else "project_mapping_master"
    name_column = "standard_customer_name" if normalized_entity == "customer" else "standard_project_name"
    key_column = "customer_group_key" if normalized_entity == "customer" else "project_group_key"
    now_iso = utc_now_iso()

    status_by_action = {
        "approve": "Approved",
        "reject": "Rejected",
        "manual_review": "Manual Review",
    }
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            if normalized_action in status_by_action:
                next_status = status_by_action[normalized_action]
                cursor.execute(
                    f"""
                    update {table_name}
                    set
                        mapping_status = %s,
                        approved_by = case when %s = 'Approved' then %s else approved_by end,
                        approved_at = case when %s = 'Approved' then %s::timestamptz else approved_at end,
                        updated_at = %s::timestamptz
                    where id = %s::uuid
                    """,
                    (
                        next_status,
                        next_status,
                        actor,
                        next_status,
                        now_iso,
                        now_iso,
                        normalized_mapping_id,
                    ),
                )
            elif normalized_action == "edit_name":
                next_name = str(standard_name or "").strip()
                if not next_name:
                    raise HTTPException(status_code=400, detail="standard_name is required for edit_name.")
                next_key = (
                    build_customer_group_key(next_name)
                    if normalized_entity == "customer"
                    else clean_key(normalize_name_for_compare(next_name) or next_name)
                )
                cursor.execute(
                    f"""
                    update {table_name}
                    set
                        {name_column} = %s,
                        {key_column} = %s,
                        updated_at = %s::timestamptz
                    where id = %s::uuid
                    """,
                    (
                        next_name,
                        next_key,
                        now_iso,
                        normalized_mapping_id,
                    ),
                )
                if normalized_entity == "customer":
                    cursor.execute(
                        """
                        update budget_records
                        set
                            standard_customer_name = %s,
                            updated_customer = %s,
                            client_name = %s,
                            customer_group_key = %s
                        where lower(customer_group_key) = lower(%s)
                        """,
                        (
                            next_name,
                            next_name,
                            next_name,
                            next_key,
                            next_key,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        update budget_records
                        set
                            standard_project_name = %s,
                            project_name = %s,
                            project_group_key = %s
                        where lower(project_group_key) = lower(%s)
                        """,
                        (
                            next_name,
                            next_name,
                            next_key,
                            next_key,
                        ),
                    )
            else:
                raise HTTPException(status_code=400, detail="Unsupported mapping action.")
        connection.commit()

    return {
        "status": "updated",
        "entity_type": normalized_entity,
        "action": normalized_action,
        "mapping_id": normalized_mapping_id,
    }


def _manual_mapping_to_row(mapping: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in mapping.items():
        output[normalize_column_name(key)] = value
    output["ps_ms_budget"] = normalize_ms_ps(output.get("ps_ms_budget"))
    output["_match_source"] = output.get("_match_source") or "Manual"
    return output


def apply_budget_manual_mapping(
    *,
    upload_batch_id: str,
    row_number: int,
    selected_mapping: dict[str, Any],
    overwrite_existing: bool = False,
) -> dict[str, Any]:
    ensure_postgres_schema()
    mapped_row = _manual_mapping_to_row(selected_mapping)
    now_iso = utc_now_iso()

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select processed_payload
                from budget_upload_processed_rows
                where upload_batch_id = %s::uuid and row_number = %s
                """,
                (upload_batch_id, row_number),
            )
            row = cursor.fetchone()
            if not row or not isinstance(row.get("processed_payload"), dict):
                raise HTTPException(status_code=404, detail="Processed row not found.")

            processed_payload = dict(row["processed_payload"])
            enriched_row, enriched_fields = enrich_row_from_match(
                processed_payload,
                mapped_row,
                overwrite_existing=overwrite_existing,
            )
            enriched_row["standard_customer_name"] = str(
                enriched_row.get("updated_customer")
                or enriched_row.get("standard_customer_name")
                or enriched_row.get("customer_name")
                or enriched_row.get("original_customer_name")
                or ""
            ).strip()
            enriched_row["standard_project_name"] = str(
                enriched_row.get("project_name")
                or enriched_row.get("standard_project_name")
                or enriched_row.get("original_project_name")
                or ""
            ).strip()
            enriched_row["customer_group_key"] = str(
                enriched_row.get("customer_group_key")
                or build_customer_group_key(enriched_row.get("standard_customer_name"))
            ).strip()
            enriched_row["project_group_key"] = str(
                enriched_row.get("project_group_key")
                or build_project_group_key(
                    enriched_row.get("customer_group_key") or "",
                    enriched_row.get("standard_project_name"),
                )
            ).strip()
            enriched_row["mapping_status"] = "Customer and Project Standardized"
            enriched_row["mapping_confidence"] = 100
            enriched_row["mapping_reason"] = "Manual review approved by admin."
            enriched_row["needs_manual_review"] = False
            enriched_row["match_status"] = "Manual Review Approved"
            enriched_row["match_confidence"] = 100
            enriched_row["match_source"] = mapped_row.get("_match_source") or "Manual"
            enriched_row["manual_review_reason"] = ""
            enriched_row["enriched_fields"] = sorted(set(enriched_fields))
            enriched_row["suggested_matches"] = []

            cursor.execute(
                """
                update budget_upload_processed_rows
                set
                    processed_payload = %s::jsonb,
                    match_status = %s,
                    match_confidence = %s,
                    match_source = %s,
                    manual_review_reason = '',
                    manual_approved = true,
                    updated_at = %s::timestamptz
                where upload_batch_id = %s::uuid and row_number = %s
                """,
                (
                    _json_dumps(enriched_row),
                    enriched_row["match_status"],
                    float(enriched_row["match_confidence"]),
                    enriched_row["match_source"],
                    now_iso,
                    upload_batch_id,
                    row_number,
                ),
            )
        connection.commit()

    persist_mapping_suggestions(
        processed_rows=[enriched_row],
        actor="budget-manual-map",
    )

    return {
        "status": "updated",
        "upload_batch_id": upload_batch_id,
        "row_number": row_number,
        "row": enriched_row,
    }
