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

## Rep Login — Never Commit Real SSN

`src/config/initialReps.js` ships with `last4Ssn: 'XXXX'` as a placeholder. Drew replaces this locally with his real last-4 SSN before first run (one-time seeding). **Never commit the real value.** After the reps store is seeded, the real last-4 lives only in IndexedDB — the config file can be reset to `'XXXX'` before any `git add`.

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

The mounted product is the V1.1 Sales OS, not WorkbenchShell. Entry: `src/App.jsx` → `AppShell` → one of `src/screens/{TodayScreen,StartVisitScreen,CustomerFilesListScreen,CustomerFileScreen,SetupGoalLensScreen,QuotePrepScreen,BisTrackHandoffScreen,ProposalPreviewScreen,SingleQuoteIntakeScreen,BulkIntakeScreen,BackstageScreen,HearthStudioSessionDetailScreen}.jsx`. Routing is a small `useState` in `App.jsx`. Routes: `today`, `visit`, `filesList`, `files`, `lens`, `quotePrep`, `handoff`, `proposalPreview`, `addQuote`, `bulkIntake`, `backstage`, `hearthSession`. WorkbenchShell is unmounted but its `src/lib/` helpers stay for reuse — do not delete.

- `src/styles/tokens.css` — V1.1 design tokens (paper/stone/ember/state colors, Lora/Raleway/JetBrains type, spacing, radii, shadows, touch targets). No raw hex outside this file.
- `src/styles/app.css` — base reset + shared primitives (cards, badges, source pills, fields, chips, shell, next-bar, save-status). Direction A/B/C utilities from the design canvas were intentionally not copied.
- Fonts loaded once via `<link>` in root `index.html`; `tokens.css` does not `@import` Google Fonts.

### Rep-login gate (pre-route)

`RepLoginScreen` is **not a route** — it renders in `App.jsx` before the route switch when `useLoggedInRep()` returns no rep (`if (!loggedInRep) return <RepLoginScreen onLogin={login} />`). Once a rep logs in, the rep is persisted in the IDB `reps` store and the route switch takes over. Do not add `repLogin` to the routes list or call `setRoute({ screen: 'repLogin' })`. To force the gate to re-show, clear the logged-in rep via the hook's logout, not by routing.

- `src/screens/RepLoginScreen.jsx` — last-4-SSN entry against reps seeded from `src/config/initialReps.js`
- `src/lib/repStorage.js` — reps store CRUD (durable, IDB)
- `src/lib/useLoggedInRep.js` — hook exposing `{ loggedInRep, login, logout }`

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
- `enrichCustomerFilesListWithHsSessions(rows, allSessions)` — groups flat sessions by `customerFileId`, attaches `hearthStudio: { hasActive, hasCompleted, activeCount, totalCount }` (soft_deleted excluded). Call after `enrichCustomerFilesListWithFollowUps`.
- `filterCustomerFilesListByHs(rows, filter)` — filters by `HS_FILTER_VALUES`: `'all'`, `'hasActive'`, `'hasCompleted'`.

Both `CustomerFilesListScreen` and `TodayScreen` consume from `listCustomerFilesDurable` → these helpers. Do not duplicate the projection elsewhere.

Today's three-section cockpit is derived in `src/lib/todayCockpit.js` (`deriveTodayCockpit`, `deriveOneThing`) — pure logic, no storage access, reuses `recommendFollowUpCadence` for display copy.

`src/lib/visitActivity.js` owns follow-up and activity timeline storage for Customer Files: `saveFollowUpForFile`, `getFollowUpForFile`, `clearFollowUpForFile`, `listAllFollowUps` (used by TodayScreen), `appendActivityForFile`, `listActivityForFile`. `customerFileFollowUpAdapter.js` bridges a Customer File display projection → opportunity shape for `composeFollowUpDraft`.

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

### Smart Context Reference Library

`src/components/SmartContextPanel.jsx` — togglable panel on Customer File. Builds the reference library once via `useState(() => buildReferenceLibrary())` (synchronous — reads localStorage display records + static 39-vendor JSON on mount). Auto-detects via `deriveReferenceMatches({ library, file, lineItems })`; free-text search via `searchReferences(library, query)`.

