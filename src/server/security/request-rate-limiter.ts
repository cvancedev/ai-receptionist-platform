if (typeof window !== "undefined") {
  throw new Error("The receptionist request rate limiter is server-only.");
}

/**
 * Bounded, process-local fixed-window rate limiter for the B2.2 endpoint.
 *
 * It is intentionally small and dependency-free. State is not shared between
 * processes, which is appropriate for this bounded local pilot and is recorded
 * as a deployment limitation. Bucket keys are bounded and the bucket map is
 * capped so untrusted client identifiers cannot grow memory without limit.
 */
export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAXIMUM_KEY_LENGTH = 200;
const MAXIMUM_BUCKETS = 10_000;
const MINIMUM_WINDOW_MS = 1_000;
const MAXIMUM_WINDOW_MS = 60 * 60 * 1_000;
const MAXIMUM_LIMIT = 10_000;

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;
  private readonly maximumBuckets: number;

  constructor(options: { readonly now?: () => number; readonly maximumBuckets?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.maximumBuckets = boundedInteger(
      options.maximumBuckets ?? MAXIMUM_BUCKETS,
      1,
      MAXIMUM_BUCKETS,
    ) ?? MAXIMUM_BUCKETS;
  }

  consume(key: unknown, policy: RateLimitPolicy): RateLimitDecision {
    const normalizedKey = normalizeKey(key);
    const limit = boundedInteger(policy?.limit, 1, MAXIMUM_LIMIT) ?? 1;
    const windowMs = boundedInteger(
      policy?.windowMs,
      MINIMUM_WINDOW_MS,
      MAXIMUM_WINDOW_MS,
    ) ?? MINIMUM_WINDOW_MS;
    const now = this.currentTime();

    this.prune(now);
    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maximumBuckets) {
        const oldest = this.buckets.keys().next().value as string | undefined;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(normalizedKey, bucket);
    }

    if (bucket.count >= limit) {
      return Object.freeze({
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
      });
    }

    bucket.count += 1;
    return Object.freeze({
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: 0,
    });
  }

  size(): number {
    this.prune(this.currentTime());
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  private currentTime(): number {
    const value = this.now();
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("The rate-limit clock is unavailable.");
    }
    return Math.trunc(value);
  }
}

export function clientRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const candidate = forwarded?.split(",")[0]?.trim()
    || real?.trim()
    || "unidentified-client";
  return candidate.slice(0, MAXIMUM_KEY_LENGTH);
}

function normalizeKey(key: unknown): string {
  if (typeof key !== "string" || key.length === 0) return "unidentified-client";
  return key.slice(0, MAXIMUM_KEY_LENGTH);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}
