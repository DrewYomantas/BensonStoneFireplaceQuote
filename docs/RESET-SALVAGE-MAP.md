# Reset Salvage Map

_Companion to `docs/BENSON-FIREPLACE-SALES-OS-SPINE.md`. Classifies the current repo against the May 7 reset spine. **Nothing is deleted in this pass.** Park = leave on disk, do not render in the new shell. Rewrite = the logic stays, but the surface that consumed it changes._

Status legend: **Keep** · **Reframe** · **Park** · **Rewrite** · **Delete-later candidate** · **Needs Drew review**

---

## A. Keep as Core Logic

Pure logic modules with strong test coverage that map cleanly onto the new spine.

| Path | Current purpose | Future role | Status | Risk notes |
|---|---|---|---|---|
| `src/lib/biztrackPdfParser.js` | Parse typed BisTrack PDF text into field map. | Same. Drives Quote / Proposal Prep. | Keep | None. Source-of-truth path. |
| `src/lib/bisTrackScanParser.js` | Zone-OCR parser for scanned BisTrack quotes. | Same. Backstage scanned intake + Quote Prep. | Keep | Two-path duplication noted in CLAUDE.md — keep `WorkbenchShell.handleFile` and `recoveryUploadIntake.parseRecoveryUploadFile` in sync. |
| `src/lib/scannedPacketParser.js` | First-pass field extraction for scanned packets. | Same. Feeds bisTrackScanParser merge. | Keep | Use `scan-wins` semantics, not `setIfBlank`. |
| `src/lib/pdfTextExtraction.js` | PDF text + per-zone OCR (Tesseract). | Same. | Keep | Tesseract `setParameters` quirks documented; preserve try/catch. |
| `src/lib/ocrImagePreprocess.js` | Image preprocessing for OCR. | Same. | Keep | None. |
| `src/lib/parser.js` | Generic parser primitives. | Same. | Keep | None. |
| `src/lib/fieldContract.js` | Field map + labels + multiline list. | Same. Backbone of parse → render contract. | Keep | None. |
| `src/lib/moneyNormalizer.js` | Normalize money strings from OCR. | Same. | Keep | Recently ported; tests cover it. |
| `src/lib/currentSetup.js` | Setup confidence, blockers, customer questions. | **Setup + Goal Lens** core. | Keep | Already advisory-only; matches new product spine. |
| `src/lib/proposalDetail.js` | Estimate basis, line classification, Investment Breakdown. | **Default proposal mode engine** (Detailed Investment Breakdown). | Keep | Default mode in new spine. |
| `src/lib/proposalPackages.js` | Proposal package routing. | Alternate proposal modes (non-default). | Keep | Stays available; not the front door. |
| `src/lib/proposalPlaybooks.js` | Playbook guidance. | Smart Context helper for Quote Prep. | Keep | None. |
| `src/lib/customerFile.js` | Customer File model + storage. | **Central object of the OS.** | Keep | Verify refresh-survival + visible save state contract before V1. |
| `src/lib/customerFileSignals.js` | Derived signals on a Customer File. | Same. Powers Today + Customer File overview. | Keep | None. |
| `src/lib/opportunities.js` | Opportunity localStorage queue + next-action labels. | Reframe as Customer-File-attached quote/visit records. Keep storage primitives. | Keep | See Reframe section. |
| `src/lib/opportunityActivity.js` | Activity log entries. | Same. Powers Customer File timeline. | Keep | None. |
| `src/lib/opportunityBoard.js` | Lane / momentum / severity / source helpers. | Reusable for Today + Customer Files list. UI shell parked. | Keep | The *helpers* are good; the Hearth Board UI that consumed them is the thing being parked. |
| `src/lib/quoteStatusEngine.js` | Derive quote status. | Same. | Keep | None. |
| `src/lib/issueDefinitions.js` | Issue/blocker definitions. | Same. Feeds rep-only assumption review. | Keep | Pre-existing lint debt on `buildScannedBisTrackIssues` — leave alone. |
| `src/lib/followUpCadence.js` | Cadence math. | **Follow-Up** surface core. | Keep | None. |
| `src/lib/followUpComposer.js` | Safe draft generation. | **Follow-Up** composer core. | Keep | No auto-send. |
| `src/lib/followUpPlanner.js` | Plan next follow-up actions. | **Follow-Up** planner core. | Keep | None. |
| `src/lib/quotePolishOpportunity.js` | Build queue draft + merge from polish flow. | Reframe entry point as Customer-File-attached quote. | Keep | See Reframe. |
| `src/lib/opportunityWorkspace.js` | Map opportunity → quote fields. | Same. | Keep | None. |
| `src/lib/customerView.js` | Customer-facing view shaping. | Same. Drives polished proposal. | Keep | Customer-facing safety rules already enforced. |
| `src/lib/recoveryUploadIntake.js` | Bulk OCR intake for recovery lane. | Backstage Tools intake lane. | Keep | Sync with WorkbenchShell handleFile path. |
| `src/lib/oldQuoteRecovery.js` | Recovery queue, recommendation, draft. | Backstage Tools intake lane. | Keep | Demoted from primary surface. |
| `src/lib/customerPipelineCsv.js` | Lenient CSV parser for Sheets exports. | Backstage Tools intake lane. | Keep | Quote-mode lenience is intentional — see CLAUDE.md. |
| `src/lib/showroomDisplayRegister.js` | Local display-record store. | Smart Context lookup + Backstage admin. | Keep | None. |
| `src/lib/vendorPriceBooks.js` | 39-vendor index + localStorage notes. | Smart Context lookup + Backstage admin. | Keep | None. |
| `src/lib/productCatalog.js` | Product reference helpers. | Smart Context reference. | Keep | None. |
| `src/lib/referenceLibrary.js` | Reference content. | Smart Context reference. | Keep | None. |
| `src/lib/customerPacketState.js` | Packet binder state. | Reframe as proposal-prep checklist state OR park. | Needs Drew review | Overlaps with Proposal Prep Checklist concept. |
| `src/lib/binderPageIndex.js` / `binderIndexStorage.js` | Binder page index. | Reference / Smart Context if used; otherwise park. | Needs Drew review | Unclear whether binder concept survives the reset. |
| `src/lib/salesJourney.js` | Stage progression model. | Possibly the “stages of a visit” driver for Today/Visit. | Reframe | Stage names should match new spine, not old shell. |
| `src/lib/guidedPathRules.js` | Guided path rules. | Possibly powers “next best move” surfacing. | Reframe | Verify rules are not tied to old workbench labels. |
| `src/lib/schedulerHandoff.js` | Scheduler handoff data. | Customer File handoff awareness (no automation in V1). | Keep | V1 surfaces awareness, not action. |
| `src/lib/fileOrganizer.js` | Today/duplicates/summary helpers. | Today + Customer Files list helpers. | Keep | UI consumer (`WorkbenchShell` Today panel) is parked. |

