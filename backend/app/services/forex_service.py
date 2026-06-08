from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx
from fastapi import HTTPException

FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1"
FOREX_SOURCE = "Frankfurter"
FOREX_DISCLAIMER = (
    "Rates are reference exchange rates and may not represent real-time trading prices."
)
HTTP_TIMEOUT_SECONDS = 10.0
CURRENCY_CACHE_TTL_SECONDS = 6 * 60 * 60
LATEST_CACHE_TTL_SECONDS = 10 * 60


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


_currency_cache: _CacheEntry | None = None
_latest_cache: dict[tuple[str, str, float], _CacheEntry] = {}


def _now_timestamp() -> float:
    import time

    return time.time()


def _http_client() -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS),
        follow_redirects=True,
    )


def _request_json(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        with _http_client() as client:
            response = client.get(f"{FRANKFURTER_BASE_URL}{path}", params=params)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("Invalid response")
            return payload
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch forex rates right now. Please try again.",
        ) from error


def _resolve_rate(payload: dict[str, Any], to_currency: str) -> float:
    rates = payload.get("rates")
    if not isinstance(rates, dict):
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch forex rates right now. Please try again.",
        )
    rate = rates.get(to_currency)
    resolved = float(rate or 0)
    if resolved <= 0:
        raise HTTPException(status_code=400, detail="Selected currency pair is not available.")
    return resolved


def get_forex_currencies() -> dict[str, str]:
    global _currency_cache

    now = _now_timestamp()
    if _currency_cache and _currency_cache.expires_at > now:
        return _currency_cache.value

    payload = _request_json("/currencies")
    currencies = {
        str(code).upper(): str(name)
        for code, name in payload.items()
        if str(code).strip() and str(name).strip()
    }
    _currency_cache = _CacheEntry(
        value=currencies,
        expires_at=now + CURRENCY_CACHE_TTL_SECONDS,
    )
    return currencies


def _validate_supported_currency(from_currency: str, to_currency: str) -> None:
    currencies = get_forex_currencies()
    if from_currency not in currencies or to_currency not in currencies:
        raise HTTPException(status_code=400, detail="Selected currency pair is not available.")


def get_latest_forex_rate(*, from_currency: str, to_currency: str, amount: float) -> dict[str, Any]:
    _validate_supported_currency(from_currency, to_currency)
    cache_key = (from_currency, to_currency, round(float(amount), 4))
    now = _now_timestamp()
    cached = _latest_cache.get(cache_key)
    if cached and cached.expires_at > now:
        return cached.value

    payload = _request_json(
        "/latest",
        params={
            "from": from_currency,
            "to": to_currency,
            "amount": amount,
        },
    )
    rate = _resolve_rate(payload, to_currency)
    converted_amount = rate if amount == 1 else float(amount) * rate
    response = {
        "amount": float(amount),
        "from_currency": from_currency,
        "to_currency": to_currency,
        "rate": round(rate, 6),
        "converted_amount": round(converted_amount, 6),
        "date": str(payload.get("date") or date.today().isoformat()),
        "source": FOREX_SOURCE,
        "disclaimer": FOREX_DISCLAIMER,
    }
    _latest_cache[cache_key] = _CacheEntry(
        value=response,
        expires_at=now + LATEST_CACHE_TTL_SECONDS,
    )
    return response


def get_historical_forex_rate(
    *,
    rate_date: date,
    from_currency: str,
    to_currency: str,
    amount: float,
) -> dict[str, Any]:
    _validate_supported_currency(from_currency, to_currency)
    payload = _request_json(
        f"/{rate_date.isoformat()}",
        params={
            "from": from_currency,
            "to": to_currency,
            "amount": amount,
        },
    )
    rate = _resolve_rate(payload, to_currency)
    converted_amount = rate if amount == 1 else float(amount) * rate
    return {
        "amount": float(amount),
        "from_currency": from_currency,
        "to_currency": to_currency,
        "rate": round(rate, 6),
        "converted_amount": round(converted_amount, 6),
        "date": str(payload.get("date") or rate_date.isoformat()),
        "source": FOREX_SOURCE,
        "disclaimer": FOREX_DISCLAIMER,
    }


def get_forex_range(
    *,
    start_date: date,
    end_date: date,
    from_currency: str,
    to_currency: str,
) -> dict[str, Any]:
    _validate_supported_currency(from_currency, to_currency)
    payload = _request_json(
        f"/{start_date.isoformat()}..{end_date.isoformat()}",
        params={
            "from": from_currency,
            "to": to_currency,
        },
    )
    rates = payload.get("rates")
    if not isinstance(rates, dict) or not rates:
        raise HTTPException(status_code=404, detail="No historical data is available for the selected range.")

    rows: list[dict[str, Any]] = []
    previous_rate: float | None = None
    for rate_day in sorted(rates.keys()):
        day_rates = rates.get(rate_day)
        if not isinstance(day_rates, dict):
            continue
        current_rate = float(day_rates.get(to_currency) or 0)
        if current_rate <= 0:
            continue
        change = current_rate - previous_rate if previous_rate is not None else 0.0
        change_percent = (change / previous_rate * 100) if previous_rate else 0.0
        rows.append(
            {
                "date": rate_day,
                "from_currency": from_currency,
                "to_currency": to_currency,
                "rate": round(current_rate, 6),
                "change": round(change, 6),
                "change_percent": round(change_percent, 4),
            }
        )
        previous_rate = current_rate

    if not rows:
        raise HTTPException(status_code=404, detail="No historical data is available for the selected range.")

    return {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "rows": rows,
        "source": FOREX_SOURCE,
        "disclaimer": FOREX_DISCLAIMER,
    }


def get_forex_summary(
    *,
    start_date: date,
    end_date: date,
    from_currency: str,
    to_currency: str,
) -> dict[str, Any]:
    range_payload = get_forex_range(
        start_date=start_date,
        end_date=end_date,
        from_currency=from_currency,
        to_currency=to_currency,
    )
    rows = range_payload["rows"]
    current_rate = float(rows[-1]["rate"])
    previous_rate = float(rows[0]["rate"])
    highest_rate = max(float(row["rate"]) for row in rows)
    lowest_rate = min(float(row["rate"]) for row in rows)
    average_rate = sum(float(row["rate"]) for row in rows) / len(rows)
    rate_change = current_rate - previous_rate
    rate_change_percent = (rate_change / previous_rate * 100) if previous_rate else 0.0
    absolute_change_percent = abs(rate_change_percent)
    if absolute_change_percent < 1:
        volatility_status = "Low volatility"
    elif absolute_change_percent <= 3:
        volatility_status = "Medium volatility"
    else:
        volatility_status = "High volatility"

    return {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "current_rate": round(current_rate, 6),
        "previous_rate": round(previous_rate, 6),
        "highest_rate": round(highest_rate, 6),
        "lowest_rate": round(lowest_rate, 6),
        "average_rate": round(average_rate, 6),
        "rate_change": round(rate_change, 6),
        "rate_change_percent": round(rate_change_percent, 4),
        "volatility_status": volatility_status,
        "source": FOREX_SOURCE,
        "disclaimer": FOREX_DISCLAIMER,
    }
