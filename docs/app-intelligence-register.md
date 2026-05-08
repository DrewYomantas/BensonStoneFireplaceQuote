# Benson Fireplace Sales OS — App Intelligence Register

**Generated:** 2026-05-08
**Scope:** Read-only intelligence sweep of the Fireplace Department Drive folder.
**Output type:** App Intelligence Register — what department knowledge should eventually influence the Sales OS app.
**Authority hierarchy honored:** BisTrack remains source of truth. This register cites Drive as a source library only; nothing in here promotes a Drive file above BisTrack, current price books, or manager approval.

## Sanitization

This is the in-repo copy of the register. Customer names, customer-named folder shapes, credential file paths, raw vendor cost files, supplier net pricing, and OCR/BisTrack confidence language have been redacted relative to the Drive original. The full unredacted register lives in Drive at `Fireplace Department/Benson Fireplace Sales OS — App Intelligence Register.md` and is intentionally not committed.

Implementation forms used below: quick-fill chip, smart default, warning/blocker rule, checklist item, customer-safe explainer, internal-only note, source badge/fact, proposal category, follow-up phrase, do not use.

App areas referenced: **Start Visit**, **Customer File**, **Setup + Goal Lens**, **Quote Review**, **Proposal Prep**, **Follow-Up**, **Smart Context**, **Backstage/Admin**, **Training/Help**.


## A. `00 - START HERE - Benson Fireplace Workspace`

### A1. README - START HERE.md
- **Source:** `00 - START HERE - Benson Fireplace Workspace/README - START HERE.md`
- **Knowledge:** Operating model — Drive is the file/source library; Notion is dashboard and decision log; GitHub/local is app code; M365 is final customer-facing copy. Defines the 00–99 folder taxonomy.
- **App area:** Backstage/Admin, Smart Context.
- **Implementation:** internal-only note (Operating Model in admin); source badge/fact ("Source: Drive `00 - START HERE`").
- **Currentness:** current.
- **Sensitivity:** rep-only.
- **Priority:** use now.

### A2. Cowork Workflow V1.md
- **Source:** `00 - START HERE - Benson Fireplace Workspace/Cowork Workflow V1.md`
- **Knowledge:** First 30 days are Old-Quote Recovery + Follow-Up Ladder. Defines weekly cadence (Mon brief, Wed pulse, Fri decision log, Sat intake routing). Defines the customer follow-up ladder. Names **the four May 2026 Field Rules** (Whisper Flex, ZC gas-insert acknowledgement, Rockford continuous-pilot compliance check, IRTAX install header). Names the Cowork "does/does not" boundary: no automatic customer email, no git pushes without approval, never expose cost/margin/supplier/rank/OCR.
- **App area:** Follow-Up, Quote Review, Proposal Prep, Backstage/Admin, Smart Context.
- **Implementation:** **warning/blocker rule** for all four Field Rules; smart default (follow-up cadence timer per opportunity); proposal category (set order header to IRTAX on installs); checklist item (Whisper Flex on Empire VF logs; ZC gas-insert acknowledgement before final order); internal-only note (cost/margin/OCR exclusion list).
- **Currentness:** current (V1, May 2026).
- **Sensitivity:** rep-only.
- **Priority:** **use now** — the highest-value app intelligence in the entire register, and the source for PR 3.


## B. `01 - Active Department Systems`

### B1. Closing Duties.doc
- **Source:** `01 - Active Department Systems/Closing Duties.doc`
- **Knowledge:** End-of-day department closing checklist.
- **App area:** Backstage/Admin, Training/Help.
- **Implementation:** checklist item (admin-only); reference only.
- **Currentness:** likely current. **Sensitivity:** rep-only. **Priority:** later.

### B2. Operating Systems Tracker / Systems Starter
- **Source:** `01 - Active Department Systems/Trackers/Benson Fireplace Operating Systems Tracker.xlsx` and the Systems Starter workbook in `00 - START HERE`.
- **Knowledge:** Live system inventory of department operations.
- **App area:** Backstage/Admin, Smart Context.
- **Implementation:** internal-only note (system map); seed for admin index.
- **Currentness:** likely current. **Sensitivity:** manager/internal-only. **Priority:** use soon.

## C. `02 - Training & Fireplaces 101`

### C1. Master Knowledge file v2 — spine of the register
- **Source:** `02 - Training & Fireplaces 101/.../Benson_Fireplace_Sales_Agent_Master_Knowledge_v2.md`
- **Knowledge:** The most app-ready document in the department:
  - 5-question discovery starter script (Start Visit).
  - Masonry vs prefab/zero-clearance setup mental model with fast visual clues.
  - Wood / gas / electric path identification and active gas paths (Direct Vent, Vent-Free, Gas Logs, B-vent banned as active).
  - Customer goal map (more heat / more convenience / less mess / better appearance / keep real-wood feel / budgeting only).
  - Inserts overview, common upgrade paths.
  - Benson public brand map and current floor emphasis.
  - Showroom watchouts (display age, discontinued mantels, relays).
  - Key showroom anchor displays.
  - Quote workflow (ballpark vs verified, capture-before-quote checklist, quote-from-the-unit-upward 12 steps).
  - Pricing/discount/margin awareness rules (internal-only) plus customer-safe discount language.
  - Follow-up discipline + 5 follow-up email templates.
  - Red flags table; six agent modes; Drive system priorities; default response patterns.
