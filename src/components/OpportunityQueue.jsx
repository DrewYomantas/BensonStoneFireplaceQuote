import { useMemo, useState } from 'react'
import ActivityTimeline from './ActivityTimeline.jsx'
import FollowUpComposer from './FollowUpComposer.jsx'
import { composeFollowUpDraft } from '../lib/followUpComposer.js'
import {
  addOpportunityActivity,
  buildSentOpportunityPatch,
  listOpportunityActivities,
  removeOpportunityActivity,
} from '../lib/opportunityActivity.js'
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
  const [activityVersion, setActivityVersion] = useState(0)
  const [toneByOpportunity, setToneByOpportunity] = useState({})
  const [channelByOpportunity, setChannelByOpportunity] = useState({})
  const [noteBodyByOpportunity, setNoteBodyByOpportunity] = useState({})
  const [noteTypeByOpportunity, setNoteTypeByOpportunity] = useState({})
  const [noteChannelByOpportunity, setNoteChannelByOpportunity] = useState({})
  const summary = summarizeOpportunities(opportunities)
  const visible = filterOpportunities(opportunities, filter)
  const activityCache = useMemo(() => {
    void activityVersion
    return Object.fromEntries(opportunities.map((opportunity) => [opportunity.id, listOpportunityActivities(opportunity.id)]))
  }, [activityVersion, opportunities])

  function refreshActivities() {
    setActivityVersion((current) => current + 1)
  }

  function getPlaybook(opportunity) {
    return playbooks.find((p) => p.id === opportunity.selectedPlaybookId) || playbooks.find((p) => p.id === opportunity.recommendedPlaybookId) || null
  }

  function saveDraftActivity(opportunity, draft) {
    addOpportunityActivity(opportunity.id, {
      type: 'follow-up-draft',
      title: draft.subject,
      body: draft.body,
      channel: draft.channel === 'phone-script' ? 'phone' : draft.channel === 'nextdoor-reply' ? 'nextdoor' : draft.channel,
      metadata: { tone: draft.tone, unsafeToSend: String(draft.unsafeToSend) },
    })
    refreshActivities()
  }

  function logSentActivity(opportunity, draft) {
    addOpportunityActivity(opportunity.id, {
      type: 'follow-up-sent',
      title: draft.subject || 'Follow-up sent',
      body: draft.body,
      channel: draft.channel === 'phone-script' ? 'phone' : draft.channel === 'nextdoor-reply' ? 'nextdoor' : draft.channel,
      metadata: { tone: draft.tone, unsafeToSend: String(draft.unsafeToSend) },
    })
    onUpdateOpportunity(opportunity.id, buildSentOpportunityPatch(opportunity))
    refreshActivities()
  }

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
            {(() => {
              const activities = activityCache[opportunity.id] || []
              const lastActivity = activities[0] || null
              const playbook = getPlaybook(opportunity)
              const selectedTone = toneByOpportunity[opportunity.id] || (opportunity.status === 'follow-up-needed' ? 'reactivation' : 'warm')
              const selectedChannel = channelByOpportunity[opportunity.id] || 'email'
              const draft = composeFollowUpDraft({
                opportunity,
                playbook,
                warnings: opportunity.warnings,
                tone: selectedTone,
                channel: selectedChannel,
              })
              const noteType = noteTypeByOpportunity[opportunity.id] || 'note'
              const noteChannel = noteChannelByOpportunity[opportunity.id] || 'manual'
              const noteBody = noteBodyByOpportunity[opportunity.id] || ''
              return (
                <>
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
              <div><dt>Last activity</dt><dd>{lastActivity ? new Date(lastActivity.createdAt).toLocaleDateString() : 'No activity yet'}</dd></div>
              <div><dt>Last contacted</dt><dd>{opportunity.lastContactedAt || 'Not logged'}</dd></div>
              <div><dt>Updated</dt><dd>{opportunity.updatedAt ? new Date(opportunity.updatedAt).toLocaleDateString() : 'Not saved'}</dd></div>
              <div><dt>Source trail</dt><dd>{opportunity.sourceLabel || opportunity.sourceType || 'Manual save'}</dd></div>
              <div><dt>Source file</dt><dd>{opportunity.sourceFileName || 'Not recorded'}</dd></div>
              <div><dt>Imported</dt><dd>{opportunity.sourceImportedAt ? new Date(opportunity.sourceImportedAt).toLocaleDateString() : 'Manual/current quote'}</dd></div>
              <div><dt>Confidence</dt><dd>{opportunity.sourceConfidence || 'Reviewed summary'}</dd></div>
            </dl>

            {opportunity.sourceWarnings.length ? (
              <div className="opportunity-source-note">
                <strong>Source notes</strong>
                <ul className="notice-list">
                  {opportunity.sourceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}

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

            <div className="opportunity-follow-up-grid">
              <FollowUpComposer
                draft={draft}
                opportunity={opportunity}
                playbook={playbook}
                selectedChannel={selectedChannel}
                selectedTone={selectedTone}
                onChannelChange={(value) => setChannelByOpportunity((current) => ({ ...current, [opportunity.id]: value }))}
                onCopyDraft={() => navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`)}
                onLogSent={() => logSentActivity(opportunity, draft)}
                onSaveDraft={() => saveDraftActivity(opportunity, draft)}
                onToneChange={(value) => setToneByOpportunity((current) => ({ ...current, [opportunity.id]: value }))}
              />
              <ActivityTimeline
                activities={activities}
                noteBody={noteBody}
                noteChannel={noteChannel}
                noteType={noteType}
                onAddNote={() => {
                  if (!noteBody.trim()) return
                  addOpportunityActivity(opportunity.id, {
                    type: noteType,
                    title: titleLabel(noteType),
                    body: noteBody,
                    channel: noteChannel,
                  })
                  setNoteBodyByOpportunity((current) => ({ ...current, [opportunity.id]: '' }))
                  refreshActivities()
                }}
                onDeleteActivity={(activityId) => {
                  removeOpportunityActivity(activityId)
                  refreshActivities()
                }}
                onMarkDraftSent={(activity) => {
                  addOpportunityActivity(opportunity.id, {
                    type: 'follow-up-sent',
                    title: activity.title || 'Follow-up sent',
                    body: activity.body,
                    channel: activity.channel,
                    metadata: { fromDraftId: activity.id },
                  })
                  onUpdateOpportunity(opportunity.id, buildSentOpportunityPatch(opportunity))
                  refreshActivities()
                }}
                onNoteBodyChange={(value) => setNoteBodyByOpportunity((current) => ({ ...current, [opportunity.id]: value }))}
                onNoteChannelChange={(value) => setNoteChannelByOpportunity((current) => ({ ...current, [opportunity.id]: value }))}
                onNoteTypeChange={(value) => setNoteTypeByOpportunity((current) => ({ ...current, [opportunity.id]: value }))}
              />
            </div>
                </>
              )
            })()}
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
