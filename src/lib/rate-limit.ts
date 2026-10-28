import { AppError } from "@/lib/errors";

/**
 * Fixed-window in-memory rate limiter. Adequate for a single-instance beta deployment; use a shared
 * store (e.g. Redis) when running multiple instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) {
    const secs = Math.ceil((b.resetAt - now) / 1000);
    throw new AppError("RATE_LIMITED", `Too many attempts. Try again in ${secs} second(s).`);
  }
}

export function resetRateLimits() {
  buckets.clear();
}
