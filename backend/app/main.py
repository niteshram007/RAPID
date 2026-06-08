from __future__ import annotations

import io
import tempfile
from pathlib import Path
from typing import Any, List, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .audit_log_store import export_audit_logs_docx, list_audit_logs, record_audit_log
from .analytics_engine import (
    drilldown,
    filter_data,
    generate_chart,
    get_analytics_schema,
    get_chart_suggestions,
    save_dashboard,
)
from .masterdata_store import (
    export_masterdata_records,
    get_masterdata_rows,
    preview_masterdata_upload,
    save_masterdata_grid_changes,
)
from .neural_switch_integration import get_neural_switch_subapp
from .neuralswitch import NeuralSwitchChatRequest, NeuralSwitchOrchestrator
from .postgres import get_database_status
from .rag import get_rag_store
from .rapid_revenue_store import (
    clear_all_recorded_forecasts,
    create_project_assignment_request,
    create_new_project_forecast_row,
    create_renewal_forecast_row,
    decide_project_assignment_request,
    delete_manual_forecast_row,
    get_customer_holidays,
    get_customer_working_days,
    get_forecast_control_settings,
    get_forecast_user_name_options,
    get_country_working_days,
    get_bdm_forecast_sheet,
    get_notifications,
    get_project_assignment_requests,
    get_rapid_revenue_overview,
    get_rapid_revenue_rows,
    get_rapid_revenue_slicer_options,
    reassign_project_scope,
    save_bdm_forecast_draft,
    save_bdm_forecast_submission,
    save_customer_holidays,
    save_customer_working_days,
    save_forecast_control_settings,
    save_country_working_days,
)
from .schemas.forex_schema import (
    ForexHistoricalQuery,
    ForexLatestQuery,
    ForexRangeQuery,
    ForexSummaryQuery,
)
from .security import (
    ensure_self_or_admin,
    enforce_backend_security,
    get_client_ip,
    get_principal,
    get_user_agent,
    safe_content_disposition_filename,
    scoped_values,
)
from .services.forex_service import (
    get_forex_currencies,
    get_forex_range,
    get_forex_summary,
    get_historical_forex_rate,
    get_latest_forex_rate,
)
from .schemas.drilldown import DrillDownContext, DrillDownExportRequest
from .services.drilldown_service import (
    export_drilldown_details,
    get_drilldown_details,
)
from .services.budget_upload_mapping_service import (
    apply_budget_manual_mapping,
    apply_budget_mapping_group_action,
    confirm_budget_upload_save,
    create_budget_upload_preview,
    get_budget_mapping_admin_payload,
)
from .services.trend_summary_service import (
    export_trend_excel,
    get_anomalies,
    get_budget_vs_actual,
    get_insights,
    get_monthly_comparison,
    get_predictions,
    get_risk_data,
    get_trend_filters,
    get_trend_kpis,
    get_trend_summary_rows,
    get_year_over_year,
    refresh_trend_analytics,
)
from .store import (
    add_location,
    build_admin_overview,
    build_predictions,
    build_workspace_dashboard,
    build_workspace_slicers,
    delete_upload,
    get_locations_summary,
    get_revenue_dashboard_data,
    get_revenue_budget_kiosk_data,
    get_revenue_monthly_comparison_data,
    get_revenue_overview_data,
    get_revenue_variance_comments,
    get_settings,
    get_uploads_summary,
    get_user_summaries,
    list_financial_years,
    save_upload,
    save_revenue_variance_comment_entry,
    update_settings,
    utc_now_iso,
)
from .upload_security import reject_formula_injection, safe_store_upload, validate_upload_extension
from .user_activity_store import (
    close_user_activity_session,
    get_user_activity_overview,
    record_user_activity_heartbeat,
)


class LocationCreateRequest(BaseModel):
    kind: Literal["geo", "practice"]
    name: str = Field(min_length=1, max_length=80)


class SettingsUpdateRequest(BaseModel):
    localLlmEnabled: bool
    localLlmBaseUrl: str = Field(min_length=1)
    localLlmPlatformBaseUrl: str = Field(default="")
    localLlmApiKey: str = Field(default="")
    localLlmModel: str = Field(min_length=1)
    localLlmTemperature: float = Field(ge=0, le=1)
    defaultFinancialYear: str = Field(min_length=9)
    showRestrictedRoleBudgets: bool = False


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1)


class ForecastSubmissionRow(BaseModel):
    recordId: int
    forecastValue: float | None = None
    billedHours: float | None = None
    billableActualHrs: float | None = None
    rowValues: dict[str, Any] | None = None


class ForecastSubmissionRequest(BaseModel):
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    bdms: List[str] = Field(default_factory=list)
    submitterRoleId: str | None = None
    forecastMonth: str = Field(min_length=1)
    rows: List[ForecastSubmissionRow] = Field(default_factory=list)


class CountryWorkingDaysRow(BaseModel):
    country: str = Field(min_length=1)
    workingDays: dict[str, int] = Field(default_factory=dict)
    actualWorkingDays: dict[str, int] = Field(default_factory=dict)


class CountryWorkingDaysSaveRequest(BaseModel):
    rows: List[CountryWorkingDaysRow] = Field(default_factory=list)
    updatedBy: str = Field(default="admin-settings")


class CustomerHolidayRow(BaseModel):
    customerName: str = Field(min_length=1)
    holidayDate: str = Field(min_length=1)
    holidayName: str | None = None
    projectName: str | None = None
    bdm: str | None = None
    practiceHead: str | None = None
    geoHead: str | None = None


class CustomerHolidaySaveRequest(BaseModel):
    rows: List[CustomerHolidayRow] = Field(default_factory=list)
    updatedBy: str = Field(default="admin-settings")


class CustomerWorkingDaysRow(BaseModel):
    customerName: str = Field(min_length=1)
    bdm: str | None = None
    practiceHead: str | None = None
    geoHead: str | None = None
    workingDays: dict[str, int] = Field(default_factory=dict)


class CustomerWorkingDaysSaveRequest(BaseModel):
    rows: List[CustomerWorkingDaysRow] = Field(default_factory=list)
    updatedBy: str = Field(default="admin-settings")
    bdms: List[str] = Field(default_factory=list)
    practiceHeads: List[str] = Field(default_factory=list)
    geoHeads: List[str] = Field(default_factory=list)


class ForecastControlSaveRequest(BaseModel):
    lockinDay: int | None = Field(default=None, ge=1, le=31)
    lockoutDay: int | None = Field(default=None, ge=1, le=31)
    lockinDate: str | None = None
    lockoutDate: str | None = None
    rolloutStartMonth: str = Field(min_length=1)
    updatedBy: str = Field(default="admin-settings")


class UserActivityHeartbeatRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    userEmail: str | None = None
    roleId: str | None = None
    roleName: str | None = None
    path: str = Field(default="/")
    metadata: dict[str, Any] = Field(default_factory=dict)


class UserActivityCloseRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    userId: str | None = None
    userName: str | None = None
    userEmail: str | None = None
    roleId: str | None = None
    roleName: str | None = None
    path: str = Field(default="/")
    metadata: dict[str, Any] = Field(default_factory=dict)


class ForecastRowCreateRequest(BaseModel):
    mode: Literal["renewal", "new_project"] = "new_project"
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    bdms: List[str] = Field(default_factory=list)
    practiceHeads: List[str] = Field(default_factory=list)
    recordId: int | None = None
    financialYear: str | None = None
    values: dict[str, Any] = Field(default_factory=dict)


class ProjectAssignmentCreateRequest(BaseModel):
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    recordId: int
    bdm: str = Field(min_length=1)


class ProjectAssignmentDecisionRequest(BaseModel):
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    geoHeads: List[str] = Field(default_factory=list)
    requestId: str = Field(min_length=1)
    decision: Literal["approved", "rejected"]
    note: str | None = None


