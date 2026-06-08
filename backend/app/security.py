from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response

from .audit_log_store import record_audit_log

DEFAULT_SHARED_SECRET = "rapid-local-dev-shared-secret-change-me"
AUTH_PAYLOAD_HEADER = "x-rapid-auth-payload"
AUTH_SIGNATURE_HEADER = "x-rapid-auth-signature"
SERVICE_PAYLOAD_HEADER = "x-rapid-service-payload"
SERVICE_SIGNATURE_HEADER = "x-rapid-service-signature"
AUTH_MAX_AGE_SECONDS = 5 * 60
SERVICE_MAX_AGE_SECONDS = 5 * 60
MAX_RATE_BUCKETS = 5000


@dataclass(frozen=True)
class RapidPrincipal:
    user_id: str = ""
    user_email: str = ""
    name: str = ""
    role: str = ""
    role_name: str = ""
    permissions: frozenset[str] = field(default_factory=frozenset)
    scope: dict[str, tuple[str, ...]] = field(default_factory=dict)

    def has_any_permission(self, permissions: Iterable[str]) -> bool:
        requested = {permission for permission in permissions if permission}
        if not requested:
            return True
        return bool(self.permissions.intersection(requested))

    @property
    def is_admin(self) -> bool:
        return self.role == "superuser" or self.has_any_permission({"manage_users", "manage_roles"})


@dataclass(frozen=True)
class RouteSecurity:
    module: str
    permissions: tuple[str, ...] = ()
    roles: tuple[str, ...] = ()


_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def get_shared_secret() -> str:
    return (
        os.getenv("RAPID_BACKEND_SHARED_SECRET", "").strip()
        or os.getenv("RAPID_SESSION_SECRET", "").strip()
        or DEFAULT_SHARED_SECRET
    )


