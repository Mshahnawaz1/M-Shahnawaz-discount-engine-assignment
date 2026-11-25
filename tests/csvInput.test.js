import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csvInput.js'
import { calculateCart } from '../src/engine/discountEngine.js'

const read = (f) => readFileSync(new URL(`../sample-data/${f}`, import.meta.url), 'utf8')

describe('CSV adapter', () => {
  it('parses the sample files end-to-end to Rs.5,339', () => {
    const rules = parseRulesCSV(read('rules.csv'))
    const cart = parseCartCSV(read('cart.csv'))
    expect(rules.errors).toEqual([])
    expect(cart.errors).toEqual([])
    expect(rules.data).toHaveLength(4)
    expect(rules.data[3]).toMatchObject({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, minCartValue: 4000 })
    expect(calculateCart(cart.data, rules.data).total).toBe(5339)
  })

  it('still accepts the original 6-column rules.csv (no min_cart_value)', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\nRULE-01,platform,Amazon India,percentage,15,false'
    expect(parseRulesCSV(csv).data).toHaveLength(1)
  })

  it('reports bad rows and keeps good ones', () => {
    const csv = [
      'rule_id,scope,applies_to,type,value,stackable,min_cart_value',
      'RULE-01,platform,Amazon India,percentage,15,false,',
      'RULE-02,cart,,percentage,10,false,',
      'RULE-01,brand,X,flat,10,false,',
    ].join('\n')
    const { data, errors } = parseRulesCSV(csv)
    expect(data).toHaveLength(1)
    expect(errors[0]).toMatch(/Row 3 \(RULE-02\): cart rules need a minimum cart value/)
    expect(errors[1]).toMatch(/duplicate rule_id/)
  })
})
