import { describe, it, expect } from 'vitest'
import { processCart, cartTotal } from '../src/engine/discountEngine.js'
import { SAMPLE_RULES, SAMPLE_CART } from './fixtures.js'

describe('base item-level engine (expected results from the brief)', () => {
  const results = processCart(SAMPLE_CART, SAMPLE_RULES)
  const byId = Object.fromEntries(results.map((r) => [r.itemId, r]))

  it.each([
    ['ITEM-01', 1104, ['RULE-01']],
    ['ITEM-02', 629, ['RULE-02', 'RULE-03']],
    ['ITEM-03', 509, ['RULE-01']],
    ['ITEM-04', 2499, []],
    ['ITEM-05', 382, ['RULE-01']],
    ['ITEM-06', 809, ['RULE-03']],
  ])('%s → Rs.%i', (id, finalPrice, applied) => {
    expect(byId[id].finalPrice).toBe(finalPrice)
    expect(byId[id].appliedRules).toEqual(applied)
  })

  it('sums item totals to Rs.5,932', () => {
    expect(cartTotal(results)).toBe(5932)
  })
})
