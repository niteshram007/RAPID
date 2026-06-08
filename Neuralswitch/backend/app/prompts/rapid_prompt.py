"""RAPID domain knowledge + result-explanation prompt.

This codifies the RAPID Revenue Analytics business rules so the LLM can explain
query results in a business-friendly way once the RAPID database is connected.
"""

RAPID_DOMAIN_CONTEXT = """RAPID Revenue Analytics domain knowledge:

Key concepts: Budget, Actual, Forecast, MTD, YTD, FY, FY 2027, Q1/Q2/Q3/Q4, Geo,
Geo Head, BDM, Practice Head, Customer, Project, Revenue, Revenue Book Currency,
Fx Rate, Variance, Revenue Gap, MS/PS, OCN Number, Emp ID, Strategic Account,
Delivery Manager.

Business rules:
- For MS records, use OCN Number as the reference key.
- For PS records, use Emp ID as the reference key.
- Budget, Actual and Forecast are compared using normalized customer/project grouping.
- YTD = from financial year start to the selected/current month.
- MTD = the selected/current month only.
- FY 2027 = Apr 2026 to Mar 2027.
- Variance = Actual - Budget, or Forecast - Budget (depending on the question).
- Negative variance = underperformance. Positive variance = overperformance.
"""

RAPID_EXPLANATION_PROMPT = """You are a senior revenue analyst explaining a query result to a business stakeholder.

{domain}

You are given the user's question and the structured result of a read-only database query.
Explain the result clearly and concisely:
- Lead with the direct answer.
- Highlight key numbers and the variance interpretation (negative = underperformance).
- Use a short bulleted summary; reference the table where helpful.
- Do not invent numbers that are not in the result.

User Question:
{question}

Query Result (JSON):
{result}

Answer:"""
