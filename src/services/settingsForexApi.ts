"use client";

export type ForexQueryParams = {
  amount: number;
  from_currency: string;
  to_currency: string;
};

export type ForexHistoricalParams = ForexQueryParams & {
  date: string;
};

export type ForexRangeParams = {
  start_date: string;
  end_date: string;
  from_currency: string;
  to_currency: string;
};

export type ForexLatestRate = {
  amount: number;
  from_currency: string;
  to_currency: string;
  converted_amount: number;
  rate: number;
  date: string;
  source: string;
};

export type ForexHistoricalRate = ForexLatestRate;

export type ForexRangeRow = {
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  change: number;
  change_percent: number;
};

export type ForexRangeResponse = {
  start_date: string;
  end_date: string;
  from_currency: string;
  to_currency: string;
  source: string;
  rows: ForexRangeRow[];
};

export type ForexSummaryResponse = {
  start_date: string;
  end_date: string;
  from_currency: string;
  to_currency: string;
  highest_rate: number;
  lowest_rate: number;
  average_rate: number;
  rate_change: number;
  rate_change_percent: number;
  volatility_status: string;
  source: string;
};

async function fetchForexJson<T>(path: string, query: URLSearchParams) {
  const response = await fetch(`/api/settings/forex/${path}?${query.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as T | { detail?: string } | null;
  if (!response.ok || !payload) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? String(payload.detail || "")
      : "";
    throw new Error(detail || "Unable to load forex data.");
  }
  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      continue;
    }
    query.set(key, normalized);
  }
  return query;
}

export async function getForexCurrencies() {
  return fetchForexJson<Record<string, string>>("currencies", new URLSearchParams());
}

export async function getLatestForexRate(params: ForexQueryParams) {
  return fetchForexJson<ForexLatestRate>("latest", buildQuery(params));
}

export async function getHistoricalForexRate(params: ForexHistoricalParams) {
  return fetchForexJson<ForexHistoricalRate>("historical", buildQuery(params));
}

export async function getForexRange(params: ForexRangeParams) {
  return fetchForexJson<ForexRangeResponse>("range", buildQuery(params));
}

export async function getForexSummary(params: ForexRangeParams) {
  return fetchForexJson<ForexSummaryResponse>("summary", buildQuery(params));
}
