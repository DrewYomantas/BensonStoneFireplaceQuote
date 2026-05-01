# Workbench Reintegration Notes

The current active app is `Fireplace Quote Polish`: upload a BisTrack PDF, review extracted fields, preview the customer proposal, and print/save the result.

The broader sales workbench code is intentionally preserved in the repo. Those files are parked feature inventory, not cleanup debris.

## Parked Modules

- `src/components/CommandCenter.jsx`
- `src/components/IntakePanel.jsx`
- `src/components/ScannedPacketWorkspace.jsx`
- `src/components/BulkOpportunityIntake.jsx`
- `src/components/ReviewStation.jsx`
- `src/components/CurrentSetupPanel.jsx`
- `src/components/ProposalPlaybooks.jsx`
- `src/components/ProposalPackagePanel.jsx`
- `src/components/ProposalBuilder.jsx`
- `src/components/ExportPrep.jsx`
- `src/components/OpportunityQueue.jsx`
- `src/components/FollowUpComposer.jsx`
- `src/components/ActivityTimeline.jsx`
- `src/lib/productCatalog.js`
- `src/lib/currentSetup.js`
- `src/lib/proposalPlaybooks.js`
- `src/lib/proposalPackages.js`
- `src/lib/opportunities.js`
- `src/lib/followUpComposer.js`
- `src/lib/opportunityActivity.js`
- `src/lib/followUpCadence.js`

## Reintegration Order

1. Current Setup + Goal Lens
2. Proposal Package / Playbook Guidance
3. Opportunity Save / Queue
4. Follow-Up Composer + Activity Timeline

## Reintegration Rules

- Keep BisTrack as the source of truth.
- Bring back one lane at a time.
- Attach features to the stripped quote-polish flow instead of rebuilding the old command-board shell.
- Keep private files in `src/data/bistrack-snapshot/` ignored and uncommitted.
- Do not expose cost, buy price, margin, supplier history, rank, OCR uncertainty, fuzzy-match wording, or BisTrack confidence language in customer-facing output.
- Run `npm run lint`, `npm test`, and `npm run build` after each reintegration pass.
