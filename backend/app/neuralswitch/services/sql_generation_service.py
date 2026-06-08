from __future__ import annotations

import re

from .contracts import GeneratedSqlPlan
from .schema_service import SchemaService
from .semantic_layer_service import SemanticLayerService


class SqlGenerationService:
    def __init__(
        self,
        semantic_layer: SemanticLayerService | None = None,
        schema_service: SchemaService | None = None,
    ) -> None:
        self.semantic_layer = semantic_layer or SemanticLayerService()
        self.schema_service = schema_service or SchemaService()

    def parse_question(self, question: str) -> GeneratedSqlPlan:
        text = str(question or "")
        metric = self.semantic_layer.resolve_metric(text)
        dimensions = self.semantic_layer.resolve_dimensions(text)
        time_period_label = self._time_period_label(text)
        select_columns = ["period_start", "metric_value"]
        group_columns = ["period_start"]
        for dimension in dimensions:
            select_columns.insert(-1, dimension)
            group_columns.append(dimension)
        sql = (
            f"SELECT {', '.join(select_columns)} FROM trend_summary "
            "WHERE metric_name = :metric_name "
            f"ORDER BY {', '.join(group_columns)}"
        )
        return GeneratedSqlPlan(
            sql=sql,
            params=[{"metric_name": metric}],
            metric_name=metric,
            table_name="trend_summary",
            dimensions=dimensions,
            intent="direct_kpi_lookup" if not dimensions else "trend_analysis",
            time_period_label=time_period_label,
        )

    def _time_period_label(self, question: str) -> str:
        text = question.lower()
        match = re.search(r"\blast\s+(\d+)\s+([a-z]+)\b", text)
        if match:
            return f"last {match.group(1)} {match.group(2)}"
        if "this month" in text:
            return "this month"
        if "last month" in text:
            return "last month"
        if "fy" in text:
            return "financial year"
        return "latest"
