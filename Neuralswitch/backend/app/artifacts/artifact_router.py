from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.artifacts.artifact_schemas import ArtifactOut, ArtifactRequest
from app.artifacts.chart_generator import build_chart_payload, generate_chart_png, generate_chart_svg
from app.artifacts.csv_generator import generate_csv
from app.artifacts.dashboard_generator import generate_dashboard
from app.artifacts.excel_generator import generate_excel
from app.artifacts.file_storage import ARTIFACT_EXTENSIONS, register_artifact, sanitize_filename, stored_artifact_path
from app.artifacts.pdf_generator import generate_pdf
from app.artifacts.table_utils import filename_slug
from app.artifacts.word_generator import generate_word
from app.schemas.chat import ChartData, TableData

ARTIFACT_KEYWORDS = {
    "png": ("png",),
    "excel": ("excel", "xlsx", "spreadsheet", "workbook"),
    "csv": ("csv",),
    "pdf": ("pdf", "report"),
    "word": ("word", "docx", "document"),
    "dashboard": ("dashboard", "kpi board", "summary board"),
    "chart": ("download chart", "export chart", "chart file", "svg", "visual export"),
}


def requested_artifact_type(text: str) -> str | None:
    normalized = " ".join(str(text or "").lower().split())
    if not any(token in normalized for token in ("download", "export", "create", "generate", "make", "convert", "excel", "csv", "pdf", "word", "dashboard", "report")):
        return None
    for artifact_type, keywords in ARTIFACT_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return artifact_type
    if "download" in normalized or "export" in normalized:
        return "excel"
    return None


def artifact_title(question: str, fallback: str = "NeuralSwitch Export") -> str:
    cleaned = " ".join(str(question or "").strip().split())
    for prefix in ("download this as", "export this as", "create", "generate", "make", "convert this to"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].strip(" :-")
            break
    return cleaned[:110] or fallback


def _ensure_table(table: TableData | None) -> TableData:
    if table is None or not table.columns:
        raise ValueError("No validated table data is available for artifact generation.")
    return table


def _default_filename(artifact_type: str, title: str) -> str:
    extension = ARTIFACT_EXTENSIONS.get(artifact_type, ".dat")
    return sanitize_filename(f"{filename_slug(title, artifact_type)}{extension}", fallback=f"{artifact_type}_export", extension=extension)


def create_artifact(
    db: Session,
    *,
    artifact_type: str,
    table: TableData | None,
    chart: ChartData | None = None,
    title: str | None = None,
    answer: str | None = None,
    filename: str | None = None,
    chat_id: str | None = None,
    message_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ArtifactOut:
    normalized_type = str(artifact_type or "excel").lower().strip()
    if normalized_type == "xlsx":
        normalized_type = "excel"
    if normalized_type == "docx":
        normalized_type = "word"
    if normalized_type in {"chart_png", "image"}:
        normalized_type = "png"
    if normalized_type not in ARTIFACT_EXTENSIONS:
        raise ValueError(f"Unsupported artifact type: {artifact_type}")

    safe_table = _ensure_table(table)
    resolved_title = str(title or "NeuralSwitch Export").strip() or "NeuralSwitch Export"
    extension = ARTIFACT_EXTENSIONS[normalized_type]
    safe_filename = sanitize_filename(filename or _default_filename(normalized_type, resolved_title), fallback=f"{normalized_type}_export", extension=extension)
    artifact_id = str(uuid4())
    output_path = stored_artifact_path(normalized_type, artifact_id, safe_filename)

    chart_payload: dict[str, Any] | None = None
    if normalized_type == "excel":
        generate_excel(output_path, title=resolved_title, table=safe_table, chart=chart, answer=answer)
    elif normalized_type == "csv":
        generate_csv(output_path, table=safe_table)
    elif normalized_type == "pdf":
        generate_pdf(output_path, title=resolved_title, table=safe_table, chart=chart, answer=answer)
    elif normalized_type == "word":
        generate_word(output_path, title=resolved_title, table=safe_table, chart=chart, answer=answer)
    elif normalized_type == "chart":
        chart_payload = generate_chart_svg(output_path, title=resolved_title, table=safe_table, chart=chart)
    elif normalized_type == "png":
        chart_payload = generate_chart_png(output_path, title=resolved_title, table=safe_table, chart=chart)
    elif normalized_type == "dashboard":
        chart_payload = generate_dashboard(output_path, title=resolved_title, table=safe_table, chart=chart, answer=answer)
    elif normalized_type == "json":
        chart_payload = build_chart_payload(safe_table, chart, title=resolved_title)
        output_path.write_text(json.dumps(chart_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    preview_rows = safe_table.rows[:25]
    artifact_meta: dict[str, Any] = {
        **(metadata or {}),
        "title": resolved_title,
        "row_count": len(safe_table.rows),
        "column_count": len(safe_table.columns),
        "table": {"columns": safe_table.columns, "rows": preview_rows},
        "chart": chart.model_dump() if chart else None,
        "chart_payload": chart_payload,
    }
    return register_artifact(
        db,
        artifact_id=artifact_id,
        artifact_type=normalized_type,
        filename=safe_filename,
        file_path=output_path,
        chat_id=chat_id,
        message_id=message_id,
        metadata=artifact_meta,
    )


def create_artifact_from_request(db: Session, request: ArtifactRequest, artifact_type: str) -> ArtifactOut:
    return create_artifact(
        db,
        artifact_type=artifact_type,
        table=request.table,
        chart=request.chart,
        title=request.title or artifact_title(request.filename or artifact_type),
        answer=request.answer,
        filename=request.filename,
        chat_id=request.chat_id,
        message_id=request.message_id,
        metadata=request.metadata,
    )
