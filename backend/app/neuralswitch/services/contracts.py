from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any


@dataclass(frozen=True)
class GeneratedSqlPlan:
    sql: str
    params: list[Any] = field(default_factory=list)
    metric_name: str = "revenue"
    table_name: str = "trend_summary"
    dimensions: list[str] = field(default_factory=list)
    intent: str = "sql_request"
    time_period_label: str = "latest"

    def with_sql(self, sql: str) -> "GeneratedSqlPlan":
        return replace(self, sql=sql)


@dataclass(frozen=True)
class AgentResult:
    answer: str
    intent: str
    confidence: str = "medium"
    assumptions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    data_sources: list[str] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    tables: list[dict[str, Any]] = field(default_factory=list)
    charts: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
