"""Prompt for converting a business question into safe, read-only SQL.

Used by the (future) RAPID analytics mode. The generated SQL is always validated
by `app.services.safety_service` before any execution.
"""

SQL_GENERATION_PROMPT = """You convert business questions into a single read-only PostgreSQL SELECT query.

Hard rules:
- Output ONLY one SQL query, nothing else. No explanation, no markdown fences.
- The query MUST be a single SELECT statement.
- NEVER use: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, EXECUTE.
- NEVER use "SELECT *" — always select explicit columns.
- Only use the approved tables and columns provided in the schema below.
- Always add a LIMIT clause (max 1000 rows).

Approved schema:
{schema}

Business question:
{question}

SQL:"""
