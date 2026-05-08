# Benson Stone Fireplace Sales OS — CLAUDE.md

## Commands

```bash
npm run dev       # Dev server
npm run build     # Production build (base: /BensonStoneFireplaceQuote/ — must match the GitHub repo name; update `vite.config.js` base if the repo is renamed)
npm test          # Run all tests (node --test, co-located *.test.js files)
npm run lint      # ESLint
```

Run `npm run lint`, `npm test`, and `npm run build` after each pass.

GitHub Pages deploy workflow was removed in `5d3e5a6` (account billing-locked over an unrelated $0.32 Copilot balance from Feb). Pushes succeed; deploy is dormant. When ready, prefer Netlify drag-deploy of `dist/` over re-adding the Action.

## Source of Truth — Fireplace Department Drive

`Fireplace Department/Fireplace Department/` is the absolute source of truth for this project. It is a direct export from the Benson Stone backend — the real department knowledge base. Use it to inform every feature, field, pricing rule, vendor detail, and customer-facing output.

Key folders:

| Folder | Contents |
|---|---|
| `01 - Price Lists/CURRENT (2024-2026)/FP Central Price List/` | 39 current vendor price list PDFs — the authoritative price book source |
| `01 - Price Lists/CURRENT (2024-2026)/2025 Price Lists/` | Small supplemental folder (6 files only, not the main vendor list) |
| `02 - Vendors/` | Vendor contacts, supplier list, brand mapping |
| `03 - Showroom & Inventory/` | Showroom layout, inventory masters, sale tags |
| `11 - Customer Quotes & Follow Ups/` | Historical customer quotes |

This folder is **local-only and never committed.** Do not reference file paths from it in customer-facing output.

## BisTrack as Source of Truth (for quote data)

This app is a presentation layer on top of Epicor BisTrack. BisTrack creates the official quote/order. This app extracts fields and renders a polished customer-facing proposal — it never invents data.

- Missing or unclear fields stay **blank** — surface a warning instead of guessing.
- Never expose cost, buy price, margin, supplier history, OCR uncertainty, BisTrack confidence language, or fuzzy-match wording in customer-facing output.
- Raw extracted text and file bytes are never stored on opportunity records.

## Current Product Direction (post May 7, 2026 reset)

The active product is the **Benson Fireplace Sales OS** — Drew-only, tablet-first, local-only, Customer File centered, walk-in-first. The next shell is being designed; we are not extending the current `WorkbenchShell` UI. Read these BEFORE making product decisions:

- `docs/BENSON-FIREPLACE-SALES-OS-SPINE.md` — product spine, surfaces, V1 non-negotiables
- `docs/RESET-SALVAGE-MAP.md` — every component/lib classified as keep / reframe / park / delete-later

Treat those docs as more authoritative than the older "Active vs. Parked Modules" inventory below.

## V1.1 Sales OS Shell (active mount)

The mounted product is the V1.1 Sales OS, not WorkbenchShell. Entry: `src/App.jsx` → `AppShell` → one of `src/screens/{TodayScreen,StartVisitScreen,CustomerFilesListScreen,CustomerFileScreen,SetupGoalLensScreen,QuotePrepScreen,BisTrackHandoffScreen,BackstageScreen}.jsx`. Routing is a small `useState` in `App.jsx`. WorkbenchShell is unmounted but its `src/lib/` helpers stay for reuse — do not delete.

- `src/styles/tokens.css` — V1.1 design tokens (paper/stone/ember/state colors, Lora/Raleway/JetBrains type, spacing, radii, shadows, touch targets). No raw hex outside this file.
- `src/styles/app.css` — base reset + shared primitives (cards, badges, source pills, fields, chips, shell, next-bar, save-status). Direction A/B/C utilities from the design canvas were intentionally not copied.
- Fonts loaded once via `<link>` in root `index.html`; `tokens.css` does not `@import` Google Fonts.

### Screens are real React components, not function calls

Render screens as `<TodayScreen ... />`, never `TodayScreen({...})` from inside App. Calling a screen as a function inlines its hooks into App's hook list — switching routes changes hook count and violates rules-of-hooks. Each screen returns `<>{<div className="shell-content">...</div>}{<NextActionBar .../>}</>` so AppShell stays layout-only.

### Storage boot singleton

Sales OS storage is a process-wide singleton in `src/lib/salesOsStorageBoot.js`. Consume via `getSalesOsStorage()`, `getSalesOsSaveState()`, `ensureSalesOsBoot()`. Do not create a second `createSalesOsStorage` in another module — the customer-file mirror is wired here.

### Customer File display projection

