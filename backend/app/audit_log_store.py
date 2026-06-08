from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from uuid import uuid4
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from .postgres import ensure_postgres_schema, open_database_connection

_POSTGRES_UNSAFE_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _clean_text(
    value: Any,
    *,
    fallback: str = "",
    lowercase: bool = False,
    max_length: int | None = None,
) -> str:
    text = _POSTGRES_UNSAFE_TEXT.sub("", str(value or "")).strip()
    if lowercase:
        text = text.lower()
    if max_length is not None:
        text = text[:max_length]
    return text or fallback


def _clean_json_value(value: Any) -> Any:
    if isinstance(value, str):
        return _POSTGRES_UNSAFE_TEXT.sub("", value)
    if isinstance(value, dict):
        return {
            _clean_text(key, fallback="field"): _clean_json_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [_clean_json_value(item) for item in value]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _clean_text(value)


def _safe_json_dumps(value: dict[str, Any] | None) -> str:
    return json.dumps(_clean_json_value(value or {}), default=str)


def record_audit_log(
    action: str,
    *,
    actor_user_id: str | None = None,
    actor_email: str | None = None,
    actor_name: str | None = None,
    actor_role: str | None = None,
    module: str | None = None,
    description: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    status: str = "success",
    detail: str = "",
    metadata: dict[str, Any] | None = None,
) -> None:
    clean_action = _clean_text(action, fallback="system.event")
    resolved_module = _clean_text(module or clean_action.split(".", 1)[0], fallback="system", lowercase=True)
    resolved_description = description if description is not None else detail
    ensure_postgres_schema()
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into rapid_audit_logs (
                    id,
                    user_id,
                    user_email,
                    role,
                    module,
                    description,
                    ip_address,
                    user_agent,
                    actor_user_id,
                    actor_name,
                    actor_role,
                    action,
                    status,
                    detail,
                    metadata,
                    created_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    _clean_text(actor_user_id) or None,
                    _clean_text(actor_email, lowercase=True) or None,
                    _clean_text(actor_role) or None,
                    resolved_module,
                    _clean_text(resolved_description),
                    _clean_text(ip_address) or None,
                    _clean_text(user_agent, max_length=500) or None,
                    _clean_text(actor_user_id) or None,
                    _clean_text(actor_name) or None,
                    _clean_text(actor_role) or None,
                    clean_action,
                    _clean_text(status, fallback="success", lowercase=True),
                    _clean_text(detail),
                    _safe_json_dumps(metadata),
                    _utc_now_iso(),
                ),
            )
        connection.commit()


def list_audit_logs(limit: int = 500) -> dict[str, Any]:
    ensure_postgres_schema()
    capped_limit = max(1, min(int(limit or 500), 2000))
    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    id::text as id,
                    coalesce(user_id, actor_user_id, '') as user_id,
                    coalesce(user_email, '') as user_email,
                    coalesce(role, actor_role, '') as role,
                    coalesce(module, split_part(action, '.', 1), 'system') as module,
                    coalesce(description, detail, '') as description,
                    coalesce(ip_address, '') as ip_address,
                    coalesce(user_agent, '') as user_agent,
                    coalesce(actor_user_id, '') as actor_user_id,
                    coalesce(actor_name, '') as actor_name,
                    coalesce(actor_role, '') as actor_role,
                    action,
                    status,
                    coalesce(detail, '') as detail,
                    coalesce(metadata, '{}'::jsonb) as metadata,
                    created_at
                from rapid_audit_logs
                order by created_at desc
                limit %s
                """,
                (capped_limit,),
            )
            rows = cursor.fetchall()

    serialized = []
    for row in rows:
        serialized.append(
            {
                "id": str(row.get("id") or ""),
                "userId": str(row.get("user_id") or ""),
                "userEmail": str(row.get("user_email") or ""),
                "role": str(row.get("role") or ""),
                "module": str(row.get("module") or ""),
                "description": str(row.get("description") or ""),
                "ipAddress": str(row.get("ip_address") or ""),
                "userAgent": str(row.get("user_agent") or ""),
                "actorUserId": str(row.get("actor_user_id") or ""),
                "actorName": str(row.get("actor_name") or ""),
                "actorRole": str(row.get("actor_role") or ""),
                "action": str(row.get("action") or ""),
                "status": str(row.get("status") or ""),
                "detail": str(row.get("detail") or ""),
                "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
                "createdAt": row.get("created_at").isoformat().replace("+00:00", "Z")
                if row.get("created_at")
                else None,
            }
        )

    return {"logs": serialized, "count": len(serialized)}


def export_audit_logs_docx(limit: int = 1000) -> bytes:
    payload = list_audit_logs(limit=limit)
    logs = payload.get("logs", [])
    lines = []
    for item in logs:
        when = str(item.get("createdAt") or "")
        actor_name = str(item.get("actorName") or "Unknown")
        actor_role = str(item.get("actorRole") or "-")
        action = str(item.get("action") or "-")
        status = str(item.get("status") or "-")
        detail = str(item.get("detail") or "")
        lines.append(f"{when} | {actor_name} ({actor_role}) | {action} | {status}")
        if detail:
            lines.append(detail)

    if not lines:
        lines.append("No audit logs available.")

    paragraph_xml = "".join(
        f"<w:p><w:r><w:t xml:space='preserve'>{escape(line)}</w:t></w:r></w:p>"
        for line in lines
    )
    document_xml = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<w:document xmlns:wpc='http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas' "
        "xmlns:mc='http://schemas.openxmlformats.org/markup-compatibility/2006' "
        "xmlns:o='urn:schemas-microsoft-com:office:office' "
        "xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' "
        "xmlns:m='http://schemas.openxmlformats.org/officeDocument/2006/math' "
        "xmlns:v='urn:schemas-microsoft-com:vml' "
        "xmlns:wp14='http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing' "
        "xmlns:wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing' "
        "xmlns:w10='urn:schemas-microsoft-com:office:word' "
        "xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main' "
        "xmlns:w14='http://schemas.microsoft.com/office/word/2010/wordml' "
        "xmlns:wpg='http://schemas.microsoft.com/office/word/2010/wordprocessingGroup' "
        "xmlns:wpi='http://schemas.microsoft.com/office/word/2010/wordprocessingInk' "
        "xmlns:wne='http://schemas.microsoft.com/office/word/2006/wordml' "
        "xmlns:wps='http://schemas.microsoft.com/office/word/2010/wordprocessingShape' mc:Ignorable='w14 wp14'>"
        "<w:body>"
        f"{paragraph_xml}"
        "<w:sectPr><w:pgSz w:w='12240' w:h='15840'/><w:pgMar w:top='1440' w:right='1440' "
        "w:bottom='1440' w:left='1440' w:header='708' w:footer='708' w:gutter='0'/></w:sectPr>"
        "</w:body></w:document>"
    )

    content_types_xml = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
        "<Default Extension='xml' ContentType='application/xml'/>"
        "<Override PartName='/word/document.xml' "
        "ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>"
        "</Types>"
    )
    rels_xml = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' "
        "Target='word/document.xml'/>"
        "</Relationships>"
    )

    buffer = BytesIO()
    with ZipFile(buffer, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", rels_xml)
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()
