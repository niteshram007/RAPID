from __future__ import annotations

from typing import Any

import pandas as pd

from .trend_common import safe_pct


def build_insights(
    summary_frame: pd.DataFrame,
    predictions: list[dict[str, Any]],
    anomalies: list[dict[str, Any]],
    financial_year: str,
) -> list[dict[str, Any]]:
    insights: list[dict[str, Any]] = []
    if summary_frame.empty:
        return insights

    total_budget = float(summary_frame["budget_amount"].sum())
    total_actual = float(summary_frame["actual_revenue"].sum())
    total_variance = total_actual - total_budget
    achievement_pct = safe_pct(total_actual, total_budget)
    latest_month = _latest_period(summary_frame)
    yoy_frame = summary_frame[summary_frame["previous_year_revenue"] > 0]
    total_previous_year = float(yoy_frame["previous_year_revenue"].sum()) if not yoy_frame.empty else 0.0
    total_yoy_growth = safe_pct(total_actual - total_previous_year, total_previous_year) if total_previous_year > 0 else 0.0

    insights.append(
        _entry(
            financial_year=financial_year,
            insight_type="Executive Summary",
            severity="Medium" if total_variance < 0 else "Low",
            title="Budget attainment overview",
            description=(
            f"Actuals for {latest_month} are {achievement_pct:.1f}% of budget, "
                f"with a variance of {_format_money(total_variance)}."
            ),
            recommendation=(
                "Focus leadership review on the largest underperforming customer and practice combinations."
                if total_variance < 0
                else "Protect current momentum by monitoring accounts with emerging month-over-month softness."
            ),
            dimension_type="Overall",
            dimension_name="Overall",
            metric_value=total_actual,
            comparison_value=total_budget,
        )
    )

    insights.append(
        _entry(
            financial_year=financial_year,
            insight_type="Budget Performance",
            severity="Medium" if total_variance < 0 else "Low",
            title="Budget gap signal",
            description=(
                f"Actual revenue is {_format_money(abs(total_variance))} "
                f"{'below' if total_variance < 0 else 'above'} the planned budget in the selected scope."
            ),
            recommendation="Review the top customer and practice gaps before month close.",
            dimension_type="Overall",
            dimension_name="Overall",
            metric_value=total_actual,
            comparison_value=total_budget,
        )
    )

    if total_previous_year > 0:
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Year-over-Year",
                severity="Medium" if total_yoy_growth < 0 else "Low",
                title="Year-over-year revenue comparison",
                description=(
            f"Current-year actuals are {total_yoy_growth:+.1f}% versus the prior year baseline."
                ),
                recommendation="Validate whether growth drivers are broad-based or concentrated in a few accounts.",
                dimension_type="Overall",
                dimension_name="Overall",
                metric_value=total_actual,
                comparison_value=total_previous_year,
            )
        )

    customer_gap = _top_gap(summary_frame, ["customer_name"])
    if customer_gap is not None:
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Customer Risk",
                severity="High" if customer_gap["budget_variance"] < 0 else "Medium",
                title="Largest customer variance",
                description=(
                    f"{customer_gap['customer_name']} is at {customer_gap['budget_achievement_percent']:.1f}% "
                    f"budget achievement with a variance of {_format_money(customer_gap['budget_variance'])}."
                ),
                recommendation="Review delivery status, billing cadence, and recovery actions with the account owner.",
                dimension_type="Customer",
                dimension_name=str(customer_gap["customer_name"]),
                customer_name=str(customer_gap["customer_name"]),
                metric_value=float(customer_gap["actual_revenue"]),
                comparison_value=float(customer_gap["budget_amount"]),
            )
        )

    project_risk = _highest_risk(summary_frame, "project_name")
    if project_risk is not None:
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Project Risk",
                severity="High",
                title="Highest risk project line",
                description=(
                    f"{project_risk.get('project_name') or 'Unassigned project'} carries a risk score of "
                    f"{float(project_risk.get('risk_score') or 0.0):.1f}."
                ),
                recommendation="Escalate recovery actions with the BDM and practice head before the next billing cycle.",
                dimension_type="Project",
                dimension_name=str(project_risk.get("project_name") or project_risk.get("customer_name") or ""),
                customer_name=str(project_risk.get("customer_name") or ""),
                project_name=str(project_risk.get("project_name") or ""),
                bdm=str(project_risk.get("bdm") or ""),
                practice_head=str(project_risk.get("practice_head") or ""),
                metric_value=float(project_risk.get("risk_score") or 0.0),
                comparison_value=float(project_risk.get("budget_variance_percent") or 0.0),
            )
        )

    bdm_gain = _top_positive(summary_frame, ["bdm"])
    if bdm_gain is not None and bdm_gain.get("bdm"):
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="BDM Performance",
                severity="Low",
                title="Leading BDM performance",
                description=(
                    f"{bdm_gain['bdm']} has the strongest budget attainment at "
                    f"{bdm_gain['budget_achievement_percent']:.1f}%."
                ),
                recommendation="Use this book of business as a benchmark for deal ramp and billing discipline.",
                dimension_type="BDM",
                dimension_name=str(bdm_gain["bdm"]),
                bdm=str(bdm_gain["bdm"]),
                metric_value=float(bdm_gain["actual_revenue"]),
                comparison_value=float(bdm_gain["budget_amount"]),
            )
        )

    practice_gap = _top_gap(summary_frame, ["practice_head"])
    if practice_gap is not None and practice_gap.get("practice_head"):
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Practice Performance",
                severity="High" if practice_gap["budget_variance"] < 0 else "Low",
                title="Practice variance watch",
                description=(
                    f"{practice_gap['practice_head']} is showing {_format_money(practice_gap['budget_variance'])} "
                    f"variance against budget."
                ),
                recommendation="Validate staffing mix, billing start dates, and open pipeline conversion for the practice.",
                dimension_type="Practice Head",
                dimension_name=str(practice_gap["practice_head"]),
                practice_head=str(practice_gap["practice_head"]),
                metric_value=float(practice_gap["actual_revenue"]),
                comparison_value=float(practice_gap["budget_amount"]),
            )
        )

    geo_gap = _top_gap(summary_frame, ["geo_head"])
    if geo_gap is not None and geo_gap.get("geo_head"):
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Geo Performance",
                severity="High" if geo_gap["budget_variance"] < 0 else "Low",
                title="Geo variance signal",
                description=(
                    f"{geo_gap['geo_head']} is tracking {_format_money(geo_gap['budget_variance'])} "
                    f"against budget."
                ),
                recommendation="Review regional billing cadence, staffing ramp, and project activation timing.",
                dimension_type="Geo Head",
                dimension_name=str(geo_gap["geo_head"]),
                geo_head=str(geo_gap["geo_head"]),
                metric_value=float(geo_gap["actual_revenue"]),
                comparison_value=float(geo_gap["budget_amount"]),
            )
        )

    vertical_gap = _top_gap(summary_frame, ["vertical"])
    if vertical_gap is not None and vertical_gap.get("vertical"):
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Vertical / Horizontal Trend",
                severity="Medium" if vertical_gap["budget_variance"] < 0 else "Low",
                title="Vertical watchlist",
                description=(
                    f"{vertical_gap['vertical']} is showing {_format_money(vertical_gap['budget_variance'])} variance."
                ),
                recommendation="Review demand softness and invoice timing across the vertical portfolio.",
                dimension_type="Vertical",
                dimension_name=str(vertical_gap["vertical"]),
                vertical=str(vertical_gap["vertical"]),
                metric_value=float(vertical_gap["actual_revenue"]),
                comparison_value=float(vertical_gap["budget_amount"]),
            )
        )

    msps_gap = _top_gap(summary_frame, ["ms_ps"])
    if msps_gap is not None and msps_gap.get("ms_ps"):
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="MS/PS Trend",
                severity="Medium" if msps_gap["budget_variance"] < 0 else "Low",
                title="MS/PS mix signal",
                description=(
                    f"{msps_gap['ms_ps']} is operating at {msps_gap['budget_achievement_percent']:.1f}% of budget."
                ),
                recommendation="Review service-line mix and whether the current revenue profile is sustainable.",
                dimension_type="MS/PS",
                dimension_name=str(msps_gap["ms_ps"]),
                ms_ps=str(msps_gap["ms_ps"]),
                metric_value=float(msps_gap["actual_revenue"]),
                comparison_value=float(msps_gap["budget_amount"]),
            )
        )

    negative_margin = summary_frame[summary_frame["margin_percent"] < 0]
    if not negative_margin.empty:
        margin_row = negative_margin.sort_values("margin_percent").iloc[0]
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Margin / Utilization",
                severity="High",
                title="Negative margin detected",
                description=(
                    f"{margin_row.get('customer_name') or 'Unknown customer'} / "
                    f"{margin_row.get('project_name') or 'Unassigned project'} has negative margin."
                ),
                recommendation="Review pass-through costs, pricing, and delivery mix before the next close cycle.",
                dimension_type="Project",
                dimension_name=str(margin_row.get("project_name") or margin_row.get("customer_name") or ""),
                customer_name=str(margin_row.get("customer_name") or ""),
                project_name=str(margin_row.get("project_name") or ""),
                metric_value=float(margin_row.get("margin_percent") or 0.0),
                comparison_value=float(margin_row.get("utilization_percent") or 0.0),
            )
        )

    if anomalies:
        lead_anomaly = anomalies[0]
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Anomalies",
                severity=str(lead_anomaly.get("severity") or "Medium"),
                title=str(lead_anomaly.get("title") or "Anomaly detected"),
                description=str(lead_anomaly.get("description") or ""),
                recommendation=str(lead_anomaly.get("recommendation") or ""),
                dimension_type=str(lead_anomaly.get("dimension_type") or "Project"),
                dimension_name=str(lead_anomaly.get("dimension_name") or ""),
                customer_name=str(lead_anomaly.get("customer_name") or ""),
                project_name=str(lead_anomaly.get("project_name") or ""),
                bdm=str(lead_anomaly.get("bdm") or ""),
                practice_head=str(lead_anomaly.get("practice_head") or ""),
                geo_head=str(lead_anomaly.get("geo_head") or ""),
                vertical=str(lead_anomaly.get("vertical") or ""),
                horizontal=str(lead_anomaly.get("horizontal") or ""),
                ms_ps=str(lead_anomaly.get("ms_ps") or ""),
                month=str(lead_anomaly.get("month") or ""),
                year=int(lead_anomaly.get("year") or 0),
                metric_value=float(lead_anomaly.get("metric_value") or 0.0),
                comparison_value=float(lead_anomaly.get("comparison_value") or 0.0),
            )
        )

    prediction_frame = pd.DataFrame(predictions)
    overall_future = (
        prediction_frame[prediction_frame["prediction_level"] == "overall"]
        if not prediction_frame.empty
        else pd.DataFrame()
    )
    if not overall_future.empty:
        next_prediction = overall_future.sort_values(["year", "month"]).iloc[0]
        delta_pct = safe_pct(
            float(next_prediction["predicted_revenue"]) - total_actual,
            total_actual,
        )
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Predictions",
                severity="Medium" if delta_pct < 0 else "Low",
                title="Forward revenue signal",
                description=(
                    f"Predicted revenue for {next_prediction['month']} {int(next_prediction['year'])} is "
                    f"{_format_money(float(next_prediction['predicted_revenue']))}, "
                    f"{delta_pct:+.1f}% versus the current realized revenue."
                ),
                recommendation=(
                    "Pull forward invoicing, review at-risk accounts, and confirm delivery ramp for the next month."
                    if delta_pct < 0
                    else "Sustain current execution and confirm whether current upside can be carried forward."
                ),
                dimension_type="Overall",
                dimension_name="Overall",
                month=str(next_prediction["month"]),
                year=int(next_prediction["year"]),
                metric_value=float(next_prediction["predicted_revenue"]),
                comparison_value=total_actual,
            )
        )

    if total_variance < 0:
        insights.append(
            _entry(
                financial_year=financial_year,
                insight_type="Recommended Actions",
                severity="High",
                title="Near-term action focus",
                description="Budget miss and risk concentration indicate a need for targeted account recovery.",
                recommendation="Prioritize the top 5 underperforming customers, review project billing readiness, and confirm month-close recovery actions with accountable BDMs and practice heads.",
                dimension_type="Overall",
                dimension_name="Overall",
                metric_value=total_actual,
                comparison_value=total_budget,
            )
        )

    return insights[:24]