Customer File reads must go through `projectCustomerFileForDisplay` (`src/lib/customerFileView.js`) before rendering. It strips sensitive keys (cost, margin, buyPrice, supplierTotal, rawOcr, rawPdf, bistrackConfidence, fuzzyMatchConfidence, ocrConfidence, salesRank, productRank) and whitelists safe customer-file fields. Never render a raw `getCustomerFileDurable` row directly.

### Manager-review threshold is config, not UI

`src/config/managerReview.js` owns the default threshold ($6,000) and reason templates. `<ManagerReviewReasons>` takes `config` as a prop; the threshold and reason set must never be hardcoded inside a screen or component. No reviewer name (e.g. "Liam") in defaults.

### Auto-save on blur — React quirks

- Synthetic `onBlur` listens for `focusout` (bubbles), not native `blur`. When smoke-testing forms via `preview_eval`, dispatch `new FocusEvent('focusout', {bubbles:true})` — `blur` does nothing.
- Reading state from a closure inside `onBlur` runs before the React commit lands — values are stale by one keystroke. Pattern: keep a `valuesRef` updated via `useEffect(() => { valuesRef.current = values }, [values])` and schedule the persist with `Promise.resolve().then(() => persistDraft())`.
- Setting `input.value` via `preview_eval` does not trigger React's onChange; use `preview_fill`, or use the native prototype setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` then dispatch `input`).

### Preview serves built dist

`.claude/launch.json` runs `npm run preview`, which serves `dist/`. After any source change, `npm run build` before smoke-testing — there is no HMR. Vite dev (`npm run dev`) exists but isn't wired into the preview launch config.

### Start Visit draft store

A single record in IndexedDB store `visitSessions` with id `start-visit-draft` (constant `DRAFT_ID` in `src/lib/startVisitDraft.js`). Submit clears the draft and writes a real Customer File via `submitStartVisitDraft` → `saveCustomerFileDurable`. Do not introduce another draft key.

### Field Rules safety layer

Deterministic rule engine for the four May 2026 rules (Whisper Flex, ZC gas-insert ack, Rockford ignition, IRTAX install header). Pure logic; no AI inference.

- `src/config/fieldRules.js` — rule definitions (label, severity, surfaces, internal explanation, customer-safe wording, version label "May 2026"). Single source of truth — never hardcode rule logic in a screen or component.
- `src/lib/fieldRules.js` — `evaluateFieldRules(input)` engine + `projectFileForFieldRules` (sensitive-key strip + safe-input whitelist) + ack patch builders. Every finding has `status: 'triggered' | 'cleared' | 'satisfied' | 'soft-warning'`.
- `src/components/file/FieldRulesCard.jsx` — shared card; mounted on Customer File and Setup + Goal Lens. Same engine output drives both.
- `src/lib/lensFieldRulesInput.js` — overlays an in-progress Lens draft on top of the saved file so rules fire before save.
- `src/lib/zcGasInsertAck.js` — shared helper for Rule 2 acknowledgement. From the Lens it merges the Lens patch into the same durable write so unsaved edits are preserved.
- `src/lib/fieldRulesBadges.js` — projects findings → compact badge labels for Today action cards.
- `src/components/backstage/FieldRulesAdmin.jsx` — read-only Backstage panel listing all four rules + version + source paths.

Rules:
- No customer-safe text may contain cost / margin / supplier / OCR / BisTrack confidence / fuzzy-match wording. The engine refuses to publish a string that violates this (`scrubCustomerSafe`) and tests assert it.
- Acknowledgement state lives on the Customer File: `zcGasInsertAcknowledgedAt`, `zcGasInsertAcknowledgedBy`. Both whitelisted in `customerFileView.js` and `customerFile.js` `stringKeys`.
- Quote Prep durable fields whitelisted on the Customer File (PR 8–10): `quotePrepLines` (array), `quotePrepNotes`, `quotePrepUpdatedAt`, `quotePrepQuoteType`, `quotePrepVerificationOwner`, `quotePrepUnverifiedItems`, `quotePrepNextStep`, `quotePrepGateUpdatedAt`. Add new keys to BOTH `customerFile.js` (stringKeys/arrayKeys) AND `customerFileView.js` SAFE_KEYS or display projection silently drops them.
- New rules go in `src/config/fieldRules.js`; the engine + UI components stay generic.

### Customer Files list + Today recent files

