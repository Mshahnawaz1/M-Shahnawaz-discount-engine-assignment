import { describe, it, expect } from 'vitest'
import { processCart, cartTotal, calculateCart, applyDiscounts, applyCartOffer } from '../src/engine/discountEngine.js'
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

describe('statuses and customer reasoning', () => {
  const byId = Object.fromEntries(
    calculateCart(SAMPLE_CART, SAMPLE_RULES).items.map((r) => [r.itemId, r])
  )

  it('ITEM-01 explains why the platform offer won', () => {
    expect(byId['ITEM-01'].status).toBe('max-discount')
    expect(byId['ITEM-01'].reasoning).toMatch(/Platform offer: 15% off/)
    expect(byId['ITEM-01'].reasoning).toMatch(/saves Rs\.195.*Brand offer: Rs\.150 off/)
    expect(byId['ITEM-01'].skippedRules).toEqual(['RULE-02'])
  })
  it('ITEM-02 is stacked', () => {
    expect(byId['ITEM-02'].status).toBe('stacked')
    expect(byId['ITEM-02'].reasoning).toMatch(/Brand offer: Rs\.150 off \+ Platform offer: 10% off/)
  })
  it('ITEM-04 gets a meaningful no-offer message', () => {
    expect(byId['ITEM-04'].status).toBe('none')
    expect(byId['ITEM-04'].reasoning).toBe('No offers available on this item')
  })
  it('ITEM-03 / ITEM-06 are plain applied', () => {
    expect(byId['ITEM-03'].status).toBe('applied')
    expect(byId['ITEM-06'].status).toBe('applied')
  })
})

describe('cart-level offer (Task 1)', () => {
  it('matches the brief: 5932 → −593 → 5339', () => {
    const res = calculateCart(SAMPLE_CART, SAMPLE_RULES)
    expect(res.subtotal).toBe(5932)
    expect(res.cartOffer.discount).toBe(593)
    expect(res.cartOffer.lines[0].label).toBe('Cart offer: 10% off — Rs.593 saved')
    expect(res.total).toBe(5339)
    expect(res.nextCartOffer).toBeNull()
  })

  it('cart rules never touch individual items', () => {
    const res = calculateCart(SAMPLE_CART, SAMPLE_RULES)
    expect(res.items.flatMap((i) => i.appliedRules)).not.toContain('RULE-04')
  })

  const cartRule = { ruleId: 'C', scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }

  it('just below the threshold: no offer row, a nudge instead', () => {
    const res = applyCartOffer(3999, [cartRule])
    expect(res.cartOffer).toBeNull()
    expect(res.total).toBe(3999)
    expect(res.nextCartOffer).toMatchObject({ ruleId: 'C', shortBy: 1 })
  })

  it('exactly at the threshold applies (inclusive)', () => {
    const res = applyCartOffer(4000, [cartRule])
    expect(res.cartOffer.discount).toBe(400)
    expect(res.total).toBe(3600)
  })

  it('picks the best of multiple qualifying non-stackable cart rules', () => {
    const flat = { ...cartRule, ruleId: 'F', type: 'flat', value: 500 }
    expect(applyCartOffer(4000, [cartRule, flat]).cartOffer.appliedRules).toEqual(['F'])
    expect(applyCartOffer(6000, [cartRule, flat]).cartOffer.appliedRules).toEqual(['C'])
  })

  it('nudges towards a bigger cart offer when one is already applied', () => {
    const big = { ...cartRule, ruleId: 'BIG', value: 20, minCartValue: 6000 }
    const res = applyCartOffer(5000, [cartRule, big])
    expect(res.cartOffer.appliedRules).toEqual(['C'])
    expect(res.nextCartOffer).toMatchObject({ ruleId: 'BIG', shortBy: 1000 })
  })

  it('removing the cart rule removes the row', () => {
    const res = calculateCart(SAMPLE_CART, SAMPLE_RULES.slice(0, 3))
    expect(res.cartOffer).toBeNull()
    expect(res.total).toBe(5932)
  })
})

describe('edge cases', () => {
  const item = { itemId: 'X', product: 'Coaster', brand: 'Natura Casa', platform: 'Noon', basePrice: 99 }

  it('flat discount larger than the price clamps to free, never negative', () => {
    const r = applyDiscounts(item, SAMPLE_RULES)
    expect(r.finalPrice).toBe(0)
    expect(r.totalDiscount).toBe(99)
  })

  it('stackable-only rules still apply on their own', () => {
    const r = applyDiscounts({ ...item, platform: 'Flipkart', brand: 'Other', basePrice: 1000 }, SAMPLE_RULES)
    expect(r.finalPrice).toBe(900)
    expect(r.appliedRules).toEqual(['RULE-03'])
  })

  it('matching is case/whitespace insensitive', () => {
    const r = applyDiscounts({ ...item, brand: ' natura casa ', basePrice: 1000 }, SAMPLE_RULES)
    expect(r.appliedRules).toEqual(['RULE-02'])
  })
})
