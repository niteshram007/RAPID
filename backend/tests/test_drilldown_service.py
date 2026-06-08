from __future__ import annotations

import unittest

from fastapi import HTTPException

from backend.app.security import RapidPrincipal
from backend.app.services.drilldown_service import (
    _source_configs,
    apply_filters,
    apply_metric_selection,
    apply_rbac_filters,
    build_drilldown_query,
    validate_drilldown_context,
)


class DrillDownServiceTests(unittest.TestCase):
    def test_validate_context_rejects_invalid_source(self) -> None:
        principal = RapidPrincipal(role="executive", permissions=frozenset({"view_dashboard"}))
        with self.assertRaises(HTTPException):
            validate_drilldown_context(
                {"source": "unknown", "metric": "Revenue", "filters": {}},
                principal,
            )

    def test_apply_filters_ignores_unsupported_field(self) -> None:
        config = _source_configs()["combined"]
        where_clauses: list[str] = []
        params: list[object] = []
        normalized = apply_filters(
            context={
                "filters": {"not_a_field": "value", "region": "US"},
                "fiscal_year": "",
                "date_range": {},
            },
            config=config,
            where_clauses=where_clauses,
            params=params,
        )
        self.assertNotIn("not_a_field", normalized)
        self.assertIn("region", normalized)
        self.assertEqual(len(where_clauses), 1)
        self.assertEqual(params[0], "us")

    def test_metric_selection_uses_requested_field(self) -> None:
        config = _source_configs()["variance"]
        metric_key, expression = apply_metric_selection(
            {"metric": "variance", "aggregation": {"type": "sum", "field": "variance"}},
            config,
        )
        self.assertEqual(metric_key, "variance")
        self.assertIn("budget_variance", expression)

    def test_rbac_intersects_requested_and_allowed_values(self) -> None:
        config = _source_configs()["budget"]
        where_clauses: list[str] = []
        params: list[object] = []
        apply_rbac_filters(
            principal=RapidPrincipal(
                role="bdm",
                permissions=frozenset({"view_dashboard"}),
                scope={
                    "bdms": ("Ravi", "Anil"),
                    "practiceHeads": (),
                    "geoHeads": (),
                    "entities": (),
                    "verticals": (),
                },
            ),
            config=config,
            normalized_filters={"bdm": ["Ravi", "Other"]},
            where_clauses=where_clauses,
            params=params,
        )
        self.assertEqual(len(where_clauses), 1)
        self.assertIn("bdm", where_clauses[0])
        self.assertEqual(params[0], "ravi")

    def test_build_query_includes_limit_offset_and_summary(self) -> None:
        config = _source_configs()["combined"]
        columns = [config.column_specs["customer_name"], config.column_specs["actual"]]
        details_sql, summary_sql = build_drilldown_query(
            context={"aggregation": {"type": "sum", "field": "actual"}},
            config=config,
            metric_expression="coalesce(t.actual_revenue, 0)",
            selected_columns=columns,
            where_clauses=["lower(coalesce(t.region::text, '')) = %s"],
            sort_key="actual",
            sort_dir="desc",
        )
        self.assertIn("limit %s offset %s", details_sql.lower())
        self.assertIn("sum(metric_value)", summary_sql.lower())

    def test_dashboard_month_metric_map_includes_march_actual_and_variance(self) -> None:
        config = _source_configs(month="Mar")["dashboard"]
        self.assertIn("actual_mar", config.metric_fields)
        self.assertIn("variance_mar", config.metric_fields)
        self.assertIn("mar_act", config.metric_fields["actual_mar"])
        self.assertIn("mar_var", config.metric_fields["variance_mar"])


if __name__ == "__main__":
    unittest.main()
