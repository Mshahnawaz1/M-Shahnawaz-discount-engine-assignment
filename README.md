# Opptra Discount Engine — FDE Intern Assignment

**Live demo:**  https://m-shahnawaz-discount-engine-assignm.vercel.app/

A customer-facing cart pricing engine. It picks the best offer per item, stacks stackable offers, applies a cart-level offer, and explains every price in plain language. Rules can come from CSV or plain English (parsed by an LLM), and carts from CSV or PDF.

## Run locally (3 steps)

```bash
npm install
cp .env.example .env         # then put your Gemini API key in it (only needed for plain-English rules)
npm run dev                  # → http://localhost:5173
```

`npm test` runs the 92 unit and integration tests. `npm run make:pdfs` regenerates the sample PDFs.

## Try it

1. Upload `sample-data/rules.csv` and `sample-data/cart.csv`, then click **Calculate Discounts**. You should see Rs.5,932 → cart offer −Rs.593 → **Rs.5,339**.
2. Type a rule in plain English, for example *"20% off for Natura Casa brand, stackable with other offers"*. Check the confirmation card and confirm. The cart re-prices immediately.
3. Upload `sample-data/cart.pdf`, which gives the same cart, or `sample-data/cart-malformed.pdf`, which loads 4 items, reports 2 bad rows and ignores a footer line.

## Architecture

```
            ┌──────────── inputs/ (adapters) ────────────┐
 rules.csv ─┤ csvInput.js        → DiscountRule[]        │
 English  ──┤ nlRuleInput.js ⇄ /api/parse-rule (Gemini)  │──► engine/validation.js ──► App state ──► engine/discountEngine.js ──► CartSummary
 cart.csv ──┤ csvInput.js        → CartItem[]            │      (one validator for       (rules, cart)   calculateCart() — pure
 cart.pdf ──┤ pdfCartInput.js + pdfTableParser.js        │       every input)
            └────────────────────────────────────────────┘
```

- **`src/engine/`** is pure. It does no I/O and knows nothing about CSV, PDF or LLMs. `discountEngine.js` holds the pricing logic, `validation.js` defines what a valid rule or cart item is, and `format.js` holds the customer-facing wording.
- **`src/inputs/`** has one adapter per source. Each returns `{ data, errors, warnings }` with data that has passed `validateRule` / `validateCartItem`.
- **Adding a third input mode** (say an email, a spreadsheet or an API) means writing one adapter that returns that shape and calling `setRules` / `setCartItems` with it. The calculator doesn't change.
- **`api/parse-rule.js`** is the only server code. It's a Vercel function that keeps `GEMINI_API_KEY` off the client. Locally, the Vite dev server mounts the same handler, so `npm run dev` is all you need.
- Results are **derived state** (`useMemo(calculateCart(cart, rules))`), so every change to rules or the cart re-runs the engine and rebuilds the reasoning strings.

## Pricing rules implemented

- Among matching non-stackable rules, the **largest rupee saving wins**, whatever the scope. If two rules tie, the earlier one wins, so results are deterministic.
- Stackable rules always apply **on top**, on the already-discounted price, or on their own if nothing else matched.
- **Cart rules** are checked against the **sum of final item prices** (≥, inclusive). The cart discount appears as its own row and only when it's triggered.
- Every discount step is rounded to the nearest rupee, which is what makes the brief's expected numbers come out (e.g. 1299 × 15% = 194.85 → 195).
- A flat discount is **capped at the price**, so a Rs.150 offer on a Rs.99 item makes it Rs.0, not −Rs.51. (This was a bug in the base code.)

## How the edge cases are handled

