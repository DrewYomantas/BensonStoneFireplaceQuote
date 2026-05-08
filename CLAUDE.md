# Benson Stone Fireplace Quote Polish — CLAUDE.md

## Commands

```bash
npm run dev       # Dev server
npm run build     # Production build (base: /BensonStoneFireplaceQuote/ — must match the GitHub repo name; update `vite.config.js` base if the repo is renamed)
npm test          # Run all tests (node --test, co-located *.test.js files)
npm run lint      # ESLint
```

Run `npm run lint`, `npm test`, and `npm run build` after each pass.

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

## Architecture

React + Vite + plain CSS (`src/App.css`). No Tailwind. No component library. No TypeScript.

- `src/App.jsx` — mounts `WorkbenchShell` (legacy shell) + `SalesOsStorageStatus` (durable storage widget)
- `src/components/WorkbenchShell.jsx` — main orchestrator; owns all state, the PDF parse pipeline, opportunity queue, and proposal/export flow
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

The legacy synchronous `customerFile.js` API (`saveCustomerFile`, `updateCustomerFile`, `appendCustomerFileItem`, `removeCustomerFile`) writes to localStorage AND fire-and-forget mirrors to IndexedDB. The mirror is wired at boot by `SalesOsStorageStatus` via `setCustomerFileDurableMirror(storage)`. Default outside the browser is null (legacy tests stay deterministic).

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

`src/lib/bisTrackScanParser.js` `buildScannedBisTrackIssues` has an unused `header` parameter that ESLint flags. Leave it alone in unrelated work — fixing it would change a public function signature.

## CSV Parsing — Intentional Lenience

`src/lib/customerPipelineCsv.js` `parseCsv` only enters quote mode when `"` appears at cell start. This is deliberate: Sheets exports unquoted cells with embedded inch marks (`36" DV`) which break strict RFC 4180 parsers. Don't "fix" this without checking the real Drive CSV.
