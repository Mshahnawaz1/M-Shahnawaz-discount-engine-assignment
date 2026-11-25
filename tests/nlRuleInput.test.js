import { describe, it, expect, vi } from 'vitest'
import { interpretLlmResponse, numbersInText } from '../src/inputs/nlRuleInput.js'
import { handleParseRuleRequest, parseRuleText } from '../server/geminiRuleParser.js'
import { calculateCart } from '../src/engine/discountEngine.js'
import { SAMPLE_CART, SAMPLE_RULES } from './fixtures.js'

const ctx = (text) => ({ text, existingRules: SAMPLE_RULES, cartItems: SAMPLE_CART })
const ok = (rule, clarification = '') => ({ status: 'ok', rule, missing: [], clarification })

describe('interpretLlmResponse — the brief examples', () => {
  it('"20% off for Natura Casa brand, stackable with other offers"', () => {
    const text = '20% off for Natura Casa brand, stackable with other offers'
    const res = interpretLlmResponse(ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }), ctx(text))
    expect(res.kind).toBe('ok')
    expect(res.rule).toMatchObject({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true })
    expect(res.warnings).toEqual([])
  })

  it('"Rs.100 flat discount on all Flipkart items"', () => {
    const text = 'Rs.100 flat discount on all Flipkart items'
    const res = interpretLlmResponse(ok({ scope: 'platform', appliesTo: 'flipkart', type: 'flat', value: 100, stackable: false }), ctx(text))
    expect(res.kind).toBe('ok')
    expect(res.rule).toMatchObject({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false })
  })

  it('"10% off if cart value is more than Rs.5,000"', () => {
    const text = '10% off if cart value is more than Rs.5,000'
    const res = interpretLlmResponse(ok({ scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }), ctx(text))
    expect(res.kind).toBe('ok')
    expect(res.rule).toMatchObject({ scope: 'cart', appliesTo: null, value: 10, minCartValue: 5000 })
  })

  it('"Give a discount for big orders" → ambiguous with the LLM clarification', () => {
    const res = interpretLlmResponse(
      { status: 'ambiguous', rule: null, missing: ['discount value', 'minimum cart value'], clarification: 'How much off, and from what cart value?' },
      ctx('Give a discount for big orders')
    )
    expect(res).toEqual({ kind: 'ambiguous', message: 'How much off, and from what cart value?', missing: ['discount value', 'minimum cart value'] })
  })
})

describe('interpretLlmResponse — guardrails against bad LLM output', () => {
  it('rejects a hallucinated value even if the LLM says ok', () => {
    const res = interpretLlmResponse(
      ok({ scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      ctx('Give a discount for big orders')
    )
    expect(res.kind).toBe('ambiguous')
    expect(res.message).toMatch(/won't guess/)
  })

  it.each([
    [{ scope: 'category', appliesTo: 'Decor', type: 'percentage', value: 10, stackable: false }, /scope must be/],
    [{ scope: 'brand', appliesTo: 'X', type: 'percentage', value: 120, stackable: false }, /exceed 100%/],
    [{ scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: null }, /minimum cart value/],
    [{ scope: 'platform', appliesTo: '', type: 'flat', value: 100, stackable: false }, /platform name/],
  ])('invalid rule %j → ambiguous, not a crash', (rule, msg) => {
    const res = interpretLlmResponse(ok(rule), ctx('120% 10 100'))
    expect(res.kind).toBe('ambiguous')
    expect(res.message).toMatch(msg)
  })

  it.each([null, 'garbage', 42, {}])('malformed payload %j → ambiguous', (payload) => {
    expect(interpretLlmResponse(payload, ctx('x')).kind).toBe('ambiguous')
  })

  it('warns and suggests a fix for a misspelled platform', () => {
    const res = interpretLlmResponse(ok({ scope: 'platform', appliesTo: 'Flipcart', type: 'flat', value: 100, stackable: false }), ctx('Rs.100 off Flipcart'))
    expect(res.kind).toBe('ok')
    expect(res.warnings[0]).toMatch(/Did you mean "Flipkart"/)
    expect(res.suggestion).toEqual({ appliesTo: 'Flipkart' })
  })

  it('warns about duplicates of an active rule', () => {
    const res = interpretLlmResponse(ok({ scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false }), ctx('15% off Amazon India'))
    expect(res.warnings).toContain('An identical rule is already active.')
  })
})

describe('new rule re-runs the engine on the current cart', () => {
  it('adding "20% off Natura Casa, stackable" changes ITEM-01, ITEM-02 and the total', () => {
    const { rule } = interpretLlmResponse(
      ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true }),
      ctx('20% off for Natura Casa brand, stackable')
    )
    const res = calculateCart(SAMPLE_CART, [...SAMPLE_RULES, { ...rule, ruleId: 'RULE-05' }])
    const i1 = res.items.find((i) => i.itemId === 'ITEM-01')
    // RULE-01 wins (195) → 1104, then 20% stacked → 1104 - 221 = 883
    expect(i1.finalPrice).toBe(883)
    expect(i1.appliedRules).toEqual(['RULE-01', 'RULE-05'])
    expect(i1.reasoning).toMatch(/Brand offer: 20% off/)
    expect(res.total).toBeLessThan(5339)
  })
})

it('numbersInText', () => {
  expect(numbersInText('10% off if cart value is more than Rs.5,000')).toEqual([10, 5000])
  expect(numbersInText('Rs 200 off above 5k')).toEqual([200, 5000])
  expect(numbersInText('half price on all Noon items')).toEqual([50])
})

// ── server ─────────────────────────────────────────────────────────

function mockRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v },
    end(b) { this.body = b },
    json() { return JSON.parse(this.body) },
  }
}

