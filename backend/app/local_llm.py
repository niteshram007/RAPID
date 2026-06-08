from __future__ import annotations

import ast
import csv
import io
import json
import math
import re
import time
from pathlib import Path
from statistics import StatisticsError, mean, median, pstdev
from typing import Any, Callable, Dict, List, Sequence, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, UploadFile

from .rag import (
    build_document_id,
    get_rag_store,
    retrieve_rag_chunks,
    semantic_chunk_text,
)
from .mem0_store import add_mem0_memories, search_mem0_memories
from .rapid_revenue_store import get_rapid_revenue_rows
from .store import get_revenue_dashboard_data, get_settings

def search_neural_memories(user_id: str, query: str, limit: int = 5) -> list[str]:
    return []

SYSTEM_PROMPT = """
You are Neural Switch, the company's expert AI assistant.
Answer like a top-tier general assistant: direct, useful, accurate, natural, and confident.

CORE RULES
- Always give the direct answer first.
- Ask clarifying questions only when they are genuinely necessary to avoid a wrong answer.
- Do not offer depth menus or "beginner/intermediate/technical" options unless the user explicitly asks for a structured breakdown.
- Never mention internal system details such as hidden context, knowledge-base labels, dataset names, workbook filenames, row numbers, source references, retrieved chunks, RAG metadata, APIs, databases, or pipelines unless the user explicitly asks for them.
- Never expose raw JSON, HTML, logs, debug traces, or internal context blocks.
- Use any provided context silently and naturally.
- Always summarize and explain data in clear, plain English.
- Be maximally helpful and slightly concise. Do not dump raw data.
- If the evidence is incomplete or uncertain, say what is known, what is likely, and what is not confirmed.
- Never invent figures, facts, sources, or confidence you do not have.

STYLE RULES
- Be friendly, professional, and easy to follow.
- Start with the most important answer first.
- Use short paragraphs and bullet points when they help readability.
- Use bold for key figures when helpful.
- Explain what the numbers mean for the business, not just the raw values.
- For uncertain live data, use soft precision like "around", "approximately", or "as of the latest update".

FINANCE RULES
- When answering about budget, forecast, actuals, or revenue, start with the overall picture first.
- Clearly explain variance versus plan or forecast.
- Mention the biggest contributors only when they materially help the explanation.
- If the user explicitly asks for external context such as market, news, industry, or competitor information, combine that carefully with the internal business context.

CONVERSATION RULES
- End with a helpful follow-up question unless the user asked a very simple factual question.
- If the user asks for coding help, provide clean code blocks and practical steps.

Always produce clean, user-facing language only.
""".strip()

REMOTE_SYSTEM_PROMPT = """
You are Neural Switch, an expert enterprise assistant.
Give a direct, useful answer first in clear plain English.
Be natural, confident, and concise.
Do not mention hidden system details, datasets, files, or RAG metadata unless the user explicitly asks.
For revenue questions, summarize budget, actual, forecast, variance, and business impact.
If information is uncertain, say so clearly and do not invent facts.
""".strip()

SUPPORTED_DOCUMENT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}
MAX_DOCUMENT_SIZE_BYTES = 2_000_000
NUMBER_PATTERN = re.compile(r"[-+]?(?:\d*\.\d+|\d+)")
TOKEN_PATTERN = re.compile(r"[a-z0-9]{2,}")
TOPIC_PATTERN = re.compile(
    r"(?:what is|who is|explain|define|tell me about|about)\s+([a-z0-9][a-z0-9\s\-\+]{1,120})",
    re.IGNORECASE,
)

_BINARY_OPERATORS = {
    ast.Add: lambda left, right: left + right,
    ast.Sub: lambda left, right: left - right,
    ast.Mult: lambda left, right: left * right,
    ast.Div: lambda left, right: left / right,
    ast.Mod: lambda left, right: left % right,
    ast.Pow: lambda left, right: left**right,
    ast.FloorDiv: lambda left, right: left // right,
}
_UNARY_OPERATORS = {
    ast.UAdd: lambda value: value,
    ast.USub: lambda value: -value,
}
_MATH_FUNCTIONS = {
    "abs": abs,
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "ln": math.log,
}
_MATH_CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
}

_RETRIEVAL_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "did",
    "do",
    "does",
    "for",
    "from",
    "hello",
    "hi",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "please",
    "tell",
    "that",
    "the",
    "this",
    "to",
    "was",
    "we",
    "what",
    "when",
    "where",
    "who",
    "why",
    "with",
    "you",
    "your",
}

_DOCUMENT_QUERY_HINTS = (
    "document",
    "documents",
    "doc",
    "docs",
    "file",
    "files",
    "uploaded",
    "upload",
    "report",
    "spreadsheet",
    "worksheet",
    "excel",
    "csv",
    "pdf",
    "from the file",
    "from file",
    "based on document",
    "based on file",
)

_RAPID_ANALYTICS_HINTS = (
    "rapid",
    "revenue",
    "budget",
    "actual",
    "forecast",
    "variance",
    "dashboard",
    "bdm",
    "practice",
    "geography",
    "region",
    "account",
    "customer",
    "project",
    "workbook",
    "financial year",
)

_EXTERNAL_CONTEXT_HINTS = (
    "external",
    "outside",
    "market",
    "industry",
    "competitor",
    "competitors",
    "public",
    "news",
    "web",
    "internet",
    "online",
    "search",
    "look up",
    "lookup",
    "benchmark",
)

_KNOWLEDGE_BASE: Dict[str, Dict[str, str]] = {
    "proton": {
        "summary": (
            "A proton is a positively charged subatomic particle found in the nucleus "
            "of an atom."
        ),
        "beginner": (
            "Beginner view: a proton is one of the tiny building blocks inside atoms. "
            "It has a positive charge. The number of protons tells us which element it is "
            "(for example, hydrogen has 1 proton, carbon has 6)."
        ),
        "intermediate": (
            "Intermediate view: protons sit in atomic nuclei with neutrons and are held "
            "together by the strong nuclear force. In chemistry, proton count (atomic number) "
            "defines element identity and drives electron configuration."
        ),
        "technical": (
            "Technical view: a proton is a baryon composed of three valence quarks "
            "(uud) plus a gluon/sea-quark field contribution. Its rest mass is about "
            "938.27 MeV/c^2 and charge is +1e."
        ),
        "example": (
            "Example: sodium has 11 protons. If a nucleus has 11 protons, the element is "
            "always sodium, even if neutron count changes (different isotopes)."
        ),
    },
    "quantum physics": {
        "summary": (
            "Quantum physics describes how matter and energy behave at atomic and subatomic scales."
        ),
        "beginner": (
            "Beginner view: very tiny things (like electrons) do not behave like everyday objects. "
            "They can act like both particles and waves, and outcomes are probabilistic."
        ),
        "intermediate": (
            "Intermediate view: key ideas include quantization, wave functions, superposition, "
            "measurement probabilities, and uncertainty relations. These explain atomic spectra and bonding."
        ),
        "technical": (
            "Technical view: states evolve via the Schrodinger equation, observables are operators "
            "on Hilbert space, and outcomes are sampled by Born-rule probabilities."
        ),
        "example": (
            "Example: transistors in modern chips rely on quantum behavior of electrons in semiconductors."
        ),
    },
    "cloud computing": {
        "summary": "Cloud computing is delivering compute, storage, and software over the internet.",
        "beginner": (
            "Beginner view: instead of buying your own servers, you rent computing resources online "
            "and pay for what you use."
        ),
        "intermediate": (
            "Intermediate view: it includes IaaS, PaaS, and SaaS models with elastic scaling, "
            "automated deployment, and managed infrastructure."
        ),
        "technical": (
            "Technical view: cloud platforms provide virtualized compute, object/block storage, "
            "managed databases, networking, IAM, and observability services through APIs."
        ),
        "example": (
            "Example: an analytics app can run on cloud VMs, store files in object storage, "
            "and scale automatically during month-end spikes."
        ),
    },
    "weather": {
        "summary": (
            "Weather is the condition of the atmosphere at a particular place and time, such as temperature, rain, wind, humidity, and cloud cover."
        ),
        "beginner": (
            "Beginner view: weather is what the sky and air are like outside right now or over the next few days, for example sunny, rainy, windy, hot, or cold."
        ),
        "intermediate": (
            "Intermediate view: weather is shaped by changes in temperature, air pressure, moisture, and wind patterns in the atmosphere."
        ),
        "technical": (
            "Technical view: weather is the short-term state of the troposphere driven by atmospheric dynamics, thermodynamics, moisture transport, and pressure systems."
        ),
        "example": (
            "Example: if a forecast says heavy rain and strong winds tomorrow, that is a weather prediction."
        ),
    },
    "neural networks": {
        "summary": (
            "Neural networks are machine-learning models inspired by the brain, built from layers of connected units that learn patterns from data."
        ),
        "beginner": (
            "Beginner view: a neural network learns by looking at many examples. It adjusts internal weights so it can map inputs to outputs "
            "(for example, image pixels to labels like cat or dog)."
        ),
        "intermediate": (
            "Intermediate view: data flows through input, hidden, and output layers. During training, backpropagation and gradient descent "
            "update weights to reduce prediction error."
        ),
        "technical": (
            "Technical view: a neural network composes affine transformations and nonlinear activations. Parameters are optimized by stochastic "
            "gradient-based methods over a loss function, with regularization to improve generalization."
        ),
        "example": (
            "Example: in email spam detection, a neural network learns token patterns and context signals, then predicts whether a new message is spam."
        ),
    },
    "neural science": {
        "summary": (
            "Neural science (neuroscience) studies how the brain and nervous system process information, drive behavior, and support thought, emotion, and memory."
        ),
        "beginner": (
            "Beginner view: neural science explains how nerve cells (neurons) send signals and how brain regions work together to help us sense, learn, remember, and decide."
        ),
        "intermediate": (
            "Intermediate view: it combines cellular signaling, neural circuits, and cognition to understand perception, attention, learning, memory, language, and behavior."
        ),
        "technical": (
            "Technical view: neural science spans molecular neurobiology, synaptic transmission, plasticity, systems neuroscience, computational modeling, and brain-behavior mapping."
        ),
        "example": (
            "Example: when you learn a new skill, repeated practice changes circuit strength (neuroplasticity), improving accuracy and speed over time."
        ),
    },
}

_MODEL_CACHE_TTL_SECONDS = 300.0
_MODEL_CACHE: Dict[str, Dict[str, Any]] = {
    "openai": {"expires_at": 0.0, "models": []},
    "ollama": {"expires_at": 0.0, "models": []},
}

_CURATED_HOLLYWOOD_MOVIES: List[Dict[str, str]] = [
    {
        "title": "The Shawshank Redemption",
        "year": "1994",
        "genre": "Drama",
        "detail": "An emotionally powerful story of resilience, friendship, and hope inside a prison.",
    },
    {
        "title": "The Godfather",
        "year": "1972",
        "genre": "Crime/Drama",
        "detail": "A landmark mafia epic on power, family loyalty, and moral compromise.",
    },
    {
        "title": "The Dark Knight",
        "year": "2008",
        "genre": "Action/Crime",
        "detail": "A tense, character-driven superhero crime film with iconic performances.",
    },
    {
        "title": "Schindler's List",
        "year": "1993",
        "genre": "Historical Drama",
        "detail": "A deeply moving Holocaust drama focused on courage and humanity under terror.",
    },
    {
        "title": "12 Angry Men",
        "year": "1957",
        "genre": "Courtroom Drama",
        "detail": "A masterclass in writing and tension, built almost entirely through dialogue.",
    },
    {
        "title": "Pulp Fiction",
        "year": "1994",
        "genre": "Crime",
        "detail": "A nonlinear cult classic known for unforgettable characters and sharp dialogue.",
    },
    {
        "title": "Inception",
        "year": "2010",
        "genre": "Sci-fi/Thriller",
        "detail": "A layered, high-concept thriller exploring dreams, memory, and guilt.",
    },
    {
        "title": "Interstellar",
        "year": "2014",
        "genre": "Sci-fi/Drama",
        "detail": "A visually epic space drama blending science with emotional family stakes.",
    },
    {
        "title": "The Lord of the Rings: The Return of the King",
        "year": "2003",
        "genre": "Fantasy/Adventure",
        "detail": "A large-scale fantasy finale celebrated for emotional payoff and craft.",
    },
    {
        "title": "Fight Club",
        "year": "1999",
        "genre": "Psychological Drama",
        "detail": "A provocative cult film that critiques identity, consumerism, and masculinity.",
    },
]

_CURATED_STUDENT_LAPTOPS: List[Dict[str, str]] = [
    {
        "name": "MacBook Air 13-inch (M3/M4)",
        "fit": "best overall",
        "detail": "Excellent battery life, strong performance, and a lightweight build for daily classes.",
    },
    {
        "name": "ASUS Zenbook 14 OLED",
        "fit": "best Windows balance",
        "detail": "Portable, premium display, and strong value for students who want a slim Windows laptop.",
    },
    {
        "name": "Dell XPS 13",
        "fit": "best premium ultrabook",
        "detail": "Compact design with top-tier build quality and great portability.",
    },
    {
        "name": "Lenovo Yoga Slim 7 / 7i",
        "fit": "best productivity value",
        "detail": "Reliable keyboard, good battery backup, and solid performance for assignments and coding.",
    },
    {
        "name": "Acer Swift Go 14",
        "fit": "best budget-friendly pick",
        "detail": "A practical student option when you want strong specs without overspending.",
    },
]

_CURATED_MICHAEL_JACKSON_SONGS: List[Dict[str, str]] = [
    {
        "title": "Billie Jean",
        "detail": "Probably his most iconic song, driven by an unforgettable bassline and vocal delivery.",
    },
    {
        "title": "Thriller",
        "detail": "A defining pop landmark with cinematic production and huge replay value.",
    },
    {
        "title": "Beat It",
        "detail": "One of his strongest crossover hits, blending pop energy with rock edge.",
    },
    {
        "title": "Smooth Criminal",
        "detail": "Sharp, stylish, and instantly recognizable from the first seconds.",
    },
    {
        "title": "Man in the Mirror",
        "detail": "One of his most emotional performances with a powerful social message.",
    },
    {
        "title": "Rock With You",
        "detail": "A timeless groove track that still feels effortless and modern.",
    },
]

_RECOMMENDATION_KEYWORDS = (
    "best",
    "top",
    "recommend",
    "must watch",
    "must-watch",
    "what should i watch",
    "what should i listen",
    "movie",
    "songs",
    "movies",
    "film",
    "films",
    "books",
    "albums",
    "shows",
    "products",
    "options",
)

_NEWS_KEYWORDS = (
    "latest",
    "news",
    "today",
    "current",
    "happening now",
    "live",
    "war",
    "breaking",
    "recent update",
)

_ANALYST_KEYWORDS = (
    "stock",
    "share price",
    "market cap",
    "revenue",
    "earnings",
    "finance",
    "financial",
    "profit",
    "metrics",
    "performance",
)

_ENGINEER_KEYWORDS = (
    "build",
    "code",
    "bug",
    "api",
    "backend",
    "frontend",
    "system design",
    "architecture",
    "fastapi",
    "next.js",
    "react",
    "llm",
)

_ADVISOR_KEYWORDS = (
    "career",
    "startup",
    "should i",
    "roadmap",
    "plan",
    "strategy",
    "prioritize",
    "decision",
)

_CONCISE_KEYWORDS = (
    "quick",
    "brief",
    "short answer",
    "in short",
    "one line",
    "just answer",
)

_ENTERTAINMENT_LOOKUP_KEYWORDS = (
    "movie",
    "film",
    "series",
    "show",
    "cast",
    "release date",
    "trailer",
    "box office",
    "director",
    "ott",
)

