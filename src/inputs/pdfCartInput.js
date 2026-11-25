/**
 * pdfCartInput.js — input adapter: PDF file → CartItem[]
 *
 * pdf.js extracts positioned text; pdfTableParser turns it into rows; every
 * row goes through the same validateCartItem() as cart.csv. Bad rows are
 * skipped and reported; good rows still load.
 */

import { parsePdfTable } from './pdfTableParser.js'
import { validateCartItem, itemIdFor } from '../engine/validation.js'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_PAGES = 20

/** Extracts positioned text items per page. `pdfjs` is injected so tests can use the Node build. */
export async function extractTextItems(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const pages = []
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .filter((it) => typeof it.str === 'string')
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }))
    )
  }
  return pages
}

/** Pure: text items → { data: CartItem[], errors, warnings }. */
export function cartFromPdfItems(pages) {
  const { rows, errors: tableErrors, warnings } = parsePdfTable(pages)
  const data = []
  const errors = [...tableErrors]

  for (const row of rows) {
    const { value, errors: rowErrors } = validateCartItem({ itemId: itemIdFor(data.length), ...row.cells })
    if (rowErrors.length > 0) {
      const name = row.cells.product || `"${row.text.slice(0, 40)}"`
      errors.push(`Row ${row.line} (${name}): ${rowErrors.join('; ')} — skipped`)
    } else {
      data.push(value)
    }
  }
  return { data, errors, warnings }
}

/** Browser entry point. pdf.js is loaded lazily so it doesn't weigh down first paint. */
export async function loadCartFromPdf(file) {
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { data: [], errors: [`"${file.name}" is not a PDF.`], warnings: [] }
  }
  if (file.size > MAX_PDF_BYTES) {
    return { data: [], errors: ['PDF is larger than 5 MB — please upload a smaller cart file.'], warnings: [] }
  }

  try {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const pages = await extractTextItems(pdfjs, new Uint8Array(await file.arrayBuffer()))
    return cartFromPdfItems(pages)
  } catch (err) {
    const msg =
      err?.name === 'PasswordException'
        ? 'This PDF is password-protected.'
        : err?.name === 'InvalidPDFException'
          ? 'This file is not a valid PDF (it may be corrupted).'
          : `Could not read this PDF (${err?.message || 'unknown error'}).`
    return { data: [], errors: [msg], warnings: [] }
  }
}
