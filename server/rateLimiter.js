/**
 * rateLimiter.js — in-memory token bucket.
 *
 * Each key (an IP, or "global") has a bucket of `capacity` tokens that refills
 * continuously at `refillPerSec`. A request takes one token, or is refused
 * with a retry-after hint.
 *
 * Limitation (deliberate, documented): state lives in this process. On Vercel
 * each warm function instance has its own buckets and loses them on cold start,
 * so limits are best-effort per instance. That's enough to stop casual abuse
 * and runaway loops. For exact limits across instances, swap the Map for Redis
 * (e.g. Upstash) behind the same take()/refund() interface.
 */

export function createTokenBucketLimiter({ capacity, refillPerSec, maxKeys = 10_000, now = () => Date.now() }) {
  // Map iteration order = insertion order; re-inserting on use makes it LRU.
  const buckets = new Map()

  function refill(b, t) {
    b.tokens = Math.min(capacity, b.tokens + ((t - b.last) / 1000) * refillPerSec)
    b.last = t
  }

  function take(key) {
    const t = now()
    const b = buckets.get(key) ?? { tokens: capacity, last: t }
    refill(b, t)

    buckets.delete(key)
    buckets.set(key, b)
    // Bound memory: a flood of new IPs evicts the least-recently-used buckets.
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value)

    if (b.tokens >= 1) {
      b.tokens -= 1
      return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 }
    }
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSec)) }
  }

  /** Give a token back (used when a later check rejects the request). */
  function refund(key) {
    const b = buckets.get(key)
    if (b) b.tokens = Math.min(capacity, b.tokens + 1)
  }

  return { take, refund, size: () => buckets.size }
}

/**
 * Client IP. On Vercel, x-real-ip / x-forwarded-for are set by the edge network
 * (client-supplied values are overwritten), so they can be trusted there.
 * Locally there's no proxy, so fall back to the socket address.
 */
export function getClientIp(req) {
  const h = req.headers ?? {}
  const real = h['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()
  const fwd = h['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Per IP: burst of 5, then 1 every 12s (≈5/min sustained).
// Global: burst of 30, then 1/s — caps total Gemini spend if IPs are rotated.
export function createDefaultLimiters() {
  return {
    perIp: createTokenBucketLimiter({ capacity: 5, refillPerSec: 1 / 12 }),
    global: createTokenBucketLimiter({ capacity: 30, refillPerSec: 1 }),
  }
}

/** Checks per-IP then global; refunds the IP token if the global bucket refuses. */
export function checkRateLimit(limiters, ip) {
  const ipResult = limiters.perIp.take(ip)
  if (!ipResult.ok) return { ...ipResult, scope: 'ip' }
  const globalResult = limiters.global.take('global')
  if (!globalResult.ok) {
    limiters.perIp.refund(ip)
    return { ...globalResult, scope: 'global' }
  }
  return ipResult
}
