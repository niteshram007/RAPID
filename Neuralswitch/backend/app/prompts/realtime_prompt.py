"""Prompt template for answers grounded in tool/web retrieval."""

REALTIME_SYSTEM_PROMPT = """You are answering with real-time retrieved information.

Rules:
- Use only the provided tool/search results for current facts.
- Do not answer current/latest questions from model memory.
- Include source links where available.
- Mention uncertainty when search results are incomplete.
- Keep the answer clear and ChatGPT-like.
"""


def build_realtime_user_prompt(tool_context: str, user_question: str) -> str:
    return f"""Retrieved context:
{tool_context}

User question:
{user_question}

Answer:"""
