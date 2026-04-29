import {
  filterOpportunities,
  opportunityStatuses,
  opportunityTemperatures,
  proposalReadinessOptions,
  summarizeOpportunities,
} from '../lib/opportunities.js'

const filters = [
  { key: 'needs-review', label: 'Needs Review' },
  { key: 'ready-for-proposal', label: 'Ready for Proposal' },
  { key: 'follow-up-needed', label: 'Follow-Up Needed' },
  { key: 'waiting-on-customer', label: 'Waiting on Customer' },
  { key: 'closed-reference', label: 'Closed / Reference' },
  { key: 'all', label: 'All' },
]

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function SummaryCard({ label, value }) {
  return (
    <div className="mission-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function OpportunityQueue({
  filter,
  onFilterChange,
  onRemoveOpportunity,
  onSaveCurrent,
  onUpdateOpportunity,
  opportunities,
  playbooks,
  saveState,
}) {
  const summary = summarizeOpportunities(opportunities)
  const visible = filterOpportunities(opportunities, filter)

  return (
    <section className="workbench-view opportunity-queue">
      <div className="view-heading">
        <div>
          <p className="kicker">Opportunity Queue</p>
          <h2>Track fireplace quotes as next actions.</h2>
          <p className="section-caption">Local-only queue for reviewed quote summaries, follow-up paths, and proposal state.</p>
        </div>
        <button type="button" className="primary-button" onClick={onSaveCurrent}>Save current quote</button>
      </div>

      {saveState ? <p className="quiet-status">{saveState}</p> : null}

      <div className="mission-grid opportunity-summary">
        <SummaryCard label="Needs Review" value={summary.needsReview} />
        <SummaryCard label="Ready for Proposal" value={summary.readyForProposal} />
        <SummaryCard label="Follow-Up Needed" value={summary.followUpNeeded} />
        <SummaryCard label="Waiting on Customer" value={summary.waitingOnCustomer} />
        <SummaryCard label="Closed / Reference" value={summary.closedReference} />
      </div>

      <div className="queue-filters" aria-label="Opportunity filters">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`ghost-button ${filter === item.key ? 'is-selected' : ''}`}
            onClick={() => onFilterChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="opportunity-list">
        {visible.length ? visible.map((opportunity) => (
          <article className={`opportunity-card is-${opportunity.status}`} key={opportunity.id}>
            <div className="opportunity-card__header">
              <div>
                <span className="kicker">{opportunity.sourceType || 'Quote opportunity'}</span>
                <h3>{opportunity.customerName || 'Customer name missing'}</h3>
                <p>{opportunity.quoteNumber ? `Quote ${opportunity.quoteNumber}` : 'Quote number missing'} · {opportunity.quoteDate || 'Date missing'}</p>
              </div>
              <div className="opportunity-badges">
                <span>{titleLabel(opportunity.status)}</span>
                <span>{titleLabel(opportunity.temperature)}</span>
                <span>{titleLabel(opportunity.proposalReadiness)}</span>
              </div>
            </div>

            <dl className="source-ledger opportunity-ledger">
              <div><dt>Follow-up path</dt><dd>{playbooks.find((p) => p.id === opportunity.selectedPlaybookId)?.name || playbooks.find((p) => p.id === opportunity.recommendedPlaybookId)?.name || 'Not selected'}</dd></div>
              <div><dt>Next best action</dt><dd>{opportunity.nextAction || 'Review opportunity'}</dd></div>
              <div><dt>Due date</dt><dd>{opportunity.nextActionDue || 'Not scheduled'}</dd></div>
              <div><dt>Updated</dt><dd>{opportunity.updatedAt ? new Date(opportunity.updatedAt).toLocaleDateString() : 'Not saved'}</dd></div>
            </dl>

            {opportunity.warnings.length ? (
              <div className="opportunity-warning-box">
                <h4>Review before sending</h4>
                <ul className="notice-list notice-list--warning">
                  {opportunity.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="opportunity-edit-grid">
              <label className="field">
                <span>Status</span>
                <select value={opportunity.status} onChange={(event) => onUpdateOpportunity(opportunity.id, { status: event.target.value })}>
                  {opportunityStatuses.map((status) => <option key={status} value={status}>{titleLabel(status)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Temperature</span>
                <select value={opportunity.temperature} onChange={(event) => onUpdateOpportunity(opportunity.id, { temperature: event.target.value })}>
                  {opportunityTemperatures.map((temperature) => <option key={temperature} value={temperature}>{titleLabel(temperature)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Readiness</span>
                <select value={opportunity.proposalReadiness} onChange={(event) => onUpdateOpportunity(opportunity.id, { proposalReadiness: event.target.value })}>
                  {proposalReadinessOptions.map((readiness) => <option key={readiness} value={readiness}>{titleLabel(readiness)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Selected playbook</span>
                <select value={opportunity.selectedPlaybookId} onChange={(event) => onUpdateOpportunity(opportunity.id, { selectedPlaybookId: event.target.value })}>
                  <option value="">Not selected</option>
                  {playbooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.name}</option>)}
                </select>
              </label>
              <label className="field field--wide">
                <span>Next action</span>
                <input value={opportunity.nextAction} onChange={(event) => onUpdateOpportunity(opportunity.id, { nextAction: event.target.value })} />
              </label>
              <label className="field">
                <span>Next action due</span>
                <input type="date" value={opportunity.nextActionDue} onChange={(event) => onUpdateOpportunity(opportunity.id, { nextActionDue: event.target.value })} />
              </label>
              <label className="field">
                <span>Last contacted</span>
                <input type="date" value={opportunity.lastContactedAt} onChange={(event) => onUpdateOpportunity(opportunity.id, { lastContactedAt: event.target.value })} />
              </label>
            </div>

            <div className="action-row">
              <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onRemoveOpportunity(opportunity.id)}>
                Remove from queue
              </button>
            </div>
          </article>
        )) : (
          <section className="workbench-panel empty-state">
            <h3>No opportunities in this lane yet.</h3>
            <p className="empty-copy">Save a reviewed quote from Proposal Builder or Export Prep to start building the queue.</p>
          </section>
        )}
      </div>
    </section>
  )
}