- **App area:** every area — this file is the spine.
- **Implementation:** quick-fill chip (5 questions, fuel type, masonry vs prefab, customer goal); smart default (default brand emphasis per customer goal); warning/blocker rule (B-vent → route to manager; vent-free address question → route to manager; promise-by-date install timing → block); checklist item (capture-before-quote, quote-from-unit-upward, photos to request); customer-safe explainer (every rule has approved language); follow-up phrase (5 templates, verbatim).
- **Currentness:** current (v2, May 2026). **Sensitivity:** rep-only as a whole; many sections are customer-safe. **Priority:** **use now**.

### C2. Current management-review training packet
- **Source:** `02 - Training & Fireplaces 101/.../Benson_Stone_Fireplace_Sales_Training_Packet_v1.0 CURRENT UNDER MANAGEMENT REVIEW.pdf` (and mirrors).
- **Knowledge:** Current management-reviewed training packet — top of the source hierarchy in C1.
- **App area:** Training/Help, Setup + Goal Lens, Smart Context.
- **Implementation:** customer-safe explainer; source badge/fact ("Per current Benson training packet, May 2026").
- **Currentness:** current. **Sensitivity:** customer-safe. **Priority:** use now.

### C3. NOT CURRENT flagship v4 packet
- **Source:** `02 - Training & Fireplaces 101/.../benson_stone_fireplace_training_packet_flagship_v4 NOT CURRENT.pdf`
- **App area:** Training/Help. **Implementation:** **do not use** as authoritative.
- **Currentness:** outdated. **Priority:** reference only.

### C4. Training v2.1 four-part series, Rodney ride-along notes, Obee quick reference, training visuals
- **Source:** `02 - Training & Fireplaces 101/.../Benson_Stone_Fireplace_Training_v2.1_Tighter_Part_{1..4}.pdf`, `Rodney_Job_Site_Ride_Along_Field_Notes_v2.pdf`, `Benson Fireplace 101 Quick Reference - Obee Cleaned Addendum.pdf`, six training PNGs (Quote From Unit Upward, Masonry vs Prefab, Red Flags, Active Gas Paths, Ballpark vs Verified, Customer Goals and Solutions).
- **App area:** Training/Help, Setup + Goal Lens, Quote Review.
- **Implementation:** customer-safe explainer (visuals are usable customer-side); checklist item (job aids/appendices map to Quote Review).
- **Currentness:** likely current. **Sensitivity:** customer-safe (visuals); rep-only (ride-along notes). **Priority:** use soon (visuals: use now).

### C5. Voice notes (Apr 22 → May 7)
- **Source:** `02 - Training & Fireplaces 101/.../Voice Notes/*.txt`.
- **Knowledge:** Live training conversations; tone/vocabulary reference.
- **App area:** Smart Context, Training/Help, Follow-Up.
- **Implementation:** internal-only note (tone reference); never surface raw transcripts to customers.
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** later.

### C6. Legacy Training Reference
- **Source:** `02 - Training & Fireplaces 101/Legacy Training Reference/*` (Fireplace Dimensions.xls, Prefab Fireplace Size Reference Chart.doc, Vent Free Guide.pdf, EMPIRE.docx, Diameters for Wood Chimney.docx, R-value requirements for sample stoves.xls).
- **App area:** Smart Context, Training/Help. **Implementation:** internal-only note (sanity-check ranges); manufacturer manual always wins.
- **Currentness:** historical/reference. **Priority:** reference only.


## D. `03 - Product Lists, Manuals & Vendor References`

### D1. Vendor priority tiers
- **Source:** `03 - Product Lists, Manuals & Vendor References/.../vendor_findings_summary.md`
- **Knowledge:**
  - **A-priority:** Travis / FPX / Lopi, Kingsman, Empire / American Hearth / White Mountain Hearth, Hargrove, Stone Age, Security Chimneys, Stoll.
  - **B-priority:** Firegear, Dimplex, Modern Flames, Vermont Castings / Forge & Flame.
  - **C-priority (confirm relevance):** Napoleon, Real Fyre / R.H. Peterson, Majestic / Monessen / HHT, DuraVent / Metal-Fab / ICC / Selkirk, Skytech / Dante / Dormont / TracPipe / HY-C / Rutland / Pilgrim / Minuteman.
- **App area:** Setup + Goal Lens, Quote Review, Proposal Prep, Smart Context.
- **Implementation:** **proposal category** (vendor sort order in chip menus); smart default (A-tier surfaces first); source badge/fact (vendor relevance tier).
- **Currentness:** current (May 2026). **Sensitivity:** rep-only. **Priority:** use now.

