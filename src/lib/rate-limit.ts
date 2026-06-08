import type { NextRequest } from "next/server";

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function getRequestIp(request: NextRequest | Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function checkRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const cutoff = now - options.windowMs;
  const bucket = buckets.get(options.key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > cutoff);

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(options.key, bucket);

  if (buckets.size > MAX_BUCKETS) {
    for (const [key, value] of buckets) {
      value.timestamps = value.timestamps.filter((timestamp) => timestamp > cutoff);
      if (value.timestamps.length === 0) {
        buckets.delete(key);
      }
      if (buckets.size <= MAX_BUCKETS) {
        break;
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitKey(request: NextRequest | Request, category: string, subject?: string | null) {
  const normalizedSubject = String(subject ?? "").trim().toLowerCase();
  return `${category}:${getRequestIp(request)}:${normalizedSubject || "anonymous"}`;
}
