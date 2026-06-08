from __future__ import annotations

import pandas as pd

from backend.app import revenue_analytics as analytics


def _overview_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "customer_name": "",
        "project_name": "",
        "resource_name": "",
        "ms_ps": "",
        "region": "",
        "practice_head": "",
        "geo_head": "",
        "bdm": "",
        "entity": "",
        "vertical": "",
        "deal_type": "",
        "business_type": "",
        "strategic_account": "",
        "eeennn": "",
        "ocn_number": "",
        "resource_id": "",
        "client_name": "",
        "month": "Apr",
        "amount": 0.0,
    }
    row.update(overrides)
    return row


def test_prepare_mapped_overview_frame_maps_ms_rows_by_ocn() -> None:
    actual_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Victor Insurance Managers LLC",
                project_name="MS Renewal",
                resource_name="",
                ms_ps="MS",
                ocn_number="OCN-1001",
                region="USA",
                practice_head="Practice A",
                amount=100.0,
            )
        ]
    )
    budget_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Victor Insurance Mgrs",
                project_name="Legacy Name",
                ms_ps="MS",
                ocn_number="OCN1001",
                region="",
                amount=50.0,
            )
        ]
    )

    actual_lookup = analytics._build_actual_dimension_lookup(actual_df)
    identifier_lookup = analytics._build_actual_identifier_lookup(actual_df)
    mapped = analytics._prepare_mapped_overview_frame(
        budget_df,
        actual_lookup,
        identifier_lookup,
    )

    assert mapped.iloc[0]["customer_name"] == "Victor Insurance Managers LLC"
    assert mapped.iloc[0]["project_name"] == "MS Renewal"
    assert mapped.iloc[0]["region"] == "USA"


def test_prepare_mapped_overview_frame_maps_ps_rows_by_emp_id() -> None:
    actual_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Huawei International Pte. Ltd.",
                project_name="PS Transformation",
                resource_name="John Analyst",
                ms_ps="PS",
                resource_id="1001",
                region="ROW",
                bdm="Ravi",
                amount=75.0,
            )
        ]
    )
    budget_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Huawei Intl",
                project_name="Wrong Project",
                resource_name="Unknown",
                ms_ps="PS",
                resource_id="1001.0",
                region="",
                amount=25.0,
            )
        ]
    )

    actual_lookup = analytics._build_actual_dimension_lookup(actual_df)
    identifier_lookup = analytics._build_actual_identifier_lookup(actual_df)
    mapped = analytics._prepare_mapped_overview_frame(
        budget_df,
        actual_lookup,
        identifier_lookup,
    )

    assert mapped.iloc[0]["customer_name"] == "Huawei International Pte. Ltd."
    assert mapped.iloc[0]["project_name"] == "PS Transformation"
    assert mapped.iloc[0]["resource_name"] == "John Analyst"
    assert mapped.iloc[0]["bdm"] == "Ravi"


def test_prepare_mapped_overview_frame_maps_ms_rows_when_msps_missing_but_ocn_exists() -> None:
    actual_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="PHILIPS GLOBAL BUSINESS SERVICES LLP",
                project_name="Managed Support",
                ms_ps="MS",
                ocn_number="OCN-PH-7788",
                region="USA",
                amount=220.0,
            )
        ]
    )
    budget_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Philips Global",
                project_name="Legacy",
                ms_ps="",
                ocn_number="OCNPH7788",
                region="",
                amount=190.0,
            )
        ]
    )

    actual_lookup = analytics._build_actual_dimension_lookup(actual_df)
    identifier_lookup = analytics._build_actual_identifier_lookup(actual_df)
    mapped = analytics._prepare_mapped_overview_frame(
        budget_df,
        actual_lookup,
        identifier_lookup,
    )

    assert mapped.iloc[0]["ms_ps"] == "MS"
    assert mapped.iloc[0]["customer_name"] == "PHILIPS GLOBAL BUSINESS SERVICES LLP"
    assert mapped.iloc[0]["project_name"] == "Managed Support"