const geminiReply = (obj) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
})

describe('server handler', () => {
  it('rejects non-POST, empty and over-long input without calling the LLM', async () => {
    for (const [req, code] of [
      [{ method: 'GET' }, 405],
      [{ method: 'POST', body: { text: '  ' } }, 400],
      [{ method: 'POST', body: { text: 'x'.repeat(501) } }, 400],
    ]) {
      const res = mockRes()
      await handleParseRuleRequest(req, res, { GEMINI_API_KEY: 'k' })
      expect(res.statusCode).toBe(code)
    }
  })

  it('reports a missing key as a clear 500', async () => {
    const res = mockRes()
    await handleParseRuleRequest({ method: 'POST', body: { text: '10% off' } }, res, {})
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toMatch(/GEMINI_API_KEY/)
  })

  it('sends schema-constrained request and returns parsed JSON', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ status: 'ok', rule: { scope: 'cart' }, missing: [], clarification: '' }))
    const out = await parseRuleText('10% off', { apiKey: 'k', knownBrands: ['Natura Casa'], fetchImpl })
    expect(out.status).toBe('ok')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toMatch(/gemini-.*:generateContent$/)
    expect(init.headers['x-goog-api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.contents[0].parts[0].text).toMatch(/Known brands: Natura Casa/)
  })

  it('turns non-JSON model output into a friendly error', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Sure! Here you go' }] } }] }) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(parseRuleText('x', { apiKey: 'k', fetchImpl })).rejects.toThrow(/unreadable/)
    spy.mockRestore()
  })

  it('falls back to the next model on 503 / 404 and reports which model answered', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const statuses = [503, 404, 503, 503]
    const fetchImpl = vi.fn(async () => {
      const st = statuses.shift()
      return st ? { ok: false, status: st, text: async () => 'busy' } : geminiReply({ status: 'ok', rule: null, missing: [], clarification: '' })
    })
    const out = await parseRuleText('x', { apiKey: 'k', model: 'a,b,c', fetchImpl })
    expect(fetchImpl.mock.calls.map(([url]) => url.match(/models\/([^:]+)/)[1])).toEqual(['a', 'b', 'a', 'b', 'c'])
    expect(out.model).toBe('c')
    spy.mockRestore()
  })

  it('does not retry a non-retryable error (bad key)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => '' }))
    await expect(parseRuleText('x', { apiKey: 'bad', fetchImpl })).rejects.toThrow(/API key configuration/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('all models busy → friendly 503', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = async () => ({ ok: false, status: 503, text: async () => '' })
    await expect(parseRuleText('x', { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ status: 503 })
    spy.mockRestore()
  })

  it('maps rate limits to 429', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => '' })
    await expect(parseRuleText('x', { apiKey: 'k', fetchImpl })).rejects.toMatchObject({ status: 429 })
  })
})
