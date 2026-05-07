# BSFQ Design Implementation Handoff

This document translates the Claude Design "Hybrid Hearth Workbench" handoff (Direction C)
into practical, repo-shaped implementation guidance for BSFQ as it exists today: a
React + Vite + plain CSS app that polishes BisTrack quote material into customer-facing
proposals.

The design bundle that originated this doc (`bsfq/project/...`) is a visual spec, not
production code. The bundle uses a Next.js-style `app/page.tsx` layout and prototype
HTML/CSS. Do **not** copy that file structure. Implementation lives in the existing
`src/components/` and `src/lib/` tree.

## 1. Purpose

Give Claude (and any future contributor) a single reference for *how* to bring the
Hybrid Hearth Workbench language into BSFQ in bounded passes:

- which screens are paper, which are graphite, which are hybrid
- which tokens to add to `App.css`
- which component vocabulary terms map to which existing files
- what is in scope for Hearth Board v1, and what is explicitly **not** yet

When in doubt, prefer one bounded screen over a broad redesign.

## 2. Product North Star

BSFQ is a **backstage rep-facing sales workbench** wrapped around BisTrack.

- BisTrack remains the source of truth for quote/order data.
- BSFQ is a presentation + triage + readiness layer.
- BSFQ never invents data. Missing fields stay blank with a warning chip.
- BSFQ does not write to BisTrack. Any "fix" surface uses safer copy:
  *Copy Fix for BisTrack*, *Flag for BisTrack Review*, *Needs BisTrack Update*.

The job is to turn messy sales material — scanned packets, bulk CSV, OCR, half-edited
quotes — into clean visual review, customer-ready proposals, and a clear next action.

## 3. Visual Philosophy

From Direction C:

- **Serious work, gameful structure.** Real sales-department tool on the surface,
  pipeline / lane / chip logic underneath.
- **No spreadsheet energy.** A table is a fallback, never the headline experience.
- **Professional language on top, gameful logic underneath.** Stage chips and
  momentum tags read as operational, not arcade.
- **Paper for reading and customer-facing surfaces.** Warm cream, serif display,
  terracotta accent, calm rules.
- **Graphite for inspection, recovery, parser review, OCR triage.** Dark workbench
  panels appear only where dense data warrants them.
- **Warm and practical, not generic SaaS.** Avoid bright dashboard blue, avoid
  rounded card sprawl, avoid heavy drop shadows.

The thesis quote from the bundle is the rule of thumb:

> Reps see paper and warm cards when they're reading, and a graphite workbench
> when they're working — never a CRM, never a spreadsheet, never a toy.

## 4. Design Tokens

Add these as CSS custom properties in `src/App.css` (or a small token block at the top
of an existing `:root` declaration). Variable names live alongside the existing ones —
they don't replace the in-flight `bs-*`, `wb-*`, and `C.*` palettes that current
components depend on.

