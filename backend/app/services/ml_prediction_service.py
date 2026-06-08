from __future__ import annotations

from typing import Any

import pandas as pd

from .trend_common import QUARTER_BY_MONTH

try:  # pragma: no cover - optional dependency
    from lightgbm import LGBMRegressor
except Exception:  # pragma: no cover
    LGBMRegressor = None  # type: ignore[assignment]

try:  # pragma: no cover - optional dependency
    from sklearn.ensemble import RandomForestRegressor
except Exception:  # pragma: no cover
    RandomForestRegressor = None  # type: ignore[assignment]

MONTH_NUMBER_LOOKUP = {
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
}

LEVEL_CONFIGS = (
    ("overall", []),
    ("customer", ["customer_name"]),
    ("project", ["customer_name", "project_name"]),
    ("bdm", ["bdm"]),
    ("practice_head", ["practice_head"]),
    ("geo_head", ["geo_head"]),
    ("vertical", ["vertical"]),
    ("horizontal", ["horizontal"]),
    ("ms_ps", ["ms_ps"]),
    ("region", ["region"]),
    ("sales_region", ["sales_region"]),
)


def build_predictions(frame: pd.DataFrame, financial_year: str) -> list[dict[str, Any]]:
    if frame.empty:
        return []

    predictions: list[dict[str, Any]] = []
    for prediction_level, key_columns in LEVEL_CONFIGS:
        grouped = _group_for_level(frame, key_columns)
        if grouped.empty:
            continue

        for _, group_frame in grouped.groupby(key_columns or ["prediction_anchor"], dropna=False):
            sorted_group = group_frame.sort_values("month_sort_key").reset_index(drop=True)
            history = sorted_group[sorted_group["actual_revenue"] > 0].copy()
            future = sorted_group[
                (sorted_group["budget_amount"] > 0)
                & (
                    (sorted_group["actual_revenue"] <= 0)
                    | (
                        sorted_group["month_sort_key"] > history["month_sort_key"].max()
                        if not history.empty
                        else True
                    )
                )
            ].copy()
            if future.empty:
                continue

            history["previous_actual_revenue"] = history["actual_revenue"].shift(1).fillna(0.0)
            history["rolling_3_month_avg"] = history["actual_revenue"].rolling(3, min_periods=1).mean()
            history["rolling_6_month_avg"] = history["actual_revenue"].rolling(6, min_periods=1).mean()
            history["month_number"] = history["month"].map(MONTH_NUMBER_LOOKUP).fillna(0)
            quarter_numbers = (
                history["quarter"]
                .astype(str)
                .str.upper()
                .str.extract(r"Q?([1-4])")[0]
            )
            history["quarter_number"] = (
                pd.to_numeric(quarter_numbers, errors="coerce").fillna(0).astype(int)
            )

            model, model_used = _fit_optional_model(history)
            trailing_actual = float(history["actual_revenue"].iloc[-1]) if not history.empty else 0.0
            trailing_previous_year = (
                float(history["previous_year_revenue"].iloc[-1])
                if "previous_year_revenue" in history and not history.empty
                else 0.0
            )
            trailing_growth = float(history["revenue_growth_percent"].iloc[-1]) if not history.empty else 0.0
            trailing_yoy_growth = (
                float(history["year_over_year_growth_percent"].iloc[-1])
                if "year_over_year_growth_percent" in history and not history.empty
                else 0.0
            )
            trailing_margin = float(history["margin_percent"].iloc[-1]) if not history.empty else 0.0
            trailing_utilization = float(history["utilization_percent"].iloc[-1]) if not history.empty else 0.0
            trailing_3 = float(history["rolling_3_month_avg"].iloc[-1]) if not history.empty else 0.0
            trailing_6 = float(history["rolling_6_month_avg"].iloc[-1]) if not history.empty else 0.0
            history_std = float(history["actual_revenue"].std()) if len(history) > 1 else 0.0

            for _, future_row in future.iterrows():
                budget_amount = float(future_row.get("budget_amount") or 0.0)
                previous_year_revenue = float(
                    future_row.get("previous_year_revenue") or trailing_previous_year or 0.0
                )
                predicted_revenue = _predict_value(
                    model=model,
                    model_used=model_used,
                    budget_amount=budget_amount,
                    previous_actual=trailing_actual,
                    previous_year_actual=previous_year_revenue,
                    rolling_3=trailing_3,
                    rolling_6=trailing_6,
                    growth=trailing_growth,
                    yoy_growth=trailing_yoy_growth,
                    margin=trailing_margin,
                    utilization=trailing_utilization,
                    month=str(future_row["month"]),
                    year=int(future_row["year"] or 0),
                    quarter=str(future_row["quarter"]),
                )
                confidence = min(0.95, 0.45 + len(history) * 0.05) if len(history) > 0 else 0.3
                band = history_std if history_std > 0 else max(predicted_revenue * 0.1, 1.0)
                predictions.append(
                    {
                        "prediction_level": prediction_level,
                        "dimension_name": _dimension_name(future_row, prediction_level),
                        "customer_name": str(future_row.get("customer_name") or ""),
                        "project_name": str(future_row.get("project_name") or ""),
                        "bdm": str(future_row.get("bdm") or ""),
                        "practice_head": str(future_row.get("practice_head") or ""),
                        "geo_head": str(future_row.get("geo_head") or ""),
                        "vertical": str(future_row.get("vertical") or ""),
                        "horizontal": str(future_row.get("horizontal") or ""),
                        "ms_ps": str(future_row.get("ms_ps") or ""),
                        "region": str(future_row.get("region") or ""),
                        "sales_region": str(future_row.get("sales_region") or ""),
                        "month": str(future_row["month"]),
                        "year": int(future_row["year"] or 0),
                        "quarter": str(future_row["quarter"]),
                        "budget_amount": budget_amount,
                        "actual_revenue": float(future_row.get("actual_revenue") or 0.0),
                        "previous_month_revenue": trailing_actual,
                        "previous_year_revenue": previous_year_revenue,
                        "predicted_revenue": predicted_revenue,
                        "lower_bound": max(predicted_revenue - band, 0.0),
                        "upper_bound": predicted_revenue + band,
                        "confidence_score": confidence,
                        "prediction_method": model_used,
                        "model_used": model_used,
                        "model_version": "rapid-trend-v2",
                        "fy_year": financial_year,
                    }
                )
                trailing_actual = predicted_revenue
                trailing_previous_year = previous_year_revenue
                trailing_3 = _next_rolling_value(trailing_3, predicted_revenue, 3)
                trailing_6 = _next_rolling_value(trailing_6, predicted_revenue, 6)

    return predictions


