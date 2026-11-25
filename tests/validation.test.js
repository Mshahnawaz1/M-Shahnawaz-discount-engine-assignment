import { describe, it, expect } from 'vitest'
import { validateRule, validateCartItem, parseAmount, nextRuleId } from '../src/engine/validation.js'

describe('parseAmount', () => {
  it.each([
    [1299, 1299], ['1299', 1299], ['Rs.1,299', 1299], ['Rs 1,299', 1299], ['₹2,499', 2499],
    ['INR 449', 449], ['15%', 15], ['abc', NaN], ['', NaN], ['12abc', NaN], [null, NaN],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toEqual(expected)
  })
})

describe('validateRule', () => {
  it('accepts a brand rule', () => {
    const { value, errors } = validateRule({ scope: 'Brand', appliesTo: 'Natura Casa', type: 'percentage', value: '20', stackable: 'yes' })
    expect(errors).toEqual([])
    expect(value).toMatchObject({ scope: 'brand', appliesTo: 'Natura Casa', value: 20, stackable: true, minCartValue: null })
  })
  it('accepts a cart rule without appliesTo', () => {
    const { value } = validateRule({ scope: 'cart', type: 'percentage', value: 10, minCartValue: 'Rs.5,000' })
    expect(value).toMatchObject({ scope: 'cart', appliesTo: null, minCartValue: 5000, stackable: false })
  })
  it.each([
    [{ scope: 'cart', type: 'percentage', value: 10 }, /minimum cart value/],
    [{ scope: 'brand', type: 'flat', value: 100 }, /brand name/],
    [{ scope: 'brand', appliesTo: 'X', type: 'percentage', value: 150 }, /cannot exceed 100%/],
    [{ scope: 'brand', appliesTo: 'X', type: 'flat', value: -5 }, /positive/],
    [{ scope: 'brand', appliesTo: 'X', type: 'flat' }, /value is missing/],
    [{ scope: 'category', appliesTo: 'X', type: 'flat', value: 5 }, /scope must be/],
    [{ scope: 'brand', appliesTo: 'X', type: 'bogo', value: 5 }, /type must be/],
    [{ scope: 'brand', appliesTo: 'X', type: 'flat', value: 5, stackable: 'maybe' }, /stackable/],
  ])('rejects %j', (raw, msg) => {
    const { value, errors } = validateRule(raw)
    expect(value).toBeNull()
    expect(errors.join(' ')).toMatch(msg)
  })
})

describe('validateCartItem', () => {
  it('cleans a PDF-style price', () => {
    expect(validateCartItem({ itemId: 'I', product: 'P', brand: 'B', platform: 'Pl', basePrice: 'Rs.1,299' }).value.basePrice).toBe(1299)
  })
  it('reports missing fields and a bad price together', () => {
    const { errors } = validateCartItem({ itemId: 'I', product: 'P', brand: '', platform: 'Pl', basePrice: 'abc' })
    expect(errors.join(' ')).toMatch(/missing brand/)
    expect(errors.join(' ')).toMatch(/"abc" is not a valid/)
  })
})

it('nextRuleId continues numbering', () => {
  expect(nextRuleId([{ ruleId: 'RULE-01' }, { ruleId: 'RULE-04' }, { ruleId: 'custom' }])).toBe('RULE-05')
  expect(nextRuleId([])).toBe('RULE-01')
})
