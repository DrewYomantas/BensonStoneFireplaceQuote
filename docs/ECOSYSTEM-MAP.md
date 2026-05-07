# Benson Stone Fireplace App Ecosystem Map

One-page reference. The fireplace department is **not one app** — it's a small ecosystem with clear roles. This file lives in the BSFQ repo so anyone working on BSFQ understands what *isn't* its job.

## The five pieces

| Piece | Role | Where it lives | Status |
|---|---|---|---|
| **BisTrack** | Official source of truth — every quote, customer, PO, and line item | Benson Stone server (Epicor) | Production. Untouched by this ecosystem. |
| **BSFQ** (this repo) | **Backstage** rep-facing workbench: takes BisTrack output and polishes it into customer-ready proposals, recovers scanned old quotes via OCR, manages opportunity queue and follow-ups | `github.com/DrewYomantas/BensonStoneFireplaceQuote` (canonical local: `C:\Users\beyon\OneDrive\Desktop\BensonStoneFireplaceQuote`) | Active dev |
| **Fireplace Consultation + Customer Intake** | **Onstage** customer-facing tablet experience: guided Discovery → Recommendations → Materials → Capture | Drive: `Fireplace Department App Project/Fireplace Consultation.html` and `Customer Intake Worksheet.html` | Canonical, in showroom use |
| **BensonStoneSiteMap** | Standalone visual showroom/campus navigation (Three.js / r3f) | TBD GitHub repo (currently a Vite project under Drive Work Intake) | Standalone, future |
| **Sales Agent GPT** | Knowledge assistant for the rep — vendor specs, code rules, install pricing, sales playbook | OpenAI Custom GPT, fed by `02-Sales-Agent-Knowledge-Base/` in Drive | Standalone |

## What goes where

- **A real BisTrack quote PDF** → BSFQ (parse, polish, send proposal).
- **A scanned old paper quote** → BSFQ OCR Rescue Mode.
- **A customer in the showroom on a tablet** → Fireplace Consultation.
- **A customer arriving / discovery questions** → Customer Intake Worksheet.
- **"Where in the showroom is X?"** → BensonStoneSiteMap.
- **"What does Heatilator's vent termination spec say?" / "Is Rockford VF allowed?"** → Sales Agent GPT.
- **Anything *official* (price, PO, inventory, install schedule)** → BisTrack. The other tools are presentation, prep, and prospecting layers; they never replace BisTrack.

## What BSFQ is not

- Not a CRM. Opportunity Queue is a personal staging area, not a system of record.
- Not a quote generator. BisTrack writes the quote; BSFQ polishes its output.
- Not the customer-facing tablet. That's Fireplace Consultation.
- Not a price book. Vendor price books are referenced, not stored.

## Related docs

- [CUSTOMER-PIPELINE-IMPORT.md](CUSTOMER-PIPELINE-IMPORT.md) — how the old Customer Pipeline CSV gets ingested into the BSFQ Opportunity Queue.

## Data shared across the ecosystem (planned)

A small JSON catalog — units, brochures, code flags — should eventually live in one place and be read by both BSFQ (proposals) and Fireplace Consultation (recommendations). Today the catalog is duplicated inline in `Fireplace Consultation.html` and BSFQ `productCatalog.js`. Reconciling them is a future merge step (see `APP-ECOSYSTEM-CANONICAL-AUDIT-2026-05-07.md` in `Benson Stone Fireplace Sales/`).

## Build priority (after this rename)

1. Use BSFQ end-to-end on a real BisTrack PDF for one rep day. Note flow breaks.
2. Wire `Customer Pipeline - Import This.csv` into `BulkOpportunityIntake`.
3. Fold the Quote-Generator Canva field map into BSFQ proposal output.
4. Extract the shared units/brochures catalog into JSON.
5. Ship BensonStoneSiteMap as its own repo.
6. Inline-help drawer in BSFQ powered by the Sales Agent knowledge base.