def _top_gap(frame: pd.DataFrame, dimensions: list[str]) -> dict[str, Any] | None:
    grouped = (
        frame.groupby(dimensions, dropna=False)
        .agg({"budget_amount": "sum", "actual_revenue": "sum"})
        .reset_index()
    )
    if grouped.empty:
        return None
    grouped["budget_variance"] = grouped["actual_revenue"] - grouped["budget_amount"]
    grouped["budget_achievement_percent"] = grouped.apply(
        lambda row: safe_pct(row["actual_revenue"], row["budget_amount"]),
        axis=1,
    )
    return grouped.sort_values("budget_variance").iloc[0].to_dict()


def _top_positive(frame: pd.DataFrame, dimensions: list[str]) -> dict[str, Any] | None:
    grouped = (
        frame.groupby(dimensions, dropna=False)
        .agg({"budget_amount": "sum", "actual_revenue": "sum"})
        .reset_index()
    )
    if grouped.empty:
        return None
    grouped = grouped[grouped["budget_amount"] > 0]
    if grouped.empty:
        return None
    grouped["budget_achievement_percent"] = grouped.apply(
        lambda row: safe_pct(row["actual_revenue"], row["budget_amount"]),
        axis=1,
    )
    return grouped.sort_values("budget_achievement_percent", ascending=False).iloc[0].to_dict()