class ProjectReassignmentRequest(BaseModel):
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)
    assignmentType: Literal["bdm", "geo_head"]
    effectiveMonth: str = Field(min_length=1)
    recordId: int | None = None
    currentBdm: str | None = None
    nextBdm: str | None = None
    currentGeoHead: str | None = None
    nextGeoHead: str | None = None
    practiceHead: str | None = None
    entity: str | None = None
    financialYear: str | None = None


class ForecastResetRequest(BaseModel):
    userId: str = Field(min_length=1)
    userName: str = Field(min_length=1)


class MasterdataSaveRequest(BaseModel):
    datasetType: Literal["budget", "global_revenue", "forecast"]
    financialYear: str = Field(min_length=1)
    rows: List[dict] = Field(default_factory=list)
    deletedIds: List[int] = Field(default_factory=list)
    updatedBy: str = Field(default="manual-editor")


class BudgetConfirmSaveRequest(BaseModel):
    uploadBatchId: str = Field(min_length=1)
    skipValidationErrors: bool = True
    saveManualReviewRows: bool = True
    updatedBy: str = Field(default="budget-confirm-save")


class BudgetManualMapRequest(BaseModel):
    uploadBatchId: str = Field(min_length=1)
    rowNumber: int = Field(ge=1)
    selectedMapping: dict[str, Any] = Field(default_factory=dict)
    overwriteExisting: bool = False


class BudgetMappingActionRequest(BaseModel):
    entityType: Literal["customer", "project"]
    action: str = Field(min_length=1)
    mappingId: str = Field(min_length=1)
    standardName: str | None = None
    actor: str = Field(default="admin-masterdata")


class AnalyticsFilterRequest(BaseModel):
    field: str = Field(min_length=1)
    operator: Literal["eq", "neq", "in", "between", "gte", "lte", "contains"] = "eq"
    value: Any = None