def _group_for_level(frame: pd.DataFrame, key_columns: list[str]) -> pd.DataFrame:
    dimension_columns = [
        "customer_name",
        "project_name",
        "bdm",
        "practice_head",
        "geo_head",
        "vertical",
        "horizontal",
        "ms_ps",
        "region",
        "sales_region",
        "strategic_account",
        "quarter",
        "month",
        "year",
        "month_sort_key",
    ]
    group_columns = [*key_columns, "month", "year", "quarter", "month_sort_key"]
    aggregated = (
        frame.groupby(group_columns, dropna=False)
        .agg(
            {
                "budget_amount": "sum",
                "actual_revenue": "sum",
                "previous_year_revenue": "sum",
                "revenue_growth_percent": "mean",
                "year_over_year_growth_percent": "mean",
                "margin_percent": "mean",
                "utilization_percent": "mean",
            }
        )
        .reset_index()
    )
    if not key_columns:
        aggregated["prediction_anchor"] = "overall"
    for column in dimension_columns:
        if column not in aggregated:
            aggregated[column] = ""
    for column in key_columns:
        aggregated[column] = aggregated[column].fillna("")
    return aggregated


def _fit_optional_model(history: pd.DataFrame) -> tuple[Any | None, str]:
    if len(history) < 6:
        return None, "fallback"

    feature_columns = [
        "month_number",
        "quarter_number",
        "year",
        "budget_amount",
        "previous_actual_revenue",
        "previous_year_revenue",
        "rolling_3_month_avg",
        "rolling_6_month_avg",
        "revenue_growth_percent",
        "year_over_year_growth_percent",
        "margin_percent",
        "utilization_percent",
    ]
    train_x = history[feature_columns].fillna(0.0)
    train_y = history["actual_revenue"].fillna(0.0)

    if LGBMRegressor is not None:  # pragma: no cover - optional dependency
        model = LGBMRegressor(
            n_estimators=120,
            learning_rate=0.05,
            max_depth=4,
            random_state=42,
        )
        model.fit(train_x, train_y)
        return model, "lightgbm"

    if RandomForestRegressor is not None:  # pragma: no cover - optional dependency
        model = RandomForestRegressor(
            n_estimators=160,
            max_depth=6,
            random_state=42,
        )
        model.fit(train_x, train_y)
        return model, "random_forest"

    return None, "fallback"


