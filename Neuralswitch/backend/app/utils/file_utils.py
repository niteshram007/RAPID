"""File handling helpers: filename sanitization, type detection, size limits."""
from __future__ import annotations

import os
import re
import unicodedata

SUPPORTED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
    ".csv": "csv",
    ".xlsx": "xlsx",
    ".md": "markdown",
    ".markdown": "markdown",
}


def sanitize_filename(filename: str) -> str:
    """Strip directory components and unsafe characters from a filename."""
    filename = os.path.basename(filename or "")
    filename = unicodedata.normalize("NFKD", filename)
    filename = filename.encode("ascii", "ignore").decode("ascii")
    filename = re.sub(r"[^A-Za-z0-9._\- ]", "_", filename).strip()
    filename = re.sub(r"_{2,}", "_", filename)
    return filename or "upload"


def detect_file_type(filename: str) -> str | None:
    ext = os.path.splitext(filename)[1].lower()
    return SUPPORTED_EXTENSIONS.get(ext)


def is_supported(filename: str) -> bool:
    return detect_file_type(filename) is not None


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"
