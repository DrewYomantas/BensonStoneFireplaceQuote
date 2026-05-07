import { getSafeBulkAddDrafts } from '../lib/opportunities.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export default function BulkOpportunityIntake({
  bulkDraftState,
  onAddAllSafe,
  onAddDraft,
  onReviewDraft,
  onSkipDraft,
  onUpdateExisting,
  skippedDraftIds,
}) {
  const drafts = bulkDraftState?.drafts || []
  const summary = bulkDraftState?.summary || {}
  const safeDraftCount = getSafeBulkAddDrafts(drafts).filter((draft) => !skippedDraftIds.includes(draft.id)).length

  if (!drafts.length) return null

  return (
    <section className="bulk-opportunity-panel">
      <div className="panel-heading">
        <div>
          <p className="kicker">Bulk Intake</p>
          <h3>Draft opportunities</h3>
          <p className="section-caption">Review scanned quote candidates before adding them to the Opportunity Queue. No customer-facing exports are created. The old Customer Pipeline CSV can also be ingested here via <code>createOpportunityDraftsFromPipelineCsv</code>.</p>
        </div>
        <button type="button" className="primary-button" disabled={!safeDraftCount} onClick={onAddAllSafe}>
          Add selected safe drafts
        </button>
      </div>

      <div className="bulk-intake-summary">
        <span><strong>{summary.importedPackets || bulkDraftState.importedPacketCount || 0}</strong> packets reviewed</span>
        <span><strong>{summary.readyToAdd || 0}</strong> ready to add</span>
        <span><strong>{summary.needsReview || 0}</strong> need review</span>
        <span><strong>{summary.duplicates || 0}</strong> possible duplicates</span>
        <span><strong>{summary.referenceOnly || 0}</strong> reference-only</span>
        <span><strong>0</strong> customer-facing exports created</span>
      </div>

      <div className="bulk-draft-list">
        {drafts.map((draft) => {
          const opportunity = draft.opportunity
          const skipped = skippedDraftIds.includes(draft.id)
          return (
            <article className={`bulk-draft-row ${skipped ? 'is-skipped' : ''}`} key={draft.id}>
              <div>
                <strong>{opportunity.customerName || 'Customer name missing'}</strong>
                <span>{opportunity.quoteNumber ? `Quote ${opportunity.quoteNumber}` : 'Quote number missing'} · {opportunity.quoteDate || 'Date missing'}</span>
                <span>{opportunity.sourceFileName || opportunity.sourceLabel || 'Bulk source'}</span>
              </div>
              <div>
                <span className={`batch-status is-${opportunity.status}`}>{titleLabel(opportunity.status)}</span>
                <span>{opportunity.recommendedPlaybookId || 'No playbook'}</span>
              </div>
              <div>
                {draft.duplicate.isDuplicate ? (
                  <p className="bulk-duplicate-note">
                    Possible duplicate ({draft.duplicate.confidence}): {draft.duplicate.reasons.join(', ')}
                  </p>
                ) : <p className="empty-copy">No duplicate signal.</p>}
                {opportunity.warnings.length ? (
                  <ul className="notice-list notice-list--warning">
                    {opportunity.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                ) : null}
              </div>
              <div className="batch-actions">
                {draft.duplicate.isDuplicate && draft.duplicate.confidence === 'high' ? (
                  <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onUpdateExisting(draft)}>Update existing</button>
                ) : null}
                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onAddDraft(draft)}>Add to Queue</button>
                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onReviewDraft(draft)}>Review First</button>
                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onSkipDraft(draft.id)}>Skip</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