def _highest_risk(frame: pd.DataFrame, dimension: str) -> dict[str, Any] | None:
    scoped = frame[frame[dimension].fillna("").astype(str).str.strip() != ""]
    if scoped.empty:
        return None
    return scoped.sort_values("risk_score", ascending=False).iloc[0].to_dict()


def _latest_period(frame: pd.DataFrame) -> str:
    latest = frame.sort_values("month_sort_key").iloc[-1]
    return f"{latest['month']} {int(latest['year'])}"


def _entry(
    *,
    financial_year: str,
    insight_type: str,
    severity: str,
    title: str,
    description: str,
    recommendation: str,
    dimension_type: str = "",
    dimension_name: str = "",
    customer_name: str = "",
    project_name: str = "",
    bdm: str = "",
    practice_head: str = "",
    geo_head: str = "",
    vertical: str = "",
    horizontal: str = "",
    ms_ps: str = "",
    month: str = "",
    year: int = 0,
    metric_value: float = 0.0,
    comparison_value: float = 0.0,
) -> dict[str, Any]:
    return {
        "insight_type": insight_type,
        "severity": severity,
        "title": title,
        "description": description,
        "recommendation": recommendation,
        "dimension_type": dimension_type,
        "dimension_name": dimension_name,
        "customer_name": customer_name,
        "project_name": project_name,
        "bdm": bdm,
        "practice_head": practice_head,
        "geo_head": geo_head,
        "vertical": vertical,
        "horizontal": horizontal,
        "ms_ps": ms_ps,
        "month": month,
        "year": year,
        "fy_year": financial_year,
        "metric_value": metric_value,
        "comparison_value": comparison_value,
    }


def _format_money(value: float) -> str:
    absolute = abs(value)
    sign = "-" if value < 0 else ""
    if absolute >= 1_000_000:
        return f"{sign}${absolute / 1_000_000:.1f}M"
    if absolute >= 1_000:
        return f"{sign}${absolute / 1_000:.1f}K"
    return f"{sign}${absolute:,.0f}"
