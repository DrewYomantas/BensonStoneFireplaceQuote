# Drew Project Pattern Library for BSFQ

> **Purpose.** Read-only audit of Drew's adjacent projects. Goal: identify reusable patterns and design ideas to inform BSFQ before the Hybrid Hearth Workbench design handoff. Not a merge plan, not a code-copy pass. **Patterns and inspirations only.**

## 1. Executive Summary

**Most reusable patterns**
- **CLARION**: deterministic approval queue with batch state machine — exact blueprint for a BSFQ "Review Gate" surface (recovery quotes, OCR mismatches, proposals awaiting human sign-off).
- **RECALLFLOW**: priority/momentum scoring + `deriveNextAction(lead)` engine + `LeadDetailPage` template + `NotesTimeline` — the cleanest "lead/customer detail with next move" pattern in Drew's stack.
- **SITELYNC**: customer-facing `EstimateView` with magic-link routing + `PasteBridge` paste-→-review intake — directly translates to a BSFQ customer-facing proposal portal and a faster "rough notes → opportunity" intake.
- **Sales Studio HTML** (`Fireplace Consultation.html`): code-flag warning system (Rockford VF, ZC retrofit, vent-free) and the Discovery→Recommendations→Materials→Capture sequence — the closest existing model for fireplace-specific guided rules.
- **CreativeEstimateStudio** (already audited): money normalizer ported. Row classifier and text cleaner remain on deck.

**Best source projects for BSFQ**
1. RECALLFLOW (CRM + scoring + timeline) — *the highest signal-to-noise per LOC*.
2. CLARION (approval queue + structured brief PDF).
3. SITELYNC (customer-facing portal + paste intake + design tokens).
4. Fireplace Consultation HTML (domain rules; not stack, just logic).
5. CreativeEstimateStudio (already harvested for parsing; UI patterns remain reference).

**Should influence design handoff**
- Hybrid Hearth Workbench's *graphite vs. paper* split aligns with what already works elsewhere: graphite = CLARION queue / RECALLFLOW priority engine / BSFQ recovery; paper = SITELYNC EstimateView / Sales Studio capture.
- "Card layout, not table" is universal in Drew's stronger projects. Spreadsheet views are absent in CLARION/RECALLFLOW/SITELYNC by deliberate choice.
- A *Today / Hearth Board* pattern shows up in two places (RECALLFLOW `TodayPage`, AfterHours actionable queue). It's the single most reusable shape across Drew's work.

**Should NOT be ported**
- AfterHours's auto-SMS/Twilio outreach engine. BSFQ is backstage, not outreach.
- CLARION's compliance/governance language (audience-specific to law firms).
- DrewBusinessOps's Notion command-center as code (Notion-only artifact).
- SITELYNC's contractor pricing model (concrete-specific; BisTrack owns price for BSFQ).
- BensonStoneSiteMap as embedded UI (keep as standalone repo per `ECOSYSTEM-MAP.md`; only borrow the entity-registry shape).

---

## 2. Core BSFQ Pattern

> **Messy input → extraction/parsing → review gate → visual workbench → customer-ready output → follow-up/memory.**

This is the same pipeline in every Drew project that works:

| Stage | BSFQ today | RECALLFLOW | CLARION | SITELYNC | Sales Studio HTML |
|---|---|---|---|---|---|
| **Messy input** | BisTrack PDF, scanned quote, CSV | inbound voicemail/SMS | client feedback intake | contractor paste-notes / OCR | tablet-driven Q&A |
| **Extract / parse** | `bisTrackScanParser`, `pdfTextExtraction`, `customerPipelineCsv` | `leadTypeInference.js` | brief generator (backend) | `parsePasteInput.js`, OCR | discovery state machine |
| **Review gate** | (gap — partial via `RecoveryUploadReview`) | priority chips, contact attempts | `ApprovalQueuePage` w/ batch | PasteBridge two-phase confirm | (none — capture is final) |
| **Visual workbench** | `WorkbenchShell` + recovery views | `TodayPage` + `LeadDetailPage` | dashboard + brief + queue | AdminView | section-by-section UI |
| **Customer-ready output** | `CustomerProposal.jsx` + print | (n/a — internal) | `GovernanceBriefCard` PDF | `EstimateView` magic-link | print/email-to-self |
| **Follow-up / memory** | `followUpCadence`, opportunity queue | `actionQueue.deriveNextAction` | reminders / snooze | (n/a) | (n/a) |

