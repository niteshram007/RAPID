"""FastAPI application entrypoint."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api import (
    attachments,
    artifacts,
    chat,
    documents,
    health,
    models as models_api,
    settings as settings_api,
    tools,
)
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Local OpenAI-compatible chat agent with RAG. Designed to merge into RAPID.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Simple in-memory rate limiter (per client IP) -----------------------
# Implemented as a pure ASGI middleware so it does NOT buffer streaming (SSE)
# responses the way BaseHTTPMiddleware would.

_requests: dict[str, deque] = defaultdict(deque)


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, limit_per_minute: int):
        self.app = app
        self.limit = limit_per_minute

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.startswith(("/health", "/docs", "/openapi")):
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        client_ip = client[0] if client else "unknown"
        now = time.time()
        window = _requests[client_ip]
        while window and now - window[0] > 60:
            window.popleft()

        if len(window) >= self.limit:
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"detail":"Too many requests. Please slow down and try again shortly."}',
            })
            return

        window.append(now)
        await self.app(scope, receive, send)


app.add_middleware(RateLimitMiddleware, limit_per_minute=settings.rate_limit_per_minute)


# ---- Routers -------------------------------------------------------------

app.include_router(health.router)
app.include_router(models_api.router)
app.include_router(chat.router)
app.include_router(attachments.router)
app.include_router(documents.router)
app.include_router(artifacts.router)
app.include_router(settings_api.router)
app.include_router(tools.router)


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