class AnalyticsGenerateChartRequest(BaseModel):
    datasetType: Literal["budget", "global_revenue", "forecast"]
    financialYear: str | None = None
    chartType: str = Field(default="bar")
    xAxis: str | None = None
    yAxis: str | None = None
    measures: List[str] = Field(default_factory=list)
    aggregation: Literal["sum", "avg", "count", "min", "max"] = "sum"
    groupBy: List[str] = Field(default_factory=list)
    filters: List[AnalyticsFilterRequest] = Field(default_factory=list)
    sortBy: str | None = None
    sortDirection: Literal["asc", "desc"] = "desc"
    limit: int = Field(default=60, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class AnalyticsFilterDataRequest(BaseModel):
    datasetType: Literal["budget", "global_revenue", "forecast"]
    financialYear: str | None = None
    columns: List[str] = Field(default_factory=list)
    filters: List[AnalyticsFilterRequest] = Field(default_factory=list)
    limit: int = Field(default=100, ge=1, le=2000)
    offset: int = Field(default=0, ge=0)


class AnalyticsDrilldownRequest(BaseModel):
    baseConfig: dict = Field(default_factory=dict)
    drillField: str = Field(default="")
    drillValue: Any = None
    nextDimension: str = Field(default="")


class AnalyticsSaveDashboardRequest(BaseModel):
    userId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    datasetType: Literal["budget", "global_revenue", "forecast"]
    dashboardId: str | None = None
    layout: dict = Field(default_factory=dict)
    charts: List[dict] = Field(default_factory=list)


class TrendRefreshRequest(BaseModel):
    financialYear: str | None = None
    uploadMonth: str | None = None


class RevenueVarianceCommentSaveRequest(BaseModel):
    financialYear: str = Field(min_length=1)
    comparisonMonth: str = Field(min_length=1)
    tableId: str = Field(min_length=1)
    rowLabel: str = Field(min_length=1)
    variancePercent: float | None = None
    comment: str = Field(default="")
    authoredBy: str | None = None
    authorRole: str | None = None


class AuditEventRequest(BaseModel):
    userId: str | None = None
    userEmail: str | None = None
    userName: str | None = None
    role: str | None = None
    action: str = Field(min_length=1)
    module: str = Field(min_length=1)
    description: str = Field(default="")
    status: str = Field(default="success")
    ipAddress: str | None = None
    userAgent: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


def _collect_request_filters(request: Request) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    for key in request.query_params.keys():
        values = [value.strip() for value in request.query_params.getlist(key) if value.strip()]
        if not values:
            continue
        filters[key] = values if len(values) > 1 else values[0]
    _apply_request_scope_to_filters(request, filters)
    return filters


def _scoped_query_values(request: Request, values: list[str] | None, scope_key: str) -> list[str]:
    return scoped_values(request, values or [], scope_key)


def _scope_filter_value(request: Request, value: Any, scope_key: str) -> Any:
    current_values = value if isinstance(value, list) else [value] if value else []
    scoped = _scoped_query_values(request, current_values, scope_key)
    if isinstance(value, list):
        return scoped
    return scoped[0] if scoped else None


def _apply_request_scope_to_filters(request: Request, filters: dict[str, Any]) -> dict[str, Any]:
    for key, scope_key in (
        ("bdm", "bdms"),
        ("bdms", "bdms"),
        ("practice_head", "practiceHeads"),
        ("practiceHeads", "practiceHeads"),
        ("geo_head", "geoHeads"),
        ("geoHeads", "geoHeads"),
        ("entity", "entities"),
        ("entities", "entities"),
        ("vertical", "verticals"),
        ("verticals", "verticals"),
    ):
        if key in filters:
            filters[key] = _scope_filter_value(request, filters[key], scope_key)

    # Hard-enforce scoped visibility for restricted roles even when no query
    # filters are provided by the client.
    for key, scope_key in (
        ("bdms", "bdms"),
        ("practiceHeads", "practiceHeads"),
        ("geoHeads", "geoHeads"),
        ("entities", "entities"),
        ("verticals", "verticals"),
    ):
        raw_value = filters.get(key)
        requested_values = (
            raw_value
            if isinstance(raw_value, list)
            else [raw_value]
            if raw_value not in (None, "")
            else []
        )
        scoped = _scoped_query_values(request, requested_values, scope_key)
        if scoped or key in filters:
            filters[key] = scoped
    return filters


def _audit_actor(request: Request) -> dict[str, str | None]:
    principal = get_principal(request)
    return {
        "actor_user_id": principal.user_id if principal else None,
        "actor_email": principal.user_email if principal else None,
        "actor_name": principal.name if principal else None,
        "actor_role": principal.role if principal else None,
        "ip_address": get_client_ip(request),
        "user_agent": get_user_agent(request),
    }


def _record_request_audit(
    request: Request,
    action: str,
    *,
    module: str,
    description: str,
    status: str = "success",
    metadata: dict[str, Any] | None = None,
) -> None:
    record_audit_log(
        action,
        module=module,
        description=description,
        status=status,
        metadata=metadata,
        **_audit_actor(request),
    )


def _upload_module(dataset_type: str) -> str:
    normalized = str(dataset_type or "").strip().lower()
    if normalized == "budget":
        return "budget upload"
    if normalized == "global_revenue":
        return "actuals upload"
    return "dashboard"


app = FastAPI(
    title="Rapid FastAPI Backend",
    summary="Admin data, uploads, and Neural Switch APIs for Rapid.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(enforce_backend_security)
app.mount("/api/neural-switch", get_neural_switch_subapp(get_settings()))
_rapid_neuralswitch_orchestrator = NeuralSwitchOrchestrator()


@app.on_event("startup")
def initialize_rag_store() -> None:
    # Ensure the local vector store is initialized at startup so RAG is ready
    # before the first document upload or retrieval request.
    get_rag_store()


@app.get("/api/health", tags=["system"])
def health_check() -> dict:
    database = get_database_status()
    return {
        "service": "rapid-fastapi-backend",
        "status": "ok" if database["status"] in {"ok", "unconfigured"} else "degraded",
        "timestamp": utc_now_iso(),
        "database": database,
    }


@app.post("/api/neuralswitch/chat", tags=["neural switch"])
async def rapid_neuralswitch_chat(payload: NeuralSwitchChatRequest, request: Request) -> dict:
    principal = get_principal(request)
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    response = await _rapid_neuralswitch_orchestrator.chat(
        payload,
        principal=principal,
        user_id=principal.user_id,
    )
    return response.model_dump(mode="json")


@app.post("/api/audit/events", tags=["audit"])
def audit_event(payload: AuditEventRequest, request: Request) -> dict:
    record_audit_log(
        payload.action,
        actor_user_id=payload.userId,
        actor_email=payload.userEmail,
        actor_name=payload.userName,
        actor_role=payload.role,
        module=payload.module,
        description=payload.description,
        status=payload.status,
        ip_address=payload.ipAddress or get_client_ip(request),
        user_agent=payload.userAgent or get_user_agent(request),
        metadata=payload.metadata,
    )
    return {"status": "logged"}


@app.get("/api/admin/overview", tags=["admin"])
def admin_overview() -> dict:
    return build_admin_overview()


@app.get("/api/admin/users", tags=["admin"])
def admin_users() -> dict:
    return {"users": get_user_summaries()}


@app.get("/api/admin/locations", tags=["admin"])
def admin_locations() -> dict:
    return get_locations_summary()


@app.post("/api/admin/locations", tags=["admin"])
def create_location(payload: LocationCreateRequest) -> dict:
    return add_location(payload.kind, payload.name)


@app.get("/api/admin/uploads", tags=["admin"])
def admin_uploads() -> dict:
    return get_uploads_summary()


@app.delete("/api/admin/uploads/{upload_id}", tags=["admin"])
def admin_delete_upload(
    request: Request,
    upload_id: str,
    actorUserId: str | None = None,
    actorName: str | None = None,
    actorRole: str | None = None,
) -> dict:
    record = delete_upload(upload_id)
    record_audit_log(
        "admin.upload.delete",
        module="budget upload",
        description=f"Deleted upload {upload_id}.",
        actor_user_id=actorUserId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=actorName or _audit_actor(request)["actor_name"] or "admin-upload",
        actor_role=actorRole or _audit_actor(request)["actor_role"],
        detail=f"Deleted upload {upload_id}.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return {
        "status": "deleted",
        "record": record,
    }


@app.post("/api/admin/uploads", tags=["admin"])
async def upload_financial_workbook(
    request: Request,
    financial_year: str = Form(...),
    dataset_type: str = Form("financial_workbook"),
    upload_month: str | None = Form(default=None),
    workbook: UploadFile = File(...),
    actor_user_id: str | None = Form(default=None),
    actor_name: str | None = Form(default=None),
    actor_role: str | None = Form(default=None),
) -> dict:
    audit_actor = _audit_actor(request)
    audit_actor["actor_user_id"] = actor_user_id or audit_actor["actor_user_id"]
    audit_actor["actor_name"] = actor_name or audit_actor["actor_name"] or "admin-upload"
    audit_actor["actor_role"] = actor_role or audit_actor["actor_role"]
    try:
        record = save_upload(
            financial_year,
            workbook,
            dataset_type=dataset_type,
            upload_month=upload_month,
        )
    except HTTPException as error:
        record_audit_log(
            "admin.upload",
            module=_upload_module(dataset_type),
            description=f"Upload rejected for {workbook.filename or 'unknown file'}.",
            status="failure",
            detail=str(error.detail),
            metadata={
                "financialYear": financial_year,
                "datasetType": dataset_type,
                "uploadMonth": upload_month,
                "reason": str(error.detail),
            },
            **audit_actor,
        )
        raise
    record_audit_log(
        "admin.upload",
        module=_upload_module(dataset_type),
        description=(
            f"Uploaded {dataset_type} workbook {workbook.filename or 'unknown'}"
            f"{f' for {upload_month}' if upload_month else ''}."
        ),
        status="success",
        metadata={
            "financialYear": financial_year,
            "datasetType": dataset_type,
            "uploadMonth": upload_month,
            "rows": record.get("importedRows"),
        },
        **audit_actor,
    )
    return {
        "status": "uploaded",
        "record": record,
    }


@app.post("/api/admin/masterdata/upload-preview", tags=["admin"])
async def admin_masterdata_upload_preview(
    dataset_type: str = Form(...),
    workbook: UploadFile = File(...),
) -> dict:
    validate_upload_extension(workbook.filename, dataset_type.strip().lower())
    suffix = Path(workbook.filename or "preview.xlsx").suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
        temp_path = Path(temporary_file.name)
    safe_store_upload(workbook, temp_path)
    reject_formula_injection(temp_path)

    try:
        payload = preview_masterdata_upload(dataset_type=dataset_type, workbook_path=temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

    return {
        "status": "previewed",
        **payload,
    }


@app.post("/api/budget/upload-preview", tags=["budget"])
async def budget_upload_preview(
    request: Request,
    financial_year: str = Form(...),
    workbook: UploadFile = File(...),
    overwrite_existing: bool = Form(default=False),
) -> dict:
    validate_upload_extension(workbook.filename, "budget")
    suffix = Path(workbook.filename or "budget-preview.xlsx").suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
        temp_path = Path(temporary_file.name)
    safe_store_upload(workbook, temp_path)
    reject_formula_injection(temp_path)

    principal = get_principal(request)
    created_by = principal.user_email or principal.name if principal else "budget-upload-preview"
    try:
        payload = create_budget_upload_preview(
            workbook_path=temp_path,
            financial_year=financial_year,
            overwrite_existing=overwrite_existing,
            created_by=created_by,
        )
    finally:
        temp_path.unlink(missing_ok=True)

    _record_request_audit(
        request,
        "budget.upload.preview",
        module="budget upload",
        description=f"Generated budget preview for {financial_year}.",
        metadata={"financialYear": financial_year},
    )
    return {
        "status": "previewed",
        **payload,
    }


@app.post("/api/budget/confirm-save", tags=["budget"])
def budget_confirm_save(request: Request, payload: BudgetConfirmSaveRequest) -> dict:
    response = confirm_budget_upload_save(
        upload_batch_id=payload.uploadBatchId,
        updated_by=payload.updatedBy,
        skip_validation_errors=payload.skipValidationErrors,
        save_manual_review_rows=payload.saveManualReviewRows,
    )
    _record_request_audit(
        request,
        "budget.confirm_save",
        module="budget upload",
        description=f"Confirmed budget batch {payload.uploadBatchId}.",
        metadata={
            "uploadBatchId": payload.uploadBatchId,
            "savedRows": response.get("saved_rows"),
            "skippedRows": response.get("skipped_rows"),
        },
    )
    return response


@app.post("/api/budget/manual-map", tags=["budget"])
def budget_manual_map(request: Request, payload: BudgetManualMapRequest) -> dict:
    response = apply_budget_manual_mapping(
        upload_batch_id=payload.uploadBatchId,
        row_number=payload.rowNumber,
        selected_mapping=payload.selectedMapping,
        overwrite_existing=payload.overwriteExisting,
    )
    _record_request_audit(
        request,
        "budget.manual_map",
        module="budget upload",
        description=f"Applied manual mapping for row {payload.rowNumber}.",
        metadata={
            "uploadBatchId": payload.uploadBatchId,
            "rowNumber": payload.rowNumber,
        },
    )
    return response


@app.get("/api/admin/masterdata/mapping-groups", tags=["admin"])
def admin_masterdata_mapping_groups(
    financialYear: str = Query(..., min_length=1),
) -> dict:
    return get_budget_mapping_admin_payload(financialYear)


@app.post("/api/admin/masterdata/mapping-groups/action", tags=["admin"])
def admin_masterdata_mapping_action(
    request: Request,
    payload: BudgetMappingActionRequest,
) -> dict:
    response = apply_budget_mapping_group_action(
        entity_type=payload.entityType,
        action=payload.action,
        mapping_id=payload.mappingId,
        actor=payload.actor,
        standard_name=payload.standardName,
    )
    _record_request_audit(
        request,
        "masterdata.mapping.action",
        module="masterdata",
        description=f"Applied {payload.action} on {payload.entityType} mapping {payload.mappingId}.",
        metadata={
            "entityType": payload.entityType,
            "action": payload.action,
            "mappingId": payload.mappingId,
        },
    )
    return response


@app.get("/api/admin/masterdata", tags=["admin"])
def admin_masterdata_rows(
    datasetType: str = Query(..., min_length=1),
    financialYear: str | None = None,
    limit: int = Query(500, ge=1, le=100000),
    includeMetadata: bool = Query(True),
) -> dict:
    return get_masterdata_rows(
        dataset_type=datasetType,
        financial_year=financialYear,
        limit=limit,
        include_metadata=includeMetadata,
    )


@app.post("/api/admin/masterdata/save", tags=["admin"])
def admin_masterdata_save(payload: MasterdataSaveRequest) -> dict:
    return save_masterdata_grid_changes(
        dataset_type=payload.datasetType,
        financial_year=payload.financialYear,
        rows=payload.rows,
        deleted_ids=payload.deletedIds,
        updated_by=payload.updatedBy,
    )


@app.get("/api/admin/masterdata/export", tags=["admin"])
def admin_masterdata_export(
    request: Request,
    datasetType: str = Query(..., min_length=1),
    financialYear: str | None = None,
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
) -> StreamingResponse:
    principal = get_principal(request)
    filename, content = export_masterdata_records(
        dataset_type=datasetType,
        financial_year=financialYear,
        allowed_bdms=_scoped_query_values(request, bdms, "bdms"),
        allowed_practice_heads=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        allowed_geo_heads=_scoped_query_values(request, geoHeads, "geoHeads"),
        allowed_entities=_scoped_query_values(request, entities, "entities"),
        allowed_verticals=_scoped_query_values(request, verticals, "verticals"),
        generated_by=principal.user_email or principal.name if principal else "system",
    )
    _record_request_audit(
        request,
        "export.masterdata",
        module="exports",
        description=f"Exported {datasetType} masterdata.",
        metadata={"datasetType": datasetType, "financialYear": financialYear},
    )
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_content_disposition_filename(filename)}"',
        },
    )


