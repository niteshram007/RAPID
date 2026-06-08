from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class NeuralSwitchIntent:
    primary_intent: str
    requires_database: bool = False
    requires_forex: bool = False
    requires_document_analysis: bool = False
    requires_followup_context: bool = False
    confidence: str = "medium"


_UNSAFE_PATTERN = re.compile(
    r"\b(delete|drop|truncate|alter|create|insert|update|grant|revoke|dump|exfiltrate)\b",
    re.IGNORECASE,
)


def classify_intent(message: str, previous_user_message: str | None = None) -> NeuralSwitchIntent:
    text = str(message or "").strip().lower()
    previous = str(previous_user_message or "").strip()

    if _UNSAFE_PATTERN.search(text):
        return NeuralSwitchIntent("unsupported_or_unsafe", confidence="high")

    if previous and re.search(r"\b(what about|only|same|compare that|those|them|it)\b", text):
        return NeuralSwitchIntent(
            "follow_up_question",
            requires_database=True,
            requires_followup_context=True,
            confidence="high",
        )

    if any(token in text for token in ("upload", "xlsx", "excel", "document", "file", "attachment")):
        return NeuralSwitchIntent(
            "document_question",
            requires_document_analysis=True,
            confidence="high",
        )

    if "forex" in text or "currency" in text or "exchange rate" in text:
        return NeuralSwitchIntent(
            "forex_analysis",
            requires_database=True,
            requires_forex=True,
            confidence="high",
        )

    if "forecast" in text:
        return NeuralSwitchIntent("forecast_analysis", requires_database=True, confidence="high")

    if "actual" in text or "revenue" in text or "mrr" in text:
        return NeuralSwitchIntent(
            "actual_revenue_analysis",
            requires_database=True,
            confidence="high" if "actual" in text else "medium",
        )

    if "budget" in text or "kra" in text or "kpi" in text:
        return NeuralSwitchIntent("budget_analysis", requires_database=True, confidence="high")

    if any(token in text for token in ("trend", "variance", "growth", "compare", "show")):
        return NeuralSwitchIntent("trend_analysis", requires_database=True)

    return NeuralSwitchIntent("general_question", confidence="low")
