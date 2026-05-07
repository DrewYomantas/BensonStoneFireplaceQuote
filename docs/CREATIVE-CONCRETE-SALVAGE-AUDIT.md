# Creative Concrete Salvage Audit for BSFQ

> **Note on scope.** The path originally given (`Desktop/Creative-Concrete-and-Landscape_Search_2026-04-27_125828`) is a marketing/branding research export — no source code, only PDFs, CSVs, and narrative docs. The actual code project is **`Desktop/CreativeEstimateStudio`** (CES) — the standalone CC&L proposal app already noted in memory. This audit covers CES.

## 1. Executive Summary

CES is a tablet-first, 4-step wizard that turns OCR'd contractor estimates (Jobber/Housecall Pro screenshots) into branded customer-facing proposals. It's a *workbench*, not a CRM, and the architecture reflects that — small, sharp, single-user.

**Most useful things found**
1. `moneyNormalizer.js` — handles malformed European/OCR currency separators (`$7.542.00` → 7542) with tested edge cases.
2. `rowClassifier.js` — separates billable lines from `$1.00` placeholder note rows that contractor apps insert.
3. `textCleaner.js` — title-cases names (Mc/Mac/O'Brien/joint), expands street-type abbreviations, lowercases emails. Returns `{cleaned, original, didChange}` so the UI can show "Cleaned up — was 'X'" chips with revert.
4. `expression.js` — hand-rolled recursive-descent calculator for spreadsheet-style cells (`440*14.5`, `1000-15%`), no `eval()`, with injection-defense tests.
5. Step 4 print→email handoff state machine — `window.print()` → `afterprint` → mailto: with native-share fallback. No silent flows.

**Should anything be ported?** Yes — three small, pure modules (#1, #2, #3 above) are clean wins. Everything UX-shaped is **inspiration only** — BSFQ's mental model is multi-customer pipeline + BisTrack, not single-tablet-user, so wholesale copy would warp it.

**Reference only**: 4-step wizard layout, live proposal preview, drag-to-reorder line items, auto-learning customer book / line templates, photo downscaling, PWA shell.

---

## 2. Source Project Inventory

CES at `Desktop/CreativeEstimateStudio`:
- Stack: React 19 + Vite + plain CSS (matches BSFQ exactly — same conventions)
- ~27 modules in `src/core/` (vs BSFQ's `src/lib/`), each with `.test.js`
- 4 step components in `src/components/`: Step1Upload, Step2Review, Step3Polish, Step4Send + ProposalDocument + SentScreen
- Tests: 15 files, Node built-in runner, real-world messy-input coverage
- Storage: localStorage everywhere; single JSON workspace export/import
- Status: active production v0.1, PWA with service worker

The mismatched-path folder (`Creative-Concrete-and-Landscape_Search_2026-04-27_125828/`) contains only `.md`, `.pdf`, `.csv`, and `.ps1` files. No code to salvage there.

---

## 3. OCR / Parsing Patterns Found

| Pattern | CES file | What it does | Why it matters | BSFQ equivalent | Port? |
|---|---|---|---|---|---|
| **Money normalizer** | `src/core/moneyNormalizer.js` | Regex + heuristics that recover totals from OCR'd `$6.802.00`, `$7.542.00`, comma-thousands, trailing decimals | BisTrack scans almost certainly hit the same OCR artifacts; BSFQ currently relies on `parseAmount`-style helpers in `bisTrackScanParser.js` without this normalizer | `bisTrackScanParser.js` extracts totals; no equivalent normalizer | **Port** as `src/lib/moneyNormalizer.js`, wire into `bisTrackScanParser.js` total/balance fields |
| **$1 placeholder row classifier** | `src/core/rowClassifier.js` | Tags rows as BILLABLE / CUSTOMER_NOTE / PAYMENT_NOTE / INFORMATIONAL via two thresholds ($1.00 strict, $1.05 loose) plus keyword regex | BisTrack quotes also carry "Customer", "Scope of Work", "Deposit 50%" pseudo-rows. Currently BSFQ may carry these into the customer-facing proposal | `bisTrackScanParser.js` parses line items but no `isNote` filter | **Port** as `src/lib/lineItemClassifier.js`; consume in `bisTrackScanParser.js` and `quotePolishOpportunity.js` |
| **Text cleaner with diff** | `src/core/textCleaner.js` | `cleanName/cleanAddress/cleanEmail` returning `{cleaned, original, didChange}`. Mc/Mac/O'Brien/Tom & Sue, "n mineral str" → "N Mineral St" | Combined with the existing "scan-wins" merge, BSFQ could surface revertable correction chips on extracted customer fields | No equivalent — BSFQ trusts BisTrack and surfaces blanks; OCR cleanup is implicit in `bisTrackScanParser.js` | **Port** as `src/lib/textCleaner.js`; wire optionally into recovery upload review |
| **Multi-file estimate grouping** | `src/core/estimateGrouping.js` | `groupResultsByEstimate(results)` detects multi-page same-estimate uploads, reconciles subtotal vs grand total | BSFQ `BulkRecoveryUpload` triages but does not reconcile pages of the same quote | `recoveryUploadIntake.js` `parseRecoveryUploadFiles` has triage, no recon | **Reference** — BSFQ rarely sees same-quote-multipage; the per-quote signal differs |
| **Hand-rolled expression calc** | `src/core/expression.js` | `evaluateExpression('440*14.5')`, percent semantics, no `eval()`, injection tests | Lets users edit qty/unit/total inline like a spreadsheet | BSFQ field inputs are plain text; no calc | **Reference** — only worth porting if BSFQ adds an editable line-item grid |
| **PDF text extraction** | `src/core/pdfTextExtraction.js` | pdfjs + tesseract.js lazy-loaded; Y-coordinate line grouping (≤3pt) | CES groups items by visual line, BSFQ uses different zone-OCR for BisTrack scans | `src/lib/pdfTextExtraction.js` already has the BisTrack-tuned version | **Ignore** — BSFQ's is more specialized |
| **Label suggester** | `src/core/labelSuggester.js` | Heuristic line-item label inference | Could help BSFQ propose project titles from line items | None | **Reference** |

---

## 4. Upload / Review Flow Patterns

| Pattern | CES file | BSFQ relevance | Port? |
|---|---|---|---|
| Drag-drop zone with multi-file staging + per-file OCR progress | `Step1Upload.jsx` | BSFQ already has `BulkRecoveryUpload`; CES drag-drop is friendlier (preview chips with customer/est#/total before commit) | **Adapt** — add file preview chips to `BulkRecoveryUpload` |
| "Header-first" auto-sort of staged files | `Step1Upload.jsx` | If BSFQ bulk upload includes a cover sheet + line-item pages, this would be useful | **Reference** |
| Field correction chips with revert ("Cleaned up — was 'X'") | `Step2Review.jsx` + `fieldCorrections` map | Pairs perfectly with `textCleaner.js` port | **Adapt** — add to `RecoveryUploadReview` |
| Per-row classification badge cycle (Billable → Project Note → Payment Note → Needs review) | `Step2Review.jsx` | Pairs with `rowClassifier.js` port; lets reviewer override OCR's guess | **Adapt** |
| "Send anyway" advisory pattern (warnings never block) | Step4Send | Matches BSFQ's existing tolerance for blanks | **Reference** — already aligned |

---

## 5. Proposal / Output Patterns

| Pattern | CES file | BSFQ equivalent | Port? |
|---|---|---|---|
| Three-page proposal w/ cover-sheet collapse | `ProposalDocument.jsx` | `CustomerProposal.jsx` | **Reference** — BSFQ already has its own customer-facing layout; structural ideas (snapshot cards, payment schedule page, closing-line page) could inform v2 |
| `window.print()` + `@page` print CSS, no html2pdf | `exportPdf.js` + `App.css` print classes | BSFQ also uses print CSS | **Reference** — confirms pattern, nothing to port |
| Step 4 state machine (idle → preparing → ready-fallback → sent-confirmed) with 700ms guard after print | `Step4Send.jsx` | BSFQ's `ExportPrep` (parked) and live export flow have no explicit state machine | **Reference / Adapt** — useful when BSFQ wires up its email handoff |
| Filename builder: `CCL-Proposal-<customer>-<est#>-<date>.pdf` | `exportPdf.js` `buildFilename` | None | **Port** as a tiny helper in `customerView.js` (or new `exportFilename.js`) |
| Mailto: with native-share fallback (`canShareWithFile`) | `exportPdf.js` `handoffEmail` | None | **Reference** — BSFQ may not need; depends on whether send is in scope |

---

## 6. Visual / UX Patterns

- **Sticky topbar + sticky step header** (z-index 90/89) — applicable to BSFQ's `WorkbenchShell` if Drew wants tablet-friendly scrolling.
- **Drag-to-reorder via pointer events + `touch-action: none`** — no DnD library; could help BSFQ if line-item reorder ever matters.
- **Type-ahead dropdowns with `onMouseDown` (fires before blur)** — useful if BSFQ adds customer-name autocomplete sourced from `opportunities.js`.
- **Animated dropzone "card stack"** with CSS rotate transforms — pure flair; **reference only**.
- **Auto-learned customer book / line templates / message library / project types** — silent learning layer. BSFQ already has richer customer state via `customerFile.js` + `opportunities.js`. **Reference only**.
- **Photo downscaling to 1600px JPEG 0.85** before localStorage — relevant if BSFQ ever attaches showroom photos to opportunities.
- **Persistent storage indicator** (browser durability state) — relevant given BSFQ also relies entirely on localStorage. **Adapt**.
- **PWA + service worker** — could help BSFQ install on the showroom tablet so iOS doesn't evict storage. **Reference**.

---

## 7. BSFQ Translation Map

| CES Pattern | BSFQ Equivalent | Action | Notes |
|---|---|---|---|
| `moneyNormalizer.js` | `bisTrackScanParser.js` total parsing | **Port** | Pure module + tests; ~150 LOC |
| `rowClassifier.js` ($1 placeholders) | `bisTrackScanParser.js` line items + `quotePolishOpportunity.js` | **Port** | Defaults: BSFQ likely needs different keyword set (BisTrack uses different conventions than Jobber) |
| `textCleaner.js` | New module; consumed by `recoveryUploadIntake.js` | **Port** | Pair with correction-chip UI in `RecoveryUploadReview` |
| `Step2Review` correction chips | `RecoveryUploadReview` field rows | **Adapt** | UI pattern only; needs BSFQ styling |
| `expression.js` calculator | None (BSFQ doesn't edit line items) | **Reference** | Only if Drew adds inline editing |
| `Step1Upload` preview chips | `BulkRecoveryUpload` triage rows | **Adapt** | BSFQ already has bucket triage; add per-file preview before batch parse |
| `estimateGrouping.js` multi-page recon | `recoveryUploadIntake.js` | **Reference** | BSFQ rarely sees same-quote multi-page |
| `ProposalDocument.jsx` 3-page layout | `CustomerProposal.jsx` | **Reference** | Structural inspiration for v2 customer proposal |
| Step 4 send state machine | Future BSFQ proposal-send flow | **Reference** | Adopt if/when Drew builds send |
| Auto-learning (customer book, etc.) | `opportunities.js` already richer | **Ignore** | BSFQ's CRM-ish layer dwarfs this |
| Live proposal preview pane | `CustomerProposal.jsx` already viewable | **Reference** | BSFQ could mount it as a side preview during quote polish |
| Photo downscaling | Future showroom photo attach | **Reference** | Worth bookmarking for showroom display lane |
| PWA + service worker | None | **Reference** | Useful on showroom tablet install |
| 4-step wizard | BSFQ's free-form workbench | **Ignore** | Different mental model — don't force a wizard onto multi-customer triage |

---

## 8. Recommended Port Candidates (Top 5)

### 1. `moneyNormalizer.js` → `src/lib/moneyNormalizer.js` (PORT)
- **Value**: HIGH. BisTrack scans go through Tesseract; OCR currency artifacts are guaranteed.
- **Effort**: ~1 hr. Copy module + tests, wire into `bisTrackScanParser.js` total/balance/quotation total fields.
- **Risk**: LOW. Pure function, no state.
- **Source**: `Desktop/CreativeEstimateStudio/src/core/moneyNormalizer.js` + `.test.js`
- **Target**: `src/lib/moneyNormalizer.js`; consumed by `bisTrackScanParser.js`
- **Test strategy**: Port CES tests verbatim; add 2-3 BSFQ-specific BisTrack OCR fixtures.

### 2. `rowClassifier.js` → `src/lib/lineItemClassifier.js` (PORT, with BSFQ-tuned keywords)
- **Value**: HIGH. BisTrack quotes carry deposit/scope/note rows that bleed into customer proposals.
- **Effort**: ~2 hrs. Re-tune keyword regex for BisTrack idiom ("Deposit", "Scope of Work", "Customer notes").
- **Risk**: MEDIUM. Misclassification could hide real $1 line items; tests must cover BSFQ-specific fixtures.
- **Source**: `src/core/rowClassifier.js` + `.test.js`
- **Target**: `src/lib/lineItemClassifier.js`; consumed in `bisTrackScanParser.js` line-items pipeline and surfaced in `CustomerProposal.jsx` (filter out non-billable).
- **Test strategy**: Port CES tests; replace fixtures with redacted BisTrack lines; add tests for "deposit 50%", "scope summary", and quote-only language.

### 3. `textCleaner.js` → `src/lib/textCleaner.js` (PORT, optional UI)
- **Value**: MEDIUM-HIGH. Customer names from BisTrack OCR are messy; current code surfaces them as-is.
- **Effort**: ~1.5 hrs to port; ~3 hrs to add correction-chip UI.
- **Risk**: LOW for pure module; MEDIUM for UI (don't auto-apply silently — user must see the diff).
- **Source**: `src/core/textCleaner.js` + `.test.js`
- **Target**: `src/lib/textCleaner.js`; optional consumer in `RecoveryUploadReview` (`OldQuoteRecovery.jsx`).
- **Test strategy**: Port verbatim. Then add BSFQ fixture tests for known-bad scans (the Rockford store-address bleed case in `CLAUDE.md`).

### 4. `Step1Upload` preview chips → enhance `BulkRecoveryUpload` (ADAPT)
- **Value**: MEDIUM. Reduces "what just happened" anxiety in bulk uploads.
- **Effort**: ~3 hrs. Pure UI adaptation in `OldQuoteRecovery.jsx` `BulkRecoveryUpload`.
- **Risk**: LOW. Additive.
- **Source**: `src/components/Step1Upload.jsx` (rendering of staged file chips)
- **Target**: `BulkRecoveryUpload` in `src/components/OldQuoteRecovery.jsx`
- **Test strategy**: Smoke build only (per BSFQ convention — components aren't unit-tested).

### 5. `Step2Review` correction-chip pattern → `RecoveryUploadReview` (ADAPT, depends on #3)
- **Value**: MEDIUM. Makes auto-cleanup transparent and reversible.
- **Effort**: ~3 hrs after #3 lands.
- **Risk**: LOW. Pure UI; revert restores original.
- **Source**: `Step2Review.jsx` `fieldCorrections` state + `.field-correction-chip` UI
- **Target**: `RecoveryUploadReview` (`OldQuoteRecovery.jsx`)
- **Test strategy**: Smoke build.

---

## 9. Do Not Port

- **The 4-step wizard shape** — BSFQ is multi-customer triage, not single-estimate processing. Forcing the wizard onto BSFQ would break `WorkbenchShell`'s mental model.
- **Auto-learning customer book / line-template / project-type stores** — BSFQ already has richer customer state via `opportunities.js` + `customerFile.js`. CES's flat localStorage stores would duplicate that worse.
- **`pdfTextExtraction.js` (CES version)** — BSFQ's is BisTrack-zone-OCR-tuned; CES's Y-coord line grouping is for a different document shape.
- **`estimateGrouping.js`** — BSFQ rarely sees the same quote split across files; the BisTrack export is a single PDF.
- **Tesseract.js lazy-load (10MB)** — BSFQ already loads Tesseract; reusing CES's loader buys nothing.
- **CC-branded copy / `businessProfile.js`** — Creative Concrete templates; obviously irrelevant.
- **PWA service worker** — useful concept but a separate project; don't bundle with this audit.
- **Animated dropzone "card stack" CSS** — visual flair that doesn't match BSFQ's calmer palette.
- **Inline expression calculator (`expression.js`)** — BSFQ doesn't have an editable line-item grid; porting it would be solving a non-problem.
- **Print-export filename helper** — keep on the radar but not first-port material.

Anything in `Creative-Concrete-and-Landscape_Search_2026-04-27_125828/` is marketing/branding research — not source code. Don't try to salvage from there.

---

## 10. Proposed Next Implementation Prompt

> **TASK: Port `moneyNormalizer` from CreativeEstimateStudio into BSFQ.**
>
> **WORKING DIRECTORY:** `C:\Users\beyon\OneDrive\Desktop\BensonStoneFireplaceQuote`
> **READ-ONLY SOURCE:** `C:\Users\beyon\OneDrive\Desktop\CreativeEstimateStudio\src\core\moneyNormalizer.js` and its co-located `.test.js`.
>
> **GOAL:** BSFQ's `bisTrackScanParser.js` extracts totals, balance due, and quotation totals from Tesseract OCR output. OCR routinely produces malformed currency strings (`$6.802.00`, `$7.542.00`, comma/period mix). Port CES's tested money normalizer and wire it in.
>
> **STEPS:**
> 1. Copy `moneyNormalizer.js` and its tests from CES into `BSFQ/src/lib/moneyNormalizer.js` and `BSFQ/src/lib/moneyNormalizer.test.js`. Adjust imports.
> 2. Read `BSFQ/src/lib/bisTrackScanParser.js` and identify every place it parses a currency string into a number (totals, balance, quotation total).
> 3. Replace those parses with `normalizeMoneyValue()` from the new module. Keep the existing `STORE_HINT` / store-address scrub logic untouched.
> 4. Add 3 BisTrack-specific tests (redact customer data — use synthetic fixtures): one for European-separator artifact, one for grand-total comma-period mix, one for OCR'd `O` vs `0` in totals if the existing parser already handles that case.
> 5. Run `npm test`, `npm run lint` (touched files only), `npm run build`. Confirm all tests pass and BSFQ's existing `bisTrackScanParser.test.js` still green.
>
> **CONSTRAINTS:**
> - Do NOT port any other CES module in this pass.
> - Do NOT modify CES.
> - Do NOT auto-apply normalization to fields outside totals — line-item amounts go through a separate path.
> - Friendly error messages preserved.
> - Commit message: `Port CES money normalizer to harden BisTrack OCR totals`. Do not push without confirmation.
>
> **ACCEPTANCE:**
> - `moneyNormalizer.js` lives at `src/lib/`.
> - `bisTrackScanParser.js` consumes it for total fields.
> - Tests pass; lint clean on touched files; production build clean.
> - One report at end: lines changed, tests added, commit hash.

---

*End of audit.*
