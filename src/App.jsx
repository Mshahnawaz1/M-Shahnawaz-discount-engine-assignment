/**
 * App.jsx
 *
 * Holds session state (rules, cart) and wires input adapters → engine → display.
 * Results are *derived* from (cart, rules), so any change — a new CSV, a rule
 * added in plain English, a PDF cart — re-runs the engine automatically.
 *
 * App never contains discount logic, and the engine never knows about inputs.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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
import sampleRulesCsv from '../sample-data/rules.csv?raw'
import sampleCartCsv from '../sample-data/cart.csv?raw'
import samplePdfUrl from '../sample-data/cart.pdf?url'
import malformedPdfUrl from '../sample-data/cart-malformed.pdf?url'

function Logo() {
  return (
    <a href="#top" className="logo" aria-label="Opptra home">
      <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
        <path d="M2 3 L12 11 L2 19 Z" fill="#ff5800" />
        <path d="M13 3 L23 11 L13 19 Z" fill="#ff5800" opacity=".75" />
      </svg>
      opptra
    </a>
  )
}

const STEPS = [
  ['Load offers', 'Upload rules as CSV, or describe a new one in plain English and let AI draft it.'],
  ['Load the cart', 'Upload a cart CSV or an order PDF — bad rows are flagged, never silently priced.'],
  ['Best deal wins', 'Each item gets the biggest saving; stackable offers apply on top.'],
  ['Cart offer', 'Big carts unlock a cart-wide discount, shown as its own line.'],
]

const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '—')

function rulesColumns(onRemove) {
  return [
    {
      key: 'ruleId',
      label: 'Rule ID',
      render: (v, row) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <b>{v}</b> {row.source === 'nl' && <span style={S.tag('#fff', C.orange)}>AI</span>}
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
          style={{ border: 'none', background: 'none', color: C.grey, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      ),
    },
  ]
}

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Price', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{rupees(v)}</span> },
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

  const summaryRef = useRef(null)
  useEffect(() => {
    if (hasCalculated) summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hasCalculated])

  function loadSampleData() {
    handleRulesCsv(sampleRulesCsv, 'rules.csv (sample)')
    handleCartCsv(sampleCartCsv, 'cart.csv (sample)')
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div id="top">
      <nav className="nav">
        <Logo />
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#workspace">Offers &amp; cart</a>
          <a href="#checkout">Checkout</a>
        </div>
        <button className="btn" onClick={loadSampleData}>Load sample data</button>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">Opptra · Checkout pricing engine</div>
        <h1>Every Cart, Best Price</h1>
        <p>(the biggest saving for every customer — explained in plain words)</p>
        <div className="hero-actions">
          <a className="btn" href="#workspace">Start pricing</a>
          <a className="btn btn-ghost" href={samplePdfUrl} download="cart.pdf">Sample cart PDF</a>
        </div>
        <div className="hero-stats">
          <span className="hero-stat">Brand · Platform · Cart offers</span>
          <span className="hero-stat">AI rule drafting</span>
          <span className="hero-stat">PDF cart upload</span>
        </div>
      </header>

      <main className="main">
        <section id="how">
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2>How it works</h2>
            <p>One final price, one clear offer label, no surprises.</p>
          </div>
          <div className="steps">
            {STEPS.map(([title, body], i) => (
              <div className="step" key={title}>
                <div className="step-num">0{i + 1}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workspace" style={{ scrollMarginTop: 90 }}>
          <div className="section-head">
            <h2>Offers &amp; cart</h2>
            <p>
              No files handy? <button className="btn btn-outline btn-sm" onClick={loadSampleData}>Load sample data</button>{' '}
              or grab the <a href={malformedPdfUrl} download="cart-malformed.pdf" style={{ color: C.orange }}>malformed PDF</a> to see error handling.
            </p>
          </div>

          <div className="grid2">
            {/* ── Rules ── */}
            <div className="card">
              <div className="eyebrow">Step 1</div>
              <h3 className="card-title">Discount rules</h3>
              <CsvUploader
                label="rules.csv"
                description="Upload your discount rules CSV"
                onLoad={handleRulesCsv}
                hasData={rules.length > 0}
                fileName={rulesSource.fileName}
              />
              <ErrorBanner errors={rulesSource.errors} />
              {rules.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="hint" style={{ marginBottom: 8 }}>
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
            <div className="card">
              <div className="eyebrow">Step 2</div>
              <h3 className="card-title">Cart items</h3>
              <div className="grid2" style={{ gap: 12 }}>
                <CsvUploader
                  label="cart.csv"
                  description="Upload a cart CSV"
                  onLoad={handleCartCsv}
                  hasData={cartItems.length > 0 && /\.csv/i.test(cartSource.fileName)}
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
                <div style={{ marginTop: 16 }}>
                  <div className="hint" style={{ marginBottom: 8 }}>
                    {cartSource.notice || `${cartItems.length} item${cartItems.length > 1 ? 's' : ''} in cart`}
                  </div>
                  <DataTable columns={CART_COLUMNS} rows={cartItems} />
                </div>
              )}
            </div>
          </div>

          {!hasCalculated && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <button className="btn" onClick={() => setHasCalculated(true)} disabled={!canCalculate}>
                Calculate discounts
              </button>
              {!canCalculate && <div className="hint">Load rules and a cart to calculate</div>}
            </div>
          )}
        </section>

        <section id="checkout" ref={summaryRef} style={{ scrollMarginTop: 90 }}>
          {result && (
            <>
              <div className="section-head">
                <h2>Your checkout</h2>
                <p>Updates automatically when offers or the cart change.</p>
              </div>
              <div className="card">
                <CartSummary result={result} />
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <Logo />
        <span>Discount Engine · FDE Intern assignment · in-memory, nothing is stored</span>
      </footer>
    </div>
  )
}
