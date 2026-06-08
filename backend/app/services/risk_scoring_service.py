from __future__ import annotations

import pandas as pd

from .trend_common import safe_pct


def apply_risk_scores(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        frame["risk_score"] = []
        frame["risk_level"] = []
        frame["risk_reason"] = []
        return frame

    scored = frame.copy()
    scored["budget_miss_component"] = scored.apply(
        lambda row: min(max(-safe_pct(row["budget_variance"], row["budget_amount"]), 0.0), 100.0)
        if row["budget_amount"] > 0
        else 0.0,
        axis=1,
    )
    scored["mom_decline_component"] = scored["revenue_growth_percent"].apply(
        lambda value: min(max(-float(value or 0.0), 0.0), 100.0)
    )
    scored["yoy_decline_component"] = scored.get("year_over_year_growth_percent", pd.Series([0.0] * len(scored.index), index=scored.index)).apply(
        lambda value: min(max(-float(value or 0.0), 0.0), 100.0)
    )
    scored["margin_component"] = scored["margin_percent"].apply(
        lambda value: 100.0 if float(value or 0.0) < 0 else max(0.0, 40.0 - float(value or 0.0))
    )
    scored["utilization_component"] = scored["utilization_percent"].apply(
        lambda value: 100.0 if float(value or 0.0) <= 0 else max(0.0, 80.0 - float(value or 0.0))
    )
    scored["missing_actual_component"] = (
        ((scored["budget_amount"] > 0) & (scored["actual_revenue"] <= 0)).astype(float) * 100.0
    )
    scored["anomaly_component"] = scored["anomaly_flag"].apply(lambda flag: 100.0 if bool(flag) else 0.0)

    declining_streak = (
        scored.sort_values(["customer_name", "project_name", "month_sort_key"])
        .groupby(["customer_name", "project_name"], dropna=False)["actual_revenue"]
        .apply(_declining_streak)
        .reset_index(level=[0, 1], drop=True)
    )
    scored["declining_streak"] = declining_streak.reindex(scored.index).fillna(0)
    scored.loc[scored["declining_streak"] >= 2, "mom_decline_component"] = scored.loc[
        scored["declining_streak"] >= 2, "mom_decline_component"
    ].clip(lower=80.0)

    scored["risk_score"] = (
        scored["budget_miss_component"] * 0.30
        + scored["mom_decline_component"] * 0.20
        + scored["yoy_decline_component"] * 0.15
        + scored["margin_component"] * 0.10
        + scored["utilization_component"] * 0.10
        + scored["missing_actual_component"] * 0.10
        + scored["anomaly_component"] * 0.05
    ).clip(lower=0.0, upper=100.0)

    scored["risk_level"] = scored["risk_score"].apply(_risk_level)
    scored["risk_reason"] = scored.apply(_build_risk_reason, axis=1)
    return scored


def _declining_streak(series: pd.Series) -> pd.Series:
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


def _risk_level(score: float) -> str:
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def _build_risk_reason(row: pd.Series) -> str:
    reasons: list[str] = []
    if float(row.get("budget_amount") or 0.0) > 0 and float(row.get("actual_revenue") or 0.0) <= 0:
        reasons.append("Budget exists but actual revenue is missing.")
    if float(row.get("budget_variance_percent") or 0.0) <= -15:
        reasons.append("Actual revenue is more than 15% below budget.")
    if int(row.get("declining_streak") or 0) >= 2:
        reasons.append("Revenue declined for 3 consecutive months.")
    if float(row.get("year_over_year_growth_percent") or 0.0) <= -20:
        reasons.append("Year-over-year revenue declined more than 20%.")
    if float(row.get("margin_percent") or 0.0) < 0:
        reasons.append("Margin is negative.")
    if float(row.get("utilization_percent") or 0.0) > 0 and float(row.get("utilization_percent") or 0.0) < 65:
        reasons.append("Utilization is below the expected threshold.")
    if bool(row.get("anomaly_flag")):
        anomaly_reason = str(row.get("anomaly_reason") or "").strip()
        if anomaly_reason:
            reasons.append(anomaly_reason)
    return " ".join(dict.fromkeys(reasons)) or "Risk score is elevated due to revenue softness."
