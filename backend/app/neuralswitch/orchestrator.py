from __future__ import annotations

from dataclasses import asdict, dataclass, is_dataclass
from typing import Any

from backend.app.security import RapidPrincipal

from .config import NeuralSwitchRuntimeConfig, default_runtime_config
from .guards.rbac_guard import apply_scope_filters
from .intent_classifier import classify_intent
from .memory import NeuralSwitchMemory
from .model_registry import ModelRegistry
from .schemas import NeuralSwitchChatRequest, NeuralSwitchChatResponse
from .services import ConversationService
from .services.contracts import AgentResult


@dataclass
class OrchestratorDependencies:
    runtime_config: NeuralSwitchRuntimeConfig
    model_registry: ModelRegistry
    memory_store: NeuralSwitchMemory
    conversation_service: ConversationService
    analytics_agent_service: Any
    llm_client: Any = None


class DefaultAnalyticsAgentService:
    async def run(
        self,
        *,
        question: str,
        previous_user_message: str | None,
        conversation_id: str | None,
        user_id: str,
        principal: RapidPrincipal,
        filters: dict[str, Any],
        document_ids: list[str],
        requested_model: str | None,
    ) -> AgentResult:
        del previous_user_message, conversation_id, user_id, principal, document_ids, requested_model
        intent = classify_intent(question).primary_intent
        return AgentResult(
            answer="Direct Answer: NeuralSwitch is ready. I can analyze RAPID revenue, budget, forecast, variance, forex, and uploaded document questions.",
            intent=intent,
            confidence="medium",
            assumptions=["No live analytical query was executed for this lightweight health response."],
            warnings=[],
            data_sources=["rapid-neuralswitch"],
            metadata={
                "intent": intent,
                "filters": filters,
                "sources": ["rapid-neuralswitch"],
            },
        )


class NeuralSwitchOrchestrator:
    def __init__(self, dependencies: OrchestratorDependencies | None = None) -> None:
        if dependencies is None:
            runtime = default_runtime_config()
            memory = NeuralSwitchMemory()
            dependencies = OrchestratorDependencies(
                runtime_config=runtime,
                model_registry=ModelRegistry(runtime),
                memory_store=memory,
                conversation_service=ConversationService(memory),
                analytics_agent_service=DefaultAnalyticsAgentService(),
                llm_client=None,
            )
        self.dependencies = dependencies

    async def chat(
        self,
        request: NeuralSwitchChatRequest,
        *,
        principal: RapidPrincipal,
        user_id: str,
    ) -> NeuralSwitchChatResponse:
        conversation_id = request.conversation_id or f"conv-{user_id or 'anonymous'}"
        previous_message = self.dependencies.conversation_service.previous_user_message(conversation_id)
        intent = classify_intent(request.message, previous_user_message=previous_message)

        if intent.primary_intent == "unsupported_or_unsafe":
            response = NeuralSwitchChatResponse(
                answer="I can help with safe, read-only analysis only. Please ask a revenue, budget, forecast, KPI, forex, or document question.",
                intent=intent.primary_intent,
                confidence=intent.confidence,
                warnings=["Unsafe or write-oriented request blocked."],
                metadata={"intent": intent.primary_intent},
                conversation_id=conversation_id,
            )
            self.dependencies.conversation_service.record_turn(conversation_id, request.message, response.answer)
            return response

        scoped = apply_scope_filters(principal=principal, filters=request.filters)
        result = await self.dependencies.analytics_agent_service.run(
            question=request.message,
            previous_user_message=previous_message,
            conversation_id=conversation_id,
            user_id=user_id,
            principal=principal,
            filters=scoped.filters,
            document_ids=request.document_ids,
            requested_model=request.model or self.dependencies.model_registry.default_model,
        )
        response = self._result_to_response(result, conversation_id=conversation_id)
        self.dependencies.conversation_service.record_turn(conversation_id, request.message, response.answer)
        return response

    def _result_to_response(self, result: AgentResult | Any, *, conversation_id: str) -> NeuralSwitchChatResponse:
        if isinstance(result, NeuralSwitchChatResponse):
            return result
        if is_dataclass(result):
            data = asdict(result)
        elif hasattr(result, "model_dump"):
            data = result.model_dump()
        else:
            data = dict(result)
        metadata = dict(data.get("metadata") or {})
        metadata.setdefault("intent", data.get("intent") or "analysis")
        return NeuralSwitchChatResponse(
            answer=str(data.get("answer") or ""),
            intent=str(data.get("intent") or metadata.get("intent") or "analysis"),
            confidence=str(data.get("confidence") or metadata.get("confidence") or "medium"),
            assumptions=list(data.get("assumptions") or []),
            warnings=list(data.get("warnings") or []),
            data_sources=list(data.get("data_sources") or []),
            citations=list(data.get("citations") or []),
            tables=list(data.get("tables") or []),
            charts=list(data.get("charts") or []),
            artifacts=list(data.get("artifacts") or []),
            metadata=metadata,
            conversation_id=conversation_id,
        )
