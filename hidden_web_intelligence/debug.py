from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger

from .config import get_config

_IS_CONFIGURED = False


def _configure_logger() -> None:
    global _IS_CONFIGURED
    if _IS_CONFIGURED:
        return

    config = get_config()
    logger.remove()
    logger.add(
        str(config.log_file),
        level="DEBUG" if config.debug_mode else "INFO",
        rotation="3 MB",
        retention=5,
        enqueue=False,
        backtrace=config.debug_mode,
        diagnose=config.debug_mode,
    )

    if config.debug_mode:
        logger.add(
            sys.stderr,
            level="DEBUG",
            colorize=True,
            backtrace=True,
            diagnose=False,
        )

    _IS_CONFIGURED = True


def get_logger():
    _configure_logger()
    return logger.bind(component="hidden_web_intelligence")


def debug_enabled() -> bool:
    return get_config().debug_mode


def persist_debug_artifact(name: str, content: str | bytes, binary: bool = False) -> Path | None:
    if not debug_enabled():
        return None

    config = get_config()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    suffix = ".bin" if binary else ".txt"
    path = config.debug_dir / f"{timestamp}-{name}{suffix}"

    if binary:
        payload = content if isinstance(content, bytes) else content.encode("utf-8", errors="ignore")
        path.write_bytes(payload)
    else:
        payload = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else content
        path.write_text(payload, encoding="utf-8")

    return path


def persist_debug_json(name: str, payload: dict[str, Any]) -> Path | None:
    return persist_debug_artifact(name, json.dumps(payload, ensure_ascii=True, indent=2), binary=False)