### D2. Manuals tree
- **Source:** `03 - Product Lists, Manuals & Vendor References/Manuals/<brand>/<model>.pdf` (~120+ PDFs, mostly Travis, Heatilator, Kingsman, Vermont Castings, Jotul, Pellet/Corn, Pipe).
- **App area:** Smart Context, Quote Review, Setup + Goal Lens.
- **Implementation:** source badge/fact (link from product chip → manual file); checklist item (verify venting/clearance against manual). **Internal verification reference only** unless explicitly customer-safe.
- **Currentness:** mixed — treat per-file. **Sensitivity:** rep-only as ingestion source. **Priority:** use soon.

### D3. Travis odor checklist + debris burnoff guide; RMA; Stone Age forms; Security Panorama/Tradition; Tempest Torch; Kingsman log/grill chart
- **Source:** `03 - Product Lists, Manuals & Vendor References/Vendors/...`
- **Implementation:** customer-safe explainer (Travis odor + debris burnoff are great post-install warm-up explainers); checklist item (RMA path); proposal category (Stone Age mantel quoting form).
- **Currentness:** likely current. **Sensitivity:** customer-safe (odor/debris); rep-only (RMA, mantel order forms). **Priority:** use soon.

### D4. R-Value comparison photo (2008)
- **Source:** `03 - Product Lists, Manuals & Vendor References/R-Value and Technical Reference/R-Value comparison photo-5-13-08.pdf`
- **Implementation:** internal-only note; sanity check only.
- **Currentness:** historical/reference. **Priority:** reference only.

### D5. Outdoor Catalog
- **Source:** `03 - Product Lists, Manuals & Vendor References/Manuals/Outdoor Catalog/*` (HPC blank firepits cost doc, Unilock clearance, 2009 Harmony catalog).
- **Implementation:** **do not use** historical pricing; reference for product naming only. Outdoor cost docs are internal cost data — never customer-facing.
- **Currentness:** outdated to historical/reference. **Sensitivity:** rep-only / **do-not-expose** for cost docs. **Priority:** reference only.

## E. `04 - Showroom, Cellar, Displays & Site Maps`

### E1. Site maps and showroom diagrams
- **Source:** `04 - Showroom, Cellar, Displays & Site Maps/.../Scanned_*.pdf` and `Benson Stone fireplace showroom.pdf`.
- **App area:** Setup + Goal Lens (Showroom Mode), Smart Context.
- **Implementation:** customer-safe explainer ("here's the display I'd walk you to"); smart default (anchor display per customer goal); proposal category (display reference photo).
- **Currentness:** current (April 2026 scans). **Sensitivity:** customer-safe. **Priority:** use soon.

### E2. Showroom display photo library
- **Source:** `04 - Showroom, Cellar, Displays & Site Maps/Showroom & Inventory/Pictures/...`
- **App area:** Setup + Goal Lens, Proposal Prep, Smart Context.
- **Implementation:** source badge/fact (display photo on proposal page).
- **Currentness:** current. **Sensitivity:** customer-safe (showroom photos); jobsite photos require homeowner permission before publishing. **Priority:** use soon.

### E3. Layout diagrams (1st floor / Cellar / Grills)
- **Source:** stored under `05 - Sales Tools.../Tags & Signs/TAGS/1st Floor Showroom/Showroom Inventory/Layout - *.docx`.
- **Implementation:** customer-safe explainer (orientation for in-app showroom register).
- **Currentness:** likely current. **Priority:** use soon.


## F. `05 - Sales Tools, Customer Education & Follow-Up`

### F1. Customer Education trio
- **Source:** `05 - Sales Tools, Customer Education & Follow-Up/Customer Education/01 Vocabulary Disambiguator.docx`, `02 Customer Intake Worksheet.docx`, `03 Fuel Type Comparison Card.docx`.
- **Knowledge:** Vocabulary translation, intake worksheet (the worksheet behind the 5-question script), fuel-type tradeoff card.
- **App area:** Start Visit, Customer File, Setup + Goal Lens.
- **Implementation:** **quick-fill chip** (intake worksheet field set is the Customer File baseline schema); customer-safe explainer (Vocabulary Disambiguator powers tooltips); customer-safe explainer (Fuel Type card is the comparison view in Setup + Goal Lens).
- **Currentness:** current. **Sensitivity:** customer-safe. **Priority:** use now.

### F2. Master Knowledge file v1 (mirrored copy)
- **Source:** `05 - Sales Tools, Customer Education & Follow-Up/.../Benson_Stone_Fireplace_Sales_Agent_Master_Knowledge.md`
- **Implementation:** **do not use** as authority — v2 in `02 - Training` supersedes.
- **Currentness:** outdated. **Priority:** reference only.

### F3. Brochures library (~150 PDFs)
- **Source:** `05 - Sales Tools, Customer Education & Follow-Up/Brochures/<brand>/*.pdf`.
- **Implementation:** source badge/fact (brochure attached or linked from product chip); proposal category ("About this fireplace" insert).
- **Currentness:** mixed. **Sensitivity:** customer-safe. **Priority:** use soon.