Key exports from `src/lib/referenceLibrary.js`: `buildReferenceLibrary`, `inferReferenceNeeds`, `searchReferences`, `deriveReferenceMatches`, `describeReferenceForDrawer`.

Hearth Studio sessions surface as Smart Context references (Milestone 26). `buildHearthSessionReference(session, { now })` and `buildHearthSessionReferences(sessions, { limit=3, now })` project a session via `projectHearthStudioSessionForDisplay` (sensitive-key scrub) and label it with chapter/status — `Chapter NN - {CHAPTER_LABELS[n]}`, `Paused at Chapter NN - ...`, or `Completed {relative time} ago`. These references carry `referenceSafety({type:'hearthSession'}) = { tone: 'internal', customerSafe: false }` — internal-only, never rendered into customer-facing output. `SmartContextPanel` reads sessions via `listSessions` from `hearthStudioSessionStorage.js`.

Test isolation: pass `{ displayRecords: [], webReferences: [] }` to `buildReferenceLibrary()` to bypass localStorage in `node --test`.

### Hearth Studio Sessions

`src/lib/hearthStudioSessionStorage.js` — async session lifecycle API. Sessions capture a rep-guided discovery journey (13 chapters, 0–12) for a Customer File.

- `SESSION_STATUS`: `{ active, paused, completed, soft_deleted }`
- `CHAPTER_LABELS`: chapters 0–12 (Setup Type → Next Steps)
- `normalizeSession(input)` — validates and freezes; `chaptersCompleted` filter uses `n != null && Number.isFinite(Number(n))` to exclude null (`Number(null)===0` passes isFinite — explicit null guard required).
- `projectHearthStudioSessionForDisplay(session)` — strips `selections.investment` + `selections.roomContext` before rendering.
- `scrubSessionRecord(record)` — same scrub for backup export (nested keys; used via `scrubStoreRow` in `salesOsBackup.js`).
- Lifecycle ops: `createSession`, `updateSession`, `pauseSession`, `resumeSession`, `completeSession`, `softDeleteSession`, `restoreSession`. Each emits activity via `appendActivityForFile(...).catch(() => {})`.
- `getActiveSessionsForCustomer(storage, customerFileId)` — returns `active` + `paused` sessions only (excludes completed + soft_deleted).
- `visitActivity.js` ACTIVITY_KINDS includes 6 HS kinds: `hearth_session_{created,paused,resumed,completed,soft_deleted,restored}`.

## Architecture

React + Vite + plain CSS (`src/styles/tokens.css` + `src/styles/app.css`). No Tailwind. No component library. No TypeScript.

- `src/App.jsx` — mounts `<AppShell>` + screen for current route (`today`, `visit`, `filesList`, `files`, `lens`, `quotePrep`, `handoff`, `proposalPreview`, `addQuote`, `bulkIntake`, `backstage`, `hearthSession`). Routing is a small `useState`. Calls `ensureSalesOsBoot()` once on mount.
- `src/components/shell/AppShell.jsx` — layout shell; rail + topbar + `topActions` slot (currently `BackstageBackup`).
- `src/components/WorkbenchShell.jsx` — **legacy, unmounted.** Helpers in `src/lib/` are still reused; do not delete.
- `src/screens/` — one file per route: `TodayScreen`, `StartVisitScreen`, `CustomerFilesListScreen`, `CustomerFileScreen`, `SetupGoalLensScreen`, `QuotePrepScreen`, `BisTrackHandoffScreen`, `ProposalPreviewScreen`, `SingleQuoteIntakeScreen`, `BulkIntakeScreen`, `BackstageScreen`, `HearthStudioSessionDetailScreen`. Each returns `<>{shell-content}{NextActionBar}</>`. `RepLoginScreen.jsx` also lives here but is a pre-route gate (see "Rep-login gate" above), not a routed screen.
- `src/lib/` — pure logic modules with co-located `.test.js` files
- `src/data/fieldMap.json` — field contract driving parse/render
- `src/data/bistrack-snapshot/` — private BisTrack data, gitignored, never commit
- `src/lib/salesOs*.js` + `src/lib/customerFileDurable.js` — durable Sales OS storage layer (see "Sales OS Storage" below)

