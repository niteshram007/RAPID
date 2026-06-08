from __future__ import annotations

import unittest

from backend.app.neuralswitch.intent_classifier import classify_intent


class NeuralSwitchIntentClassifierTests(unittest.TestCase):
    def test_budget_question(self) -> None:
        intent = classify_intent("Show budget by BDM for FY27")
        self.assertEqual(intent.primary_intent, "budget_analysis")
        self.assertTrue(intent.requires_database)

    def test_actual_revenue_question(self) -> None:
        intent = classify_intent("What is actual revenue for this month?")
        self.assertEqual(intent.primary_intent, "actual_revenue_analysis")

    def test_forecast_question(self) -> None:
        intent = classify_intent("Compare forecast vs actual")
        self.assertEqual(intent.primary_intent, "forecast_analysis")

    def test_forex_question(self) -> None:
        intent = classify_intent("Explain forex impact by currency")
        self.assertEqual(intent.primary_intent, "forex_analysis")
        self.assertTrue(intent.requires_forex)

    def test_document_question(self) -> None:
        intent = classify_intent("Analyze this uploaded xlsx file")
        self.assertEqual(intent.primary_intent, "document_question")
        self.assertTrue(intent.requires_document_analysis)

    def test_follow_up_question(self) -> None:
        intent = classify_intent("What about US PS only?", previous_user_message="Show budget vs actual")
        self.assertEqual(intent.primary_intent, "follow_up_question")
        self.assertTrue(intent.requires_followup_context)

    def test_unsafe_request(self) -> None:
        intent = classify_intent("Delete all revenue records")
        self.assertEqual(intent.primary_intent, "unsupported_or_unsafe")


if __name__ == "__main__":
    unittest.main()
