/**
 * format.js
 *
 * Customer-facing wording shared by the engine's reasoning strings and the UI,
 * so a rule is described the same way everywhere.
 */

/** 5932 → "Rs.5,932" */
export function rupees(n) {
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`
}

const SCOPE_LABEL = { brand: 'Brand', platform: 'Platform', cart: 'Cart' }

/** "15% off" / "Rs.150 off" */
export function ruleValueLabel(rule) {
  return rule.type === 'percentage' ? `${rule.value}% off` : `${rupees(rule.value)} off`
}

/** "Platform offer: 15% off" */
export function ruleLabel(rule) {
  return `${SCOPE_LABEL[rule.scope] ?? 'Special'} offer: ${ruleValueLabel(rule)}`
}

/** One-line summary used in rule tables and the confirmation card. */
export function ruleSummary(rule) {
  const parts = [SCOPE_LABEL[rule.scope] ?? rule.scope]
  if (rule.scope !== 'cart') parts.push(rule.appliesTo)
  parts.push(ruleValueLabel(rule))
  if (rule.scope === 'cart') parts.push(`on carts of ${rupees(rule.minCartValue)} or more`)
  if (rule.stackable) parts.push('stackable')
  return parts.join(' · ')
}
