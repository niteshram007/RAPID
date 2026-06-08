"""Database engine, session management and base model.

Uses SQLAlchemy 2.0 (sync). The DATABASE_URL may point at PostgreSQL (default)
or SQLite (handy for quick local runs without Postgres).
"""
from __future__ import annotations

import os
import time
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import settings


def _make_engine():
    url = settings.database_url
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, pool_pre_ping=True, future=True, connect_args=connect_args)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


@contextmanager
def _sqlite_init_lock(url: str):
    """Serialize SQLite table creation across multi-worker production starts."""
    if not url.startswith("sqlite"):
        yield
        return

    parsed = urlparse(url)
    db_path = Path(parsed.path)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    lock_path = db_path.with_suffix(f"{db_path.suffix}.init.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    fd: int | None = None
    deadline = time.monotonic() + 30
    while fd is None:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_RDWR)
        except FileExistsError:
            if time.monotonic() > deadline:
                try:
                    lock_path.unlink()
                except FileNotFoundError:
                    pass
                deadline = time.monotonic() + 30
            else:
                time.sleep(0.1)

    try:
        yield
    finally:
        if fd is not None:
            os.close(fd)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imports models so they register with the metadata."""
    from app import models  # noqa: F401  (ensures models are imported)

    with _sqlite_init_lock(settings.database_url):
        Base.metadata.create_all(bind=engine)
        _run_compat_migrations()


def _run_compat_migrations() -> None:
    """Best-effort lightweight migrations for local/dev upgrades."""
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        with engine.begin() as conn:
            # Older builds used 'documents'. Keep data by renaming to attachments.
            if "documents" in tables and "attachments" not in tables:
                conn.execute(text("ALTER TABLE documents RENAME TO attachments"))
                tables.remove("documents")
                tables.add("attachments")

            if "attachments" in tables:
                cols = {c["name"] for c in insp.get_columns("attachments")}
                if "chat_id" not in cols:
                    conn.execute(text("ALTER TABLE attachments ADD COLUMN chat_id VARCHAR(36)"))

            if "messages" in tables:
                cols = {c["name"] for c in insp.get_columns("messages")}
                if "model" not in cols:
                    conn.execute(text("ALTER TABLE messages ADD COLUMN model VARCHAR(128)"))
    except Exception as exc:  # pragma: no cover
        print(f"[db] compatibility migration skipped: {exc}")