## Sales OS Storage

Durable local storage for the next shell lives in IndexedDB, namespace `benson-fireplace-sales-os`, schema version 3. `SCHEMA_VERSION` is bumped in `salesOsStorageSchema.js`; `onupgradeneeded` auto-creates missing stores from `STORE_LIST` — skip-version migrations (v1→v3, v2→v3) are handled transparently.

Layout:
- `src/lib/salesOsStorageSchema.js` — DB name, schema version, store names, sensitive-key scrub
- `src/lib/salesOsStorage.js` — IndexedDB engine + in-memory engine (for tests) + `createSalesOsStorage({ engine })` wrapper. Result shape `{ ok, data } | { ok, error }`.
- `src/lib/salesOsBackup.js` — JSON export/validate/import/summary; replace and merge modes; sensitive keys are scrubbed and rejected.
  - `scrubStoreRow(store, row)` applies `scrubSensitiveKeys` then `scrubSessionRecord` for the `hearthStudioSessions` store (nested `selections.investment` + `selections.roomContext` require a second pass the top-level scrubber cannot reach).
  - `validateSalesOsBackup` accepts `schemaVersion` in range `[MIN_BACKUP_SCHEMA_VERSION, SCHEMA_VERSION]` (currently 2–3). Backups from schema v1 are rejected (pre-backup release).
- `src/lib/salesOsSaveState.js` — observable save state (idle/saving/saved/error) for the storage status widget.
- `src/lib/salesOsMigration.js` — one-shot migrate of legacy localStorage keys; idempotent via `appMeta.salesOsMigration:v1`. Old localStorage keys are NOT deleted.
- `src/lib/customerFileDurable.js` — async customer-file API for new shell code (`saveCustomerFileDurable`, `listCustomerFilesDurable`, etc.).
- `src/components/SalesOsStorageStatus.jsx` — bottom-right widget: "Saved locally · HH:MM" + Backup + Restore buttons. Mounted in `App.jsx`.

Stores: `customerFiles`, `visitSessions`, `quotePrepRecords`, `followUpRecords`, `activityTimeline`, `recoveryQueue`, `appMeta`, `reps`, `hearthStudioSessions`.

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

## Post-Milestone Workflow

After each milestone: commit → push → update Notion "00 — Current State + Next Build" (page ID `354876ac-bdee-818f-9280-c8d9811c495f`). Update: HEAD commit, test count, ship table row, Next Pass section, bottom "correct as of" line. Google Drive needs no update for code work — it's the vendor/price-list source of truth only.

## Reintegration Rules

- Keep BisTrack as the quote data source of truth.
- Bring back one lane at a time from parked modules.
- Attach features to the stripped quote-polish flow — do not rebuild the old command-board shell.
- Private files in `src/data/bistrack-snapshot/` and `Fireplace Department/` stay local, never commit.

### CSS debt in parked components

Pre-V1.1 components (`FollowUpComposer`, `FollowUpPlanPanel`, etc.) use legacy CSS classes that don't exist in `app.css`: `wb-btn`, `wb-btn--primary`, `wb-pill`, `wb-pill--gold/green`, `ghost-button`, `primary-button`, `follow-up-composer`, `panel-heading`. When reintegrating, swap buttons → `btn btn-primary` / `btn btn-quiet`; swap pills → inline `<span>` with `var(--ember)` / `var(--brass)` background.

## Three Scanned-PDF Intake Paths — Keep Them in Sync

Image-only / scanned BisTrack PDFs flow through **three** separate code paths. Any change to OCR, scan classification, or scan→fields merging must touch all three:

