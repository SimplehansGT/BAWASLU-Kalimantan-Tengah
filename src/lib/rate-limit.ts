/**
 * Fixed-window in-memory rate limiter.
 *
 * Per-instance, so it is a speed bump rather than a guarantee — a serverless
 * deployment runs several instances and each keeps its own counters. That is
 * accepted for now: the ingest route is also secret-gated, and the limiter
 * exists to blunt a runaway retry loop, not to stop a determined attacker.
 * Move it to Postgres or Upstash before the endpoint is wired to anything real.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (windows.size < 1000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit = 30, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    const window: Window = { count: 1, resetAt: now + windowMs };
    windows.set(key, window);
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: window.resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;

  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Test hook. */
export function resetRateLimits() {
  windows.clear();
}
