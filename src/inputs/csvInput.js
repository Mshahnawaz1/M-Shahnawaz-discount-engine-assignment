/**
 * csvInput.js — input adapter: CSV text → DiscountRule[] / CartItem[]
 *
 * Like every adapter in src/inputs/, it returns { data, errors, warnings } and
 * relies on engine/validation.js for the actual validity rules.
 *
 * rules.csv columns: rule_id, scope, applies_to, type, value, stackable, min_cart_value (optional)
 * cart.csv columns:  item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'
import { validateRule, validateCartItem } from '../engine/validation.js'

function parseCsv(csvText) {
  return Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })
}

export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseCsv(csvText)
  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message), warnings: [] }
  }

  const data = []
  const errors = []
  const seen = new Set()

  rows.forEach((row, i) => {
    const rowNum = i + 2 // header is row 1
    if (!row.rule_id?.trim()) {
      errors.push(`Row ${rowNum}: missing rule_id`)
      return
    }
    if (row.stackable === undefined || row.stackable.trim() === '') {
      errors.push(`Row ${rowNum}: missing stackable`)
      return
    }
    const { value, errors: rowErrors } = validateRule({
      ruleId: row.rule_id,
      scope: row.scope,
      appliesTo: row.applies_to,
      type: row.type,
      value: row.value,
      stackable: row.stackable,
      minCartValue: row.min_cart_value,
    })
    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNum} (${row.rule_id}): ${rowErrors.join('; ')}`)
      return
    }
    if (seen.has(value.ruleId)) {
      errors.push(`Row ${rowNum}: duplicate rule_id ${value.ruleId} — skipped`)
      return
    }
    seen.add(value.ruleId)
    data.push({ ...value, source: 'csv' })
  })

  return { data, errors, warnings: [] }
}

export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseCsv(csvText)
  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message), warnings: [] }
  }

  const data = []
  const errors = []
  const seen = new Set()

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const { value, errors: rowErrors } = validateCartItem({
      itemId: row.item_id,
      product: row.product,
      brand: row.brand,
      platform: row.platform,
      basePrice: row.base_price,
    })
    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNum}: ${rowErrors.join('; ')}`)
      return
    }
    if (seen.has(value.itemId)) {
      errors.push(`Row ${rowNum}: duplicate item_id ${value.itemId} — skipped`)
      return
    }
    seen.add(value.itemId)
    data.push(value)
  })

  return { data, errors, warnings: [] }
}
