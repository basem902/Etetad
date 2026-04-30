import 'server-only'

/**
 * Lightweight in-memory rate limiter for Phase 16 marketing surface.
 *
 * Scope: best-effort spam protection for /contact submissions. Honeypot
 * is the PRIMARY defense; this is layer 2.
 *
 * Caveats (acceptable for Phase 16, MUST upgrade for Phase 17/18):
 *   - Per-instance only (Vercel lambdas don't share memory). A determined
 *     attacker hitting via different cold-start instances can bypass.
 *   - State resets on lambda recycle (~15min on Vercel free tier).
 *   - For production-grade rate limit (Phase 17 join links + Phase 18
 *     subscription orders/receipt uploads), use @upstash/ratelimit + Redis.
 *
 * The interface here matches Upstash's signature so the swap is mechanical:
 *   const { success, limit, remaining, reset } = await ratelimit.limit(key)
 */

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number // ms epoch
}

interface Bucket {
  count: number
  resetAt: number // ms epoch
}

const store = new Map<string, Bucket>()

// Periodic cleanup of expired buckets (prevents unbounded growth).
// Runs at most once per request that triggers it; cheap.
let lastCleanup = 0
function maybeCleanup(now: number) {
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [k, b] of store) {
    if (b.resetAt <= now) store.delete(k)
  }
}

/**
 * Check + increment the bucket. Returns success=false if over limit.
 *
 * @param key      stable identifier (e.g., `contact:${ip}`)
 * @param limit    max requests in the window
 * @param windowMs window size in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  maybeCleanup(now)

  const bucket = store.get(key)

  // No bucket OR expired → start fresh
  if (!bucket || bucket.resetAt <= now) {
    const newBucket = { count: 1, resetAt: now + windowMs }
    store.set(key, newBucket)
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: newBucket.resetAt,
    }
  }

  // Existing bucket
  if (bucket.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: bucket.resetAt,
    }
  }

  bucket.count += 1
  return {
    success: true,
    limit,
    remaining: limit - bucket.count,
    reset: bucket.resetAt,
  }
}

/**
 * Read the IP from request headers in the order Vercel/Next sets them.
 * Returns null if no IP can be determined (e.g., local dev).
 *
 * Phase 17/18 will use this same helper, swapping the in-memory limiter
 * above for Upstash.
 */
export function getClientIp(headers: Headers): string | null {
  // Vercel sets x-forwarded-for as a comma-separated list, leftmost = original client
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}