The pipeline already exists in BSFQ. **Where it's underdeveloped**: the *review gate* and the *next-move* surfaces. Other projects show the cleanest implementations.

---

## 3. Source Projects Inspected

| Project | Path | Stack | Status | Relevant BSFQ patterns | Notes |
|---|---|---|---|---|---|
| **CLARION** | `Desktop/CLARION` | React 18 + TS + Vite + Tailwind + Radix; Flask + ReportLab backend | Active product, deployed | Approval queue, batch state machine, structured brief, badge/chip system | TS-heavy; port logic patterns, not code |
| **RECALLFLOW** | `Desktop/RECALLFLOW/Recall-Flow-main` | React 19 + TS + Vite + Tailwind; Express + SQLite | Prototype, not deployed | Priority scoring, `deriveNextAction`, lead detail template, notes timeline, momentum badges, today view | Cleanest CRM pattern in Drew's stack |
| **SITELYNC** | `Desktop/SITELYNC/sitelync-app` | React 19 + Vite + Tailwind 4; JSONBin persistence; Express OCR sidecar | Active dev (M1–M9 shipped) | Customer-facing `EstimateView`, magic links, `PasteBridge` paste-→-review, design tokens, contractor config, white-label | Tailwind-only — BSFQ uses plain CSS, port intent not classes |
| **BensonStoneSiteMap** | `Desktop/BensonStoneSiteMap` | r3f + Three.js + Vite + TS | Standalone, future | Entity registry shape (buildings, yards, doors), hotspot resolution, route presets | Per `ECOSYSTEM-MAP.md` keep separate; reference shape only |
| **Fireplace Consultation HTML** | `Desktop/Benson Stone Fireplace Sales/Fireplace Consultation.html` | Vanilla HTML + JS, single file, localStorage | Canonical, in showroom use | Discovery→Recommendations→Materials→Capture, code-flag warnings, size estimator, ~80-SKU embedded catalog | Onstage tablet artifact; don't fold into BSFQ — share data layer instead |
| **Customer Intake Worksheet HTML** | `Desktop/Benson Stone Fireplace Sales/Customer Intake Worksheet.html` | Vanilla HTML + JS | Canonical, in showroom use | 5-section progress flow, print/email | Same — sibling onstage artifact |
| **DrewBusinessOps** | `Desktop/DrewBusinessOps` | Markdown + Notion-backed | Operations log, no UI | GTM Command Layer concept, Cowork delegation guardrails, follow-up cadence taxonomy | Inspiration only — no portable code |
| **AfterHours lead recovery kit** | `Desktop/afterhours-lead-recovery-kit` | Flask + SQLAlchemy + Twilio + Jinja | Prototype | Status pipeline (new/contacted/qualified/closed/lost), actionable queue filter, message threading per record | **Outreach logic** is deliberately out of scope for BSFQ; lift architecture only |
| **CreativeEstimateStudio** | `Desktop/CreativeEstimateStudio` | React 19 + Vite + plain CSS | Active production v0.1 | Already audited — see [CREATIVE-CONCRETE-SALVAGE-AUDIT.md](CREATIVE-CONCRETE-SALVAGE-AUDIT.md). Money normalizer ported in commit `49f64ec`. Row classifier + text cleaner remain on deck. | |

**Inaccessible / N/A**: "Copperline" mentioned in the audit prompt does not exist as a Desktop folder. Closest equivalents found: DrewBusinessOps (ops command-layer concept) and AfterHours (operator dashboard). Notion-only artifacts not inspected.

---

## 4. Pattern Inventory

### 4.1 Operator command center (Today / Hearth Board)
- **Origin**: RECALLFLOW `TodayPage.tsx`; AfterHours `ui/dashboard.py`
- **What**: queue-shaped dashboard partitioned by urgency. RECALLFLOW groups leads as overdue / due-today / scheduled / none. AfterHours filters `status IN ('new','contacted')` with last-touch timestamp.
- **BSFQ equivalent**: `WorkbenchShell` `mode === 'today'` block + `OpportunityQueue.jsx`. Today block exists but is shallow.
- **Port**: **now (Hearth Board v1)**. Replace flat opportunity list with priority-grouped queue.
- **Risk**: low — additive composition over existing `opportunities.js`.

