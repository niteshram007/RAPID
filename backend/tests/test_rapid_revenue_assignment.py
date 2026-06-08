from __future__ import annotations

import unittest

from backend.app.rapid_revenue_store import (
    MONTH_KEY_BY_LABEL,
    _clear_assignment_metadata,
    _convert_local_budget_to_usd,
    _is_geo_head_revert_to_original,
    _overlay_payload_with_values,
    _split_reassignment_values,
)
from backend.app.masterdata_store import _global_revenue_upload_month_rank


class RapidRevenueAssignmentTests(unittest.TestCase):
    def test_split_reassignment_zeroes_old_future_months_and_new_prior_months(self) -> None:
        values = {month_key: 10 for month_key in MONTH_KEY_BY_LABEL.values()}
        values.update({"q1": 30, "q2": 30, "q3": 30, "q4": 30, "fy": 120})

        old_values, new_values = _split_reassignment_values(
            values,
            future_month_keys=[
                MONTH_KEY_BY_LABEL["Jul 2026"],
                MONTH_KEY_BY_LABEL["Aug 2026"],
                MONTH_KEY_BY_LABEL["Sep 2026"],
                MONTH_KEY_BY_LABEL["Oct 2026"],
                MONTH_KEY_BY_LABEL["Nov 2026"],
                MONTH_KEY_BY_LABEL["Dec 2026"],
                MONTH_KEY_BY_LABEL["Jan 2027"],
                MONTH_KEY_BY_LABEL["Feb 2027"],
                MONTH_KEY_BY_LABEL["Mar 2027"],
            ],
        )

        self.assertEqual(old_values[MONTH_KEY_BY_LABEL["Apr 2026"]], 10)
        self.assertEqual(old_values[MONTH_KEY_BY_LABEL["Jul 2026"]], 0)
        self.assertEqual(new_values[MONTH_KEY_BY_LABEL["Apr 2026"]], 0)
        self.assertEqual(new_values[MONTH_KEY_BY_LABEL["Jul 2026"]], 10)
        self.assertEqual(old_values["fy"], 30)
        self.assertEqual(new_values["fy"], 90)
        self.assertEqual(old_values["q1"], 30)
        self.assertEqual(new_values["q2"], 30)

    def test_global_revenue_upload_month_uses_fiscal_order(self) -> None:
        self.assertGreater(
            _global_revenue_upload_month_rank("Mar"),
            _global_revenue_upload_month_rank("Dec"),
        )
        self.assertGreater(
            _global_revenue_upload_month_rank("Apr"),
            _global_revenue_upload_month_rank(""),
        )

    def test_geo_head_revert_to_original_is_detected(self) -> None:
        payload = {"Assignment Split": {"type": "geo_head", "from": "Old Geo", "to": "New Geo"}}

        self.assertTrue(
            _is_geo_head_revert_to_original(
                payload,
                current_geo_head="New Geo",
                target_geo_head="Old Geo",
            )
        )
        self.assertFalse(
            _is_geo_head_revert_to_original(
                payload,
                current_geo_head="New Geo",
                target_geo_head="Third Geo",
            )
        )

    def test_assignment_metadata_can_be_removed_from_payload(self) -> None:
        payload = {
            "Customer Name": "Acme",
            "Assignment Split": {"type": "geo_head", "from": "Old Geo", "to": "New Geo"},
        }

        self.assertEqual(_clear_assignment_metadata(payload), {"Customer Name": "Acme"})

    def test_overlay_payload_with_values_updates_export_labels(self) -> None:
        payload = {"Customer Name": "Legacy", "FY": 0}
        next_payload = _overlay_payload_with_values(
            payload,
            {
                "customer_name": "Updated Customer",
                "fy": 120,
            },
        )

        self.assertEqual(next_payload["Customer Name"], "Updated Customer")
        self.assertEqual(next_payload["FY"], 120)
        self.assertNotIn("Assignment Split", next_payload)

    def test_budget_to_forecast_usd_uses_forex_for_non_usd_rows(self) -> None:
        self.assertEqual(_convert_local_budget_to_usd(100, "USD", 83), 100)
        self.assertAlmostEqual(_convert_local_budget_to_usd(8300, "INR", 83), 100)


if __name__ == "__main__":
    unittest.main()
