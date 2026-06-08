import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac-store";

const SUPPORTED_CURRENCIES = [
  "AUD",
  "BHD",
  "CAD",
  "CHF",
  "CZK",
  "EUR",
  "GBP",
  "HKD",
  "INR",
  "MYR",
  "PHP",
  "SGD",
  "USD",
] as const;
const FALLBACK_USD_PER_UNIT: Record<string, number> = {
  AUD: 0.64,
  BHD: 2.65,
  CAD: 0.72339,
  CHF: 1.24122,
  CZK: 0.043,
  EUR: 1.15741,
  GBP: 1.33852,
  HKD: 0.128,
  INR: 0.01142,
  MYR: 0.23801,
  PHP: 0.0174,
  SGD: 0.77424,
  USD: 1,
  GPB: 1.33852,
};
const EXCHANGE_RATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedExchangeRates:
  | {
      expiresAt: number;
      payload: {
        provider: string;
        base: "USD";
        usdPerUnit: Record<string, number>;
        fetchedAt: string;
      };
    }
  | null = null;

function parseRates(body: unknown) {
  if (Array.isArray(body)) {
    const resolvedRates: Record<string, number> = {};
    for (const entry of body) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const payload = entry as { quote?: unknown; rate?: unknown };
      const code = String(payload.quote ?? "").trim().toUpperCase();
      const rate = Number(payload.rate);
      if (!code || !Number.isFinite(rate) || rate <= 0) {
        continue;
      }
      resolvedRates[code] = rate;
    }
    if (Object.keys(resolvedRates).length === 0) {
      return null;
    }
    const usdPerUnit: Record<string, number> = { USD: 1 };
    for (const currency of SUPPORTED_CURRENCIES) {
      if (currency === "USD") {
        usdPerUnit[currency] = 1;
        continue;
      }
      const usdToCurrency = Number(resolvedRates[currency]);
      if (!Number.isFinite(usdToCurrency) || usdToCurrency <= 0) {
        continue;
      }
      usdPerUnit[currency] = Number((1 / usdToCurrency).toFixed(8));
    }
    if (usdPerUnit.GBP) {
      usdPerUnit.GPB = usdPerUnit.GBP;
    }
    return usdPerUnit;
  }

  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as {
    rates?: Record<string, unknown>;
    quotes?: Record<string, unknown>;
  };

  const resolvedRates: Record<string, number> = {};
  if (payload.rates && typeof payload.rates === "object") {
    for (const [code, value] of Object.entries(payload.rates)) {
      const rate = Number(value);
      if (!Number.isFinite(rate) || rate <= 0) {
        continue;
      }
      resolvedRates[code.toUpperCase()] = rate;
    }
  } else if (payload.quotes && typeof payload.quotes === "object") {
    for (const [pair, value] of Object.entries(payload.quotes)) {
      const rate = Number(value);
      if (!Number.isFinite(rate) || rate <= 0) {
        continue;
      }
      if (pair.length === 6 && pair.startsWith("USD")) {
        resolvedRates[pair.slice(3).toUpperCase()] = rate;
      }
    }
  }

  if (Object.keys(resolvedRates).length === 0) {
    return null;
  }

  const usdPerUnit: Record<string, number> = { USD: 1 };
  for (const currency of SUPPORTED_CURRENCIES) {
    if (currency === "USD") {
      usdPerUnit[currency] = 1;
      continue;
    }
    const usdToCurrency = Number(resolvedRates[currency]);
    if (!Number.isFinite(usdToCurrency) || usdToCurrency <= 0) {
      continue;
    }
    usdPerUnit[currency] = Number((1 / usdToCurrency).toFixed(8));
  }
  if (usdPerUnit.GBP) {
    usdPerUnit.GPB = usdPerUnit.GBP;
  }
  return usdPerUnit;
}

export async function GET() {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  if (cachedExchangeRates && cachedExchangeRates.expiresAt > Date.now()) {
    return NextResponse.json(cachedExchangeRates.payload, {
      headers: {
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=21600",
      },
    });
  }

  try {
    const symbols = SUPPORTED_CURRENCIES.filter((entry) => entry !== "USD").join(",");
    let usdPerUnit: Record<string, number> | null = null;
    for (const endpoint of [
      `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${encodeURIComponent(symbols)}`,
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${encodeURIComponent(symbols)}`,
    ]) {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => null);
      usdPerUnit = parseRates(body);
      if (usdPerUnit) {
        break;
      }
    }
    if (!usdPerUnit) {
      throw new Error("Unable to parse exchange rates.");
    }
    const payload = {
      provider: "frankfurter.dev",
      base: "USD" as const,
      usdPerUnit: {
        ...FALLBACK_USD_PER_UNIT,
        ...usdPerUnit,
      },
      fetchedAt: new Date().toISOString(),
    };
    cachedExchangeRates = {
      expiresAt: Date.now() + EXCHANGE_RATE_CACHE_TTL_MS,
      payload,
    };
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=21600",
      },
    });
  } catch {
    const payload = {
      provider: "fallback",
      base: "USD" as const,
      usdPerUnit: FALLBACK_USD_PER_UNIT,
      fetchedAt: new Date().toISOString(),
    };
    cachedExchangeRates = {
      expiresAt: Date.now() + 30 * 60 * 1000,
      payload,
    };
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=1800",
      },
    });
  }
}
