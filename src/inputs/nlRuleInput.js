/**
 * nlRuleInput.js — input adapter: plain English → candidate DiscountRule
 *
 * The LLM (behind /api/parse-rule) only *proposes* a rule. This module decides
 * whether the proposal is usable:
 *   1. the LLM itself may say "ambiguous"          → ask the user to be specific
 *   2. the proposal must pass validateRule()        → same bar as a CSV row
 *   3. every number must appear in the user's text → no invented discounts
 *   4. brand/platform names are matched to the cart → warnings + spelling fixes
 * Nothing reaches the engine until the user confirms.
 */

import { validateRule, parseAmount } from '../engine/validation.js'
import { rupees, ruleValueLabel } from '../engine/format.js'

/** POST the text to the serverless parser. Throws Error with a user-friendly message. */
export async function requestRuleParse(text, { cartItems = [] } = {}, fetchImpl = globalThis.fetch) {
  const knownBrands = [...new Set(cartItems.map((i) => i.brand))]
  const knownPlatforms = [...new Set(cartItems.map((i) => i.platform))]
  let resp
  try {
    resp = await fetchImpl('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, knownBrands, knownPlatforms }),
    })
  } catch {
    throw new Error('Could not reach the rule parser. Check your connection and try again.')
  }
  let payload = null
  try {
    payload = await resp.json()
  } catch {
    /* fall through */
  }
  if (!resp.ok) throw new Error(payload?.error || `Rule parser failed (HTTP ${resp.status}).`)
  if (!payload || typeof payload !== 'object') throw new Error('Rule parser returned an empty answer.')
  return payload
}

const WORD_NUMBERS = { half: 50, quarter: 25 }

/** All numbers written in the text: "Rs.5,000 and 10%" → [5000, 10]. Handles "5k", "half price". */
export function numbersInText(text) {
  const out = []
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) out.push(n)
  }
  for (const m of String(text).matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n)
  }
  return out
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

const norm = (s) => String(s ?? '').trim().toLowerCase()

const sameRule = (a, b) =>
  a.scope === b.scope &&
  norm(a.appliesTo) === norm(b.appliesTo) &&
  a.type === b.type &&
  a.value === b.value &&
  (a.minCartValue ?? null) === (b.minCartValue ?? null)

/**
 * Decides what to do with the LLM's answer. Pure — fully unit-testable.
 *
 * Returns one of:
 *   { kind: 'ok', rule, warnings: string[], suggestion: null | { appliesTo }, restatement }
 *   { kind: 'ambiguous', message, missing: string[] }
 */
export function interpretLlmResponse(llm, { text, existingRules = [], cartItems = [] }) {
  const fallbackHelp = 'Try something like "15% off all Flipkart items" or "Rs.200 off orders above Rs.3,000".'

  if (!llm || typeof llm !== 'object') {
    return { kind: 'ambiguous', message: `We couldn't understand that rule. ${fallbackHelp}`, missing: [] }
  }

  if (llm.status !== 'ok' || !llm.rule) {
    return {
      kind: 'ambiguous',
      message: (typeof llm.clarification === 'string' && llm.clarification.trim()) || `That rule is too vague to apply. ${fallbackHelp}`,
      missing: Array.isArray(llm.missing) ? llm.missing.map(String) : [],
    }
  }

  const { value: rule, errors } = validateRule(llm.rule)
  if (errors.length > 0) {
    return {
      kind: 'ambiguous',
      message: `We couldn't turn that into a valid rule: ${errors.join('; ')}. Please rephrase with the exact discount and who it applies to.`,
      missing: [],
    }
  }

  // Guard against invented numbers: the value (and threshold) must be in the text.
  const nums = numbersInText(text)
  const invented = []
  if (!nums.includes(rule.value)) invented.push(`the discount (${ruleValueLabel(rule)})`)
  if (rule.scope === 'cart' && !nums.includes(rule.minCartValue)) invented.push(`the minimum cart value (${rupees(rule.minCartValue)})`)
  if (invented.length > 0) {
    return {
      kind: 'ambiguous',
      message: `Your text doesn't state ${invented.join(' or ')} — we won't guess prices. Please include the exact numbers, e.g. "10% off orders above Rs.5,000".`,
      missing: invented,
    }
  }

  const warnings = []
  let suggestion = null

  // Match brand/platform against the current cart; adopt the cart's spelling.
  if (rule.scope !== 'cart' && cartItems.length > 0) {
    const field = rule.scope === 'brand' ? 'brand' : 'platform'
    const names = [...new Set(cartItems.map((i) => i[field]))]
    const exact = names.find((n) => norm(n) === norm(rule.appliesTo))
    if (exact) {
      rule.appliesTo = exact
    } else {
      const close = names
        .map((n) => ({ n, d: levenshtein(norm(n), norm(rule.appliesTo)) }))
        .filter(({ d }) => d <= 2)
        .sort((a, b) => a.d - b.d)[0]
      if (close) suggestion = { appliesTo: close.n }
      warnings.push(
        close
          ? `No item in the current cart is from ${field} "${rule.appliesTo}". Did you mean "${close.n}"?`
          : `No item in the current cart is from ${field} "${rule.appliesTo}", so this rule won't change today's total.`
      )
    }
  }

  if (existingRules.some((r) => sameRule(r, rule))) {
    warnings.push('An identical rule is already active.')
  }
  if (rule.type === 'percentage' && rule.value >= 50) {
    warnings.push(`${rule.value}% is an unusually large discount — double-check before confirming.`)
  }

  return {
    kind: 'ok',
    rule,
    warnings,
    suggestion,
    restatement: typeof llm.clarification === 'string' ? llm.clarification : '',
  }
}
