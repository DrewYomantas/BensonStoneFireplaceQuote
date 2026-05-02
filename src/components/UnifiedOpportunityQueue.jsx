import { useMemo, useState } from 'react'
import {
  filterQueueOpportunities,
  getLatestActivitySummary,
  getLineItemAttachmentWarning,
  getOpportunityNextActionLabel,
  getOpportunityReadinessBadge,
  getOpportunitySourceLabel,
  getQueueEmptyState,
  getQueueFilterCounts,
  listOpportunities,
  queueFilterDefinitions,
  removeOpportunity,
} from '../lib/opportunities.js'
import { listOpportunityActivities } from '../lib/opportunityActivity.js'
import { deriveShowroomDisplayContext, listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import OpportunityWorkspace from './OpportunityWorkspace.jsx'

function titleCase(str) {
  return String(str || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function temperatureBadgeClass(temp) {
  if (temp === 'hot') return 'bs-badge bs-badge--hot'
  if (temp === 'warm') return 'bs-badge bs-badge--warm'
  if (temp === 'cool') return 'bs-badge bs-badge--cool'
  return 'bs-badge bs-badge--unknown'
}

function readinessBadgeClass(tone) {
  if (tone === 'ready') return 'bs-badge bs-badge--status'
  if (tone === 'warning') return 'bs-badge bs-badge--warning'
  if (tone === 'follow-up') return 'bs-badge bs-badge--warm'
  return 'bs-badge bs-badge--unknown'
}

function QueueCard({ opportunity, activities, displayContext, onSelect, onDelete }) {
  const sourceLabel = getOpportunitySourceLabel(opportunity)
  const readiness = getOpportunityReadinessBadge(opportunity)
  const attachmentWarning = getLineItemAttachmentWarning(opportunity)
  const latestActivity = getLatestActivitySummary(activities[0], opportunity)
  const nextAction = getOpportunityNextActionLabel(opportunity)
  const total = opportunity.originalQuoteAmount || opportunity.quotationTotal
  const warningCount = (opportunity.warnings || []).filter(
    (w) => !/Sensitive BisTrack fields|quote refresh/i.test(w),
  ).length

  return (
    <div className="bs-queue-card">
      <div className="bs-queue-card__head">
        <span className="bs-queue-card__name">{opportunity.customerName || 'Unnamed'}</span>
        <span className="bs-queue-card__meta">
          {opportunity.quoteNumber ? `#${opportunity.quoteNumber}` : opportunity.sourceFileName || ''}
          {opportunity.quoteDate ? ` · ${opportunity.quoteDate}` : ''}
          {total ? ` · ${total}` : ''}
        </span>
      </div>
      <div className="bs-queue-card__source-row">
        <span className="bs-source-chip">{sourceLabel}</span>
        <div className="bs-queue-card__badges" style={{ margin: 0 }}>
          {opportunity.temperature && opportunity.temperature !== 'unknown' ? (
            <span className={temperatureBadgeClass(opportunity.temperature)}>
              {titleCase(opportunity.temperature)}
            </span>
          ) : null}
          <span className={readinessBadgeClass(readiness.tone)}>{readiness.label}</span>
          <span className="bs-badge bs-badge--unknown">{titleCase(opportunity.status || 'unknown')}</span>
          {displayContext?.chipLabel ? (
            <span className={readinessBadgeClass(displayContext.tone)}>{displayContext.chipLabel}</span>
          ) : null}
          {warningCount > 0 && (
            <span className="bs-badge bs-badge--warning">
              {warningCount} warning{warningCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      {attachmentWarning ? (
        <div className="bs-queue-card__warning">
          {attachmentWarning}. Confirm original BisTrack quote before sending.
        </div>
      ) : null}
      <div className="bs-queue-card__work">
        <div>
          <span>Next Action</span>
          <strong>{nextAction}</strong>
        </div>
        <div>
          <span>Latest Activity</span>
          <strong>{latestActivity}</strong>
        </div>
      </div>
      <div className="bs-queue-card__actions">
        <button type="button" className="bs-queue-card__action-btn" onClick={() => onSelect(opportunity)}>
          Open Workspace →
        </button>
        <button
          type="button"
          className="bs-queue-card__action-btn bs-queue-card__action-btn--danger"
          onClick={() => onDelete(opportunity.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function UnifiedOpportunityQueue() {
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('all')
  const [opportunities, setOpportunities] = useState(listOpportunities)

  function refreshOpportunities() {
    setOpportunities(listOpportunities())
  }

  function handleSelectOpportunity(opportunity) {
    setSelectedId(opportunity.id)
  }

  function handleDeleteOpportunity(id) {
    removeOpportunity(id)
    refreshOpportunities()
  }

  function handleBack() {
    refreshOpportunities()
    setSelectedId('')
  }

  const displayRecords = useMemo(() => listDisplayRecords(), [])

  const activityCache = useMemo(
    () => Object.fromEntries(
      opportunities.map((opp) => [opp.id, listOpportunityActivities(opp.id)]),
    ),
    [opportunities],
  )

  const displayContextCache = useMemo(
    () => Object.fromEntries(
      opportunities.map((opp) => [
        opp.id,
        deriveShowroomDisplayContext({ displayRecords, opportunity: opp }),
      ]),
    ),
    [displayRecords, opportunities],
  )

  const filteredOpportunities = useMemo(
    () => filterQueueOpportunities(opportunities, filter),
    [opportunities, filter],
  )

  const filterCounts = useMemo(() => getQueueFilterCounts(opportunities), [opportunities])
  const emptyState = getQueueEmptyState(filter)

  const selectedOpportunity = useMemo(
    () => opportunities.find((o) => o.id === selectedId) || null,
    [opportunities, selectedId],
  )

  if (selectedOpportunity) {
    return (
      <OpportunityWorkspace
        opportunity={selectedOpportunity}
        onBack={handleBack}
        onRefresh={refreshOpportunities}
      />
    )
  }

  return (
    <div className="bs-recovery">
      <div className="bs-queue-board-head">
        <div>
          <p className="bs-lens__eyebrow">Internal Sales Workbench</p>
          <h2 style={{ margin: '2px 0 4px', color: '#173321', fontSize: 20, fontWeight: 800 }}>Opportunity Queue</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>All saved quotes and recovery records. Open a workspace to review, draft follow-ups, and log activity.</p>
        </div>
      </div>
      <div className="bs-recovery__toolbar no-print">
        <div className="bs-recovery__filters">
          {queueFilterDefinitions.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`bs-section-toggle ${filter === f.value ? 'bs-section-toggle--active' : ''}`}
              onClick={() => setFilter(f.value)}
              style={{ padding: '6px 12px' }}
            >
              <span>{f.label}</span>
              <span className="bs-filter-count">{filterCounts[f.value] || 0}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bs-button bs-button--ghost"
          onClick={refreshOpportunities}
          style={{ marginLeft: 'auto', color: '#173321', borderColor: 'rgba(23,51,33,0.3)' }}
        >
          Refresh
        </button>
      </div>

      {filteredOpportunities.length === 0 ? (
        <div className="bs-queue-empty">
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#173321', fontSize: 16 }}>
            {emptyState.title}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>{emptyState.body}</p>
        </div>
      ) : (
        <div className="bs-queue">
          {filteredOpportunities.map((opp) => (
            <QueueCard
              key={opp.id}
              opportunity={opp}
              activities={activityCache[opp.id] || []}
              displayContext={displayContextCache[opp.id]}
              onSelect={handleSelectOpportunity}
              onDelete={handleDeleteOpportunity}
            />
          ))}
        </div>
      )}
    </div>
  )
}
