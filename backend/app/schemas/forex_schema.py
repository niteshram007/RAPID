from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


def _normalize_currency(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise ValueError("Selected currency pair is not available.")
    return normalized


class ForexLatestQuery(BaseModel):
    from_currency: str = Field(default="USD")
    to_currency: str = Field(default="INR")
    amount: float = Field(default=1, gt=0)

    @field_validator("from_currency", "to_currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        return _normalize_currency(value)


class ForexHistoricalQuery(ForexLatestQuery):
    date: date


class ForexRangeQuery(BaseModel):
    start_date: date
    end_date: date
    from_currency: str = Field(default="USD")
    to_currency: str = Field(default="INR")

    @field_validator("from_currency", "to_currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        return _normalize_currency(value)

    @model_validator(mode="after")
    def validate_range(self) -> "ForexRangeQuery":
        if self.end_date < self.start_date:
            raise ValueError("Please select a valid date range.")
        return self


class ForexSummaryQuery(ForexRangeQuery):
    pass
