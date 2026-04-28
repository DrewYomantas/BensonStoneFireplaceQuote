# Benson Stone Fireplace Quote Proposal Generator

Local web app for turning messy fireplace quote notes into structured proposal fields that match the approved Benson Stone Canva/PPTX template placeholders.

## Department workflow

1. paste quote notes from the working sales/process notes
2. click **Parse / organize**
3. review warnings, unmatched lines, and blank required fields
4. edit the structured proposal fields until export blockers are cleared
5. copy the grouped fields into the Canva template workflow
6. export JSON for recordkeeping

The official quote system is still the source of truth. This app organizes data for proposal assembly, but it does not replace quote approval or pricing review.

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

- Anna sample exact output
- two-package quote parsing
- delivery date mentioned but excluded
- missing PO number
- total mismatch warning

## V3 roadmap

- generated customer-facing PDF
- CSV/import support
- Canva autofill only after field review is proven reliable