### F4. Tags & Signs (~100+ docx)
- **Source:** `05 - Sales Tools, Customer Education & Follow-Up/Tags & Signs/.../*.docx`.
- **Implementation:** internal-only note (current promo badge feeds a "current promo" chip — discounts always go through manager approval); proposal category (sale-eligible flag).
- **Currentness:** likely current; some seasonal/historical. **Sensitivity:** rep-only (promo catalog); customer-safe (printed tag). **Priority:** later.

### F5. Job Sheet template
- **Source:** `05 - Sales Tools.../Benson Stone Job Sheet_Edit.docx`.
- **Implementation:** proposal category (job sheet rendering — fields likely overlap the Quote Template Field Map).
- **Currentness:** current. **Sensitivity:** customer-safe (template); rep-only when populated. **Priority:** use soon.

## G. `06 - Quotes, Invoices & Customer Examples`

> Customer files are referenced as folder *shapes* only — no individual customer details reproduced.

### G1. Quote Template Field Map JSON — canonical proposal schema
- **Source:** `06 - Quotes, Invoices & Customer Examples/.../02 - Quote Examples and Proposal References/Benson_Stone_Quote_Template_Field_Map.json`
- **Knowledge:** 8-section proposal data model:
  - **customer:** CUSTOMER_NAME, CUSTOMER_ID, CUSTOMER_PHONE, INVOICE_ADDRESS_LINE_1, INVOICE_CITY_STATE_ZIP, PROJECT_ADDRESS_LINE_1, PROJECT_CITY_STATE_ZIP, PROJECT_PHONE.
  - **quote_meta:** QUOTE_NO, QUOTE_DATE, PROJECT_TITLE, PROJECT_CITY_STATE, PAYMENT_TERMS, PO_NUMBER, QUOTE_GOOD_FOR, TAKEN_BY, SALES_REP.
  - **page_1_project:** PROJECT_OVERVIEW, two PACKAGE blocks each with up to 4 ITEM/PRICE rows + LINER_KIT + INSTALL_NOTE/PRICE; INSTALLATION_SCOPE/TOTAL.
  - **page_2_details:** Two DETAIL sections, up to 9 line items each (qty/unit/total).
  - **investment_and_acceptance:** PROJECT_NOTES, TOTAL_AMOUNT, IR_TAX, QUOTATION_TOTAL, AMOUNT_PAID, BALANCE_DUE, DEPOSIT_TERMS, LEGAL_TERMS.
- **App area:** Proposal Prep, Quote Review, Customer File.
- **Implementation:** **proposal category** (this IS the proposal data model); smart default (IR_TAX field reflects the IRTAX install header rule from Field Rule 4); checklist item (every required field on this map → Quote Review pre-flight).
- **Currentness:** current. **Sensitivity:** rep-only as a schema; customer-safe in the rendered output. **Priority:** **use now**.

### G2. Proposal Generator template (and Canva variant)
- **Source:** `06 .../02 - Quote Examples and Proposal References/Benson Stone Fireplace Quote Proposal Generator.pdf`, `Benson_Stone_Fireplace_Quote_Template_Canva_Upload.pdf`.
- **Implementation:** source badge/fact (template fidelity reference); proposal category (visual style anchor).
- **Currentness:** current. **Sensitivity:** customer-safe (template). **Priority:** use soon.

### G3. Customer Consultation Summary template
- **Source:** `06 .../02 - Quote Examples and Proposal References/Customer Consultation Summary.pdf`.
- **Implementation:** customer-safe explainer; proposal category (post-visit recap pattern).
- **Currentness:** current. **Sensitivity:** customer-safe (when sanitized). **Priority:** use soon.

