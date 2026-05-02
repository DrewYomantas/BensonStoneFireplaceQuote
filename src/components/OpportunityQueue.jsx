import { useMemo, useState } from 'react'
import OpportunityWorkspace from './OpportunityWorkspace.jsx'
import {
  listOpportunityActivities,
} from '../lib/opportunityActivity.js'
import { getChannelHints, recommendFollowUpCadence, summarizeCadence } from '../lib/followUpCadence.js'
import {
  filterOpportunities,
  summarizeOpportunities,
} from '../lib/opportunities.js'
import { getWorkspaceSourceSummary } from '../lib/opportunityWorkspace.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needs-review', label: 'Needs Review' },
  { key: 'ready-for-proposal', label: 'Ready for Proposal' },
  { key: 'follow-up-needed', label: 'Follow-Up Needed' },
  { key: 'waiting-on-customer', label: 'Waiting on Customer' },
  { key: 'closed-reference', label: 'Closed / Reference' },
]

function titleLabel(value) {
  return String(value || '').split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function cadenceBadgeClass(priority) {
  if (priority === 'blocked') return 'bs-badge bs-badge--blocked'
  if (priority === 'today')   return 'bs-badge bs-badge--warning'
  if (priority === 'soon')    return 'bs-badge bs-badge--warm'
  if (priority === 'waiting') return 'bs-badge bs-badge--cool'
  return 'bs-badge bs-badge--unknown'
}

function sourceBadgeLabel(sourceType) {
  if (sourceType === 'quote-polish') return 'Active Quote'
  if (sourceType === 'manual')       return 'Manual Recovery'
  if ((sourceType || '').startsWith('bulk-')) return 'Bulk Upload'
  return 'Recovery'
}

function SummaryPill({ label, value, tone }) {
  const cls = tone === 'warn' ? 'bs-oq-pill bs-oq-pill--warn'
            : tone === 'good' ? 'bs-oq-pill bs-oq-pill--good'
            : 'bs-oq-pill'
  return (
    <span className={cls}>
      <strong>{value}</strong> {label}
    </span>
  )
}

function QueueCard({ opportunity, activities, onOpen }) {
  const cadence = useMemo(() =>
    recommendFollowUpCadence({ opportunity, activities }),
    [opportunity, activities]
  )
  const source = useMemo(() => getWorkspaceSourceSummary(opportunity), [opportunity])
  const channelHints = getChannelHints(opportunity)
  const lastActivity = activities[0] || null

  const hasBlockers = opportunity.warnings?.length > 0
  const topWarning = hasBlockers ? opportunity.warnings[0] : null

  return (
    <article className="bs-oq-card">
      {/* ── Row 1: Name + cadence badge ── */}
      <div className="bs-oq-card__head">
        <div className="bs-oq-card__identity">
          <h3 className="bs-oq-card__name">
            {opportunity.customerName || 'Customer name missing'}
          </h3>
          <p className="bs-oq-card__meta">
            {opportunity.quoteNumber ? `Quote #${opportunity.quoteNumber}` : 'No quote number'}
            {opportunity.quoteDate ? ` · ${opportunity.quoteDate}` : ''}
            {opportunity.projectTitle ? ` · ${opportunity.projectTitle}` : ''}
          </p>
        </div>
        <div className="bs-oq-card__badges">
          <span className={cadenceBadgeClass(cadence.priority)}>{cadence.label}</span>
          <span className="bs-source-chip">{sourceBadgeLabel(opportunity.sourceType)}</span>
          {opportunity.totalAmount ? (
            <span className="bs-badge bs-badge--status">{opportunity.totalAmount}</span>
          ) : null}
        </div>
      </div>

      {/* ── Row 2: Status chips ── */}
      <div className="bs-oq-card__chips">
        <span className="bs-badge bs-badge--unknown">{titleLabel(opportunity.status)}</span>
        <span className="bs-badge bs-badge--unknown">{titleLabel(opportunity.temperature)}</span>
        <span className="bs-badge bs-badge--status">{titleLabel(opportunity.proposalReadiness)}</span>
        {channelHints.slice(0, 2).map((h) => (
          <span key={h} className="bs-oq-hint">{h}</span>
        ))}
      </div>

      {/* ── Row 3: Next action + latest activity ── */}
      <div className="bs-queue-card__work">
        <div>
          <span>Next action</span>
          <strong>{opportunity.nextAction || cadence.nextActionCopy || 'Review opportunity'}</strong>
          {opportunity.nextActionDue ? <em>{opportunity.nextActionDue}</em> : null}
        </div>
        <div>
          <span>Latest activity</span>
          <strong>
            {lastActivity
              ? `${lastActivity.title || titleLabel(lastActivity.type)} · ${new Date(lastActivity.createdAt).toLocaleDateString()}`
              : 'No activity yet'}
          </strong>
          {lastActivity?.body ? (
            <em>{lastActivity.body.slice(0, 80)}{lastActivity.body.length > 80 ? '…' : ''}</em>
          ) : null}
        </div>
      </div>

      {/* ── Row 4: Warning if present ── */}
      {topWarning ? (
        <div className="bs-queue-card__warning">
          {topWarning}
          {opportunity.warnings.length > 1 ? ` (+${opportunity.warnings.length - 1} more)` : ''}
        </div>
      ) : null}

      {/* ── Row 5: Source trail + Open Workspace ── */}
      <div className="bs-oq-card__footer">
        <span className="bs-oq-card__source-note">
          {source.sourceTypeLabel}
          {source.sourceDate ? ` · ${new Date(source.sourceDate).toLocaleDateString()}` : ''}
        </span>
        <button
          type="button"
          className="bs-oq-open-btn"
          onClick={() => onOpen(opportunity.id)}
        >
          Open Workspace →
        </button>
      </div>
    </article>
  )
}

export default function OpportunityQueue({
  filter,
  onFilterChange,
  onSaveCurrent,
  onUpdateOpportunity,
  opportunities,
  playbooks,
  saveState,
}) {
  const [activityVersion, setActivityVersion] = useState(0)
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(null)

  const summary = useMemo(() => summarizeOpportunities(opportunities), [opportunities])
  const visible = useMemo(() => filterOpportunities(opportunities, filter), [opportunities, filter])

  const activityCache = useMemo(() => {
    void activityVersion
    return Object.fromEntries(
      opportunities.map((o) => [o.id, listOpportunityActivities(o.id)])
    )
  }, [activityVersion, opportunities])

  const cadenceSummary = useMemo(() =>
    summarizeCadence(opportunities, activityCache),
    [activityCache, opportunities]
  )

  function refreshActivities() {
    setActivityVersion((v) => v + 1)
  }

  // Workspace view
  if (selectedOpportunityId) {
    const selected = opportunities.find((o) => o.id === selectedOpportunityId)
    if (!selected) {
      setSelectedOpportunityId(null)
    } else {
      return (
        <OpportunityWorkspace
          opportunity={selected}
          playbooks={playbooks}
          onClose={() => setSelectedOpportunityId(null)}
          onUpdateOpportunity={(id, patch) => {
            onUpdateOpportunity(id, patch)
            refreshActivities()
          }}
        />
      )
    }
  }

  return (
    <div className="bs-oq">
      {/* ── Page header ── */}
      <div className="bs-oq__head">
        <div>
          <p className="bs-lens__eyebrow">Opportunity Queue</p>
          <h2 className="bs-oq__title">Fireplace Quote Follow-Up Board</h2>
          <p className="bs-oq__caption">Local-only queue of reviewed quotes, follow-up paths, and proposal state.</p>
        </div>
        <button type="button" className="bs-oq-save-btn" onClick={onSaveCurrent}>
          Save current quote to queue
        </button>
      </div>

      {saveState ? <p className="bs-oq__save-status">{saveState}</p> : null}

      {/* ── Summary pills ── */}
      <div className="bs-oq__summary">
        <SummaryPill label="Needs Review" value={summary.needsReview} tone="warn" />
        <SummaryPill label="Ready for Proposal" value={summary.readyForProposal} tone="good" />
        <SummaryPill label="Follow-Up Needed" value={summary.followUpNeeded} />
        <SummaryPill label="Waiting on Customer" value={summary.waitingOnCustomer} />
        <SummaryPill label="Closed / Reference" value={summary.closedReference} />
      </div>

      {/* ── Attention signals ── */}
      {(cadenceSummary.needsFollowUp > 0 || cadenceSummary.staleOpportunities > 0 || cadenceSummary.missingContactInfo > 0) ? (
        <div className="bs-oq__attention">
          {cadenceSummary.needsFollowUp > 0 && (
            <span className="bs-oq__attention-item bs-oq__attention-item--warn">
              {cadenceSummary.needsFollowUp} need follow-up
            </span>
          )}
          {cadenceSummary.staleOpportunities > 0 && (
            <span className="bs-oq__attention-item bs-oq__attention-item--warn">
              {cadenceSummary.staleOpportunities} stale
            </span>
          )}
          {cadenceSummary.missingContactInfo > 0 && (
            <span className="bs-oq__attention-item bs-oq__attention-item--warn">
              {cadenceSummary.missingContactInfo} missing contact
            </span>
          )}
          {cadenceSummary.readyForProposal > 0 && (
            <span className="bs-oq__attention-item bs-oq__attention-item--good">
              {cadenceSummary.readyForProposal} ready to send
            </span>
          )}
        </div>
      ) : null}

      {/* ── Filter chips ── */}
      <div className="bs-oq__filters" aria-label="Opportunity filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`bs-oq-filter ${filter === f.key ? 'bs-oq-filter--active' : ''}`}
            onClick={() => onFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Card list ── */}
      <div className="bs-oq__list">
        {visible.length ? visible.map((opportunity) => (
          <QueueCard
            key={opportunity.id}
            opportunity={opportunity}
            activities={activityCache[opportunity.id] || []}
            onOpen={setSelectedOpportunityId}
          />
        )) : (
          <div className="bs-queue-empty">
            <p style={{ fontWeight: 700, color: '#173321', marginBottom: 6 }}>
              {filter === 'all' ? 'No opportunities in queue yet.' : `No ${titleLabel(filter)} opportunities.`}
            </p>
            <p style={{ fontSize: 13 }}>
              {filter === 'all'
                ? 'Save a reviewed quote from Quote Polish or Quote Recovery to start tracking follow-ups.'
                : 'Try a different filter or check All.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
