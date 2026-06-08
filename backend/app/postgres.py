from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from threading import Lock
from typing import Any, Iterator

from .financial_dataset import FIELD_SPECS
from .masterdata_dataset import MASTERDATA_FIELD_SPECS
from .rapid_revenue_dataset import RAPID_REVENUE_FIELD_SPECS

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

DATABASE_URL_ENV_KEYS = ("RAPID_DATABASE_URL", "DATABASE_URL")
DEFAULT_DB_CONNECT_TIMEOUT_SECONDS = 3
SQL_TYPE_BY_KIND = {
    "text": "text",
    "numeric": "numeric(18,2)",
    "date": "date",
}
LOGGER = logging.getLogger(__name__)
_SCHEMA_LOCK_NAME = "rapid_schema_migration_v1"
_SCHEMA_SENTINEL_TABLE = "rapid_forecast_month_snapshots"
_SCHEMA_READY_FOR_URL: str | None = None
_SCHEMA_INIT_LOCK = Lock()
_SCHEMA_RETRY_NOT_BEFORE = 0.0
_SCHEMA_RETRY_BACKOFF_SECONDS = 30.0
_SCHEMA_RETRY_ERROR_BACKOFF_SECONDS = 180.0


def get_database_url() -> str | None:
    for key in DATABASE_URL_ENV_KEYS:
        value = os.getenv(key, "").strip()
        if value:
            return value
    return None


def get_db_connect_timeout_seconds() -> int:
    raw_value = os.getenv("RAPID_DB_CONNECT_TIMEOUT", "").strip()
    if not raw_value:
        return DEFAULT_DB_CONNECT_TIMEOUT_SECONDS

    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_DB_CONNECT_TIMEOUT_SECONDS

    return value if value > 0 else DEFAULT_DB_CONNECT_TIMEOUT_SECONDS


def is_postgres_configured() -> bool:
    return bool(get_database_url())


def is_postgres_driver_ready() -> bool:
    return psycopg is not None and dict_row is not None


def get_database_status() -> dict[str, str]:
    if not is_postgres_configured():
        return {"status": "unconfigured", "message": "Set RAPID_DATABASE_URL to enable PostgreSQL."}

    if not is_postgres_driver_ready():
        return {"status": "driver-missing", "message": "Install psycopg to use PostgreSQL."}

    try:
        with open_database_connection(require=True) as connection:
            assert connection is not None
            with connection.cursor() as cursor:
                cursor.execute("select 1 as ok")
                cursor.fetchone()
        return {"status": "ok", "message": "PostgreSQL connection established."}
    except RuntimeError as error:
        return {"status": "error", "message": str(error)}


def _row_first_value(row: Any) -> Any:
    if isinstance(row, dict):
        return next(iter(row.values()), None)
    if isinstance(row, (list, tuple)):
        return row[0] if row else None
    return row


def _schema_table_exists(connection: Any, table_name: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute("select to_regclass(%s) as table_ref", (f"public.{table_name}",))
        return bool(_row_first_value(cursor.fetchone()))


def ensure_postgres_schema() -> None:
    global _SCHEMA_READY_FOR_URL, _SCHEMA_RETRY_NOT_BEFORE

    database_url = get_database_url()
    if not database_url:
        return
    # Avoid rerunning the same DDL on every analytics request in a warm process.
    if _SCHEMA_READY_FOR_URL == database_url:
        return

    if time.monotonic() < _SCHEMA_RETRY_NOT_BEFORE:
        return

    with _SCHEMA_INIT_LOCK:
        if _SCHEMA_READY_FOR_URL == database_url:
            return
        if time.monotonic() < _SCHEMA_RETRY_NOT_BEFORE:
            return

        try:
            with open_database_connection(require=True) as connection:
                assert connection is not None
                previous_autocommit = bool(getattr(connection, "autocommit", False))
                # Keep DDL out of transaction blocks so advisory lock and CREATE/ALTER
                # statements can run safely on fresh databases.
                connection.autocommit = True
                schema_sql = build_schema_sql()
                lock_acquired = False
                try:
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "select pg_try_advisory_lock(hashtext(%s)) as locked",
                            (_SCHEMA_LOCK_NAME,),
                        )
                        lock_acquired = bool(_row_first_value(cursor.fetchone()))
                        if not lock_acquired:
                            _SCHEMA_RETRY_NOT_BEFORE = (
                                time.monotonic() + _SCHEMA_RETRY_BACKOFF_SECONDS
                            )
                            return

                    # Execute idempotent DDL on process warm-up so new columns and
                    # tables are applied even after initial schema bootstrap.
                    with connection.cursor() as cursor:
                        cursor.execute(schema_sql)
                except Exception as error:
                    # Keep request path alive even if schema bootstrap collides
                    # with concurrent write traffic.
                    try:
                        connection.rollback()
                    except Exception:
                        pass

                    _SCHEMA_RETRY_NOT_BEFORE = (
                        time.monotonic() + _SCHEMA_RETRY_ERROR_BACKOFF_SECONDS
                    )
                    LOGGER.warning(
                        "PostgreSQL schema bootstrap failed; will retry later: %s",
                        error,
                    )
                    return
                finally:
                    if lock_acquired:
                        try:
                            with connection.cursor() as cursor:
                                cursor.execute(
                                    "select pg_advisory_unlock(hashtext(%s))",
                                    (_SCHEMA_LOCK_NAME,),
                                )
                        except Exception:
                            pass
                    connection.autocommit = previous_autocommit
        except Exception as error:
            _SCHEMA_RETRY_NOT_BEFORE = (
                time.monotonic() + _SCHEMA_RETRY_ERROR_BACKOFF_SECONDS
            )
            LOGGER.warning("PostgreSQL schema bootstrap skipped due to connection error: %s", error)
            return

        _SCHEMA_READY_FOR_URL = database_url
        _SCHEMA_RETRY_NOT_BEFORE = 0.0


