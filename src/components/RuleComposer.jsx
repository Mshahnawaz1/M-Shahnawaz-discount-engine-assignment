/**
 * RuleComposer.jsx
 *
 * Plain-English rule input → AI parse → confirmation card → confirm / discard.
 * Nothing is added to the active rules until the user confirms.
 */

import { useEffect, useState } from 'react'
import { requestRuleParse, interpretLlmResponse } from '../inputs/nlRuleInput.js'
import { nextRuleId } from '../engine/validation.js'
import { rupees, ruleValueLabel } from '../engine/format.js'
import { MAX_RULE_TEXT } from '../inputs/limits.js'
import { S, C } from '../styles.js'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
  'Give a discount for big orders',
]

const cap = (v) => v.charAt(0).toUpperCase() + v.slice(1)

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '3px 0' }}>
      <span style={{ width: 120, color: C.grey, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{children}</span>
    </div>
  )
}

const box = (border, bg) => ({ border: `1px solid ${border}`, borderLeft: `3px solid ${border}`, background: bg, borderRadius: 4, padding: '0.75rem 0.9rem', marginTop: '0.7rem' })

export default function RuleComposer({ rules, cartItems, currentTotal, previewTotal, onAdd }) {
  const [text, setText] = useState('')
  const [state, setState] = useState({ phase: 'idle' })
  const [slow, setSlow] = useState(false)

  // The AI service can take a while when it's overloaded (we fall back across
  // models server-side) — tell the user rather than leaving a silent spinner.
  useEffect(() => {
    if (state.phase !== 'loading') return setSlow(false)
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [state.phase])

  async function handleParse(e) {
    e?.preventDefault()
    const input = text.trim()
    if (!input) return
    setState({ phase: 'loading' })
    try {
      const llm = await requestRuleParse(input, { cartItems })
      const outcome = interpretLlmResponse(llm, { text: input, existingRules: rules, cartItems })
      setState(outcome.kind === 'ok' ? { phase: 'confirm', ...outcome } : { phase: 'ambiguous', ...outcome })
    } catch (err) {
      setState({ phase: 'error', message: err.message })
    }
  }

  function applySuggestion() {
    const { rule, suggestion } = state
    const fixed = { ...rule, appliesTo: suggestion.appliesTo }
    const warnings = state.warnings.filter((w) => !w.startsWith('No item in the current cart'))
    setState({ ...state, rule: fixed, suggestion: null, warnings })
  }

  function confirm() {
    onAdd({ ...state.rule, ruleId: nextRuleId(rules), source: 'nl' })
    setText('')
    setState({ phase: 'added', ruleId: nextRuleId(rules) })
  }

  const loading = state.phase === 'loading'
  const awaitingConfirm = state.phase === 'confirm'

  return (
    <div>
      <div style={S.subTitle}>Add a rule in plain English</div>
      <form onSubmit={handleParse}>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (state.phase !== 'loading' && state.phase !== 'confirm') setState({ phase: 'idle' })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(e)
          }}
          maxLength={MAX_RULE_TEXT}
          rows={2}
          placeholder='e.g. "15% off all Amazon India items"'
          disabled={loading || awaitingConfirm}
          aria-label="Describe a discount rule"
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '0.5rem 0.6rem', border: `1px solid ${C.border}`, borderRadius: 4, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <button type="submit" style={S.btnSmall} disabled={!text.trim() || loading || awaitingConfirm}>
            {loading ? 'Reading rule…' : 'Parse rule'}
          </button>
          <span style={{ fontSize: 11, color: C.grey }}>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={loading || awaitingConfirm}
              onClick={() => {
                setText(ex)
                setState({ phase: 'idle' })
              }}
              style={{ fontSize: 11, border: `1px solid ${C.border}`, background: '#fafafa', borderRadius: 12, padding: '2px 8px', cursor: 'pointer', color: C.navy }}
            >
              {ex.length > 28 ? ex.slice(0, 26) + '…' : ex}
            </button>
          ))}
        </div>
      </form>
      {slow && <div style={{ ...S.hint, marginTop: 6 }}>The AI service is busy — still working (up to ~25s)…</div>}

      {state.phase === 'confirm' && (
        <div style={box(C.blue, C.blueBg)} role="dialog" aria-label="Confirm new rule">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Confirm this rule before it goes live</div>
          {state.restatement && <div style={{ fontSize: 12, fontStyle: 'italic', marginBottom: 6 }}>“{state.restatement}”</div>}
          <Field label="Scope">{cap(state.rule.scope)}</Field>
          {state.rule.scope !== 'cart' && <Field label="Applies to">{state.rule.appliesTo}</Field>}
          <Field label="Type">{cap(state.rule.type)}</Field>
          <Field label="Value">{ruleValueLabel(state.rule)}</Field>
          {state.rule.scope === 'cart' && <Field label="Min cart value">{rupees(state.rule.minCartValue)}</Field>}
          <Field label="Stackable">{state.rule.stackable ? 'Yes' : 'No'}</Field>

          {currentTotal !== null && cartItems.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              Effect on the current cart: {rupees(currentTotal)} → <b>{rupees(previewTotal(state.rule))}</b>
              {previewTotal(state.rule) === currentTotal && (
                <div style={{ color: C.grey, marginTop: 2 }}>
                  No change today — an equal or better offer already applies, or no item in the cart qualifies.
                </div>
              )}
            </div>
          )}

          {state.warnings.map((w) => (
            <div key={w} style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>⚠ {w}</div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button style={S.btnSmall} onClick={confirm}>Confirm &amp; apply</button>
            {state.suggestion && (
              <button style={S.btnGhost} onClick={applySuggestion}>
                Use “{state.suggestion.appliesTo}”
              </button>
            )}
            <button style={S.btnGhost} onClick={() => setState({ phase: 'idle' })}>Discard</button>
          </div>
        </div>
      )}

      {state.phase === 'ambiguous' && (
        <div style={box('#c98a00', C.amberBg)} role="alert">
          <div style={{ fontWeight: 700, fontSize: 13, color: C.amber }}>Can't create a rule from that yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{state.message}</div>
          {state.missing.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 4, color: C.amber }}>Missing: {state.missing.join(', ')}</div>
          )}
        </div>
      )}

      {state.phase === 'error' && (
        <div style={box('#c0392b', '#fce8e8')} role="alert">
          <div style={{ fontSize: 12, color: '#5a1010' }}>{state.message} Your existing rules are unchanged.</div>
          <button style={{ ...S.btnGhost, marginTop: 6 }} onClick={handleParse}>Retry</button>
        </div>
      )}

      {state.phase === 'added' && (
        <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>✓ {state.ruleId} added — cart re-calculated.</div>
      )}
    </div>
  )
}
