from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

GENERAL_LLM = "general_llm"
FACTUAL_QA = "factual_qa"
WEB_SEARCH = "web_search"
RAG_DOCUMENT_SEARCH = "rag_document_search"
RAPID_ANALYTICS = "rapid_analytics"
RAPID_SQL = "rapid_sql"
CALCULATOR = "calculator"
CODE_ASSISTANT = "code_assistant"
EXCEL_GENERATION = "excel_generation"
CSV_GENERATION = "csv_generation"
PDF_REPORT_GENERATION = "pdf_report_generation"
WORD_REPORT_GENERATION = "word_report_generation"
CHART_GENERATION = "chart_generation"
DASHBOARD_GENERATION = "dashboard_generation"
DATA_EXPORT = "data_export"
RAPID_EXPORT = "rapid_export"

RAPID_KEYWORDS = {
    "budget",
    "actual",
    "actuals",
    "forecast",
    "revenue",
    "variance",
    "gap",
    "shortfall",
    "target",
    "achievement",
    "billing",
    "billed hours",
    "billable hours",
    "customer",
    "project",
    "bdm",
    "geo",
    "geo head",
    "practice",
    "practice head",
    "delivery manager",
    "ms",
    "ps",
    "ocn",
    "emp id",
    "employee",
    "resource",
    "mtd",
    "ytd",
    "fy",
    "financial year",
    "q1",
    "q2",
    "q3",
    "q4",
    "month",
    "quarter",
    "strategic account",
    "region",
    "sales region",
    "company",
    "branch",
    "sbu",
    "sub-sbu",
    "eeennn",
}

REALTIME_KEYWORDS = {
    "latest",
    "recent",
    "current",
    "today",
    "now",
    "newly launched",
    "launched",
    "released",
    "announced",
    "new model",
    "new version",
    "this year",
    "this month",
    "currently",
    "news",
    "live",
    "ceo",
}

RAG_KEYWORDS = {
    "this file",
    "this document",
    "uploaded",
    "attachment",
    "according to",
    "pdf",
    "docx",
    "excel",
    "sheet",
    "spreadsheet",
    "csv",
    "xlsx",
    "summarize this",
    "from the document",
    "from the sheet",
}

CALC_KEYWORDS = {
    "calculate",
    "sum",
    "average",
    "percentage",
    "growth",
    "difference",
    "total",
    "ratio",
    "compare",
}

CODE_KEYWORDS = {
    "code",
    "python",
    "javascript",
    "typescript",
    "react",
    "next.js",
    "nextjs",
    "sql query",
    "debug",
    "bug",
    "api",
    "architecture",
    "implementation",
    "function",
    "class",
    "refactor",
}

ARTIFACT_KEYWORDS = {
    "excel": EXCEL_GENERATION,
    "xlsx": EXCEL_GENERATION,
    "spreadsheet": EXCEL_GENERATION,
    "workbook": EXCEL_GENERATION,
    "csv": CSV_GENERATION,
    "pdf": PDF_REPORT_GENERATION,
    "report": PDF_REPORT_GENERATION,
    "word": WORD_REPORT_GENERATION,
    "docx": WORD_REPORT_GENERATION,
    "chart": CHART_GENERATION,
    "graph": CHART_GENERATION,
    "visualization": CHART_GENERATION,
    "dashboard": DASHBOARD_GENERATION,
    "download": DATA_EXPORT,
    "export": DATA_EXPORT,
}

FACTUAL_KEYWORDS = {
    "history",
    "historical",
    "capital of",
    "world war",
    "scientific",
    "define",
    "meaning of",
    "who was",
    "when did",
    "where is",
    "what is",
    "hiroshima",
    "nagasaki",
}


@dataclass(slots=True)
class RouteDecision:
    mode: str
    reasons: list[str] = field(default_factory=list)
    requires_database: bool = False
    requires_vector_context: bool = False
    requires_llm: bool = True
    requires_web: bool = False
    requires_calculator: bool = False


def _contains_any(text: str, keywords: set[str]) -> list[str]:
    return [keyword for keyword in keywords if keyword in text]


def classify_question(question: str, chat_context: dict[str, Any] | None = None) -> RouteDecision:
    chat_context = chat_context or {}
    text = " ".join(str(question or "").lower().split())
    has_attachments = bool(chat_context.get("has_attachments"))

    rapid_matches = _contains_any(text, RAPID_KEYWORDS)
    if rapid_matches:
        return RouteDecision(
            mode=RAPID_ANALYTICS,
            reasons=[f"Matched RAPID keyword: {rapid_matches[0]}"],
            requires_database=True,
            requires_vector_context=True,
        )

    if "sql" in text and any(token in text for token in ("rapid", "revenue", "budget", "actual", "forecast")):
        return RouteDecision(
            mode=RAPID_SQL,
            reasons=["Explicit RAPID SQL request detected"],
            requires_database=True,
            requires_vector_context=True,
        )

    rag_matches = _contains_any(text, RAG_KEYWORDS)
    if has_attachments and rag_matches:
        return RouteDecision(
            mode=RAG_DOCUMENT_SEARCH,
            reasons=[f"Matched document keyword: {rag_matches[0]}"],
            requires_vector_context=True,
        )

    realtime_matches = _contains_any(text, REALTIME_KEYWORDS)
    if realtime_matches:
        return RouteDecision(
            mode=WEB_SEARCH,
            reasons=[f"Matched real-time keyword: {realtime_matches[0]}"],
            requires_web=True,
        )

    code_matches = _contains_any(text, CODE_KEYWORDS)
    if code_matches:
        return RouteDecision(
            mode=CODE_ASSISTANT,
            reasons=[f"Matched code keyword: {code_matches[0]}"],
        )

    artifact_matches = _contains_any(text, set(ARTIFACT_KEYWORDS))
    if artifact_matches:
        matched = artifact_matches[0]
        return RouteDecision(
            mode=ARTIFACT_KEYWORDS.get(matched, DATA_EXPORT),
            reasons=[f"Matched artifact keyword: {matched}"],
            requires_llm=False,
        )

    calc_matches = _contains_any(text, CALC_KEYWORDS)
    if calc_matches:
        return RouteDecision(
            mode=CALCULATOR,
            reasons=[f"Matched calculator keyword: {calc_matches[0]}"],
            requires_calculator=True,
        )

    factual_matches = _contains_any(text, FACTUAL_KEYWORDS)
    if factual_matches or text.startswith(("who is ", "who was ", "what is ", "when did ", "where is ")):
        reasons = [f"Matched factual keyword: {factual_matches[0]}"] if factual_matches else ["Matched factual question pattern"]
        return RouteDecision(
            mode=FACTUAL_QA,
            reasons=reasons,
            requires_web=True,
        )

    return RouteDecision(mode=GENERAL_LLM, reasons=["Fell back to general chat mode"])