1. `src/components/WorkbenchShell.jsx` `handleFile` — top-bar "Drop BisTrack PDF" button
2. `src/lib/recoveryUploadIntake.js` `parseRecoveryUploadFile` — Old Quote Recovery upload
3. `src/screens/SingleQuoteIntakeScreen.jsx` → `commitSingleQuoteIntakeDraft` in `src/lib/scannedCustomerDraft.js` — daily "Add Quote PDF" intake (`addQuote` route, Milestone 20)

Both should call `extractOcrFromPdfForBisTrackScan` → `parseBisTrackScannedQuoteFromZones`, then overlay onto `parsed.fields` with **scan-wins** semantics for scanned BisTrack quotes. `setIfBlank` is wrong here: `extractScannedBisTrackFields` runs `parseBisTrackText` first and fills slots with garbage that blocks the cleaner zone-OCR value.

## OCR / Tesseract Notes

- The Benson Stone store address ("Rockford, IL 61104", "Co Rockford", etc.) frequently bleeds into customer slots — `STORE_HINT` in `bisTrackScanParser.js` and the `STORE_VALUE` scrub in the merge helpers must catch the variants Tesseract actually produces, not just clean strings.
- Per-zone Tesseract `setParameters` may throw on unknown keys in older builds — wrap in try/catch and degrade per-key.
- Real-world scan PDFs are gitignored (private customer data). Validation = `npm test` + `npm run build` + targeted `eslint <changed files>`. No browser preview against real fixtures.
- `extractOcrPageByPage` (in `pdfTextExtraction.js`) creates one Tesseract worker for the whole file, renders each page to canvas at 2.25×, OCRs it, then sets `canvas.width = 0` to free GPU memory before moving to the next page. Do not skip the canvas discard — 100+ page PDFs will OOM otherwise.
- `bensonQuoteTemplateReader.js` `looksLikeName`: rejects digit-starts, label words (`NAME_REJECT_RE`), store hints, city/state/zip abbreviation lines, and lines ending with a 5-digit zip (catches full state names like "Walworth, Wisconsin 53184" that bypass the 2-letter abbreviation check). `QUOTE_NUM_ZONE_RE` allows "Ouote" as an OCR-noise variant of "Quote" (Q misread as O by Tesseract). `NAME_LABEL_RE` in `scannedCustomerDraft.js` includes `&` in the character class so "Dale & Tiff Linzmayer" extracts whole.
- Tesseract WASM emits `Image too small to scale!!` and `Line cannot be recognized!!` to console on thin/photo regions. These are internal Tesseract errors, not application bugs — do not add error handling for them.
- `scan_imported` must be registered in `ACTIVITY_KINDS` in `visitActivity.js`. If missing, `normalizeActivityEvent` silently returns null and activity records are dropped with no error.

## Pre-existing Lint Debt

Two intentional violations exist; `npm run lint` reports both. Leave alone in unrelated work:
- `src/lib/bisTrackScanParser.js` `buildScannedBisTrackIssues` has an unused `header` parameter — fixing it would change a public function signature.
- `src/lib/customerPipelineCsv.js` `parseCsv` line 24 has an irregular-whitespace character — see the "CSV Parsing — Intentional Lenience" section below for why.

## Single Quote Intake (primary daily path)

`SingleQuoteIntakeScreen` (`addQuote` route) — drop one PDF, preview page 1, edit the auto-extracted customer card, create one Customer File. No queue machinery. Multi-page PDFs surface a calm note pointing to Old Quote Batch Cleanup.

- `buildSingleQuoteIntakePayload` + `commitSingleQuoteIntakeDraft` in `src/lib/scannedCustomerDraft.js` — safe whitelisted payload, sourceLabel "Quote PDF intake", source trail with file name + page numbers + doc type + quote number + page count, appends `scan_imported` activity.
- Entry points: `TodayScreen` "Add Quote PDF" button and `CustomerFilesListScreen`. `SingleQuoteIntakeScreen` links out to Bulk Intake for multi-page packets.

## Bulk Intake — Multi-File Queue (Old Quote Batch Cleanup)

**Off the main path as of Milestone 20.** Reachable from Backstage and from `SingleQuoteIntakeScreen` for multi-page packets. Title is now "Old Quote Batch Cleanup" in the app.

