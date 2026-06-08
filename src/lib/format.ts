export const FISCAL_MONTH_LABELS = [
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
] as const;

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function coerceNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function roundWholeNumber(value: number) {
  return Math.round(coerceNumber(value));
}

export function formatWholeNumber(value: number) {
  return WHOLE_NUMBER_FORMATTER.format(roundWholeNumber(value));
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  const safeValue = coerceNumber(value);
  if (maximumFractionDigits === 0) {
    return formatWholeNumber(safeValue);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(safeValue);
}

export function formatCurrency(value: number) {
  return CURRENCY_FORMATTER.format(coerceNumber(value));
}

export function formatCompactCurrency(value: number) {
  const safeValue = coerceNumber(value);
  const absolute = Math.abs(safeValue);
  const sign = safeValue < 0 ? "-" : "";

  if (absolute >= 1_000_000_000) {
    return `${sign}$${(absolute / 1_000_000_000).toFixed(2)}B`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
  }
  if (absolute >= 1_000) {
    return `${sign}$${(absolute / 1_000).toFixed(2)}K`;
  }

  return `${sign}$${absolute.toFixed(2)}`;
}

export function formatMoneyValue(value: number) {
  return formatWholeNumber(value);
}

export function formatSignedCurrency(value: number) {
  const safeValue = coerceNumber(value);
  if (safeValue < 0) {
    return `-${formatCurrency(Math.abs(safeValue))}`;
  }
  return formatCurrency(safeValue);
}

export function getFiscalYearEndLabel(financialYear?: string | null, today = new Date()) {
  const normalized = String(financialYear ?? "").trim();
  const matches = normalized.match(/(\d{4})/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }
  return String(today.getMonth() >= 3 ? today.getFullYear() + 1 : today.getFullYear());
}

export function resolveCurrentFiscalMonthLabel(
  months: readonly string[] = FISCAL_MONTH_LABELS,
  today = new Date(),
) {
  const candidate = `${SHORT_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
  if (months.includes(candidate)) {
    return candidate;
  }

  const candidateShort = SHORT_MONTHS[today.getMonth()];
  const matchingMonth = months.find((entry) => entry.startsWith(candidateShort));
  if (matchingMonth) {
    return matchingMonth;
  }

  return months[0] ?? "";
}

export function getFiscalMonthsThrough(
  targetMonthLabel: string,
  months: readonly string[] = FISCAL_MONTH_LABELS,
) {
  const index = months.indexOf(targetMonthLabel);
  if (index === -1) {
    return [...months];
  }
  return months.slice(0, index + 1);
}

export function formatDateMmDdYy(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = String(parsed.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

export function isDateLikeValue(value: unknown) {
  if (value instanceof Date) {
    return true;
  }
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text);
}
