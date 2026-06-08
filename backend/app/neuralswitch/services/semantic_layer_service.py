from __future__ import annotations


class SemanticLayerService:
    _metric_aliases = {
        "mrr": "mrr",
        "budget": "budget",
        "forecast": "forecast",
        "actual": "actual_revenue",
        "revenue": "revenue",
    }
    _dimension_aliases = {
        "region": "region",
        "geo": "geo_head",
        "geo head": "geo_head",
        "bdm": "bdm",
        "practice": "practice_head",
        "practice head": "practice_head",
        "entity": "entity",
    }

    def resolve_metric(self, question: str) -> str:
        text = question.lower()
        for alias, metric in self._metric_aliases.items():
            if alias in text:
                return metric
        return "revenue"

    def resolve_dimensions(self, question: str) -> list[str]:
        text = question.lower()
        dimensions: list[str] = []
        for alias, dimension in self._dimension_aliases.items():
            if alias in text and dimension not in dimensions:
                dimensions.append(dimension)
        return dimensions
