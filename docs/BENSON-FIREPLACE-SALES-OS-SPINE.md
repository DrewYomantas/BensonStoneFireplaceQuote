# Benson Fireplace Sales OS — Product Spine

_Reset decision date: 2026-05-07. Source of truth: Notion page “Fireplace Quote Workbench — Customer Design Quote Project”, section **May 7 Reset Decision — Drew-Only Fireplace Sales OS**. This document supersedes prior workbench / Hearth Board direction unless Drew explicitly says otherwise._

---

## A. Product Thesis

- Drew-only personal fireplace sales cockpit. Not a department tool, not multi-user, not a CRM rollout.
- **Tablet-first.** Built to be usable on the showroom floor on a tablet, then on Drew’s old work computer. No assumption of a fast machine, modern GPU, or a second monitor.
- **Local-only for now.** No backend, no cloud sync, no Gmail send, no automated pricing truth. State lives in the browser.
- **Customer File is the central object.** Every other surface (Visit, Quote, Proposal, Follow-up) attaches to a Customer File. No orphan quotes.
- **Walk-in first.** The first real flow the app must own end-to-end is a walk-in customer: greet → capture → set goal → quote/assumption review → proposal prep → follow-up.
- **BisTrack remains source of truth** for quote/order data. The app is a presentation and orchestration layer. It never invents pricing, never overwrites BisTrack, and always keeps the original BisTrack PDF attached to the customer-facing proposal.
- **Customer-facing output continues the showroom/design conversation.** A Benson proposal should feel like the next page of the consultation Drew just had — warm paper, clear structure, plain language. It should not feel like an accounting receipt or a CRM export.
- **Helps Drew avoid info overload** while learning fireplace products, BisTrack mechanics, quoting conventions, invoicing/handoff to scheduling, pipeline tracking, and follow-up cadence. The OS surfaces the *next best move*, not every possible move.
- **Helps customers not feel stupid.** Options are explained in plain language. Decisions are framed (gas vs. wood vs. electric, vented vs. ventless, insert vs. fireplace vs. stove), not dumped. Friction at the proposal stage is minimized so the customer feels guided, not interrogated.

## B. V1 Non-Negotiables

1. **Refresh must not wipe work.** Anything Drew types into a Customer File, Setup Lens, or proposal prep checklist must survive a tab close and a browser restart.
2. **Durable local storage required before serious daily use.** Every primary surface saves to localStorage (or IndexedDB for blobs) on input, not on submit.
3. **Visible save state.** Every customer-file-touching surface shows “Saved · 2:14 PM” or equivalent. Drew should never have to wonder whether a field stuck.
4. **Backup / export and restore / import required** before V1 is considered safe for daily use. JSON dump of all Customer Files, Visits, Proposals, and recovery queue. One button to export, one button to import.
5. **No heavy graphics, 3D, cinematic animation, or large animation system** in the rep-facing workbench. Tablet-safe and old-PC-safe is a hard constraint.
6. **No customer-facing leakage** of internal cost, buy price, margin, supplier history, fuzzy-match wording, OCR uncertainty, BisTrack confidence, vendor-rank, or any “we’re not sure about this line” language. These belong in the rep workbench only.
7. **The original BisTrack quote PDF stays attached** to the customer proposal handoff. The polished proposal is a companion piece, not a replacement for the line-item document.
8. **Detailed Investment Breakdown is the default proposal mode.** Other modes (single-number, package, etc.) are available but not default.
9. **No Gmail/email sending, no backend sync, no automated pricing-truth ingestion in V1.** Drew copies, prints, or saves out. The OS does not act on the customer’s behalf.

## C. Main Surfaces

The app is organized around **seven surfaces**, not tabs-of-everything. Each has a single job.

