# Workbench Reintegration Notes

The current active app is `Fireplace Quote Polish`: upload a BisTrack PDF, review extracted fields, use the Current Setup + Goal Lens review aid, preview the customer proposal, and print/save the result.

The broader sales workbench code is intentionally preserved in the repo. Those files are parked feature inventory, not cleanup debris. Current Setup + Goal Lens is the first feature reintegrated into the stripped active shell.

## Active Reintegration

**Quote Polish (active):**
- `src/components/QuoteSetupLens.jsx`
- `src/lib/currentSetup.js`

The active lens is advisory only. It shows setup confidence, blockers, customer questions, and fields to fill manually. It does not automatically write proposal fields.

**Old Quote Recovery lane (active — commit e5d3644):**
- `src/components/OldQuoteRecovery.jsx` — queue, intake form, detail view, draft panel, activity log
- `src/lib/oldQuoteRecovery.js` — createOldQuoteOpportunity, deriveRecoveryRecommendation, getRecoveryFollowUpDraft, getRecoveryProposalPackage, isSafeActivityForStatus

Accessible via the Quote Recovery tab in the app header. Wires into: opportunities.js (localStorage queue), followUpComposer.js (safe draft generation), opportunityActivity.js (activity log), currentSetup.js (setup blocker evaluation), proposalPackages.js (package routing). No auto-send, no backend, no private data committed.

Upload intake is now review-first: one or many old quote PDFs/images can be OCRed or parsed through `src/lib/recoveryUploadIntake.js`, reviewed in the Quote Recovery lane, and saved into the same recovery queue. Raw extracted text and file bytes are not stored on opportunity records.

**Showroom Display Register lane (active):**
- `src/components/ShowroomDisplayRegister.jsx` — manual add/edit lane, search, filters, local-only empty states
- `src/lib/showroomDisplayRegister.js` — localStorage model, filters, conservative product/display matching helpers

Accessible via the Display Register tab in the app header. It stores manually verified showroom display records only, then lets Quote Polish and Quote Recovery surface safe internal display context such as `On Display: First Floor`, `Display status needs verification`, and `Possible showroom display match`. It does not sync inventory, does not import Drive data, and does not add customer-facing claims by default.

## Parked Modules

- `src/components/CommandCenter.jsx`
- `src/components/IntakePanel.jsx`
- `src/components/ScannedPacketWorkspace.jsx`
- `src/components/BulkOpportunityIntake.jsx`
- `src/components/ReviewStation.jsx`
- `src/components/CurrentSetupPanel.jsx` (legacy full workbench surface; active shell uses `QuoteSetupLens.jsx`)
- `src/components/ProposalPlaybooks.jsx`
- `src/components/ProposalPackagePanel.jsx`
- `src/components/ProposalBuilder.jsx`
- `src/components/ExportPrep.jsx`
- `src/components/OpportunityQueue.jsx`
- `src/components/FollowUpComposer.jsx`
- `src/components/ActivityTimeline.jsx`
- `src/lib/productCatalog.js`
- `src/lib/proposalPlaybooks.js`
- `src/lib/proposalPackages.js`
- `src/lib/opportunities.js`
- `src/lib/followUpComposer.js`
- `src/lib/opportunityActivity.js`
- `src/lib/followUpCadence.js`
- `src/lib/showroomDisplayRegister.js`

## Reintegration Order

1. ~~Proposal Package / Playbook Guidance~~ — wired into Old Quote Recovery lane
2. ~~Opportunity Save / Queue~~ — wired into Old Quote Recovery lane
3. ~~Follow-Up Composer + Activity Timeline~~ — wired into Old Quote Recovery lane
4. ~~Proposal Detail Engine V1~~ - mode selector, category grouping, Investment Breakdown, Estimate Basis, Komfort Zone, Scope, terms, acceptance
5. ~~Showroom Display Register~~ - local manual display records with safe internal quote/recovery context
6. Next: expose Opportunity Queue across both polish and recovery lanes
7. Next: add "Save to Queue" from Quote Polish flow
8. ~~Quote Recovery upload/OCR intake~~ - reuses Quote Polish PDF/OCR parsing for old scanned PDFs/images, supports bulk draft review, and routes reviewed opportunities into the recovery queue

## Pricing / Source Hierarchy

1. Reviewed active quote lines.
2. FP CURRENT PRICE LIST / FP Central Price List for future current-price authority.
3. 2025+ vendor files as supporting references only.
4. 2024 and older files only for history/archive unless Drew or Liam approve otherwise.

## Reintegration Rules

- Keep BisTrack as the source of truth.
- Bring back one lane at a time.
- Attach features to the stripped quote-polish flow instead of rebuilding the old command-board shell.
- Keep private files in `src/data/bistrack-snapshot/` ignored and uncommitted.
- Do not expose cost, buy price, margin, supplier history, rank, OCR uncertainty, fuzzy-match wording, or BisTrack confidence language in customer-facing output.
- Run `npm run lint`, `npm test`, and `npm run build` after each reintegration pass.
