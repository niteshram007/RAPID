"""Assemble the final OpenAI-style message list for each chat mode."""
from __future__ import annotations

from app.models.chat import Message
from app.prompts.rag_prompt import RAG_SYSTEM_PROMPT, build_rag_user_prompt
from app.prompts.rapid_prompt import RAPID_DOMAIN_CONTEXT
from app.services import memory_service
from app.services.rag_service import RetrievalResult


def build_general_messages(
    system_prompt: str,
    history: list[Message],
    user_message: str,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(memory_service.to_openai_messages(history))
    messages.append({"role": "user", "content": user_message})
    return messages


def build_rag_messages(
    history: list[Message],
    user_message: str,
    retrieval: RetrievalResult,
) -> list[dict[str, str]]:
    history_text = memory_service.format_history_text(history)
    user_prompt = build_rag_user_prompt(
        context=retrieval.context, chat_history=history_text, question=user_message
    )
    return [
        {"role": "system", "content": RAG_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def build_rapid_messages(
    system_prompt: str,
    history: list[Message],
    user_message: str,
) -> list[dict[str, str]]:
    """Placeholder RAPID-mode prompt until the RAPID DB is wired in.

    Injects RAPID domain knowledge so the model can reason about Budget/Actual/
    Forecast/Variance terminology even before live data is connected.
    """
    system = f"{system_prompt}\n\n{RAPID_DOMAIN_CONTEXT}"
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    messages.extend(memory_service.to_openai_messages(history))
    messages.append({"role": "user", "content": user_message})
    return messages
