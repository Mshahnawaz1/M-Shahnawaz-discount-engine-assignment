/**
 * pdfTableParser.js — pure: positioned text items → table rows.
 *
 * No pdf.js import here, so it is unit-testable with synthetic data.
 *
 * Input:  pages: Array<Array<{ str, x, y, width }>>   (PDF coords: y grows upward)
 * Output: { rows: [{ line, cells: { product, brand, platform, basePrice } }], errors, warnings }
 *
 * Strategy:
 *   1. Group text items into visual lines by y.
 *   2. Find the header line (Product / Brand / Platform / Base Price); its x
 *      positions define the column boundaries. Text above it (order number,
 *      date) is ignored.
 *   3. Assign every later item to a column by x. Items that merge several
 *      cells ("Cushion Cover   Natura Casa") are split on runs of 2+ spaces.
 *   4. Skip separators and repeated headers; lines that fill only one column
 *      (footers, notes) are ignored with a warning; everything else is a row.
 */

export const COLUMNS = ['product', 'brand', 'platform', 'basePrice']

const HEADER_PATTERNS = {
  product: /^(product|item|description)/i,
  brand: /^brand/i,
  platform: /^(platform|marketplace|channel)/i,
  basePrice: /^(base(\s*price)?|price|mrp|amount)/i,
}

const Y_TOLERANCE = 3
const X_TOLERANCE = 6

/** Splits items whose text contains multiple cells separated by 2+ spaces. */
function explode(item) {
  const str = item.str ?? ''
  if (!/\S\s{2,}\S/.test(str)) return [item]
  const charW = str.length > 0 ? (item.width || 0) / str.length : 0
  const parts = []
  for (const m of str.matchAll(/\S+(?: \S+)*/g)) {
    parts.push({ str: m[0], x: item.x + m.index * charW, y: item.y, width: m[0].length * charW })
  }
  return parts
}

function groupLines(items) {
  const sorted = items
    .filter((it) => (it.str ?? '').trim() !== '')
    .flatMap(explode)
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line.y - it.y) <= Y_TOLERANCE) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    line.text = line.items.map((i) => i.str.trim()).join(' ')
  }
  return lines
}

/** Returns { product: x, brand: x, platform: x, basePrice: x } or null. */
function detectHeader(line) {
  const starts = {}
  for (const col of COLUMNS) {
    const hit = line.items.find((it) => HEADER_PATTERNS[col].test(it.str.trim()))
    if (!hit) return null
    starts[col] = hit.x
  }
  // Columns must be left-to-right in the expected order.
  const xs = COLUMNS.map((c) => starts[c])
  return xs.every((x, i) => i === 0 || x > xs[i - 1]) ? starts : null
}

const isSeparator = (text) => /^[\s\-–—─━_=|.·*]+$/.test(text)

export function parsePdfTable(pages) {
  const errors = []
  const warnings = []
  const rows = []

  const lines = pages.flatMap((items, p) => groupLines(items).map((l) => ({ ...l, page: p + 1 })))
  if (lines.length === 0) {
    return { rows, errors: ['This PDF has no selectable text (it may be a scanned image). Please upload a text-based PDF or use cart.csv.'], warnings }
  }

  let header = null
  let lineNo = 0
  for (const line of lines) {
    const h = detectHeader(line)
    if (h) {
      header = h // also handles a header repeated on each page
      continue
    }
    if (!header) continue // preamble: order number, date, logo text...
    if (isSeparator(line.text)) continue

    lineNo += 1
    const cells = { product: [], brand: [], platform: [], basePrice: [] }
    for (const it of line.items) {
      // Rightmost column whose start is at or before this item (with tolerance).
      let col = COLUMNS[0]
      for (const c of COLUMNS) if (it.x + X_TOLERANCE >= header[c]) col = c
      cells[col].push(it.str.trim())
    }
    const joined = Object.fromEntries(COLUMNS.map((c) => [c, cells[c].join(' ').trim()]))
    const filled = COLUMNS.filter((c) => joined[c] !== '').length

    if (filled <= 1) {
      warnings.push(`Ignored non-table text on page ${line.page}: "${line.text.slice(0, 60)}"`)
      continue
    }
    rows.push({ line: lineNo, page: line.page, text: line.text, cells: joined })
  }

  if (!header) {
    errors.push('Could not find the table header. The PDF needs a table with columns: Product, Brand, Platform, Base Price.')
  } else if (rows.length === 0) {
    errors.push('Found the table header but no item rows under it.')
  }

  return { rows, errors, warnings }
}
