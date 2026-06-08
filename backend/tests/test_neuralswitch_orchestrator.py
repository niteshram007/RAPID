from __future__ import annotations

import asyncio
import unittest

from backend.app.neuralswitch.config import NeuralSwitchRuntimeConfig
from backend.app.neuralswitch.memory import NeuralSwitchMemory
from backend.app.neuralswitch.model_registry import ModelRegistry
from backend.app.neuralswitch.orchestrator import (
    NeuralSwitchOrchestrator,
    OrchestratorDependencies,
)
from backend.app.neuralswitch.schemas import NeuralSwitchChatRequest
from backend.app.neuralswitch.services import ConversationService
from backend.app.neuralswitch.services.contracts import AgentResult
from backend.app.security import RapidPrincipal


class _FakeAnalyticsAgent:
    async def run(
        self,
        *,
        question,
        previous_user_message,
        conversation_id,
        user_id,
        principal,
        filters,
        document_ids,
        requested_model,
    ):  # noqa: ANN001
        rows = [
            {"period_start": "2026-04-01", "metric_value": 900000.0},
            {"period_start": "2026-05-01", "metric_value": 950000.0},
        ]
        return AgentResult(
            answer="Direct Answer: Revenue increased in the latest month.",
            intent="trend_analysis",
            confidence="high",
            assumptions=["Used latest complete period."],
            warnings=[],
            data_sources=["postgresql", "schema", "semantic_layer"],
            citations=[],
            tables=[
                {
                    "id": "query-result-table",
                    "title": "Query Result",
                    "columns": ["period_start", "metric_value"],
                    "rows": rows,
                }
            ],
            charts=[
                {
                    "id": "chart-query-result",
                    "type": "line",
                    "title": "Revenue Trend",
                    "x": "period_start",
                    "y": "metric_value",
                    "data": rows,
                }
            ],
            artifacts=[
                {
                    "type": "table",
                    "title": "Query Result",
                    "data": {
                        "title": "Query Result",
                        "columns": ["period_start", "metric_value"],
                        "rows": rows,
                    },
                    "chart_spec": {},
                    "visible": True,
                }
            ],
            metadata={
                "intent": "trend_analysis",
                "metrics_used": ["revenue"],
                "time_period": "last 2 months",
                "filters": filters,
                "sql_used": "SELECT ...",
                "sources": ["postgresql", "schema"],
                "confidence": "high",
                "assumptions": ["Used latest complete period."],
            },
        )


class NeuralSwitchOrchestratorTests(unittest.TestCase):
    def _build_orchestrator(self) -> NeuralSwitchOrchestrator:
        runtime = NeuralSwitchRuntimeConfig(
            debug_trace_default=True,
            max_rows_per_table=200,
            max_sql_rows=200,
            ai_query_timeout_ms=10000,
            enable_sql_preview=True,
            enable_streaming=True,
            enable_live_web_tool=False,
            rag_max_chunks=8,
            embedding_model="hashing-384",
            vector_db_url="",
            model_registry_override={},
            local_llm=None,
        )
        memory = NeuralSwitchMemory()
        deps = OrchestratorDependencies(
            runtime_config=runtime,
            model_registry=ModelRegistry(runtime),
            memory_store=memory,
            conversation_service=ConversationService(memory),
            analytics_agent_service=_FakeAnalyticsAgent(),
            llm_client=None,
        )
        return NeuralSwitchOrchestrator(deps)

    def test_chat_returns_structured_response(self) -> None:
        orchestrator = self._build_orchestrator()
        principal = RapidPrincipal(
            user_id="user-1",
            role="executive",
            permissions=frozenset({"view_dashboard"}),
            scope={"geoHeads": ("US",), "bdms": ("Alice",)},
        )

        request = NeuralSwitchChatRequest(
            message="Show revenue trend for last two months",
            conversation_id="conv-test-1",
            filters={"geoHeads": ["US"]},
            stream=False,
            attachments=[],
            document_ids=[],
        )

        response = asyncio.run(
            orchestrator.chat(
                request,
                principal=principal,
                user_id=principal.user_id,
            )
        )
        self.assertTrue(response.answer)
        self.assertTrue(response.tables)
        self.assertTrue(response.charts)
        self.assertTrue(response.metadata)
        self.assertEqual(response.data_sources[0], "postgresql")

    def test_unsafe_request_is_blocked(self) -> None:
        orchestrator = self._build_orchestrator()
        principal = RapidPrincipal(
            user_id="user-2",
            role="executive",
            permissions=frozenset({"view_dashboard"}),
            scope={},
        )

        request = NeuralSwitchChatRequest(
            message="Delete all revenue records",
            conversation_id="conv-test-2",
        )
        response = asyncio.run(
            orchestrator.chat(
                request,
                principal=principal,
                user_id=principal.user_id,
            )
        )
        self.assertEqual(response.intent, "unsupported_or_unsafe")
        self.assertIn("safe", response.answer.lower())


if __name__ == "__main__":
    unittest.main()