| Surface | Job | Notes |
|---|---|---|
| **Today** | Drew’s daily cockpit. Active visits, hot follow-ups due today, quotes awaiting decision, anything the OS thinks is the *next best move*. | Read-mostly. Launches into other surfaces. |
| **Start Visit** | A walk-in just arrived. Capture name + contact + reason-for-visit fast, attach (or create) a Customer File, drop into Setup + Goal Lens. | Tablet-optimized. Big tap targets. Should not require a keyboard. |
| **Customer Files** | Browse, search, open. The system-of-record for every customer Drew has touched. Every other surface points back here. | Includes status, momentum, last-touch, attached quotes, attached proposals, follow-up state, notes. |
| **Setup + Goal Lens** | What does this customer have today, and what do they actually want? Existing setup, fuel type, room context, budget posture, decision timeline, who decides. | Advisory output for Drew, not a customer-facing form. Feeds proposal framing. |
| **Quote / Proposal Prep** | Attach a BisTrack quote (typed or scanned), review the assumption set, choose proposal mode (default: Detailed Investment Breakdown), generate the customer-facing companion, stage the bundle (companion proposal + original BisTrack PDF). | This is where most of the existing parser/proposal logic gets reused. |
| **Follow-Up** | Who needs a touch, when, why, and what should the next message look like. Drew sends manually. | Cadence + composer. No auto-send. Reactivation lane lives here. |
| **Smart Context** | The “quiet helper” surface: vendor lookups, product reference, scope/clarification prompts, showroom display lookup. Available from inside any other surface, not its own destination. | Replaces the “tab grid of tools” pattern. Pulls vendor price book index, display register, reference library. |
| **Backstage Tools** | Old quote recovery intake, customer pipeline CSV import, file organizer, OCR debug, vendor price book admin, export/import, OS-level settings. Drew goes here on purpose, not by accident. | Demoted from primary surfaces. Not on the main nav for a walk-in workflow. |

> Backstage Tools is listed alongside the seven primary surfaces because it owns important plumbing, but it is intentionally not part of the walk-in spine.

## D. First Vertical Slice

The first buildable, end-to-end flow — the one the next implementation pass should target — is a single walk-in:

```
Start Visit
   │  (capture name, contact, reason-for-visit; attach or create Customer File)
   ▼
Customer File  (newly created or matched existing)
   │
   ▼
Setup + Goal Lens  (existing setup, room, fuel, budget posture, who decides, timeline)
   │
   ▼
Quote / Assumption Review
   │  (paste/scan BisTrack quote OR mark "no quote yet — capture interest")
   │  (review parsed lines, flag blockers/assumptions in rep-only view)
   ▼
Proposal Prep Checklist
   │  (default: Detailed Investment Breakdown)
   │  (verify safety rules, attach original BisTrack PDF, generate companion)
   ▼
Follow-up / Next Action
   (cadence chosen, draft message staged, customer-file momentum updated, save state visible)
```

Everything else (multi-customer dashboards, fancy momentum analytics, reactivation campaigns, packet binders, scheduler handoff polish) is *after* this slice works locally end-to-end and survives refresh.

## E. Separate Surfaces / Later Systems

These are explicitly **not part of V1 of the Sales OS**. They stay nameable but shelved.

- **Sales Studio** — customer-facing presentation surface (the “design table” experience). Stays a separate product surface. Not built into rep workbench V1. The companion proposal output is the bridge for now.
- **Site Map / Showroom Digital Floor** — blue-sky guest-facing digital floor / marketing experience. Not in V1 scope. Do not let this leak into the rep workbench shell.
- **Old Quote Recovery** — demoted from app-identity-level feature to a single intake lane under Backstage Tools. The reactivation use-case still matters, but it is not the front door.
- **File Room / File Organizer** — backstage/admin only. Useful for Drew when something is missing, not a primary surface.
- **Showroom Display Register** — stays as Smart Context lookup + Backstage admin. Not its own primary surface.
- **Vendor Price Books** — stays as Smart Context lookup + Backstage admin. Not its own primary surface.

## F. Design Direction

- **Hybrid C is the product system, not a color patch.** Two-surface approach:
  - **Warm paper surfaces** — used for any reading, customer-facing, or proposal-shaped work. Parchment background, serif headings, ink tones, generous spacing. This is where the showroom conversation continues.
  - **Lightweight workbench surfaces** — used for dense rep-only review (parser output, line items, blockers, assumptions, internal notes). Quieter, neutral, denser, sans-serif, more table-like. Tablet-safe.
- Surfaces are chosen by *job*, not by *which tab you’re on*. A Customer File overview is paper. A line-item assumption review is workbench. A follow-up draft is paper. A vendor price-book lookup is workbench.
- **Subtle gameful structure**, not a game UI. Stages are named. Next-best move is surfaced once. Source trust is shown (BisTrack-confirmed vs. assumed vs. customer-said). Progress through the visit is visible. Warnings are calm. Customer-file momentum is shown but not gamified into points/badges/streaks.
- **Avoid:**
  - Generic SaaS dashboard (KPIs, gradient cards, four-up stat tiles).
  - Spreadsheet/CRM grid as the primary view.
  - Cartoon, mascot, or playful illustrative style.
  - Heavy game UI (XP bars, achievement pop-ups, hero panels, particle effects).
  - Cinematic page transitions or large motion systems.
- **Tablet ergonomics first.** Tap targets ≥ 44px. Primary actions reachable with thumb. No hover-only affordances. No tiny inline edit pencils.
