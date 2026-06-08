from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .audit_log_store import _clean_text, _safe_json_dumps, record_audit_log
from .postgres import ensure_postgres_schema, open_database_connection

ACTIVE_WINDOW_MINUTES = 5
HEARTBEAT_SECONDS_CAP = 300


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _serialize_timestamp(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return None


def _normalize_text(value: Any, fallback: str = "") -> str:
    return _clean_text(value, fallback=fallback)


def _incremental_seconds(last_seen_at: Any, now: datetime) -> int:
    if not isinstance(last_seen_at, datetime):
        return 0
    delta = int(max((now - last_seen_at).total_seconds(), 0))
    return min(delta, HEARTBEAT_SECONDS_CAP)


def _effective_total_seconds(row: dict[str, Any], now: datetime, active_cutoff: datetime) -> int:
    total = int(row.get("total_active_seconds") or 0)
    if row.get("ended_at") is None and row.get("last_seen_at") and row["last_seen_at"] >= active_cutoff:
        total += _incremental_seconds(row.get("last_seen_at"), now)
    return total


def _format_duration(total_seconds: int) -> str:
    seconds = max(int(total_seconds or 0), 0)
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours > 0:
        return f"{hours}h {minutes}m"
    if minutes > 0:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def record_user_activity_heartbeat(
    *,
    session_id: str,
    user_id: str,
    user_name: str,
    user_email: str | None = None,
    role_id: str | None = None,
    role_name: str | None = None,
    path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_session_id = _normalize_text(session_id)
    normalized_user_id = _normalize_text(user_id)
    normalized_user_name = _normalize_text(user_name, "Unknown user")
    normalized_user_email = _normalize_text(user_email)
    normalized_role_id = _normalize_text(role_id)
    normalized_role_name = _normalize_text(role_name)
    normalized_path = _normalize_text(path, "/")
    now = _utc_now()
    now_iso = now.isoformat().replace("+00:00", "Z")
    created = False
    total_active_seconds = 0

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into rapid_user_activity_sessions (
                    session_id,
                    user_id,
                    user_name,
                    user_email,
                    role_id,
                    role_name,
                    started_at,
                    last_seen_at,
                    ended_at,
                    total_active_seconds,
                    heartbeat_count,
                    last_path,
                    metadata
                )
                values (%s, %s, %s, %s, %s, %s, %s::timestamptz, %s::timestamptz, null, 0, 1, %s, %s::jsonb)
                on conflict (session_id)
                do update set
                    user_id = excluded.user_id,
                    user_name = excluded.user_name,
                    user_email = excluded.user_email,
                    role_id = excluded.role_id,
                    role_name = excluded.role_name,
                    last_seen_at = excluded.last_seen_at,
                    ended_at = null,
                    total_active_seconds =
                        coalesce(rapid_user_activity_sessions.total_active_seconds, 0)
                        + coalesce(
                            least(
                                greatest(
                                    extract(
                                        epoch from (
                                            excluded.last_seen_at
                                            - coalesce(rapid_user_activity_sessions.last_seen_at, excluded.last_seen_at)
                                        )
                                    ),
                                    0
                                ),
                                %s
                            ),
                            0
                        )::int,
                    heartbeat_count = coalesce(rapid_user_activity_sessions.heartbeat_count, 0) + 1,
                    last_path = excluded.last_path,
                    metadata = excluded.metadata
                returning
                    (xmax = 0) as created,
                    total_active_seconds
                """,
                (
                    normalized_session_id,
                    normalized_user_id,
                    normalized_user_name,
                    normalized_user_email or None,
                    normalized_role_id or None,
                    normalized_role_name or None,
                    now_iso,
                    now_iso,
                    normalized_path,
                    _safe_json_dumps(metadata),
                    HEARTBEAT_SECONDS_CAP,
                ),
            )
            saved = cursor.fetchone() or {}
            created = bool(saved.get("created"))
            total_active_seconds = int(saved.get("total_active_seconds") or 0)
        connection.commit()

    if created:
        record_audit_log(
            "auth.session.start",
            actor_user_id=normalized_user_id,
            actor_name=normalized_user_name,
            actor_role=normalized_role_id or normalized_role_name or None,
            detail=f"{normalized_user_name} became active on {normalized_path}.",
            metadata={
                "sessionId": normalized_session_id,
                "path": normalized_path,
            },
        )

    return {
        "status": "tracked",
        "sessionId": normalized_session_id,
        "created": created,
        "trackedAt": now_iso,
        "totalActiveSeconds": total_active_seconds,
    }


def close_user_activity_session(
    *,
    session_id: str,
    user_id: str | None = None,
    user_name: str | None = None,
    user_email: str | None = None,
    role_id: str | None = None,
    role_name: str | None = None,
    path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_postgres_schema()
    normalized_session_id = _normalize_text(session_id)
    now = _utc_now()
    now_iso = now.isoformat().replace("+00:00", "Z")

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    session_id,
                    user_id,
                    user_name,
                    user_email,
                    role_id,
                    role_name,
                    started_at,
                    last_seen_at,
                    ended_at,
                    total_active_seconds,
                    heartbeat_count,
                    last_path
                from rapid_user_activity_sessions
                where session_id = %s
                limit 1
                """,
                (normalized_session_id,),
            )
            existing = cursor.fetchone()
            if not existing:
                return {
                    "status": "ignored",
                    "sessionId": normalized_session_id,
                }

            total_active_seconds = int(existing.get("total_active_seconds") or 0)
            if existing.get("ended_at") is None:
                total_active_seconds += _incremental_seconds(existing.get("last_seen_at"), now)

            resolved_user_id = _normalize_text(user_id, _normalize_text(existing.get("user_id")))
            resolved_user_name = _normalize_text(user_name, _normalize_text(existing.get("user_name"), "Unknown user"))
            resolved_user_email = _normalize_text(user_email, _normalize_text(existing.get("user_email")))
            resolved_role_id = _normalize_text(role_id, _normalize_text(existing.get("role_id")))
            resolved_role_name = _normalize_text(role_name, _normalize_text(existing.get("role_name")))
            resolved_path = _normalize_text(path, _normalize_text(existing.get("last_path"), "/"))

            cursor.execute(
                """
                update rapid_user_activity_sessions
                set
                    user_id = %s,
                    user_name = %s,
                    user_email = %s,
                    role_id = %s,
                    role_name = %s,
                    last_seen_at = %s::timestamptz,
                    ended_at = %s::timestamptz,
                    total_active_seconds = %s,
                    heartbeat_count = coalesce(heartbeat_count, 0) + 1,
                    last_path = %s,
                    metadata = %s::jsonb
                where session_id = %s
                """,
                (
                    resolved_user_id,
                    resolved_user_name,
                    resolved_user_email or None,
                    resolved_role_id or None,
                    resolved_role_name or None,
                    now_iso,
                    now_iso,
                    total_active_seconds,
                    resolved_path,
                    _safe_json_dumps(metadata),
                    normalized_session_id,
                ),
            )
        connection.commit()

    record_audit_log(
        "auth.session.end",
        actor_user_id=resolved_user_id,
        actor_name=resolved_user_name,
        actor_role=resolved_role_id or resolved_role_name or None,
        detail=f"{resolved_user_name} ended the session after {_format_duration(total_active_seconds)}.",
        metadata={
            "sessionId": normalized_session_id,
            "path": resolved_path,
            "totalActiveSeconds": total_active_seconds,
        },
    )

    return {
        "status": "closed",
        "sessionId": normalized_session_id,
        "closedAt": now_iso,
        "totalActiveSeconds": total_active_seconds,
    }


def get_user_activity_overview(
    *,
    limit: int = 250,
    active_within_minutes: int = ACTIVE_WINDOW_MINUTES,
) -> dict[str, Any]:
    ensure_postgres_schema()
    capped_limit = max(1, min(int(limit or 250), 1000))
    active_window = max(int(active_within_minutes or ACTIVE_WINDOW_MINUTES), 1)
    now = _utc_now()
    active_cutoff = now - timedelta(minutes=active_window)

    with open_database_connection(require=True) as connection:
        assert connection is not None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    session_id,
                    user_id,
                    user_name,
                    user_email,
                    role_id,
                    role_name,
                    started_at,
                    last_seen_at,
                    ended_at,
                    total_active_seconds,
                    heartbeat_count,
                    last_path,
                    coalesce(metadata, '{}'::jsonb) as metadata
                from rapid_user_activity_sessions
                order by last_seen_at desc, started_at desc
                limit %s
                """,
                (capped_limit,),
            )
            rows = cursor.fetchall()

    sessions: list[dict[str, Any]] = []
    users_by_id: dict[str, dict[str, Any]] = {}

    for row in rows:
        last_seen_at = row.get("last_seen_at")
        ended_at = row.get("ended_at")
        is_active = ended_at is None and isinstance(last_seen_at, datetime) and last_seen_at >= active_cutoff
        total_active_seconds = _effective_total_seconds(row, now, active_cutoff)
        role_id = _normalize_text(row.get("role_id"))
        role_name = _normalize_text(row.get("role_name"))
        user_id = _normalize_text(row.get("user_id"))
        user_name = _normalize_text(row.get("user_name"), "Unknown user")
        user_email = _normalize_text(row.get("user_email"))
        last_path = _normalize_text(row.get("last_path"), "/")

        session_payload = {
            "sessionId": _normalize_text(row.get("session_id")),
            "userId": user_id,
            "userName": user_name,
            "userEmail": user_email,
            "roleId": role_id,
            "roleName": role_name,
            "startedAt": _serialize_timestamp(row.get("started_at")),
            "lastSeenAt": _serialize_timestamp(last_seen_at),
            "endedAt": _serialize_timestamp(ended_at),
            "totalActiveSeconds": total_active_seconds,
            "heartbeatCount": int(row.get("heartbeat_count") or 0),
            "lastPath": last_path,
            "isActive": is_active,
            "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
        }
        sessions.append(session_payload)

        user_entry = users_by_id.get(user_id)
        if not user_entry:
            users_by_id[user_id] = {
                "userId": user_id,
                "userName": user_name,
                "userEmail": user_email,
                "roleId": role_id,
                "roleName": role_name,
                "isActive": is_active,
                "lastSeenAt": session_payload["lastSeenAt"],
                "startedAt": session_payload["startedAt"],
                "totalActiveSeconds": total_active_seconds,
                "sessionCount": 1,
                "lastPath": last_path,
            }
            continue

        user_entry["isActive"] = bool(user_entry.get("isActive")) or is_active
        user_entry["totalActiveSeconds"] = int(user_entry.get("totalActiveSeconds") or 0) + total_active_seconds
        user_entry["sessionCount"] = int(user_entry.get("sessionCount") or 0) + 1
        previous_last_seen = user_entry.get("lastSeenAt")
        if previous_last_seen is None or (
            session_payload["lastSeenAt"] is not None and session_payload["lastSeenAt"] > previous_last_seen
        ):
            user_entry["lastSeenAt"] = session_payload["lastSeenAt"]
            user_entry["lastPath"] = last_path

    users = sorted(
        users_by_id.values(),
        key=lambda item: (
            1 if item.get("isActive") else 0,
            item.get("lastSeenAt") or "",
            item.get("userName") or "",
        ),
        reverse=True,
    )

    return {
        "summary": {
            "activeCount": len([item for item in users if item.get("isActive")]),
            "trackedUsers": len(users),
            "sessionCount": len(sessions),
        },
        "activeWithinMinutes": active_window,
        "users": users,
        "sessions": sessions,
    }