_INTERNAL_LEAK_PATTERNS = (
    "playwright",
    "scraping",
    "scraper",
    "api returned",
    "according to the tool",
    "based on search results",
    "based on the provided context",
    "from web results",
    "i searched",
    "i fetched",
    "pipeline",
    "local rag mode",
    "retrieved context",
    "knowledge base",
    "source workbook",
    "row numbers",
    "rag metadata",
    "contextual answer",
    "local document analysis summary",
    "local statistics summary",
)

_STYLE_DIRECTIVE_PATTERN = re.compile(
    r"(?i)\b(?:in|like)\s+(?:chatgpt|grok)\s+style\b|"
    r"\b(?:chatgpt|grok)\s+style\b|"
    r"\b(?:chatgpt|grok)\s+mode\b"
)


def _dedupe(sequence: Sequence[str]) -> List[str]:
    output: List[str] = []
    seen: set[str] = set()
    for value in sequence:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        output.append(normalized)
        seen.add(normalized)
    return output


def _format_number(value: float) -> str:
    if not math.isfinite(value):
        return str(value)

    if abs(value - round(value)) < 1e-10:
        return str(int(round(value)))

    return f"{value:.6f}".rstrip("0").rstrip(".")


def _extract_numbers(text: str) -> List[float]:
    values: List[float] = []

    for token in NUMBER_PATTERN.findall(text):
        try:
            values.append(float(token))
        except ValueError:
            continue

    return values


def _build_stats_summary(values: List[float]) -> str:
    if not values:
        return "No numeric values detected."

    parts = [
        f"count={len(values)}",
        f"sum={_format_number(sum(values))}",
        f"mean={_format_number(mean(values))}",
        f"median={_format_number(median(values))}",
        f"min={_format_number(min(values))}",
        f"max={_format_number(max(values))}",
    ]

    if len(values) > 1:
        try:
            parts.append(f"std_dev={_format_number(pstdev(values))}")
        except StatisticsError:
            pass

    return ", ".join(parts)


def _build_descriptive_stats_response(values: List[float]) -> str:
    if not values:
        return "I couldn't find any numbers to analyze."

    lines = [
        "Here's the summary for those values:",
        f"- Average: **{_format_number(mean(values))}**",
        f"- Median: **{_format_number(median(values))}**",
        f"- Range: **{_format_number(min(values))}** to **{_format_number(max(values))}**",
        f"- Total: **{_format_number(sum(values))}** across **{len(values)}** values",
    ]

    if len(values) > 1:
        try:
            lines.append(f"- Standard deviation: **{_format_number(pstdev(values))}**")
        except StatisticsError:
            pass

    lines.append("")
    lines.append("If you'd like, I can also break this into trend, spread, or outlier insights.")
    return "\n".join(lines)


def _ensure_supported_result(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("Result is not finite.")

    if abs(value) > 1e15:
        raise ValueError("Result is outside the supported range.")

    return value


def _evaluate_math_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)

    if isinstance(node, ast.Name) and node.id in _MATH_CONSTANTS:
        return float(_MATH_CONSTANTS[node.id])

    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPERATORS:
        value = _evaluate_math_node(node.operand)
        return _ensure_supported_result(_UNARY_OPERATORS[type(node.op)](value))

    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPERATORS:
        left = _evaluate_math_node(node.left)
        right = _evaluate_math_node(node.right)
        return _ensure_supported_result(_BINARY_OPERATORS[type(node.op)](left, right))

    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        function_name = node.func.id
        if function_name not in _MATH_FUNCTIONS or node.keywords:
            raise ValueError("Unsupported function.")

        arguments = [_evaluate_math_node(argument) for argument in node.args]
        if function_name in {"log", "ln"} and len(arguments) not in {1, 2}:
            raise ValueError("log accepts one or two arguments.")
        if function_name not in {"log", "ln"} and len(arguments) != 1:
            raise ValueError(f"{function_name} accepts exactly one argument.")

        result = _MATH_FUNCTIONS[function_name](*arguments)
        return _ensure_supported_result(float(result))

    raise ValueError("Unsupported expression.")


def _extract_math_expression(prompt: str) -> str | None:
    stripped = prompt.strip()
    lower = stripped.lower()

    for prefix in ("calculate", "compute", "evaluate", "solve", "what is"):
        if lower.startswith(prefix):
            candidate = stripped[len(prefix) :].strip(" :?")
            if candidate:
                return candidate.replace("^", "**")

    if re.fullmatch(r"[0-9\.\+\-\*\/%\(\)\^,\sA-Za-z]+", stripped):
        return stripped.rstrip("?").replace("^", "**")

    return None


def _compute_math_response(prompt: str) -> str | None:
    expression = _extract_math_expression(prompt)
    if not expression:
        return None

    try:
        parsed = ast.parse(expression, mode="eval")
        result = _evaluate_math_node(parsed.body)
    except (SyntaxError, ValueError, ZeroDivisionError):
        return None

    return f"The result is **{_format_number(result)}**."


def _tokenize(text: str) -> List[str]:
    return [
        token
        for token in TOKEN_PATTERN.findall(text.lower())
        if token not in _RETRIEVAL_STOPWORDS
    ]


def _is_document_context_query(query: str) -> bool:
    normalized = re.sub(r"\s+", " ", query.strip().lower())
    if not normalized:
        return False

    return any(hint in normalized for hint in _DOCUMENT_QUERY_HINTS)


def _extract_retrieval_query(messages: List[Dict[str, Any]]) -> str:
    user_messages = [
        _strip_style_directives(str(message.get("content", "")).strip())
        for message in messages
        if str(message.get("role", "")).lower() == "user"
        and str(message.get("content", "")).strip()
    ]
    if not user_messages:
        return ""

    latest = user_messages[-1].strip()
    if latest and not _is_followup_only_query(latest):
        return latest

    for candidate in reversed(user_messages[:-1]):
        cleaned_candidate = candidate.strip()
        if cleaned_candidate and not _is_followup_only_query(cleaned_candidate):
            return cleaned_candidate

    return latest


