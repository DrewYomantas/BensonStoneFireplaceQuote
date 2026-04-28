# Benson Stone Fireplace Quote Proposal Generator

Local web app that takes the official Epicor BisTrack PDF (or pasted notes as a fallback) and turns it into a polished customer-facing proposal/order summary after human review.

## Source of truth

Benson Stone creates the official quote/order in **Epicor BisTrack** — the ERP that handles quoting, order management, inventory/pricing, delivery, customer data, and financials. This app is a **presentation layer after BisTrack**, not a replacement.

Workflow:

1. Create the official quote/order in Epicor BisTrack.
2. Export/save the BisTrack PDF.
3. Upload the PDF into this app (or paste notes as a fallback).
4. Review extracted official values.
5. Generate the polished customer-facing output.

This app never invents customer info, products, prices, tax, totals, or terms. If extraction is unclear, fields stay blank and the app surfaces a warning.

## Department workflow

1. on Step 1, choose **Paste Notes** or **Upload BisTrack PDF**
2. for PDF: select the file — text is extracted, document type is detected, and line items are parsed
3. review warnings, the document-type badge, unmatched lines, and blank required fields
4. edit the structured proposal fields until export blockers are cleared
5. copy the grouped fields or export JSON for recordkeeping
6. preview internally; **Generate Customer PDF** is disabled until a PDF rendering layer is added

## What the app does

- accepts pasted quote notes
- parses them into the placeholder contract in [src/data/fieldMap.json](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/fieldMap.json)
- keeps missing or unclear fields blank
- applies only the explicit business defaults:
  - `QUOTE_GOOD_FOR = 30 days`
  - `PAYMENT_TERMS = 50% down at time of signing`
  - `DEPOSIT_TERMS = 50% down at time of signing`
- flags unmatched lines in a review box instead of discarding them
- lets the user manually assign unmatched lines to fields
- shows export blockers when required fields are blank
- provides grouped copy buttons for customer, quote meta, page 1, page 2, and all fields
- exports JSON for records
- provides a simple internal preview and print/PDF option

## What this app does not do yet

- it does not integrate with Canva
- it does not auto-generate the designed customer proposal
- it does not invent customer names, dates, products, prices, tax, totals, or legal terms
- it does not recalculate totals unless someone explicitly changes them by hand
- it does not replace the official quote system
- it does not produce a polished customer-facing PDF yet

## Template source

The approved editable template that informed the field contract is still the external file in Downloads:

- `C:\Users\beyon\Downloads\MASTER_Benson_Stone_Fireplace_Quote_Proposal_Template_EDITABLE_Canva.pptx`

## Local run

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Sample files

- [src/data/anna-orlinska-notes.txt](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/anna-orlinska-notes.txt)
- [examples/anna-orlinska-output.json](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/examples/anna-orlinska-output.json)

Use **Load Anna sample** only for testing the parser flow.

## Parser checks

Current automated checks cover:

**Notes parser (`src/lib/parser.test.js`)**
- Anna sample exact output
- two-package quote parsing
- delivery date mentioned but excluded
- missing PO number
- total mismatch warning

**Epicor BisTrack PDF parser (`src/lib/biztrackPdfParser.test.js`)**
- quote document type, defaults applied, customer/address/totals/line items extracted
- order/bill document type warning + no quote defaults
- delivery date detected but kept out of customer-facing fields
- fully paid order surfaces info and hides deposit language
- line items round-trip into DETAIL fields
- empty/sparse text raises scanned-PDF warning
- total mismatch warning
- grill/outdoor keyword detection adjusts output label

## Document-type behavior

| Detected type | Customer-facing label | Notes |
|---|---|---|
| Quote / Quotation | Fireplace Project Proposal (or Outdoor Living Proposal) | Defaults apply: 30-day window, 50% deposit |
| Order / Bill | Project Confirmation | No quote-only language; balance-due aware |
| Invoice / Receipt | Order Summary | No deposit language; if fully paid, deposit panel hidden |
| Unknown | Project Summary | Warning surfaced — verify source document |

## Real BisTrack PDF behavior

The parser is tuned against real Epicor BisTrack PDF exports (Order, Quotation, Bill, Invoice, Receipt). What to expect:

- **Embedded-text PDFs** (the normal BisTrack export) parse correctly: document type, number, date, customer ID, terms, PO#, delivery date, taken-by/sales-rep, invoice and delivery addresses, customer phone, line items, and totals (Total Amount, Tax, Order/Quotation Total, Amount Paid, Balance Due).
- **Scanned / image-based PDFs** surface a clear warning ("This Epicor BisTrack PDF looks scanned or image-based — review extracted fields carefully") instead of failing silently. OCR fallback is not implemented in this pass.
- **Column-reordered output**: pdfjs sometimes emits BisTrack line-item columns in a non-row-by-row order (descriptions stacked, then qty/price/total stacked). The parser handles the common case but may miss qty/price pairings on heavily reordered layouts. Codes and descriptions still extract; totals remain authoritative. The mandatory human review step catches anything off.
- **Delivery date** is captured but intentionally excluded from customer-facing fields. An info note is surfaced.
- **Document type** drives output wording: Quotes use proposal language and apply quote-only defaults (30 days, 50% deposit). Orders/Bills/Invoices/Receipts skip those defaults and use "Project Confirmation" or "Order Summary".
- **Fully paid orders** (Balance Due = $0.00, Amount Paid > 0) automatically hide deposit-terms language in the preview.
- **Total mismatch** (Total + Tax ≠ Document Total) raises a warning. The official BisTrack values are never recalculated.
- Human review of every field is mandatory before export.

## Limitations

- PDF text extraction uses `pdfjs-dist`. OCR fallback for scanned PDFs is not implemented.
- Generate Customer PDF is intentionally disabled — next pass needs a PDF rendering layer (e.g., react-pdf or html-to-pdf) wired to the reviewed fields.
- No git remote is configured for this repo.
- Real customer PDFs and CSVs from the Benson Stone Drive are **not committed** to this repo. Tests use sanitized fixtures based on the real layout.

## V3+ roadmap

- generated customer-facing PDF (rendering layer for the reviewed fields)
- OCR fallback for scanned BisTrack PDFs
- CSV/import support
- Canva autofill only after field review is proven reliable
