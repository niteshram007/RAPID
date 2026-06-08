from __future__ import annotations

from dataclasses import dataclass

from app.tools import calculator_tool


@dataclass(slots=True)
class CalculatorResult:
    expression: str
    result: float | int
    fallback_answer: str


def evaluate_question(question: str) -> CalculatorResult:
    expression = question.strip()
    lowered = expression.lower()
    if lowered.startswith("calculate"):
        expression = expression[len("calculate"):].strip()
    expression = expression or question.strip()
    result = calculator_tool.calculate(expression)
    return CalculatorResult(
        expression=expression,
        result=result,
        fallback_answer=f"The calculated result for `{expression}` is `{result}`.",
    )