def _chunk_text(
    text: str,
    max_chars: int = 900,
    overlap: int = 150,
    max_chunks: int = 40,
) -> List[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    chunks: List[str] = []
    start = 0
    text_length = len(normalized)
    safe_overlap = min(max(overlap, 0), max_chars - 50)

    while start < text_length and len(chunks) < max_chunks:
        end = min(text_length, start + max_chars)
        slice_text = normalized[start:end]

        if end < text_length:
            boundary = slice_text.rfind(" ")
            if boundary > int(max_chars * 0.65):
                slice_text = slice_text[:boundary]
                end = start + boundary

        cleaned_slice = slice_text.strip()
        if cleaned_slice:
            chunks.append(cleaned_slice)

        if end >= text_length:
            break
        start = max(0, end - safe_overlap)

    return chunks


def _build_attachment_lines(attachments: List[Dict[str, Any]]) -> List[str]:
    lines: List[str] = []

    for attachment in attachments[:16]:
        name = str(attachment.get("name") or "Document").strip()
        summary = str(attachment.get("summary") or "").strip()
        if summary:
            lines.append(f"- {name}: {summary}")
        else:
            lines.append(f"- {name}")

    return lines


def _collect_attachment_chunks(
    attachments: List[Dict[str, Any]],
) -> List[Tuple[str, str]]:
    collected: List[Tuple[str, str]] = []

    for attachment in attachments[:24]:
        name = str(attachment.get("name") or "Document").strip()
        chunks = attachment.get("chunks")

        if isinstance(chunks, list):
            for chunk in chunks[:24]:
                chunk_text = str(chunk).strip()
                if chunk_text:
                    collected.append((name, chunk_text))

        summary = str(attachment.get("summary") or "").strip()
        if summary:
            collected.append((name, summary))

    return collected


def _format_currency_short(value: Any) -> str:
    try:
        numeric = float(value or 0.0)
    except Exception:
        return "0"

    absolute = abs(numeric)
    if absolute >= 1_000_000_000:
        suffix_value = numeric / 1_000_000_000
        suffix = "B"
    elif absolute >= 1_000_000:
        suffix_value = numeric / 1_000_000
        suffix = "M"
    elif absolute >= 1_000:
        suffix_value = numeric / 1_000
        suffix = "K"
    else:
        return _format_number(numeric)

    return f"{suffix_value:.2f}".rstrip("0").rstrip(".") + suffix


def _format_signed_currency_short(value: Any) -> str:
    try:
        numeric = float(value or 0.0)
    except Exception:
        return "0"

    if numeric > 0:
        return f"+{_format_currency_short(numeric)}"
    if numeric < 0:
        return f"-{_format_currency_short(abs(numeric))}"
    return "0"


def _infer_breakdown_dimension_from_query(query: str) -> str:
    lower = query.lower()
    if any(token in lower for token in ("geography", "geographies", "region", "regions", "geo")):
        return "region"
    if any(token in lower for token in ("practice", "practices")):
        return "practice_head"
    if any(token in lower for token in ("bdm", "business development manager")):
        return "bdm"
    if any(token in lower for token in ("account", "accounts", "customer", "client")):
        return "customer_name"
    return "region"


def _infer_rapid_primary_metric(query: str) -> str:
    lower = query.lower()
    if "budget" in lower:
        return "budget"
    if any(token in lower for token in ("actual", "actuals", "revenue")):
        return "actual"
    if "forecast" in lower:
        return "forecast"
    if any(token in lower for token in ("gap", "variance", "shortfall")):
        return "variance"
    return "actual"


def _budget_dimension_field(breakdown_dimension: str) -> tuple[str, str]:
    if breakdown_dimension == "practice_head":
        return "Practice Head", "practice"
    if breakdown_dimension == "bdm":
        return "BDM", "BDM"
    if breakdown_dimension == "customer_name":
        return "Customer Name", "customer"
    return "ROW/US", "geography"


def _budget_row_matches_filters(item: dict[str, Any], matched_filters: dict[str, Any]) -> bool:
    filter_map = {
        "bdms": "BDM",
        "practices": "Practice Head",
        "geographies": "ROW/US",
        "accounts": "Customer Name",
    }
    for filter_key, row_key in filter_map.items():
        values = matched_filters.get(filter_key) or []
        normalized_values = {str(value).strip().lower() for value in values if str(value).strip()}
        if not normalized_values:
            continue
        row_value = str(item.get(row_key) or "").strip().lower()
        if row_value not in normalized_values:
            return False
    return True


def _match_budget_row_filters_from_query(
    query: str,
    rows: Sequence[dict[str, Any]],
) -> dict[str, list[str]]:
    lower = query.lower()
    field_map = {
        "bdms": "BDM",
        "practices": "Practice Head",
        "geographies": "ROW/US",
        "accounts": "Customer Name",
    }
    matched: dict[str, list[str]] = {}
    for filter_key, row_key in field_map.items():
        options = sorted(
            {str(row.get(row_key) or "").strip() for row in rows if str(row.get(row_key) or "").strip()},
            key=len,
            reverse=True,
        )
        values: list[str] = []
        for option in options:
            normalized = option.lower()
            if re.search(rf"(?<![a-z0-9]){re.escape(normalized)}(?![a-z0-9])", lower):
                values.append(option)
                continue
            tokens = [token for token in re.split(r"[^a-z0-9]+", normalized) if len(token) >= 3]
            if any(re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", lower) for token in tokens if len(token) >= 4):
                values.append(option)
                continue
            if tokens and all(re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", lower) for token in tokens):
                values.append(option)
        if values:
            matched[filter_key] = values[:3]
    return matched


def _row_fy_budget_value(item: dict[str, Any]) -> float:
    try:
        value = float(item.get("FY") or 0.0)
    except Exception:
        value = 0.0
    if value:
        return value

    total = 0.0
    for month in (
        "Apr 2026",
        "May 2026",
        "Jun 2026",
        "Jul 2026",
        "Aug 2026",
        "Sep 2026",
        "Oct 2026",
        "Nov 2026",
        "Dec 2026",
        "Jan 2027",
        "Feb 2027",
        "Mar 2027",
    ):
        try:
            total += float(item.get(month) or 0.0)
        except Exception:
            continue
    return total


def _build_budget_workbook_response(
    query: str,
    breakdown_dimension: str,
    matched_filters: dict[str, Any],
) -> str:
    lower = query.lower()
    if "budget" not in lower:
        return ""
    if any(token in lower for token in ("actual", "actuals", "forecast", "variance", "gap", " vs ", "versus", "compare")):
        return ""

    rapid_rows = get_rapid_revenue_rows({})
    if not rapid_rows:
        return ""

    inferred_filters = _match_budget_row_filters_from_query(
        query,
        [item for item in rapid_rows if isinstance(item, dict)],
    )
    matched_filters = {**inferred_filters, **matched_filters}
    if matched_filters.get("bdms"):
        breakdown_dimension = "bdm"
    elif matched_filters.get("practices"):
        breakdown_dimension = "practice_head"
    elif matched_filters.get("accounts"):
        breakdown_dimension = "customer_name"
    dimension_field, dimension_label = _budget_dimension_field(breakdown_dimension)
    totals: Dict[str, float] = {}
    project_counts: Dict[str, set[str]] = {}
    customer_counts: Dict[str, set[str]] = {}
    matching_items: List[dict[str, Any]] = []
    for item in rapid_rows:
        if not isinstance(item, dict) or not _budget_row_matches_filters(item, matched_filters):
            continue
        matching_items.append(item)
        label = str(item.get(dimension_field) or "Unassigned").strip() or "Unassigned"
        if breakdown_dimension == "bdm" and label.lower() == "unassigned":
            continue
        value = _row_fy_budget_value(item)
        totals[label] = totals.get(label, 0.0) + value
        project = str(item.get("Project Name") or "").strip()
        customer = str(item.get("Customer Name") or "").strip()
        if project:
            project_counts.setdefault(label, set()).add(project)
        if customer:
            customer_counts.setdefault(label, set()).add(customer)

    if not totals:
        return ""

    wants_lowest = any(token in lower for token in ("lowest", "least", "smallest", "bottom"))
    ranked = sorted(totals.items(), key=lambda pair: pair[1], reverse=not wants_lowest)
    top_label, top_value = ranked[0]
    scoped_bdm = matched_filters.get("bdms") or []
    scoped_practice = matched_filters.get("practices") or []
    scoped_account = matched_filters.get("accounts") or []
    total_budget = sum(totals.values())

    if scoped_bdm:
        heading = f"Budget profile for BDM {scoped_bdm[0]}:"
    elif scoped_practice:
        heading = f"Budget profile for Practice Head {scoped_practice[0]}:"
    elif scoped_account:
        heading = f"Budget profile for Customer {scoped_account[0]}:"
    else:
        direction = "lowest" if wants_lowest else "highest"
        heading = f"The {direction} {dimension_label} by FY budget is **{top_label}** at **{_format_currency_short(top_value)}**."

    lines = [
        heading,
        f"- Total FY budget in scope: **{_format_currency_short(total_budget)}**",
    ]
    if scoped_bdm or scoped_practice or scoped_account:
        lines.append(f"- Projects in scope: **{len(project_counts.get(top_label, set()))}**")
        lines.append(f"- Customers in scope: **{len(customer_counts.get(top_label, set()))}**")

    lines.append("")
    lines.append(f"Top {dimension_label} budget values:")
    for label, value in ranked[:5]:
        extras: list[str] = []
        project_count = len(project_counts.get(label, set()))
        customer_count = len(customer_counts.get(label, set()))
        if customer_count:
            extras.append(f"{customer_count} customers")
        if project_count:
            extras.append(f"{project_count} projects")
        suffix = f" ({', '.join(extras)})" if extras else ""
        lines.append(f"- {label}: **{_format_currency_short(value)}**{suffix}")

    if scoped_bdm or scoped_practice or scoped_account:
        def rollup_by(field: str) -> list[tuple[str, float]]:
            grouped: Dict[str, float] = {}
            for row in matching_items:
                label = str(row.get(field) or "Unassigned").strip() or "Unassigned"
                grouped[label] = grouped.get(label, 0.0) + _row_fy_budget_value(row)
            return sorted(grouped.items(), key=lambda pair: pair[1], reverse=True)

        customer_split = rollup_by("Customer Name")[:6]
        vertical_split = rollup_by("Vertical")[:6]
        if customer_split:
            lines.append("")
            lines.append("| Customer | Budget |")
            lines.append("|---|---:|")
            for label, value in customer_split:
                lines.append(f"| {label} | {_format_currency_short(value)} |")
        if vertical_split:
            lines.append("")
            lines.append("| Vertical | Budget |")
            lines.append("|---|---:|")
            for label, value in vertical_split:
                lines.append(f"| {label} | {_format_currency_short(value)} |")

    lines.append("")
    lines.append("This is calculated from the active RAPID budget workbook, grouped deterministically before the answer is written.")
    return "\n".join(lines)


def _build_rapid_comparison_response(query: str) -> str:
    if not _is_rapid_analytics_query(query):
        return ""

    breakdown_dimension = _infer_breakdown_dimension_from_query(query)
    early_budget_response = _build_budget_workbook_response(query, breakdown_dimension, {})
    if early_budget_response:
        return early_budget_response

    settings = get_settings()
    base_filters: Dict[str, Any] = {}
    default_year = str(settings.get("defaultFinancialYear", "")).strip()
    if default_year:
        base_filters["financialYears"] = [default_year]

    base_dashboard = get_revenue_dashboard_data(base_filters)
    base_summary = base_dashboard.get("summary", {})
    base_row_count = int(base_summary.get("rowCount") or 0)
    if base_row_count <= 0 and base_filters.get("financialYears"):
        # Default FY can drift from the active upload year. Fall back to
        # current active workbook scope before giving "no data" responses.
        fallback_dashboard = get_revenue_dashboard_data({})
        fallback_summary = fallback_dashboard.get("summary", {})
        fallback_row_count = int(fallback_summary.get("rowCount") or 0)
        if fallback_row_count > 0:
            base_dashboard = fallback_dashboard
            base_filters = {}

    available_filters = base_dashboard.get("filters", {})

    matched_filters: Dict[str, Any] = {"breakdownDimension": breakdown_dimension}
    matched_filters.update(
        _match_dashboard_filters(query, available_filters.get("regions", []), "geographies")
    )
    matched_filters.update(
        _match_dashboard_filters(query, available_filters.get("practiceHeads", []), "practices")
    )
    matched_filters.update(
        _match_dashboard_filters(query, available_filters.get("bdms", []), "bdms")
    )
    matched_filters.update(
        _match_dashboard_filters(query, available_filters.get("accounts", []), "accounts")
    )

    budget_workbook_response = _build_budget_workbook_response(
        query,
        breakdown_dimension,
        matched_filters,
    )
    if budget_workbook_response:
        return budget_workbook_response

    dashboard = get_revenue_dashboard_data({**base_filters, **matched_filters})
    summary = dashboard.get("summary", {})
    row_count = int(summary.get("rowCount") or 0)
    filter_scope_note = ""
    if (
        breakdown_dimension == "bdm"
        and matched_filters.get("practices")
        and not matched_filters.get("bdms")
    ):
        filter_scope_note = (
            f"I found {matched_filters['practices'][0]} as a Practice Head, "
            "so this shows the BDMs under that practice scope."
        )

    # If token-to-filter mapping got too narrow, fall back to the active workbook scope.
    if row_count <= 0 and len(matched_filters) > 1:
        fallback_summary = base_dashboard.get("summary", {})
        fallback_count = int(fallback_summary.get("rowCount") or 0)
        if fallback_count > 0:
            dashboard = base_dashboard
            summary = fallback_summary
            row_count = fallback_count
            filter_scope_note = (
                "I used the active workbook scope because the requested filter terms "
                "didn't map cleanly."
            )

    if row_count <= 0:
        rapid_rows = get_rapid_revenue_rows({})
        if rapid_rows:
            dimension_field = {
                "region": "ROW/US",
                "practice_head": "Practice Head",
                "bdm": "BDM",
                "customer_name": "Customer Name",
            }.get(breakdown_dimension, "ROW/US")
            dimension_label = (
                "geography"
                if breakdown_dimension == "region"
                else "practice"
                if breakdown_dimension == "practice_head"
                else "BDM"
                if breakdown_dimension == "bdm"
                else "account"
            )

            totals: Dict[str, float] = {}
            for item in rapid_rows:
                if not isinstance(item, dict):
                    continue
                label = str(item.get(dimension_field) or "Unassigned").strip() or "Unassigned"
                try:
                    value = float(item.get("FY") or 0.0)
                except Exception:
                    value = 0.0
                totals[label] = totals.get(label, 0.0) + value

            if totals:
                ranked = sorted(
                    totals.items(),
                    key=lambda pair: abs(pair[1]),
                    reverse=True,
                )[:5]
                total_fy = sum(totals.values())
                lines = [
                    "I can't compute Actual vs Forecast from the current RAPID workbook because it only has budget-style values.",
                    f"- Total FY available now: **{_format_currency_short(total_fy)}**",
                    "",
                    f"Top {dimension_label} values by FY:",
                ]
                lines.extend(
                    f"- {label}: **{_format_currency_short(value)}**"
                    for label, value in ranked
                )
                lines.append("")
                lines.append(
                    "If you upload/activate the performance workbook with Actual and Forecast fields, "
                    "I'll immediately return the biggest variance gaps."
                )
                return "\n".join(lines)

        return (
            "I can't compare actual versus forecast yet because no active revenue rows are loaded "
            "for the current RAPID filters.\n\n"
            "Please upload or activate a workbook in Admin, then I can show the biggest gaps by geography immediately."
        )

    lower_query = query.lower()
    matched_bdms = [str(value).strip() for value in (matched_filters.get("bdms") or []) if str(value).strip()]
    if matched_bdms and any(token in lower_query for token in ("profile", "performance", "details", "summary", "bdm")):
        bdm_name = matched_bdms[0]
        total_budget = float(summary.get("totalBudget") or 0.0)
        total_actual = float(summary.get("totalActual") or 0.0)
        total_forecast = float(summary.get("totalOutlook") or 0.0)
        variance_vs_budget = total_actual - total_budget
        variance_vs_forecast = total_actual - total_forecast
        lines = [
            f"Here is the RAPID profile for BDM **{bdm_name}**.",
            f"- Budget: **{_format_currency_short(total_budget)}**",
            f"- Actual: **{_format_currency_short(total_actual)}**",
            f"- Forecast: **{_format_currency_short(total_forecast)}**",
            f"- Actual vs Budget: **{_format_signed_currency_short(variance_vs_budget)}**",
            f"- Actual vs Forecast: **{_format_signed_currency_short(variance_vs_forecast)}**",
        ]
        top_customers = dashboard.get("topCustomers", [])[:5]
        if top_customers:
            lines.append("")
            lines.append("Top customer contributors:")
            for row in top_customers:
                lines.append(
                    f"- {row.get('label') or 'Unassigned'}: budget {_format_currency_short(row.get('budget'))}, "
                    f"actual {_format_currency_short(row.get('actual'))}, forecast {_format_currency_short(row.get('outlook'))}"
                )
        lines.append("")
        lines.append("These numbers are calculated from RAPID PostgreSQL first, then summarized in plain language.")
        return "\n".join(lines)

    total_actual = float(summary.get("totalActual") or 0.0)
    total_forecast = float(summary.get("totalOutlook") or 0.0)
    total_gap = total_actual - total_forecast
    overall_tone = (
        "ahead of forecast"
        if total_gap > 0
        else "behind forecast"
        if total_gap < 0
        else "exactly on forecast"
    )

    performer_rows = dashboard.get("performers", {}).get("rows", [])
    rows: List[Dict[str, Any]] = []
    for item in performer_rows:
        if not isinstance(item, dict):
            continue
        actual = float(item.get("actual") or 0.0)
        forecast = float(item.get("forecast") or 0.0)
        gap = actual - forecast
        rows.append(
            {
                "label": str(item.get("label") or "Unassigned"),
                "actual": actual,
                "forecast": forecast,
                "gap": gap,
            }
        )

    rows = sorted(rows, key=lambda row: abs(row["gap"]), reverse=True)
    top_rows = rows[:5]

    dimension_label = (
        "geography"
        if breakdown_dimension == "region"
        else "practice"
        if breakdown_dimension == "practice_head"
        else "BDM"
        if breakdown_dimension == "bdm"
        else "account"
    )

    lines = [
        f"Here's the actual versus forecast comparison by {dimension_label}.",
        f"- Total actual: **{_format_currency_short(total_actual)}**",
        f"- Total forecast: **{_format_currency_short(total_forecast)}**",
        f"- Gap (actual - forecast): **{_format_signed_currency_short(total_gap)}** ({overall_tone})",
    ]
    if filter_scope_note:
        lines.append(f"- {filter_scope_note}")

    if top_rows:
        lines.append("")
        lines.append(f"Biggest {dimension_label} gaps:")
        for row in top_rows:
            tone = "above forecast" if row["gap"] > 0 else "below forecast" if row["gap"] < 0 else "on forecast"
            lines.append(
                f"- {row['label']}: **{_format_signed_currency_short(row['gap'])}** "
                f"({tone}; actual {_format_currency_short(row['actual'])} vs forecast {_format_currency_short(row['forecast'])})"
            )

    return "\n".join(lines)


def _is_rapid_analytics_query(query: str) -> bool:
    lower = query.lower()
    return any(token in lower for token in _RAPID_ANALYTICS_HINTS)


def _wants_explicit_external_context(query: str) -> bool:
    lower = query.lower()
    return any(token in lower for token in _EXTERNAL_CONTEXT_HINTS)


def _derive_external_context_query(query: str) -> str:
    lower = query.lower()
    for marker in ("external", "market", "industry", "competitor", "news", "public", "web"):
        index = lower.find(marker)
        if index >= 0:
            candidate = query[index:].strip(" .?")
            if len(candidate.split()) >= 3:
                return candidate

    return "current market and industry context affecting business revenue performance"


def _match_dashboard_filters(
    query: str,
    options: Sequence[str],
    key: str,
) -> dict[str, list[str]]:
    lower = query.lower()
    word_boundary = re.compile(r"[^a-z0-9]+")

    def option_matches(option_text: str) -> bool:
        normalized = option_text.strip().lower()
        if not normalized:
            return False

        compact = re.sub(r"[^a-z0-9]", "", normalized)
        if not compact:
            return False

        # Avoid accidental matches like `US` inside `versus`.
        boundary_pattern = re.compile(
            rf"(?<![a-z0-9]){re.escape(normalized)}(?![a-z0-9])",
            re.IGNORECASE,
        )
        if boundary_pattern.search(lower):
            return True

        # For multi-word labels, allow token-based matching when key terms are present.
        tokens = [token for token in word_boundary.split(normalized) if token]
        significant_tokens = [token for token in tokens if len(token) >= 3]
        if any(
            re.search(
                rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                lower,
                flags=re.IGNORECASE,
            )
            for token in significant_tokens
            if len(token) >= 4
        ):
            return True
        if len(significant_tokens) >= 2:
            return all(
                re.search(
                    rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])",
                    lower,
                    flags=re.IGNORECASE,
                )
                for token in significant_tokens
            )

        return False

    matches = [
        option
        for option in sorted(
            {str(option).strip() for option in options if str(option).strip()},
            key=len,
            reverse=True,
        )
        if option_matches(option)
    ]
    return {key: matches[:3]} if matches else {}


def _build_dashboard_context_attachment(query: str) -> Dict[str, Any] | None:
    if not _is_rapid_analytics_query(query):
        return None

    settings = get_settings()
    base_filters: Dict[str, Any] = {}
    default_year = str(settings.get("defaultFinancialYear", "")).strip()
    if default_year:
        base_filters["financialYears"] = [default_year]

    dashboard = get_revenue_dashboard_data(base_filters)
    filters = dashboard.get("filters", {})
    matched_filters: Dict[str, Any] = {}
    matched_filters.update(_match_dashboard_filters(query, filters.get("regions", []), "geographies"))
    matched_filters.update(
        _match_dashboard_filters(query, filters.get("practiceHeads", []), "practices")
    )
    matched_filters.update(_match_dashboard_filters(query, filters.get("bdms", []), "bdms"))
    matched_filters.update(_match_dashboard_filters(query, filters.get("accounts", []), "accounts"))

    if matched_filters:
        dashboard = get_revenue_dashboard_data({**base_filters, **matched_filters})

    summary = dashboard.get("summary", {})
    dataset = dashboard.get("dataset", {})
    row_count = int(summary.get("rowCount") or 0)
    if row_count <= 0:
        return None

    lines = [
        (
            "Revenue overview: "
            f"financial year {dataset.get('financialYear') or default_year or 'current'}, "
            f"budget {_format_currency_short(summary.get('totalBudget'))}, "
            f"actual {_format_currency_short(summary.get('totalActual'))}, "
            f"forecast {_format_currency_short(summary.get('totalOutlook'))}, "
            f"variance {_format_currency_short(summary.get('totalVariance'))}."
        )
    ]
    comparison = dashboard.get("comparison", {})
    lines.append(
        (
            f"{comparison.get('label') or 'Budget vs Actual'}: "
            f"current {_format_currency_short(comparison.get('currentValue'))}, "
            f"baseline {_format_currency_short(comparison.get('baselineValue'))}, "
            f"delta {_format_currency_short(comparison.get('delta'))} "
            f"({float(comparison.get('deltaPct') or 0):.1f}%)."
        )
    )

    for highlight in dashboard.get("highlights", [])[:4]:
        lines.append(str(highlight))

    for row in dashboard.get("topRegions", [])[:6]:
        lines.append(
            "Geography "
            f"{row.get('label')}: budget {_format_currency_short(row.get('budget'))}, "
            f"actual {_format_currency_short(row.get('actual'))}, "
            f"forecast {_format_currency_short(row.get('outlook'))}, "
            f"variance {_format_currency_short(row.get('variance'))}."
        )

    for row in dashboard.get("topCustomers", [])[:6]:
        lines.append(
            "Account "
            f"{row.get('label')}: budget {_format_currency_short(row.get('budget'))}, "
            f"actual {_format_currency_short(row.get('actual'))}, "
            f"forecast {_format_currency_short(row.get('outlook'))}, "
            f"variance {_format_currency_short(row.get('variance'))}."
        )

    for row in dashboard.get("performers", {}).get("rows", [])[:10]:
        lines.append(
            "Performer "
            f"{row.get('label')}: geography {row.get('region')}, practice {row.get('practiceHead')}, "
            f"bdm {row.get('bdm')}, account {row.get('account')}, "
            f"actual {_format_currency_short(row.get('actual'))}, "
            f"budget {_format_currency_short(row.get('budget'))}, "
            f"forecast {_format_currency_short(row.get('forecast'))}, "
            f"variance {_format_currency_short(row.get('variance'))}."
        )

    for row in dashboard.get("resourceTable", [])[:10]:
        lines.append(
            "Resource "
            f"{row.get('resourceName')}: account {row.get('customerName')}, project {row.get('projectName')}, "
            f"region {row.get('region')}, practice {row.get('practiceHead')}, "
            f"budget {_format_currency_short(row.get('budget'))}, "
            f"forecast {_format_currency_short(row.get('outlook'))}, "
            f"variance {_format_currency_short(row.get('variance'))}."
        )

    summary_text = (
        f"Revenue analysis context for {dataset.get('financialYear') or default_year or 'current'}."
    )
    chunks = semantic_chunk_text("\n".join(lines), target_chars=760, overlap_chars=140, max_chunks=40)
    document_id = build_document_id("Revenue analysis context", summary_text, chunks)
    return {
        "id": document_id,
        "documentId": document_id,
        "name": "Revenue analysis context",
        "summary": summary_text,
        "chunks": chunks,
    }


def _build_memory_system_context(user_id: str | None, query: str) -> str:
    if not user_id:
        return ""

    memories = search_mem0_memories(user_id, query, limit=6)
    fallback_memories = search_neural_memories(user_id, query, limit=4)
    for item in fallback_memories:
        if item not in memories:
            memories.append(item)

    noisy_markers = (
        "error evaluating expression",
        "traceback",
        "http error",
        "internal server error",
        "json decode error",
        "provider:",
    )
    cleaned_memories = [
        entry
        for entry in memories
        if entry
        and len(entry.strip()) > 2
        and not any(marker in entry.lower() for marker in noisy_markers)
    ]
    memories = cleaned_memories

    if not memories:
        return ""

    lines = [f"{index + 1}. {item}" for index, item in enumerate(memories[:6])]
    return (
        "INTERNAL USER MEMORY (PRIVATE CONTEXT):\n"
        "Use these prior user details only when relevant to improve continuity.\n"
        "Do not mention memory systems or how this context was retrieved.\n\n"
        + "\n".join(lines)
    )


def _build_memory_backed_email_response(
    prompt: str,
    user_id: str | None,
) -> str | None:
    if not user_id or not _is_followup_only_query(prompt):
        return None

    memory_candidates = _dedupe(
        [
            *search_mem0_memories(user_id, "leave request email", limit=4),
            *search_mem0_memories(user_id, prompt, limit=4),
            *search_neural_memories(user_id, "leave request email", limit=4),
            *search_neural_memories(user_id, prompt, limit=4),
        ]
    )
    if not memory_candidates:
        return None

    combined_context = " ".join([*memory_candidates, prompt]).strip()
    lower = combined_context.lower()
    if not (_has_email_request_intent(combined_context) and "leave" in lower):
        return None

    salutation = _extract_email_salutation(combined_context)
    leave_window = _extract_leave_window(combined_context)
    reason = _extract_leave_reason(combined_context)
    return _build_leave_email_draft(salutation, leave_window, reason)


def _build_query_from_messages(messages: List[Dict[str, Any]]) -> str:
    return _extract_retrieval_query(messages)


def _build_retrieval_queries(messages: List[Dict[str, Any]]) -> List[str]:
    latest = _extract_retrieval_query(messages)
    if not latest:
        return []

    variants: List[str] = [latest]
    contextual = _derive_contextual_query(messages, latest)
    if contextual:
        variants.append(contextual)

    recent_users = [
        _strip_style_directives(str(message.get("content", "")).strip())
        for message in messages
        if str(message.get("role", "")).lower() == "user"
        and str(message.get("content", "")).strip()
    ]
    recent_users = recent_users[-3:]
    if len(latest.split()) <= 8 and len(recent_users) >= 2:
        variants.append(" ".join(recent_users[-2:]))
    if len(recent_users) >= 3 and _is_followup_only_query(latest):
        variants.append(" ".join(recent_users[-3:]))

    return _dedupe([variant for variant in variants if variant.strip()])


def _retrieve_relevant_chunks(
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
    limit: int = 6,
) -> List[Tuple[str, str]]:
    query_variants = _build_retrieval_queries(messages)
    if not query_variants:
        return []

    is_document_query = any(_is_document_context_query(query) for query in query_variants)
    candidate_scores: Dict[Tuple[str, str], float] = {}

    for variant_index, query_text in enumerate(query_variants):
        query_tokens = set(_tokenize(query_text))
        if not query_tokens and not is_document_query:
            continue

        rag_hits = retrieve_rag_chunks(
            query=query_text,
            attachments=attachments,
            limit=max(limit * 3, 8),
        )
        for hit in rag_hits:
            source = str(hit.get("document_name") or "Document")
            chunk_text = str(hit.get("text") or "").strip()
            if not chunk_text:
                continue

            chunk_tokens = set(_tokenize(chunk_text))
            overlap = len(query_tokens & chunk_tokens) if query_tokens else 0
            overlap_ratio = overlap / max(len(query_tokens), 1) if query_tokens else 0.0
            semantic_score = float(hit.get("score") or 0.0)
            hybrid_score = (
                semantic_score * 5.0
                + overlap * 1.7
                + overlap_ratio * 2.2
                - variant_index * 0.12
            )
            if query_text.lower() in chunk_text.lower():
                hybrid_score += 2.4
            if is_document_query and semantic_score >= 0.18:
                hybrid_score += 1.2

            key = (source, chunk_text)
            previous_score = candidate_scores.get(key)
            if previous_score is None or hybrid_score > previous_score:
                candidate_scores[key] = hybrid_score

        for source, chunk in _collect_attachment_chunks(attachments):
            chunk_tokens = set(_tokenize(chunk))
            if not chunk_tokens:
                continue

            overlap = len(query_tokens & chunk_tokens)
            overlap_ratio = overlap / max(len(query_tokens), 1) if query_tokens else 0.0
            if overlap == 0 and not is_document_query:
                continue

            lexical_score = overlap * 1.9 + overlap_ratio * 2.4 - variant_index * 0.1
            if query_text.lower() in chunk.lower():
                lexical_score += 2.6

            key = (source, chunk)
            previous_score = candidate_scores.get(key)
            if previous_score is None or lexical_score > previous_score:
                candidate_scores[key] = lexical_score

    ranked = sorted(candidate_scores.items(), key=lambda item: item[1], reverse=True)
    return [item[0] for item in ranked[:limit]]


def _is_summary_request(prompt: str) -> bool:
    lower = prompt.strip().lower()
    if not lower:
        return False

    return any(
        token in lower
        for token in (
            "summarize",
            "summarise",
            "summary",
            "key points",
            "highlights",
            "brief",
            "overview",
            "tldr",
            "tl;dr",
        )
    )


def _extract_requested_point_count(prompt: str, default: int = 5) -> int:
    lower = prompt.lower()
    match = re.search(r"\b(\d{1,2})\s*(?:point|points|bullet|bullets|item|items)\b", lower)
    if not match:
        return default

    try:
        value = int(match.group(1))
    except ValueError:
        return default

    return max(3, min(value, 8))


def _build_rag_summary_response(
    prompt: str,
    relevant_chunks: List[Tuple[str, str]],
) -> str:
    sentence_candidates: List[str] = []
    for _, chunk in relevant_chunks[:10]:
        parts = re.split(r"(?<=[\.\!\?])\s+", chunk)
        for part in parts:
            sentence = re.sub(r"\s+", " ", part).strip(" -")
            if len(sentence) < 35:
                continue
            sentence_candidates.append(sentence)

    if not sentence_candidates:
        return ""

    query_tokens = set(_tokenize(prompt))
    scored: List[Tuple[float, str]] = []
    for sentence in sentence_candidates:
        sentence_tokens = set(_tokenize(sentence))
        overlap = len(query_tokens & sentence_tokens)
        score = overlap * 2.2 + min(len(sentence_tokens), 20) * 0.1
        scored.append((score, sentence))

    scored.sort(key=lambda item: item[0], reverse=True)
    max_points = _extract_requested_point_count(prompt)

    selected: List[str] = []
    seen: set[str] = set()
    for _, sentence in scored:
        fingerprint = sentence.lower()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        selected.append(sentence)
        if len(selected) >= max_points:
            break

    if not selected:
        return ""

    lines = ["Here's the clearest summary from the available information:"]
    for point in selected:
        lines.append(f"- {_truncate_text(point, 220)}")
    return "\n".join(lines)


def _general_fallback_response(prompt: str) -> str:
    lower = prompt.strip().lower()
    if "what is apple" in lower or lower == "apple":
        return (
            "Apple is a multinational technology company known for products "
            "such as iPhone, Mac, iPad, Apple Watch, and services like iCloud."
        )

    if "quantum physics" in lower:
        return (
            "Quantum physics studies how matter and energy behave at very tiny scales "
            "(atoms and subatomic particles).\n\n"
            "Key points:\n"
            "- Energy appears in discrete packets called quanta.\n"
            "- Particles can behave like waves depending on the experiment.\n"
            "- Outcomes are probabilistic until measurement.\n"
            "- This underpins semiconductors, lasers, and quantum-computing research."
        )

    if lower.startswith("explain "):
        subject = prompt.strip()[8:].strip(" .?")
        if subject:
            return (
                f"I don't have a reliable local definition for {subject} yet.\n"
                "I'll fetch external references and summarize them clearly."
            )

    if lower.startswith("what is ") or lower.startswith("who is "):
        subject = re.sub(r"^(what is|who is)\s+", "", prompt.strip(), flags=re.IGNORECASE).strip(" ?")
        return (
            f"I don't have a reliable local answer for {subject} yet.\n"
            "I'll fetch external references and summarize the answer in points."
        )

    return "I don't have enough reliable local context for this yet. I'll fetch external references and summarize clearly."


def _is_followup_prompt(prompt: str) -> bool:
    normalized = re.sub(r"\s+", " ", prompt.strip().lower())
    if not normalized:
        return False

    if _is_followup_only_query(normalized):
        return True

    followup_markers = (
        "need more details",
        "more details",
        "more detail",
        "explain more",
        "tell me more",
        "go deeper",
        "elaborate",
        "in detail",
        "continue",
        "expand this",
        "add more",
    )

    if any(marker in normalized for marker in followup_markers):
        return True

    return normalized in {
        "more",
        "details",
        "more?",
        "details?",
        "i want more details",
        "i want more detail",
    }


def _find_recent_topic(messages: List[Dict[str, Any]]) -> str:
    user_context_messages: List[str] = []
    for message in messages[-10:]:
        if str(message.get("role", "")).lower() != "user":
            continue
        content = _strip_style_directives(str(message.get("content", "")).strip())
        if not content:
            continue
        if _is_followup_only_query(content):
            continue
        user_context_messages.append(content)

    recent_content = " ".join(user_context_messages).lower()

    if "quantum physics" in recent_content or "quantum" in recent_content:
        return "quantum physics"
    if "cloud computing" in recent_content or "cloud" in recent_content:
        return "cloud computing"
    if (
        "neural science" in recent_content
        or "neuroscience" in recent_content
        or "nervous system" in recent_content
    ):
        return "neural science"
    if "apple" in recent_content:
        return "apple"
    if "revenue" in recent_content:
        return "revenue analysis"

    for message in reversed(messages):
        if str(message.get("role", "")).lower() == "user":
            content = _strip_style_directives(str(message.get("content", "")).strip())
            if not content:
                continue
            if _is_followup_only_query(content):
                continue
            if content:
                return content

    return ""


def _build_followup_response(messages: List[Dict[str, Any]]) -> str:
    topic = _find_recent_topic(messages)
    topic_lower = topic.lower()

    if "quantum physics" in topic_lower or "quantum" in topic_lower:
        return (
            "Here is a deeper view of quantum physics:\n"
            "1. Quantization: Energy appears in discrete packets (quanta), not as a smooth continuum.\n"
            "2. Wave-particle duality: Entities like electrons and photons can behave like both particles and waves.\n"
            "3. Superposition: A system can exist in multiple possible states until a measurement is made.\n"
            "4. Uncertainty principle: Position and momentum cannot both be known with perfect precision at the same time.\n"
            "5. Entanglement: Two particles can share linked states so that measuring one affects the correlated outcome of the other.\n"
            "6. Why it matters: Quantum mechanics powers semiconductors, lasers, MRI physics, and modern quantum-computing research."
        )

    if "cloud computing" in topic_lower or "cloud" in topic_lower:
        return (
            "More detail on cloud computing:\n"
            "1. Service models: IaaS (infrastructure), PaaS (platform), and SaaS (software).\n"
            "2. Deployment models: public cloud, private cloud, and hybrid cloud.\n"
            "3. Core benefits: elasticity, pay-as-you-go cost control, and faster deployment cycles.\n"
            "4. Risks to manage: security controls, cost sprawl, data residency, and vendor lock-in.\n"
            "5. Typical architecture: API gateway, compute services, object storage, database, and monitoring/logging."
        )

    if "neural science" in topic_lower or "neuroscience" in topic_lower:
        return (
            "Here are deeper details on neural science:\n"
            "1. Neuron signaling: neurons communicate through electrical impulses and chemical synapses.\n"
            "2. Circuit organization: groups of neurons form circuits for vision, movement, memory, and decision-making.\n"
            "3. Neuroplasticity: experience and repetition change synaptic strength, enabling learning and adaptation.\n"
            "4. Brain systems: cortex, limbic system, cerebellum, and brainstem coordinate cognition, emotion, and control.\n"
            "5. Methods: fMRI, EEG, electrophysiology, and computational models are used to study brain function.\n"
            "6. Why it matters: neural science supports advances in mental health, neurorehabilitation, brain-computer interfaces, and AI inspiration."
        )

    if topic:
        normalized_topic = re.sub(
            r"^(what is|who is|explain)\s+",
            "",
            topic.strip(),
            flags=re.IGNORECASE,
        ).strip(" .?")
        followup_prompt = f"what is {normalized_topic}" if normalized_topic else topic
        return _general_fallback_response(followup_prompt)

    return (
        "I can provide deeper details. Tell me the exact topic (for example: "
        "'quantum physics', 'cloud computing', or 'revenue forecasting') and I'll expand it step-by-step."
    )


def _normalize_topic(topic: str) -> str:
    normalized = re.sub(r"\s+", " ", topic.strip().lower())
    normalized = normalized.strip(" .,:;!?")

    aliases = {
        "protons": "proton",
        "a proton": "proton",
        "quantum": "quantum physics",
        "cloud": "cloud computing",
        "waether": "weather",
        "wether": "weather",
        "neural network": "neural networks",
        "neural networks in short": "neural networks",
        "neural network in short": "neural networks",
        "neuroscience": "neural science",
        "neural sciences": "neural science",
        "neural": "neural science",
    }
    return aliases.get(normalized, normalized)


def _extract_topic_from_prompt(prompt: str) -> str:
    text = prompt.strip()
    if not text:
        return ""

    lower = text.lower()
    if lower in {
        "explain it",
        "explain this",
        "explain that",
        "more details",
        "provide more details",
        "give more details",
        "need more details",
        "details",
    }:
        return ""

    match = TOPIC_PATTERN.search(text)
    if not match:
        return ""

    topic = match.group(1)
    topic = re.split(
        r"\b(with|in depth|depth|example|examples|beginner|intermediate|technical|short|in short|brief|please)\b",
        topic,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return _normalize_topic(topic)


def _resolve_topic(messages: List[Dict[str, Any]], prompt: str) -> str:
    normalized_prompt = _strip_style_directives(prompt).strip()
    direct = _extract_topic_from_prompt(normalized_prompt)
    if direct:
        return direct

    followup_only = _is_followup_only_query(normalized_prompt)
    contextual_candidate = ""

    for message in reversed(messages):
        if str(message.get("role", "")).lower() != "user":
            continue

        content = _strip_style_directives(str(message.get("content", "")).strip())
        if not content:
            continue
        if content.lower() == normalized_prompt.lower():
            continue
        if _is_followup_only_query(content):
            continue

        if not contextual_candidate:
            contextual_candidate = content

        topic = _extract_topic_from_prompt(content)
        if topic:
            return topic

    history = " ".join(
        _strip_style_directives(str(message.get("content", "")).strip()).lower()
        for message in messages[-10:]
        if str(message.get("role", "")).lower() == "user"
        and str(message.get("content", "")).strip()
        and not _is_followup_only_query(
            _strip_style_directives(str(message.get("content", "")).strip())
        )
    )
    for known_topic in _KNOWLEDGE_BASE.keys():
        if known_topic in history:
            return known_topic

    if contextual_candidate:
        return _normalize_topic(contextual_candidate)

    if followup_only:
        return ""

    return _normalize_topic(normalized_prompt)


def _detect_depth(prompt: str) -> str:
    lower = prompt.lower()
    if any(
        token in lower
        for token in (
            "more details",
            "more detail",
            "explain more",
            "go deeper",
            "in detail",
            "elaborate",
            "deeper",
            "expand",
        )
    ):
        return "technical"
    if "beginner" in lower:
        return "beginner"
    if "intermediate" in lower:
        return "intermediate"
    if any(token in lower for token in ("technical", "in depth", "depth", "deep", "advanced")):
        return "technical"
    return "summary"


def _wants_example(prompt: str) -> bool:
    lower = prompt.lower()
    return "example" in lower or "examples" in lower


def _build_topic_response(topic: str, prompt: str) -> str | None:
    topic_data = _KNOWLEDGE_BASE.get(topic)
    if not topic_data:
        return None

    depth = _detect_depth(prompt)
    wants_example = _wants_example(prompt)
    direct_answer = topic_data["summary"].strip()

    parts: List[str] = [direct_answer, f"Key points on {topic}:"]
    if depth == "beginner":
        parts.append(f"- Core idea: {topic_data['beginner']}")
    elif depth == "intermediate":
        parts.append(f"- How it works: {topic_data['intermediate']}")
    elif depth == "technical":
        parts.append(f"- Deeper view: {topic_data['technical']}")
    else:
        parts.append(f"- What it is: {topic_data['summary']}")
        parts.append(f"- Why it matters: {topic_data['intermediate']}")

    if wants_example or depth in {"beginner", "technical"}:
        parts.append(f"- Example: {topic_data['example']}")

    return "\n".join(parts)


def _has_email_request_intent(text: str) -> bool:
    lower = text.lower()
    return any(
        marker in lower
        for marker in (
            "write a mail",
            "write an email",
            "draft a mail",
            "draft an email",
            "mail to",
            "email to",
        )
    )


def _extract_leave_reason(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text.strip())
    lower = normalized.lower()

    for pattern in (
        r"(?:reason is|reason:)\s+(.+)$",
        r"(?:due to|because)\s+(.+)$",
    ):
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if match:
            reason = match.group(1).strip(" .")
            if reason:
                return reason

    if "out of station" in lower:
        return "out of station"
    if any(token in lower for token in ("sick", "fever", "health", "medical")):
        return "health reasons"
    if "family" in lower:
        return "a family matter"
    return None


def _extract_leave_window(text: str) -> str:
    lower = text.lower()
    if "today" in lower:
        return "for today"
    if "tomorrow" in lower:
        return "for tomorrow"

    explicit_date = re.search(
        r"\b(?:on|from)\s+([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)",
        text,
        flags=re.IGNORECASE,
    )
    if explicit_date:
        return f"for {explicit_date.group(1).strip()}"

    return "for [date(s)]"


def _extract_email_salutation(text: str) -> str:
    lower = text.lower()
    if "ceo" in lower:
        return "Dear CEO,"
    if "manager" in lower:
        return "Dear Manager,"
    if "hr" in lower:
        return "Dear HR Team,"
    return "Dear Sir/Madam,"


def _build_leave_email_draft(salutation: str, leave_window: str, reason: str | None) -> str:
    reason_clause = f"because I am {reason}" if reason == "out of station" else ""
    if reason and reason != "out of station":
        reason_clause = f"due to {reason}"
    if not reason_clause:
        reason_clause = "for personal reasons"

    return (
        "Subject: Leave Request\n\n"
        f"{salutation}\n\n"
        f"I hope you are doing well. I would like to request leave {leave_window} {reason_clause}.\n\n"
        "I will ensure that my current work is covered and that any urgent items are handed over before I am away.\n\n"
        "Please let me know if you need any additional details.\n\n"
        "Best regards,\n"
        "[Your Name]"
    )


def _build_contextual_email_followup(messages: List[Dict[str, Any]], prompt: str) -> str | None:
    recent_user_messages = [
        str(message.get("content", "")).strip()
        for message in messages
        if str(message.get("role", "")).lower() == "user"
        and str(message.get("content", "")).strip()
    ]
    if len(recent_user_messages) < 2:
        return None

    current_prompt = recent_user_messages[-1]
    if current_prompt.strip() != prompt.strip():
        current_prompt = prompt.strip()

    context_window = " ".join(recent_user_messages[-4:])
    if not any(_has_email_request_intent(item) and "leave" in item.lower() for item in recent_user_messages[:-1]):
        return None

    reason = _extract_leave_reason(context_window)
    leave_window = _extract_leave_window(context_window)
    salutation = _extract_email_salutation(context_window)
    if not reason and leave_window == "for [date(s)]":
        return None

    return _build_leave_email_draft(salutation, leave_window, reason)


def _build_email_draft_response(prompt: str, messages: List[Dict[str, Any]] | None = None) -> str | None:
    lower = prompt.lower()
    if messages:
        contextual_followup = _build_contextual_email_followup(messages, prompt)
        if contextual_followup:
            return contextual_followup

    if not _has_email_request_intent(prompt):
        return None
    if "leave" not in lower:
        return None

    salutation = _extract_email_salutation(prompt)
    leave_window = _extract_leave_window(prompt)
    reason = _extract_leave_reason(prompt)
    return _build_leave_email_draft(salutation, leave_window, reason)


def _build_local_analytics_response(
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
    user_id: str | None = None,
) -> str:
    last_user_message = ""
    for message in reversed(messages):
        if str(message.get("role", "")).lower() == "user":
            last_user_message = str(message.get("content", "")).strip()
            break

    email_draft_response = _build_email_draft_response(last_user_message, messages)
    if email_draft_response:
        return email_draft_response

    memory_backed_email_response = _build_memory_backed_email_response(
        last_user_message,
        user_id,
    )
    if memory_backed_email_response:
        return memory_backed_email_response

    contextual_query = _derive_contextual_query(messages, last_user_message)
    resolved_topic = _resolve_topic(messages, last_user_message)

    if _is_followup_prompt(last_user_message):
        topic_response = _build_topic_response(resolved_topic, last_user_message)
        if topic_response:
            return topic_response
        rapid_followup = _build_rapid_comparison_response(contextual_query)
        if rapid_followup:
            return rapid_followup
        return _build_followup_response(messages)

    is_document_query = _is_document_context_query(last_user_message) or _is_summary_request(
        last_user_message
    )

    math_response = _compute_math_response(last_user_message)
    if math_response:
        return math_response

    lower = last_user_message.lower()
    wants_stats = any(
        keyword in lower
        for keyword in (
            "statistics",
            "statistical",
            "stats",
            "average",
            "mean",
            "median",
            "variance",
            "standard deviation",
            "std",
            "analyze",
            "analyse",
        )
    )
    values = _extract_numbers(last_user_message)

    if values and (wants_stats or len(values) >= 3):
        return _build_descriptive_stats_response(values)

    rapid_response = _build_rapid_comparison_response(contextual_query)
    if rapid_response:
        return rapid_response

    topic_response = _build_topic_response(resolved_topic, last_user_message)
    if topic_response and not (
        _is_document_context_query(last_user_message) or _is_rapid_analytics_query(last_user_message)
    ):
        return topic_response

    relevant_chunks = _retrieve_relevant_chunks(messages, attachments)
    if relevant_chunks:
        rag_summary = _build_rag_summary_response(last_user_message, relevant_chunks)
        if rag_summary:
            follow_up = ""
            if _is_rapid_analytics_query(last_user_message):
                follow_up = "\n\nWould you like a breakdown by region, practice, BDM, or account?"
            if _is_summary_request(last_user_message):
                return rag_summary + follow_up
            return rag_summary.replace(
                "Here's the clearest summary from the available information:",
                "Here's what stands out:",
                1,
            ) + follow_up

    attachment_lines = _build_attachment_lines(attachments)
    if attachment_lines and is_document_query:
        return (
            "Here's a summary of the material you shared:\n"
            + "\n".join(attachment_lines)
            + "\n\nIf you'd like, I can also pull out risks, action items, or key decisions."
        )

    if topic_response:
        return topic_response

    return _general_fallback_response(last_user_message)


def _augment_messages_with_attachments(
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    extra_context: List[str] = []
    query_text = _build_query_from_messages(messages)
    include_attachment_summary = _is_document_context_query(query_text) or _is_summary_request(
        query_text
    )

    attachment_lines = _build_attachment_lines(attachments)
    if attachment_lines and include_attachment_summary:
        extra_context.append("Document summaries:\n" + "\n".join(attachment_lines))

    relevant_chunks = _retrieve_relevant_chunks(messages, attachments)
    if relevant_chunks:
        rag_lines = [
            f"{index + 1}. [{source}] {chunk[:420]}"
            for index, (source, chunk) in enumerate(relevant_chunks)
        ]
        extra_context.append("Retrieved context chunks:\n" + "\n".join(rag_lines))

    if not extra_context:
        return messages

    attachment_context = {
        "role": "system",
        "content": "\n\n".join(extra_context),
    }
    return [attachment_context, *messages]


def _extract_last_user_message(messages: List[Dict[str, Any]]) -> str:
    for message in reversed(messages):
        if str(message.get("role", "")).lower() != "user":
            continue
        content = str(message.get("content", "")).strip()
        if content:
            return content
    return ""


def _strip_style_directives(query: str) -> str:
    stripped = _STYLE_DIRECTIVE_PATTERN.sub("", query)
    stripped = re.sub(r"\s+", " ", stripped).strip(" ,;:-")
    return stripped or query.strip()


def _is_followup_only_query(query: str) -> bool:
    normalized = re.sub(r"\s+", " ", query.strip().lower())
    if not normalized:
        return False

    followup_markers = (
        "need more details",
        "more details",
        "provide more details",
        "give more details",
        "more detail",
        "tell me more",
        "go deeper",
        "deeper",
        "expand",
        "elaborate",
        "continue",
        "explain more",
        "in detail",
    )
    context_fragment_markers = (
        "reason is ",
        "reason: ",
        "because ",
        "due to ",
        "for today",
        "for tomorrow",
        "out of station",
        "family matter",
        "personal reasons",
        "medical reasons",
        "health reasons",
    )
    return (
        normalized in followup_markers
        or any(marker in normalized for marker in followup_markers)
        or any(normalized.startswith(marker) for marker in context_fragment_markers)
    )


def _should_prefer_local_response(
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
    user_id: str | None = None,
) -> bool:
    _ = user_id
    last_user_message = _extract_last_user_message(messages)
    if not last_user_message:
        return False

    # Keep deterministic local helpers only for numeric/statistical tasks
    # and explicit document analysis flows. General chat should route to
    # the OpenAI-compatible backend for a ChatGPT-like experience.
    if _is_rapid_analytics_query(last_user_message):
        return True

    if _compute_math_response(last_user_message):
        return True

    lower = last_user_message.lower()
    values = _extract_numbers(last_user_message)
    wants_stats = any(
        keyword in lower
        for keyword in (
            "statistics",
            "statistical",
            "stats",
            "average",
            "mean",
            "median",
            "variance",
            "standard deviation",
            "std",
            "analyze",
            "analyse",
        )
    )
    if values and (wants_stats or len(values) >= 3):
        return True

    normalized_prompt = last_user_message.strip().lower()
    resolved_topic = _resolve_topic(messages, last_user_message)
    if resolved_topic in _KNOWLEDGE_BASE:
        return True
    if _is_followup_prompt(last_user_message):
        # Keep follow-ups local only when we have a known local topic.
        return resolved_topic in _KNOWLEDGE_BASE

    if any(normalized_prompt.startswith(prefix) for prefix in ("what is ", "who is ", "explain ")):
        # For unknown topics, prefer live retrieval instead of generic local templates.
        return resolved_topic in _KNOWLEDGE_BASE

    if attachments and (
        _is_document_context_query(last_user_message) or _is_summary_request(last_user_message)
    ):
        return True

    return False


def _derive_contextual_query(messages: List[Dict[str, Any]], current_query: str) -> str:
    normalized_current = _strip_style_directives(current_query).strip()
    if not normalized_current:
        return current_query

    if not _is_followup_only_query(normalized_current):
        return normalized_current

    followup_wants_depth = any(
        marker in normalized_current.lower()
        for marker in ("detail", "deeper", "more", "expand", "elaborate")
    )

    for message in reversed(messages):
        if str(message.get("role", "")).lower() != "user":
            continue
        content = _strip_style_directives(str(message.get("content", "")).strip())
        if not content:
            continue
        if content.lower() == normalized_current.lower():
            continue
        if _is_followup_only_query(content):
            continue
        if followup_wants_depth:
            return f"{content} in detail"
        return content

    return normalized_current


def _looks_like_entity_lookup_query(normalized_query: str) -> bool:
    if not normalized_query:
        return False

    if any(token in normalized_query for token in _ENTERTAINMENT_LOOKUP_KEYWORDS):
        return True

    has_letters = bool(re.search(r"[a-z]", normalized_query))
    has_digits = bool(re.search(r"\d", normalized_query))
    if not (has_letters and has_digits):
        return False

    if normalized_query.startswith(("what ", "who ", "when ", "where ", "why ", "how ")):
        return False

    if re.fullmatch(r"[0-9\.\+\-\*\/%\(\)\s]+", normalized_query):
        return False

    return len(normalized_query.split()) <= 5


def _classify_query_profile(query: str) -> Dict[str, Any]:
    normalized = re.sub(r"\s+", " ", query.strip().lower())
    if not normalized:
        return {
            "intent": "general",
            "needs_live_data": False,
            "needs_tool_use": False,
            "should_be_short": False,
            "confidence": 0.5,
        }

    intent = "general"
    confidence = 0.82
    explanatory_query = any(
        normalized.startswith(prefix) for prefix in ("what is ", "who is ", "explain ")
    )
    entertainment_lookup = any(
        token in normalized for token in _ENTERTAINMENT_LOOKUP_KEYWORDS
    )
    entity_lookup = _looks_like_entity_lookup_query(normalized)

    if any(token in normalized for token in _RECOMMENDATION_KEYWORDS):
        intent = "recommendation"
        confidence = 0.93
    elif any(token in normalized for token in _ANALYST_KEYWORDS):
        intent = "analyst"
        confidence = 0.94
    elif any(token in normalized for token in _NEWS_KEYWORDS):
        intent = "news"
        confidence = 0.95
    elif any(token in normalized for token in _ENGINEER_KEYWORDS):
        intent = "engineer"
        confidence = 0.92
    elif any(token in normalized for token in _ADVISOR_KEYWORDS):
        intent = "advisor"
        confidence = 0.9
    elif entertainment_lookup:
        intent = "general"
        confidence = 0.86
    elif (not explanatory_query) and (
        len(normalized.split()) <= 4
        or any(token in normalized for token in _CONCISE_KEYWORDS)
    ):
        intent = "concise"
        confidence = 0.84

    needs_live_data = bool(
        any(token in normalized for token in _NEWS_KEYWORDS)
        or "price" in normalized
        or "stock" in normalized
        or "today" in normalized
        or "current" in normalized
        or "latest" in normalized
        or "live" in normalized
        or "happening now" in normalized
    )
    definition_query = any(
        normalized.startswith(prefix) for prefix in ("what is ", "who is ", "explain ")
    )
    if definition_query and not _is_rapid_analytics_query(query):
        extracted_topic = _extract_topic_from_prompt(query)
        if not extracted_topic:
            extracted_topic = re.sub(
                r"^(what is|who is|explain)\s+",
                "",
                query.strip(),
                flags=re.IGNORECASE,
            ).strip(" ?.")
        normalized_topic = _normalize_topic(extracted_topic)
        if normalized_topic and normalized_topic not in _KNOWLEDGE_BASE:
            # Unknown concept/entity queries should scrape current web context.
            needs_live_data = True

    needs_tool_use = (
        needs_live_data
        or intent in {"recommendation"}
        or entertainment_lookup
        or entity_lookup
    )
    should_be_short = (intent == "concise" or any(
        token in normalized for token in _CONCISE_KEYWORDS
    )) and not entertainment_lookup and not entity_lookup

    return {
        "intent": intent,
        "needs_live_data": needs_live_data,
        "needs_tool_use": needs_tool_use,
        "should_be_short": should_be_short,
        "lookup_hint": entertainment_lookup or entity_lookup,
        "confidence": confidence,
    }


def _decide_hidden_tool(user_query: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    normalized = user_query.strip()
    url_match = re.search(r"https?://[^\s]+", normalized)
    if url_match:
        return {
            "tool": "page_scrape",
            "reason": "The user referenced a specific URL.",
            "search_query": None,
            "url": url_match.group(0).rstrip(").,]"),
        }

    intent = str(profile.get("intent", "general"))
    needs_live = bool(profile.get("needs_live_data", False))
    needs_tool = bool(profile.get("needs_tool_use", False))
    lookup_hint = bool(profile.get("lookup_hint", False))

    if intent == "news" or needs_live:
        return {
            "tool": "news_fetch" if "news" in normalized.lower() else "live_search",
            "reason": "The query likely depends on fresh information.",
            "search_query": normalized,
            "url": None,
        }

    if intent == "recommendation" and needs_tool:
        return {
            "tool": "live_search",
            "reason": "Fresh discovery data can improve recommendation quality.",
            "search_query": normalized,
            "url": None,
        }

    if needs_tool and (lookup_hint or intent in {"general", "concise"}):
        return {
            "tool": "live_search",
            "reason": "Entity lookup or discovery query benefits from fresh web context.",
            "search_query": normalized,
            "url": None,
        }

    if intent in {"engineer", "advisor", "general", "concise", "analyst"}:
        return {
            "tool": "none",
            "reason": "No external retrieval is required for a reliable answer path.",
            "search_query": None,
            "url": None,
        }

    return {
        "tool": "none",
        "reason": "Default no-tool path.",
        "search_query": None,
        "url": None,
    }


def _truncate_text(value: str, max_chars: int = 220) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 1].rstrip() + "â€¦"


def _domain_for_display(url: str) -> str:
    parsed = urlparse(url)
    domain = parsed.netloc.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def _is_tracking_like_url(url: str) -> bool:
    lower = url.lower()
    parsed = urlparse(url)
    domain = parsed.netloc.lower()

    if not parsed.scheme.startswith("http"):
        return True
    if domain.endswith("duckduckgo.com") and parsed.path.lower() in {"/y.js", "/y"}:
        return True
    if domain.endswith("bing.com") and parsed.path.lower().startswith("/aclick"):
        return True
    if any(token in lower for token in ("ad_domain=", "click_metadata=", "doubleclick", "googlesyndication")):
        return True
    if len(url) > 420:
        return True
    return False


def _clean_result_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    output: List[Dict[str, str]] = []
    seen: set[str] = set()

    for row in rows:
        title = _truncate_text(str(row.get("title", "")).strip(), 220)
        url = str(row.get("url", "")).strip()
        snippet = _truncate_text(str(row.get("snippet", "")).strip(), 280)
        if not title or not url:
            continue
        if _is_tracking_like_url(url):
            continue

        key = url.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append({"title": title, "url": url, "snippet": snippet})
        if len(output) >= 10:
            break

    return output


def _is_movie_recommendation_query(query: str) -> bool:
    lower = query.lower()
    has_recommendation_intent = any(
        token in lower for token in ("best", "top", "recommend", "must watch", "must-watch", "popular")
    )
    has_movie_intent = any(token in lower for token in ("movie", "movies", "film", "films", "hollywood"))
    return has_recommendation_intent and has_movie_intent


def _is_laptop_recommendation_query(query: str) -> bool:
    lower = query.lower()
    has_recommendation_intent = any(
        token in lower for token in ("best", "top", "recommend", "student", "college")
    )
    has_laptop_intent = any(token in lower for token in ("laptop", "notebook", "ultrabook"))
    return has_recommendation_intent and has_laptop_intent


def _source_names_from_results(rows: List[Dict[str, str]]) -> str:
    names: List[str] = []

    for row in rows:
        title_lower = row["title"].lower()
        domain = _domain_for_display(row["url"])
        if "imdb" in title_lower or "imdb" in domain:
            names.append("IMDb")
            continue
        if "rotten tomatoes" in title_lower or "rottentomatoes" in domain:
            names.append("Rotten Tomatoes")
            continue
        if "empire" in title_lower or "empireonline" in domain:
            names.append("Empire")
            continue
        if "metacritic" in title_lower or "metacritic" in domain:
            names.append("Metacritic")
            continue
        if "letterboxd" in title_lower or "letterboxd" in domain:
            names.append("Letterboxd")
            continue

    if not names:
        domains = [_domain_for_display(row["url"]) for row in rows[:3]]
        names = [domain for domain in domains if domain]

    deduped = _dedupe(names)
    return ", ".join(deduped[:4])


def _extract_first_price_signal(text: str) -> str:
    rupee_match = re.search(r"â‚¹\s?\d[\d,]*(?:\.\d+)?", text)
    if rupee_match:
        return rupee_match.group(0).replace(" ", "")

    dollar_match = re.search(r"\$\s?\d[\d,]*(?:\.\d+)?", text)
    if dollar_match:
        return dollar_match.group(0).replace(" ", "")

    percent_match = re.search(r"\b\d+(?:\.\d+)?%\b", text)
    if percent_match:
        return percent_match.group(0)

    return ""


def _extract_analyst_subject(query: str) -> str:
    value = query.strip().rstrip(" ?")
    value = re.sub(
        r"\b(stock|share|price|today|latest|current|live|quote|nse|bse)\b",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        value = query.strip().rstrip(" ?")
    return value[:1].upper() + value[1:] if value else "This asset"


def _clean_fact_sentence(text: str) -> str:
    value = re.sub(r"\s+", " ", text).strip()
    value = re.sub(
        r"^(get|find|view)\s+(today'?s\s+)?(the\s+)?latest\s+",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"^(get|find|view)\s+",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return value[:1].upper() + value[1:] if value else value


async def _maybe_fetch_hidden_live_data(
    messages: List[Dict[str, Any]],
    query_override: str = "",
) -> Dict[str, Any] | None:
    query = query_override.strip() or _extract_last_user_message(messages)
    if not query:
        return None
    wants_external_context = _wants_explicit_external_context(query)
    if _is_rapid_analytics_query(query) and not wants_external_context:
        return None
    live_query = (
        _derive_external_context_query(query)
        if _is_rapid_analytics_query(query) and wants_external_context
        else query
    )

    profile = _classify_query_profile(live_query)
    decision = _decide_hidden_tool(live_query, profile)
    chosen_tool = str(decision.get("tool", "none"))
    if chosen_tool == "none":
        return {
            "triggered": False,
            "query": live_query,
            "strategy": "none",
            "payload": {},
            "profile": profile,
            "tool_decision": decision,
        }

    try:
        from hidden_web_intelligence.tool_router import (
            tool_hidden_news,
            tool_hidden_scrape,
            tool_hidden_search,
        )
    except Exception:
        return None

    try:
        if chosen_tool == "news_fetch":
            payload = await tool_hidden_news(str(decision.get("search_query") or live_query))
            strategy = "news"
        elif chosen_tool == "live_search":
            payload = await tool_hidden_search(str(decision.get("search_query") or live_query))
            strategy = "search"
        elif chosen_tool == "page_scrape":
            url = str(decision.get("url") or "").strip()
            if not url:
                return None
            payload = await tool_hidden_scrape(url)
            strategy = "page"
        else:
            return None
    except Exception:
        return None

    if not payload or not isinstance(payload, dict):
        return None

    return {
        "triggered": True,
        "query": live_query,
        "strategy": strategy,
        "payload": payload,
        "profile": profile,
        "tool_decision": decision,
    }


def _build_hidden_live_system_context(hidden_live_data: Dict[str, Any] | None) -> str:
    if not hidden_live_data:
        return ""

    payload = hidden_live_data.get("payload")
    if not isinstance(payload, dict) or not payload:
        return ""
    query = str(hidden_live_data.get("query", "")).strip()
    profile = hidden_live_data.get("profile")
    intent = ""
    if isinstance(profile, dict):
        intent = str(profile.get("intent", "")).strip().lower()

    try:
        from hidden_web_intelligence.context_builder import build_hidden_context
    except Exception:
        return ""

    context = str(build_hidden_context(payload, query=query, intent=intent)).strip()
    if not context:
        return ""

    return (
        "INTERNAL LIVE CONTEXT (PRIVATE TOOLING):\n"
        "Use this as fresh web context when relevant.\n"
        "Do not mention hidden tools, scraping, automation traces, or debug mechanics.\n\n"
        + context
    )


def _detect_response_mode(query: str) -> str:
    profile = _classify_query_profile(query)
    intent = str(profile.get("intent", "general"))
    if intent == "general":
        return "default"
    return intent


def _detect_requested_voice(query: str) -> str:
    lower = query.lower()
    if any(
        token in lower
        for token in ("grok style", "like grok", "grok mode", "in grok tone")
    ):
        return "grok"
    if any(
        token in lower
        for token in ("chatgpt style", "like chatgpt", "chatgpt mode")
    ):
        return "chatgpt"
    return "chatgpt"


def _build_voice_instruction(voice: str, mode: str) -> str:
    if voice == "grok":
        return (
            "Voice mode: Grok-style polish.\n"
            "- Be crisp, confident, and sharp.\n"
            "- Keep language natural and human.\n"
            "- Add light punch only when it helps clarity.\n"
            "- Stay professional and concise.\n"
            f"- Active response mode: {mode}."
        )

    return (
        "Voice mode: ChatGPT-style polish.\n"
        "- Be clear, calm, and naturally conversational.\n"
        "- Keep structure clean and concise.\n"
        "- Prioritize usefulness over verbosity.\n"
        f"- Active response mode: {mode}."
    )


def _apply_voice_style(text: str, voice: str, mode: str) -> str:
    if voice != "grok":
        return text

    output = text
    output = re.sub(r"(?i)^as of recent data,\s*", "As of recent data: ", output)
    output = re.sub(r"(?i)\bif you want one safe\b", "If you want a solid", output)
    output = re.sub(r"(?i)\bthe clearest answer\b", "The direct answer", output)
    output = re.sub(r"\n{3,}", "\n\n", output).strip()

    if mode == "concise":
        output_lines = [line for line in output.splitlines() if line.strip()]
        if len(output_lines) > 3:
            output = "\n".join(output_lines[:3]).strip()

    return output


def _build_movie_recommendation_answer(
    query: str,
    rows: List[Dict[str, str]],
    mode: str,
) -> str:
    _ = query
    anchors = [movie["title"] for movie in _CURATED_HOLLYWOOD_MOVIES[:3]]
    intro = (
        f"If you want the safest all-time Hollywood picks, {anchors[0]}, {anchors[1]}, "
        f"and {anchors[2]} are hard to beat."
    )

    if mode == "concise":
        return intro

    lines: List[str] = [intro, "", "A well-rounded watchlist after those:"]
    count = 8 if mode == "default" else 10
    for movie in _CURATED_HOLLYWOOD_MOVIES[:count]:
        lines.append(
            f"- {movie['title']} ({movie['year']}): {movie['detail']}"
        )
    lines.append(
        "If you share your mood (dark thriller, feel-good, mind-bending, family-safe), "
        "Iâ€™ll narrow this to the best 3 for tonight."
    )
    return "\n".join(lines)


def _build_laptop_recommendation_answer(mode: str) -> str:
    first = _CURATED_STUDENT_LAPTOPS[0]
    opener = (
        f"If you want one safe student laptop pick, start with {first['name']} because it balances battery life, portability, and performance."
    )

    if mode == "concise":
        return opener

    lines = [opener, "", "Good options by use case:"]
    for item in _CURATED_STUDENT_LAPTOPS:
        lines.append(f"- {item['name']} ({item['fit']}): {item['detail']}")
    lines.append(
        "If you share your budget and preferred OS, I can narrow this to the best 2 choices for you."
    )
    return "\n".join(lines)


def _is_recommendation_query(query: str) -> bool:
    lower = query.lower()
    return any(
        token in lower
        for token in ("best", "top", "recommend", "suggest", "must watch", "must-watch", "popular")
    )


def _is_michael_jackson_song_query(query: str) -> bool:
    lower = query.lower()
    return "michael jackson" in lower and any(
        token in lower for token in ("song", "songs", "track", "tracks")
    )


def _is_movie_information_query(query: str) -> bool:
    lower = query.lower()
    has_movie_intent = any(token in lower for token in ("movie", "film"))
    return has_movie_intent and not _is_recommendation_query(query)


def _build_michael_jackson_recommendation(mode: str) -> str:
    anchor = [item["title"] for item in _CURATED_MICHAEL_JACKSON_SONGS[:3]]
    opener = (
        f"If you want the best Michael Jackson songs, {anchor[0]}, {anchor[1]}, and {anchor[2]} are the essential classics."
    )

    if mode == "concise":
        return opener

    lines = [opener, ""]
    for item in _CURATED_MICHAEL_JACKSON_SONGS:
        lines.append(f"- {item['title']}: {item['detail']}")
    lines.append("")
    lines.append("If you want just 3 to start with, Billie Jean, Smooth Criminal, and Man in the Mirror are hard to beat.")
    return "\n".join(lines)


def _build_movie_information_answer(
    query: str,
    rows: List[Dict[str, str]],
    mode: str,
) -> str:
    subject = _truncate_text(query.strip().rstrip(" ?"), 90)
    lead = _row_summary(rows[0], 220)

    if mode == "concise":
        return f"As of recent data, {lead}"

    extra_points: List[str] = []
    seen: set[str] = set()
    for row in rows[1:6]:
        point = _row_summary(row, 170)
        key = point.lower()
        if not point or key in seen:
            continue
        seen.add(key)
        extra_points.append(point)

    lines: List[str] = [f"Hereâ€™s what is currently known about {subject}:", lead]
    if extra_points:
        lines.append("")
        lines.append("Key details:")
        for point in extra_points:
            lines.append(f"- {point}")
    lines.append("")
    lines.append("If you want, I can also break this down into story, cast, release timeline, and where to watch.")
    return "\n".join(lines)


def _row_summary(row: Dict[str, str], max_chars: int = 170) -> str:
    snippet = row.get("snippet", "").strip()
    if snippet:
        return _truncate_text(_clean_fact_sentence(snippet), max_chars)
    return _truncate_text(_clean_fact_sentence(row.get("title", "").strip()), max_chars)


def _build_generic_recommendation_answer(
    query: str,
    rows: List[Dict[str, str]],
    mode: str,
) -> str:
    focus = _truncate_text(query.strip().rstrip(" ?"), 80)
    insight_points = [_row_summary(row, 130) for row in rows[:5]]
    short_insight = insight_points[0] if insight_points else "quality options cluster around a few consistent picks."
    opener = f"For {focus}, the clearest signal is this: {short_insight}"

    if mode == "concise":
        return opener

    lines: List[str] = [opener, "", "What consistently matters:"]
    for point in insight_points[:4]:
        lines.append(f"- {point}")
    lines.append("If you share your priorities, I can narrow this to the best 2-3 options for you.")
    return "\n".join(lines)


def _build_search_fallback_answer(query: str, payload: Dict[str, Any], mode: str) -> str:
    rows = _clean_result_rows(
        [
            row
            for row in payload.get("results", [])
            if isinstance(row, dict)
        ]
    )
    if not rows:
        return ""

    if _is_movie_recommendation_query(query):
        return _build_movie_recommendation_answer(query, rows, mode)

    if _is_laptop_recommendation_query(query):
        return _build_laptop_recommendation_answer(mode)

    if _is_michael_jackson_song_query(query):
        return _build_michael_jackson_recommendation(mode)

    if _is_movie_information_query(query):
        return _build_movie_information_answer(query, rows, mode)

    if _is_recommendation_query(query):
        return _build_generic_recommendation_answer(query, rows, mode)

    if mode == "concise":
        best = rows[0]
        summary = _row_summary(best, 180)
        return f"As of recent data, {summary}"

    if mode == "analyst":
        combined = " ".join(
            f"{row.get('title', '')} {row.get('snippet', '')}".strip()
            for row in rows[:5]
        )
        detected_price = _extract_first_price_signal(combined)
        subject = _extract_analyst_subject(query)
        if detected_price and any(
            token in query.lower() for token in ("stock", "price", "share")
        ):
            lead = f"{subject} is trading around {detected_price}."
        else:
            lead = _row_summary(rows[0], 180)
            if re.match(r"(?i)^(get|find)\s+the\s+latest", lead):
                lead = (
                    f"{subject} is actively traded, and the exact tick changes during market hours."
                )
        lines = [
            f"As of recent data, {lead}",
            "",
            "Key Data:",
        ]
        for row in rows[:4]:
            lines.append(f"- {_row_summary(row, 170)}")
        lines.append("")
        lines.append(
            "Interpretation: the signal is fairly consistent across recent sources, so this direction looks dependable."
        )
        return "\n".join(lines)

    if mode == "engineer":
        lines = [
            "Here is the practical answer in short:",
            f"- {_row_summary(rows[0], 170)}",
            "Next step: if you share your exact constraint, I can convert this into a concrete implementation plan.",
        ]
        return "\n".join(lines)

    if mode == "advisor":
        lines = ["The clearest direction is this:"]
        for row in rows[:4]:
            lines.append(f"- {_row_summary(row, 165)}")
        lines.append("Practical advice: pick the option that repeatedly appears with strong quality signals.")
        return "\n".join(lines)

    lead = _row_summary(rows[0], 190)
    details = [_row_summary(row, 145) for row in rows[1:4]]
    lines = [f"As of recent data, {lead}"]
    if details:
        lines.append("")
        lines.append("What matters most:")
        for detail in details:
            lines.append(f"- {detail}")
    return "\n".join(lines)


def _build_news_fallback_answer(payload: Dict[str, Any], mode: str) -> str:
    articles = [
        article
        for article in payload.get("articles", [])
        if isinstance(article, dict)
    ]
    if not articles:
        return ""

    top_article = articles[0]
    top_snippet = _truncate_text(str(top_article.get("snippet", "")).strip(), 210)
    top_title = _truncate_text(str(top_article.get("title", "")).strip(), 180)
    main_situation = top_snippet or top_title
    if not main_situation:
        main_situation = "there is meaningful movement in this story."

    lines: List[str] = [f"The main development right now is: {main_situation}"]
    limit = 3 if mode == "concise" else 6
    lines.append("")
    lines.append("Key updates:")
    for article in articles[:limit]:
        title = _truncate_text(str(article.get("title", "")).strip(), 170)
        snippet = _truncate_text(str(article.get("snippet", "")).strip(), 220)
        detail = snippet or title
        if not detail:
            continue
        lines.append(f"- {detail}")

    if mode != "concise":
        topic = _truncate_text(str(payload.get("topic", "")).strip(), 90)
        if topic:
            lines.append("")
            lines.append(
                f"Why this matters: these shifts can change near-term sentiment and decisions around {topic}."
            )
        else:
            lines.append("")
            lines.append(
                "Why this matters: this changes near-term sentiment and decision-making."
            )

    if mode == "analyst" and mode != "concise":
        lines.append("")
        lines.append(
            "Interpretation: momentum is concentrated around a few themes, which is useful for short-term tracking."
        )
    return "\n".join(lines)


def _build_page_fallback_answer(payload: Dict[str, Any], mode: str) -> str:
    title = _truncate_text(str(payload.get("title", "")).strip(), 200)
    clean_text = _truncate_text(
        str(payload.get("clean_text", "")).strip(),
        420 if mode == "concise" else 1200,
    )
    headings = [
        _truncate_text(str(item), 140)
        for item in payload.get("headings", [])
        if str(item).strip()
    ][:4 if mode == "concise" else 6]

    if not title and not clean_text:
        return ""

    if mode == "concise":
        summary = clean_text or title
        return f"As of recent data, {summary}"

    lines: List[str] = []
    if title:
        lines.append(f"{title}")
    if headings:
        lines.append("")
        lines.append("Useful sections:")
        for heading in headings:
            lines.append(f"- {heading}")
    if clean_text:
        lines.append("")
        lines.append("In plain terms:")
        lines.append(clean_text)
    return "\n".join(lines)


def _build_live_context_fallback_message(
    user_query: str,
    hidden_live_data: Dict[str, Any] | None,
) -> str:
    if not hidden_live_data:
        return ""

    strategy = str(hidden_live_data.get("strategy", "")).lower().strip()
    payload = hidden_live_data.get("payload")
    if not isinstance(payload, dict):
        return ""

    mode = _detect_response_mode(user_query)

    if strategy == "news":
        rendered = _build_news_fallback_answer(payload, mode)
        if rendered:
            return rendered

    if strategy == "page":
        rendered = _build_page_fallback_answer(payload, mode)
        if rendered:
            return rendered

    if strategy == "search":
        rendered = _build_search_fallback_answer(user_query, payload, mode)
        if rendered:
            return rendered

    return ""


def _build_combined_internal_external_fallback(
    user_query: str,
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
    hidden_live_data: Dict[str, Any] | None,
    user_id: str | None = None,
) -> str:
    if not (_is_rapid_analytics_query(user_query) and _wants_explicit_external_context(user_query)):
        return ""

    internal_message = _build_local_analytics_response(
        messages,
        attachments,
        user_id=user_id,
    ).strip()
    external_message = _build_live_context_fallback_message(user_query, hidden_live_data).strip()

    if not internal_message:
        return external_message
    if not external_message:
        return (
            f"{internal_message}\n\n"
            "I couldn't confirm reliable fresh external context right now, so this answer is based on the internal data available."
        )

    internal_message = re.sub(
        r"\n\nWould you like a breakdown by region, practice, BDM, or account\?\s*$",
        "",
        internal_message,
        flags=re.IGNORECASE,
    ).strip()

    external_message = re.sub(r"(?i)^as of recent data[:,]?\s*", "", external_message).strip()

    return (
        f"{internal_message}\n\n"
        "External context that may matter:\n"
        f"{external_message}\n\n"
        "Would you like me to separate internal performance drivers from external market factors?"
    )


def _extract_recent_user_messages(messages: List[Dict[str, Any]], limit: int = 6) -> List[str]:
    recent = [
        str(message.get("content", "")).strip()
        for message in messages
        if str(message.get("role", "")).lower() == "user"
        and str(message.get("content", "")).strip()
    ]
    return recent[-limit:]


def _build_contextual_memory_entries(
    messages: List[Dict[str, Any]],
    assistant_message: str,
) -> List[str]:
    recent_user_messages = _extract_recent_user_messages(messages)
    if not recent_user_messages:
        return []

    combined_context = " ".join(recent_user_messages[-4:])
    entries: List[str] = []

    if any(_has_email_request_intent(item) and "leave" in item.lower() for item in recent_user_messages):
        reason = _extract_leave_reason(combined_context)
        leave_window = _extract_leave_window(combined_context)
        salutation = _extract_email_salutation(combined_context).replace("Dear ", "").rstrip(",")
        entries.append(f"User wants a leave request email addressed to {salutation}.")
        if leave_window and leave_window != "for [date(s)]":
            entries.append(f"Requested leave window: {leave_window}.")
        if reason:
            entries.append(f"Leave reason: {reason}.")

    latest_user = recent_user_messages[-1]
    latest_lower = latest_user.lower()
    if (
        len(latest_user.split()) >= 3
        and not latest_lower.startswith(("what is ", "who is ", "explain "))
        and latest_lower not in {"weather", "waether"}
    ):
        entries.append(f"Recent user context: {latest_user}")

    if assistant_message.startswith("Subject: Leave Request"):
        entries.append("Assistant drafted a leave request email for the user.")

    return _dedupe(entries)[:6]


def _remember_conversation(
    user_id: str | None,
    thread_id: str | None,
    messages: List[Dict[str, Any]],
    assistant_message: str,
) -> None:
    if not user_id or not thread_id:
        return

    entries = _build_contextual_memory_entries(messages, assistant_message)
    if not entries:
        return

    try:
        add_mem0_memories(user_id, thread_id, entries)
    except Exception:
        return


def _analyze_text_document(filename: str, content: bytes) -> Tuple[str, List[str]]:
    text = content.decode("utf-8", errors="ignore")
    words = re.findall(r"\b\w+\b", text)
    numbers = _extract_numbers(text)

    summary = f"{filename}: {len(words)} words, {len(text)} characters."
    if numbers:
        summary += f" Numeric profile: {_build_stats_summary(numbers)}."

    return summary, semantic_chunk_text(text)


def _analyze_csv_document(filename: str, content: bytes) -> Tuple[str, List[str]]:
    decoded = content.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(decoded))

    rows: List[Dict[str, str]] = []
    for index, row in enumerate(reader):
        if index >= 5000:
            break
        rows.append({key: (value or "") for key, value in row.items()})

    fieldnames = [field.strip() for field in (reader.fieldnames or []) if field]
    source_for_chunks = decoded

    if not rows:
        basic_rows = list(csv.reader(io.StringIO(decoded)))
        row_count = max(len(basic_rows) - 1, 0)
        column_count = max((len(row) for row in basic_rows), default=0)
        summary = f"{filename}: {row_count} rows, {column_count} columns."
        return summary, semantic_chunk_text(source_for_chunks)

    summary = f"{filename}: {len(rows)} rows, {len(fieldnames)} columns."
    numeric_column_summaries: List[str] = []

    for field in fieldnames:
        values: List[float] = []
        for row in rows:
            raw_value = row.get(field, "").strip().replace(",", "")
            if not raw_value:
                continue

            try:
                values.append(float(raw_value))
            except ValueError:
                continue

        if len(values) >= max(3, len(rows) // 4):
            numeric_column_summaries.append(f"{field} ({_build_stats_summary(values)})")

    if numeric_column_summaries:
        summary += " Numeric columns: " + "; ".join(numeric_column_summaries[:3]) + "."

    compact_rows = rows[:100]
    serialized_rows = json.dumps(compact_rows, ensure_ascii=True)
    source_for_chunks = (
        f"Columns: {', '.join(fieldnames)}\n"
        f"Sample rows: {serialized_rows}"
    )
    return summary, semantic_chunk_text(source_for_chunks)


def _collect_json_numbers(value: Any, values: List[float]) -> None:
    if isinstance(value, bool):
        return

    if isinstance(value, (int, float)):
        values.append(float(value))
        return

    if isinstance(value, list):
        for item in value:
            _collect_json_numbers(item, values)
        return

    if isinstance(value, dict):
        for item in value.values():
            _collect_json_numbers(item, values)


def _analyze_json_document(filename: str, content: bytes) -> Tuple[str, List[str]]:
    try:
        payload = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="JSON document is invalid.") from error

    if isinstance(payload, list):
        structure = f"array with {len(payload)} records"
    elif isinstance(payload, dict):
        structure = f"object with {len(payload)} top-level keys"
    else:
        structure = f"scalar JSON value of type {type(payload).__name__}"

    values: List[float] = []
    _collect_json_numbers(payload, values)
    summary = f"{filename}: parsed {structure}."

    if values:
        summary += f" Numeric profile: {_build_stats_summary(values)}."

    serialized_payload = json.dumps(payload, ensure_ascii=True)
    return summary, semantic_chunk_text(serialized_payload)


async def analyze_document_upload(document: UploadFile) -> Dict[str, Any]:
    filename = (document.filename or "document").strip() or "document"
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_DOCUMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Upload txt, md, csv, or json files for analysis.",
        )

    content = await document.read(MAX_DOCUMENT_SIZE_BYTES + 1)

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded document is empty.")

    if len(content) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Document exceeds 2MB limit.")

    if extension in {".txt", ".md"}:
        summary, chunks = _analyze_text_document(filename, content)
    elif extension == ".csv":
        summary, chunks = _analyze_csv_document(filename, content)
    else:
        summary, chunks = _analyze_json_document(filename, content)

    limited_chunks = chunks[:30]
    document_id = build_document_id(filename, summary, limited_chunks)

    rag_indexed = False
    rag_chunk_count = 0
    rag_store = get_rag_store()
    if rag_store.available:
        try:
            rag_chunk_count = rag_store.index_document(
                document_id=document_id,
                name=filename,
                summary=summary,
                chunks=limited_chunks,
            )
            rag_indexed = rag_chunk_count > 0
        except Exception:
            rag_indexed = False
            rag_chunk_count = 0

    return {
        "status": "analyzed",
        "document": {
            "id": document_id,
            "name": filename,
            "summary": summary,
            "chunks": limited_chunks,
            "ragIndexed": rag_indexed,
            "ragChunks": rag_chunk_count,
        },
    }


def _build_headers(api_key: str) -> Dict[str, str] | None:
    normalized_key = api_key.strip()
    if not normalized_key:
        return None

    token = (
        normalized_key[7:].strip()
        if normalized_key.lower().startswith("bearer ")
        else normalized_key
    )
    if not token:
        return None

    return {
        "Authorization": f"Bearer {token}",
        "Connection": "close",
        "Accept": "application/json",
    }


def _build_openai_payload(
    settings: Dict[str, Any],
    model: str,
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": REMOTE_SYSTEM_PROMPT},
            *_augment_messages_with_attachments(messages, attachments),
        ],
        "temperature": settings["localLlmTemperature"],
        "max_tokens": 420,
    }


def _build_ollama_payload(
    settings: Dict[str, Any],
    model: str,
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "model": model,
        "stream": False,
        "options": {
            "temperature": settings["localLlmTemperature"],
            "num_predict": 768,
        },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *_augment_messages_with_attachments(messages, attachments),
        ],
    }


def _build_openai_candidate_urls(settings: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []

    for raw_base in (
        str(settings.get("localLlmBaseUrl", "")).strip(),
        str(settings.get("localLlmPlatformBaseUrl", "")).strip(),
    ):
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        candidates.extend(
            (
                f"{base}/v1/chat/completions",
                f"{base}/chat/completions",
                f"{base}/api/v1/chat/completions",
            )
        )

    return _dedupe(candidates)


def _build_openai_model_urls(settings: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []

    for raw_base in (
        str(settings.get("localLlmBaseUrl", "")).strip(),
        str(settings.get("localLlmPlatformBaseUrl", "")).strip(),
    ):
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        candidates.extend((f"{base}/v1/models", f"{base}/models", f"{base}/api/v1/models"))

    return _dedupe(candidates)


def _build_ollama_candidate_urls(settings: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []

    for raw_base in (
        str(settings.get("localLlmBaseUrl", "")).strip(),
        str(settings.get("localLlmPlatformBaseUrl", "")).strip(),
    ):
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        candidates.extend((f"{base}/api/chat", f"{base}/chat"))

    return _dedupe(candidates)


def _build_ollama_model_urls(settings: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []

    for raw_base in (
        str(settings.get("localLlmBaseUrl", "")).strip(),
        str(settings.get("localLlmPlatformBaseUrl", "")).strip(),
    ):
        if not raw_base:
            continue

        base = raw_base.rstrip("/")
        candidates.append(f"{base}/api/tags")

    return _dedupe(candidates)


def _prioritize_models(models: List[str]) -> List[str]:
    if not models:
        return []

    preferred_keywords = (
        "general",
        "auto",
        "rag",
        "qwen",
        "mistral",
        "deepseek",
        "phi",
        "tinyllama",
    )

    def sort_key(model: str) -> Tuple[int, int]:
        lowered = model.lower()
        rank = next(
            (index for index, keyword in enumerate(preferred_keywords) if keyword in lowered),
            len(preferred_keywords),
        )
        return rank, len(model)

    return sorted(_dedupe(models), key=sort_key)


def _extract_message_from_openai(body: Dict[str, Any]) -> str:
    choices = body.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            content = first.get("message", {}).get("content")
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                parts: List[str] = []
                for part in content:
                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                        parts.append(part["text"].strip())
                if parts:
                    return "\n".join(parts).strip()

    message_content = body.get("message", {}).get("content")
    if isinstance(message_content, str):
        return message_content.strip()

    response_text = body.get("response")
    if isinstance(response_text, str):
        return response_text.strip()

    return ""


def _is_provider_error_message(message: str) -> bool:
    lower = message.strip().lower()
    if not lower:
        return True

    if any(
        marker in lower
        for marker in (
            "worker error",
            "unknown model",
            "invalid api key",
            "unauthorized",
            "forbidden",
            "error:",
            "error evaluating expression",
            "invalid syntax (<unknown>, line",
        )
    ):
        return True

    low_signal_markers = (
        "i can answer using document context",
        "upload files or ask a more specific question to proceed",
        "if you want, i can break this into beginner, intermediate, or technical depth",
        "in simple terms: it is a concept or system understood by looking at what it is, why it matters, and how it works in practice",
        "i can help with a clear explanation, practical examples, or a more detailed answer if you want one",
        "i can explain it clearly with examples. if useful, i can keep it short or go deeper",
        "i can help with that. share a bit more detail",
    )

    if any(marker in lower for marker in low_signal_markers):
        return True

    if "user:" in lower and "assistant:" in lower and len(lower.split()) <= 120:
        return True

    return False


async def _discover_openai_models(
    settings: Dict[str, Any],
    headers: Dict[str, str] | None,
) -> List[str]:
    cache = _MODEL_CACHE["openai"]
    now = time.monotonic()
    if cache["expires_at"] > now and cache["models"]:
        return list(cache["models"])

    model_urls = _build_openai_model_urls(settings)
    if not model_urls:
        return []

    discovered: List[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=1.2)) as client:
        for url in model_urls:
            try:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                body = response.json()
            except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
                continue

            data = body.get("data")
            if not isinstance(data, list):
                continue

            for item in data:
                if isinstance(item, dict):
                    model_id = item.get("id")
                    if isinstance(model_id, str):
                        discovered.append(model_id)

            if discovered:
                break

    deduped = _dedupe(discovered)
    _MODEL_CACHE["openai"] = {
        "expires_at": now + _MODEL_CACHE_TTL_SECONDS,
        "models": deduped,
    }
    return deduped


async def _discover_ollama_models(
    settings: Dict[str, Any],
    headers: Dict[str, str] | None,
) -> List[str]:
    cache = _MODEL_CACHE["ollama"]
    now = time.monotonic()
    if cache["expires_at"] > now and cache["models"]:
        return list(cache["models"])

    model_urls = _build_ollama_model_urls(settings)
    if not model_urls:
        return []

    discovered: List[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=1.2)) as client:
        for url in model_urls:
            try:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                body = response.json()
            except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
                continue

            models = body.get("models")
            if not isinstance(models, list):
                continue

            for item in models:
                if isinstance(item, dict):
                    name = item.get("name")
                    if isinstance(name, str):
                        discovered.append(name)

            if discovered:
                break

    deduped = _dedupe(discovered)
    _MODEL_CACHE["ollama"] = {
        "expires_at": now + _MODEL_CACHE_TTL_SECONDS,
        "models": deduped,
    }
    return deduped


async def list_available_models() -> Dict[str, Any]:
    settings = get_settings()
    headers = _build_headers(str(settings.get("localLlmApiKey", "")))
    configured_model = str(settings.get("localLlmModel", "")).strip()
    openai_models = await _discover_openai_models(settings, headers)
    ollama_models = await _discover_ollama_models(settings, headers)
    models = _prioritize_models([configured_model, *openai_models, *ollama_models])
    provider = "openai-compatible" if openai_models else "local-llm" if ollama_models else "offline"
    return {
        "configuredModel": configured_model,
        "models": models,
        "provider": provider,
    }


async def _request_remote_message(
    urls: List[str],
    models: List[str],
    payload_builder: Callable[[str], Dict[str, Any]],
    headers: Dict[str, str] | None,
) -> Tuple[str, str, str]:
    if not urls or not models:
        return "", "", "no_provider_candidates"

    max_attempts = 2
    attempts = 0
    deadline = time.monotonic() + 55.0
    last_issue = ""

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        for model in models[:3]:
            if time.monotonic() >= deadline:
                break
            payload = payload_builder(model)
            for url in urls[:3]:
                if time.monotonic() >= deadline or attempts >= max_attempts:
                    break
                attempts += 1
                try:
                    response = await client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                    body = response.json()
                except httpx.HTTPStatusError as error:
                    status_code = error.response.status_code if error.response is not None else "unknown"
                    response_text = ""
                    if error.response is not None:
                        try:
                            response_text = str(error.response.text or "").strip()
                        except Exception:
                            response_text = ""
                    last_issue = f"http_{status_code}:{response_text[:220]}".strip(":")
                    continue
                except httpx.RequestError as error:
                    last_issue = f"network_error:{str(error)}"
                    continue
                except ValueError:
                    last_issue = "invalid_json_response"
                    continue

                if "error" in body:
                    error_payload = body.get("error")
                    if isinstance(error_payload, dict):
                        error_message = (
                            str(error_payload.get("message") or error_payload.get("type") or "").strip()
                        )
                    else:
                        error_message = str(error_payload or "").strip()
                    last_issue = error_message or "provider_error"
                    continue

                message = _extract_message_from_openai(body)
                if message and not _is_provider_error_message(message):
                    return message, model, ""
            if attempts >= max_attempts:
                break

    return "", "", last_issue


def _build_remote_issue_note(issue: str) -> str:
    lower = str(issue or "").strip().lower()
    if not lower:
        return ""

    if any(
        marker in lower
        for marker in ("http_401", "http_403", "invalid api key", "unauthorized", "forbidden")
    ):
        return (
            "Note: Neural Switch could not access the configured external model because the API key was rejected "
            "(401/403). Please verify the API key in Admin settings."
        )

    if "http_429" in lower:
        return (
            "Note: The configured external model endpoint is currently rate-limited (429). "
            "Please retry in a moment."
        )

    if "network_error" in lower or "timed out" in lower or "connection" in lower:
        return (
            "Note: Neural Switch could not reach the configured external model endpoint. "
            "Please verify the base URL and network connectivity."
        )

    return ""


def _append_note(message: str, note: str) -> str:
    cleaned_message = str(message or "").strip()
    cleaned_note = str(note or "").strip()
    if not cleaned_note:
        return cleaned_message
    if cleaned_note.lower() in cleaned_message.lower():
        return cleaned_message
    if not cleaned_message:
        return cleaned_note
    return f"{cleaned_message}\n\n{cleaned_note}"


def _polish_final_response(
    message: str,
    voice: str = "chatgpt",
    mode: str = "default",
) -> str:
    text = re.sub(r"\r\n?", "\n", str(message or "")).strip()
    if not text:
        return "I can help with that. Share a bit more detail and I'll give you a precise answer."

    lower_text = text.lower()
    if "error evaluating expression" in lower_text or "invalid syntax (<unknown>, line" in lower_text:
        return (
            "I can explain this clearly in points.\n"
            "- Main idea\n"
            "- How it works\n"
            "- Practical example\n"
            "- Why it matters"
        )

    # Drop accidental transcript spillover from some providers.
    transcript_split = re.split(r"\n(?:User|Assistant):", text, maxsplit=1, flags=re.IGNORECASE)
    if transcript_split:
        text = transcript_split[0].strip()

    # Remove noisy source artifacts from any fallback path.
    cleaned_lines: List[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")
            continue

        lower = line.lower()
        if lower.startswith("source:"):
            continue
        if re.fullmatch(r"https?://\S+", line):
            continue
        if lower.startswith("result ") and ":" in lower:
            continue

        cleaned_lines.append(line)

    text = "\n".join(cleaned_lines).strip()
    if not text:
        return "I can help with that. Share a bit more detail and I'll give you a precise answer."

    replacements = {
        "here are the top results": "Here's the clearest answer",
        "according to search results": "Based on the latest available information",
        "based on the provided context": "Based on the latest available information",
        "the strongest choices right now are": "the best options are",
        "i found these": "here are the best options",
    }
    lowered = text.lower()
    for source, target in replacements.items():
        if source in lowered:
            pattern = re.compile(re.escape(source), re.IGNORECASE)
            text = pattern.sub(target, text)
            lowered = text.lower()

    for leak in _INTERNAL_LEAK_PATTERNS:
        if leak in lowered:
            if re.fullmatch(r"[a-zA-Z0-9_ ]+", leak):
                pattern = re.compile(rf"\b{re.escape(leak)}\b", re.IGNORECASE)
            else:
                pattern = re.compile(re.escape(leak), re.IGNORECASE)
            text = pattern.sub("", text)
            lowered = text.lower()

    text = re.sub(r"\[[^\]]*knowledge base[^\]]*\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b[\w \-]+\.(?:xlsx|xlsm|xls)\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if text and not re.search(r"[.!?]$", text):
        last_sentence_break = max(text.rfind("."), text.rfind("!"), text.rfind("?"))
        if last_sentence_break > 80:
            text = text[: last_sentence_break + 1].strip()
    return _apply_voice_style(text, voice=voice, mode=mode)


def _build_chat_response_payload(
    message: str,
    *,
    model: str,
    provider: str,
    voice: str,
    mode: str,
    user_id: str | None,
    thread_id: str | None,
    messages: List[Dict[str, Any]],
) -> Dict[str, Any]:
    polished = _polish_final_response(message, voice=voice, mode=mode)
    _remember_conversation(user_id, thread_id, messages, polished)
    return {
        "message": polished,
        "model": model,
        "provider": provider,
    }


async def generate_chat_response(
    messages: List[Dict[str, Any]],
    attachments: List[Dict[str, Any]] | None = None,
    user_id: str | None = None,
    thread_id: str | None = None,
    requested_model: str | None = None,
) -> Dict[str, Any]:
    if not messages:
        raise HTTPException(status_code=400, detail="Send at least one message.")

    normalized_attachments = list(attachments or [])
    settings = get_settings()
    raw_user_query = _extract_last_user_message(messages)
    semantic_user_query = _strip_style_directives(raw_user_query)
    effective_query = _derive_contextual_query(messages, semantic_user_query)
    response_mode = _detect_response_mode(effective_query)
    requested_voice = _detect_requested_voice(raw_user_query)
    dashboard_attachment = _build_dashboard_context_attachment(effective_query)
    if dashboard_attachment:
        normalized_attachments.append(dashboard_attachment)
    hidden_live_data = await _maybe_fetch_hidden_live_data(
        messages,
        query_override=effective_query,
    )
    hidden_live_context = _build_hidden_live_system_context(hidden_live_data)
    memory_context = _build_memory_system_context(user_id, effective_query)
    voice_instruction = _build_voice_instruction(requested_voice, response_mode)

    system_messages: List[Dict[str, Any]] = []
    if voice_instruction:
        system_messages.append({"role": "system", "content": voice_instruction})
    if memory_context:
        system_messages.append({"role": "system", "content": memory_context})
    if hidden_live_context:
        system_messages.append({"role": "system", "content": hidden_live_context})

    messages_for_generation: List[Dict[str, Any]] = [*system_messages, *messages]
    if _should_prefer_local_response(messages, normalized_attachments, user_id=user_id):
        return _build_chat_response_payload(
            _build_local_analytics_response(
                messages_for_generation,
                normalized_attachments,
                user_id=user_id,
            ),
            model="rapid-local-smart",
            provider="local-deterministic",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    if not settings.get("localLlmEnabled", True):
        combined_fallback = _build_combined_internal_external_fallback(
            effective_query,
            messages_for_generation,
            normalized_attachments,
            hidden_live_data,
            user_id=user_id,
        )
        if combined_fallback:
            return _build_chat_response_payload(
                combined_fallback,
                model="rapid-live",
                provider="local-live-context",
                voice=requested_voice,
                mode=response_mode,
                user_id=user_id,
                thread_id=thread_id,
                messages=messages,
            )

        live_fallback = _build_live_context_fallback_message(
            effective_query,
            hidden_live_data,
        )
        if live_fallback:
            return _build_chat_response_payload(
                live_fallback,
                model="rapid-live",
                provider="local-live-context",
                voice=requested_voice,
                mode=response_mode,
                user_id=user_id,
                thread_id=thread_id,
                messages=messages,
            )

        return _build_chat_response_payload(
            _build_local_analytics_response(
                messages_for_generation,
                normalized_attachments,
                user_id=user_id,
            ),
            model="rapid-fallback",
            provider="local-deterministic",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    headers = _build_headers(str(settings.get("localLlmApiKey", "")))
    configured_model = str(requested_model or settings.get("localLlmModel", "")).strip()

    discovered_openai_models = await _discover_openai_models(settings, headers)
    openai_model_candidates = _dedupe(
        [
            configured_model,
            "rapid-auto",
            "rapid-general",
            "rapid-rag",
            *discovered_openai_models[:8],
        ]
    )
    openai_message, openai_model, openai_issue = await _request_remote_message(
        _build_openai_candidate_urls(settings),
        openai_model_candidates,
        lambda model: _build_openai_payload(
            settings, model, messages_for_generation, normalized_attachments
        ),
        headers,
    )
    if openai_message:
        return _build_chat_response_payload(
            openai_message,
            model=openai_model or configured_model or "openai-compatible",
            provider="openai-compatible",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    discovered_ollama_models = await _discover_ollama_models(settings, headers)
    ollama_model_candidates = _prioritize_models(
        [configured_model, *discovered_ollama_models[:8]]
    )
    ollama_message, ollama_model, ollama_issue = await _request_remote_message(
        _build_ollama_candidate_urls(settings),
        ollama_model_candidates,
        lambda model: _build_ollama_payload(
            settings, model, messages_for_generation, normalized_attachments
        ),
        headers,
    )
    if ollama_message:
        return _build_chat_response_payload(
            ollama_message,
            model=ollama_model or configured_model or "local-llm",
            provider="local-llm",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    remote_issue_note = _build_remote_issue_note(openai_issue or ollama_issue)

    live_fallback = _build_live_context_fallback_message(
        effective_query,
        hidden_live_data,
    )
    combined_fallback = _build_combined_internal_external_fallback(
        effective_query,
        messages_for_generation,
        normalized_attachments,
        hidden_live_data,
        user_id=user_id,
    )
    if combined_fallback:
        return _build_chat_response_payload(
            _append_note(combined_fallback, remote_issue_note),
            model="rapid-live",
            provider="local-live-context",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    if live_fallback:
        return _build_chat_response_payload(
            _append_note(live_fallback, remote_issue_note),
            model="rapid-live",
            provider="local-live-context",
            voice=requested_voice,
            mode=response_mode,
            user_id=user_id,
            thread_id=thread_id,
            messages=messages,
        )

    return _build_chat_response_payload(
        _append_note(
            _build_local_analytics_response(
                messages_for_generation,
                normalized_attachments,
                user_id=user_id,
            ),
            remote_issue_note,
        ),
        model="rapid-fallback",
        provider="local-deterministic",
        voice=requested_voice,
        mode=response_mode,
        user_id=user_id,
        thread_id=thread_id,
        messages=messages,
    )
