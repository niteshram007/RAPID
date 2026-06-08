from __future__ import annotations

from ..memory import NeuralSwitchMemory


class ConversationService:
    def __init__(self, memory: NeuralSwitchMemory) -> None:
        self.memory = memory

    def previous_user_message(self, conversation_id: str | None) -> str | None:
        if not conversation_id:
            return None
        return self.memory.previous_user_message(conversation_id)

    def record_turn(self, conversation_id: str | None, user_message: str, assistant_answer: str) -> None:
        if not conversation_id:
            return
        self.memory.add_message(conversation_id, "user", user_message)
        self.memory.add_message(conversation_id, "assistant", assistant_answer)


__all__ = ["ConversationService"]