`BulkIntakeScreen` manages a session-only queue of files (CSV, TSV, TXT, PDF). Each item tracks extraction state independently; only one item is active at a time.

- `src/lib/bulkIntakeQueue.js` — pure queue helpers: `QUEUE_STATUS` enum, `createQueueItem`, `updateQueueItem`, `queueItemCountLabel`, `hasUnfinishedItems`. Queue items **never** store File objects, raw bytes, OCR images, or local file paths.
- `src/lib/bulkIntakePageQueue.js` — page item model for multi-page scanned PDFs: `PAGE_STATUS` enum (waiting → ocr-running → needs-cleanup → ready-to-review → draft-built → imported / reference-only / error), `createPageItem`, `updatePageItem`, `pageItemCountLabel`, `detectPageGroupSuggestions` (adjacent-page same_quote / same_customer hints).
- `src/lib/bensonQuoteTemplateReader.js` — zone-based OCR for BisTrack portrait quote pages. Three fixed zones (page-fraction rects): `invoiceAddress` (left 4–34%), `deliveryAddress` (34–62%), `metadata` (right 60–98%). Pure parsers (`parseBensonInvoiceAddressZone`, `parseBensonDeliveryAddressZone`, `parseBensonMetadataZone`, `buildBensonQuoteDraftFromZones`) + browser-only `extractBensonQuoteZoneTexts` that crops and OCRs each zone with the shared Tesseract worker. `BENSON_QUOTE_DOC_TYPES = new Set(['benson_quote'])` in `BulkIntakeScreen.jsx` controls which doc types trigger zone OCR — `firebuilder_quote` is intentionally excluded (different layout; portrait-zone crops extract garbage from its product table).
- Zone OCR fires inside the `onPageComplete` callback (sets `zoneResult`, `scanDraftFields`, `scanDraftWarnings` on the page item). `handleActivatePage` rebuilds the draft from `page.zoneResult.zoneTexts` when the user clicks a page. Quote numbers appear in the page list pill before activation (metadata zone reliable); customer names appear after activation (invoice zone is noisier and validated by `looksLikeName`).
- `src/lib/scanDocTypeDetector.js` — deterministic keyword-only doc type detection. Seven types: `benson_quote`, `service_order`, `firebuilder_quote`, `install_job_sheet`, `field_measure_checklist`, `photo_or_sketch`, `unknown`. `PHOTO_THRESHOLD = 25` non-whitespace chars → `photo_or_sketch`. Rules evaluated in order; `field_measure_checklist` is first so it beats `benson_quote` when both match.
- `src/lib/bulkIntakeOcr.js` — pure OCR quality helpers: `isOcrTextWeak` (true when non-whitespace chars < 80), `ocrPageWarning` (warns when page count > `OCR_PAGE_LIMIT = 8`), `ocrProgressLabel`.
- PDFs: `extractTextFromPdf` first; if `embeddedTextLikelyMissing`, fall through to `extractOcrFromPdf` (Tesseract). Result lands in `item.extractedText` — editable before parse. Weak OCR → `needs-cleanup` status.
- Multi-page scanned PDFs: if `embeddedTextLikelyMissing && pageCount > 1`, switches to `phase: 'pages'` — `extractOcrPageByPage` runs one page at a time, page items stored in `item.pageItems[]`. Each page independently reviewable, importable, or markable reference-only. Page list renders immediately and updates incrementally as OCR completes (`phase === 'pages'` check is before status guards in `renderActiveContent`).
- After each import, `existingFiles` is refreshed from storage so duplicate detection works across files in the same session.
- `selectedIds` is stored as an array on the queue item (not a Set) to avoid Set-in-state issues; converted to a Set via `useMemo` in the screen.

## CSV Parsing — Intentional Lenience

`src/lib/customerPipelineCsv.js` `parseCsv` only enters quote mode when `"` appears at cell start. This is deliberate: Sheets exports unquoted cells with embedded inch marks (`36" DV`) which break strict RFC 4180 parsers. Don't "fix" this without checking the real Drive CSV.
