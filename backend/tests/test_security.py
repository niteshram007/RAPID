from __future__ import annotations

import unittest
from uuid import uuid4

from fastapi import HTTPException

from backend.app.security import check_rate_limit, sanitize_export_cell
from backend.app.upload_security import validate_upload_extension, validate_upload_filename


class SecurityUtilityTests(unittest.TestCase):
    def test_sanitize_export_cell_prefixes_formula_like_values(self) -> None:
        self.assertEqual(sanitize_export_cell("=SUM(A1:A2)"), "'=SUM(A1:A2)")
        self.assertEqual(sanitize_export_cell("+cmd"), "'+cmd")
        self.assertEqual(sanitize_export_cell("@payload"), "'@payload")
        self.assertEqual(sanitize_export_cell("-cmd"), "'-cmd")
        self.assertEqual(sanitize_export_cell("-42"), "-42")

    def test_upload_filename_rejects_path_traversal_and_double_extension(self) -> None:
        with self.assertRaises(HTTPException):
            validate_upload_filename("../budget.xlsx")
        with self.assertRaises(HTTPException):
            validate_upload_filename("budget.xlsx.exe")
        self.assertEqual(validate_upload_filename("budget upload.xlsx"), "budget upload.xlsx")

    def test_upload_extension_allows_budget_csv_only_for_supported_datasets(self) -> None:
        self.assertEqual(validate_upload_extension("budget.csv", "budget"), ".csv")
        with self.assertRaises(HTTPException):
            validate_upload_extension("forecast.csv", "forecast")
        with self.assertRaises(HTTPException):
            validate_upload_extension("macro.xlsm", "budget")

    def test_rate_limit_blocks_after_threshold(self) -> None:
        key = f"test:{uuid4()}"
        self.assertTrue(check_rate_limit(key, 2, 60))
        self.assertTrue(check_rate_limit(key, 2, 60))
        self.assertFalse(check_rate_limit(key, 2, 60))


if __name__ == "__main__":
    unittest.main()