def encode_base64url(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def sign_payload(payload: str) -> str:
    return hmac.new(
        get_shared_secret().encode("utf8"),
        payload.encode("utf8"),
        hashlib.sha256,
    ).hexdigest()


def verify_payload_signature(payload: str, signature: str) -> bool:
    if not payload or not signature:
        return False
    return hmac.compare_digest(sign_payload(payload), signature)


def _coerce_string_list(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    output: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        output.append(text)
    return tuple(output)


def _parse_signed_payload(payload: str, signature: str, max_age_seconds: int) -> dict[str, Any]:
    if not verify_payload_signature(payload, signature):
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        parsed = json.loads(decode_base64url(payload).decode("utf8"))
    except Exception as error:
        raise HTTPException(status_code=401, detail="Authentication required.") from error

    issued_at = float(parsed.get("issuedAt") or 0)
    now_ms = time.time() * 1000
    if issued_at <= 0 or abs(now_ms - issued_at) > max_age_seconds * 1000:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return parsed


def verify_service_signature(request: Request) -> dict[str, Any] | None:
    payload = request.headers.get(SERVICE_PAYLOAD_HEADER, "")
    signature = request.headers.get(SERVICE_SIGNATURE_HEADER, "")
    if not payload or not signature:
        return None
    return _parse_signed_payload(payload, signature, SERVICE_MAX_AGE_SECONDS)


def authenticate_request(request: Request) -> RapidPrincipal:
    payload = request.headers.get(AUTH_PAYLOAD_HEADER, "")
    signature = request.headers.get(AUTH_SIGNATURE_HEADER, "")
    parsed = _parse_signed_payload(payload, signature, AUTH_MAX_AGE_SECONDS)
    scope = parsed.get("scope") if isinstance(parsed.get("scope"), dict) else {}
    normalized_scope = {
        str(key): _coerce_string_list(value)
        for key, value in scope.items()
        if isinstance(key, str)
    }
    return RapidPrincipal(
        user_id=str(parsed.get("userId") or "").strip(),
        user_email=str(parsed.get("email") or "").strip().lower(),
        name=str(parsed.get("name") or "").strip(),
        role=str(parsed.get("roleId") or "").strip(),
        role_name=str(parsed.get("roleName") or "").strip(),
        permissions=frozenset(_coerce_string_list(parsed.get("permissions"))),
        scope=normalized_scope,
    )


def get_principal(request: Request) -> RapidPrincipal | None:
    principal = getattr(request.state, "rapid_principal", None)
    return principal if isinstance(principal, RapidPrincipal) else None


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else ""


def get_user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "")[:500]


def _route_security_for(path: str, method: str) -> RouteSecurity | None:
    if path in {"/api/health"} or path.startswith(("/docs", "/redoc", "/openapi.json")):
        return None
    if not path.startswith("/api/"):
        return None

    method = method.upper()
    if path == "/api/audit/events":
        return RouteSecurity("audit")
    if path.startswith("/api/admin/audit"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/activity"):
        return RouteSecurity("users", ("manage_users",), ("executive",))
    if path.startswith("/api/admin/users"):
        return RouteSecurity("users", ("manage_users",))
    if path.startswith("/api/admin/uploads"):
        if method == "GET":
            return RouteSecurity("budget upload", ("view_dashboard", "upload_data", "manage_users"))
        return RouteSecurity("budget upload", ("upload_data",))
    if path.startswith("/api/budget/upload-preview"):
        return RouteSecurity("budget upload", ("upload_data",))
    if path.startswith("/api/budget/confirm-save"):
        return RouteSecurity("budget upload", ("upload_data",))
    if path.startswith("/api/budget/manual-map"):
        return RouteSecurity("budget upload", ("upload_data",))
    if path.startswith("/api/admin/masterdata/export"):
        return RouteSecurity("exports", ("export_reports",))
    if path.startswith("/api/admin/masterdata/upload-preview"):
        return RouteSecurity("budget upload", ("upload_data",))
    if path.startswith("/api/admin/masterdata"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/settings"):
        if method == "GET":
            return RouteSecurity("settings", ("view_dashboard", "manage_users"))
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/working-days"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/customer-holidays"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/customer-working-days"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/admin/forecast-control"):
        return RouteSecurity("forecast", ("manage_users",))
    if path.startswith("/api/admin/forecast/reset"):
        return RouteSecurity("forecast", ("manage_users",))
    if path.startswith("/api/admin/revenue-name-options"):
        return RouteSecurity("forecast", ("view_dashboard", "manage_users"))
    if path.startswith("/api/admin/"):
        return RouteSecurity("settings", ("manage_users",))
    if path.startswith("/api/settings/forex"):
        return RouteSecurity("settings", ("manage_users", "configure_alerts", "view_dashboard"))
    if path.startswith("/api/trends/export"):
        return RouteSecurity("exports", ("export_reports",))
    if path.startswith("/api/trends"):
        return RouteSecurity("trends", ("view_dashboard", "upload_data"))
    if path.startswith("/api/drilldown/export"):
        return RouteSecurity("exports", ("export_reports",))
    if path.startswith("/api/drilldown/details"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith("/api/analytics"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith(("/api/neural-switch", "/api/neuralswitch")):
        return RouteSecurity("neural switch")
    if path.startswith("/api/workspace/activity"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith("/api/workspace/revenue"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith("/api/workspace"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith("/api/revenue/masterdata"):
        return RouteSecurity("dashboard", ("view_dashboard",))
    if path.startswith("/api/revenue/customer-working-days") and method == "POST":
        return RouteSecurity("settings", ("manage_users",), ("bdm", "practice-head"))
    if path.startswith("/api/revenue/forecast-draft") or path.startswith("/api/revenue/forecast-submit"):
        return RouteSecurity("forecast", ("submit_forecast",), ("bdm", "practice-head"))
    if path.startswith("/api/revenue/forecast-row"):
        return RouteSecurity("forecast", ("submit_forecast",), ("bdm", "practice-head"))
    if path.startswith("/api/revenue/project-assignment-requests"):
        if method == "GET":
            return RouteSecurity("forecast", ("manage_users",), ("geo-head",))
        if method == "PATCH":
            return RouteSecurity("forecast", (), ("geo-head",))
        return RouteSecurity("forecast", ("manage_users",))
    if path.startswith("/api/revenue/project-assignment"):
        return RouteSecurity("forecast", ("manage_users",))
    if path.startswith("/api/revenue"):
        return RouteSecurity("dashboard", ("view_dashboard",))

    return RouteSecurity("dashboard", ("view_dashboard",))


def _is_allowed(principal: RapidPrincipal, route_security: RouteSecurity) -> bool:
    if principal.is_admin:
        return True
    if route_security.permissions and principal.has_any_permission(route_security.permissions):
        return True
    if route_security.roles and principal.role in route_security.roles:
        return True
    return not route_security.permissions and not route_security.roles


def _rate_limit_category(path: str, method: str) -> tuple[str, int, int] | None:
    if path == "/api/audit/events":
        return ("audit", 120, 60)
    if path.startswith("/api/admin/uploads"):
        if method.upper() == "GET":
            return (
                "admin_uploads_read",
                int(os.getenv("RAPID_ADMIN_UPLOADS_READ_RATE_LIMIT", "300")),
                60,
            )
        return ("upload", int(os.getenv("RAPID_UPLOAD_RATE_LIMIT", "60")), 15 * 60)
    if path.startswith("/api/admin/masterdata/upload-preview"):
        return ("upload_preview", int(os.getenv("RAPID_UPLOAD_PREVIEW_RATE_LIMIT", "60")), 15 * 60)
    if path.startswith("/api/budget/upload-preview"):
        return ("upload_preview", int(os.getenv("RAPID_UPLOAD_PREVIEW_RATE_LIMIT", "60")), 15 * 60)
    if "export" in path:
        return ("export", int(os.getenv("RAPID_EXPORT_RATE_LIMIT", "20")), 10 * 60)
    if method.upper() in {"POST", "PATCH", "DELETE"}:
        return ("write", int(os.getenv("RAPID_WRITE_RATE_LIMIT", "120")), 60)
    return None


def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    bucket = _RATE_BUCKETS[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    if len(_RATE_BUCKETS) > MAX_RATE_BUCKETS:
        for bucket_key in list(_RATE_BUCKETS.keys())[: max(1, MAX_RATE_BUCKETS // 10)]:
            current_bucket = _RATE_BUCKETS[bucket_key]
            while current_bucket and current_bucket[0] <= cutoff:
                current_bucket.popleft()
            if not current_bucket:
                _RATE_BUCKETS.pop(bucket_key, None)
    return True


def _record_security_event(
    request: Request,
    *,
    action: str,
    module: str,
    description: str,
    status: str,
    principal: RapidPrincipal | None = None,
) -> None:
    try:
        record_audit_log(
            action,
            module=module,
            description=description,
            actor_user_id=principal.user_id if principal else None,
            actor_email=principal.user_email if principal else None,
            actor_name=principal.name if principal else None,
            actor_role=principal.role if principal else None,
            status=status,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
            metadata={"path": request.url.path, "method": request.method},
        )
    except Exception:
        return


def apply_security_headers(response: Response) -> Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return response


async def enforce_backend_security(request: Request, call_next: Callable[[Request], Any]) -> Response:
    path = request.url.path
    method = request.method.upper()
    route_security = _route_security_for(path, method)

    if method == "OPTIONS" or route_security is None:
        response = await call_next(request)
        return apply_security_headers(response)

    principal: RapidPrincipal | None = None
    try:
        if path == "/api/audit/events" and verify_service_signature(request) is not None:
            response = await call_next(request)
            return apply_security_headers(response)

        principal = authenticate_request(request)
        request.state.rapid_principal = principal

        if path.startswith(("/api/neural-switch", "/api/neuralswitch")) and principal.role != "executive":
            _record_security_event(
                request,
                action="security.unauthorized_access",
                module="neural switch",
                description="Non-executive user attempted to access Neural Switch.",
                status="failure",
                principal=principal,
            )
            return apply_security_headers(
                JSONResponse(
                    {"detail": "Neural Switch is available only to executive accounts."},
                    status_code=403,
                )
            )

        category = _rate_limit_category(path, method)
        if category:
            category_name, limit, window_seconds = category
            rate_key = f"{category_name}:{principal.user_id or get_client_ip(request)}"
            if not check_rate_limit(rate_key, limit, window_seconds):
                _record_security_event(
                    request,
                    action="security.rate_limited",
                    module=route_security.module,
                    description="Request was rate limited.",
                    status="failure",
                    principal=principal,
                )
                return apply_security_headers(
                    JSONResponse(
                        {"detail": "Too many requests. Please wait and try again."},
                        status_code=429,
                    )
                )

        if not _is_allowed(principal, route_security):
            _record_security_event(
                request,
                action="security.unauthorized_access",
                module=route_security.module,
                description="User attempted to access a protected API without permission.",
                status="failure",
                principal=principal,
            )
            return apply_security_headers(
                JSONResponse(
                    {"detail": "You do not have access to this resource."},
                    status_code=403,
                )
            )

        response = await call_next(request)
        return apply_security_headers(response)
    except HTTPException as error:
        status_code = error.status_code if error.status_code in {401, 403, 429} else 401
        _record_security_event(
            request,
            action="security.unauthorized_access",
            module=route_security.module,
            description="Unauthenticated or invalid backend API request.",
            status="failure",
            principal=principal,
        )
        message = (
            "Too many requests. Please wait and try again."
            if status_code == 429
            else "Authentication required."
            if status_code == 401
            else "You do not have access to this resource."
        )
        return apply_security_headers(JSONResponse({"detail": message}, status_code=status_code))


def _intersect_allowed_values(requested: Iterable[str] | None, allowed: Iterable[str] | None) -> list[str]:
    requested_values = [str(value).strip() for value in (requested or []) if str(value).strip()]
    allowed_values = [str(value).strip() for value in (allowed or []) if str(value).strip()]
    if not allowed_values:
        return requested_values
    if not requested_values:
        return allowed_values
    allowed_map = {value.lower(): value for value in allowed_values}
    output: list[str] = []
    seen: set[str] = set()
    for value in requested_values:
        canonical = allowed_map.get(value.lower())
        if canonical and canonical.lower() not in seen:
            seen.add(canonical.lower())
            output.append(canonical)
    return output


def scoped_values(request: Request, requested: Iterable[str] | None, scope_key: str) -> list[str]:
    principal = get_principal(request)
    if principal is None or principal.is_admin:
        return [str(value).strip() for value in (requested or []) if str(value).strip()]
    return _intersect_allowed_values(requested, principal.scope.get(scope_key, ()))


def ensure_self_or_admin(request: Request, user_id: str) -> None:
    principal = get_principal(request)
    if principal is None or principal.is_admin:
        return
    if str(user_id or "").strip() != principal.user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this resource.")


def sanitize_export_cell(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if text and text[0] in {"=", "+", "@", "\t", "\r"}:
        return f"'{value}"
    if text.startswith("-") and len(text) > 1 and not text[1].isdigit():
        return f"'{value}"
    return value


def safe_content_disposition_filename(filename: str) -> str:
    safe = "".join(character for character in filename if character.isalnum() or character in "._-")
    return safe[:180] or "export.xlsx"