| Situation | Behaviour |
|---|---|
| Cart total just below the threshold | No cart-offer row. A hint shows instead: *"Add Rs.68 more to get 10% off your cart"*. It also points to a bigger cart offer when one is close. |
| LLM says the input is ambiguous ("discount for big orders") | An amber card explains what's missing and gives an example. Nothing is added. |
| LLM returns an invalid rule (bad enum, 120%, cart rule with no threshold) | The same validator as CSV rejects it, and the user sees an "ambiguous" card. The app doesn't crash. |
| LLM **invents a number** that isn't in the text | Rejected. The value and threshold must appear in the user's sentence. For pricing, not guessing is the safer default. |
| Brand or platform not in the cart ("Flipcart") | A warning on the confirmation card, with a one-click *Use "Flipkart"* fix. |
| Duplicate rule, or a ≥ 50% discount | A warning on the confirmation card. The user can still confirm. |
| Gemini overloaded (503 — happened constantly in live testing) | The server falls back across models: lite, then flash, a 800ms backoff, both again, then `gemini-3.6-flash`. The whole attempt has a 25s budget. After 4s the UI shows "still working". |
| Someone hammers the LLM endpoint | An in-memory **token bucket** per IP (burst 5, then 1 every 12s) plus a global bucket (burst 30, then 1/s) to cap total Gemini spend. Returns 429 with `Retry-After`. Only requests that pass input validation use a token. *Best-effort:* each serverless instance keeps its own buckets. For exact limits, swap in Redis (e.g. Upstash) behind the same interface. |
| LLM down, rate-limited or not configured | A clear error with a retry option. Existing rules are untouched, and upstream error details are logged on the server but never sent to the client. |
| Malformed PDF row (bad price, missing cell) | The row is skipped with a reason, e.g. *"Row 2 (Bed Sheet Set): price "Rs.8 49" is not a valid positive amount — skipped"*. Valid rows still load. |
| PDF with no text layer, no table header, password-protected, > 5 MB, or not a PDF | A clear error. **The current cart is kept.** Any upload with zero valid rows never wipes existing data. |
| PDF footer or notes text | Ignored, with a note. |
| No rules match an item (ITEM-04) | *"No offers available on this item"* and a "No offer" badge. |

## Where I made a different call (or would in production)

- **Confirmation step: I kept it and made it stronger.** The card shows a live preview, *"Effect on the current cart: Rs.5,339 → Rs.5,026"*. A pricing rule is a business decision, so a human should see its effect before it goes live. In production I'd route NL-created rules to a merchandiser approval queue with an audit trail rather than applying them from a single screen.
- **PDF format assumption.** A fixed-column table is fine for the sample, but real invoices vary a lot. The parser is already lenient: it takes column positions from the header, splits merged text runs, handles a header repeated on each page, and accepts "Rs." / "₹" / "INR" and commas in prices. The next step would be an LLM-based extractor as a fallback adapter that returns the same `CartItem[]` through the same validator, so the engine wouldn't change. I didn't add it because it costs money per upload and is non-deterministic where a deterministic parser works.
- **The cart threshold uses post-discount prices**, as the brief specifies. One consequence: a new item-level offer can push a cart *below* the threshold and make the order slightly more expensive overall. The nudge message softens this. A real system might take the better of the two outcomes for the customer.
- **Stacking order.** Stackables apply in rule order on the running price. With a mix of flat and percentage stackables, the order changes the result by a few rupees. That's a policy decision for finance, not something the engine should guess at.
- **Brief numbering.** The evaluation section calls the NL task "Task 1" and the PDF task "Task 2". I followed the build section's numbering (Task 1 = cart offer, Task 2 = NL, Task 3 = PDF).
- **Uploading a new `rules.csv`** replaces the whole rule set, including rules added in plain English. A rules file is treated as the source of truth.

## Deploying (Vercel)

1. Import the repo in Vercel. The Vite framework preset is auto-detected (build `npm run build`, output `dist`).
2. Add the environment variable `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` (one model or a comma-separated fallback list; default `gemini-flash-lite-latest,gemini-flash-latest,gemini-3.6-flash`). `vercel.json` gives the function a 30s max duration.
3. Deploy. `api/parse-rule.js` becomes a serverless function automatically.

## Project structure

```
api/parse-rule.js            Vercel function → server/geminiRuleParser.js
server/geminiRuleParser.js   prompt, response schema, Gemini call, request handler
server/rateLimiter.js        in-memory token bucket (per IP + global)
src/engine/                  discountEngine.js · validation.js · format.js   (pure)
src/inputs/                  csvInput.js · nlRuleInput.js · pdfCartInput.js · pdfTableParser.js
src/components/              CartSummary · RuleComposer · CsvUploader (CSV + PDF) · DataTable · ErrorBanner
tests/                       engine, validation, CSV, NL (mocked LLM + handler), PDF (synthetic + real files)
sample-data/                 rules.csv (incl. RULE-04) · cart.csv · cart.pdf · cart-malformed.pdf
implementation.md            the plan this was built from
docs/notes.md                design rationale, interview Q&A, production system design
```