## B. Keep but Reframe

Useful, but their role/name in the new spine is different.

| Path | Current role | New role | Status | Risk notes |
|---|---|---|---|---|
| `src/lib/opportunities.js` | "Opportunity" record + queue. | Quote/Visit records hanging off a Customer File. | Reframe | Storage shape is fine; surface naming and entry points change. |
| `src/lib/quotePolishOpportunity.js` | Polish flow → opportunity. | Polish flow → Customer-File-attached quote. | Reframe | Keep; rename when the new shell lands. |
| `src/lib/salesJourney.js` | Generic stage model. | Visit/Customer-File stage driver. | Reframe | Rename stages if they don’t match Start Visit → Setup → Quote → Proposal → Follow-up. |
| `src/lib/guidedPathRules.js` | Guided path rules. | "Next best move" engine for Today + open Customer File. | Reframe | None. |
| `src/components/QuoteSetupLens.jsx` | Setup lens widget inside polish flow. | First-class **Setup + Goal Lens** surface. | Reframe | Visual surface is paper, not workbench. |
| `src/components/CustomerProposal.jsx` | Customer-facing proposal preview + print. | Customer companion proposal output (default: Detailed Investment Breakdown). | Reframe | Must stay paired with original BisTrack PDF attachment. |
| `src/components/VendorPriceBooks.jsx` | Vendors & Price Books tab. | Smart Context popover + Backstage admin. | Reframe | Not a primary surface anymore. |
| `src/components/ShowroomDisplayRegister.jsx` | Display Register tab. | Smart Context popover + Backstage admin. | Reframe | Not a primary surface anymore. |
| `src/components/OldQuoteRecovery.jsx` | Quote Recovery tab (primary). | Backstage Tools intake lane. | Reframe | Demoted, not removed. |
| `src/components/CustomerPipelineImport.jsx` | CSV import tile. | Backstage Tools intake lane. | Reframe | Demoted. |

