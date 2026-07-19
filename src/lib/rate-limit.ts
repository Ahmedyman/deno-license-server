/**
 * Fixed-window in-memory rate limiter. Deliberately boring: this service runs
 * as a single small deployment; per-instance limits are adequate for the
 * threat (key brute force / request floods) and add zero infrastructure.
 * Limits per docs/12 D3 "rate limiting" requirement.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(bucket: string, key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const w = windows.get(id);
  if (!w || w.resetAt <= now) {
    windows.set(id, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  w.count += 1;
  if (w.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) };
}

/** Opportunistic cleanup so the map cannot grow unbounded. */
export function pruneRateLimiter(now = Date.now()): void {
  for (const [id, w] of windows) if (w.resetAt <= now) windows.delete(id);
}

/** Test hook. */
export function resetRateLimiter(): void {
  windows.clear();
}

export function clientIp(req: Request): string {
  // behind the host platform's proxy the first x-forwarded-for hop is the client
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}