### 4.2 Pipeline board / opportunity cards
- **Origin**: RECALLFLOW `LeadDetailPage.tsx` + status/momentum badges in `ui.tsx`; CLARION `ActionCard.tsx` / `DashboardCard.tsx` / `SignalCard.tsx`
- **What**: card-row rendering, not tables. Status pill + momentum pill + insight chips + quick-action buttons (call/email/note/schedule). Selectable for batch.
- **BSFQ equivalent**: `OpportunityQueue.jsx` `QueueCard` (already card-shaped — good). Missing: momentum, insight chips, batch select.
- **Port**: **now**. Add momentum + insight chips; defer batch select.
- **Risk**: low.

### 4.3 Human review / approval gate
- **Origin**: CLARION `ApprovalQueuePage.tsx` + `approvalQueueService.ts` (`QueueItemStatus = pending|approved|released|held|rejected`, `RiskLevel`, `batchAction(action, ids)`)
- **What**: deterministic state machine with batch actions. Detail panel shows summary + recommended_action + risk + notes + expandable raw payload. `TYPE_META`/`STATUS_META`/`RISK_META` constants embed icons + colors.
- **BSFQ equivalent**: `RecoveryUploadReview` is the only review-gate today and it's per-record, no batch, no risk taxonomy.
- **Port**: **later**. Adopt the state-machine + RISK_META taxonomy first; batch actions when bulk recovery becomes routine.
- **Risk**: medium — easy to over-design.

### 4.4 Next-best-action engine
- **Origin**: RECALLFLOW `server/lib/priority.js` + `server/lib/actionQueue.js` (`deriveNextAction(lead, priority)`)
- **What**: pure-function scoring with thresholds (≥40 high, ≥20 medium); momentum states hot/warm/cooling/cold; reasons array surfaced as chips. `deriveNextAction` returns a deterministic suggestion ("Close" / "Overdue follow-up" / etc.).
- **BSFQ equivalent**: `quoteStatusEngine.js`, `getOpportunityNextActionLabel` (in `opportunities.js`), `followUpPlanner.js`. Logic exists but is scattered; no unified scoring vector.
- **Port**: **later** (after Hearth Board v1). Consolidate into `src/lib/opportunityScoring.js`.
- **Risk**: medium — existing engines must keep producing the labels they produce today.

### 4.5 Lead/customer timeline
- **Origin**: RECALLFLOW `NotesTimeline` inside `LeadDetailPage.tsx`
- **What**: chronological event list. Compose form on top, dated cards below, optional delete. Auto-dismiss "just-created" banner with missing-info warnings.
- **BSFQ equivalent**: `ActivityTimeline.jsx` (parked) + `opportunityActivity.js` (live). Activity lib is ready; the parked component needs reactivation.
- **Port**: **now**. Reactivate `ActivityTimeline` inside `OpportunityWorkspace.jsx` and use the RECALLFLOW visual rhythm (compose-on-top, dated cards below).
- **Risk**: low — wiring up something that already exists.

### 4.6 Quote/opportunity scoring
- **Origin**: RECALLFLOW `priority.js`; CLARION `RiskLevel` enum
- **What**: numeric score → bucket → reasons array → momentum.
- **BSFQ equivalent**: closest is `getOpportunityReadinessBadge` + status filters. Score is implicit, not numeric.
- **Port**: **later**. Make the existing readiness signal numeric so it can sort the Hearth Board.
- **Risk**: medium — must not change visible labels suddenly.

### 4.7 Structured brief / proposal output
- **Origin**: CLARION `GovernanceBriefCard.tsx` + ReportLab backend; SITELYNC `EstimateView.jsx`; CES `ProposalDocument.jsx`
- **What**: multi-section formatted document. Section ordering matters; snapshot cards summarize numbers; print CSS hides admin chrome.
- **BSFQ equivalent**: `CustomerProposal.jsx`. Already in good shape; can borrow snapshot-card discipline from CES + section-order discipline from CLARION.
- **Port**: **reference**. Grade `CustomerProposal.jsx` against CES three-page layout next time it gets a pass.
- **Risk**: low.

