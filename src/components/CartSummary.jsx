/**
 * CartSummary.jsx
 *
 * Customer-facing checkout view of a CartResult: per-item final prices,
 * subtotal, the cart offer row (only when triggered), and the final total.
 */

import DataTable from './DataTable.jsx'
import { rupees } from '../engine/format.js'
import { S, C, STATUS_TAG } from '../styles.js'

const COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rupees(v) },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? C.green : C.navy }}>{rupees(v)}</span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? <span style={{ color: C.green, fontWeight: 600 }}>{rupees(v)}</span> : <span style={{ color: C.grey }}>—</span>,
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v, row) => (
      <span style={{ color: row.status === 'none' ? C.grey : C.navy, fontStyle: row.status === 'none' ? 'italic' : 'normal' }}>
        {v}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => {
      const t = STATUS_TAG[v] ?? STATUS_TAG.none
      return <span style={S.tag(t.color, t.bg)}>{t.label}</span>
    },
  },
]

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '0.45rem 0.2rem', fontSize: 13 }

export default function CartSummary({ result }) {
  const { items, subtotal, cartOffer, total, nextCartOffer } = result
  const itemSavings = items.reduce((s, i) => s + i.totalDiscount, 0)
  const totalSavings = itemSavings + (cartOffer?.discount ?? 0)

  return (
    <div>
      <DataTable columns={COLUMNS} rows={items} emptyMessage="Your cart is empty." />

      <div style={{ marginTop: '0.9rem', marginLeft: 'auto', maxWidth: 460 }}>
        <div style={row}>
          <span>{cartOffer ? 'Cart total before offer' : 'Cart total'}</span>
          <span style={{ fontWeight: 600 }}>{rupees(subtotal)}</span>
        </div>

        {cartOffer &&
          cartOffer.lines.map((line) => (
            <div key={line.ruleId} style={{ ...row, background: C.amberBg, borderRadius: 4, color: C.amber }}>
              <span style={{ fontWeight: 600 }}>{line.label}</span>
              <span style={{ fontWeight: 700 }}>−{rupees(line.discount)}</span>
            </div>
          ))}

        <div style={{ ...row, borderTop: `2px solid ${C.navy}`, marginTop: 4, paddingTop: '0.6rem' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Final cart total</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{rupees(total)}</span>
        </div>

        {totalSavings > 0 && (
          <div style={{ textAlign: 'right', fontSize: 12, color: C.green, fontWeight: 600 }}>
            You save {rupees(totalSavings)} on this order
          </div>
        )}

        {nextCartOffer && (
          <div style={{ marginTop: 8, fontSize: 12, padding: '0.45rem 0.6rem', background: C.blueBg, color: C.blue, borderRadius: 4 }}>
            Add {rupees(nextCartOffer.shortBy)} more to get {nextCartOffer.label} your cart (on orders of{' '}
            {rupees(nextCartOffer.threshold)} or more).
          </div>
        )}
      </div>
    </div>
  )
}