@app.get("/api/revenue/masterdata", tags=["workspace"])
def revenue_masterdata_rows(
    request: Request,
    datasetType: str = Query(..., min_length=1),
    financialYear: str | None = None,
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    limit: int = Query(500, ge=1, le=100000),
    includeMetadata: bool = Query(False),
) -> dict:
    return get_masterdata_rows(
        dataset_type=datasetType,
        financial_year=financialYear,
        limit=limit,
        allowed_bdms=_scoped_query_values(request, bdms, "bdms"),
        allowed_practice_heads=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        allowed_geo_heads=_scoped_query_values(request, geoHeads, "geoHeads"),
        allowed_entities=_scoped_query_values(request, entities, "entities"),
        allowed_verticals=_scoped_query_values(request, verticals, "verticals"),
        include_metadata=includeMetadata,
    )


@app.get("/api/analytics/schema", tags=["analytics"])
def analytics_schema(
    datasetType: str = Query(..., min_length=1),
    financialYear: str | None = None,
) -> dict:
    return get_analytics_schema(datasetType, financialYear)


@app.get("/api/analytics/chart-suggestions", tags=["analytics"])
def analytics_chart_suggestions(
    datasetType: str = Query(..., min_length=1),
    financialYear: str | None = None,
) -> dict:
    return get_chart_suggestions(datasetType, financialYear)


@app.post("/api/analytics/generate-chart", tags=["analytics"])
def analytics_generate_chart(payload: AnalyticsGenerateChartRequest) -> dict:
    return generate_chart(payload.model_dump())


@app.post("/api/analytics/filter-data", tags=["analytics"])
def analytics_filter_data(payload: AnalyticsFilterDataRequest) -> dict:
    return filter_data(payload.model_dump())


@app.post("/api/analytics/drilldown", tags=["analytics"])
def analytics_drilldown(payload: AnalyticsDrilldownRequest) -> dict:
    return drilldown(payload.model_dump())


@app.post("/api/drilldown/details", tags=["analytics"])
def drilldown_details(request: Request, payload: DrillDownContext) -> dict:
    principal = get_principal(request)
    response = get_drilldown_details(payload.model_dump(), principal)
    _record_request_audit(
        request,
        "drilldown.details",
        module="dashboard",
        description="Viewed drill-down details.",
        metadata={
            "source": payload.source,
            "metric": payload.metric,
            "page": payload.page,
            "pageSize": payload.page_size,
        },
    )
    return response


@app.post("/api/drilldown/export", tags=["analytics"])
def drilldown_export(request: Request, payload: DrillDownExportRequest) -> StreamingResponse:
    principal = get_principal(request)
    filename, content, media_type = export_drilldown_details(
        payload.context.model_dump(),
        principal,
        payload.format,
    )
    _record_request_audit(
        request,
        "export.drilldown",
        module="exports",
        description="Exported drill-down details.",
        metadata={
            "source": payload.context.source,
            "metric": payload.context.metric,
            "format": payload.format,
        },
    )
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_content_disposition_filename(filename)}"',
        },
    )


@app.post("/api/analytics/save-dashboard", tags=["analytics"])
def analytics_save_dashboard(payload: AnalyticsSaveDashboardRequest) -> dict:
    return save_dashboard(payload.model_dump())


@app.get("/api/admin/settings", tags=["admin"])
def admin_settings() -> dict:
    settings = get_settings()
    return {
        "settings": settings,
        "financialYears": list_financial_years(),
    }


@app.post("/api/admin/settings", tags=["admin"])
def save_admin_settings(request: Request, payload: SettingsUpdateRequest) -> dict:
    settings = update_settings(payload.model_dump())
    record_audit_log(
        "admin.settings.update",
        module="settings",
        description="Updated admin settings.",
        actor_name=_audit_actor(request)["actor_name"] or "admin-settings",
        actor_user_id=_audit_actor(request)["actor_user_id"],
        actor_email=_audit_actor(request)["actor_email"],
        actor_role=_audit_actor(request)["actor_role"],
        detail="Updated admin settings.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
        metadata={"defaultFinancialYear": payload.defaultFinancialYear},
    )
    return {
        "status": "saved",
        "settings": settings,
    }


@app.get("/api/settings/forex/currencies", tags=["settings"])
def settings_forex_currencies() -> dict:
    return get_forex_currencies()


@app.get("/api/settings/forex/latest", tags=["settings"])
def settings_forex_latest(
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
    amount: float = Query(1, gt=0),
) -> dict:
    query = ForexLatestQuery(
        from_currency=from_currency,
        to_currency=to_currency,
        amount=amount,
    )
    return get_latest_forex_rate(
        from_currency=query.from_currency,
        to_currency=query.to_currency,
        amount=query.amount,
    )


@app.get("/api/settings/forex/historical", tags=["settings"])
def settings_forex_historical(
    date: str = Query(...),
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
    amount: float = Query(1, gt=0),
) -> dict:
    query = ForexHistoricalQuery(
        date=date,
        from_currency=from_currency,
        to_currency=to_currency,
        amount=amount,
    )
    return get_historical_forex_rate(
        rate_date=query.date,
        from_currency=query.from_currency,
        to_currency=query.to_currency,
        amount=query.amount,
    )