`src/lib/customerFilesList.js` is the canonical projection for any "list of customer files" surface:
- `projectCustomerFilesList(rawFiles)` — sorts most-recently-updated first (falls back through `lensUpdatedAt → visitedAt → createdAt`), strips sensitive keys defensively, builds a `searchHay` string for substring search.
- `searchCustomerFilesList(rows, query)` — case-insensitive substring across name/phone/email/address/discussion.
- `recentCustomerFiles(rawFiles, limit=4)` — same shape, capped to the top N. Used by `TodayScreen`'s "Recent Customer Files" section.

Both `CustomerFilesListScreen` and `TodayScreen` consume from `listCustomerFilesDurable` → these helpers. Do not duplicate the projection elsewhere.

### Quote Prep + Pre-BisTrack Gate + Handoff

The internal prep chain attached to each Customer File. All read-side projections route through the same helpers — do not duplicate gate or readiness logic in JSX.

- `src/lib/quotePrepDraft.js` — proposed line normalization, banned-key strip, source basis (7 values), review status (5 values), review flags (8 values, deduped). `summarizeQuotePrepReview` is the canonical count helper.
- `src/lib/quotePrepGate.js` — `evaluateQuotePrepGate` returns `{ status, label, groups, counts, reasons, fields }`. `projectQuotePrepGateStatus` is the read-only projection used by Customer File status card, Customer Files list pill/filter, and Today recent rows. Reasons are `{ message, action: { label, target, field? } | null }`. Action targets in `REASON_ACTION_TARGETS`: `lens`, `quotePrepLine.add`, `quotePrepLine.review`, `quotePrepGateField`, `fieldRules`. Status `ready` requires customer name + contact + goal + non-unknown setup + chosen quote type + ≥1 `ready_for_bistrack` line + zero `do_not_use_yet` lines + zero triggered Field Rule blockers.
- `src/lib/bisTrackHandoff.js` — `projectBisTrackHandoff(file)` returns the read-only handoff view model. `formatBisTrackHandoffAsText(view)` returns plain text only — no HTML, no Markdown tables, omits empty sections.
- `src/screens/QuotePrepScreen.jsx` — workbench, GateCard editable, action buttons route via `onOpenLens` / `onOpenQuotePrep` or focus quote-type select via ref. No autofill, no auto-review.
- `src/screens/BisTrackHandoffScreen.jsx` — read-only. Copy Handoff button uses `navigator.clipboard.writeText` with a clipboard-blocked fallback textarea.
- `src/lib/customerProposalPreview.js` — `buildCustomerProposalPreview(rawFile)` returns a frozen, scrubbed customer-facing view model. Only lines with `reviewStatus: 'ready_for_bistrack' | 'reviewed_for_prep'` surface in the Detailed Investment Breakdown. Eight `BREAKDOWN_GROUPS` (fireplace-appliance → uncategorized), classified by keyword regex on category + name + description. Customer-safe scrub: banned phrases + extended sensitive terms stripped from every field.
  - `goalSummary` rule: bare slug keys (e.g. `"replace-existing"`) match `/^[a-z0-9]+(-[a-z0-9]+)*$/` and are suppressed. `goalNotes` is also excluded — it carries an internal "Visit type:" prefix. Only free-form human text or a `DESIRED_OUTCOME_LABELS` match surfaces.
- `src/screens/ProposalPreviewScreen.jsx` — read-only internal draft view. Gate warning renders above the proposal document; the document always renders regardless of gate status. "Print / Save PDF" button calls `window.print()` — no data saved, no activity logged, no send flow. Entry points: "Preview Proposal" on `CustomerFileScreen` (QuotePrepStatusCard) and `QuotePrepScreen` (NextActionBar).
  - Print CSS: `data-print-hide` on any element that must not appear in printed output (internal header, gate warning). CSS classes on the proposal document: `proposal-preview-content` (outer wrapper), `proposal-print-doc` (paper card), `proposal-print-section` (each section, break-inside avoid), `proposal-line-item` (each breakdown line, break-inside avoid). `@media print` block lives in `src/styles/app.css`.

Banned phrases — must never appear in any string surfaced through the gate, handoff, list, or Today signal. The helpers' `safe()` scrubs them defensively:
- "ready to send"
- "proposal ready"
- "customer ready"
- "approved"

Use **"Ready to build in BisTrack"** when the gate helper says so — never customer-readiness language. The list filter, Today signal, and handoff all consume `projectQuotePrepGateStatus` so wording stays consistent across surfaces.

Customer-facing copy (proposals, disclaimers, warm recap, goal summary): do not mention BisTrack by name. Use "official Benson Stone quote process" or "Benson Stone quote" instead. The `customerProposalPreview.js` disclaimer was updated in Milestone 18 for this reason.

## Architecture

