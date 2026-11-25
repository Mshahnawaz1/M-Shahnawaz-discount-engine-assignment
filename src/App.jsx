/**
 * App.jsx
 *
 * Holds session state (rules, cart) and wires input adapters → engine → display.
 * Results are *derived* from (cart, rules), so any change — a new CSV, a rule
 * added in plain English, a PDF cart — re-runs the engine automatically.
 *
 * App never contains discount logic, and the engine never knows about inputs.
 */

import { useMemo, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import CartSummary from './components/CartSummary.jsx'
import { parseRulesCSV, parseCartCSV } from './inputs/csvInput.js'
import { calculateCart } from './engine/discountEngine.js'
import { rupees, ruleValueLabel } from './engine/format.js'
import { S, C } from './styles.js'

const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '—')

function rulesColumns(onRemove) {
  return [
    {
      key: 'ruleId',
      label: 'Rule ID',
      render: (v, row) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <b>{v}</b> {row.source === 'nl' && <span style={S.tag(C.blue, C.blueBg)}>AI</span>}
        </span>
      ),
    },
    { key: 'scope', label: 'Scope', render: cap },
    { key: 'appliesTo', label: 'Applies To', render: (v, row) => (row.scope === 'cart' ? 'Entire cart' : v) },
    { key: 'value', label: 'Value', render: (_, row) => ruleValueLabel(row) },
    { key: 'minCartValue', label: 'Condition', render: (v) => (v ? `Cart ≥ ${rupees(v)}` : '—') },
    { key: 'stackable', label: 'Stack', render: (v) => (v ? 'Yes' : 'No') },
    {
      key: '_remove',
      label: '',
      render: (_, row) => (
        <button
          title={`Remove ${row.ruleId}`}
          aria-label={`Remove ${row.ruleId}`}
          onClick={() => onRemove(row.ruleId)}
          style={{ border: 'none', background: 'none', color: C.grey, cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      ),
    },
  ]
}

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rupees(v) },
]

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesSource, setRulesSource] = useState({ fileName: '', errors: [] })

  const [cartItems, setCartItems] = useState([])
  const [cartSource, setCartSource] = useState({ fileName: '', errors: [] })

  const [hasCalculated, setHasCalculated] = useState(false)

  const result = useMemo(
    () => (hasCalculated ? calculateCart(cartItems, rules) : null),
    [hasCalculated, cartItems, rules]
  )

  // ── Input handlers: each adapter returns { data, errors } ──

  function handleRulesCsv(text, fileName) {
    const { data, errors } = parseRulesCSV(text)
    setRules(data)
    setRulesSource({ fileName, errors })
  }

  function handleCartCsv(text, fileName) {
    const { data, errors } = parseCartCSV(text)
    setCartItems(data)
    setCartSource({ fileName, errors })
  }

  function removeRule(ruleId) {
    setRules((rs) => rs.filter((r) => r.ruleId !== ruleId))
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logoTxt}>
          O<span style={S.logoSpan}>pp</span>tra
        </div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>
        <div className="grid2">
          {/* ── Rules ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesCsv}
              hasData={rules.length > 0}
              fileName={rulesSource.fileName}
            />
            <ErrorBanner errors={rulesSource.errors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.hint}>
                  {rules.length} active rule{rules.length > 1 ? 's' : ''}
                </div>
                <DataTable columns={rulesColumns(removeRule)} rows={rules} />
              </div>
            )}
          </div>

          {/* ── Cart ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartCsv}
              hasData={cartItems.length > 0}
              fileName={cartSource.fileName}
            />
            <ErrorBanner errors={cartSource.errors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.hint}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} in cart
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {!hasCalculated && (
          <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
            <button
              style={S.btn}
              onClick={() => setHasCalculated(true)}
              disabled={!canCalculate}
            >
              Calculate Discounts
            </button>
            {!canCalculate && <div style={S.hint}>Load rules and a cart to calculate</div>}
          </div>
        )}

        {result && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <div style={{ ...S.hint, marginTop: -4, marginBottom: 8 }}>
              Updates automatically when rules or cart change.
            </div>
            <CartSummary result={result} />
          </div>
        )}
      </div>
    </div>
  )
}
