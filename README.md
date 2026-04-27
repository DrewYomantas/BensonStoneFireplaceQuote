# Benson Stone Fireplace Quote Proposal Generator

Local V1 web app for turning messy fireplace quote notes into structured proposal fields that match the approved Benson Stone Canva/PPTX template placeholders.

## What it does

- accepts pasted quote notes
- parses them into the template field contract from `src/data/fieldMap.json`
- keeps missing or unclear fields blank
- applies only the explicit business defaults:
  - `QUOTE_GOOD_FOR = 30 days`
  - `PAYMENT_TERMS = 50% down at time of signing`
  - `DEPOSIT_TERMS = 50% down at time of signing`
- warns when totals do not reconcile
- warns when notes mention a delivery date that should stay out of the customer-facing proposal
- exposes a structured review form for manual cleanup
- outputs flat placeholder lines and exportable JSON
- supports basic print/PDF preview

## What it does not do

- it does not integrate with Canva
- it does not generate designs
- it does not invent products, customer data, prices, tax, totals, or legal terms
- it does not recalculate totals for the user

## Contract source

The parser and form are built around the placeholder contract in:

- [src/data/fieldMap.json](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/fieldMap.json)

The approved editable template that informed the placeholder review is still the external source file in Downloads:

- `C:\Users\beyon\Downloads\MASTER_Benson_Stone_Fireplace_Quote_Proposal_Template_EDITABLE_Canva.pptx`

## Local run

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Sample files

- [src/data/anna-orlinska-notes.txt](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/anna-orlinska-notes.txt)
- [examples/anna-orlinska-output.json](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/examples/anna-orlinska-output.json)

Use the **Load Anna sample** button in the app to load the sample notes.

## Notes on parsing

- labeled lines like `Customer: ...` and `Quote No: ...` map directly
- `Package 1` and `Package 2` sections pull titles, up to four visible line items, liner kit subtotal, and install line
- `Detail Section 1` and `Detail Section 2` expect rows in `item | qty | unit | total` form
- unmatched lines are surfaced for review instead of being silently discarded

## Suggested V2 later

- import from pasted CRM/export text formats
- stronger pattern libraries for Benson Stone note habits
- CSV import/export
- Canva autofill once the field review step is trusted
