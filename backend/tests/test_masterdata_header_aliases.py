from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from backend.app.masterdata_dataset import parse_masterdata_workbook
from backend.app.masterdata_store import _hydrate_masterdata_values_from_raw_payload


class MasterdataHeaderAliasTests(unittest.TestCase):
    def test_global_revenue_accepts_emp_id_and_updated_customer_headers(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Actuals"
        sheet.append(
            [
                "Updated Customer",
                "MS/PS",
                "Resource Name",
                "Project Name",
                "Emp ID",
                "Rate Type",
                "Billed currency",
                "Forex",
                "Apr 2026",
                "May 2026",
            ]
        )
        sheet.append(
            [
                "Contoso",
                "MS",
                "Alex Kumar",
                "Cloud Ops",
                "EMP-1042",
                "Monthly",
                "USD",
                1,
                12000,
                13000,
            ]
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "actuals-aliases.xlsx"
            workbook.save(path)
            parsed = parse_masterdata_workbook(path, "global_revenue")

        self.assertEqual(parsed.missing_required_columns, [])
        self.assertEqual(len(parsed.rows), 1)
        row_values = parsed.rows[0].values
        self.assertEqual(row_values.get("customer_name"), "Contoso")
        self.assertEqual(row_values.get("resource_id"), "EMP-1042")

    def test_raw_payload_hydration_backfills_updated_customer_and_emp_id(self) -> None:
        hydrated = _hydrate_masterdata_values_from_raw_payload(
            values={"customer_name": "", "resource_id": ""},
            raw_payload={
                "Updated Customer": "Fabrikam",
                "Emp ID": "EMP-7788",
            },
        )

        self.assertEqual(hydrated.get("customer_name"), "Fabrikam")
        self.assertEqual(hydrated.get("resource_id"), "EMP-7788")


if __name__ == "__main__":
    unittest.main()

