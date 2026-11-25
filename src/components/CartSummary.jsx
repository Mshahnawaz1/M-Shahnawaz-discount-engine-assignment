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
  { key: 'itemId', label: 'Item', render: (v) => <span style={{ whiteSpace: 'nowrap', color: C.grey }}>{v}</span> },
  { key: 'product', label: 'Product', render: (v, row) => (
    <div>
      <div style={{ fontWeight: 600 }}>{v}</div>
      <div style={{ fontSize: 12, color: C.grey }}>{row.brand} · {row.platform}</div>
    </div>
  ) },
  { key: 'basePrice', label: 'Base', render: (v, row) => (
    <span style={{ whiteSpace: 'nowrap', color: C.grey, textDecoration: row.totalDiscount > 0 ? 'line-through' : 'none' }}>{rupees(v)}</span>
  ) },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: row.totalDiscount > 0 ? C.green : C.navy }}>{rupees(v)}</span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? <span style={{ color: C.green, fontWeight: 600, whiteSpace: 'nowrap' }}>{rupees(v)}</span> : <span style={{ color: C.grey }}>—</span>,
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v, row) => (
      <span style={{ color: row.status === 'none' ? C.grey : C.navy, fontStyle: row.status === 'none' ? 'italic' : 'normal', fontSize: 13 }}>
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

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '10px 4px', fontSize: 15 }

export default function CartSummary({ result }) {
  const { items, subtotal, cartOffer, total, nextCartOffer } = result
  const itemSavings = items.reduce((s, i) => s + i.totalDiscount, 0)
  const totalSavings = itemSavings + (cartOffer?.discount ?? 0)

  return (
    <div>
      <DataTable columns={COLUMNS} rows={items} emptyMessage="Your cart is empty." />

      <div className="card card-beige" style={{ marginTop: 20, marginLeft: 'auto', maxWidth: 520, padding: '18px 24px' }}>
        <div style={row}>
          <span>{cartOffer ? 'Cart total before offer' : 'Cart total'}</span>
          <span style={{ fontWeight: 600 }}>{rupees(subtotal)}</span>
        </div>

        {cartOffer &&
          cartOffer.lines.map((line) => (
            <div key={line.ruleId} style={{ ...row, background: C.orangeTint, borderRadius: 10, padding: '10px 12px', color: C.orangeDark }}>
              <span style={{ fontWeight: 600 }}>{line.label}</span>
              <span style={{ fontWeight: 700 }}>−{rupees(line.discount)}</span>
            </div>
          ))}

        <div style={{ ...row, borderTop: `1px solid #e9dfba`, marginTop: 8, paddingTop: 14, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13 }}>Final cart total</span>
          <span style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 40, lineHeight: 1 }}>{rupees(total)}</span>
        </div>

        {totalSavings > 0 && (
          <div style={{ textAlign: 'right', fontSize: 14, color: C.green, fontWeight: 600 }}>
            You save {rupees(totalSavings)} on this order
          </div>
        )}

        {nextCartOffer && (
          <div style={{ marginTop: 12, fontSize: 14, padding: '10px 14px', background: '#fff', border: `1px dashed ${C.orange}`, color: C.orangeDark, borderRadius: 10 }}>
            Add <b>{rupees(nextCartOffer.shortBy)}</b> more to get {nextCartOffer.label} your cart (on orders of{' '}
            {rupees(nextCartOffer.threshold)} or more).
          </div>
        )}
      </div>
    </div>
  )
}
