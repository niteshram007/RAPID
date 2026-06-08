from __future__ import annotations

import json
import time
import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.neuralswitch.services.permissions_service import PermissionsService
from backend.app.neuralswitch.services.schema_service import SchemaService
from backend.app.neuralswitch.services.semantic_layer_service import SemanticLayerService
from backend.app.neuralswitch.services.sql_generation_service import SqlGenerationService
from backend.app.neuralswitch.services.sql_validation_service import (
    SqlValidationConfig,
    SqlValidationService,
)
from backend.app.neuralswitch.services.contracts import GeneratedSqlPlan
from backend.app.security import (
    AUTH_PAYLOAD_HEADER,
    AUTH_SIGNATURE_HEADER,
    RapidPrincipal,
    encode_base64url,
    sign_payload,
)


class NeuralSwitchAnalyticsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.permissions = PermissionsService(allowed_tables={"trend_summary"})
        self.sql_validation = SqlValidationService(
            self.permissions,
            SqlValidationConfig(max_sql_rows=100),
        )
        self.sql_generation = SqlGenerationService(
            SemanticLayerService(),
            SchemaService(),
        )

    def test_sql_validator_blocks_destructive_statements(self) -> None:
        plan = GeneratedSqlPlan(
            sql="SELECT 1; DELETE FROM trend_summary",
            params=[],
            metric_name="revenue",
            table_name="trend_summary",
            dimensions=[],
            intent="sql_request",
            time_period_label="latest",
        )
        with self.assertRaises(HTTPException):
            self.sql_validation.validate(
                plan,
                principal=RapidPrincipal(user_id="u1", role="executive", permissions=frozenset({"view_dashboard"}), scope={}),
            )

    def test_sql_validator_allows_select_and_enforces_limit(self) -> None:
        plan = GeneratedSqlPlan(
            sql="SELECT metric_value FROM trend_summary",
            params=[],
            metric_name="revenue",
            table_name="trend_summary",
            dimensions=[],
            intent="direct_kpi_lookup",
            time_period_label="latest",
        )
        validated = self.sql_validation.validate(
            plan,
            principal=RapidPrincipal(user_id="u1", role="executive", permissions=frozenset({"view_dashboard"}), scope={}),
        )
        self.assertIn("limit 100", validated.sql.lower())

    def test_intent_and_time_extraction(self) -> None:
        parsed = self.sql_generation.parse_question("Show MRR by region for last 6 months")
        self.assertEqual(parsed.metric_name, "mrr")
        self.assertIn("region", parsed.dimensions)
        self.assertEqual(parsed.time_period_label, "last 6 months")

    def test_permissions_block_unauthorized_table(self) -> None:
        plan = GeneratedSqlPlan(
            sql="SELECT * FROM actual_revenue",
            params=[],
            metric_name="revenue",
            table_name="actual_revenue",
            dimensions=[],
            intent="sql_request",
            time_period_label="latest",
        )
        with self.assertRaises(HTTPException):
            self.sql_validation.validate(
                plan,
                principal=RapidPrincipal(user_id="u2", role="executive", permissions=frozenset({"view_dashboard"}), scope={}),
            )


class NeuralSwitchChatEndpointTests(unittest.TestCase):
    def _build_auth_headers(self) -> dict[str, str]:
        payload_dict = {
            "userId": "test-user",
            "email": "test@example.com",
            "name": "Test User",
            "roleId": "executive",
            "roleName": "Executive",
            "permissions": ["view_dashboard"],
            "scope": {},
            "issuedAt": int(time.time() * 1000),
        }
        payload = encode_base64url(json.dumps(payload_dict).encode("utf-8"))
        signature = sign_payload(payload)
        return {
            AUTH_PAYLOAD_HEADER: payload,
            AUTH_SIGNATURE_HEADER: signature,
        }

    def test_chat_endpoint_returns_valid_response_shape(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/api/neuralswitch/chat",
            headers=self._build_auth_headers(),
            json={
                "message": "Show revenue trend for last month",
                "conversation_id": "conv-endpoint-test",
                "document_ids": [],
                "filters": {},
                "stream": False,
                "attachments": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("answer", body)
        self.assertIn("intent", body)
        self.assertIn("metadata", body)


if __name__ == "__main__":
    unittest.main()
