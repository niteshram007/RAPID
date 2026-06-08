from __future__ import annotations

BAD_OUTPUT_PATTERNS = [
    "as of my last update",
    "knowledge cutoff",
    "source: unclear",
    "source: provided context",
    "source: unknown",
    "i cannot access",
    "i do not have real-time",
    "fictional scenario",
    "not based on historical fact",
    "please upload your data",
]

RAPID_ONLY_PATTERNS = [
    "i do not have access to budget data",
    "i cannot view actuals",
    "i don't have access to actuals",
    "i cannot answer budget data",
]


def find_guard_violation(answer: str, mode: str) -> str | None:
    lowered = str(answer or "").lower()
    for pattern in BAD_OUTPUT_PATTERNS:
        if pattern in lowered:
            return pattern
    if mode in {"rapid_analytics", "rapid_sql"}:
        for pattern in RAPID_ONLY_PATTERNS:
            if pattern in lowered:
                return pattern
    return None


def sanitize_response(answer: str) -> str:
    cleaned_lines: list[str] = []
    for line in str(answer or "").splitlines():
        lowered = line.strip().lower()
        if lowered.startswith("source: unclear") or lowered.startswith("source: unknown"):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def apply_guard(answer: str, mode: str, fallback: str) -> str:
    violation = find_guard_violation(answer, mode)
    if violation:
        return fallback.strip()
    sanitized = sanitize_response(answer)
    return sanitized or fallback.strip()
