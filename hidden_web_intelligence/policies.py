from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

from .exceptions import PolicyViolationError

_BLOCKED_HOST_SUFFIXES = {
    ".local",
    ".internal",
    ".lan",
}

_BLOCKED_HOST_EXACT = {
    "localhost",
    "0.0.0.0",
    "127.0.0.1",
    "::1",
}

_BLOCKED_PATH_TOKENS = {
    "login",
    "signin",
    "sign-in",
    "auth",
    "captcha",
    "2fa",
    "mfa",
    "checkout",
    "account/recovery",
}


def _is_private_host(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local


def is_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False

    host = (parsed.hostname or "").lower().strip()
    if not host:
        return False

    if host in _BLOCKED_HOST_EXACT:
        return False

    if any(host.endswith(suffix) for suffix in _BLOCKED_HOST_SUFFIXES):
        return False

    if _is_private_host(host):
        return False

    path = (parsed.path or "").lower()
    if any(token in path for token in _BLOCKED_PATH_TOKENS):
        return False

    return True


def enforce_public_url(url: str) -> None:
    if not is_public_http_url(url):
        raise PolicyViolationError("Only public http/https pages are allowed.")


def enforce_safe_query(query: str) -> None:
    normalized = query.strip()
    if not normalized:
        raise PolicyViolationError("Query cannot be empty.")
    if len(normalized) > 500:
        raise PolicyViolationError("Query is too long.")


def enforce_safe_automation_scope() -> None:
    # Guardrail declaration for caller modules.
    # No login automation, no CAPTCHA bypass, no account takeover,
    # no bypassing access restrictions, and no private content scraping.
    return None
