"""Text cleaning and chunking utilities."""
from __future__ import annotations

import re

from app.utils.token_utils import count_tokens


def clean_text(text: str) -> str:
    """Normalize whitespace while preserving paragraph breaks."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # collapse 3+ newlines to 2 (paragraph)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # strip trailing spaces on each line
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip()


def split_into_chunks(
    text: str,
    chunk_size_tokens: int = 1000,
    overlap_tokens: int = 150,
) -> list[str]:
    """Split text into overlapping chunks of ~chunk_size_tokens.

    Splits on paragraph boundaries first to preserve section structure, then
    packs paragraphs into chunks. Large paragraphs are split by sentence.
    """
    text = clean_text(text)
    if not text:
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    def flush():
        nonlocal current, current_tokens
        if current:
            chunks.append("\n\n".join(current).strip())
            current = []
            current_tokens = 0

    for para in paragraphs:
        ptokens = count_tokens(para)
        if ptokens > chunk_size_tokens:
            # split big paragraph by sentences
            flush()
            sentences = re.split(r"(?<=[.!?])\s+", para)
            buf: list[str] = []
            buf_tokens = 0
            for s in sentences:
                st = count_tokens(s)
                if buf_tokens + st > chunk_size_tokens and buf:
                    chunks.append(" ".join(buf).strip())
                    # overlap: keep tail sentences
                    buf, buf_tokens = _carry_overlap(buf, overlap_tokens)
                buf.append(s)
                buf_tokens += st
            if buf:
                chunks.append(" ".join(buf).strip())
            continue

        if current_tokens + ptokens > chunk_size_tokens and current:
            flush()
        current.append(para)
        current_tokens += ptokens

    flush()
    return [c for c in chunks if c]


def _carry_overlap(buf: list[str], overlap_tokens: int) -> tuple[list[str], int]:
    """Keep the trailing sentences of buf to use as overlap for the next chunk."""
    carried: list[str] = []
    tokens = 0
    for s in reversed(buf):
        st = count_tokens(s)
        if tokens + st > overlap_tokens:
            break
        carried.insert(0, s)
        tokens += st
    return carried, tokens