@app.get("/api/settings/forex/range", tags=["settings"])
def settings_forex_range(
    start_date: str = Query(...),
    end_date: str = Query(...),
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
) -> dict:
    query = ForexRangeQuery(
        start_date=start_date,
        end_date=end_date,
        from_currency=from_currency,
        to_currency=to_currency,
    )
    return get_forex_range(
        start_date=query.start_date,
        end_date=query.end_date,
        from_currency=query.from_currency,
        to_currency=query.to_currency,
    )


@app.get("/api/settings/forex/summary", tags=["settings"])
def settings_forex_summary(
    start_date: str = Query(...),
    end_date: str = Query(...),
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
) -> dict:
    query = ForexSummaryQuery(
        start_date=start_date,
        end_date=end_date,
        from_currency=from_currency,
        to_currency=to_currency,
    )
    return get_forex_summary(
        start_date=query.start_date,
        end_date=query.end_date,
        from_currency=query.from_currency,
        to_currency=query.to_currency,
    )


@app.get("/api/admin/working-days", tags=["admin"])
def admin_country_working_days() -> dict:
    return get_country_working_days()


@app.post("/api/admin/working-days", tags=["admin"])
def save_admin_country_working_days(request: Request, payload: CountryWorkingDaysSaveRequest) -> dict:
    response = save_country_working_days(
        rows=[row.model_dump() for row in payload.rows],
        updated_by=payload.updatedBy,
    )
    record_audit_log(
        "admin.working_days.update",
        module="settings",
        description=f"Saved {len(payload.rows)} country working-day rows.",
        actor_name=_audit_actor(request)["actor_name"] or payload.updatedBy,
        actor_user_id=_audit_actor(request)["actor_user_id"],
        actor_email=_audit_actor(request)["actor_email"],
        actor_role=_audit_actor(request)["actor_role"],
        detail=f"Saved {len(payload.rows)} country working-day rows.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/admin/customer-holidays", tags=["admin"])
def admin_customer_holidays(
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
) -> dict:
    return get_customer_holidays(
        bdms=bdms or [],
        practice_heads=practiceHeads or [],
        geo_heads=geoHeads or [],
    )


@app.post("/api/admin/customer-holidays", tags=["admin"])
def save_admin_customer_holidays(request: Request, payload: CustomerHolidaySaveRequest) -> dict:
    response = save_customer_holidays(
        rows=[row.model_dump() for row in payload.rows],
        updated_by=payload.updatedBy,
    )
    record_audit_log(
        "admin.customer_holidays.update",
        module="settings",
        description=f"Saved {len(payload.rows)} customer holiday rows.",
        actor_name=_audit_actor(request)["actor_name"] or payload.updatedBy,
        actor_user_id=_audit_actor(request)["actor_user_id"],
        actor_email=_audit_actor(request)["actor_email"],
        actor_role=_audit_actor(request)["actor_role"],
        detail=f"Saved {len(payload.rows)} customer holiday rows.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/admin/customer-working-days", tags=["admin"])
def admin_customer_working_days(
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
) -> dict:
    return get_customer_working_days(
        bdms=bdms or [],
        practice_heads=practiceHeads or [],
        geo_heads=geoHeads or [],
    )


@app.post("/api/admin/customer-working-days", tags=["admin"])
def save_admin_customer_working_days(request: Request, payload: CustomerWorkingDaysSaveRequest) -> dict:
    response = save_customer_working_days(
        rows=[row.model_dump() for row in payload.rows],
        updated_by=payload.updatedBy,
    )
    record_audit_log(
        "admin.customer_working_days.update",
        module="settings",
        description=f"Saved {len(payload.rows)} customer working-day rows.",
        actor_name=_audit_actor(request)["actor_name"] or payload.updatedBy,
        actor_user_id=_audit_actor(request)["actor_user_id"],
        actor_email=_audit_actor(request)["actor_email"],
        actor_role=_audit_actor(request)["actor_role"],
        detail=f"Saved {len(payload.rows)} customer working-day rows.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/admin/forecast-control", tags=["admin"])
def admin_forecast_control() -> dict:
    return get_forecast_control_settings()


@app.post("/api/admin/forecast-control", tags=["admin"])
def save_admin_forecast_control(request: Request, payload: ForecastControlSaveRequest) -> dict:
    response = save_forecast_control_settings(
        lockin_day=payload.lockinDay,
        lockout_day=payload.lockoutDay,
        lockin_date=payload.lockinDate,
        lockout_date=payload.lockoutDate,
        rollout_start_month=payload.rolloutStartMonth,
        updated_by=payload.updatedBy,
    )
    record_audit_log(
        "admin.forecast_control.update",
        module="forecast",
        description=(
            f"Set lock-in {payload.lockinDate or payload.lockinDay}, lock-out {payload.lockoutDate or payload.lockoutDay}, "
            f"rollout start {payload.rolloutStartMonth}."
        ),
        actor_name=_audit_actor(request)["actor_name"] or payload.updatedBy,
        actor_user_id=_audit_actor(request)["actor_user_id"],
        actor_email=_audit_actor(request)["actor_email"],
        actor_role=_audit_actor(request)["actor_role"],
        detail=(
            f"Set lock-in {payload.lockinDate or payload.lockinDay}, lock-out {payload.lockoutDate or payload.lockoutDay}, "
            f"rollout start {payload.rolloutStartMonth}."
        ),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/admin/revenue-name-options", tags=["admin"])
def admin_revenue_name_options() -> dict:
    return get_forecast_user_name_options()


@app.get("/api/admin/audit", tags=["admin"])
def admin_audit_logs(limit: int = Query(500, ge=1, le=2000)) -> dict:
    return list_audit_logs(limit=limit)


@app.get("/api/admin/audit/export-docx", tags=["admin"])
def admin_audit_logs_export_docx(request: Request, limit: int = Query(1000, ge=1, le=5000)) -> StreamingResponse:
    payload = export_audit_logs_docx(limit=limit)
    _record_request_audit(
        request,
        "export.audit_logs",
        module="exports",
        description="Exported audit logs.",
        metadata={"limit": limit},
    )
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.docx"'},
    )


@app.get("/api/admin/activity", tags=["admin"])
def admin_activity_overview(
    limit: int = Query(250, ge=1, le=1000),
    activeWithinMinutes: int = Query(5, ge=1, le=60),
) -> dict:
    return get_user_activity_overview(limit=limit, active_within_minutes=activeWithinMinutes)


