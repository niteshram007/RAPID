"""Chat endpoints: non-streaming, streaming (SSE), and chat CRUD."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.artifacts.artifact_router import create_artifact, artifact_title, requested_artifact_type
from app.database import SessionLocal, get_db
from app.models.chat import Chat, Message
from app.neural_switch.response_guard import apply_guard
from app.schemas.chat import (
    ChatDetail,
    ChatRequest,
    ChatResponse,
    ChatSummary,
    CreateChatRequest,
    MessageOut,
    RenameChatRequest,
)
from app.services import chat_service, rapid_service, settings_service
from app.services.llm_client import LLMError

router = APIRouter(tags=["chat"])


def _artifact_dump(artifact) -> dict:
    return artifact.model_dump(mode="json") if hasattr(artifact, "model_dump") else dict(artifact)


def _attach_artifact_to_message(
    db: Session,
    *,
    chat: Chat,
    assistant: Message,
    artifact_type: str | None,
    title: str,
    answer: str,
    table,
    chart,
    metadata: dict,
) -> tuple[str, dict]:
    if not artifact_type or table is None:
        return answer, metadata
    artifact = create_artifact(
        db,
        artifact_type=artifact_type,
        table=table,
        chart=chart,
        title=title,
        answer=answer,
        chat_id=chat.id,
        message_id=assistant.id,
        metadata={"source": "chat", "message_id": assistant.id},
    )
    next_metadata = dict(metadata or {})
    artifacts = list(next_metadata.get("artifacts") or [])
    artifacts.append(_artifact_dump(artifact))
    next_metadata["artifacts"] = artifacts
    next_metadata["artifact_generated"] = True
    next_metadata["artifact_request_type"] = artifact_type
    next_answer = f"{answer}\n\nGenerated file: **{artifact.filename}**"
    assistant.content = next_answer
    assistant.meta = next_metadata
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return next_answer, next_metadata


def _message_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        role=m.role,
        content=m.content,
        sources=m.sources,
        metadata=m.meta,
        created_at=m.created_at,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    prepared = await chat_service.prepare_turn(db, req)
    client = settings_service.llm_client_from_settings(db)

    if prepared.routed_tool == chat_service.CHART_TRANSFORM:
        answer = prepared.fallback_answer or "Here is the requested chart."
        assistant = chat_service.persist_assistant_message(
            db,
            prepared.chat,
            answer,
            prepared.sources,
            prepared.metadata,
        )
        return ChatResponse(
            chat_id=prepared.chat.id,
            message_id=assistant.id,
            answer=answer,
            type="text",
            sources=prepared.sources,
            table=prepared.table,
            chart=prepared.chart,
            suggested_questions=chat_service.suggested_questions(prepared.mode),
            metadata=prepared.metadata,
        )

    if prepared.routed_tool == chat_service.ARTIFACT_GENERATION:
        answer = prepared.fallback_answer or "I created the requested artifact."
        assistant = chat_service.persist_assistant_message(
            db,
            prepared.chat,
            answer,
            prepared.sources,
            prepared.metadata,
        )
        answer, metadata = _attach_artifact_to_message(
            db,
            chat=prepared.chat,
            assistant=assistant,
            artifact_type=str(prepared.metadata.get("artifact_request_type") or "excel"),
            title=str(prepared.metadata.get("artifact_title") or artifact_title(req.message)),
            answer=answer,
            table=prepared.table,
            chart=prepared.chart,
            metadata=prepared.metadata,
        )
        return ChatResponse(
            chat_id=prepared.chat.id,
            message_id=assistant.id,
            answer=answer,
            type="text",
            sources=prepared.sources,
            table=prepared.table,
            chart=prepared.chart,
            suggested_questions=chat_service.suggested_questions(prepared.mode),
            metadata=metadata,
        )

    if prepared.routed_tool in {"rapid_analytics", "rapid_sql"}:
        try:
            rapid = await rapid_service.answer_question(
                question=req.message,
                client=client,
                model=prepared.model,
                temperature=prepared.temperature,
                max_tokens=prepared.max_tokens,
                chat_context={"history_context": prepared.history_context},
                debug=prepared.routed_tool == "rapid_sql",
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        assistant = chat_service.persist_assistant_message(
            db,
            prepared.chat,
            rapid.answer,
            rapid.sources,
            rapid.metadata,
        )
        artifact_type = requested_artifact_type(req.message)
        answer, metadata = _attach_artifact_to_message(
            db,
            chat=prepared.chat,
            assistant=assistant,
            artifact_type=artifact_type,
            title=artifact_title(req.message, fallback="RAPID Analytics Export"),
            answer=rapid.answer,
            table=rapid.table,
            chart=rapid.chart,
            metadata=rapid.metadata,
        )
        return ChatResponse(
            chat_id=prepared.chat.id,
            message_id=assistant.id,
            answer=answer,
            type="text",
            sources=rapid.sources,
            table=rapid.table,
            chart=rapid.chart,
            suggested_questions=chat_service.suggested_questions(prepared.mode),
            metadata=metadata,
        )

    try:
        result = await client.chat_completion(
            messages=prepared.messages,
            model=prepared.model,
            temperature=prepared.temperature,
            max_tokens=prepared.max_tokens,
            top_p=prepared.top_p,
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    usage = result.get("usage") or {}
    content = str(result.get("content") or "")
    fallback_text = prepared.fallback_answer or content or "I could not produce a grounded answer for that prompt."
    answer_text = apply_guard(content, prepared.mode, fallback_text)
    metadata = {
        "model": result.get("model", prepared.model),
        "mode": prepared.mode,
        "tool_route": prepared.routed_tool,
        "tokens_used": usage.get("total_tokens", 0),
    }
    assistant = chat_service.persist_assistant_message(
        db, prepared.chat, answer_text, prepared.sources, metadata
    )

    return ChatResponse(
        chat_id=prepared.chat.id,
        message_id=assistant.id,
        answer=answer_text,
        type="text",
        sources=prepared.sources,
        suggested_questions=chat_service.suggested_questions(prepared.mode),
        metadata=metadata,
    )


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, db: Session = Depends(get_db)):
    prepared = await chat_service.prepare_turn(db, req)
    client = settings_service.llm_client_from_settings(db)
    chat_id = prepared.chat.id

    async def event_generator() -> AsyncIterator[str]:
        if prepared.routed_tool == chat_service.CHART_TRANSFORM:
            answer = prepared.fallback_answer or "Here is the requested chart."
            yield _sse(
                {
                    "type": "meta",
                    "chat_id": chat_id,
                    "mode": prepared.mode,
                    "tool_route": prepared.routed_tool,
                    "sources": [s.model_dump() for s in prepared.sources],
                }
            )
            yield _sse({"type": "token", "content": answer})

            persist_db = SessionLocal()
            message_id = ""
            try:
                chat_obj = persist_db.get(Chat, chat_id)
                if chat_obj is not None:
                    assistant = chat_service.persist_assistant_message(
                        persist_db,
                        chat_obj,
                        answer,
                        prepared.sources,
                        prepared.metadata,
                    )
                    message_id = assistant.id
            finally:
                persist_db.close()

            yield _sse(
                {
                    "type": "done",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "answer": answer,
                    "metadata": prepared.metadata,
                    "table": prepared.table.model_dump() if prepared.table else None,
                    "chart": prepared.chart.model_dump() if prepared.chart else None,
                    "suggested_questions": chat_service.suggested_questions(prepared.mode),
                }
            )
            return

        if prepared.routed_tool == chat_service.ARTIFACT_GENERATION:
            answer = prepared.fallback_answer or "I created the requested artifact."
            metadata = dict(prepared.metadata)
            message_id = ""
            persist_db = SessionLocal()
            try:
                chat_obj = persist_db.get(Chat, chat_id)
                if chat_obj is not None:
                    assistant = chat_service.persist_assistant_message(
                        persist_db,
                        chat_obj,
                        answer,
                        prepared.sources,
                        metadata,
                    )
                    message_id = assistant.id
                    answer, metadata = _attach_artifact_to_message(
                        persist_db,
                        chat=chat_obj,
                        assistant=assistant,
                        artifact_type=str(metadata.get("artifact_request_type") or "excel"),
                        title=str(metadata.get("artifact_title") or artifact_title(req.message)),
                        answer=answer,
                        table=prepared.table,
                        chart=prepared.chart,
                        metadata=metadata,
                    )
            except Exception as exc:
                persist_db.close()
                yield _sse({"type": "error", "message": str(exc), "kind": "artifact_generation"})
                return
            finally:
                persist_db.close()

            yield _sse(
                {
                    "type": "meta",
                    "chat_id": chat_id,
                    "mode": prepared.mode,
                    "tool_route": prepared.routed_tool,
                    "sources": [s.model_dump() for s in prepared.sources],
                }
            )
            yield _sse({"type": "token", "content": answer})
            yield _sse(
                {
                    "type": "done",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "answer": answer,
                    "metadata": metadata,
                    "table": prepared.table.model_dump() if prepared.table else None,
                    "chart": prepared.chart.model_dump() if prepared.chart else None,
                    "suggested_questions": chat_service.suggested_questions(prepared.mode),
                }
            )
            return

        if prepared.routed_tool in {"rapid_analytics", "rapid_sql"}:
            try:
                rapid = await rapid_service.answer_question(
                    question=req.message,
                    client=client,
                    model=prepared.model,
                    temperature=prepared.temperature,
                    max_tokens=prepared.max_tokens,
                    chat_context={"history_context": prepared.history_context},
                    debug=prepared.routed_tool == "rapid_sql",
                )
            except Exception as exc:
                yield _sse({"type": "error", "message": str(exc), "kind": "rapid_query"})
                return

            yield _sse(
                {
                    "type": "meta",
                    "chat_id": chat_id,
                    "mode": prepared.mode,
                    "tool_route": prepared.routed_tool,
                    "sources": [s.model_dump() for s in rapid.sources],
                }
            )
            yield _sse({"type": "token", "content": rapid.answer})

            persist_db = SessionLocal()
            message_id = ""
            answer = rapid.answer
            metadata = dict(rapid.metadata)
            try:
                chat_obj = persist_db.get(Chat, chat_id)
                if chat_obj is not None:
                    assistant = chat_service.persist_assistant_message(
                        persist_db,
                        chat_obj,
                        answer,
                        rapid.sources,
                        metadata,
                    )
                    message_id = assistant.id
                    answer, metadata = _attach_artifact_to_message(
                        persist_db,
                        chat=chat_obj,
                        assistant=assistant,
                        artifact_type=requested_artifact_type(req.message),
                        title=artifact_title(req.message, fallback="RAPID Analytics Export"),
                        answer=answer,
                        table=rapid.table,
                        chart=rapid.chart,
                        metadata=metadata,
                    )
            finally:
                persist_db.close()

            yield _sse(
                {
                    "type": "done",
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "answer": answer,
                    "metadata": metadata,
                    "table": rapid.table.model_dump() if rapid.table else None,
                    "chart": rapid.chart.model_dump() if rapid.chart else None,
                    "suggested_questions": chat_service.suggested_questions(prepared.mode),
                }
            )
            return

        yield _sse(
            {
                "type": "meta",
                "chat_id": chat_id,
                "mode": prepared.mode,
                "tool_route": prepared.routed_tool,
                "sources": [s.model_dump() for s in prepared.sources],
            }
        )

        collected: list[str] = []
        try:
            async for token in client.chat_completion_stream(
                messages=prepared.messages,
                model=prepared.model,
                temperature=prepared.temperature,
                max_tokens=prepared.max_tokens,
                top_p=prepared.top_p,
            ):
                collected.append(token)
                yield _sse({"type": "token", "content": token})
        except LLMError as exc:
            yield _sse({"type": "error", "message": str(exc), "kind": exc.kind})
            return
        except Exception as exc:  # pragma: no cover
            yield _sse({"type": "error", "message": f"Unexpected error: {exc}", "kind": "unknown"})
            return

        content = "".join(collected)
        fallback_text = prepared.fallback_answer or content or "I could not produce a grounded answer for that prompt."
        answer = apply_guard(content, prepared.mode, fallback_text)
        metadata = {
            "model": prepared.model,
            "mode": prepared.mode,
            "tool_route": prepared.routed_tool,
            "tokens_used": 0,
        }

        persist_db = SessionLocal()
        message_id = ""
        try:
            chat_obj = persist_db.get(Chat, chat_id)
            if chat_obj is not None:
                assistant = chat_service.persist_assistant_message(
                    persist_db, chat_obj, answer, prepared.sources, metadata
                )
                message_id = assistant.id
        finally:
            persist_db.close()

        yield _sse(
            {
                "type": "done",
                "chat_id": chat_id,
                "message_id": message_id,
                "answer": answer,
                "metadata": metadata,
                "suggested_questions": chat_service.suggested_questions(prepared.mode),
            }
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/chats", response_model=list[ChatSummary])
def list_chats(db: Session = Depends(get_db)):
    chats = db.scalars(select(Chat).order_by(Chat.updated_at.desc())).all()
    return [ChatSummary.model_validate(c) for c in chats]


@router.post("/chats", response_model=ChatSummary)
def create_chat(req: CreateChatRequest, db: Session = Depends(get_db)):
    chat_obj = Chat(title=req.title or "New chat")
    db.add(chat_obj)
    db.commit()
    db.refresh(chat_obj)
    return ChatSummary.model_validate(chat_obj)


@router.get("/chats/{chat_id}", response_model=ChatDetail)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat_obj = db.get(Chat, chat_id)
    if chat_obj is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return ChatDetail(
        id=chat_obj.id,
        title=chat_obj.title,
        created_at=chat_obj.created_at,
        updated_at=chat_obj.updated_at,
        messages=[_message_out(m) for m in chat_obj.messages],
    )


@router.patch("/chats/{chat_id}", response_model=ChatSummary)
def rename_chat(chat_id: str, req: RenameChatRequest, db: Session = Depends(get_db)):
    chat_obj = db.get(Chat, chat_id)
    if chat_obj is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    chat_obj.title = req.title
    db.commit()
    db.refresh(chat_obj)
    return ChatSummary.model_validate(chat_obj)


@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat_obj = db.get(Chat, chat_id)
    if chat_obj is None:
        raise HTTPException(status_code=404, detail="Chat not found.")
    db.delete(chat_obj)
    db.commit()
    return {"ok": True, "deleted": chat_id}
