from __future__ import annotations

import unittest

from backend.app.services.budget_upload_mapping_service import (
    enrich_row_from_match,
    find_fuzzy_match,
    generate_mapping_key,
    process_budget_upload,
    validate_budget_row,
)


class BudgetUploadMappingServiceTests(unittest.TestCase):
    def test_ps_valid_row_with_emp_id_and_no_ocn(self) -> None:
        row = {
            "ps_ms_budget": "PS",
            "emp_id": "1001",
            "ocn_number": "",
        }
        validation = validate_budget_row(row, 2)
        self.assertEqual(validation["validation_status"], "Valid")
        self.assertEqual(validation["primary_identifier_type"], "Emp ID")
        self.assertEqual(validation["primary_identifier_value"], "1001")

    def test_ms_valid_row_with_ocn_and_no_emp_id(self) -> None:
        row = {
            "ps_ms_budget": "MS",
            "emp_id": "",
            "ocn_number": "OCN123",
        }
        validation = validate_budget_row(row, 3)
        self.assertEqual(validation["validation_status"], "Valid")
        self.assertEqual(validation["primary_identifier_type"], "OCN Number")
        self.assertEqual(validation["primary_identifier_value"], "OCN123")

    def test_ps_invalid_row_without_emp_id(self) -> None:
        row = {"ps_ms_budget": "PS", "emp_id": "", "ocn_number": "OCN999"}
        validation = validate_budget_row(row, 4)
        self.assertEqual(validation["validation_status"], "Error")
        self.assertIn("Emp ID is required", validation["validation_message"])

    def test_ms_invalid_row_without_ocn(self) -> None:
        row = {"ps_ms_budget": "MS", "emp_id": "", "ocn_number": ""}
        validation = validate_budget_row(row, 5)
        self.assertEqual(validation["validation_status"], "Error")
        self.assertIn("OCN Number is required", validation["validation_message"])

    def test_invalid_ps_ms_value(self) -> None:
        row = {"ps_ms_budget": "service", "emp_id": "1001"}
        validation = validate_budget_row(row, 6)
        self.assertEqual(validation["validation_status"], "Error")
        self.assertIn("missing or invalid", validation["validation_message"])

    def test_missing_region_gets_enriched_from_actuals(self) -> None:
        budget_row = {
            "ps_ms_budget": "PS",
            "emp_id": "1001",
            "customer_name": "ABC Corp",
            "project_name": "App Development",
            "region": "",
        }
        actual_row = {
            "region": "North America",
            "company": "Mindteck",
        }
        enriched, enriched_fields = enrich_row_from_match(budget_row, actual_row)
        self.assertEqual(enriched["region"], "North America")
        self.assertIn("region", enriched_fields)

    def test_existing_budget_region_is_not_overwritten(self) -> None:
        budget_row = {
            "ps_ms_budget": "PS",
            "emp_id": "1001",
            "customer_name": "ABC Corp",
            "project_name": "App Development",
            "region": "Europe",
        }
        actual_row = {
            "region": "North America",
            "company": "Mindteck",
        }
        enriched, enriched_fields = enrich_row_from_match(
            budget_row,
            actual_row,
            overwrite_existing=False,
        )
        self.assertEqual(enriched["region"], "Europe")
        self.assertNotIn("region", enriched_fields)

    def test_mapping_key_generation(self) -> None:
        row = {
            "ps_ms_budget": "PS",
            "emp_id": "1001.0",
            "customer_name": "ABC Corp",
            "project_name": "App Development",
        }
        mapping_key = generate_mapping_key(row)
        self.assertEqual(mapping_key, "PS_1001_ABC_CORP_APP_DEVELOPMENT")

    def test_fuzzy_match_above_92(self) -> None:
        budget_row = {
            "customer_name": "Micro Soft",
            "project_name": "App",
            "ps_ms_budget": "PS",
            "emp_id": "1001",
        }
        actual_rows = [
            {
                "customer_name": "Microsoft",
                "project_name": "App",
                "_match_source": "Actuals",
            }
        ]
        match = find_fuzzy_match(budget_row, actual_rows, auto_threshold=92, manual_threshold=80)
        self.assertEqual(match.match_status, "Fuzzy Match")
        self.assertGreaterEqual(match.match_confidence, 92)

    def test_fuzzy_match_between_80_and_91_goes_manual_review(self) -> None:
        budget_row = {
            "customer_name": "Global Tech",
            "project_name": "Platform",
            "ps_ms_budget": "MS",
            "ocn_number": "OCN-7",
        }
        actual_rows = [
            {
                "customer_name": "Global Technology",
                "project_name": "Platform",
                "_match_source": "Actuals",
            }
        ]
        match = find_fuzzy_match(budget_row, actual_rows, auto_threshold=92, manual_threshold=80)
        self.assertEqual(match.match_status, "Manual Review")
        self.assertGreaterEqual(match.match_confidence, 80)
        self.assertLess(match.match_confidence, 92)

    def test_process_budget_upload_marks_validation_and_enrichment(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "PS",
                "Emp ID": "1001",
                "Customer Name": "ABC Corp",
                "Project Name": "App Development",
                "Region": "",
            },
            {
                "PS/MS budget": "MS",
                "OCN Number": "",
                "Customer Name": "XYZ Ltd",
                "Project Name": "Managed Service",
            },
        ]
        actual_rows = [
            {
                "emp_id": "1001",
                "customer_name": "ABC Corp",
                "project_name": "App Development",
                "region": "North America",
                "company": "Mindteck",
            }
        ]

        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=actual_rows,
            master_data=None,
            overwrite_existing=False,
        )
        self.assertEqual(output["summary"]["total_rows"], 2)
        self.assertEqual(output["summary"]["error_rows"], 1)
        first = output["processed_rows"][0]
        self.assertEqual(first["validation_status"], "Valid")
        self.assertEqual(first["region"], "North America")
        second = output["processed_rows"][1]
        self.assertEqual(second["validation_status"], "Error")

    def test_ms_row_uses_ocn_to_standardize_customer_and_project(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "MS",
                "OCN Number": "OCN123",
                "Emp ID": "",
                "Customer Name": "Micro Soft",
                "Project Name": "Azure Supprt",
            }
        ]
        actual_rows = [
            {
                "ms_ps": "MS",
                "ocn_number": "OCN123",
                "customer_name": "Microsoft India Pvt Ltd",
                "updated_customer": "Microsoft",
                "project_name": "Azure Support Services",
            }
        ]
        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=actual_rows,
            master_data=None,
            overwrite_existing=False,
        )
        row = output["processed_rows"][0]
        self.assertEqual(row["primary_reference_type"], "OCN Number")
        self.assertEqual(row["primary_reference_value"], "OCN123")
        self.assertEqual(row["standard_customer_name"], "Microsoft")
        self.assertEqual(row["standard_project_name"], "Azure Support Services")
        self.assertFalse(row["needs_manual_review"])

    def test_ps_row_uses_emp_id_to_standardize_customer_and_project(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "PS",
                "Emp ID": "1001",
                "OCN Number": "",
                "Customer Name": "ABC Tech",
                "Project Name": "Data Engg",
            }
        ]
        actual_rows = [
            {
                "ms_ps": "PS",
                "emp_id": "1001",
                "customer_name": "ABC Technologies Pvt Ltd",
                "updated_customer": "ABC Technologies",
                "project_name": "Data Engineering Support",
            }
        ]
        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=actual_rows,
            master_data=None,
            overwrite_existing=False,
        )
        row = output["processed_rows"][0]
        self.assertEqual(row["primary_reference_type"], "Emp ID")
        self.assertEqual(row["primary_reference_value"], "1001")
        self.assertEqual(row["standard_customer_name"], "ABC Technologies")
        self.assertEqual(row["standard_project_name"], "Data Engineering Support")
        self.assertFalse(row["needs_manual_review"])

    def test_ms_row_does_not_match_by_customer_name_without_ocn_match(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "MS",
                "OCN Number": "OCN999",
                "Emp ID": "",
                "Customer Name": "Microsoft",
                "Project Name": "Azure Support Services",
            }
        ]
        actual_rows = [
            {
                "ms_ps": "MS",
                "ocn_number": "OCN123",
                "customer_name": "Microsoft India Pvt Ltd",
                "updated_customer": "Microsoft",
                "project_name": "Azure Support Services",
            }
        ]
        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=actual_rows,
            master_data=None,
            overwrite_existing=False,
        )
        row = output["processed_rows"][0]
        self.assertEqual(row["match_status"], "Unmatched")
        self.assertTrue(row["needs_manual_review"])

    def test_ms_row_with_multiple_ocn_candidates_same_customer_auto_resolves(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "MS",
                "OCN Number": "OCN-321",
                "Customer Name": "Rocket Software Connectivity Deutschland GmbH",
                "Project Name": "Connectivity Support",
            }
        ]
        actual_rows = [
            {
                "ms_ps": "MS",
                "ocn_number": "OCN321",
                "customer_name": "Rocket Software Connectivity Deutschland GmbH",
                "updated_customer": "Rocket Software",
                "project_name": "Connectivity Support Services",
                "month": "Mar",
            },
            {
                "ms_ps": "MS",
                "ocn_number": "OCN321",
                "customer_name": "Rocket Software Connectivity Deutschland GmbH",
                "updated_customer": "Rocket Software",
                "project_name": "Connectivity Platform Transition",
                "month": "Jan",
            },
        ]
        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=actual_rows,
            master_data=None,
            overwrite_existing=False,
        )
        row = output["processed_rows"][0]
        self.assertEqual(row["match_status"], "Auto Enriched")
        self.assertEqual(row["primary_reference_type"], "OCN Number")
        self.assertEqual(row["standard_customer_name"], "Rocket Software")
        self.assertEqual(row["standard_project_name"], "Connectivity Support Services")
        self.assertFalse(row["needs_manual_review"])

    def test_unmatched_reference_does_not_auto_match_from_master_data_aliases(self) -> None:
        budget_rows = [
            {
                "PS/MS budget": "MS",
                "OCN Number": "OCN999",
                "Customer Name": "Vivancemed India Private Limited",
                "Project Name": "Managed Care",
            }
        ]
        master_rows = [
            {
                "ms_ps": "MS",
                "ocn_number": "OCN999",
                "customer_name": "VivanceMed",
                "project_name": "Managed Care Services",
            }
        ]
        output = process_budget_upload(
            budget_rows=budget_rows,
            actuals_rows=[],
            master_data=master_rows,
            overwrite_existing=False,
        )
        row = output["processed_rows"][0]
        self.assertEqual(row["match_status"], "Unmatched")
        self.assertTrue(row["needs_manual_review"])


if __name__ == "__main__":
    unittest.main()
