"""Token counting / trimming helpers.

Uses tiktoken when available, otherwise falls back to a ~4-chars-per-token estimate.
"""
from __future__ import annotations

try:
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover - tiktoken optional
    _ENC = None


def count_tokens(text: str) -> int:
    if not text:
        return 0
    if _ENC is not None:
        try:
            return len(_ENC.encode(text))
        except Exception:
            pass
    return max(1, len(text) // 4)


def trim_to_tokens(text: str, max_tokens: int) -> str:
    """Trim text so it fits within max_tokens (best effort)."""
    if max_tokens <= 0:
        return ""
    if _ENC is not None:
        try:
            ids = _ENC.encode(text)
            if len(ids) <= max_tokens:
                return text
            return _ENC.decode(ids[:max_tokens])
        except Exception:
            pass
    # char-based fallback
    approx_chars = max_tokens * 4
    return text[:approx_chars]
