// Generates sample-data/cart.pdf and sample-data/cart-malformed.pdf
// in the layout described by the brief.   Run: npm run make:pdfs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'node:fs'

const COLS = [50, 190, 310, 430] // Product, Brand, Platform, Base Price

async function makePdf(file, rows, { footer } = {}) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Courier)
  const bold = await doc.embedFont(StandardFonts.CourierBold)
  const draw = (text, x, y, f = font) => page.drawText(text, { x, y, size: 10, font: f, color: rgb(0.07, 0.1, 0.28) })

  let y = 780
  draw('Order #OP-9921  |  Date: 15 Jan 2025', 50, y)
  y -= 30
  ;['Product', 'Brand', 'Platform', 'Base Price'].forEach((h, i) => draw(h, COLS[i], y, bold))
  y -= 14
  draw('-'.repeat(72), 50, y)
  for (const row of rows) {
    y -= 16
    row.forEach((cell, i) => cell && draw(cell, COLS[i], y))
  }
  if (footer) {
    y -= 28
    draw(footer, 50, y)
  }
  writeFileSync(file, await doc.save())
  console.log('wrote', file)
}

const CART = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
]

await makePdf('sample-data/cart.pdf', CART)

await makePdf(
  'sample-data/cart-malformed.pdf',
  [
    CART[0],
    ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.8 49'], // garbled price
    CART[2],
    ['Ceramic Vase', '', 'Noon', 'Rs.2,499'], // missing brand
    CART[4],
    ['Table Lamp', 'Nordic Basics', 'Amazon India', 'Rs.1,150'], // extra valid item
  ],
  { footer: 'Thank you for shopping with Opptra!' }
)
