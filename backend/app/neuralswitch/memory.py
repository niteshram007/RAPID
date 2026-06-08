from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import DefaultDict


@dataclass(frozen=True)
class MemoryMessage:
    role: str
    content: str


class NeuralSwitchMemory:
    def __init__(self) -> None:
        self._messages: DefaultDict[str, list[MemoryMessage]] = defaultdict(list)

    def add_message(self, conversation_id: str, role: str, content: str) -> None:
        if not conversation_id or not content:
            return
        self._messages[conversation_id].append(MemoryMessage(role=role, content=content))

    def messages(self, conversation_id: str) -> list[MemoryMessage]:
        return list(self._messages.get(conversation_id, ()))

    def previous_user_message(self, conversation_id: str) -> str | None:
        for message in reversed(self._messages.get(conversation_id, ())):
            if message.role == "user":
                return message.content
        return None