React + Vite + plain CSS (`src/styles/tokens.css` + `src/styles/app.css`). No Tailwind. No component library. No TypeScript.

- `src/App.jsx` — mounts `<AppShell>` + screen for current route (`today`, `visit`, `filesList`, `files`, `lens`, `quotePrep`, `handoff`, `proposalPreview`, `backstage`). Routing is a small `useState`. Calls `ensureSalesOsBoot()` once on mount.
- `src/components/shell/AppShell.jsx` — layout shell; rail + topbar + `topActions` slot (currently `BackstageBackup`).
- `src/components/WorkbenchShell.jsx` — **legacy, unmounted.** Helpers in `src/lib/` are still reused; do not delete.
- `src/screens/` — one file per route: `TodayScreen`, `StartVisitScreen`, `CustomerFilesListScreen`, `CustomerFileScreen`, `SetupGoalLensScreen`, `QuotePrepScreen`, `BisTrackHandoffScreen`, `ProposalPreviewScreen`, `BackstageScreen`. Each returns `<>{shell-content}{NextActionBar}</>`.
- `src/lib/` — pure logic modules with co-located `.test.js` files
- `src/data/fieldMap.json` — field contract driving parse/render
- `src/data/bistrack-snapshot/` — private BisTrack data, gitignored, never commit
- `src/lib/salesOs*.js` + `src/lib/customerFileDurable.js` — durable Sales OS storage layer (see "Sales OS Storage" below)

## Sales OS Storage

Durable local storage for the next shell lives in IndexedDB, namespace `benson-fireplace-sales-os`, schema version 1.

Layout:
- `src/lib/salesOsStorageSchema.js` — DB name, schema version, store names, sensitive-key scrub
- `src/lib/salesOsStorage.js` — IndexedDB engine + in-memory engine (for tests) + `createSalesOsStorage({ engine })` wrapper. Result shape `{ ok, data } | { ok, error }`.
- `src/lib/salesOsBackup.js` — JSON export/validate/import/summary; replace and merge modes; sensitive keys are scrubbed and rejected.
- `src/lib/salesOsSaveState.js` — observable save state (idle/saving/saved/error) for the storage status widget.
- `src/lib/salesOsMigration.js` — one-shot migrate of legacy localStorage keys; idempotent via `appMeta.salesOsMigration:v1`. Old localStorage keys are NOT deleted.
- `src/lib/customerFileDurable.js` — async customer-file API for new shell code (`saveCustomerFileDurable`, `listCustomerFilesDurable`, etc.).
- `src/components/SalesOsStorageStatus.jsx` — bottom-right widget: "Saved locally · HH:MM" + Backup + Restore buttons. Mounted in `App.jsx`.

Stores: `customerFiles`, `visitSessions`, `quotePrepRecords`, `followUpRecords`, `activityTimeline`, `recoveryQueue`, `appMeta`.

### Customer File dual-write (sync API → IDB mirror)

The legacy synchronous `customerFile.js` API (`saveCustomerFile`, `updateCustomerFile`, `appendCustomerFileItem`, `removeCustomerFile`) writes to localStorage AND fire-and-forget mirrors to IndexedDB. The mirror is wired at boot by `src/lib/salesOsStorageBoot.js` via `setCustomerFileDurableMirror(storage)`. Default outside the browser is null (legacy tests stay deterministic).

Rules:
- New shell code must use `customerFileDurable.js` (async). Reads from there are the source of truth for backup/restore.
- Don't bypass `customerFile.js` mutators in legacy components — the mirror only fires through the public API.
- Tests that exercise the mirror await `_flushCustomerFileDurableMirror()` from `customerFile.js`.
- Backup never includes raw OCR/PDF/cost/margin/buy price/supplier total/sales rank/BisTrack confidence — keys matching `SENSITIVE_KEY_PATTERN` in `salesOsStorageSchema.js` are stripped on export and rejected on validate.

### Migration

`migrateLegacyLocalStorage(storage)` runs once at first boot. It copies:
- `benson-stone-customer-file-v1` → `customerFiles`
- `benson-stone-opportunity-queue-v1` → `quotePrepRecords` (active) or `recoveryQueue` (recovery)
- `benson-stone-opportunity-activities-v1` → `activityTimeline`

`benson-smart-binder-page-index-v1` and `benson-stone-showroom-display-register-v1` are intentionally not migrated (backstage/reference).

## Active vs. Parked Modules

Canonical inventory lives in `docs/RESET-SALVAGE-MAP.md` (post-reset). `docs/workbench-reintegration.md` is older and reflects pre-reset reintegration order. When the two disagree, the salvage map wins.