@app.post("/api/admin/forecast/reset", tags=["admin"])
def admin_reset_recorded_forecast(request: Request, payload: ForecastResetRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    response = clear_all_recorded_forecasts(
        user_id=payload.userId,
        user_name=payload.userName,
    )
    record_audit_log(
        "admin.forecast.reset",
        module="forecast",
        description=(
            f"Cleared {response.get('deletedPrimaryRows', 0)} forecast rows and "
            f"{response.get('deletedRoleRows', 0)} role rows."
        ),
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        detail=(
            f"Cleared {response.get('deletedPrimaryRows', 0)} forecast rows and "
            f"{response.get('deletedRoleRows', 0)} role rows."
        ),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.post("/api/workspace/activity/heartbeat", tags=["workspace"])
def workspace_activity_heartbeat(payload: UserActivityHeartbeatRequest) -> dict:
    return record_user_activity_heartbeat(
        session_id=payload.sessionId,
        user_id=payload.userId,
        user_name=payload.userName,
        user_email=payload.userEmail,
        role_id=payload.roleId,
        role_name=payload.roleName,
        path=payload.path,
        metadata=payload.metadata,
    )


@app.post("/api/workspace/activity/close", tags=["workspace"])
def workspace_activity_close(payload: UserActivityCloseRequest) -> dict:
    return close_user_activity_session(
        session_id=payload.sessionId,
        user_id=payload.userId,
        user_name=payload.userName,
        user_email=payload.userEmail,
        role_id=payload.roleId,
        role_name=payload.roleName,
        path=payload.path,
        metadata=payload.metadata,
    )


@app.get("/api/workspace/dashboard", tags=["workspace"])
def workspace_dashboard(
    role: str = "Executive",
    geo: str = "ALL",
    practice: str = "ALL",
) -> dict:
    return build_workspace_dashboard(role_name=role, geo=geo, practice=practice)


@app.get("/api/workspace/slicers", tags=["workspace"])
def workspace_slicers() -> dict:
    return build_workspace_slicers()


@app.get("/api/workspace/predictions", tags=["workspace"])
def workspace_predictions() -> dict:
    return build_predictions()


@app.post("/api/trends/refresh", tags=["trends"])
def trends_refresh(payload: TrendRefreshRequest) -> dict:
    return refresh_trend_analytics(
        financial_year=payload.financialYear,
        upload_month=payload.uploadMonth,
    )


@app.get("/api/trends/filters", tags=["trends"])
def trends_filters(request: Request) -> dict:
    return get_trend_filters(_collect_request_filters(request))


@app.get("/api/trends/kpis", tags=["trends"])
def trends_kpis(request: Request) -> dict:
    return get_trend_kpis(_collect_request_filters(request))


@app.get("/api/trends/monthly-comparison", tags=["trends"])
def trends_monthly_comparison(request: Request) -> dict:
    return get_monthly_comparison(_collect_request_filters(request))


@app.get("/api/trends/budget-vs-actual", tags=["trends"])
def trends_budget_vs_actual(request: Request) -> dict:
    return get_budget_vs_actual(_collect_request_filters(request))


@app.get("/api/trends/year-over-year", tags=["trends"])
def trends_year_over_year(request: Request) -> dict:
    return get_year_over_year(_collect_request_filters(request))


@app.get("/api/trends/risk", tags=["trends"])
def trends_risk(request: Request) -> dict:
    return get_risk_data(_collect_request_filters(request))


@app.get("/api/trends/anomalies", tags=["trends"])
def trends_anomalies(request: Request) -> dict:
    return get_anomalies(_collect_request_filters(request))


@app.get("/api/trends/predictions", tags=["trends"])
def trends_predictions(request: Request) -> dict:
    return get_predictions(_collect_request_filters(request))


@app.get("/api/trends/insights", tags=["trends"])
def trends_insights(request: Request) -> dict:
    return get_insights(_collect_request_filters(request))


@app.get("/api/trends/summary", tags=["trends"])
def trends_summary(request: Request) -> dict:
    return get_trend_summary_rows(_collect_request_filters(request))


@app.get("/api/trends/export/excel", tags=["trends"])
def trends_export_excel(request: Request) -> StreamingResponse:
    principal = get_principal(request)
    filename, content = export_trend_excel(
        _collect_request_filters(request),
        generated_by=principal.user_email or principal.name if principal else "system",
    )
    _record_request_audit(
        request,
        "export.trends",
        module="exports",
        description="Exported trends workbook.",
        metadata={"filters": _collect_request_filters(request)},
    )
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_content_disposition_filename(filename)}"'},
    )


