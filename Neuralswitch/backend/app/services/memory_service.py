"""Conversation memory: recent history retrieval + lightweight summarization.

Rules:
- Include the last N messages by default.
- If older history exceeds the budget, summarize it into a short note.
- Never send full history when not required.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat import Message
from app.utils.token_utils import count_tokens

DEFAULT_RECENT = 10


def get_recent_messages(db: Session, chat_id: str, limit: int = DEFAULT_RECENT) -> list[Message]:
    stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = list(db.scalars(stmt))
    rows.reverse()
    return rows


def to_openai_messages(messages: list[Message]) -> list[dict[str, str]]:
    return [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant")]


def format_history_text(messages: list[Message], max_tokens: int = 1500) -> str:
    """Render recent history as plain text for RAG/SQL prompts, trimmed to budget."""
    lines: list[str] = []
    total = 0
    for m in messages:
        if m.role not in ("user", "assistant"):
            continue
        prefix = "User" if m.role == "user" else "Assistant"
        line = f"{prefix}: {m.content}"
        t = count_tokens(line)
        if total + t > max_tokens:
            break
        total += t
        lines.append(line)
    return "\n".join(lines)
