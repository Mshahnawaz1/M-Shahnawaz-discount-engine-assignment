/**
 * geminiRuleParser.js (server-only — holds the API key)
 *
 * Turns one plain-English sentence into a *candidate* DiscountRule using
 * Gemini's JSON mode with a response schema. The output is still treated as
 * untrusted: the browser re-validates it with engine/validation.js and the
 * user confirms it before it reaches the engine.
 */

import { MAX_RULE_TEXT } from '../src/inputs/limits.js'

const DEFAULT_MODEL = 'gemini-2.5-flash'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const MAX_INPUT_CHARS = MAX_RULE_TEXT

const SYSTEM_PROMPT = `You convert a merchant's plain-English description of ONE discount rule into JSON for an e-commerce checkout pricing engine.

Rule fields:
- scope: "brand" (applies to every product of one brand), "platform" (every item sold on one marketplace, e.g. Amazon India, Flipkart, Noon), or "cart" (applies to the whole cart total when it reaches a minimum value).
- appliesTo: the brand or platform name, exactly as the merchant wrote it (fix capitalisation; if it clearly matches a known name from context, use that spelling). null for cart rules.
- type: "percentage" (e.g. "20% off") or "flat" (a rupee amount: "Rs.100", "₹100", "100 rupees").
- value: the number only (20 for 20%, 100 for Rs.100).
- stackable: true ONLY if the text says it stacks / combines / applies on top of other offers. Otherwise false.
- minCartValue: for cart rules, the minimum cart value in rupees ("above", "more than", "over", "at least" all mean this threshold). null otherwise.

Strict rules:
- NEVER invent or guess a number. If the discount value, the brand/platform, or (for cart rules) the threshold is not stated, return status "ambiguous", list what is missing in "missing", set rule to null, and write a short, friendly "clarification" telling the merchant what to add, with an example sentence.
- If the text describes more than one rule, or something unsupported (buy-one-get-one, free shipping, category or product-level discounts, date ranges), return "ambiguous" and explain what is supported.
- If the text is not about a discount at all, return "ambiguous".
- When status is "ok", "missing" is [] and "clarification" is a one-line plain-English restatement of the rule.

Examples:
"20% off for Natura Casa brand, stackable with other offers" -> {"status":"ok","rule":{"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null},"missing":[],"clarification":"20% off all Natura Casa products, combinable with other offers."}
"Rs.100 flat discount on all Flipkart items" -> {"status":"ok","rule":{"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null},"missing":[],"clarification":"Rs.100 off every item sold on Flipkart."}
"10% off if cart value is more than Rs.5,000" -> {"status":"ok","rule":{"scope":"cart","appliesTo":null,"type":"percentage","value":10,"stackable":false,"minCartValue":5000},"missing":[],"clarification":"10% off the whole cart when it reaches Rs.5,000."}
"Give a discount for big orders" -> {"status":"ambiguous","rule":null,"missing":["discount value","minimum cart value"],"clarification":"How much off, and from what cart value? For example: \\"10% off orders above Rs.5,000\\"."}`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['ok', 'ambiguous'] },
    rule: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        scope: { type: 'STRING', enum: ['brand', 'platform', 'cart'] },
        appliesTo: { type: 'STRING', nullable: true },
        type: { type: 'STRING', enum: ['percentage', 'flat'] },
        value: { type: 'NUMBER' },
        stackable: { type: 'BOOLEAN' },
        minCartValue: { type: 'NUMBER', nullable: true },
      },
      required: ['scope', 'type', 'value', 'stackable'],
    },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
    clarification: { type: 'STRING' },
  },
  required: ['status', 'missing', 'clarification'],
}

export class RuleParserError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

const cleanList = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => s.trim().slice(0, 60))
    .slice(0, 50)

export async function parseRuleText(text, { apiKey, model, knownBrands, knownPlatforms, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (!apiKey) throw new RuleParserError('The rule parser is not configured (missing GEMINI_API_KEY).', 500)

  const brands = cleanList(knownBrands)
  const platforms = cleanList(knownPlatforms)
  const context = [
    brands.length ? `Known brands: ${brands.join(', ')}` : null,
    platforms.length ? `Known platforms: ${platforms.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `${context ? context + '\n\n' : ''}Merchant's rule: """${text}"""` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let resp
  try {
    resp = await fetchImpl(`${API_BASE}/${model || DEFAULT_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    throw new RuleParserError(err.name === 'AbortError' ? 'The AI service took too long to respond.' : 'Could not reach the AI service.', 504)
  } finally {
    clearTimeout(timer)
  }

  if (resp.status === 429) throw new RuleParserError('The AI service is rate-limited right now. Please try again in a minute.', 429)
  if (!resp.ok) {
    // Log details server-side only; never echo upstream errors (could include request metadata).
    console.error('Gemini error', resp.status, await resp.text().catch(() => ''))
    throw new RuleParserError('The AI service returned an error.', 502)
  }

  const data = await resp.json()
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  try {
    return JSON.parse(raw)
  } catch {
    console.error('Gemini returned non-JSON:', raw.slice(0, 500))
    throw new RuleParserError('The AI returned an unreadable answer. Please rephrase and try again.', 502)
  }
}

/**
 * Plain Node (req, res) handler — works as a Vercel function and as Vite dev
 * middleware without framework-specific helpers.
 */
export async function handleParseRuleRequest(req, res, env = process.env) {
  const send = (status, payload) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  if (req.method !== 'POST') return send(405, { error: 'Use POST.' })

  let body = req.body
  if (body === undefined || typeof body === 'string') {
    try {
      const rawBody = typeof body === 'string' ? body : await readStream(req)
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      return send(400, { error: 'Request body must be JSON.' })
    }
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return send(400, { error: 'Please describe a rule first.' })
  if (text.length > MAX_INPUT_CHARS) return send(400, { error: `Please keep the rule under ${MAX_INPUT_CHARS} characters.` })

  try {
    const parsed = await parseRuleText(text, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      knownBrands: body.knownBrands,
      knownPlatforms: body.knownPlatforms,
    })
    return send(200, parsed)
  } catch (err) {
    if (err instanceof RuleParserError) return send(err.status, { error: err.message })
    console.error(err)
    return send(500, { error: 'Unexpected error while parsing the rule.' })
  }
}

function readStream(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 20000) reject(new Error('too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