### 4.8 Messy input / OCR recovery
- **Origin**: CES (already ported `moneyNormalizer`); SITELYNC `parsePasteInput.js` + OCR sidecar
- **What**: deterministic-only parsing, no AI. SITELYNC's PasteBridge gives a two-phase contract: paste → review → import.
- **BSFQ equivalent**: `bisTrackScanParser.js`, `recoveryUploadIntake.js`, `customerPipelineCsv.js`. Strong on extraction, weaker on the "two-phase confirm" flow.
- **Port**: **later**. Borrow the PasteBridge confirm pattern as `RecoveryUploadReview`'s editing rhythm.
- **Risk**: low.

### 4.9 Multi-touch follow-up
- **Origin**: AfterHours status pipeline; RECALLFLOW `follow_up_state` + scheduled date
- **What**: status enum + scheduled date + contact attempt counter. AfterHours per-record SMS thread; RECALLFLOW per-record activity log.
- **BSFQ equivalent**: `followUpCadence.js`, `followUpComposer.js` (parked), `followUpPlanner.js`. Live logic + parked UI.
- **Port**: **later**. Reactivate `FollowUpComposer` against existing `followUpCadence` rules.
- **Risk**: low.

### 4.10 Map / spatial navigation
- **Origin**: BensonStoneSiteMap entity registry + hotspots + route presets
- **What**: typed entity records (Building/Yard/Entrance/Door) with `id`/`displayName`/`useTags`/`relatedYardIds`/`displayPriority`. Hotspots are 2D overlays mapping `entityId` → record.
- **BSFQ equivalent**: `showroomDisplayRegister.js` already has display records. Visual surface is a list, not a map.
- **Port**: **reference / later**. Keep BensonStoneSiteMap standalone; share a JSON catalog so BSFQ can deep-link a display chip into the map.
- **Risk**: low (data shape only) / high (embedding the canvas).

### 4.11 Customer-facing portal / tablet flow
- **Origin**: SITELYNC `EstimateView.jsx` magic-link `/?id={id}`; Sales Studio HTML Discovery→Recommendations→Materials→Capture
- **What**: SITELYNC delivers a polished customer URL; Sales Studio runs an onstage tablet flow with code-flag warnings + size estimator.
- **BSFQ equivalent**: `CustomerProposal.jsx` is print-only today. No magic-link. Sales Studio is a sibling artifact, not part of BSFQ.
- **Port**: **later**. Add a magic-link customer view of an opportunity proposal (paper surface). Keep Sales Studio onstage flow separate per `ECOSYSTEM-MAP.md`.
- **Risk**: medium — introduces a new auth/sharing surface.

### 4.12 Visual cards instead of tables
- **Origin**: every project except DrewBusinessOps + AfterHours uses cards.
- **What**: card-grid layouts with badges and inline quick-actions; lists rendered as `article.bs-queue-card`/etc.
- **BSFQ equivalent**: already mostly card-shaped (`QueueCard`, `bs-triage-card`, etc.).
- **Port**: **rule, not code**. Codify "no table view in BSFQ" as a design rule for the handoff.
- **Risk**: zero.

### 4.13 Warning / confidence / review chips
- **Origin**: RECALLFLOW `InsightChips`, severity enum (critical/warning/info); CLARION `RISK_META`; Sales Studio HTML "Code note · Rockford" callouts
- **What**: enumerated severity with consistent icon + color.
- **BSFQ equivalent**: `bs-badge--warning`/`--warm`/`--status` exist; not unified through a function.
- **Port**: **now**. Add `getInsightSeverity(reason)` helper that emits `{label, severity, icon}` once for all chip surfaces.
- **Risk**: low.

### 4.14 Print / PDF / email output
- **Origin**: SITELYNC `mailto:` + `window.print()`; CLARION ReportLab; CES `Step4Send.jsx` state machine
- **What**: `window.print()` only, then explicit user attach + send. SITELYNC adds a `?print=1` URL param that auto-triggers print.
- **BSFQ equivalent**: existing print CSS in `App.css`; no email handoff yet.
- **Port**: **later**. Add `?print=1` auto-print param to a magic-link customer view if/when 4.11 ships.
- **Risk**: low.

