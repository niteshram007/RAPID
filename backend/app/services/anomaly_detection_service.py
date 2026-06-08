from __future__ import annotations

from typing import Any

import pandas as pd

from .trend_common import safe_pct

try:  # pragma: no cover - optional dependency
    from sklearn.ensemble import IsolationForest
except Exception:  # pragma: no cover
    IsolationForest = None  # type: ignore[assignment]


def apply_anomaly_detection(
    frame: pd.DataFrame,
    financial_year: str,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    if frame.empty:
        frame["anomaly_flag"] = []
        frame["anomaly_reason"] = []
        return frame, []

    detected = frame.copy()
    detected["anomaly_flag"] = False
    detected["anomaly_reason"] = ""
    detected["anomaly_severity"] = "Low"
    anomalies: list[dict[str, Any]] = []

    sorted_frame = detected.sort_values(["customer_name", "project_name", "month_sort_key"]).copy()
    previous_actual = (
        sorted_frame.groupby(["customer_name", "project_name"], dropna=False)["actual_revenue"]
        .shift(1)
        .fillna(0.0)
    )
    sorted_frame["previous_actual_revenue"] = previous_actual
    sorted_frame["mom_change_pct"] = sorted_frame.apply(
        lambda row: safe_pct(
            row["actual_revenue"] - row["previous_actual_revenue"],
            row["previous_actual_revenue"],
        )
        if row["previous_actual_revenue"] > 0
        else 0.0,
        axis=1,
    )
    decline_streak = (
        sorted_frame.groupby(["customer_name", "project_name"], dropna=False)["actual_revenue"]
        .apply(_decline_streak)
        .reset_index(level=[0, 1], drop=True)
    )
    sorted_frame["decline_streak"] = decline_streak.reindex(sorted_frame.index).fillna(0)

    for index, row in sorted_frame.iterrows():
        reasons: list[str] = []
        severity = "Low"
        previous_year_growth = float(row.get("year_over_year_growth_percent") or 0.0)
        if row["previous_actual_revenue"] > 0 and row["mom_change_pct"] <= -30:
            reasons.append(f"Revenue dropped {abs(row['mom_change_pct']):.1f}% month-over-month.")
            severity = "High"
        if row.get("previous_year_revenue", 0.0) and previous_year_growth <= -25:
            reasons.append(f"Revenue declined {abs(previous_year_growth):.1f}% year-over-year.")
            severity = "High"
        if row["budget_amount"] > 0 and row["budget_achievement_percent"] < 80:
            reasons.append(
                f"Actual revenue is {abs(row['budget_variance_percent']):.1f}% below budget."
            )
            severity = "High" if severity != "Critical" else severity
        if row["budget_amount"] > 0 and row["actual_revenue"] <= 0:
            reasons.append("Budget exists but actual revenue is missing.")
            severity = "Critical"
        if row["budget_amount"] <= 0 and row["actual_revenue"] > 0:
            reasons.append("Actual revenue exists without a budget baseline.")
            severity = "Medium" if severity not in {"High", "Critical"} else severity
        if row["margin_amount"] < 0:
            reasons.append("Margin is negative.")
            severity = "High" if severity != "Critical" else severity
        if row["actual_revenue"] > 0 and row["expenses"] > row["actual_revenue"] * 0.6:
            reasons.append("Expenses are high relative to revenue.")
            severity = "High" if severity != "Critical" else severity
        if row["utilization_percent"] > 0 and row["utilization_percent"] < 65:
            reasons.append("Utilization is below 65%.")
            severity = "Medium" if severity not in {"High", "Critical"} else severity
        if row["previous_actual_revenue"] > 0 and row["mom_change_pct"] >= 45:
            reasons.append(f"Revenue spiked {row['mom_change_pct']:.1f}% month-over-month.")
            severity = "Medium" if severity == "Low" else severity
        if row["decline_streak"] >= 2:
            reasons.append("Revenue declined for 3 consecutive months.")
            severity = "High" if severity != "Critical" else severity

        if reasons:
            sorted_frame.at[index, "anomaly_flag"] = True
            sorted_frame.at[index, "anomaly_reason"] = " ".join(dict.fromkeys(reasons))
            sorted_frame.at[index, "anomaly_severity"] = severity
            anomalies.append(
                _build_anomaly_entry(
                    financial_year=financial_year,
                    row=row,
                    severity=severity,
                    description=sorted_frame.at[index, "anomaly_reason"],
                )
            )

    if IsolationForest is not None and len(sorted_frame) >= 18:  # pragma: no cover - optional
        feature_frame = sorted_frame[
            ["budget_amount", "actual_revenue", "margin_amount", "utilization_percent"]
        ].fillna(0.0)
        model = IsolationForest(random_state=42, contamination=0.08)
        labels = model.fit_predict(feature_frame)
        for idx, label in zip(sorted_frame.index, labels):
            if label >= 0:
                continue
            if not bool(sorted_frame.at[idx, "anomaly_flag"]):
                sorted_frame.at[idx, "anomaly_flag"] = True
                sorted_frame.at[idx, "anomaly_reason"] = "IsolationForest detected an outlier profile."
                sorted_frame.at[idx, "anomaly_severity"] = "Medium"
                anomalies.append(
                    _build_anomaly_entry(
                        financial_year=financial_year,
                        row=sorted_frame.loc[idx],
                        severity="Medium",
                        description="IsolationForest detected an outlier profile.",
                    )
                )

    detected = detected.merge(
        sorted_frame[
            [
                "customer_name",
                "project_name",
                "month",
                "year",
                "anomaly_flag",
                "anomaly_reason",
                "anomaly_severity",
            ]
        ],
        on=["customer_name", "project_name", "month", "year"],
        how="left",
        suffixes=("", "_fresh"),
    )
    detected["anomaly_flag"] = detected["anomaly_flag_fresh"].fillna(detected["anomaly_flag"]).astype(bool)
    detected["anomaly_reason"] = detected["anomaly_reason_fresh"].fillna(detected["anomaly_reason"])
    detected["anomaly_severity"] = detected["anomaly_severity_fresh"].fillna(detected["anomaly_severity"])
    detected = detected.drop(
        columns=["anomaly_flag_fresh", "anomaly_reason_fresh", "anomaly_severity_fresh"]
    )
    return detected, anomalies


def _decline_streak(series: pd.Series) -> pd.Series:
    streak = 0
    previous_value: float | None = None
    output: list[int] = []
    for raw_value in series.fillna(0.0).tolist():
        current_value = float(raw_value or 0.0)
        if previous_value is not None and current_value < previous_value:
            streak += 1
        else:
            streak = 0
        output.append(streak)
        previous_value = current_value
    return pd.Series(output, index=series.index)


def _build_anomaly_entry(
    *,
    financial_year: str,
    row: pd.Series,
    severity: str,
    description: str,
) -> dict[str, Any]:
    customer_name = str(row.get("customer_name") or "Unknown Customer")
    project_name = str(row.get("project_name") or "").strip()
    title = "Revenue anomaly detected"
    if "missing" in description.lower():
        title = "Missing actual revenue"
    elif "spiked" in description.lower():
        title = "Revenue spike detected"
    elif "year-over-year" in description.lower():
        title = "Year-over-year decline detected"
    elif "declined" in description.lower() or "dropped" in description.lower():
        title = "Revenue drop detected"

    return {
        "insight_type": "Anomaly Alert",
        "severity": severity,
        "title": title,
        "description": description,
        "recommendation": _recommendation_for_description(description),
        "dimension_type": "Project" if project_name else "Customer",
        "dimension_name": project_name or customer_name,
        "customer_name": customer_name,
        "project_name": project_name,
        "bdm": str(row.get("bdm") or ""),
        "practice_head": str(row.get("practice_head") or ""),
        "geo_head": str(row.get("geo_head") or ""),
        "vertical": str(row.get("vertical") or ""),
        "horizontal": str(row.get("horizontal") or ""),
        "ms_ps": str(row.get("ms_ps") or ""),
        "month": str(row.get("month") or ""),
        "year": int(row.get("year") or 0),
        "fy_year": financial_year,
        "metric_value": float(row.get("actual_revenue") or 0.0),
        "comparison_value": float(row.get("budget_amount") or 0.0),
    }


def _recommendation_for_description(description: str) -> str:
    lower = description.lower()
    if "missing actual" in lower:
        return "Review billing status, invoice timing, and project activation for the missing actual."
    if "negative" in lower or "expenses" in lower:
        return "Review margin drivers, pass-through costs, and pricing before the next billing cycle."
    if "utilization" in lower:
        return "Rebalance staffing, confirm billable allocation, and review time capture."
    if "spike" in lower:
        return "Validate whether the spike is a one-time billing event or the new demand baseline."
    return "Review billing, project status, resource allocation, and invoice timing with the account team."
