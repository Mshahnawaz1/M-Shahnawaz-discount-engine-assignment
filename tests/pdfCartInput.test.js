import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parsePdfTable } from '../src/inputs/pdfTableParser.js'
import { cartFromPdfItems, extractTextItems } from '../src/inputs/pdfCartInput.js'
import { calculateCart } from '../src/engine/discountEngine.js'
import { SAMPLE_CART, SAMPLE_RULES } from './fixtures.js'

// Build synthetic pdf.js-style items for a line of cells at given x positions.
const X = [50, 190, 310, 430]
const line = (y, cells, xs = X) =>
  cells.map((str, i) => (str ? { str, x: xs[i], y, width: str.length * 6 } : null)).filter(Boolean)
const HEADER = (y) => line(y, ['Product', 'Brand', 'Platform', 'Base Price'])

describe('parsePdfTable (synthetic)', () => {
  it('ignores the preamble and separator, reads rows', () => {
    const page = [
      { str: 'Order #OP-9921 | Date: 15 Jan 2025', x: 50, y: 780, width: 200 },
      ...HEADER(750),
      { str: '──────────────', x: 50, y: 736, width: 400 },
      ...line(720, ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299']),
    ]
    const { rows, errors } = parsePdfTable([page])
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].cells).toEqual({ product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 'Rs.1,299' })
  })

  it('splits one merged text run on 2+ spaces', () => {
    const merged = 'Cushion Cover  Natura Casa  Amazon India  Rs.1,299'
    // Header positions chosen to line up with the character offsets at 6pt/char.
    const xs = [50, 50 + 15 * 6, 50 + 28 * 6, 50 + 42 * 6]
    const page = [...line(750, ['Product', 'Brand', 'Platform', 'Base Price'], xs), { str: merged, x: 50, y: 720, width: merged.length * 6 }]
    const { rows } = parsePdfTable([page])
    expect(rows[0].cells).toEqual({ product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 'Rs.1,299' })
  })

  it('handles a header split into separate words and repeated on page 2', () => {
    const header = [
      ...line(750, ['Product', 'Brand', 'Platform']),
      { str: 'Base', x: 430, y: 750, width: 24 },
      { str: 'Price', x: 458, y: 750, width: 30 },
    ]
    const p1 = [...header, ...line(720, ['A', 'B', 'C', '100'])]
    const p2 = [...header, ...line(720, ['D', 'E', 'F', '200'])]
    const { rows, errors } = parsePdfTable([p1, p2])
    expect(errors).toEqual([])
    expect(rows.map((r) => r.cells.product)).toEqual(['A', 'D'])
  })

  it('no text at all → scanned-PDF error', () => {
    expect(parsePdfTable([[]]).errors[0]).toMatch(/no selectable text/)
  })

  it('no header → clear format error', () => {
    const { errors } = parsePdfTable([line(720, ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'])])
    expect(errors[0]).toMatch(/Product, Brand, Platform, Base Price/)
  })

  it('single-cell footer lines become warnings, not rows', () => {
    const page = [...HEADER(750), ...line(720, ['A', 'B', 'C', '100']), { str: 'Thank you!', x: 50, y: 690, width: 60 }]
    const { rows, warnings } = parsePdfTable([page])
    expect(rows).toHaveLength(1)
    expect(warnings[0]).toMatch(/Thank you!/)
  })
})

describe('cartFromPdfItems', () => {
  it('validates rows: bad price and missing brand are skipped and reported, ids stay sequential', () => {
    const page = [
      ...HEADER(750),
      ...line(720, ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299']),
      ...line(704, ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.abc']),
      ...line(688, ['Ceramic Vase', '', 'Noon', 'Rs.2,499']),
      ...line(672, ['Wall Shelf', 'LivSpace Pro', 'Amazon India', '599']),
    ]
    const { data, errors } = cartFromPdfItems([page])
    expect(data.map((d) => [d.itemId, d.product, d.basePrice])).toEqual([
      ['ITEM-01', 'Cushion Cover', 1299],
      ['ITEM-02', 'Wall Shelf', 599],
    ])
    expect(errors).toEqual([
      'Row 2 (Bed Sheet Set): price "Rs.abc" is not a valid positive amount — skipped',
      'Row 3 (Ceramic Vase): missing brand — skipped',
    ])
  })
})

describe('real PDFs through pdf.js (sample-data/)', () => {
  let pdfjs
  beforeAll(async () => {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    vi.spyOn(console, 'log').mockImplementation(() => {}) // pdf.js font warnings
  })
  const load = async (f) => {
    const data = new Uint8Array(readFileSync(new URL(`../sample-data/${f}`, import.meta.url)))
    return cartFromPdfItems(await extractTextItems(pdfjs, data))
  }

  it('cart.pdf → same cart as cart.csv → Rs.5,339', async () => {
    const { data, errors } = await load('cart.pdf')
    expect(errors).toEqual([])
    expect(data).toEqual(SAMPLE_CART)
    expect(calculateCart(data, SAMPLE_RULES).total).toBe(5339)
  })

  it('cart-malformed.pdf → 4 items loaded, 2 rows reported, footer ignored', async () => {
    const { data, errors, warnings } = await load('cart-malformed.pdf')
    expect(data.map((d) => d.product)).toEqual(['Cushion Cover', 'Wall Shelf', 'Cutting Board', 'Table Lamp'])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatch(/Bed Sheet Set.*"Rs.8 49"/)
    expect(errors[1]).toMatch(/Ceramic Vase.*missing brand/)
    expect(warnings[0]).toMatch(/Thank you/)
  })
})
