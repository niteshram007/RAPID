from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.security import RapidPrincipal


@dataclass(frozen=True)
class ScopedFilters:
    filters: dict[str, list[str]]


def _normalize_list(value: Any) -> list[str]:
    if isinstance(value, (list, tuple, set)):
        raw = value
    elif value in (None, ""):
        raw = []
    else:
        raw = [value]
    output: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            output.append(text)
    return output


def _scope_key(key: str) -> str:
    aliases = {
        "bdm": "bdms",
        "bdms": "bdms",
        "geo": "geoHeads",
        "geoHead": "geoHeads",
        "geoHeads": "geoHeads",
        "practice": "practiceHeads",
        "practiceHead": "practiceHeads",
        "practiceHeads": "practiceHeads",
        "entity": "entities",
        "entities": "entities",
        "vertical": "verticals",
        "verticals": "verticals",
    }
    return aliases.get(key, key)


def apply_scope_filters(principal: RapidPrincipal, filters: dict[str, Any] | None = None) -> ScopedFilters:
    incoming = filters or {}
    scoped_filters: dict[str, list[str]] = {}

    for key, value in incoming.items():
        normalized_key = _scope_key(str(key))
        scoped_filters[normalized_key] = _normalize_list(value)

    if principal.role in {"executive", "superuser"}:
        return ScopedFilters(filters=scoped_filters)

    for key, allowed_values in principal.scope.items():
        normalized_key = _scope_key(str(key))
        allowed = _normalize_list(allowed_values)
        if not allowed:
            continue
        requested = scoped_filters.get(normalized_key, [])
        if requested:
            requested_lookup = {value.lower() for value in requested}
            narrowed = [value for value in allowed if value.lower() in requested_lookup]
            scoped_filters[normalized_key] = narrowed or allowed
        else:
            scoped_filters[normalized_key] = allowed

    return ScopedFilters(filters=scoped_filters)
