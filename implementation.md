# Implementation Plan — Opptra Discount Engine (FDE Intern)

Fork: https://github.com/Mshahnawaz1/M-Shahnawaz-discount-engine-assignment
Base: https://github.com/opptra/discount-engine-assignment (commit `89028e4`)

## 0. Decisions already made

| Topic | Decision | Why |
|---|---|---|
| Stack | Keep base: React 18 + Vite 5, plain JS | "Inputs adapt to the engine, not the other way around" |
| LLM | Google Gemini (REST, JSON mode + `responseSchema`) | Free tier; schema-constrained JSON output |
| API key | One Vercel serverless function `api/parse-rule.js`; key in `GEMINI_API_KEY` env var | A static site would leak the key to every visitor |
| Local dev of the function | Small Vite dev-server middleware that mounts the same handler | `npm run dev` keeps working; no `vercel dev` login needed |
| PDF parsing | `pdfjs-dist` in the browser, deterministic, position-based | No server, no LLM cost, predictable per-row errors |
| Hosting | Vercel (static `dist/` + `api/` function) | Supports the function natively |
| Persistence | None — in-memory React state | Per brief |

## 1. What the base code does today (audit)

- `src/engine/discountEngine.js` — pure item-level logic: match → best non-stackable by rupee saving → stackables on top → reasoning. Rounds each discount step with `Math.round`.
- `src/engine/csvParser.js` — CSV → `DiscountRule[]` / `CartItem[]`, returns `{ data, errors }`.
- `src/App.jsx` — state + two CSV uploaders + "Calculate" button + results table + plain cart total.

Gaps / issues found:

1. **No cart scope.** Parser rejects `scope: cart`, requires `applies_to`, ignores `min_cart_value`. Sample `rules.csv` has no RULE-04 (the brief's version does).
2. **Flat discount can exceed price** → negative final price (e.g. Rs.150 off a Rs.99 item). Will clamp to the price.
3. **No upper bound on percentage** (e.g. 150%). Validator will reject > 100.
4. **Reasoning doesn't explain the choice** ("RULE-01 wins: Rs.195 > Rs.150"). Customer copy should say the better offer was picked.
5. Validation is embedded in the CSV parser, so new input modes would duplicate it.
6. Results only appear after clicking "Calculate"; the brief requires automatic re-runs when a rule is added or a PDF cart is loaded.

Rounding check (already correct, keep it): 1299→1104, 849→699→629, 599→509, 2499, 449→382, 899→809; sum 5932; 10% = 593.2→593; total **5339**. ✔

## 2. Target architecture

```
api/
  parse-rule.js            ← Vercel function: text → Gemini → JSON (key stays server-side)
src/
  engine/                  ← PURE. No I/O, no UI, no knowledge of input sources.
    discountEngine.js      ← item logic (existing) + cart offer + calculateCart()
    validation.js          ← NEW: validateRule(), validateCartItem() — single source of truth
    format.js              ← NEW: rupee formatting + rule → human label (shared by UI + reasoning)
  inputs/                  ← ADAPTERS. Each: source → { data, errors, warnings }
    csvInput.js            ← moved from engine/csvParser.js, now calls validation.js
    nlRuleInput.js         ← calls /api/parse-rule, normalises + validates the LLM output
    pdfCartInput.js        ← pdf.js → text lines → rows → validateCartItem()
    pdfTableParser.js      ← pure: positioned text items → rows (unit-testable without a PDF)
  components/
    CsvUploader.jsx  DataTable.jsx  ErrorBanner.jsx    (existing)
    PdfUploader.jsx        ← NEW
    RuleComposer.jsx       ← NEW: textarea → parse → confirmation card → confirm/discard
    CartSummary.jsx        ← NEW: item table + subtotal + cart offer row + final total
  App.jsx                  ← state only; results derived via useMemo(calculateCart(cart, rules))
sample-data/
  rules.csv (+RULE-04)  cart.csv  cart.pdf  cart-malformed.pdf
scripts/
  make-sample-pdfs.js      ← generates the sample PDFs (dev-only dependency)
tests/                     ← vitest
```

**Contract that makes "add a third input mode" trivial:** an input adapter is any function returning `{ data: CartItem[] | DiscountRule[], errors: string[], warnings: string[] }` whose items have passed `validateCartItem` / `validateRule`. App only calls `setCart(data)` or `setRules(...)`. The calculator never imports anything from `inputs/`.

## 3. Data shapes (extended, backwards compatible)

```js
DiscountRule {
  ruleId: string
  scope: 'brand' | 'platform' | 'cart'      // + 'cart'
  appliesTo: string | null                  // null for cart rules
  type: 'percentage' | 'flat'
  value: number                             // 0 < pct ≤ 100 ; flat > 0
  stackable: boolean
  minCartValue: number | null               // required for cart rules, else null
  source?: 'csv' | 'nl'                     // for UI badges only; engine ignores it
}

CartResult {
  items: DiscountResult[]                   // existing shape, unchanged
  subtotal: number                          // sum of item final prices
  cartOffer: null | { ruleId, label, discount, threshold }
  total: number
  nextCartOffer: null | { ruleId, label, shortBy }   // "Add Rs.68 more to get 10% off"
}
```

## 4. Engine work (Task 1 — cart-level offer)

1. `ruleMatchesItem` — unchanged (cart rules already return `false`, so they never touch items).
2. `calculateDiscountAmount` — clamp: `Math.min(rule.value, price)` for flat; percentage stays `Math.round(price * v / 100)`.
3. `applyDiscounts` — logic unchanged; better reasoning:
   - single rule: `Platform offer: 15% off`
   - won a comparison: `Platform offer: 15% off (best deal — beats Brand offer Rs.150 off)`
   - stacked: `Brand offer: Rs.150 off + Platform offer: 10% off (stacked)`
   - none: `No offers available on this item` (ITEM-04 needs a meaningful message)
   - new `status` field: `max-discount | stacked | applied | none`, used for the badges in the expected-results table.
4. NEW `applyCartOffer(subtotal, rules)`:
   - eligible = cart rules with `subtotal >= minCartValue` (inclusive, per "≥ Rs.4,000").
   - same selection policy as items: best non-stackable by rupee saving, then stackable cart rules on top.
   - returns `{ cartOffer, total }`; `cartOffer` is `null` if nothing qualifies, so **no row is rendered**.
   - `nextCartOffer`: the cheapest ineligible cart rule, with `shortBy = minCartValue - subtotal`. Shown as a soft hint ("Add Rs.X more…"), not as a discount row. Answers "what happens just below the threshold".
5. NEW `calculateCart(cartItems, rules) → CartResult`. Keep `processCart` / `cartTotal` exported for compatibility.

UI (`CartSummary.jsx`):
```
items table (final price, you save, offer applied, status badge)
Cart total before offer        Rs.5,932
Cart offer: 10% off — Rs.593 saved   −Rs.593      ← only if triggered
Final cart total               Rs.5,339
(hint) Add Rs.68 more to unlock 10% off your cart  ← only if below threshold
```

CSV: accept an optional `min_cart_value` column; for `scope=cart`, `applies_to` may be empty and `min_cart_value` is required. Update `sample-data/rules.csv` to the brief's 4-rule version.

## 5. Task 2 — Natural-language rule input

### Flow
`RuleComposer` textarea → "Parse rule" → `POST /api/parse-rule {text}` → `nlRuleInput.normalise()` → `validateRule()` → **confirmation card** → Confirm (append, engine re-runs via `useMemo`) / Discard.

### Server function `api/parse-rule.js`
- Rejects non-POST, empty input, or input > 500 chars.
- Calls Gemini `generateContent` with `responseMimeType: application/json` and a `responseSchema`:
  ```json
  { "status": "ok" | "ambiguous",
    "rule": { "scope", "appliesTo", "type", "value", "stackable", "minCartValue" },
    "missing": ["value", "threshold", ...],
    "clarification": "string shown to the user" }
  ```
- System prompt: few-shot with the 4 examples from the brief. Says "never invent a value or threshold — return ambiguous", "default stackable=false unless explicitly stated", "Rs./₹/rupees → flat", "'more than'/'above' → minCartValue".
- Sends the list of known brands/platforms from the current cart as context (helps spelling, e.g. "flipkart" → "Flipkart").
- Model from `GEMINI_MODEL` env (default a current Flash model); timeout ~10s; returns `{error}` with a 4xx/5xx status. Never forwards raw upstream errors or the key.

### Client-side guardrails (the LLM is untrusted)
- `normalise`: lower-case enums, strip "Rs."/"%"/commas from numbers, coerce "yes"/"true".
- `validateRule` (same validator as CSV): enums, `0 < pct ≤ 100`, flat > 0, cart ⇒ `minCartValue > 0` and `appliesTo` null; non-cart ⇒ `appliesTo` required.
- Outcomes:
  - **ambiguous** (from the LLM *or* failed validation of a required field) → amber card: "We couldn't build a rule from that — missing: discount value, minimum cart value. Try: '10% off orders above Rs.5,000'." No crash, nothing added.
  - **warning, still confirmable**: `appliesTo` matches no brand/platform in the current cart ("No item in your cart is from 'Flipcart' — did you mean Flipkart?"); a duplicate of an existing rule.
  - **network/LLM failure** → error banner and a retry option; existing rules untouched.
- Confirmation card shows: scope · applies to · type · value · stackable · min cart value, plus a live preview: "This changes your cart total from Rs.5,339 → Rs.X" (computed by running the engine with the candidate rule; nothing is committed).
- On confirm: `ruleId = RULE-NN` (next free number), `source: 'nl'`, rule table shows an "AI" badge and a remove (×) button.

## 6. Task 3 — PDF cart upload

### Parsing (`pdfTableParser.js`, pure)
1. pdf.js `getTextContent()` per page → items `{str, x, y}`.
2. Group items into lines by y (tolerance ~3pt), sort by x.
3. Find the **header line** containing Product, Brand, Platform, Base Price (case-insensitive). Its x positions become the column boundaries. Ignore everything above it (`Order #OP-9921 | Date…`).
4. Skip separator lines (`─`, `-`, `=` only) and blank lines.
5. Each later line → cells by x-bucket → `{product, brand, platform, basePrice}`.
6. Price: strip `Rs.`, `₹`, `INR`, commas → number.
7. Fallback when x-positions collapse (all text in one item): split on 2+ spaces.

### Validation and errors (`pdfCartInput.js`)
- Each row goes through `validateCartItem`. Bad rows are **skipped and reported**: "Row 4 (Ceramic Vase): price 'Rs.abc' is not a number — skipped". Good rows still load.
- Item IDs are generated as `ITEM-01…` in row order.
- **Do not replace the cart** if: no text layer (scanned PDF: "this PDF has no selectable text"), no header found, zero valid rows, or the file is not a PDF / is password-protected. The current cart stays and an error is shown.
- Otherwise the cart is replaced and the engine re-runs automatically (results are derived state).

### UI
The cart panel gets two sources: `cart.csv` (existing) and `cart.pdf` (new `PdfUploader`). It shows "Loaded 6 items from cart.pdf (1 row skipped)".

### Sample files
`scripts/make-sample-pdfs.js` (pdf-lib, devDependency) generates `sample-data/cart.pdf` (the brief's table) and `sample-data/cart-malformed.pdf` (one bad price, one missing brand) for the demo.

## 7. App wiring changes

- `results = useMemo(() => hasCalculated ? calculateCart(cart, rules) : null, [cart, rules, hasCalculated])`. The "Calculate Discounts" button stays for the first run (matches the brief's Step 3). After that, every rule or cart change re-runs automatically.
- Rules panel: CSV upload + rules table (badge for source, remove for NL rules) + `RuleComposer`.
- Layout stays in the existing visual style (inline styles, Opptra colours); wrap to one column on narrow screens.

## 8. Testing (vitest)

| Area | Cases |
|---|---|
| Engine | The full expected-results table; subtotal 5932; cart offer 593; total 5339 |
| Threshold | subtotal 3999 → no row, hint "Add Rs.1"; 4000 → applies (inclusive) |
| Edge | flat > price clamps to 0; no rules; only stackable; two cart rules (best wins) |
| NL rule | 4 brief examples (mocked LLM JSON) → expected rules; ambiguous; invalid enums; pct 150; string numbers "Rs.100" |
| PDF parser | brief table from synthetic positioned items; malformed price row skipped; missing header → error; separator/preamble ignored |
| Manual | Upload CSVs → check the table; add each NL example; upload both PDFs; verify on the live URL |

Scripts: `npm test`. No E2E framework (out of scope for 2–3h).

## 9. Deployment

1. `vercel` project linked to the fork; framework Vite, output `dist`.
2. Env var `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) in Vercel project settings.
3. Push to `main` → auto deploy. Put the live URL in the README.
4. Local: `.env.local` (git-ignored) with `GEMINI_API_KEY`; `.env.example` committed.

## 10. README updates

- Live URL at the top.
- Run locally in 3 steps: `npm install` → add `GEMINI_API_KEY` to `.env.local` → `npm run dev`.
- Architecture diagram (engine / inputs / UI) and the "add a third input mode" recipe.
- Design decisions and trade-offs (section 11).

## 11. Design notes / where I'd push back (for the README)

- **Confirmation step — agree, and extended it** with a live "new cart total" preview. A rule is a pricing decision, so a human should confirm it. In production, NL rules should go to a merchandiser approval queue, not be applied straight from a checkout screen.
- **PDF format assumption** — a fixed column table is brittle against real invoices. Alternative: keep the deterministic parser as the fast path and fall back to an LLM extractor that returns the same `CartItem[]` through the same validator. The adapter contract already allows this without engine changes.
- **Rounding per step** (rather than once at the end) is kept because the expected results depend on it (1299×0.85 = 1104.15 → 1104). Noted as a policy that finance should own.
- **Cart threshold uses the post-item-discount subtotal** (per brief), so a bigger item discount can push a cart *below* the cart-offer threshold. Customers can find this surprising; the "Add Rs.X more" hint offsets it.
- **Brief inconsistency:** the evaluation section calls the NL task "Task 1" and the PDF task "Task 2", while the build section numbers them 2 and 3. I follow the build section.
- **Stackable vs. "max discount"**: a stackable rule always applies even when stacking order matters (flat-then-% vs %-then-flat). I keep "winner first, stackables on base-order after" as the engine already does, and document it.

## 12. Milestones and order of work

| # | Step | Est. | Done when |
|---|---|---|---|
| M0 | `npm install`, run, verify base numbers; add vitest + engine tests for the base | 15m | Tests green on 6 items |
| M1 | `validation.js`, `format.js`, move CSV parser to `inputs/`; cart scope in CSV + sample | 20m | Old behaviour unchanged |
| M2 | Engine: clamp, reasoning/status, `applyCartOffer`, `calculateCart`; `CartSummary` UI | 30m | 5932 / −593 / 5339 shown; threshold tests |
| M3 | Deploy base+Task 1 to Vercel (early deploy, de-risks hosting) | 10m | Live URL works |
| M4 | `api/parse-rule.js` + Vite dev middleware + `nlRuleInput` + `RuleComposer` | 50m | 4 brief examples behave as specified |
| M5 | `pdfTableParser` + `PdfUploader` + sample PDFs | 40m | Both PDFs load or report correctly |
| M6 | README, design notes, final live check, commit and push | 20m | Submission ready |

Commits: one per milestone on `main` of the fork (small, readable history).

## 13. Progress

| # | Status | Notes |
|---|---|---|
| M0 | ✅ | vitest added; base engine verified against the brief |
| M1 | ✅ | `validation.js`, `format.js`; CSV adapter moved to `src/inputs/` |
| M2 | ✅ | cart offer, clamp, status/reasoning, nudge; `CartSummary` |
| M3 | ⏳ | Deploy to Vercel — needs the account owner (env var `GEMINI_API_KEY`) |
| M4 | ✅ | Gemini function + guardrails + confirmation card (tested with a mocked LLM; needs one live check with a real key) |
| M5 | ✅ | PDF upload; sample + malformed PDFs; tested through real pdf.js |
| M6 | ✅ | README with design notes; live URL still to add |

Deviations from the plan:
- Default model is the `gemini-flash-latest` alias (2.5 Flash is deprecated); pin with `GEMINI_MODEL`.
- Added a guard that rejects LLM-proposed numbers not present in the user's text.
- Reused `CsvUploader` for PDFs (`readAs="file"`) instead of a separate `PdfUploader`.
