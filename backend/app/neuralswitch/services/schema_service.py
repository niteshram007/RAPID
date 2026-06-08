from __future__ import annotations


class SchemaService:
    def trend_summary_columns(self) -> list[str]:
        return [
            "period_start",
            "metric_name",
            "metric_value",
            "region",
            "bdm",
            "practice_head",
            "geo_head",
            "entity",
            "financial_year",
        ]
