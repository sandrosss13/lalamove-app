/**
 * Minimal in-memory rate limiter for endpoints reachable without a session.
 *
 * Deliberately process-local: counters live in a `Map`, so they reset on
 * restart and are not shared between instances. That is enough to blunt casual
 * abuse of the endpoints that spend a third-party API budget, without adding
 * Redis or another dependency to the stack.
 */

export type RateLimitOptions = {
  /** Maximum number of allowed calls per key within the window. */
  limit: number;
  /** Length of the sliding window, in milliseconds. */
  windowMs: number;
};

type RateLimitEntry = {
  /** Timestamps of the calls still inside the window, oldest first. */
  timestamps: number[];
  /** When this entry can be dropped: the last call's window has fully elapsed. */
  expiresAt: number;
};

const entries = new Map<string, RateLimitEntry>();

/** How often idle keys are swept, so the `Map` cannot grow without bound. */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweptAt = 0;

/** Drop entries whose window has fully elapsed, at most once per interval. */
function sweepExpired(now: number): void {
  if (now - lastSweptAt < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweptAt = now;
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }
}

/**
 * Record a call against `key` and report whether it is allowed. Returns `false`
 * once `limit` calls have already been made inside the trailing `windowMs`;
 * rejected calls are not recorded, so a caller that keeps hammering does not
 * push its own window forward indefinitely.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): boolean {
  // Production only. The limiter exists to stop abuse of the third-party API
  // keys over the public internet, and it tells callers apart by the proxy
  // headers only a real deployment puts in front of the app. Under `next dev`
  // there is no `x-forwarded-for`, so every caller collapses into the single
  // shared `"unknown-caller"` bucket: the whole machine spends one budget
  // across every tab, and a few passes through the booking form lock the
  // developer out of their own app. That protects nothing locally — the key is
  // already in the developer's own `.env` — while making the app unusable.
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const now = Date.now();
  sweepExpired(now);

  const windowStart = now - windowMs;
  const recent = (entries.get(key)?.timestamps ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  const allowed = recent.length < limit;
  if (allowed) {
    recent.push(now);
  }

  entries.set(key, { timestamps: recent, expiresAt: now + windowMs });

  return allowed;
}