### 4.15 Local persistence / offline
- **Origin**: every project uses `localStorage`; SITELYNC fronts JSONBin; CLARION uses backend + key-scoped `localStorage` for UI state.
- **What**: per-key namespacing, sanitize on read, optional storage param for testability (already BSFQ's pattern in `showroomDisplayRegister.js`).
- **BSFQ equivalent**: `opportunities.js`, `customerFile.js`, all storage modules.
- **Port**: **rule, not code**. Adopt SITELYNC's contractor-config pattern as a `bsfqProfile.js` for branding/store info.
- **Risk**: zero.

---

## 5. Project-to-BSFQ Translation Map

| Project | Useful pattern | BSFQ translation | Priority | Notes |
|---|---|---|---|---|
| RECALLFLOW | `TodayPage` queue grouping | Hearth Board v1 | **Now** | Replace today's flat list |
| RECALLFLOW | `priority.js` + `deriveNextAction` | `src/lib/opportunityScoring.js` | Later | Unify scattered scoring |
| RECALLFLOW | `LeadDetailPage` + `NotesTimeline` | `OpportunityWorkspace` + reactivated `ActivityTimeline` | Now | Both pieces already exist |
| RECALLFLOW | `MomentumBadge` (hot/warm/cooling/cold) | `getMomentum(opportunity)` helper | Now | Pair with insight chips |
| RECALLFLOW | `ConversationPrepPanel` | "Next move" panel inside `OpportunityWorkspace` | Later | Deterministic suggestions |
| CLARION | `ApprovalQueuePage` state machine | Recovery / OCR review gate | Later | Match existing `recoveryClassification` |
| CLARION | `RISK_META` taxonomy | BSFQ severity helper | Now | Unify chip styling |
| CLARION | `GovernanceBriefCard` | Reference for `CustomerProposal.jsx` polish | Reference | Don't replace — inspire |
| CLARION | Batch action toolbar | Bulk recovery / queue actions | Later | Only if Drew finds himself doing batches manually |
| SITELYNC | `EstimateView` magic-link `/?id=` | Customer-facing proposal link | Later | New surface, gated |
| SITELYNC | `PasteBridge` paste → review | Faster Old Quote intake | Later | Pairs with `customerPipelineCsv` |
| SITELYNC | `contractorConfig.js` | `src/data/bsfqProfile.js` | Now | Centralize store/brand details |
| SITELYNC | `designTokens.js` | Plain-CSS token vars in `App.css` | Now | Already partly done |
| SITELYNC | `?print=1` auto-print param | Customer-link print | Later | Pairs with magic-link |
| BensonStoneSiteMap | Entity registry + `useTags` | `showroomDisplayRegister.js` schema audit | Reference | Add `useTags`/`displayPriority` if absent |
| BensonStoneSiteMap | Route presets | "Open in Site Map" deep-link | Later | Cross-app, low risk |
| Sales Studio HTML | Code-flag warnings (Rockford VF, ZC retrofit, vent-free) | `src/lib/codeFlags.js` | Now | Surface inside `QuoteSetupLens` + `CustomerProposal` |
| Sales Studio HTML | Discovery→Recommendations→Materials→Capture | Don't merge — share JSON catalog only | Reference | `ECOSYSTEM-MAP.md` already mandates separation |
| Sales Studio HTML | Size estimator without tape | Future helper for proposal blanks | Reference | Niche; later |
| Customer Intake HTML | 5-section progress flow | Reference for any future BSFQ form | Reference | Don't replicate; share fields |
| AfterHours | `list_actionable_leads()` filter | Hearth Board priority filters | Now | Logic only |
| AfterHours | Per-record message thread | `OpportunityWorkspace` activity panel | Reference | Don't pull SMS/Twilio |
| DrewBusinessOps | Delegation guardrails / approval taxonomy | Hearth Board "What needs me?" partition | Reference | Inspiration only |
| CES | Money normalizer | **Already ported** `49f64ec` | Done | — |
| CES | `rowClassifier` ($1 placeholder filter) | `src/lib/lineItemClassifier.js` | Later | BSFQ-tuned keywords needed |
| CES | `textCleaner` | `src/lib/textCleaner.js` | Later | Pair with correction-chip UI |

---

## 6. Best Port Candidates (Top 10)

| # | Port | Source | Target | Value | Effort | Risk | Test strategy | Timing |
|---|---|---|---|---|---|---|---|---|
| 1 | **Hearth Board v1** (priority-grouped today queue) | RECALLFLOW `TodayPage.tsx` shape; AfterHours actionable filter | `WorkbenchShell` `mode === 'today'` block + `OpportunityQueue.jsx` | High — reframes BSFQ from "list of stuff" to "what needs you today" | Medium | Low | Component smoke via build; add `getHearthBoardSections(opportunities)` pure helper with unit tests | **Now** |
| 2 | **Severity helper + insight chips** | RECALLFLOW `insightSeverity()`; CLARION `RISK_META` | `src/lib/insightSeverity.js` + reuse in `QueueCard`, `RecoveryUploadReview` | High — unifies chip styling | Low | Low | Pure function, easy to test | **Now** |
| 3 | **Reactivate `ActivityTimeline`** with compose-on-top rhythm | RECALLFLOW `NotesTimeline`; existing parked `ActivityTimeline.jsx` | `OpportunityWorkspace.jsx` | High — visible "what's happening with this customer" | Low | Low | Smoke build; existing `opportunityActivity.test.js` covers logic | **Now** |
| 4 | **Code-flag warnings module** (Rockford VF / MV / ZC retrofit / vent-free) | Sales Studio `Fireplace Consultation.html` | `src/lib/codeFlags.js` consumed by `QuoteSetupLens.jsx` and `CustomerProposal.jsx` | High — fireplace-specific, real liability | Low | Low | Unit tests on flag rules | **Now** |
| 5 | **`bsfqProfile.js` centralized config** (store info, brand strings) | SITELYNC `contractorConfig.js` | `src/data/bsfqProfile.js` | Medium — easier to white-label, easier to edit | Low | Low | Static import; no test needed | **Now** |
| 6 | **`getMomentum(opportunity)` helper** + badge | RECALLFLOW `MomentumBadge` + `priority.js` thresholds | New helper in `opportunities.js` consumed by `QueueCard` | Medium — visible "how hot is this" without numeric score yet | Low | Low | Pure function; easy tests | **Now** |
| 7 | **Approval queue state machine for OCR/recovery review** | CLARION `approvalQueueService.ts` `QueueItemStatus` + `batchAction` | Extend `recoveryClassification` taxonomy in `oldQuoteRecovery.js` | High — formalizes the review gate | Medium | Medium | Unit tests on state transitions | Later |
| 8 | **Customer-facing proposal magic link** `/?id=…` | SITELYNC `EstimateView.jsx` + JSONBin pattern (BSFQ would use localStorage + token, not JSONBin) | `src/components/CustomerProposalView.jsx` + URL param hook | Medium-high — eliminates print-and-attach step | Medium-high | Medium | Smoke build + URL param parsing tests | Later |
| 9 | **Numeric `opportunityScoring.js`** (consolidate scattered scoring) | RECALLFLOW `priority.js` | New module; back-compat with existing `getOpportunityReadinessBadge` | High — prerequisite for sorting Hearth Board | Medium | Medium | Snapshot tests on existing fixtures | Later |
| 10 | **PasteBridge two-phase intake** | SITELYNC `PasteBridge.jsx` + `parsePasteInput.js` | New `OpportunityNotesPaste.jsx` lane in `OldQuoteRecovery` | Medium — speeds rough notes intake | Medium | Low | Pure parser tests | Later |

---

## 7. Design Handoff Implications (Hybrid Hearth Workbench)

### Surface treatment

**Graphite workbench** (heavy inspection / parsing / reconciliation)
- `RecoveryUploadReview` — every field is a review decision.
- `BulkRecoveryUpload` triage buckets — many records, fast eyeball.
- Future approval queue — borrow CLARION's dense, dark, dense-text feel.
- `WorkbenchShell` upload mode — already half-graphite; commit to it.

**Paper** (reading / customer-facing / human)
- `OpportunityWorkspace` — single customer, single story.
- `CustomerProposal.jsx` — already paper.
- Hearth Board v1 — calmer than graphite; cards on warm surface, not a console.
- Future customer magic-link proposal — most-paper of all surfaces.

### Per-screen guidance

**Hearth Board v1** (this is the first implementation pass)
- Inspiration: RECALLFLOW `TodayPage` partitioned queue. AfterHours actionable-filter. CLARION dashboard cards.
- Sections: "What needs you today" / "Hot but waiting" / "Cooling" / "Reference / parked".
- Cards: opportunity card with momentum chip + insight chips + next-action label + quick-action buttons.
- No tables. No "All opportunities" tab as the default — that's a filter, not a home.

**Customer File / `OpportunityWorkspace`**
- Inspiration: RECALLFLOW `LeadDetailPage`. The compose-on-top notes timeline. Quick-action header.
- Reactivate `ActivityTimeline` underneath the main fields grid.
- Add a "Next move" sentence at the top — single line, deterministic, derived from `opportunityScoring.js` (later).

**Quote Review** (`RecoveryUploadReview`, `WorkbenchShell` upload mode)
- Inspiration: CLARION queue detail panel + CES correction chips.
- Severity-aware warnings using `insightSeverity()` helper.
- Code flags from `codeFlags.js` shown inline at the relevant field.

**Follow-Up Composer**
- Inspiration: SITELYNC sticky footer with Preview / Print / Email / Copy share link. RECALLFLOW per-record quick actions.
- Keep parked component; reintegrate per `workbench-reintegration.md`.

**Sales Studio later**
- Per `ECOSYSTEM-MAP.md`: do not absorb. Share a JSON catalog (units, brochures, code flags). The code-flag module (port #4 above) is the first piece of that shared catalog.

### Cross-cutting design rules

- Card-grid first, table never.
- Chips are functions, not loose className strings — go through `insightSeverity()`.
- Brand strings live in `bsfqProfile.js` only — never inline in components.
- Magic links are paper, not graphite, and always read-only customer-facing.
- All scoring is deterministic. No AI in the critical path.

---

## 8. What Not To Bring Over

- **Cold outreach automation** (AfterHours Twilio SMS sender, auto-reply templates) — BSFQ is backstage; outreach is a separate decision.
- **Multi-tenant SaaS, auth, billing** (CLARION) — single-rep tool; OAuth or magic-link only if/when customer view ships.
- **Compliance / governance language** (CLARION) — wrong audience.
- **Generic CRM table views** — see § 7 design rule.
- **Send / publish buttons that act without explicit confirmation** — covered by global Claude Code rules anyway.
- **Real customer/lead/client data in fixtures or repo** — every fixture in BSFQ should be redacted.
- **DrewBusinessOps Notion-as-app** — Notion is the right home for that data.
- **Sales Agent GPT knowledge base** — separate artifact; reference, don't import.
- **BensonStoneSiteMap r3f canvas embedded in BSFQ** — keep as standalone repo; share data only.
- **Fireplace Consultation/Customer Intake HTML logic** — these are onstage tablet artifacts, not BSFQ source.
- **CES 4-step wizard** — wrong mental model for multi-customer triage (already noted in CES audit).

---

## 9. Recommended Implementation Roadmap

| Step | Pass | Why this order |
|---|---|---|
| 1 | **Hearth Board v1** (port #1) + severity helper (#2) + momentum helper (#6) + bsfqProfile (#5) | Replaces today's flat queue with a "what needs you" home — biggest UX delta per LOC |
| 2 | **Customer File timeline + next-move sentence** (port #3 + reactivate `ActivityTimeline`) | Makes the single-customer view feel alive |
| 3 | **Code-flag warnings** (port #4) | Domain-specific liability protection; surface inline in Quote Setup + Customer Proposal |
| 4 | **Numeric opportunity scoring** (port #9) | Prerequisite for sorting Hearth Board / surfacing "next move" |
| 5 | **Follow-Up Sprint / Composer reactivation** | Reintegrate parked module against existing `followUpCadence` |
| 6 | **Proposal readiness meter** | Single number on customer file; replaces ad-hoc readiness chips |
| 7 | **Approval queue / formalized review gate** (port #7) | After Hearth Board exists, the gate has a clean home |
| 8 | **Customer-facing proposal magic link** (port #8) | Paper-surface customer view; eliminates print-attach friction |
| 9 | **PasteBridge intake** (port #10) | Faster rough-notes → opportunity flow |
| 10 | **Display map deep-link** | Cross-app link to BensonStoneSiteMap; no embed |
| 11 | **Sales Studio shared catalog** | Per `ECOSYSTEM-MAP.md` future work |
| 12 | **Larger Daily Command Center** | Once Hearth Board has earned its keep |

Steps 1–3 are the proposed scope of the first design-handoff implementation pass.

---

## 10. Next Claude Code Design Handoff Prompt

```
TASK: Implement Hearth Board v1 + insight severity + momentum + bsfqProfile.

WORKING DIRECTORY:
C:\Users\beyon\OneDrive\Desktop\BensonStoneFireplaceQuote

CONTEXT:
The Hybrid Hearth Workbench design direction (Claude Design winner) and the
pattern library at docs/DREW-PROJECT-PATTERN-LIBRARY-FOR-BSFQ.md call for a
priority-grouped "Hearth Board" home, severity-aware chips, and centralized
brand config — replacing the flat opportunity list in WorkbenchShell `mode === 'today'`.

REFERENCE:
- docs/DREW-PROJECT-PATTERN-LIBRARY-FOR-BSFQ.md  — sections 4.1, 4.2, 4.13, 6 (#1, #2, #5, #6), 7
- src/components/WorkbenchShell.jsx  — current today mode + EmptyHero
- src/components/OpportunityQueue.jsx  — existing card layout to keep
- src/lib/opportunities.js  — existing readiness/source/next-action helpers
- RECALLFLOW (read-only): src/pages/TodayPage.tsx, src/pages/LeadDetailPage.tsx,
  src/components/ui.tsx (MomentumBadge, InsightChips)

GOAL:
1. New `src/data/bsfqProfile.js` — single export with store/brand strings used today
   inline (Benson Stone, Rockford IL, fireplace department, etc.). Replace inline
   string literals only where the change is mechanical and low-risk.
2. New `src/lib/insightSeverity.js` — pure function `insightSeverity(reason)` →
   `{severity: 'critical'|'warning'|'info'|'ok', label, dot}`. Co-located test.
3. New `src/lib/opportunityMomentum.js` — pure function `getMomentum(opportunity, now)`
   → `{state: 'hot'|'warm'|'cooling'|'cold', label, score}` based on existing
   activity + readiness signals. Co-located test.
4. New `src/lib/hearthBoard.js` — pure function `getHearthBoardSections(opportunities, now)`
   → ordered array of `{id, title, description, opportunities}` partitioning
   into "Needs you today / Hot but waiting / Cooling / Reference". Co-located test.
5. New `src/components/HearthBoard.jsx` — renders the sections using existing
   `QueueCard`, with momentum chip and insight chips overlaid. Replaces the
   `mode === 'today'` body in WorkbenchShell when `oppList.length > 0`.

CONSTRAINTS:
- No new dependencies. Plain CSS only (no Tailwind). No TypeScript.
- Do NOT change `OpportunityQueue.jsx` API — it must keep working as the
  fallback / "All Opportunities" filter view.
- Do NOT modify `opportunities.js` data shape. Read-only consumption.
- Cards remain the same `QueueCard` component; new chips are additive.
- Follow CLAUDE.md conventions (no comments unless WHY is non-obvious;
  no docstrings; no premature abstractions).

VALIDATION:
- npm test (~440 → ~460 pass)
- npm run build clean
- npx eslint on touched files only (skip pre-existing debt)

COMMIT:
"Add Hearth Board v1 with severity + momentum helpers"

ACCEPTANCE:
- Today view shows partitioned sections instead of flat list.
- Momentum + insight chips visible on each card.
- All section partitioning logic is pure-function and unit-tested.
- bsfqProfile.js single source for brand strings.
```

---

*End of pattern library.*