def test_normalize_overview_frame_inferrs_ms_ps_from_identifiers() -> None:
    frame = pd.DataFrame(
        [
            _overview_row(ms_ps="", ocn_number="OCN-4455", resource_id="", amount=10.0),
            _overview_row(ms_ps="", ocn_number="", resource_id="3001.0", amount=12.0),
            _overview_row(ms_ps="Managed Services", ocn_number="", resource_id="", amount=14.0),
            _overview_row(ms_ps="Professional Services", ocn_number="", resource_id="", amount=16.0),
        ]
    )

    normalized = analytics._normalize_overview_frame(frame)

    assert normalized.iloc[0]["ms_ps"] == "MS"
    assert normalized.iloc[1]["ms_ps"] == "PS"
    assert normalized.iloc[2]["ms_ps"] == "MS"
    assert normalized.iloc[3]["ms_ps"] == "PS"


def test_monthly_comparison_rows_clamp_negative_actual_values() -> None:
    budget_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Philips Global Business Services LLP",
                ms_ps="MS",
                ocn_number="OCN-PH-001",
                month="Apr",
                amount=120.0,
            )
        ]
    )
    forecast_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Philips Global Business Services LLP",
                ms_ps="MS",
                ocn_number="OCN-PH-001",
                month="Apr",
                amount=120.0,
            )
        ]
    )
    actual_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Philips Global Business Services LLP",
                ms_ps="MS",
                ocn_number="OCN-PH-001",
                month="Apr",
                amount=-33.0,
            )
        ]
    )

    rows = analytics._build_monthly_comparison_rows(
        budget_df=analytics._normalize_overview_frame(budget_df),
        forecast_df=analytics._normalize_overview_frame(forecast_df),
        actual_df=analytics._normalize_overview_frame(actual_df),
        months=["Apr"],
    )

    assert len(rows) == 1
    assert rows[0]["budget"] == 120.0
    assert rows[0]["forecast"] == 120.0
    assert rows[0]["actual"] == 0.0
    assert rows[0]["varianceVsBudget"] == -120.0


def test_monthly_comparison_rows_merge_budget_actual_by_ocn_with_alias_names() -> None:
    actual_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Huawei International Pte. Ltd.",
                project_name="ITS Managed",
                ms_ps="MS",
                ocn_number="ITITSADE/2023-2024/1611",
                vertical="ITS",
                month="Apr",
                amount=180.0,
            )
        ]
    )
    budget_df = pd.DataFrame(
        [
            _overview_row(
                customer_name="Huawei Intl",
                project_name="Legacy Name",
                ms_ps="",
                ocn_number="ITITSADE202320241611",
                vertical="",
                month="Apr",
                amount=220.0,
            )
        ]
    )

    actual_lookup = analytics._build_actual_dimension_lookup(actual_df)
    identifier_lookup = analytics._build_actual_identifier_lookup(actual_df)
    mapped_budget = analytics._prepare_mapped_overview_frame(
        budget_df,
        actual_lookup,
        identifier_lookup,
    )
    mapped_forecast = mapped_budget.copy()
    mapped_actual = analytics._prepare_mapped_overview_frame(
        actual_df,
        actual_lookup,
        identifier_lookup,
    )

    rows = analytics._build_monthly_comparison_rows(
        budget_df=mapped_budget,
        forecast_df=mapped_forecast,
        actual_df=mapped_actual,
        months=["Apr"],
    )

    assert len(rows) == 1
    assert rows[0]["customerName"] == "Huawei International Pte. Ltd."
    assert rows[0]["budget"] == 220.0
    assert rows[0]["forecast"] == 220.0
    assert rows[0]["actual"] == 180.0


def test_actual_rows_without_budget_identifier_are_excluded_from_dashboard_scope() -> None:
    budget_df = analytics._normalize_overview_frame(
        pd.DataFrame(
            [
                _overview_row(
                    customer_name="Budget Customer",
                    ms_ps="MS",
                    ocn_number="OCN-100",
                    month="Apr",
                    amount=100.0,
                )
            ]
        )
    )
    actual_df = analytics._normalize_overview_frame(
        pd.DataFrame(
            [
                _overview_row(
                    customer_name="Budget Customer Alias",
                    ms_ps="MS",
                    ocn_number="OCN-100",
                    month="Apr",
                    amount=95.0,
                ),
                _overview_row(
                    customer_name="Actual Only Customer",
                    ms_ps="MS",
                    ocn_number="OCN-999",
                    month="Apr",
                    amount=300.0,
                ),
            ]
        )
    )

    filtered = analytics._filter_actual_frame_to_budget_references(actual_df, budget_df)

    assert len(filtered) == 1
    assert filtered.iloc[0]["ocn_number"] == "OCN-100"