## C. Park as Legacy UI

Files stay on disk. They do **not** render in the new shell. They are inventory, not active surfaces.

| Path | Why parked |
|---|---|
| `src/components/WorkbenchShell.jsx` | Old shell. Owns too much state and renders the old tab paradigm. The new shell will be a Customer-File-centered surface router, not a tab dashboard. |
| `src/components/AppShell.jsx` | Older shell variant. Park. |
| `src/components/HearthBoard.jsx` | Recent visual addition that went the wrong direction. Helper logic in `opportunityBoard.js` is preserved; this UI consumer is disposable. |
| `src/components/CommandCenter.jsx` | Old command-board paradigm. Conflicts with single-customer focus. |
| `src/components/IntakePanel.jsx` | Old intake. Replaced by **Start Visit** surface. |
| `src/components/ScannedPacketWorkspace.jsx` | Pre-recovery scanned workspace. Park. |
| `src/components/BulkOpportunityIntake.jsx` | Bulk intake table. Backstage candidate at best; not V1. |
| `src/components/ReviewStation.jsx` | Old review surface. Park. |
| `src/components/CurrentSetupPanel.jsx` | Legacy full-workbench setup panel. Replaced by the reframed `QuoteSetupLens.jsx`. |
| `src/components/ProposalPlaybooks.jsx` | Old proposal playbook tab. Logic kept; surface parked. |
| `src/components/ProposalPackagePanel.jsx` | Old package panel. Logic kept; surface parked. |
| `src/components/ProposalBuilder.jsx` | Old builder UI. Park. |
| `src/components/ExportPrep.jsx` | Old export staging. Replaced by Proposal Prep Checklist. |
| `src/components/OpportunityQueue.jsx` | Old list view. |
| `src/components/UnifiedOpportunityQueue.jsx` | Old unified list view. |
| `src/components/OpportunityWorkspace.jsx` | Old per-opp workspace. Will be replaced by Customer File overview. |
| `src/components/IssueResolutionPanel.jsx` | Old assumption-resolution UI. Logic in `issueDefinitions.js` kept; this surface needs a workbench-style replacement. |
| `src/components/ShowroomVisitStart.jsx` | Will be replaced by the new **Start Visit** surface. Useful as reference. |
| `src/components/TakeHomeChecklist.jsx` | Old checklist. May be reframed; park for now. |
| `src/components/SalesJourneyBoard.jsx` | Old journey board UI. Logic in `salesJourney.js` is reusable; this UI is parked. |
| `src/components/BinderIndexPanel.jsx` | Binder concept; needs Drew review before it gets a new role. |
| `src/components/CustomerPacketPanel.jsx` | Packet concept; overlaps with Proposal Prep Checklist. Park pending decision. |
| `src/components/FollowUpPlanPanel.jsx` | Old plan panel. Logic kept; new Follow-Up surface will replace it. |
| `src/components/FollowUpComposer.jsx` | Old composer surface. Logic kept; new Follow-Up composer will replace it. |
| `src/components/ActivityTimeline.jsx` | Old timeline. Reusable component, but the surface that hosts it changes. |
| `src/components/GuidedPathFinder.jsx` | Old guided path UI. Logic kept; surface parked. |
| `src/components/ReferenceBinder.jsx` | Reference reader. Possibly reframable as Smart Context popover. Park for now. |
| `src/components/SchedulerHandoffPanel.jsx` | Old handoff UI. Awareness-only feature in V1. |
| `src/components/ShowroomDisplayPanel.jsx` | Display panel variant. Park (Register is the live surface). |

## D. Backstage Tools

Lives under the **Backstage Tools** surface, not on the primary nav.

