from __future__ import annotations

import re


_PROMPT_INJECTION = re.compile(
    r"(ignore (all )?(previous|system|the) (instructions|rules)|reveal .*system prompt|system prompt|developer message)",
    re.IGNORECASE,
)


def sanitize_document_chunk(text: str) -> str:
    chunk = str(text or "")
    if _PROMPT_INJECTION.search(chunk):
        return "[removed potentially unsafe document instruction]"
    return chunk
