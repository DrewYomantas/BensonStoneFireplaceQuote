# Customer Pipeline CSV Import

## What this is for

The fireplace department previously tracked walk-ins and active leads in a standalone Google Sheet ("Customer Pipeline"). That sheet exports as `Customer Pipeline - Import This.csv`. This BSFQ feature ingests that CSV into the canonical Opportunity Queue so the rep doesn't keep two parallel lists.

This is **not** a CRM migration tool, **not** a sync, and **not** an automatic process. Each row becomes a *draft* you review before it lands in the queue.

## Where the source CSV lives

`G:\My Drive\Benson Stone Company\Fireplace Department App Project\06-Customer-Pipeline\Customer Pipeline - Import This.csv`

Don't move or rename it during import — BSFQ reads a copy, not the file in place.

## How to import

1. Open BSFQ → switch to **Recovery** mode.
2. In the toolbar click **Import Customer Pipeline CSV**.
3. Click **Select CSV** and pick the file.
4. BSFQ parses it client-side and shows a summary line plus a list of drafts.
5. For each draft, choose:
   - **Add to Queue** — saves a new opportunity.
   - **Update Existing** — when BSFQ detects a high-confidence duplicate (matching phone, email, or quote number).
   - **Skip** — drops it from this import session only.
6. Click **Done — View Queue** when finished, or **Cancel Remaining** to leave the rest unprocessed.

Nothing is saved to the queue until you click an Add or Update button per row (or the **Add All Ready** bulk action). The import never silently overwrites existing opportunities.

## What happens after import

- Each added draft becomes a real opportunity tagged `sourceType: 'customer-pipeline-csv'` and `recoverySource: 'true'`, so it shows up in the Recovery view alongside other recovered quotes.
- Stage → status mapping:
  - `Active - Quote Stage` → needs-review
  - `Active - Quote Sent` → waiting-on-customer
  - `Won - Completed` → closed-won
  - `Historical - Unknown Status` / `Stale - Check Status` → follow-up-needed
  - `Dead / Needs Revival` → reference-only
- Notes, "Who Helped", and the original source ("Walk-in", etc.) are preserved on the opportunity.

## What to check before confirming

- Customer name and phone match the source row.
- Quote total looks right — see the data quality notes below for the known column-shift case.
- Any "needs review" or warning badges on the row are addressed or acknowledged.
- Possible-duplicate matches are correctly resolved (Update Existing vs. Add as new).

## Known data quality notes

These come from the real export and are surfaced in the UI as row warnings, not silent corrections:

- **Extra-comma column shift.** If a row has an empty Quote Total cell but a currency value (e.g. `$21067.54`) in Next Action, BSFQ recovers the amount into Quote Total and adds a warning so the rep can double-check the source row. Example: Anna Orlinska's row in the May 2026 export.
- **Missing phone/email.** Rows with no contact info (e.g., very old "Dead / Needs Revival" leads) still import. They surface a warning and typically land as `reference-only` so they don't pollute active follow-ups.
- **Missing quote total.** Rows without a Quote Total are allowed; the warning makes it visible.
- **Unquoted cells with embedded `"` (inch marks like `36" DV`).** The parser tolerates these — Sheets exports them this way and they don't strictly conform to RFC 4180.

## Archiving the old folder

After Drew runs a real import end-to-end and confirms the records landed correctly, the Drive `06-Customer-Pipeline` folder can be archived to `99-Archived-Old-Prototypes/` with a README pointer back to BSFQ Opportunity Queue. **Don't archive before that verification.**

## Related files

- Parser + draft generator: [src/lib/customerPipelineCsv.js](../src/lib/customerPipelineCsv.js)
- Tests: [src/lib/customerPipelineCsv.test.js](../src/lib/customerPipelineCsv.test.js)
- Import UI: [src/components/CustomerPipelineImport.jsx](../src/components/CustomerPipelineImport.jsx)
- Toolbar wire-up: [src/components/OldQuoteRecovery.jsx](../src/components/OldQuoteRecovery.jsx)