| Capability | Files |
|---|---|
| Old quote recovery intake | `src/components/OldQuoteRecovery.jsx`, `src/lib/oldQuoteRecovery.js`, `src/lib/recoveryUploadIntake.js` |
| Customer pipeline CSV import | `src/components/CustomerPipelineImport.jsx`, `src/lib/customerPipelineCsv.js` |
| BisTrack scanned-PDF debug + OCR | `src/lib/pdfTextExtraction.js`, `src/lib/bisTrackScanParser.js`, `src/lib/scannedPacketParser.js`, `src/lib/ocrImagePreprocess.js` |
| Vendor price book admin | `src/components/VendorPriceBooks.jsx`, `src/lib/vendorPriceBooks.js` |
| Showroom display register admin | `src/components/ShowroomDisplayRegister.jsx`, `src/lib/showroomDisplayRegister.js` |
| File organizer / dedupe | `src/lib/fileOrganizer.js` (new minimal Backstage UI required) |
| Backup / export + restore / import | _Not yet built._ Required before V1 daily use. JSON dump of Customer Files, Visits, Proposals, recovery queue. |

## E. Delete-Later Candidates

**Do not delete in this pass.** Listed for future cleanup once the new shell ships and these prove unused.

- `src/components/AppShell.jsx` — old shell variant, never re-entering primary path.
- `src/components/CommandCenter.jsx` — superseded by the new surface model.
- `src/components/UnifiedOpportunityQueue.jsx` — overlaps with `OpportunityQueue.jsx`; only one (or neither) survives.
- `src/components/ShowroomDisplayPanel.jsx` — superseded by `ShowroomDisplayRegister.jsx`.
- `src/components/HearthBoard.jsx` — disposable visual; logic lives in `opportunityBoard.js`.
- `src/components/BulkOpportunityIntake.jsx` — likely not part of a Drew-only V1.

## F. Unknown / Needs Drew Review

| Path | Question for Drew |
|---|---|
| `src/lib/customerPacketState.js` + `src/components/CustomerPacketPanel.jsx` | Does the “customer packet” concept survive, or is it absorbed into the Proposal Prep Checklist? |
| `src/lib/binderPageIndex.js` + `src/lib/binderIndexStorage.js` + `src/components/BinderIndexPanel.jsx` + `src/components/ReferenceBinder.jsx` | Is the “binder” still a thing in the new spine, or is everything that mattered moved into Smart Context? |
| `src/components/TakeHomeChecklist.jsx` | Reframed as part of Proposal Prep Checklist, or retired? |
| `src/components/SchedulerHandoffPanel.jsx` | V1 says scheduling/invoicing awareness only. Is a panel needed, or is the awareness a single line on the Customer File? |
| `src/components/IssueResolutionPanel.jsx` | The assumption/blocker review is still needed in Quote Prep. Reuse this surface, or rebuild with the new workbench look? |
| `src/components/GuidedPathFinder.jsx` | Does this become the “next best move” engine UI for Today, or is that a smaller inline element? |
| `docs/BSFQ-DESIGN-IMPLEMENTATION-HANDOFF.md` | Pre-reset design handoff. Should this be marked superseded by the new spine doc? |
| `docs/DREW-PROJECT-PATTERN-LIBRARY-FOR-BSFQ.md` | Pre-reset pattern library. Same question. |

---

## Cross-cutting Risks Before Implementation

1. **Storage durability gap.** The current app uses localStorage in several places, but there is no app-wide refresh-survival contract, no visible save state, and no export/import. This must land before any rebuild starts feeling like daily-use software.
2. **Two scanned-PDF paths.** `WorkbenchShell.handleFile` and `recoveryUploadIntake.parseRecoveryUploadFile` must continue to be touched together (per CLAUDE.md). Whichever shell replaces `WorkbenchShell`, the same coupling has to be re-established with the new entry point.
3. **Customer-facing safety rules** (no cost / margin / OCR confidence / fuzzy match leakage) currently live partly in `customerView.js` and partly in convention. These need to be enforced at the proposal-render boundary in the new shell, not trusted by callers.
4. **Hearth Board CSS / styles** are entangled in `App.css`. Parking the component does not automatically remove style rules; the next implementation pass should isolate `hearth-*` styles before introducing the new design system, to avoid cross-bleed.
5. **Pre-existing lint debt** on `buildScannedBisTrackIssues` (unused `header` param) is intentional — do not “fix” it during the rebuild.