def build_schema_sql() -> str:
    revenue_columns = ",\n  ".join(
        f"{field.key} {SQL_TYPE_BY_KIND[field.kind]}"
        for field in FIELD_SPECS
    )
    rapid_revenue_columns = ",\n  ".join(
        f"{field.key} {SQL_TYPE_BY_KIND[field.kind]}"
        for field in RAPID_REVENUE_FIELD_SPECS
    )
    masterdata_columns = ",\n  ".join(
        f"{field.key} {SQL_TYPE_BY_KIND[field.kind]}"
        for field in MASTERDATA_FIELD_SPECS
    )
    revenue_alter_columns = "\n".join(
        f"alter table if exists financial_records add column if not exists {field.key} {SQL_TYPE_BY_KIND[field.kind]};"
        for field in FIELD_SPECS
    )
    rapid_revenue_alter_columns = "\n".join(
        f"alter table if exists rapid_revenue_records add column if not exists {field.key} {SQL_TYPE_BY_KIND[field.kind]};"
        for field in RAPID_REVENUE_FIELD_SPECS
    )
    masterdata_record_tables = (
        "budget_records",
        "global_revenue_records",
        "forecast_records",
    )
    masterdata_alter_columns = "\n".join(
        f"alter table if exists {table_name} add column if not exists {field.key} {SQL_TYPE_BY_KIND[field.kind]};"
        for table_name in masterdata_record_tables
        for field in MASTERDATA_FIELD_SPECS
    )
    masterdata_tables = (
        ("budget", "budget_uploads", "budget_records"),
        ("global_revenue", "global_revenue_uploads", "global_revenue_records"),
        ("forecast", "forecast_uploads", "forecast_records"),
    )
    masterdata_sql_blocks: list[str] = []
    for dataset_type, upload_table, record_table in masterdata_tables:
        block = f"""
create table if not exists {upload_table} (
  id uuid primary key,
  financial_year text not null,
  upload_month text,
  original_filename text not null,
  stored_filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null,
  imported_rows integer not null default 0,
  parsed_sheets text[] not null default array[]::text[],
  matched_columns text[] not null default array[]::text[],
  is_active boolean not null default true
);

create table if not exists {record_table} (
  id bigserial primary key,
  upload_id uuid not null references {upload_table}(id) on delete cascade,
  financial_year text not null,
  source_sheet text not null default '',
  source_row_number integer not null default 0,
  business_key text not null,
  raw_payload jsonb not null default '{{}}'::jsonb,
  {masterdata_columns},
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists {record_table}_year_business_uidx;
create index if not exists {record_table}_year_business_idx
  on {record_table} (financial_year, business_key);
create index if not exists {record_table}_year_idx
  on {record_table} (financial_year);
create index if not exists {record_table}_ms_ps_idx
  on {record_table} (ms_ps);
create index if not exists {record_table}_customer_idx
  on {record_table} (customer_name);
create index if not exists {record_table}_project_idx
  on {record_table} (project_name);
create index if not exists {record_table}_resource_idx
  on {record_table} (resource_name);
create index if not exists {record_table}_bdm_idx
  on {record_table} (lower(coalesce(bdm, '')));
create index if not exists {record_table}_practice_head_idx
  on {record_table} (lower(coalesce(practice_head, '')));
create index if not exists {record_table}_geo_head_idx
  on {record_table} (lower(coalesce(geo_head, '')));
create index if not exists {record_table}_updated_at_idx
  on {record_table} (updated_at desc);
create index if not exists {upload_table}_year_active_idx
  on {upload_table} (financial_year, is_active, uploaded_at desc);
alter table if exists {upload_table}
  add column if not exists upload_month text;
"""
        if dataset_type == "budget":
            block += """
drop index if exists budget_records_ms_ocn_uidx;
drop index if exists budget_records_ps_emp_uidx;
create index if not exists budget_records_ms_ocn_idx
  on budget_records (financial_year, lower(ocn_number))
  where lower(coalesce(ms_ps, '')) = 'ms'
    and nullif(trim(ocn_number), '') is not null;
create index if not exists budget_records_ps_emp_idx
  on budget_records (financial_year, lower(resource_id))
  where lower(coalesce(ms_ps, '')) = 'ps'
    and nullif(trim(resource_id), '') is not null;
alter table if exists budget_records
  add column if not exists original_customer_name text;
alter table if exists budget_records
  add column if not exists standard_customer_name text;
alter table if exists budget_records
  add column if not exists customer_group_key text;
alter table if exists budget_records
  add column if not exists original_project_name text;
alter table if exists budget_records
  add column if not exists standard_project_name text;
alter table if exists budget_records
  add column if not exists project_group_key text;
alter table if exists budget_records
  add column if not exists primary_reference_type text;
alter table if exists budget_records
  add column if not exists primary_reference_value text;
alter table if exists budget_records
  add column if not exists mapping_status text;
alter table if exists budget_records
  add column if not exists mapping_confidence numeric(6,2);
alter table if exists budget_records
  add column if not exists mapping_reason text;
alter table if exists budget_records
  add column if not exists needs_manual_review boolean not null default false;
create index if not exists budget_records_customer_group_idx
  on budget_records (financial_year, lower(coalesce(customer_group_key, '')));
create index if not exists budget_records_project_group_idx
  on budget_records (financial_year, lower(coalesce(project_group_key, '')));
"""
        masterdata_sql_blocks.append(block)
    masterdata_sql = "\n".join(masterdata_sql_blocks)
    trend_sql = """
create table if not exists uploaded_files (
  id uuid primary key,
  file_name text not null,
  file_type text not null,
  financial_year text,
  upload_month text,
  upload_year integer,
  uploaded_by text,
  status text not null default 'processed',
  rows_processed integer not null default 0,
  rows_failed integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists uploaded_files_type_year_idx
  on uploaded_files (file_type, financial_year, created_at desc);

create table if not exists budget_data (
  id bigserial primary key,
  customer_name text,
  updated_customer text,
  original_customer_name text,
  standard_customer_name text,
  customer_group_key text,
  project_name text,
  original_project_name text,
  standard_project_name text,
  project_group_key text,
  ms_ps text,
  entity text,
  gr_entity text,
  row_us text,
  strategic_account text,
  resource_id text,
  resource_name text,
  deal_type text,
  eeennn text,
  bill_rate numeric(18,2) not null default 0,
  start_date date,
  end_date date,
  rate_type text,
  billed_currency text,
  type_of_projects text,
  practice_head text,
  bdm text,
  geo_head text,
  vertical text,
  horizontal text,
  ocn_number text,
  month text not null,
  year integer not null,
  quarter text,
  primary_reference_type text,
  primary_reference_value text,
  mapping_status text,
  mapping_confidence numeric(6,2),
  mapping_reason text,
  needs_manual_review boolean not null default false,
  budget_amount numeric(18,2) not null default 0,
  fy_year text not null,
  uploaded_file_id uuid references uploaded_files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists budget_data
  add column if not exists updated_customer text;
alter table if exists budget_data
  add column if not exists original_customer_name text;
alter table if exists budget_data
  add column if not exists standard_customer_name text;
alter table if exists budget_data
  add column if not exists customer_group_key text;
alter table if exists budget_data
  add column if not exists original_project_name text;
alter table if exists budget_data
  add column if not exists standard_project_name text;
alter table if exists budget_data
  add column if not exists project_group_key text;
alter table if exists budget_data
  add column if not exists primary_reference_type text;
alter table if exists budget_data
  add column if not exists primary_reference_value text;
alter table if exists budget_data
  add column if not exists mapping_status text;
alter table if exists budget_data
  add column if not exists mapping_confidence numeric(6,2);
alter table if exists budget_data
  add column if not exists mapping_reason text;
alter table if exists budget_data
  add column if not exists needs_manual_review boolean not null default false;
create index if not exists budget_data_fy_month_idx
  on budget_data (fy_year, year, month);
create index if not exists budget_data_customer_idx
  on budget_data (lower(coalesce(customer_name, '')));
create index if not exists budget_data_project_idx
  on budget_data (lower(coalesce(project_name, '')));
create index if not exists budget_data_customer_group_idx
  on budget_data (lower(coalesce(customer_group_key, '')));
create index if not exists budget_data_project_group_idx
  on budget_data (lower(coalesce(project_group_key, '')));
create index if not exists budget_data_bdm_idx
  on budget_data (lower(coalesce(bdm, '')));

create table if not exists actual_revenue (
  id bigserial primary key,
  emp_id text,
  ocn_number text,
  customer_id text,
  customer_name text,
  project_name text,
  resource_name text,
  billed_hours numeric(18,2) not null default 0,
  billable_actual_hrs numeric(18,2) not null default 0,
  actual_hours numeric(18,2) not null default 0,
  revenue_type text,
  tp_plan text,
  effort_month text,
  rate_type text,
  rate numeric(18,2) not null default 0,
  billed_currency text,
  amount numeric(18,2) not null default 0,
  tax_rate numeric(18,2) not null default 0,
  invoice_no text,
  invoice_date date,
  invoice_amount numeric(18,2) not null default 0,
  revenue numeric(18,2) not null default 0,
  expenses numeric(18,2) not null default 0,
  portal_fees numeric(18,2) not null default 0,
  tax numeric(18,2) not null default 0,
  company text,
  branch text,
  region text,
  state text,
  sbu text,
  sub_sbu text,
  dept text,
  service_line text,
  type_of_projects text,
  ms_ps text,
  month text not null,
  year integer not null,
  book_currency text,
  fx_rate_book_currency numeric(18,6) not null default 0,
  revenue_book_currency numeric(18,2) not null default 0,
  actual_revenue_value numeric(18,2) not null default 0,
  bdm text,
  vertical text,
  horizontal text,
  practice_head text,
  geo_head text,
  group_company text,
  buh text,
  region_summary text,
  sales_region text,
  strategic_account text,
  eeennn text,
  uploaded_file_id uuid references uploaded_files(id) on delete set null,
  fy_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actual_revenue_fy_month_idx
  on actual_revenue (fy_year, year, month);
create index if not exists actual_revenue_customer_idx
  on actual_revenue (lower(coalesce(customer_name, '')));
create index if not exists actual_revenue_project_idx
  on actual_revenue (lower(coalesce(project_name, '')));
create index if not exists actual_revenue_bdm_idx
  on actual_revenue (lower(coalesce(bdm, '')));
create index if not exists actual_revenue_ocn_idx
  on actual_revenue (lower(coalesce(ocn_number, '')));
create index if not exists actual_revenue_emp_id_idx
  on actual_revenue (lower(coalesce(emp_id, '')));
alter table if exists actual_revenue
  add column if not exists ocn_number text;
alter table if exists actual_revenue
  add column if not exists strategic_account text;
alter table if exists actual_revenue
  add column if not exists eeennn text;

create table if not exists trend_summary (
  id bigserial primary key,
  customer_name text,
  project_name text,
  month text not null,
  year integer not null,
  quarter text,
  bdm text,
  practice_head text,
  geo_head text,
  vertical text,
  horizontal text,
  entity text,
  ms_ps text,
  region text,
  sales_region text,
  strategic_account text,
  budget_amount numeric(18,2) not null default 0,
  actual_revenue numeric(18,2) not null default 0,
  budget_variance numeric(18,2) not null default 0,
  budget_variance_percent numeric(18,2) not null default 0,
  budget_achievement_percent numeric(18,2) not null default 0,
  previous_month_revenue numeric(18,2) not null default 0,
  previous_year_revenue numeric(18,2) not null default 0,
  revenue_growth_percent numeric(18,2) not null default 0,
  year_over_year_growth_percent numeric(18,2) not null default 0,
  margin_amount numeric(18,2) not null default 0,
  margin_percent numeric(18,2) not null default 0,
  utilization_percent numeric(18,2) not null default 0,
  predicted_revenue numeric(18,2) not null default 0,
  prediction_confidence numeric(18,4) not null default 0,
  prediction_method text,
  risk_score numeric(18,2) not null default 0,
  risk_level text,
  risk_reason text,
  anomaly_flag boolean not null default false,
  anomaly_reason text,
  anomaly_severity text,
  fy_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trend_summary_fy_month_idx
  on trend_summary (fy_year, year, month);
create index if not exists trend_summary_customer_idx
  on trend_summary (lower(coalesce(customer_name, '')));
create index if not exists trend_summary_project_idx
  on trend_summary (lower(coalesce(project_name, '')));
create index if not exists trend_summary_bdm_idx
  on trend_summary (lower(coalesce(bdm, '')));
create index if not exists trend_summary_region_idx
  on trend_summary (lower(coalesce(region, '')));
create index if not exists trend_summary_sales_region_idx
  on trend_summary (lower(coalesce(sales_region, '')));
create index if not exists trend_summary_risk_idx
  on trend_summary (risk_level, risk_score desc);
create index if not exists trend_summary_anomaly_idx
  on trend_summary (anomaly_flag, fy_year, updated_at desc);
alter table if exists trend_summary
  add column if not exists entity text;

create table if not exists ml_predictions (
  id bigserial primary key,
  prediction_level text not null,
  customer_name text,
  project_name text,
  bdm text,
  practice_head text,
  geo_head text,
  vertical text,
  horizontal text,
  ms_ps text,
  month text not null,
  year integer not null,
  quarter text,
  budget_amount numeric(18,2) not null default 0,
  actual_revenue numeric(18,2) not null default 0,
  previous_month_revenue numeric(18,2) not null default 0,
  previous_year_revenue numeric(18,2) not null default 0,
  predicted_revenue numeric(18,2) not null default 0,
  lower_bound numeric(18,2) not null default 0,
  upper_bound numeric(18,2) not null default 0,
  confidence_score numeric(18,4) not null default 0,
  dimension_name text,
  region text,
  sales_region text,
  prediction_method text,
  model_used text,
  model_version text,
  fy_year text not null,
  created_at timestamptz not null default now()
);
create index if not exists ml_predictions_fy_level_idx
  on ml_predictions (fy_year, prediction_level, year, month);

create table if not exists insight_logs (
  id bigserial primary key,
  insight_type text not null,
  severity text not null,
  title text not null,
  description text not null,
  recommendation text not null,
  dimension_type text,
  dimension_name text,
  customer_name text,
  project_name text,
  bdm text,
  practice_head text,
  geo_head text,
  vertical text,
  horizontal text,
  ms_ps text,
  month text,
  year integer,
  metric_value numeric(18,2) not null default 0,
  comparison_value numeric(18,2) not null default 0,
  fy_year text not null,
  created_at timestamptz not null default now()
);
create index if not exists insight_logs_fy_type_idx
  on insight_logs (fy_year, insight_type, created_at desc);
create index if not exists insight_logs_customer_idx
  on insight_logs (lower(coalesce(customer_name, '')), created_at desc);

alter table if exists trend_summary
  add column if not exists previous_year_revenue numeric(18,2) not null default 0;
alter table if exists trend_summary
  add column if not exists year_over_year_growth_percent numeric(18,2) not null default 0;
alter table if exists trend_summary
  add column if not exists predicted_revenue numeric(18,2) not null default 0;
alter table if exists trend_summary
  add column if not exists prediction_confidence numeric(18,4) not null default 0;
alter table if exists trend_summary
  add column if not exists prediction_method text;
alter table if exists trend_summary
  add column if not exists risk_reason text;
create index if not exists trend_summary_region_idx
  on trend_summary (lower(coalesce(region, '')));
create index if not exists trend_summary_sales_region_idx
  on trend_summary (lower(coalesce(sales_region, '')));

alter table if exists ml_predictions
  add column if not exists previous_month_revenue numeric(18,2) not null default 0;
alter table if exists ml_predictions
  add column if not exists previous_year_revenue numeric(18,2) not null default 0;
alter table if exists ml_predictions
  add column if not exists dimension_name text;
alter table if exists ml_predictions
  add column if not exists region text;
alter table if exists ml_predictions
  add column if not exists sales_region text;
alter table if exists ml_predictions
  add column if not exists prediction_method text;

alter table if exists insight_logs
  add column if not exists dimension_type text;
alter table if exists insight_logs
  add column if not exists dimension_name text;
"""
    budget_upload_workflow_sql = """
create table if not exists budget_upload_batches (
  id uuid primary key,
  financial_year text not null,
  upload_month text,
  original_filename text not null,
  stored_filename text not null,
  overwrite_existing boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  summary_json jsonb not null default '{}'::jsonb
);
create index if not exists budget_upload_batches_year_idx
  on budget_upload_batches (financial_year, created_at desc);

create table if not exists budget_upload_processed_rows (
  id bigserial primary key,
  upload_batch_id uuid not null references budget_upload_batches(id) on delete cascade,
  row_number integer not null,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_payload jsonb not null default '{}'::jsonb,
  normalized_ps_ms text,
  primary_identifier_type text,
  primary_identifier_value text,
  mapping_key text,
  validation_status text not null default 'Error',
  validation_message text not null default '',
  match_status text not null default 'Validation Error',
  match_confidence numeric(6,2) not null default 0,
  match_source text not null default 'None',
  manual_review_reason text not null default '',
  manual_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists budget_upload_processed_rows_batch_row_uidx
  on budget_upload_processed_rows (upload_batch_id, row_number);
create index if not exists budget_upload_processed_rows_status_idx
  on budget_upload_processed_rows (validation_status, match_status, updated_at desc);

create table if not exists customer_mapping_master (
  id uuid primary key,
  standard_customer_name text not null,
  customer_group_key text not null,
  customer_id text,
  mapping_status text not null default 'Suggested',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_mapping_master_group_key_uidx
  on customer_mapping_master (lower(customer_group_key));
create index if not exists customer_mapping_master_status_idx
  on customer_mapping_master (mapping_status, updated_at desc);

create table if not exists customer_mapping_alias (
  id uuid primary key,
  customer_mapping_id uuid not null references customer_mapping_master(id) on delete cascade,
  alias_customer_name text not null,
  normalized_alias_customer_name text not null,
  source_type text not null,
  reference_type text,
  reference_value text,
  confidence numeric(6,2),
  active_flag boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_mapping_alias_unique_idx
  on customer_mapping_alias (
    customer_mapping_id,
    normalized_alias_customer_name,
    lower(coalesce(reference_type, '')),
    lower(coalesce(reference_value, ''))
  );
create index if not exists customer_mapping_alias_lookup_idx
  on customer_mapping_alias (normalized_alias_customer_name, active_flag);

create table if not exists project_mapping_master (
  id uuid primary key,
  customer_mapping_id uuid references customer_mapping_master(id) on delete set null,
  standard_project_name text not null,
  project_group_key text not null,
  ocn_number text,
  mapping_status text not null default 'Suggested',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_mapping_master_group_key_uidx
  on project_mapping_master (lower(project_group_key));
create index if not exists project_mapping_master_customer_idx
  on project_mapping_master (customer_mapping_id, updated_at desc);

create table if not exists project_mapping_alias (
  id uuid primary key,
  project_mapping_id uuid not null references project_mapping_master(id) on delete cascade,
  alias_project_name text not null,
  normalized_alias_project_name text not null,
  source_type text not null,
  reference_type text,
  reference_value text,
  confidence numeric(6,2),
  active_flag boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_mapping_alias_unique_idx
  on project_mapping_alias (
    project_mapping_id,
    normalized_alias_project_name,
    lower(coalesce(reference_type, '')),
    lower(coalesce(reference_value, ''))
  );
create index if not exists project_mapping_alias_lookup_idx
  on project_mapping_alias (normalized_alias_project_name, active_flag);
"""
    table_alias_views_sql = """
drop view if exists budget;
create view budget as
select * from budget_records;

drop view if exists forecast;
create view forecast as
select * from forecast_records;

drop view if exists actuals;
create view actuals as
select * from actual_revenue;

drop view if exists masterdata;
create view masterdata as
select
  id::text as id,
  'budget'::text as dataset_type,
  financial_year,
  customer_name,
  project_name,
  resource_name,
  bdm,
  geo_head,
  vertical,
  horizontal,
  updated_at
from budget_records
union all
select
  id::text as id,
  'global_revenue'::text as dataset_type,
  financial_year,
  customer_name,
  project_name,
  resource_name,
  bdm,
  geo_head,
  vertical,
  horizontal,
  updated_at
from global_revenue_records
union all
select
  id::text as id,
  'forecast'::text as dataset_type,
  financial_year,
  customer_name,
  project_name,
  resource_name,
  bdm,
  geo_head,
  vertical,
  horizontal,
  updated_at
from forecast_records;
"""

    return f"""
create table if not exists financial_workbook_uploads (
  id uuid primary key,
  financial_year text not null,
  original_filename text not null,
  stored_filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null,
  imported_rows integer not null default 0,
  parsed_sheets text[] not null default array[]::text[],
  matched_columns text[] not null default array[]::text[],
  is_active boolean not null default true
);

create table if not exists financial_records (
  id bigserial primary key,
  upload_id uuid not null references financial_workbook_uploads(id) on delete cascade,
  financial_year text not null,
  source_sheet text not null,
  source_row_number integer not null,
  raw_payload jsonb not null default '{{}}'::jsonb,
  {revenue_columns}
);

create unique index if not exists financial_records_upload_row_uidx
  on financial_records (upload_id, source_sheet, source_row_number);
create index if not exists financial_records_year_idx
  on financial_records (financial_year);
create index if not exists financial_records_region_idx
  on financial_records (region);
create index if not exists financial_records_customer_idx
  on financial_records (customer_name);
create index if not exists financial_records_project_idx
  on financial_records (project_name);
create index if not exists financial_records_practice_head_idx
  on financial_records (practice_head);
create index if not exists financial_records_geo_head_idx
  on financial_records (geo_head);
create index if not exists financial_records_deal_type_idx
  on financial_records (deal_type);
create index if not exists financial_records_business_type_idx
  on financial_records (business_type);
create index if not exists financial_workbook_uploads_year_active_idx
  on financial_workbook_uploads (financial_year, is_active, uploaded_at desc);
{revenue_alter_columns}

create table if not exists rapid_revenue_uploads (
  id uuid primary key,
  financial_year text not null,
  source_dataset_type text,
  source_upload_id uuid,
  original_filename text not null,
  stored_filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null,
  imported_rows integer not null default 0,
  parsed_sheets text[] not null default array[]::text[],
  matched_columns text[] not null default array[]::text[],
  is_active boolean not null default true
);

create table if not exists rapid_revenue_records (
  id bigserial primary key,
  upload_id uuid not null references rapid_revenue_uploads(id) on delete cascade,
  financial_year text not null,
  source_sheet text not null,
  source_row_number integer not null,
  raw_payload jsonb not null default '{{}}'::jsonb,
  {rapid_revenue_columns}
);

create unique index if not exists rapid_revenue_records_upload_row_uidx
  on rapid_revenue_records (upload_id, source_sheet, source_row_number);
create index if not exists rapid_revenue_records_year_idx
  on rapid_revenue_records (financial_year);
create index if not exists rapid_revenue_records_practice_head_idx
  on rapid_revenue_records (practice_head);
create index if not exists rapid_revenue_records_bdm_idx
  on rapid_revenue_records (bdm);
create index if not exists rapid_revenue_records_geo_head_idx
  on rapid_revenue_records (geo_head);
create index if not exists rapid_revenue_records_vertical_idx
  on rapid_revenue_records (vertical);
create index if not exists rapid_revenue_records_horizontal_idx
  on rapid_revenue_records (horizontal);
create index if not exists rapid_revenue_records_customer_idx
  on rapid_revenue_records (customer_name);
create index if not exists rapid_revenue_uploads_year_active_idx
  on rapid_revenue_uploads (financial_year, is_active, uploaded_at desc);
alter table if exists rapid_revenue_uploads
  add column if not exists source_dataset_type text;
alter table if exists rapid_revenue_uploads
  add column if not exists source_upload_id uuid;
create index if not exists rapid_revenue_uploads_source_idx
  on rapid_revenue_uploads (source_dataset_type, source_upload_id);
{rapid_revenue_alter_columns}

create table if not exists rapid_forecast_entries (
  id uuid primary key,
  upload_id uuid not null references rapid_revenue_uploads(id) on delete cascade,
  record_id bigint not null references rapid_revenue_records(id) on delete cascade,
  financial_year text not null,
  forecast_month text not null,
  budget_value numeric(18,2) not null default 0,
  forecast_value numeric(18,2) not null default 0,
  billed_hours numeric(18,2) not null default 0,
  billable_actual_hrs numeric(18,2) not null default 0,
  submitted_by_user_id text not null,
  submitted_by_name text not null,
  submitted_at timestamptz not null
);

create unique index if not exists rapid_forecast_entries_record_month_uidx
  on rapid_forecast_entries (record_id, forecast_month);
create index if not exists rapid_forecast_entries_month_idx
  on rapid_forecast_entries (forecast_month, submitted_at desc);
create index if not exists rapid_forecast_entries_submitter_idx
  on rapid_forecast_entries (submitted_by_user_id, submitted_at desc);
alter table if exists rapid_forecast_entries
  add column if not exists billed_hours numeric(18,2) not null default 0;
alter table if exists rapid_forecast_entries
  add column if not exists billable_actual_hrs numeric(18,2) not null default 0;

create table if not exists rapid_forecast_drafts (
  id uuid primary key,
  record_id bigint not null references rapid_revenue_records(id) on delete cascade,
  forecast_month text not null,
  draft_owner_role text not null,
  forecast_value numeric(18,2) not null default 0,
  billed_hours numeric(18,2) not null default 0,
  billable_actual_hrs numeric(18,2) not null default 0,
  updated_by_user_id text not null,
  updated_by_name text not null,
  updated_at timestamptz not null
);

create unique index if not exists rapid_forecast_drafts_uidx
  on rapid_forecast_drafts (record_id, forecast_month, draft_owner_role);
create index if not exists rapid_forecast_drafts_month_idx
  on rapid_forecast_drafts (forecast_month, draft_owner_role, updated_at desc);

create table if not exists revenue_variance_comments (
  id bigserial primary key,
  financial_year text not null,
  comparison_month text not null,
  table_id text not null,
  row_label text not null,
  variance_percent numeric(9,2) not null default 0,
  comment_text text not null default '',
  authored_by text,
  author_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists revenue_variance_comments_key_uidx
  on revenue_variance_comments (financial_year, comparison_month, table_id, row_label);
create index if not exists revenue_variance_comments_year_month_idx
  on revenue_variance_comments (financial_year, comparison_month, updated_at desc);
create index if not exists revenue_variance_comments_table_idx
  on revenue_variance_comments (table_id, updated_at desc);

create table if not exists rapid_notifications (
  id uuid primary key,
  category text not null,
  audience_role text,
  audience_user_id text,
  title text not null,
  message text not null,
  link text,
  created_at timestamptz not null,
  metadata jsonb not null default '{{}}'::jsonb
);

create index if not exists rapid_notifications_role_idx
  on rapid_notifications (audience_role, created_at desc);
create index if not exists rapid_notifications_user_idx
  on rapid_notifications (audience_user_id, created_at desc);

create table if not exists rapid_audit_logs (
  id uuid primary key,
  user_id text,
  user_email text,
  role text,
  module text,
  description text,
  ip_address text,
  user_agent text,
  actor_user_id text,
  actor_name text,
  actor_role text,
  action text not null,
  status text not null default 'success',
  detail text not null default '',
  metadata jsonb not null default '{{}}'::jsonb,
  created_at timestamptz not null
);

create index if not exists rapid_audit_logs_created_idx
  on rapid_audit_logs (created_at desc);
create index if not exists rapid_audit_logs_actor_idx
  on rapid_audit_logs (actor_user_id, created_at desc);
create index if not exists rapid_audit_logs_action_idx
  on rapid_audit_logs (action, created_at desc);
alter table if exists rapid_audit_logs
  add column if not exists user_id text;
alter table if exists rapid_audit_logs
  add column if not exists user_email text;
alter table if exists rapid_audit_logs
  add column if not exists role text;
alter table if exists rapid_audit_logs
  add column if not exists module text;
alter table if exists rapid_audit_logs
  add column if not exists description text;
alter table if exists rapid_audit_logs
  add column if not exists ip_address text;
alter table if exists rapid_audit_logs
  add column if not exists user_agent text;
create index if not exists rapid_audit_logs_module_idx
  on rapid_audit_logs (module, created_at desc);

create table if not exists rapid_user_activity_sessions (
  session_id text primary key,
  user_id text not null,
  user_name text not null,
  user_email text,
  role_id text,
  role_name text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ended_at timestamptz,
  total_active_seconds integer not null default 0,
  heartbeat_count integer not null default 0,
  last_path text not null default '/',
  metadata jsonb not null default '{{}}'::jsonb
);

create index if not exists rapid_user_activity_last_seen_idx
  on rapid_user_activity_sessions (last_seen_at desc);
create index if not exists rapid_user_activity_user_idx
  on rapid_user_activity_sessions (user_id, last_seen_at desc);

create table if not exists rapid_country_working_days (
  id uuid primary key,
  country text not null,
  month_label text not null,
  working_days integer not null,
  actual_working_days integer not null default 22,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table rapid_country_working_days
  add column if not exists actual_working_days integer not null default 22;

create unique index if not exists rapid_country_working_days_month_uidx
  on rapid_country_working_days (lower(country), month_label);

create table if not exists rapid_customer_holidays (
  id uuid primary key,
  customer_name text not null,
  holiday_date date not null,
  holiday_name text not null default 'Holiday',
  project_name text,
  bdm text,
  practice_head text,
  geo_head text,
  updated_by text,
  updated_at timestamptz not null default now()
);
create unique index if not exists rapid_customer_holidays_scope_uidx
  on rapid_customer_holidays (
    lower(customer_name),
    holiday_date,
    lower(coalesce(project_name, '')),
    lower(coalesce(bdm, '')),
    lower(coalesce(practice_head, ''))
  );
create index if not exists rapid_customer_holidays_bdm_idx
  on rapid_customer_holidays (lower(coalesce(bdm, '')), holiday_date);
create index if not exists rapid_customer_holidays_practice_idx
  on rapid_customer_holidays (lower(coalesce(practice_head, '')), holiday_date);
create index if not exists rapid_customer_holidays_customer_idx
  on rapid_customer_holidays (lower(customer_name), holiday_date);

create table if not exists rapid_customer_working_days (
  id uuid primary key,
  customer_name text not null,
  bdm text,
  practice_head text,
  geo_head text,
  month_label text not null,
  working_days integer not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
create unique index if not exists rapid_customer_working_days_scope_uidx
  on rapid_customer_working_days (
    lower(customer_name),
    lower(coalesce(bdm, '')),
    lower(coalesce(practice_head, '')),
    lower(coalesce(geo_head, '')),
    month_label
  );
create index if not exists rapid_customer_working_days_bdm_idx
  on rapid_customer_working_days (lower(coalesce(bdm, '')), month_label);
create index if not exists rapid_customer_working_days_practice_idx
  on rapid_customer_working_days (lower(coalesce(practice_head, '')), month_label);
create index if not exists rapid_customer_working_days_customer_idx
  on rapid_customer_working_days (lower(customer_name), month_label);

create table if not exists rapid_project_assignment_requests (
  id uuid primary key,
  record_id bigint not null references rapid_revenue_records(id) on delete cascade,
  customer_name text not null,
  project_name text,
  geo_head text,
  practice_head text,
  current_bdm text,
  requested_bdm text not null,
  requested_by_user_id text not null,
  requested_by_name text not null,
  status text not null default 'pending',
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id text,
  decided_by_name text
);
create index if not exists rapid_project_assignment_requests_status_idx
  on rapid_project_assignment_requests (status, created_at desc);
create index if not exists rapid_project_assignment_requests_geo_idx
  on rapid_project_assignment_requests (lower(coalesce(geo_head, '')), status, created_at desc);
create index if not exists rapid_project_assignment_requests_record_idx
  on rapid_project_assignment_requests (record_id, created_at desc);

create table if not exists rapid_forecast_controls (
  id text primary key,
  lockin_day integer not null default 1,
  lockout_day integer not null default 10,
  lockin_date date,
  lockout_date date,
  rollout_start_month text not null default 'Apr 2026',
  updated_by text,
  updated_at timestamptz not null default now()
);
create unique index if not exists rapid_forecast_controls_id_uidx
  on rapid_forecast_controls (id);
alter table if exists rapid_forecast_controls add column if not exists lockin_date date;
alter table if exists rapid_forecast_controls add column if not exists lockout_date date;

create table if not exists rapid_forecast_role_entries (
  id uuid primary key,
  record_id bigint not null references rapid_revenue_records(id) on delete cascade,
  forecast_month text not null,
  submitter_role text not null,
  forecast_value numeric(18,2) not null default 0,
  billed_hours numeric(18,2) not null default 0,
  billable_actual_hrs numeric(18,2) not null default 0,
  submitted_by_user_id text not null,
  submitted_by_name text not null,
  submitted_at timestamptz not null
);

create unique index if not exists rapid_forecast_role_entries_uidx
  on rapid_forecast_role_entries (record_id, forecast_month, submitter_role);
create index if not exists rapid_forecast_role_entries_month_idx
  on rapid_forecast_role_entries (forecast_month, submitter_role, submitted_at desc);

create table if not exists rapid_forecast_month_snapshots (
  id uuid primary key,
  financial_year text not null,
  forecast_month text not null,
  record_id bigint not null references rapid_revenue_records(id) on delete cascade,
  row_snapshot jsonb not null default '{{}}'::jsonb,
  forecast_value numeric(18,2) not null default 0,
  billed_hours numeric(18,2) not null default 0,
  billable_actual_hrs numeric(18,2) not null default 0,
  submitted_by_user_id text,
  submitted_by_name text,
  submitted_at timestamptz,
  archived_by text not null,
  archived_at timestamptz not null
);
create unique index if not exists rapid_forecast_month_snapshots_uidx
  on rapid_forecast_month_snapshots (financial_year, forecast_month, record_id);
create index if not exists rapid_forecast_month_snapshots_month_idx
  on rapid_forecast_month_snapshots (forecast_month, archived_at desc);

{masterdata_sql}
{masterdata_alter_columns}
{trend_sql}
{budget_upload_workflow_sql}
{table_alias_views_sql}

create table if not exists saved_dashboards (
  id uuid primary key,
  user_id text not null,
  name text not null,
  dataset_type text not null,
  layout_json jsonb not null default '{{}}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create unique index if not exists saved_dashboards_id_uidx
  on saved_dashboards (id);

create index if not exists saved_dashboards_user_idx
  on saved_dashboards (user_id, updated_at desc);

create table if not exists saved_chart_configs (
  id uuid primary key,
  dashboard_id uuid references saved_dashboards(id) on delete cascade,
  user_id text not null,
  chart_name text not null,
  chart_type text not null,
  dataset_type text not null,
  x_axis text,
  y_axis text,
  config_json jsonb not null default '{{}}'::jsonb,
  filters_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists saved_chart_configs_user_idx
  on saved_chart_configs (user_id, updated_at desc);

create index if not exists saved_chart_configs_dashboard_idx
  on saved_chart_configs (dashboard_id, updated_at desc);

create table if not exists user_chart_preferences (
  user_id text primary key,
  preferences_json jsonb not null default '{{}}'::jsonb,
  updated_at timestamptz not null
);
"""


@contextmanager
def open_database_connection(require: bool = False) -> Iterator[Any]:
    database_url = get_database_url()
    if not database_url:
        if require:
            raise RuntimeError("PostgreSQL is not configured. Set RAPID_DATABASE_URL.")
        yield None
        return

    if psycopg is None or dict_row is None:
        raise RuntimeError("PostgreSQL support is unavailable because psycopg is not installed.")

    connection = None
    try:
        connection = psycopg.connect(
            database_url,
            row_factory=dict_row,
            connect_timeout=get_db_connect_timeout_seconds(),
        )
    except Exception as error:
        raise RuntimeError(f"PostgreSQL connection failed: {error}") from error

    try:
        yield connection
    finally:
        if connection is not None:
            connection.close()
