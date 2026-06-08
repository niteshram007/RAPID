"""Chat orchestration: prepares prompts, calls the LLM, persists messages.

Used by both the non-streaming `/chat` and streaming `/chat/stream` endpoints.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat import Chat, Message
from app.artifacts.artifact_router import artifact_title, requested_artifact_type
from app.models.document import Document
from app.neural_switch.context_builder import (
    build_history_context,
    build_rag_fallback,
    build_search_context,
    build_search_fallback,
)
from app.neural_switch.router import (
    CALCULATOR,
    CHART_GENERATION,
    CODE_ASSISTANT,
    CSV_GENERATION,
    DASHBOARD_GENERATION,
    DATA_EXPORT,
    EXCEL_GENERATION,
    FACTUAL_QA,
    GENERAL_LLM,
    PDF_REPORT_GENERATION,
    RAG_DOCUMENT_SEARCH,
    RAPID_ANALYTICS,
    RAPID_EXPORT,
    RAPID_SQL,
    RouteDecision,
    WEB_SEARCH,
    WORD_REPORT_GENERATION,
    classify_question,
)
from app.prompts.realtime_prompt import REALTIME_SYSTEM_PROMPT, build_realtime_user_prompt
from app.schemas.chat import ChartData, ChatRequest, Source, TableData
from app.services import (
    calculator_service,
    memory_service,
    prompt_builder,
    rag_service,
    settings_service,
    web_search_service,
)

CHART_TRANSFORM = "chart_transform"
ARTIFACT_GENERATION = "artifact_generation"
ARTIFACT_ROUTER_MODES = {
    EXCEL_GENERATION,
    CSV_GENERATION,
    PDF_REPORT_GENERATION,
    WORD_REPORT_GENERATION,
    DASHBOARD_GENERATION,
    DATA_EXPORT,
    CHART_GENERATION,
    RAPID_EXPORT,
}


@dataclass
class PreparedTurn:
    chat: Chat
    user_message: Message
    messages: list[dict[str, str]]
    sources: list[Source] = field(default_factory=list)
    model: str = ""
    temperature: float = 0.3
    max_tokens: int = 2048
    top_p: float = 1.0
    streaming: bool = True
    mode: str = GENERAL_LLM
    routed_tool: str = GENERAL_LLM
    fallback_answer: str | None = None
    history_context: str = ""
    table: TableData | None = None
    chart: ChartData | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def get_or_create_chat(db: Session, chat_id: str | None, first_message: str) -> Chat:
    if chat_id:
        chat = db.get(Chat, chat_id)
        if chat:
            return chat
    title = _derive_title(first_message)
    chat = Chat(title=title)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def _derive_title(text: str) -> str:
    text = " ".join(text.strip().split())
    return (text[:48] + "...") if len(text) > 48 else (text or "New chat")


def _requested_chart_type(text: str) -> str | None:
    normalized = " ".join(str(text or "").lower().split())
    if not any(token in normalized for token in ("chart", "graph", "visual", "plot", "pie", "bar", "line", "donut", "doughnut")):
        return None
    if "pie" in normalized or "donut" in normalized or "doughnut" in normalized:
        return "pie"
    if "line" in normalized or "trend" in normalized:
        return "line"
    if "bar" in normalized or "column" in normalized:
        return "bar"
    return "bar"


def _coerce_table(value: Any) -> TableData | None:
    if not isinstance(value, dict):
        return None
    columns = value.get("columns")
    rows = value.get("rows")
    if not isinstance(columns, list) or not isinstance(rows, list) or not columns or not rows:
        return None
    return TableData(
        columns=[str(column) for column in columns],
        rows=[list(row) for row in rows if isinstance(row, list)],
    )


def _coerce_chart(value: Any, table: TableData, chart_type: str) -> ChartData:
    if isinstance(value, dict):
        x = str(value.get("x") or "").strip()
        y = str(value.get("y") or "").strip()
        if x and y:
            return ChartData(type=chart_type, x=x, y=y)
    x = table.columns[0]
    y = next(
        (
            column
            for column_index, column in enumerate(table.columns[1:], start=1)
            if any(isinstance(row[column_index], (int, float)) for row in table.rows if len(row) > column_index)
        ),
        table.columns[1] if len(table.columns) > 1 else table.columns[0],
    )
    return ChartData(type=chart_type, x=x, y=y)


def _latest_structured_result(messages: list[Message]) -> tuple[TableData, ChartData | None, list[Source]] | None:
    for message in reversed(messages):
        if message.role != "assistant" or not isinstance(message.meta, dict):
            continue
        table = _coerce_table(message.meta.get("table"))
        if table is None:
            continue
        chart_meta = message.meta.get("chart") if isinstance(message.meta.get("chart"), dict) else None
        sources = []
        for item in message.sources or []:
            if isinstance(item, dict):
                try:
                    sources.append(Source(**item))
                except Exception:
                    continue
        chart = (
            ChartData(
                type=str(chart_meta.get("type") or "bar"),
                x=str(chart_meta.get("x") or table.columns[0]),
                y=str(chart_meta.get("y") or (table.columns[1] if len(table.columns) > 1 else table.columns[0])),
            )
            if chart_meta
            else None
        )
        return table, chart, sources
    return None


def _build_chart_transform_turn(
    *,
    chat: Chat,
    user_msg: Message,
    question: str,
    chart_type: str,
    structured_result: tuple[TableData, ChartData | None, list[Source]],
    selected_model: str,
    history_context: str,
) -> PreparedTurn:
    table, previous_chart, sources = structured_result
    chart = _coerce_chart(previous_chart.model_dump() if previous_chart else None, table, chart_type)
    rows = len(table.rows)
    answer = (
        f"Here is the {chart_type} chart using the previous RAPID result. "
        f"I reused the verified table with {rows} row group(s), plotting **{chart.y}** by **{chart.x}**."
    )
    metadata = {
        "model": "deterministic-chart-tool",
        "mode": CHART_TRANSFORM,
        "tool_route": CHART_TRANSFORM,
        "table": table.model_dump(),
        "chart": chart.model_dump(),
        "chart_transform": True,
    }
    return PreparedTurn(
        chat=chat,
        user_message=user_msg,
        messages=[],
        sources=sources,
        model=selected_model,
        mode=CHART_TRANSFORM,
        routed_tool=CHART_TRANSFORM,
        fallback_answer=answer,
        history_context=history_context,
        table=table,
        chart=chart,
        metadata=metadata,
    )


def _build_artifact_turn(
    *,
    chat: Chat,
    user_msg: Message,
    question: str,
    artifact_type: str,
    structured_result: tuple[TableData, ChartData | None, list[Source]],
    selected_model: str,
    history_context: str,
) -> PreparedTurn:
    table, previous_chart, sources = structured_result
    chart = previous_chart or _coerce_chart(None, table, "bar")
    title = artifact_title(question)
    answer = (
        f"I found the previous verified result and created a {artifact_type.upper()} artifact from it. "
        "Use the download card below to open the file."
    )
    metadata = {
        "model": "deterministic-artifact-tool",
        "mode": ARTIFACT_GENERATION,
        "tool_route": ARTIFACT_GENERATION,
        "artifact_request_type": artifact_type,
        "artifact_title": title,
        "table": table.model_dump(),
        "chart": chart.model_dump() if chart else None,
        "artifact_generation": True,
    }
    return PreparedTurn(
        chat=chat,
        user_message=user_msg,
        messages=[],
        sources=sources,
        model=selected_model,
        mode=ARTIFACT_GENERATION,
        routed_tool=ARTIFACT_GENERATION,
        fallback_answer=answer,
        history_context=history_context,
        table=table,
        chart=chart,
        metadata=metadata,
    )


async def prepare_turn(db: Session, req: ChatRequest) -> PreparedTurn:
    cfg = settings_service.get_effective_settings(db)
    selected_model = req.model or cfg.get("llm_model")

    chat = get_or_create_chat(db, req.chat_id, req.message)

    user_msg = Message(chat_id=chat.id, role="user", content=req.message, model=selected_model)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    history = memory_service.get_recent_messages(db, chat.id, limit=10)
    history = [message for message in history if message.id != user_msg.id]
    history_context = build_history_context(history)

    sources: list[Source] = []
    fallback_answer: str | None = None

    attachment_ids = list(dict.fromkeys((req.attachments or []) + (req.document_ids or [])))
    if chat.id:
        linked = db.scalars(
            select(Document.id).where(Document.chat_id == chat.id, Document.status == "ready")
        ).all()
        for item_id in linked:
            if item_id not in attachment_ids:
                attachment_ids.append(item_id)

    requested_export_type = requested_artifact_type(req.message)
    requested_chart_type = _requested_chart_type(req.message)
    structured_result = _latest_structured_result(history)
    if requested_export_type and structured_result is not None:
        return _build_artifact_turn(
            chat=chat,
            user_msg=user_msg,
            question=req.message,
            artifact_type=requested_export_type,
            structured_result=structured_result,
            selected_model=selected_model,
            history_context=history_context,
        )
    if requested_chart_type and structured_result is not None:
        return _build_chart_transform_turn(
            chat=chat,
            user_msg=user_msg,
            question=req.message,
            chart_type=requested_chart_type,
            structured_result=structured_result,
            selected_model=selected_model,
            history_context=history_context,
        )

    if req.mode == "rapid":
        decision = RouteDecision(mode=RAPID_ANALYTICS, reasons=["Explicit rapid mode selected"], requires_database=True, requires_vector_context=True)
    elif req.mode == "sql":
        decision = RouteDecision(mode=RAPID_SQL, reasons=["Explicit SQL mode selected"], requires_database=True, requires_vector_context=True)
    elif req.mode == "rag":
        decision = RouteDecision(mode=RAG_DOCUMENT_SEARCH, reasons=["Explicit RAG mode selected"], requires_vector_context=True)
    elif req.mode == "general":
        decision = RouteDecision(mode=GENERAL_LLM, reasons=["Explicit general mode selected"])
    else:
        decision = classify_question(
            req.message,
            {
                "has_attachments": bool(attachment_ids),
                "history_context": history_context,
            },
        )

    if decision.mode in ARTIFACT_ROUTER_MODES:
        fallback_answer = (
            "I can generate that artifact, but I need a validated table first. "
            "Ask a RAPID analytics question such as `budget vs actual by BDM`, or use this after a previous result by saying `download this as Excel`."
        )
        return PreparedTurn(
            chat=chat,
            user_message=user_msg,
            messages=[],
            sources=[],
            model=selected_model,
            mode=ARTIFACT_GENERATION,
            routed_tool=ARTIFACT_GENERATION,
            fallback_answer=fallback_answer,
            history_context=history_context,
            metadata={
                "model": "deterministic-artifact-tool",
                "mode": ARTIFACT_GENERATION,
                "tool_route": ARTIFACT_GENERATION,
                "artifact_waiting_for_data": True,
            },
        )

    messages: list[dict[str, str]]
    if decision.mode in {RAPID_ANALYTICS, RAPID_SQL}:
        messages = prompt_builder.build_rapid_messages(cfg["system_prompt"], history, req.message)
    elif decision.mode == RAG_DOCUMENT_SEARCH and cfg.get("rag_enabled", True):
        retrieval = rag_service.retrieve(
            req.message,
            top_k=cfg.get("rag_top_k"),
            score_threshold=cfg.get("rag_score_threshold"),
            document_ids=attachment_ids or None,
        )
        sources = retrieval.sources
        messages = prompt_builder.build_rag_messages(history, req.message, retrieval)
        fallback_answer = build_rag_fallback(req.message, sources)
    elif decision.mode in {WEB_SEARCH, FACTUAL_QA} and cfg.get("web_search_enabled", True):
        results = await web_search_service.search(
            req.message,
            max_results=int(cfg.get("web_search_max_results", 5)),
            prefer_current=decision.mode == WEB_SEARCH,
        )
        search_context, sources = build_search_context(results)
        tool_context = (
            f"Recent chat context:\n{history_context}\n\n"
            f"Retrieved web context:\n{search_context}"
        )
        messages = [
            {"role": "system", "content": REALTIME_SYSTEM_PROMPT},
            {"role": "user", "content": build_realtime_user_prompt(tool_context, req.message)},
        ]
        fallback_answer = build_search_fallback(results, "Here are the most relevant retrieved sources:")
    elif decision.mode == CALCULATOR:
        calc = calculator_service.evaluate_question(req.message)
        tool_context = (
            f"Recent chat context:\n{history_context}\n\n"
            f"Deterministic calculation result:\nExpression: {calc.expression}\nResult: {calc.result}"
        )
        messages = [
            {"role": "system", "content": REALTIME_SYSTEM_PROMPT},
            {"role": "user", "content": build_realtime_user_prompt(tool_context, req.message)},
        ]
        sources = [
            Source(
                document_id="calculator",
                document_name="Deterministic calculator",
                page=None,
                chunk_text=calc.fallback_answer,
                score=1.0,
            )
        ]
        fallback_answer = calc.fallback_answer
    elif decision.mode == CODE_ASSISTANT:
        system_prompt = (
            f"{cfg['system_prompt']}\n\n"
            "You are acting as a code assistant. Favor implementation detail, debugging precision, and concrete next steps."
        )
        messages = prompt_builder.build_general_messages(system_prompt, history, req.message)
    else:
        messages = prompt_builder.build_general_messages(cfg["system_prompt"], history, req.message)
        if decision.mode in {WEB_SEARCH, FACTUAL_QA, RAG_DOCUMENT_SEARCH}:
            decision = RouteDecision(mode=GENERAL_LLM, reasons=["Fell back to general mode because the requested tool is disabled"])

    return PreparedTurn(
        chat=chat,
        user_message=user_msg,
        messages=messages,
        sources=sources,
        model=selected_model,
        temperature=req.temperature if req.temperature is not None else cfg["temperature"],
        max_tokens=req.max_tokens if req.max_tokens is not None else cfg["max_tokens"],
        top_p=cfg.get("top_p", 1.0),
        streaming=cfg.get("streaming", True),
        mode=decision.mode,
        routed_tool=decision.mode,
        fallback_answer=fallback_answer,
        history_context=history_context,
    )


def persist_assistant_message(
    db: Session,
    chat: Chat,
    content: str,
    sources: list[Source],
    metadata: dict[str, Any],
) -> Message:
    msg = Message(
        chat_id=chat.id,
        role="assistant",
        content=content,
        model=metadata.get("model"),
        sources=[s.model_dump() for s in sources] if sources else None,
        meta=metadata or None,
        token_count=int(metadata.get("tokens_used", 0)) if metadata else 0,
    )
    db.add(msg)
    chat.updated_at = chat.updated_at
    db.add(chat)
    db.commit()
    db.refresh(msg)
    return msg


def suggested_questions(mode: str) -> list[str]:
    if mode == ARTIFACT_GENERATION:
        return [
            "Create a PDF report from this",
            "Export this as CSV",
            "Make a dashboard from this",
        ]
    if mode == CHART_TRANSFORM:
        return [
            "Show this as a bar chart",
            "Show this by vertical",
            "Compare with actuals",
        ]
    if mode in {RAPID_ANALYTICS, RAPID_SQL}:
        return [
            "Show this by customer",
            "Compare forecast versus budget",
            "Show month-wise trend",
        ]
    if mode == RAG_DOCUMENT_SEARCH:
        return [
            "Summarize the key points",
            "What are the main risks mentioned?",
            "List any action items",
        ]
    if mode in {WEB_SEARCH, FACTUAL_QA}:
        return [
            "Give me the source links",
            "Summarize the latest updates",
            "Compare this with last year",
        ]
    if mode == CODE_ASSISTANT:
        return [
            "Show the implementation steps",
            "Explain the root cause",
            "Suggest a safer refactor",
        ]
    return []
