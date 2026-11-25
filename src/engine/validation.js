/**
 * validation.js
 *
 * Single source of truth for what a valid DiscountRule / CartItem looks like.
 * Every input adapter (CSV, natural language, PDF, anything added later) must
 * pass its output through these functions before handing data to the engine.
 *
 * Each validator takes a loosely-typed "raw" object (strings are fine) and
 * returns { value, errors }: `value` is a clean, engine-ready object when
 * errors is empty, otherwise null.
 */

export const RULE_SCOPES = ['brand', 'platform', 'cart']
export const RULE_TYPES = ['percentage', 'flat']

/**
 * Parses money / numeric strings: 1299, "1,299", "Rs.1,299", "₹ 1299", "INR 1299", "15%".
 * Returns NaN when the input is not a clean number.
 */
export function parseAmount(raw) {
  if (typeof raw === 'number') return raw
  if (raw === null || raw === undefined) return NaN
  const cleaned = String(raw)
    .trim()
    .replace(/^(rs\.?|inr|₹)\s*/i, '')
    .replace(/%$/, '')
    .replace(/,/g, '')
    .trim()
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN
  return Number(cleaned)
}

/** Parses "true"/"yes"/"1"/true → true; "false"/"no"/"0"/false → false; otherwise undefined. */
export function parseBool(raw) {
  if (typeof raw === 'boolean') return raw
  const s = String(raw ?? '').trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return true
  if (['false', 'no', 'n', '0'].includes(s)) return false
  return undefined
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === ''

/**
 * Validates a discount rule.
 * raw: { ruleId?, scope, appliesTo, type, value, stackable, minCartValue }
 * ruleId is optional here so callers (e.g. the NL composer) can assign one later.
 */
export function validateRule(raw) {
  const errors = []
  const scope = String(raw.scope ?? '').trim().toLowerCase()
  const type = String(raw.type ?? '').trim().toLowerCase()

  if (!RULE_SCOPES.includes(scope)) {
    errors.push(`scope must be one of ${RULE_SCOPES.join(', ')} (got "${raw.scope ?? ''}")`)
  }
  if (!RULE_TYPES.includes(type)) {
    errors.push(`type must be "percentage" or "flat" (got "${raw.type ?? ''}")`)
  }

  const value = parseAmount(raw.value)
  if (isBlank(raw.value)) {
    errors.push('discount value is missing')
  } else if (!Number.isFinite(value) || value <= 0) {
    errors.push(`discount value must be a positive number (got "${raw.value}")`)
  } else if (type === 'percentage' && value > 100) {
    errors.push(`percentage discount cannot exceed 100% (got ${value}%)`)
  }

  let stackable = false
  if (!isBlank(raw.stackable)) {
    stackable = parseBool(raw.stackable)
    if (stackable === undefined) {
      errors.push(`stackable must be true or false (got "${raw.stackable}")`)
    }
  }

  let appliesTo = null
  let minCartValue = null

  if (scope === 'cart') {
    minCartValue = parseAmount(raw.minCartValue)
    if (isBlank(raw.minCartValue)) {
      errors.push('cart rules need a minimum cart value')
    } else if (!Number.isFinite(minCartValue) || minCartValue <= 0) {
      errors.push(`minimum cart value must be a positive number (got "${raw.minCartValue}")`)
    }
  } else if (scope) {
    if (isBlank(raw.appliesTo)) {
      errors.push(`${scope} rules need a ${scope} name to apply to`)
    } else {
      appliesTo = String(raw.appliesTo).trim()
    }
  }

  if (errors.length > 0) return { value: null, errors }

  return {
    value: {
      ruleId: isBlank(raw.ruleId) ? null : String(raw.ruleId).trim(),
      scope,
      appliesTo,
      type,
      value,
      stackable,
      minCartValue,
    },
    errors: [],
  }
}

/**
 * Validates a cart item.
 * raw: { itemId, product, brand, platform, basePrice }
 */
export function validateCartItem(raw) {
  const errors = []
  const missing = ['itemId', 'product', 'brand', 'platform'].filter((k) => isBlank(raw[k]))
  if (isBlank(raw.basePrice)) missing.push('basePrice')
  if (missing.length > 0) errors.push(`missing ${missing.join(', ')}`)

  const basePrice = parseAmount(raw.basePrice)
  if (!isBlank(raw.basePrice) && (!Number.isFinite(basePrice) || basePrice <= 0)) {
    errors.push(`price "${raw.basePrice}" is not a valid positive amount`)
  }

  if (errors.length > 0) return { value: null, errors }

  return {
    value: {
      itemId: String(raw.itemId).trim(),
      product: String(raw.product).trim(),
      brand: String(raw.brand).trim(),
      platform: String(raw.platform).trim(),
      basePrice: Math.round(basePrice),
    },
    errors: [],
  }
}

/** Next free RULE-NN id given existing rules. */
export function nextRuleId(rules) {
  const max = rules.reduce((m, r) => {
    const n = Number(/^RULE-(\d+)$/i.exec(r.ruleId ?? '')?.[1])
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}

/** ITEM-01, ITEM-02, ... for adapters whose source has no item ids (e.g. PDF). */
export function itemIdFor(index) {
  return `ITEM-${String(index + 1).padStart(2, '0')}`
}