def _predict_value(
    *,
    model: Any | None,
    model_used: str,
    budget_amount: float,
    previous_actual: float,
    previous_year_actual: float,
    rolling_3: float,
    rolling_6: float,
    growth: float,
    yoy_growth: float,
    margin: float,
    utilization: float,
    month: str,
    year: int,
    quarter: str,
) -> float:
    cap = max(
        budget_amount,
        previous_actual,
        previous_year_actual,
        rolling_3,
        rolling_6,
        1.0,
    ) * 5
    if model is None or model_used == "fallback":
        if budget_amount and previous_actual and previous_year_actual:
            return min((budget_amount * 0.4) + (previous_actual * 0.3) + (previous_year_actual * 0.3), cap)
        if budget_amount and previous_actual:
            return min((budget_amount * 0.5) + (previous_actual * 0.5), cap)
        if budget_amount and previous_year_actual:
            return min((budget_amount * 0.5) + (previous_year_actual * 0.5), cap)
        if budget_amount:
            return min(budget_amount, cap)
        if previous_actual:
            return min(previous_actual, cap)
        return 0.0

    future_frame = pd.DataFrame(
        [
            {
                "month_number": MONTH_NUMBER_LOOKUP.get(month, 0),
                "quarter_number": int(
                    str(quarter or QUARTER_BY_MONTH.get(month, "Q1")).replace("Q", "")
                ),
                "year": year,
                "budget_amount": budget_amount,
                "previous_actual_revenue": previous_actual,
                "previous_year_revenue": previous_year_actual,
                "rolling_3_month_avg": rolling_3,
                "rolling_6_month_avg": rolling_6,
                "revenue_growth_percent": growth,
                "year_over_year_growth_percent": yoy_growth,
                "margin_percent": margin,
                "utilization_percent": utilization,
            }
        ]
    )
    prediction = float(model.predict(future_frame)[0])
    if prediction < 0:
        return 0.0
    return min(prediction, cap)


def _next_rolling_value(current_rolling: float, value: float, window: int) -> float:
    if window <= 1:
        return value
    if current_rolling <= 0:
        return value
    return ((current_rolling * (window - 1)) + value) / window


def _dimension_name(row: pd.Series, prediction_level: str) -> str:
    if prediction_level == "overall":
        return "Overall"
    for key in (
        "project_name",
        "customer_name",
        "bdm",
        "practice_head",
        "geo_head",
        "vertical",
        "horizontal",
        "ms_ps",
        "region",
        "sales_region",
    ):
        value = str(row.get(key) or "").strip()
        if value:
            return value
    return prediction_level.replace("_", " ").title()