### G4. Customer Waitlist
- **Source:** `06 .../10 - Needs Drew Review/Customer Waitlist.xlsx`.
- **Implementation:** internal-only note (queue seed for the Opportunity Queue's "needs Drew review" lane); **do not expose customer rows** to customer-facing output.
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** use soon.

### G5. Follow-up packet examples
- **Source:** `06 .../04 - Follow-Up and Customer Communication/follow up quotes.pdf`, `TestFollowUp.pdf`.
- **Implementation:** follow-up phrase (extract phrasing patterns only; do not reproduce customer text).
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** use soon.

### G6. Per-customer folder shape
- **Source:** `06 .../BSC Root Customer Intake - 2026-05-07/Quotes Invoices/Active/<Last, First - City State>/<Last - {Quote|Estimate|Call Note} - {Number} - YYYY-MM-DD>.{pdf|gdoc}`.
- **Implementation:** smart default (Customer File save-path convention follows this naming pattern); checklist item (always include city in folder name).
- **Currentness:** current. **Sensitivity:** rep-only (folder is the customer record). **Priority:** use soon.

### G7. BisTrack screenshots and processed bundle
- **Source:** `06 .../08 - BisTrack Exports and Screenshots/...`
- **Implementation:** internal-only note (training material for Smart Context); **do not expose** raw screenshots or BisTrack-confidence/fuzzy-match language to customers.
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** later.


## H. `07 - Service, Install, Warranty & Claims`

### H1. Install Job Sheet, Service Order Sheet
- **Source:** `07 .../02 - Install Records/Benson Stone Installation Job Sheet.pdf`, `01 - Service Records/Benson Stone Service Order Sheet.pdf`.
- **Implementation:** checklist item (handoff pre-flight — scope, gas/electric/framing responsibility, IRTAX header, photos); proposal category (linked appendix).
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** use soon.

### H2. Installation Letter (customer-facing)
- **Source:** `07 .../02 - Install Records/Benson Stone Fireplace Installation Letter.{docx,pdf}`.
- **Implementation:** customer-safe explainer; follow-up phrase (template).
- **Currentness:** current. **Sensitivity:** customer-safe (template). **Priority:** use soon.

### H3. NFPA 211 section 6
- **Source:** `07 .../01 - Service Records/NFPA 211 section 6.html`.
- **Implementation:** internal-only note (code reference); **do not** quote NFPA verbatim to customers — route code questions to manager.
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** reference only.

### H4. Stoll quality control issues
- **Source:** `07 .../01 - Service Records/Stoll quality control issues.pdf`.
- **Implementation:** **internal-only note** (Stoll QC awareness when adding Stoll line items).
- **Currentness:** likely current. **Sensitivity:** manager/internal-only. **Priority:** use soon.

### H5. Service photo / procedural reference
- **Source:** `07 .../01 - Service Records/...` (R5171 pilot assy, OD42 service call, Big Top Chase cover, Kingsman battery cover, Sigala pilot assembly, Coolwall instructions, Perfect temp cap, Arduino remote 2024.pdf).
- **Implementation:** internal-only note (Service Smart Context).
- **Currentness:** likely current. **Sensitivity:** rep-only. **Priority:** later.

### H6. Customer-named service records
- **Source:** `07 .../01 - Service Records/...` (per-customer files).
- **Implementation:** **do not use** for customer-facing output. Restricted records.
- **Currentness:** current. **Sensitivity:** **do-not-expose**. **Priority:** reference only.

## I. `08 - Marketing & Outreach`

### I1. Marketing intake
- **Source:** `08 - Marketing & Outreach/.../`. Sparse folder.
- **Implementation:** internal-only note (when populated, becomes the source for the customer-outreach calendar).
- **Currentness:** current. **Sensitivity:** rep-only. **Priority:** later.

## J. `09 - Operations, HR & Internal Reference`

### J1. Fireplace Commission Plan + commission_calculator.html
- **Source:** `09 .../Fireplace Commission Plan - 326 (1|2).pdf`, `commission_calculator.html`.
- **Implementation:** **do not expose** to customers or AI tools. Backstage/Admin only.
- **Currentness:** current. **Sensitivity:** **do-not-expose**. **Priority:** reference only.

### J2. Fireplace management duties
- **Source:** `09 .../Fireplace management duties.rtf`.
- **Implementation:** internal-only note. **Sensitivity:** manager/internal-only. **Priority:** reference only.

### J3. Operational issue lists
- **Source:** `09 .../Hold Checks for These Companies.docx`, `Service calls we need help with.pdf`, `Prioritized display changes.pdf`, `Incomplete supplier returns na incomplete transfers.pdf`.
- **Implementation:** internal-only note; "Prioritized display changes" feeds the Showroom Display Register backlog.
- **Currentness:** current. **Sensitivity:** manager/internal-only. **Priority:** later.

### J4. Vendor agreements
- **Source:** `09 .../Weber Master Agreement.pdf`, `Weber Alliance agreement.pdf`.
- **Implementation:** internal-only note; **do not expose** vendor terms to customers.
- **Currentness:** likely current. **Sensitivity:** manager/internal-only. **Priority:** reference only.

### J5. Vendor contractor pricing (e.g. stone vendor 2026)
- **Source:** `09 .../<vendor> 2026 Contractor Pricing.xlsx`.
- **Implementation:** **do not use** in customer-facing output. Cost layer is internal only.
- **Currentness:** current. **Sensitivity:** **do-not-expose**. **Priority:** reference only.

### J6. 2022 Installation Prices (mirrored historical)
- **Source:** `09 .../2022 Installation Prices.xls`.
- **Implementation:** **do not use** as authoritative — current install pricing lives in the dedicated Benson Stone Price Lists folder.
- **Currentness:** outdated. **Priority:** reference only.

### J7. Builder job-info requirements (Internal Policies)
- **Source:** `09 - Operations, HR & Internal Reference/Internal Policies/<builder> Job Info Requirements.doc`.
- **Implementation:** internal-only note; checklist item (builder-job intake).
- **Currentness:** likely current. **Sensitivity:** rep-only. **Priority:** later.

## K. `10 - Apps, Code & AI Projects`

### K1. Pointer folder
- **Source:** `10 - Apps, Code & AI Projects/` (empty in this snapshot). Canonical app code lives in the Fireplace Department App Project parallel folder.
- **Implementation:** internal-only note (canonical app paths shown to admin only).
- **Currentness:** current (pointer). **Sensitivity:** rep-only. **Priority:** later.


## L. Older / parallel folders

### L1. Benson Stone Price Lists (current)
- **Source:** `01 - Price Lists/CURRENT (2024-2026)/Benson Stone Price Lists/` — current install pricing reference plus glass door, hearth board, log set, loft burner pricing.
- **Implementation:** internal-only note (current install pricing source); **do not** expose pricing logic to customers (use customer-safe discount language).
- **Currentness:** current install sheet; older docs in same folder are historical. **Sensitivity:** **do-not-expose** raw cost; rep-only retail prices. **Priority:** use now (current install sheet).

### L2. CURRENT/2022 + 2023 vendor price books
- **Source:** `01 - Price Lists/CURRENT (2024-2026)/2022 Price Lists/` and `.../2023 Price Lists (1)/`.
- **Implementation:** **internal-only note**. Treat as historical unless individually confirmed current. Source badge/fact ("Pricing reference: current vendor price book, verify before quoting").
- **Currentness:** historical/reference for most. **Sensitivity:** manager/internal-only; **do-not-expose** for "Nets"/"Dealer" files. **Priority:** later.

### L3. Older `02 - Vendors/`
- **Source:** Older vendor folder predating `03 - Product Lists, Manuals & Vendor References`.
- **Implementation:** internal-only note. Supplier Quick Contact List + Fireplace Vendors 2023 likely current; rest legacy. Hearth and Home Tech Service and Parts Lookup Emails is useful internal contact intel.
- **Currentness:** mostly historical. **Priority:** reference only; supplier contact list use soon.

### L4. `03 - Showroom & Inventory/Pictures/` husk
- Single misfiled photo. **Implementation:** **do not use**. **Priority:** reference only.

### L5. Older `04 - Service & Installations/`
- **Source:** Valves photo set, Travis & Davinci Service Parts, Chimney Sweep - Service Call Pricing.xlsx, legacy ACCDB files.
- **Implementation:** internal-only note (valve photos + Skytech Valve Training are good Service Smart Context); Chimney Sweep pricing is current service pricing reference. **Do not** wire ACCDB to app.
- **Currentness:** mixed. **Priority:** use soon for valve photos and chimney sweep pricing; reference only for ACCDB.

### L6. Older `07 - Warranty & Claims/`
- **Source:** Vendor warranty PDFs and a large set of customer-named warranty files.
- **Implementation:** customer-safe explainer (vendor warranty terms summarized — never quote PDF verbatim without verification); **do not use** customer-named files for any customer-facing output.
- **Currentness:** vendor warranty PDFs mostly historical. **Sensitivity:** rep-only (vendor terms); **do-not-expose** (customer-named). **Priority:** later.

### L7. Older `08 - Glass Doors & Stoll Orders/`
- **Source:** door sheet template, Diamond W order forms, Dracme website mirror, thermoritedoors.xls, Design Specialties 5-1-21.pdf, heatilator doors.doc, ~30 customer-named PO files.
- **Implementation:** proposal category (Doors / Stoll Mantels per-PO pattern templates only); **do not use** customer-named PO files customer-facing.
- **Currentness:** likely current (template); historical (POs). **Priority:** use soon (templates); reference only (POs).

### L8. Older `09 - Permits & Compliance/`
- **Source:** City of Rockford Electrical Permit 2021.pdf; Apply for Permit Info.docx; **a credential file flagged for password-manager extraction**; Hargrove 2024.xml; TAX Credit IRS Form 5695, FPX Wood Tax Credit Certificate.
- **Implementation:** customer-safe explainer (IRS Form 5695 is a customer-friendly tax-credit reference); source badge/fact (FPX wood tax credit certificate when applicable); the credential file must be moved to a password manager and removed from Drive — **never reference it in app**.
- **Currentness:** mixed. **Sensitivity:** customer-safe (IRS, FPX certificate); **do-not-expose** (credential file). **Priority:** use now (tax credit chip); reference only (permit history).

### L9. Older `10 - Helpful Info & Training/`
- **Source:** mileage.xlsx, mileage service fees 6-9-2017.xlsx, Steel Surcharges and Price Increases 2021 Public file.xlsx, Supplier Quick Contact List.xlsx, Basic Purchasing Guidelines, Shipping & receiving detailed information, Vender info.xlsx.
- **Implementation:** internal-only note; verify mileage rate currency before relying on it.
- **Currentness:** mostly historical. **Priority:** later.

### L10. Older `11 - Customer Quotes & Follow Ups/`
- Husk folder; superseded by `06`. **Priority:** reference only.

### L11. `90 - Intake Review - Recently Uploaded and Unsorted/`
- **Source:** `_ARCHIVE/Builder/Builder/*` (builder specs, mailing lists, 2007 builder list); `Price Lists - Pre-2022 (Kevin Obee Era)/Older Price Lists/Install Pricing.doc`; `EMPLOYEE FORMS/PTO Request.doc`.
- **Implementation:** **do not use** as live data; Kevin Obee era pricing is explicitly historical.
- **Currentness:** historical. **Priority:** reference only.

### L12. `98 - Duplicate Review/.../Benson Stone Fireplace Sales - Planning Docs Duplicates/`
- **Source:** ~26 markdown files: phase-by-phase workspace migration plans, BENSON-FIREPLACE-WORKSPACE-DASHBOARD.md, BENSON-FIREPLACE-WORKSPACE-ARCHITECTURE-PLAN.md, TASKS.md, CLEANUP-COMPLETE.md, picture-deletion staging manifest.
- **Implementation:** internal-only note (governance reference for admin help drawer); source badge/fact (where to read the Drive map).
- **Currentness:** current as a snapshot of the May 7, 2026 reorganization. **Sensitivity:** manager/internal-only. **Priority:** use soon (Dashboard + Architecture); reference only (per-phase docs).

### L13. `99 - Archive - Do Not Delete Yet/`
- Archive — staging only. **Implementation:** **do not use**. **Priority:** reference only.


## Final Report

### 1. Folders reviewed
**Active 00–10:** 00 START HERE, 01 Active Department Systems, 02 Training & Fireplaces 101, 03 Product Lists / Manuals / Vendor References, 04 Showroom / Cellar / Displays / Site Maps, 05 Sales Tools / Customer Education / Follow-Up, 06 Quotes / Invoices / Customer Examples, 07 Service / Install / Warranty / Claims, 08 Marketing & Outreach, 09 Operations / HR / Internal Reference, 10 Apps / Code / AI Projects (pointer-only).

**Older / parallel:** 01 Price Lists (CURRENT 2024-2026 with 2022 + 2023 vendor price books and Benson's own price docs), 02 Vendors (legacy), 03 Showroom & Inventory (husk), 04 Service & Installations (legacy), 07 Warranty & Claims (legacy), 08 Glass Doors & Stoll Orders, 09 Permits & Compliance (incl. credential file flagged for password-manager extraction), 10 Helpful Info & Training (legacy mileage/shipping/purchasing), 11 Customer Quotes & Follow Ups (husk), 90 Intake Review, 98 Duplicate Review (workspace migration plans), 99 Archive.

### 2. Most useful findings (rank-ordered)
1. Master Knowledge file v2 (C1) — spine of the register.
2. Cowork Workflow V1 (A2) — operating cadence + the four Field Rules.
3. Quote Template Field Map JSON (G1) — canonical proposal data model.
4. Customer Education trio (F1) — Vocabulary + intake worksheet + fuel-type comparison.
5. Vendor priority tiering (D1) — A/B/C tier list.
6. README - START HERE + Workspace Dashboard (A1, L12).
7. Six training visuals (C4) — customer-safe diagrams.
8. Showroom anchor displays + site maps (E1, E2).
9. Tighter v2.1 four-part training (C4) — help drawer source.
10. Travis Odor Checklist + Debris Burnoff Guide (D3) — customer-safe post-install explainers.

### 3. Quick-fill chip candidates
- Five discovery questions (C1, F1).
- Fireplace type chips: Masonry, Prefab/Zero-clearance, Insert.
- Fuel type chips: Wood, Gas, Electric, Pellet.
- Gas-path chips: Direct Vent, Vent-Free, Gas Logs (vented), Gas Logs (vent-free), B-vent (auto-flag → manager).
- Customer goal chips: more heat / more convenience / less mess / better appearance / keep real-wood feel / budgeting only.
- Anchor display chips per Master Knowledge §19.
- Brand chips ordered by tier (A → B → C).
- Photo-request chips (opening, surrounding wall, hearth/mantel, chimney/termination, model tag, gas-line location).
- IRTAX chip (auto-set on install orders).

### 4. Blocker / warning rule candidates
- **Field Rule 1 — Whisper Flex required:** Empire / White Mountain Hearth vent-free log line → require Whisper Flex part `T1009898-12` or `T1009898-16`. Hargrove already includes flex (no warning).
- **Field Rule 2 — Gas insert into ZC fireplace:** require explicit acknowledgement that the wood-burner is being permanently disabled.
- **Field Rule 3 — Rockford / Illinois continuous-pilot compliance check:** Rockford project + millivolt / standing-pilot / continuous-pilot product → block-soft until reviewed.
- **Field Rule 4 — IRTAX header on installs:** require `IRTAX` order header on install orders.
- B-vent encountered → block-soft → "Route to manager."
- Vent-free in unknown jurisdiction → block customer-safe answer; route to manager.
- Pricing exception or discount language without manager approval → block.
- Promise install date → soft block.
- Quote-from-the-unit-upward incomplete → warn.
- Setup unverified → force ballpark language.
- Discontinued display match → soft warn.

### 5. Customer-safe explainer candidates
- Masonry vs Prefab/ZC; Wood/Gas/Electric tradeoffs; active gas paths (B-vent abstracted to "we'd route this to our manager").
- Inserts overview; common upgrade paths; ballpark vs verified; why venting matters.
- Five follow-up email templates (Master Knowledge §25).
- Customer-safe discount language ("$___ off the fireplace and venting package"); avoid "X% off across the board."
- Travis odor / debris burnoff post-install explainers.
- IRS Form 5695 + FPX Wood Tax Credit Certificate (when applicable).
- Fireplace Installation Letter and Customer Consultation Summary templates.

### 6. Internal-only guidance
- Cost / margin / supplier net pricing / vendor agreement terms / commission plan / dealer logins — never to customer.
- BisTrack screenshots and processed bundle — internal training material only; never published.
- Customer Waitlist — internal queue only.
- Stoll QC issues PDF — internal awareness only.
- Per-customer warranty/service/PO files in legacy folders — restricted; not for AI ingestion.
- NFPA 211 — internal reference; route customer code questions to manager.
- Margin-aware pricing reasoning — internal only.
- Vendor contractor pricing and remote-control add-on cost sheets — cost layer; internal only.
- Credential .rtf files — must be removed from Drive into a password manager; never referenced in app.

### 7. Outdated / duplicate / reference-only areas
**Outdated (do not use):**
- v4 NOT CURRENT training packet
- v1 of Master Knowledge file (superseded by v2)
- 2022 Installation Prices (superseded by current install sheet)
- Pre-2022 (Kevin Obee Era) price lists in 90 Intake Review
- 99 Archive

**Historical / reference-only (verify before reuse):**
- 2022 + 2023 vendor price books in `01 - Price Lists/CURRENT (2024-2026)/`
- Older `02 - Vendors/` (except Supplier Quick Contact List)
- Older `04 - Service & Installations/` (except current valve set + Skytech training + chimney sweep pricing)
- Older `07 - Warranty & Claims/` (vendor warranties dated; per-customer files restricted)
- Older `09 - Permits & Compliance/` (2021 Rockford permit historical; tax-credit forms current)
- Older `10 - Helpful Info & Training/` (mileage 2017, surcharges 2021)
- `02 - Training & Fireplaces 101/Legacy Training Reference/`

**Husk folders / duplicates:**
- `03 - Showroom & Inventory/` — single misfiled photo
- `11 - Customer Quotes & Follow Ups/` — superseded by `06`
- Duplicate `Work Computer Customer Intake - 2026-05-07 (1)/` folder pending cleanup

### 8. Recommended PR 3 for Claude Code

**Working title:** `feat(field-rules): Liam's May 2026 Field Rules safety layer + IRTAX default`

**Scope (single PR):**
1. Field Rules engine — deterministic ruleset evaluated on every opportunity at three points: when a product line is added, when "Quote Review" is opened, and on "Send Proposal." Source of truth: `00 - START HERE/Cowork Workflow V1.md` §5 (mirrored into a versioned `field-rules.json` in the app repo so the cadence of edits matches the workflow doc).
2. Rule 1 Whisper Flex check — when an Empire / WMH vent-free log line is added, surface a non-dismissible warning until either `T1009898-12` or `T1009898-16` is added; show a customer-safe note line explaining flex is included.
3. Rule 2 ZC gas-insert acknowledgement — when product family = gas insert and existing fireplace type = ZC/prefab, require Drew to tick an acknowledgement panel persisting on the Customer File.
4. Rule 3 Rockford / Illinois continuous-pilot compliance check — read project city/state from the Customer File; block proposal finalization on Rockford + millivolt/standing-pilot with customer-safe phrasing and an internal note pointing to 2024 IL Energy Code R403.13(1). Outside Rockford: surface a soft warning (Winnebago timeline TBD).
5. Rule 4 IRTAX header default — when an opportunity contains install scope, set the order header field to `IRTAX` by default. Map to `IR_TAX` field in the Quote Template Field Map.
6. Backstage panel: "Field Rules — May 2026" — read-only listing of the four rules + version label + link back to `00 - START HERE/Cowork Workflow V1.md` (source of truth).
7. Smart Context badges on opportunity cards: ⚠ Whisper Flex needed / ⚠ ZC ack pending / ⚠ Rockford ignition check / ✓ IRTAX set.
8. Tests — at least one test per rule covering customer-safe phrasing, a regression guard that blocks cost/margin/internal language from leaking, and projection-strips-sensitive-keys coverage.

**Explicitly out of scope:**
- BisTrack writes
- Outlook send automation
- Vendor manual indexing
- Showroom Display Register UI
- Old quote OCR confidence surfacing

**Risk and rollback:**
- All four rules pull from a single config — toggle off any rule without code change if a rule is revised.
- Easy revert: rules collapse to advisory-only by flipping a feature flag.

---

*End of register.*
