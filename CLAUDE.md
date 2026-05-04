# Benson Stone Fireplace Quote Polish — CLAUDE.md

## Commands

```bash
npm run dev       # Dev server
npm run build     # Production build (base: /FireplaceDepartmentEmailUpdate/)
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

## Architecture

React + Vite + plain CSS (`src/App.css`). No Tailwind. No component library. No TypeScript.

- `src/App.jsx` — entry point; delegates entirely to `src/components/WorkbenchShell.jsx`
- `src/components/WorkbenchShell.jsx` — main orchestrator; owns all state, the PDF parse pipeline, opportunity queue, and proposal/export flow
- `src/lib/` — pure logic modules with co-located `.test.js` files
- `src/data/fieldMap.json` — field contract driving parse/render
- `src/data/bistrack-snapshot/` — private BisTrack data, gitignored, never commit

## Active vs. Parked Modules

Many components exist but are **parked** (preserved, not rendered in active shell). See `docs/workbench-reintegration.md` for the full inventory and reintegration order.

**Active:**
- `QuoteSetupLens.jsx` + `currentSetup.js` — Current Setup + Goal Lens
- `OldQuoteRecovery.jsx` + `oldQuoteRecovery.js` — Quote Recovery lane (upload, review, queue)
- `ShowroomDisplayPanel.jsx` + `ShowroomDisplayRegister.jsx` — local Showroom Display Register
- `VendorPriceBooks.jsx` + `vendorPriceBooks.js` — Vendors & Price Books tab (39-vendor index, localStorage notes, vendor chip in Quote Polish)
- `CustomerProposal.jsx` — customer-facing proposal preview + print

**Parked (do not remove, do not wire up without explicit intent):**
`CommandCenter`, `IntakePanel`, `ScannedPacketWorkspace`, `BulkOpportunityIntake`, `ReviewStation`, `CurrentSetupPanel`, `ProposalPlaybooks`, `ProposalPackagePanel`, `ProposalBuilder`, `ExportPrep`, `OpportunityQueue`, `FollowUpComposer`, `ActivityTimeline` — and their matching `src/lib/` modules.

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
- localStorage modules follow the pattern in `src/lib/showroomDisplayRegister.js` — storage key constant, get/save/list/sanitize exports, optional storage param for testability.

## Reintegration Rules

- Keep BisTrack as the quote data source of truth.
- Bring back one lane at a time from parked modules.
- Attach features to the stripped quote-polish flow — do not rebuild the old command-board shell.
- Private files in `src/data/bistrack-snapshot/` and `Fireplace Department/` stay local, never commit.
