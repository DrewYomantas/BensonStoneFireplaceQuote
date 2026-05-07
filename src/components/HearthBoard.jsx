import { useMemo } from 'react'
import {
  getOpportunityLane,
  getOpportunityMomentum,
  getOpportunitySeverity,
  getOpportunitySourceLabel,
  getOpportunityWarnings,
  groupOpportunitiesByLane,
} from '../lib/opportunityBoard.js'
import { getOpportunityNextActionLabel } from '../lib/opportunities.js'

const MOMENTUM_LABEL = {
  hot:     'Hot',
  warm:    'Warm',
  cooling: 'Cooling',
  cold:    'Cold',
  won:     'Won',
}

function MomentumBadge({ momentum }) {
  if (!momentum) return null
  return <span className={`hearth-momentum hearth-momentum--${momentum}`}>{MOMENTUM_LABEL[momentum] || momentum}</span>
}

function SeverityChip({ severity, warningCount }) {
  if (severity === 'block') return <span className="hearth-severity hearth-severity--block">Review needed</span>
  if (severity === 'warn') return <span className="hearth-severity hearth-severity--warn">{warningCount} warning{warningCount === 1 ? '' : 's'}</span>
  if (severity === 'ok') return <span className="hearth-severity hearth-severity--ok">Ready</span>
  return null
}

function SourceTag({ label }) {
  if (!label) return null
  return <span className="hearth-source-tag">{label}</span>
}

function formatDateLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pickLastTouchLabel(opportunity) {
  if (opportunity.lastContactedAt) return `Last touch ${formatDateLabel(opportunity.lastContactedAt)}`
  if (opportunity.updatedAt) return `Updated ${formatDateLabel(opportunity.updatedAt)}`
  if (opportunity.quoteDate) return `Quoted ${opportunity.quoteDate}`
  return ''
}

function HearthCard({ opportunity, laneTone, onSelect }) {
  const momentum = getOpportunityMomentum(opportunity)
  const severity = getOpportunitySeverity(opportunity)
  const sourceLabel = getOpportunitySourceLabel(opportunity)
  const warnings = getOpportunityWarnings(opportunity)
  const total = opportunity.originalQuoteAmount || opportunity.quotationTotal
  const nextAction = getOpportunityNextActionLabel(opportunity)
  const lastTouch = pickLastTouchLabel(opportunity)

  return (
    <button
      type="button"
      className="hearth-card"
      onClick={() => onSelect(opportunity)}
      aria-label={`Open ${opportunity.customerName || 'opportunity'} workspace`}
    >
      <span className={`hearth-card__rule hearth-card__rule--${laneTone}`} aria-hidden="true" />
      <div className="hearth-card__head">
        <div className="hearth-card__name">{opportunity.customerName || 'Unnamed'}</div>
        {total ? <div className="hearth-card__amount">{total}</div> : null}
      </div>
      {opportunity.projectType ? (
        <div className="hearth-card__project">{opportunity.projectType}</div>
      ) : null}
      <div className="hearth-card__chips">
        <MomentumBadge momentum={momentum} />
        <SeverityChip severity={severity} warningCount={warnings.length} />
        <SourceTag label={sourceLabel} />
      </div>
      <div className="hearth-card__next">
        <div className="hearth-card__next-label">Next</div>
        <div className="hearth-card__next-text">{nextAction}</div>
      </div>
      <div className="hearth-card__foot">
        <span>{lastTouch}</span>
        <span className="hearth-card__open">Open Workspace ›</span>
      </div>
    </button>
  )
}

function StageLane({ lane, onSelect }) {
  return (
    <section className={`hearth-board__lane hearth-board__lane--${lane.tone}`}>
      <header className="hearth-board__lane-header">
        <span className={`hearth-board__lane-rule hearth-board__lane-rule--${lane.tone}`} aria-hidden="true" />
        <span className="hearth-board__lane-title">{lane.label}</span>
        <span className="hearth-board__lane-count">{lane.opportunities.length}</span>
      </header>
      {lane.opportunities.length === 0 ? (
        <div className="hearth-board__lane-empty">Nothing in this lane right now.</div>
      ) : (
        <div className="hearth-board__lane-list">
          {lane.opportunities.map((opp) => (
            <HearthCard
              key={opp.id}
              opportunity={opp}
              laneTone={lane.tone}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function HearthBoard({ opportunities = [], onOpen }) {
  const visible = useMemo(
    () => opportunities.filter((opp) => getOpportunityLane(opp) !== null),
    [opportunities],
  )
  const lanes = useMemo(() => groupOpportunitiesByLane(visible), [visible])
  const totalCount = visible.length

  return (
    <div className="hearth-board">
      <header className="hearth-board__hero">
        <div className="hearth-board__hero-eyebrow">Sales Workbench</div>
        <h1 className="hearth-board__hero-title">Hearth Board</h1>
        <p className="hearth-board__hero-copy">
          Every saved opportunity, grouped by where it stands. Paper for reading, terracotta for what needs movement, moss for what&rsquo;s done.
        </p>
        <div className="hearth-board__hero-stats">
          <div><strong>{totalCount}</strong><span>opportunities</span></div>
          {lanes.map((lane) => (
            <div key={lane.id}><strong>{lane.opportunities.length}</strong><span>{lane.label}</span></div>
          ))}
        </div>
      </header>
      {totalCount === 0 ? (
        <div className="hearth-board__empty">
          <p><em>No opportunities yet.</em> Drop a BisTrack PDF or recover an old quote to populate the board.</p>
        </div>
      ) : (
        <div className="hearth-board__lanes">
          {lanes.map((lane) => (
            <StageLane key={lane.id} lane={lane} onSelect={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}
