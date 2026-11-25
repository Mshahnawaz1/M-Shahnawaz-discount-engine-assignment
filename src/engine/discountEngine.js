/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no I/O, and no knowledge of where
 * rules or cart items came from (CSV, PDF, natural language...). Input adapters
 * in src/inputs/ adapt to these shapes, never the other way round.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string                 — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string | null          — brand/platform name; null for cart rules
 *   type:         "percentage" | "flat"
 *   value:        number                 — percentage as number (15 = 15%), flat in rupees
 *   stackable:    boolean
 *   minCartValue: number | null          — cart rules only: threshold (inclusive)
 * }
 *
 * CartItem { itemId, product, brand, platform, basePrice }
 *
 * DiscountResult {
 *   itemId, product, brand, platform, basePrice,
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]   — matching non-stackable rules that lost on saving
 *   status:        "max-discount" | "stacked" | "applied" | "none"
 *   reasoning:     string     — customer-readable explanation
 * }
 *
 * CartResult {
 *   items:         DiscountResult[]
 *   subtotal:      number     — sum of item final prices (before cart offer)
 *   cartOffer:     null | { appliedRules, lines: [{ ruleId, label, discount }], discount, label }
 *   total:         number     — final amount payable
 *   nextCartOffer: null | { ruleId, label, threshold, shortBy }
 * }
 *
 * Rounding policy (kept from the base implementation; the brief's expected
 * results depend on it): every discount step is rounded to the nearest rupee.
 */

import { ruleLabel, ruleValueLabel, rupees } from './format.js'

const normalise = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Returns true if an item-level rule applies to this cart item.
 * Cart-scope rules never match individual items.
 */
export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'brand') return normalise(item.brand) === normalise(rule.appliesTo)
  if (rule.scope === 'platform') return normalise(item.platform) === normalise(rule.appliesTo)
  return false
}

/**
 * Rupee discount a rule gives on a given price. Uses the price passed in
 * (not the original base price) so stacking compounds correctly.
 * Never returns more than the price itself — a Rs.150 flat offer on a Rs.99
 * item makes it free, not negative.
 */
export function calculateDiscountAmount(price, rule) {
  let amount = 0
  if (rule.type === 'percentage') amount = Math.round((price * rule.value) / 100)
  if (rule.type === 'flat') amount = Math.round(rule.value)
  return Math.max(0, Math.min(amount, price))
}

/**
 * Generic selection policy shared by items and the cart:
 *   1. among non-stackable rules, the largest rupee saving on `price` wins;
 *   2. every stackable rule then applies on top, in order.
 */
function selectAndApply(price, rules) {
  const nonStackable = rules.filter((r) => !r.stackable)
  const stackable = rules.filter((r) => r.stackable)

  // Stable sort: on equal savings the earlier rule wins (deterministic).
  const ranked = nonStackable
    .map((rule) => ({ rule, saving: calculateDiscountAmount(price, rule) }))
    .sort((a, b) => b.saving - a.saving)

  const winner = ranked[0] ?? null
  const losers = ranked.slice(1)

  let running = price
  const lines = []
  for (const rule of [winner?.rule, ...stackable].filter(Boolean)) {
    const discount = calculateDiscountAmount(running, rule)
    running -= discount
    lines.push({ rule, discount })
  }

  return { finalPrice: running, lines, winner, losers }
}

/**
 * Applies the active rules to a single cart item. Returns a DiscountResult.
 */
export function applyDiscounts(item, rules) {
  const base = {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
  }

  const matching = rules.filter((r) => ruleMatchesItem(item, r))
  if (matching.length === 0) {
    return {
      ...base,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      status: 'none',
      reasoning: 'No offers available on this item',
    }
  }

  const { finalPrice, lines, winner, losers } = selectAndApply(item.basePrice, matching)
  const stacked = lines.length > 1

  let reasoning = lines.map((l) => ruleLabel(l.rule)).join(' + ')
  const notes = []
  if (losers.length > 0) {
    const beaten = losers.map((l) => `${ruleLabel(l.rule)} (saves ${rupees(l.saving)})`).join(', ')
    notes.push(`best deal: saves ${rupees(winner.saving)}, better than ${beaten}`)
  }
  if (stacked) notes.push('offers combined')
  if (notes.length > 0) reasoning += ` — ${notes.join('; ')}`

  let status = 'applied'
  if (stacked) status = 'stacked'
  else if (losers.length > 0) status = 'max-discount'

  return {
    ...base,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules: lines.map((l) => l.rule.ruleId),
    skippedRules: losers.map((l) => l.rule.ruleId),
    status,
    reasoning,
  }
}

/** Runs applyDiscounts across every item. */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/** Sums final prices across item results. */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

/**
 * Applies cart-level rules to the item subtotal (the sum of final item prices).
 * A cart rule qualifies when subtotal >= minCartValue (inclusive).
 * Same selection policy as items: best non-stackable + stackables on top.
 */
export function applyCartOffer(subtotal, rules) {
  const cartRules = rules.filter((r) => r.scope === 'cart')
  const eligible = cartRules.filter((r) => subtotal >= r.minCartValue)

  let cartOffer = null
  let total = subtotal

  if (eligible.length > 0) {
    const { finalPrice, lines } = selectAndApply(subtotal, eligible)
    const discount = subtotal - finalPrice
    if (discount > 0) {
      total = finalPrice
      cartOffer = {
        appliedRules: lines.map((l) => l.rule.ruleId),
        lines: lines.map((l) => ({
          ruleId: l.rule.ruleId,
          label: `Cart offer: ${ruleValueLabel(l.rule)} — ${rupees(l.discount)} saved`,
          discount: l.discount,
        })),
        discount,
        label: lines.map((l) => `Cart offer: ${ruleValueLabel(l.rule)}`).join(' + '),
      }
    }
  }

  // Nudge: the closest not-yet-reached cart offer that would beat what the customer gets now.
  const currentDiscount = cartOffer?.discount ?? 0
  const upcoming = cartRules
    .filter((r) => subtotal < r.minCartValue)
    .filter((r) => calculateDiscountAmount(r.minCartValue, r) > currentDiscount)
    .sort((a, b) => a.minCartValue - b.minCartValue)[0]

  const nextCartOffer = upcoming
    ? {
        ruleId: upcoming.ruleId,
        label: ruleValueLabel(upcoming),
        threshold: upcoming.minCartValue,
        shortBy: upcoming.minCartValue - subtotal,
      }
    : null

  return { cartOffer, total, nextCartOffer }
}

/**
 * Full checkout calculation: item-level offers, then the cart-level offer.
 * Returns a CartResult.
 */
export function calculateCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  const subtotal = cartTotal(items)
  const { cartOffer, total, nextCartOffer } = applyCartOffer(subtotal, rules)
  return { items, subtotal, cartOffer, total, nextCartOffer }
}
