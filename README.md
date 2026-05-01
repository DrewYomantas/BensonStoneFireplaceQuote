# Benson Stone Fireplace Quote Polish

Local web app that takes the official Epicor BisTrack PDF and turns it into a polished customer-facing proposal/order summary after human review.

## Current App State

The active UI is intentionally stripped down for ease of access and use:

1. Upload a BisTrack PDF.
2. Extract embedded text or OCR scanned pages.
3. Review and edit the structured quote fields.
4. Preview the customer-facing proposal.
5. Use the browser print flow to save or print the final PDF.

The broader sales workbench modules are preserved in the repo, but they are not the current active shell. See [docs/workbench-reintegration.md](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/docs/workbench-reintegration.md) for the parked feature inventory and reintegration order.

## Source Of Truth

Benson Stone creates the official quote/order in Epicor BisTrack, the ERP that handles quoting, order management, inventory/pricing, delivery, customer data, and financials. This app is a presentation layer after BisTrack, not a replacement.

Workflow:

1. Create the official quote/order in Epicor BisTrack.
2. Export/save the BisTrack PDF.
3. Upload the PDF into this app.
4. Review extracted official values.
5. Generate the polished customer-facing output.

This app never invents customer info, products, prices, tax, totals, or terms. If extraction is unclear, fields stay blank and the app surfaces a warning.

## Active Department Workflow

1. Click **Upload BisTrack PDF**.
2. Select the official BisTrack PDF.
3. Embedded-text PDFs are parsed directly; scanned/image PDFs run OCR.
4. Review the priority fields first, then open any additional field sections needed.
5. Use **Raw extracted text** to spot-check OCR output when available.
6. Edit the customer-facing proposal fields.
7. Click **Print / Save PDF** to email or print the polished proposal/order summary.

## Customer-Facing PDF

The preview renders an HTML/CSS proposal styled for Benson Stone and uses the browser's Print / Save-as-PDF flow to produce the final file. It reads only the reviewed fields: no reparsing, no invented data.

Output rules:

- Quote / Quotation -> "Fireplace Project Proposal" or "Outdoor Living Proposal" when line items are grills/outdoor. Quote-good-for and deposit terms appear; signature block is included.
- Order / Bill -> "Project Confirmation". Quote-only language is suppressed.
- Invoice / Receipt / outdoor non-quote -> "Order Summary".
- Fully paid orders hide deposit language and show a paid-in-full callout.
- Delivery date stays hidden unless explicitly included by the customer-view options.
- Internal warnings and raw extracted PDF text are never shown on the customer-facing output.

## What The Active App Does

- accepts BisTrack PDF uploads
- extracts embedded PDF text or runs OCR for scanned PDFs
- parses extracted text into the field contract in [src/data/fieldMap.json](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/fieldMap.json)
- keeps missing or unclear fields blank
- applies only the explicit business defaults:
  - `QUOTE_GOOD_FOR = 30 days`
  - `PAYMENT_TERMS = 50% down at time of signing`
  - `DEPOSIT_TERMS = 50% down at time of signing`
- exposes raw extracted text for spot-checking
- lets the user edit reviewed fields directly
- renders a customer-facing proposal preview
- provides a simple print/PDF option

## What This App Does Not Do Yet

- it does not integrate with Canva
- it does not invent customer names, dates, products, prices, tax, totals, or legal terms
- it does not recalculate totals unless someone explicitly changes them by hand
- it does not replace the official quote system
- it does not currently expose the broader workbench shell in the active UI
- it does not bulk-download a ZIP of generated customer PDFs yet

## Parked Workbench Modules

The repo still includes the broader sales workbench prototype files and tests. They are intentionally preserved as parked feature inventory, not deleted:

- product intelligence from the private BisTrack snapshot
- proposal playbooks
- proposal package variants
- current setup and goal lens
- opportunity queue
- bulk opportunity intake
- follow-up composer
- activity timeline
- follow-up cadence

These modules should be reintegrated only after the stripped-down quote polish flow is stable. Customer-facing exports must continue to exclude internal cost, margin, supplier, rank, OCR uncertainty, fuzzy-match, and BisTrack confidence language.

## Private Data Boundary

The app can load processed BisTrack seed files from [src/data/bistrack-snapshot](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/data/bistrack-snapshot) when present locally. That folder contains private/internal data and must stay ignored and uncommitted.

Do not stage or commit:

- `src/data/bistrack-snapshot/`
- real customer/vendor PDFs
- real CSV exports
- private internal reference docs

The committed code must still build without the private seed folder.

## Local Run

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

## GitHub Pages

The GitHub remote is `https://github.com/DrewYomantas/FireplaceDepartmentEmailUpdate.git`.

The Vite base path is `/FireplaceDepartmentEmailUpdate/`.

GitHub Pages deployment is configured in [.github/workflows/deploy.yml](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/.github/workflows/deploy.yml).

Do not push unless explicitly told.

## Important Files

- [src/App.jsx](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/App.jsx) - active stripped-down app shell
- [src/components/CustomerProposal.jsx](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/components/CustomerProposal.jsx) - customer-facing proposal preview
- [src/lib/biztrackPdfParser.js](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/lib/biztrackPdfParser.js) - embedded text BisTrack parser
- [src/lib/pdfTextExtraction.js](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/lib/pdfTextExtraction.js) - PDF text/OCR extraction
- [src/lib/scannedPacketParser.js](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/lib/scannedPacketParser.js) - OCR-tolerant scanned field extraction
- [src/lib/fieldContract.js](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/src/lib/fieldContract.js) - field ordering, labels, required fields, defaults
- [docs/workbench-reintegration.md](C:/Users/beyon/OneDrive/Desktop/BensonStoneFireplaceQuote/docs/workbench-reintegration.md) - preserved workbench feature inventory and reintegration plan

## Current Automated Coverage

The test suite covers:

- real BisTrack embedded-text parser behavior
- scanned/OCR fallback extraction
- customer-facing output labels and safety rules
- parser defaults and total mismatch warnings
- product intelligence safety boundaries
- proposal playbooks and package recommendations
- current setup and goal lens logic
- opportunity queue, bulk intake, follow-up composer, activity timeline, and cadence helpers
- sensitive internal metric exclusion from customer-facing copy and stored local activity

## Known Limitations

- PDF text extraction uses `pdfjs-dist`; scanned-packet OCR uses `tesseract.js` and still requires human review.
- Customer PDF output relies on the browser's print engine. Margins and page breaks may vary slightly across browsers.
- The active UI is intentionally simpler than the preserved workbench modules.
- The build has a known large chunk warning from the PDF/OCR stack.

## Next Product Direction

Polish the stripped-down quote flow first. Reintegrate the broader workbench features later, one lane at a time:

1. Current Setup + Goal Lens
2. Proposal Package / Playbook Guidance
3. Opportunity Save / Queue
4. Follow-Up Composer + Activity Timeline