@app.get("/api/workspace/revenue-dashboard", tags=["workspace"])
def workspace_revenue_dashboard(
    request: Request,
    financialYear: str | None = None,
    financialYears: list[str] | None = Query(None),
    region: str | None = None,
    practiceHead: str | None = None,
    geoHead: str | None = None,
    customerName: str | None = None,
    dealType: str | None = None,
    businessType: str | None = None,
    geographies: list[str] | None = Query(None),
    practices: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    accounts: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    businessTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
    periodFrom: str | None = None,
    periodTo: str | None = None,
    comparisonMode: str | None = None,
    comparisonMetric: str | None = None,
    comparisonPeriod: str | None = None,
    comparePrevious: bool = False,
    breakdownDimension: str | None = None,
    whatIfPct: float | None = None,
) -> dict:
    return get_revenue_dashboard_data(
        {
            "financialYear": financialYear,
            "financialYears": financialYears,
            "region": region,
            "practiceHead": _scope_filter_value(request, practiceHead, "practiceHeads"),
            "geoHead": _scope_filter_value(request, geoHead, "geoHeads"),
            "customerName": customerName,
            "dealType": dealType,
            "businessType": businessType,
            "geographies": geographies,
            "practices": _scoped_query_values(request, practices, "practiceHeads"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "entities": _scoped_query_values(request, entities, "entities"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "accounts": accounts,
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "businessTypes": businessTypes,
            "eeennns": eeennns,
            "periodFrom": periodFrom,
            "periodTo": periodTo,
            "comparisonMode": comparisonMode,
            "comparisonMetric": comparisonMetric,
            "comparisonPeriod": comparisonPeriod,
            "comparePrevious": comparePrevious,
            "breakdownDimension": breakdownDimension,
            "whatIfPct": whatIfPct,
        }
    )


@app.get("/api/workspace/revenue-overview", tags=["workspace"])
def workspace_revenue_overview(
    request: Request,
    financialYear: str | None = None,
    financialYears: list[str] | None = Query(None),
    region: str | None = None,
    practiceHead: str | None = None,
    geoHead: str | None = None,
    customerName: str | None = None,
    dealType: str | None = None,
    businessType: str | None = None,
    geographies: list[str] | None = Query(None),
    practices: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    accounts: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    businessTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
) -> dict:
    return get_revenue_overview_data(
        {
            "financialYear": financialYear,
            "financialYears": financialYears,
            "region": region,
            "practiceHead": _scope_filter_value(request, practiceHead, "practiceHeads"),
            "geoHead": _scope_filter_value(request, geoHead, "geoHeads"),
            "customerName": customerName,
            "dealType": dealType,
            "businessType": businessType,
            "geographies": geographies,
            "practices": _scoped_query_values(request, practices, "practiceHeads"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "entities": _scoped_query_values(request, entities, "entities"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "accounts": accounts,
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "businessTypes": businessTypes,
            "eeennns": eeennns,
        }
    )


@app.get("/api/workspace/revenue-comparison", tags=["workspace"])
def workspace_revenue_comparison(
    request: Request,
    financialYear: str | None = None,
    financialYears: list[str] | None = Query(None),
    region: str | None = None,
    practiceHead: str | None = None,
    geoHead: str | None = None,
    customerName: str | None = None,
    dealType: str | None = None,
    businessType: str | None = None,
    geographies: list[str] | None = Query(None),
    practices: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    accounts: list[str] | None = Query(None),
    projectNames: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    businessTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
    periodFrom: str | None = None,
    periodTo: str | None = None,
) -> dict:
    return get_revenue_monthly_comparison_data(
        {
            "financialYear": financialYear,
            "financialYears": financialYears,
            "region": region,
            "practiceHead": _scope_filter_value(request, practiceHead, "practiceHeads"),
            "geoHead": _scope_filter_value(request, geoHead, "geoHeads"),
            "customerName": customerName,
            "dealType": dealType,
            "businessType": businessType,
            "geographies": geographies,
            "practices": _scoped_query_values(request, practices, "practiceHeads"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "entities": _scoped_query_values(request, entities, "entities"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "accounts": accounts,
            "projectNames": projectNames,
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "businessTypes": businessTypes,
            "eeennns": eeennns,
            "periodFrom": periodFrom,
            "periodTo": periodTo,
        }
    )


@app.get("/api/workspace/revenue-budget-kiosk", tags=["workspace"])
def workspace_revenue_budget_kiosk(
    request: Request,
    financialYear: str | None = None,
    financialYears: list[str] | None = Query(None),
    region: str | None = None,
    practiceHead: str | None = None,
    geoHead: str | None = None,
    customerName: str | None = None,
    dealType: str | None = None,
    businessType: str | None = None,
    geographies: list[str] | None = Query(None),
    practices: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    accounts: list[str] | None = Query(None),
    projectNames: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    businessTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
    periodFrom: str | None = None,
    periodTo: str | None = None,
) -> dict:
    return get_revenue_budget_kiosk_data(
        {
            "financialYear": financialYear,
            "financialYears": financialYears,
            "region": region,
            "practiceHead": _scope_filter_value(request, practiceHead, "practiceHeads"),
            "geoHead": _scope_filter_value(request, geoHead, "geoHeads"),
            "customerName": customerName,
            "dealType": dealType,
            "businessType": businessType,
            "geographies": geographies,
            "practices": _scoped_query_values(request, practices, "practiceHeads"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "entities": _scoped_query_values(request, entities, "entities"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "accounts": accounts,
            "projectNames": projectNames,
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "businessTypes": businessTypes,
            "eeennns": eeennns,
            "periodFrom": periodFrom,
            "periodTo": periodTo,
        }
    )


@app.get("/api/workspace/revenue-variance-comments", tags=["workspace"])
def workspace_revenue_variance_comments(
    financialYear: str = Query(..., min_length=1),
    comparisonMonth: str | None = None,
    tableIds: list[str] | None = Query(None),
) -> dict:
    return get_revenue_variance_comments(
        financial_year=financialYear,
        comparison_month=comparisonMonth,
        table_ids=tableIds or [],
    )


@app.post("/api/workspace/revenue-variance-comments", tags=["workspace"])
def workspace_revenue_variance_comments_save(payload: RevenueVarianceCommentSaveRequest) -> dict:
    return save_revenue_variance_comment_entry(
        financial_year=payload.financialYear,
        comparison_month=payload.comparisonMonth,
        table_id=payload.tableId,
        row_label=payload.rowLabel,
        variance_percent=payload.variancePercent,
        comment_text=payload.comment,
        authored_by=payload.authoredBy,
        author_role=payload.authorRole,
    )


@app.get("/api/revenue", tags=["rapid-revenue"])
def rapid_revenue_rows(
    request: Request,
    financialYear: str | None = None,
    practiceHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    horizontals: list[str] | None = Query(None),
    msps: list[str] | None = Query(None),
    customerNames: list[str] | None = Query(None),
    rowUs: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
    projectNames: list[str] | None = Query(None),
) -> list[dict]:
    return get_rapid_revenue_rows(
        {
            "financialYear": financialYear,
            "practiceHeads": _scoped_query_values(request, practiceHeads, "practiceHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "horizontals": horizontals,
            "msps": msps,
            "customerNames": customerNames,
            "rowUs": rowUs,
            "entities": _scoped_query_values(request, entities, "entities"),
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "eeennns": eeennns,
            "projectNames": projectNames,
        }
    )


@app.get("/api/revenue/overview", tags=["rapid-revenue"])
def rapid_revenue_overview(
    request: Request,
    financialYear: str | None = None,
    practiceHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
) -> dict:
    return get_rapid_revenue_overview(
        {
            "financialYear": financialYear,
            "practiceHeads": _scoped_query_values(request, practiceHeads, "practiceHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "entities": _scoped_query_values(request, entities, "entities"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
        }
    )


@app.get("/api/revenue/slicer-options", tags=["rapid-revenue"])
def rapid_revenue_slicer_options(
    request: Request,
    financialYear: str | None = None,
    practiceHeads: list[str] | None = Query(None),
    bdms: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    horizontals: list[str] | None = Query(None),
    msps: list[str] | None = Query(None),
    customerNames: list[str] | None = Query(None),
    rowUs: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    strategicAccounts: list[str] | None = Query(None),
    dealTypes: list[str] | None = Query(None),
    eeennns: list[str] | None = Query(None),
    projectNames: list[str] | None = Query(None),
) -> dict[str, list[str]]:
    return get_rapid_revenue_slicer_options(
        {
            "financialYear": financialYear,
            "practiceHeads": _scoped_query_values(request, practiceHeads, "practiceHeads"),
            "bdms": _scoped_query_values(request, bdms, "bdms"),
            "geoHeads": _scoped_query_values(request, geoHeads, "geoHeads"),
            "verticals": _scoped_query_values(request, verticals, "verticals"),
            "horizontals": horizontals,
            "msps": msps,
            "customerNames": customerNames,
            "rowUs": rowUs,
            "entities": _scoped_query_values(request, entities, "entities"),
            "strategicAccounts": strategicAccounts,
            "dealTypes": dealTypes,
            "eeennns": eeennns,
            "projectNames": projectNames,
        }
    )


@app.get("/api/revenue/customer-holidays", tags=["rapid-revenue"])
def rapid_revenue_customer_holidays(
    request: Request,
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
) -> dict:
    return get_customer_holidays(
        bdms=_scoped_query_values(request, bdms, "bdms"),
        practice_heads=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        geo_heads=_scoped_query_values(request, geoHeads, "geoHeads"),
    )


@app.get("/api/revenue/customer-working-days", tags=["rapid-revenue"])
def rapid_revenue_customer_working_days(
    request: Request,
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
) -> dict:
    return get_customer_working_days(
        bdms=_scoped_query_values(request, bdms, "bdms"),
        practice_heads=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        geo_heads=_scoped_query_values(request, geoHeads, "geoHeads"),
    )


@app.get("/api/revenue/working-days", tags=["rapid-revenue"])
def rapid_revenue_working_days() -> dict:
    return get_country_working_days()


@app.post("/api/revenue/customer-working-days", tags=["rapid-revenue"])
def save_rapid_revenue_customer_working_days(request: Request, payload: CustomerWorkingDaysSaveRequest) -> dict:
    return save_customer_working_days(
        rows=[row.model_dump() for row in payload.rows],
        updated_by=payload.updatedBy,
        allowed_bdms=_scoped_query_values(request, payload.bdms, "bdms"),
        allowed_practice_heads=_scoped_query_values(request, payload.practiceHeads, "practiceHeads"),
        allowed_geo_heads=_scoped_query_values(request, payload.geoHeads, "geoHeads"),
    )


@app.get("/api/revenue/forecast-sheet", tags=["rapid-revenue"])
def rapid_revenue_forecast_sheet(
    request: Request,
    userId: str = Query(..., min_length=1),
    userName: str = Query(..., min_length=1),
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
    entities: list[str] | None = Query(None),
    verticals: list[str] | None = Query(None),
    selectedBdms: list[str] | None = Query(None),
    selectedPracticeHeads: list[str] | None = Query(None),
    msps: list[str] | None = Query(None),
    forecastMonth: str | None = None,
    financialYear: str | None = None,
    previewDrafts: bool = False,
    submitterRoleId: str | None = None,
    includeAllMonths: bool = False,
) -> dict:
    ensure_self_or_admin(request, userId)
    return get_bdm_forecast_sheet(
        user_id=userId,
        user_name=userName,
        bdm_names=_scoped_query_values(request, bdms, "bdms"),
        practice_head_names=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        geo_head_names=_scoped_query_values(request, geoHeads, "geoHeads"),
        entity_names=_scoped_query_values(request, entities, "entities"),
        vertical_names=_scoped_query_values(request, verticals, "verticals"),
        bdm_filters=_scoped_query_values(request, selectedBdms, "bdms"),
        practice_head_filters=_scoped_query_values(request, selectedPracticeHeads, "practiceHeads"),
        msps=msps or [],
        forecast_month=forecastMonth,
        financial_year=financialYear,
        preview_drafts=previewDrafts,
        submitter_role_id=submitterRoleId,
        include_all_months=includeAllMonths,
    )


@app.post("/api/revenue/forecast-draft", tags=["rapid-revenue"])
def rapid_revenue_forecast_draft(request: Request, payload: ForecastSubmissionRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    return save_bdm_forecast_draft(
        user_id=payload.userId,
        user_name=payload.userName,
        bdm_names=_scoped_query_values(request, payload.bdms, "bdms"),
        forecast_month=payload.forecastMonth,
        rows=[row.model_dump() for row in payload.rows],
        submitter_role_id=payload.submitterRoleId,
    )


@app.post("/api/revenue/forecast-submit", tags=["rapid-revenue"])
def rapid_revenue_forecast_submit(request: Request, payload: ForecastSubmissionRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    response = save_bdm_forecast_submission(
        user_id=payload.userId,
        user_name=payload.userName,
        bdm_names=_scoped_query_values(request, payload.bdms, "bdms"),
        forecast_month=payload.forecastMonth,
        rows=[row.model_dump() for row in payload.rows],
        submitter_role_id=payload.submitterRoleId,
    )
    record_audit_log(
        "revenue.forecast.submit",
        module="forecast",
        description=f"Submitted {len(payload.rows)} row(s) for {payload.forecastMonth}.",
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        actor_role=payload.submitterRoleId or "bdm",
        detail=f"Submitted {len(payload.rows)} row(s) for {payload.forecastMonth}.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
        metadata={"forecastMonth": payload.forecastMonth},
    )
    return response


@app.post("/api/revenue/forecast-row", tags=["rapid-revenue"])
def rapid_revenue_create_forecast_row(request: Request, payload: ForecastRowCreateRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    if payload.mode == "renewal":
        if payload.recordId is None:
            raise HTTPException(status_code=400, detail="recordId is required for renewal.")
        response = create_renewal_forecast_row(
            user_id=payload.userId,
            user_name=payload.userName,
            bdm_names=_scoped_query_values(request, payload.bdms, "bdms"),
            record_id=payload.recordId,
        )
        record_audit_log(
            "revenue.forecast.row.renewal",
            module="forecast",
            description=f"Created renewal row from {payload.recordId}.",
            actor_user_id=payload.userId,
            actor_email=_audit_actor(request)["actor_email"],
            actor_name=payload.userName,
            detail=f"Created renewal row from {payload.recordId}.",
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        return response

    response = create_new_project_forecast_row(
        user_id=payload.userId,
        user_name=payload.userName,
        bdm_names=_scoped_query_values(request, payload.bdms, "bdms"),
        practice_head_names=_scoped_query_values(request, payload.practiceHeads, "practiceHeads"),
        financial_year=payload.financialYear,
        values=payload.values,
    )
    record_audit_log(
        "revenue.forecast.row.new_project",
        module="forecast",
        description="Created new project row.",
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        detail="Created new project row.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.delete("/api/revenue/forecast-row/{record_id}", tags=["rapid-revenue"])
def rapid_revenue_delete_forecast_row(
    request: Request,
    record_id: int,
    userId: str = Query(..., min_length=1),
    userName: str = Query(..., min_length=1),
    bdms: list[str] | None = Query(None),
) -> dict:
    ensure_self_or_admin(request, userId)
    response = delete_manual_forecast_row(
        user_id=userId,
        user_name=userName,
        bdm_names=_scoped_query_values(request, bdms, "bdms"),
        record_id=record_id,
    )
    record_audit_log(
        "revenue.forecast.row.delete",
        module="forecast",
        description=f"Deleted manual forecast row {record_id}.",
        actor_user_id=userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=userName,
        detail=f"Deleted manual forecast row {record_id}.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/revenue/project-assignment-requests", tags=["rapid-revenue"])
def rapid_revenue_project_assignment_requests(
    request: Request,
    geoHeads: list[str] | None = Query(None),
    status: str | None = None,
) -> dict:
    return get_project_assignment_requests(
        geo_head_names=_scoped_query_values(request, geoHeads, "geoHeads"),
        status=status,
    )


@app.post("/api/revenue/project-assignment", tags=["rapid-revenue"])
def rapid_revenue_apply_project_reassignment(request: Request, payload: ProjectReassignmentRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    response = reassign_project_scope(
        user_id=payload.userId,
        user_name=payload.userName,
        assignment_type=payload.assignmentType,
        effective_month=payload.effectiveMonth,
        record_id=payload.recordId,
        current_bdm=payload.currentBdm,
        next_bdm=payload.nextBdm,
        current_geo_head=payload.currentGeoHead,
        next_geo_head=payload.nextGeoHead,
        practice_head=payload.practiceHead,
        entity=payload.entity,
        financial_year=payload.financialYear,
    )
    record_audit_log(
        "revenue.project_assignment.apply",
        module="forecast",
        description=(
            f"Applied {payload.assignmentType} reassignment from {payload.effectiveMonth}; "
            f"{response.get('createdRecords', 0)} new row(s)."
        ),
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        actor_role=_audit_actor(request)["actor_role"],
        detail=(
            f"Applied {payload.assignmentType} reassignment from {payload.effectiveMonth}; "
            f"{response.get('createdRecords', 0)} new row(s)."
        ),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
        metadata={
            "assignmentType": payload.assignmentType,
            "effectiveMonth": payload.effectiveMonth,
            "recordId": payload.recordId,
            "currentBdm": payload.currentBdm,
            "nextBdm": payload.nextBdm,
            "currentGeoHead": payload.currentGeoHead,
            "nextGeoHead": payload.nextGeoHead,
            "practiceHead": payload.practiceHead,
            "entity": payload.entity,
            "createdRecordIds": response.get("createdRecordIds", []),
            "affectedRecordIds": response.get("affectedRecordIds", []),
        },
    )
    return response


@app.post("/api/revenue/project-assignment-requests", tags=["rapid-revenue"])
def rapid_revenue_create_project_assignment_request(request: Request, payload: ProjectAssignmentCreateRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    response = create_project_assignment_request(
        user_id=payload.userId,
        user_name=payload.userName,
        record_id=payload.recordId,
        next_bdm=payload.bdm,
    )
    record_audit_log(
        "revenue.project_assignment.request",
        module="forecast",
        description=f"Requested reassignment for record {payload.recordId} to {payload.bdm}.",
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        detail=f"Requested reassignment for record {payload.recordId} to {payload.bdm}.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.patch("/api/revenue/project-assignment-requests", tags=["rapid-revenue"])
def rapid_revenue_decide_project_assignment_request(request: Request, payload: ProjectAssignmentDecisionRequest) -> dict:
    ensure_self_or_admin(request, payload.userId)
    response = decide_project_assignment_request(
        user_id=payload.userId,
        user_name=payload.userName,
        geo_head_names=_scoped_query_values(request, payload.geoHeads, "geoHeads"),
        request_id=payload.requestId,
        decision=payload.decision,
        note=payload.note,
    )
    record_audit_log(
        "revenue.project_assignment.decision",
        module="forecast",
        description=f"{payload.decision.title()} request {payload.requestId}.",
        actor_user_id=payload.userId,
        actor_email=_audit_actor(request)["actor_email"],
        actor_name=payload.userName,
        detail=f"{payload.decision.title()} request {payload.requestId}.",
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
    return response


@app.get("/api/revenue/notifications", tags=["rapid-revenue"])
def rapid_revenue_notifications(
    request: Request,
    roleId: str = Query(..., min_length=1),
    userId: str = Query(..., min_length=1),
    bdms: list[str] | None = Query(None),
    practiceHeads: list[str] | None = Query(None),
    geoHeads: list[str] | None = Query(None),
) -> dict:
    ensure_self_or_admin(request, userId)
    return get_notifications(
        role_id=roleId,
        user_id=userId,
        bdm_names=_scoped_query_values(request, bdms, "bdms"),
        practice_head_names=_scoped_query_values(request, practiceHeads, "practiceHeads"),
        geo_head_names=_scoped_query_values(request, geoHeads, "geoHeads"),
    )


