/**
 * Sliding-window rate limiter held in process memory.
 * Single-instance deploys only; move to Redis before scaling horizontally.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) prune(now, windowMs);

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  buckets.set(key, bucket);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
    };
  }

  bucket.timestamps.push(now);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterMs: 0,
  };
}

function prune(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    const fresh = bucket.timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else bucket.timestamps = fresh;
  }
}

/**
 * Caller IP as reported by the edge proxy. Requires a trusted proxy in front
 * of the app — these headers are client-settable when exposed directly.
 */
export function clientIp(req: Request): string {
  const direct =
    req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/** Exposed for tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