Hard rule: do not delete parked components/modules in unrelated work. They are preserved inventory for the new shell, not cleanup debris.

## Document Type → Output Label

| BisTrack doc type | Output label |
|---|---|
| Quote / Quotation (non-outdoor) | "Fireplace Project Proposal" |
| Quote / Quotation (outdoor/grill lines) | "Outdoor Living Proposal" |
| Order / Bill | "Project Confirmation" |
| Invoice / Receipt / outdoor non-quote | "Order Summary" |

- Fully paid orders: hide deposit language, show paid-in-full callout.
- Delivery date: hidden unless explicitly included.
- Quote-only language suppressed on Order/Bill/Invoice types.

## Business Defaults (hardcoded)

```
QUOTE_GOOD_FOR = 30 days
PAYMENT_TERMS  = 50% down at time of signing
DEPOSIT_TERMS  = 50% down at time of signing
```

## Pricing Hierarchy

1. Reviewed active BisTrack quote lines (always wins)
2. `01 - Price Lists/CURRENT (2024-2026)/FP Central Price List/` — 39 current vendor PDFs, the Benson-offered pricing authority
3. 2024 and older files — history/archive only unless Drew or Liam approve otherwise

## Code Patterns

- JSON imports require `with { type: 'json' }`: `import data from '../data/foo.json' with { type: 'json' }` — Node 24 enforces this; Vite handles it fine.
- Tests use `import { describe, it } from 'node:test'` + `import assert from 'node:assert/strict'` — no test framework, just Node built-ins.
- `node --test` cannot parse JSX. Components are not unit-tested; their smoke coverage comes from `npm run build`. Test logic in `src/lib/`, not in `src/components/`.
- **New persistent state goes through Sales OS storage** (see "Sales OS Storage" section), not new localStorage keys. The legacy localStorage pattern (`src/lib/showroomDisplayRegister.js`) still applies to existing modules; do not introduce new localStorage keys for Sales OS data.
- Async storage tests use `createMemoryEngine()` from `salesOsStorage.js` so tests stay in `node --test` without `fake-indexeddb`.

## Reintegration Rules

- Keep BisTrack as the quote data source of truth.
- Bring back one lane at a time from parked modules.
- Attach features to the stripped quote-polish flow — do not rebuild the old command-board shell.
- Private files in `src/data/bistrack-snapshot/` and `Fireplace Department/` stay local, never commit.

## Two Scanned-PDF Intake Paths — Keep Them in Sync

Image-only / scanned BisTrack PDFs flow through **two** separate code paths. Any change to OCR, scan classification, or scan→fields merging must touch both:

1. `src/components/WorkbenchShell.jsx` `handleFile` — top-bar "Drop BisTrack PDF" button
2. `src/lib/recoveryUploadIntake.js` `parseRecoveryUploadFile` — Old Quote Recovery upload

Both should call `extractOcrFromPdfForBisTrackScan` → `parseBisTrackScannedQuoteFromZones`, then overlay onto `parsed.fields` with **scan-wins** semantics for scanned BisTrack quotes. `setIfBlank` is wrong here: `extractScannedBisTrackFields` runs `parseBisTrackText` first and fills slots with garbage that blocks the cleaner zone-OCR value.

## OCR / Tesseract Notes

- The Benson Stone store address ("Rockford, IL 61104", "Co Rockford", etc.) frequently bleeds into customer slots — `STORE_HINT` in `bisTrackScanParser.js` and the `STORE_VALUE` scrub in the merge helpers must catch the variants Tesseract actually produces, not just clean strings.
- Per-zone Tesseract `setParameters` may throw on unknown keys in older builds — wrap in try/catch and degrade per-key.
- Real-world scan PDFs are gitignored (private customer data). Validation = `npm test` + `npm run build` + targeted `eslint <changed files>`. No browser preview against real fixtures.

## Pre-existing Lint Debt

Two intentional violations exist; `npm run lint` reports both. Leave alone in unrelated work:
- `src/lib/bisTrackScanParser.js` `buildScannedBisTrackIssues` has an unused `header` parameter — fixing it would change a public function signature.
- `src/lib/customerPipelineCsv.js` `parseCsv` line 24 has an irregular-whitespace character — see the "CSV Parsing — Intentional Lenience" section below for why.

## CSV Parsing — Intentional Lenience

`src/lib/customerPipelineCsv.js` `parseCsv` only enters quote mode when `"` appears at cell start. This is deliberate: Sheets exports unquoted cells with embedded inch marks (`36" DV`) which break strict RFC 4180 parsers. Don't "fix" this without checking the real Drive CSV.
