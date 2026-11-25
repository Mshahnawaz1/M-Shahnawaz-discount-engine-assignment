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
import RuleComposer from './components/RuleComposer.jsx'
import { parseRulesCSV, parseCartCSV } from './inputs/csvInput.js'
import { loadCartFromPdf } from './inputs/pdfCartInput.js'
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
    { key: 'value', label: 'Value', render: (_, row) => <span style={{ whiteSpace: 'nowrap' }}>{ruleValueLabel(row)}</span> },
    { key: 'minCartValue', label: 'Condition', render: (v) => (v ? <span style={{ whiteSpace: 'nowrap' }}>Cart ≥ {rupees(v)}</span> : '—') },
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
  const [cartSource, setCartSource] = useState({ fileName: '', errors: [], warnings: [], notice: '' })
  const [pdfBusy, setPdfBusy] = useState(false)

  const [hasCalculated, setHasCalculated] = useState(false)

  const result = useMemo(
    () => (hasCalculated ? calculateCart(cartItems, rules) : null),
    [hasCalculated, cartItems, rules]
  )

  // ── Input handlers ──
  // Every adapter returns { data, errors, warnings }. A load that yields zero
  // valid rows never wipes what the user already has.

  function handleRulesCsv(text, fileName) {
    const { data, errors } = parseRulesCSV(text)
    if (data.length > 0) setRules(data)
    setRulesSource({ fileName: data.length > 0 ? fileName : rulesSource.fileName, errors: data.length > 0 ? errors : [...errors, 'No valid rules found — current rules kept.'] })
  }

  function applyCartInput({ data, errors, warnings = [] }, fileName) {
    if (data.length === 0) {
      setCartSource((prev) => ({
        ...prev,
        errors: [...errors, cartItems.length > 0 ? `${fileName}: no valid items — your current cart is unchanged.` : `${fileName}: no valid items found.`],
        warnings,
        notice: '',
      }))
      return
    }
    setCartItems(data)
    const skipped = errors.length > 0 ? ` (${errors.length} row${errors.length > 1 ? 's' : ''} skipped)` : ''
    setCartSource({ fileName, errors, warnings, notice: `Loaded ${data.length} item${data.length > 1 ? 's' : ''} from ${fileName}${skipped}` })
  }

  function handleCartCsv(text, fileName) {
    applyCartInput(parseCartCSV(text), fileName)
  }

  async function handleCartPdf(file, fileName) {
    setPdfBusy(true)
    try {
      applyCartInput(await loadCartFromPdf(file), fileName)
    } finally {
      setPdfBusy(false)
    }
  }

  function addRule(rule) {
    setRules((rs) => [...rs, rule])
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
            <RuleComposer
              rules={rules}
              cartItems={cartItems}
              currentTotal={cartItems.length > 0 ? calculateCart(cartItems, rules).total : null}
              previewTotal={(rule) => calculateCart(cartItems, [...rules, rule]).total}
              onAdd={addRule}
            />
          </div>

          {/* ── Cart ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <div className="grid2" style={{ gap: '0.6rem' }}>
              <CsvUploader
                label="cart.csv"
                description="Upload a cart CSV"
                onLoad={handleCartCsv}
                hasData={cartItems.length > 0 && /\.csv$/i.test(cartSource.fileName)}
                fileName={cartSource.fileName}
              />
              <CsvUploader
                label="cart.pdf"
                description="Or upload an order PDF"
                accept=".pdf,application/pdf"
                readAs="file"
                busy={pdfBusy}
                onLoad={handleCartPdf}
                hasData={cartItems.length > 0 && /\.pdf$/i.test(cartSource.fileName)}
                fileName={cartSource.fileName}
              />
            </div>
            <ErrorBanner errors={cartSource.errors} />
            <ErrorBanner errors={cartSource.warnings} variant="warning" />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.hint}>
                  {cartSource.notice || `${cartItems.length} item${cartItems.length > 1 ? 's' : ''} in cart`}
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
