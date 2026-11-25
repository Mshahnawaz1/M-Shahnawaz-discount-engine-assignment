import { describe, it, expect } from 'vitest'
import { createTokenBucketLimiter, getClientIp, checkRateLimit } from '../server/rateLimiter.js'
import { handleParseRuleRequest } from '../server/geminiRuleParser.js'

function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms) => (t += ms) }
}

describe('token bucket', () => {
  it('allows a burst up to capacity, then refuses with retry-after', () => {
    const c = clock()
    const l = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 / 10, now: c.now })
    expect([1, 2, 3].map(() => l.take('a').ok)).toEqual([true, true, true])
    const denied = l.take('a')
    expect(denied.ok).toBe(false)
    expect(denied.retryAfterSec).toBe(10)
  })

  it('refills continuously over time and never above capacity', () => {
    const c = clock()
    const l = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1, now: c.now })
    l.take('a'); l.take('a')
    expect(l.take('a').ok).toBe(false)
    c.advance(1000)
    expect(l.take('a').ok).toBe(true)
    expect(l.take('a').ok).toBe(false)
    c.advance(60_000) // long idle → capped at capacity, not 60
    expect([1, 2, 3].map(() => l.take('a').ok)).toEqual([true, true, false])
  })

  it('keeps separate buckets per key', () => {
    const l = createTokenBucketLimiter({ capacity: 1, refillPerSec: 0.01, now: clock().now })
    expect(l.take('1.1.1.1').ok).toBe(true)
    expect(l.take('1.1.1.1').ok).toBe(false)
    expect(l.take('2.2.2.2').ok).toBe(true)
  })

  it('bounds memory by evicting least-recently-used keys', () => {
    const l = createTokenBucketLimiter({ capacity: 1, refillPerSec: 0.01, maxKeys: 100, now: clock().now })
    for (let i = 0; i < 1000; i++) l.take(`ip-${i}`)
    expect(l.size()).toBe(100)
  })
})

describe('checkRateLimit (per-IP + global)', () => {
  it('global cap applies across IPs and refunds the IP token when it refuses', () => {
    const c = clock()
    const limiters = {
      perIp: createTokenBucketLimiter({ capacity: 2, refillPerSec: 0.01, now: c.now }),
      global: createTokenBucketLimiter({ capacity: 3, refillPerSec: 0.01, now: c.now }),
    }
    expect(checkRateLimit(limiters, 'a').ok).toBe(true)
    expect(checkRateLimit(limiters, 'b').ok).toBe(true)
    expect(checkRateLimit(limiters, 'c').ok).toBe(true)
    const r = checkRateLimit(limiters, 'd') // global exhausted
    expect(r).toMatchObject({ ok: false, scope: 'global' })
    // d's own token was refunded: it still has its full 2 once global refills
    c.advance(200_000)
    expect(checkRateLimit(limiters, 'd').ok).toBe(true)
    expect(checkRateLimit(limiters, 'd').ok).toBe(true)
  })
})

describe('getClientIp', () => {
  it.each([
    [{ headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' } }, '9.9.9.9'],
    [{ headers: { 'x-forwarded-for': '1.1.1.1, 10.0.0.1' } }, '1.1.1.1'],
    [{ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, '127.0.0.1'],
    [{}, 'unknown'],
  ])('%j → %s', (req, ip) => expect(getClientIp(req)).toBe(ip))
})

describe('handler integration', () => {
  const mockRes = () => ({
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v },
    end(b) { this.body = b },
  })

  it('returns 429 + Retry-After once an IP exhausts its bucket; invalid requests are not counted', async () => {
    const c = clock()
    const limiters = {
      perIp: createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 / 12, now: c.now }),
      global: createTokenBucketLimiter({ capacity: 100, refillPerSec: 1, now: c.now }),
    }
    const req = (text) => ({ method: 'POST', headers: { 'x-real-ip': '5.5.5.5' }, body: { text } })
    const env = {} // no key → 500 after passing the limiter (so no network call)

    // Empty text is rejected before the limiter and doesn't consume tokens.
    for (let i = 0; i < 5; i++) await handleParseRuleRequest(req(''), mockRes(), env, limiters)

    const codes = []
    for (let i = 0; i < 3; i++) {
      const res = mockRes()
      await handleParseRuleRequest(req('10% off'), res, env, limiters)
      codes.push(res.statusCode)
      if (res.statusCode === 429) {
        expect(res.headers['Retry-After']).toBe('12')
        expect(JSON.parse(res.body).error).toMatch(/wait 12s/)
      }
    }
    expect(codes).toEqual([500, 500, 429])
  })
})