```css
:root {
  /* Surface */
  --hearth-paper:        #FBF9F4;   /* primary warm reading surface */
  --hearth-paper-2:      #F7F4EE;   /* alt paper, card head, muted block */
  --hearth-workbench:    #F2ECE0;   /* warm "stone" inspection background */
  --hearth-graphite:     #2C2A28;   /* dark inspection panel */
  --hearth-graphite-ink: #F2ECE0;   /* text on graphite */

  /* Ink */
  --hearth-ink:          #231F1E;
  --hearth-ink-2:        #3E3A38;
  --hearth-body:         #5A524E;
  --hearth-muted:        #887E78;

  /* Rules + warm accents */
  --hearth-rule:         #D7CFC4;
  --hearth-terracotta:   #A8502C;   /* primary accent, "hot", emphasis */
  --hearth-amber:        #C8923D;   /* secondary accent, attention */
  --hearth-moss:         #4F5840;   /* won / installed / done */
  --hearth-tactical:     #5C8E91;   /* discover / quoted / informational */
  --hearth-ember:        #C9491F;   /* rare hot-callout / urgent flag */

  /* Status surface tones (chips + lane rules) */
  --hearth-status-discover: #5C8E91;
  --hearth-status-quote:    #C8923D;
  --hearth-status-active:   #A8502C;
  --hearth-status-won:      #4F5840;
  --hearth-status-cold:     #887E78;

  /* Severity */
  --hearth-severity-warn:   #C8923D;
  --hearth-severity-block:  #A8502C;
  --hearth-severity-ok:     #4F5840;

  /* Spacing (8px base) */
  --hearth-space-1: 4px;
  --hearth-space-2: 8px;
  --hearth-space-3: 12px;
  --hearth-space-4: 16px;
  --hearth-space-5: 24px;
  --hearth-space-6: 32px;

  /* Radii — small or none */
  --hearth-radius-0: 0px;
  --hearth-radius-1: 2px;
  --hearth-radius-2: 4px;

  /* Borders */
  --hearth-border-hair:  1px solid var(--hearth-rule);
  --hearth-border-ink:   1px solid var(--hearth-ink);
  --hearth-rule-strong:  2px solid var(--hearth-ink);

  /* Quiet, warm shadows */
  --hearth-shadow-1: 0 1px 2px rgba(35, 31, 30, 0.06);
  --hearth-shadow-2: 0 4px 12px -4px rgba(35, 31, 30, 0.10);
}
```

Do not add a token-tooling layer. CSS variables are enough. Use the existing system
font stack — do not pull Google Fonts in production unless we explicitly verify it
doesn't add load time on shop floor wifi.

## 5. Surface Rules

| Surface | Treatment |
|---|---|
| Hearth Board (opportunity overview) | Paper |
| Customer File / Customer Proposal preview | Paper |
| Quote Polish (active BisTrack fields) | Paper, with selectively dark inspection panels |
| Old Quote Recovery upload review | Hybrid — paper shell, graphite parser readout |
| Scanned packet / OCR triage | Graphite workbench |
| Bulk CSV import review | Hybrid — paper card list, graphite raw-row drawer |
| Showroom Display Register | Paper |
| Vendor / Reference panels | Paper |

**Cards vs tables.** The opportunity view is a card board, never a primary table.
Tables are acceptable inside an inspection drawer (raw OCR rows, raw CSV rows) where
density matters more than warmth.

**Warnings as chips, not red walls.** A warning is a small, terracotta or amber chip
on the card, not a banner. A blocking issue gets a single warning card slot above
the next-action panel — it does not flood the screen.

## 6. Component Vocabulary

These are names used by this doc and the design bundle. Most are not implemented yet.
They are the shared vocabulary, not a checklist.

| Term | Role | Where it lives (or will) |
|---|---|---|
| `HearthCard` | One opportunity tile on the board | `src/components/HearthBoard.jsx` |
| `StageLane` | One vertical lane on the board, with a stage-colored top rule | `src/components/HearthBoard.jsx` |
| `MomentumBadge` | hot / warm / cooling / cold | helper-driven chip |
| `SeverityChip` | warning count / blocked / review-needed | helper-driven chip |
| `SourceTag` | manual / CSV / BisTrack / OCR / scanned packet | helper-driven chip |
| `WarningChip` | one short warning, terracotta or amber | inline on card |
| `NextActionPanel` | the single most-important next move | already partially present in `OpportunityWorkspace` |
| `ImportReviewCard` | per-row CSV/PDF review tile | future, replaces parts of `CustomerPipelineImport` rendering |
| `QuoteReviewPanel` | side-by-side PDF / parsed view | future, replaces part of `WorkbenchShell` upload view |
| `CustomerFileCard` | tabbed binder header for a customer | future, replaces part of `CustomerFileWorkspace` |

## 7. Screen Roadmap

In order:

1. **Hearth Board v1** — opportunity board view. *(this pass)*
2. **Customer File timeline** — tabbed binder header + activity strip.
3. **Quote Review warning chips** — replace inline warning text in upload view with chips.
4. **Follow-Up Sprint / Composer** — paper composer, terracotta CTA, tone chips.
5. **Proposal readiness meter** — paper progress meter on the customer file.
6. **Display map / link card** — small floorplan-style card on opportunity / customer file.
7. **Daily Command Center** — paper hero + small graphite "today" panel.
8. **Sales Studio shared data bridge** — connect BSFQ + Consultation + SiteMap later.

Each screen is its own bounded pass. Do not do more than one at a time.

## 8. Hearth Board v1 Implementation Scope

This is the first real implementation pass.

- A new mode tab "Hearth Board" in the existing `WbModeSwitch` header.
- Pulls from `listOpportunities()` (no new storage, no new save path).
- Groups opportunities into lanes. v1 lanes (mapped from existing statuses):
  - **Discover** — `new-intake` (no quote yet, fresh customer)
  - **Quote** — `needs-review`, `ready-for-proposal` (quote in motion)
  - **Active** — `proposal-sent`, `waiting-on-customer`, `follow-up-needed`
  - **Won** — `closed-won`
  - **Cold / Reference** — `closed-lost`, `reference-only`, `archived`
- One paper `HearthCard` per opportunity, showing what's available:
  customer name, project type, quote total, status, momentum badge, severity chip,
  source tag, next action, warning count, last-touch date, **Open Workspace →**.
- Click a card → existing `handleSelectTicket` flow (no new workspace).
- An empty lane shows a quiet italic line, not an empty box with a CTA.
- Board mode is the Hearth Board v1 default for now. Today's Work and File Room stay
  unchanged.

## 9. Current Repo Mapping

| Design concept | Current file |
|---|---|
| Opportunity object shape | [`src/lib/opportunities.js`](../src/lib/opportunities.js) |
| Existing list / filter UI | [`src/components/UnifiedOpportunityQueue.jsx`](../src/components/UnifiedOpportunityQueue.jsx) (parked) |
| Today's Work hero + sections | [`src/components/WorkbenchShell.jsx`](../src/components/WorkbenchShell.jsx) `TodayWorkspace` |
| Mode tabs in header | [`src/components/WorkbenchShell.jsx`](../src/components/WorkbenchShell.jsx) `WbModeSwitch` |
| Customer file workspace | [`src/components/WorkbenchShell.jsx`](../src/components/WorkbenchShell.jsx) `CustomerFileWorkspace` |
| Quote upload review | [`src/components/WorkbenchShell.jsx`](../src/components/WorkbenchShell.jsx) `UploadWorkspace` |
| Old quote recovery | [`src/components/OldQuoteRecovery.jsx`](../src/components/OldQuoteRecovery.jsx) |
| Customer pipeline CSV import | [`src/components/CustomerPipelineImport.jsx`](../src/components/CustomerPipelineImport.jsx) |
| Hearth Board v1 (this pass) | [`src/components/HearthBoard.jsx`](../src/components/HearthBoard.jsx) (new) |
| Hearth Board pure helpers | [`src/lib/opportunityBoard.js`](../src/lib/opportunityBoard.js) (new) |

## 10. Do Not Do

- No full redesign. No global re-skin pass. Dark-mode is local to graphite surfaces.
- No Next.js / `app/page.tsx` conversion.
- No BisTrack writeback. BSFQ does not push fixes to BisTrack — use *Copy Fix for
  BisTrack*, *Flag for BisTrack Review*, or *Needs BisTrack Update* copy when a fix
  surface is needed.
- No cold-outreach engine. BSFQ is rep-facing.
- No compliance-heavy / legal language on rep surfaces.
- No generic CRM table as the primary opportunity experience.
- No hidden destructive behavior: every Delete and Archive remains explicit and
  visible.
- No new visual diff or snapshot test framework in this pass.
- No Quote Review Workbench, Customer File rebuild, Display Register rebuild, or
  Follow-Up Composer rebuild in this pass — those are later screens.
