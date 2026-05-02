import { useMemo, useState } from 'react'
import {
  getWorkspaceProposalPanel,
  getWorkspaceReadinessWarnings,
  getWorkspaceSourceSummary,
  getWorkspaceVendorRef,
  opportunityToQuoteFields,
} from '../lib/opportunityWorkspace.js'
import {
  addOpportunityActivity,
  buildSentOpportunityPatch,
  listOpportunityActivities,
} from '../lib/opportunityActivity.js'
import {
  deriveRecoveryRecommendation,
  getRecoveryFollowUpDraft,
  isSafeActivityForStatus,
  recoveryActivityOptions,
} from '../lib/oldQuoteRecovery.js'
import { updateOpportunity } from '../lib/opportunities.js'
import { deriveShowroomDisplayContext, listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import { listVendors, matchVendorToQuote } from '../lib/vendorPriceBooks.js'
import ShowroomDisplayPanel from './ShowroomDisplayPanel.jsx'

function titleCase(str) {
  return String(str || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function temperatureBadgeClass(temp) {
  if (temp === 'hot') return 'bs-badge bs-badge--hot'
  if (temp === 'warm') return 'bs-badge bs-badge--warm'
  if (temp === 'cool') return 'bs-badge bs-badge--cool'
  return 'bs-badge bs-badge--unknown'
}

// ── Follow-up draft panel ─────────────────────────────────────────

function DraftPanel({ opportunity, displayContext }) {
  const [tone, setTone] = useState('reactivation')
  const [channel, setChannel] = useState('email')
  const [copyStatus, setCopyStatus] = useState('')

  const draft = useMemo(
    () => getRecoveryFollowUpDraft(opportunity, { tone, channel, displayContext }),
    [opportunity, tone, channel, displayContext],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
      setCopyStatus('Draft copied.')
      addOpportunityActivity(opportunity.id, {
        type: 'follow-up-draft',
        title: 'Draft copied to clipboard',
        body: `${titleCase(tone)} · ${channel}`,
        channel,
      })
    } catch {
      setCopyStatus('Could not copy — select the text instead.')
    }
  }

  return (
    <div className="bs-draft">
      <p className="bs-recovery__section-label">Follow-Up Draft</p>
      <div className="bs-draft__controls">
        <select className="bs-draft__select" value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="reactivation">Reactivation</option>
          <option value="warm">Warm</option>
          <option value="clarification">Clarification</option>
          <option value="short">Short</option>
        </select>
        <select className="bs-draft__select" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="phone-script">Phone Script</option>
        </select>
        <button
          type="button"
          className="bs-lens__copy"
          onClick={handleCopy}
          disabled={draft.unsafeToSend && !draft.body}
        >
          Copy Draft
        </button>
        {copyStatus ? <span className="bs-lens__copy-status">{copyStatus}</span> : null}
      </div>

      {draft.unsafeToSend && draft.warnings.length > 0 && (
        <div className="bs-draft__warnings">
          {draft.warnings.map((w) => <p key={w} className="bs-draft__warning">{w}</p>)}
        </div>
      )}

      <div>
        <p className="bs-draft__subject">Subject: {draft.subject}</p>
        <div className="bs-draft__body">
          {draft.body || '(No draft available for this channel/tone combination.)'}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: '#8a481d' }}>
        Review before sending. No automatic sending. Copy the draft and send manually.
      </p>
    </div>
  )
}

// ── Activity log ──────────────────────────────────────────────────

function ActivityLog({ opportunity, activities, onRefresh }) {
  const [actType, setActType] = useState('note')
  const [actNote, setActNote] = useState('')
  const [actChannel, setActChannel] = useState('manual')

  const safeOptions = recoveryActivityOptions.filter((opt) =>
    isSafeActivityForStatus(opt.type, opportunity.status),
  )

  function handleLog() {
    if (!actType || !isSafeActivityForStatus(actType, opportunity.status)) return
    addOpportunityActivity(opportunity.id, {
      type: actType,
      title: titleCase(actType.replace(/-/g, ' ')),
      body: actNote,
      channel: actChannel,
    })
    if (actType === 'follow-up-sent') {
      updateOpportunity(opportunity.id, buildSentOpportunityPatch(opportunity))
    }
    setActNote('')
    if (onRefresh) onRefresh()
  }

  return (
    <div className="bs-activity">
      <p className="bs-recovery__section-label">Activity Log</p>
      <div className="bs-activity__form">
        <div className="bs-activity__form-row">
          <select
            className="bs-draft__select"
            value={actType}
            onChange={(e) => setActType(e.target.value)}
          >
            {safeOptions.map((opt) => (
              <option key={`${opt.type}-${opt.label}`} value={opt.type}>{opt.label}</option>
            ))}
          </select>
          <select
            className="bs-draft__select"
            value={actChannel}
            onChange={(e) => setActChannel(e.target.value)}
          >
            <option value="manual">Manual</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="voicemail">Voicemail</option>
          </select>
        </div>
        <textarea
          className="bs-activity__form-textarea"
          rows={2}
          placeholder="Optional note…"
          value={actNote}
          onChange={(e) => setActNote(e.target.value)}
        />
        <button
          type="button"
          className="bs-lens__copy"
          onClick={handleLog}
          style={{ justifySelf: 'start' }}
        >
          Log Activity
        </button>
      </div>

      {activities.length > 0 ? (
        <div className="bs-activity__list">
          {activities.map((act) => (
            <div key={act.id} className="bs-activity__item">
              <div className="bs-activity__item-head">
                <span className="bs-activity__type">{titleCase(act.type.replace(/-/g, ' '))}</span>
                <span className="bs-activity__date">{formatDate(act.createdAt)}</span>
              </div>
              {act.body ? <p className="bs-activity__body">{act.body}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>No activity logged yet.</p>
      )}
    </div>
  )
}

// ── Main workspace component ──────────────────────────────────────

export default function OpportunityWorkspace({ opportunity, onBack, onRefresh }) {
  const [activities, setActivities] = useState(() => listOpportunityActivities(opportunity.id))

  const displayRecords = useMemo(() => listDisplayRecords(), [])
  const displayContext = useMemo(
    () => deriveShowroomDisplayContext({ displayRecords, opportunity }),
    [displayRecords, opportunity],
  )
  const matchedVendors = useMemo(
    () => matchVendorToQuote(listVendors(), { fields: opportunityToQuoteFields(opportunity), lineItems: [] }),
    [opportunity],
  )

  const source = useMemo(() => getWorkspaceSourceSummary(opportunity), [opportunity])
  const readinessWarnings = useMemo(() => getWorkspaceReadinessWarnings(opportunity), [opportunity])
  const proposalPanel = useMemo(() => getWorkspaceProposalPanel(opportunity), [opportunity])
  const vendorRef = useMemo(() => getWorkspaceVendorRef(matchedVendors), [matchedVendors])
  const rec = useMemo(() => deriveRecoveryRecommendation(opportunity), [opportunity])

  const total = opportunity.originalQuoteAmount || opportunity.quotationTotal

  function handleRefresh() {
    setActivities(listOpportunityActivities(opportunity.id))
    if (onRefresh) onRefresh()
  }

  return (
    <div className="bs-detail">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="bs-detail__sidebar">

        <div>
          <button type="button" className="bs-lens__copy" onClick={onBack}>← Back to Queue</button>
        </div>

        {/* Customer Snapshot */}
        <div>
          <p className="bs-recovery__section-label">Opportunity</p>
          <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#173321' }}>
            {opportunity.customerName || 'Unnamed Customer'}
          </p>
          {opportunity.quoteNumber && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>Quote #{opportunity.quoteNumber}</p>
          )}
          {opportunity.quoteDate && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>Quoted {opportunity.quoteDate}</p>
          )}
          {opportunity.projectTitle && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{opportunity.projectTitle}</p>
          )}
          {opportunity.customerEmail && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{opportunity.customerEmail}</p>
          )}
          {opportunity.customerPhone && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{opportunity.customerPhone}</p>
          )}
          {total && (
            <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 800, color: '#2d2217' }}>{total}</p>
          )}
        </div>

        {/* Source + Temperature badges */}
        <div className="bs-queue-card__badges" style={{ marginTop: 0 }}>
          <span className="bs-source-chip">{source.sourceTypeLabel}</span>
          {opportunity.temperature && opportunity.temperature !== 'unknown' ? (
            <span className={temperatureBadgeClass(opportunity.temperature)}>
              {titleCase(opportunity.temperature)}
            </span>
          ) : null}
        </div>

        {/* Next Action */}
        <div className={`bs-rec ${rec.safe ? 'bs-rec--safe' : 'bs-rec--blocked'}`}>
          <p className="bs-recovery__section-label">Next Action</p>
          <p className="bs-rec__label">{rec.label}</p>
          <p className="bs-rec__reason">{rec.reason}</p>
        </div>

        {/* Safety / Readiness Strip */}
        {readinessWarnings.length > 0 && (
          <div className="bs-recovery__warnings">
            <p className="bs-recovery__section-label">Internal Warnings</p>
            <ul className="bs-lens-list bs-lens-list--warning">
              {readinessWarnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Proposal Readiness — active BisTrack quotes only */}
        {proposalPanel.isActive && (
          <div className="bs-workspace-panel">
            <p className="bs-recovery__section-label">Proposal Readiness</p>
            <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#173321' }}>
              {proposalPanel.readinessLabel}
            </p>
            <p style={{ margin: '0 0 3px', fontSize: 12, color: '#6b5a47' }}>{proposalPanel.modeLabel}</p>
            <p style={{ margin: '0 0 3px', fontSize: 12, color: '#6b5a47' }}>{proposalPanel.lineItemState}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#4f3e2f', fontWeight: 600 }}>{proposalPanel.nextStep}</p>
          </div>
        )}

        {/* Source Trail */}
        {(source.sourceLabel || source.safeFileName || source.sourceDate) ? (
          <div>
            <p className="bs-recovery__section-label">Quote Source</p>
            {source.sourceLabel ? (
              <p style={{ margin: '0 0 3px', fontSize: 12, color: '#4f3e2f' }}>{source.sourceLabel}</p>
            ) : null}
            {source.safeFileName ? (
              <p style={{ margin: '0 0 3px', fontSize: 11, color: '#8a6d4c' }}>{source.safeFileName}</p>
            ) : null}
            {source.sourceDate ? (
              <p style={{ margin: 0, fontSize: 11, color: '#8a6d4c' }}>
                {source.isActive ? 'Saved' : 'Imported'} {formatDate(source.sourceDate)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Display Context Panel */}
        <ShowroomDisplayPanel context={displayContext} title="Showroom Display Match" />

        {/* Vendor Reference Panel */}
        {vendorRef.hasVendors ? (
          <div className="bs-workspace-panel">
            <p className="bs-recovery__section-label">Vendor Reference</p>
            {vendorRef.vendors.map((v) => (
              <div key={v.id} style={{ marginBottom: 6 }}>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#173321' }}>
                  {v.name}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#8a6d4c' }}>
                  {titleCase(v.category)} · Price list {v.priceListDate || 'date unknown'}
                </p>
              </div>
            ))}
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#8a481d', fontWeight: 600 }}>
              Internal reference only — open Vendors &amp; Price Books for the current price list.
            </p>
          </div>
        ) : (
          <div className="bs-workspace-panel">
            <p className="bs-recovery__section-label">Vendor Reference</p>
            <p style={{ margin: 0, fontSize: 12, color: '#8a6d4c' }}>
              No vendor match detected from quote fields. Check Vendors &amp; Price Books for manual lookup.
            </p>
          </div>
        )}

        {/* Internal Notes */}
        {opportunity.internalNotes ? (
          <div>
            <p className="bs-recovery__section-label">Internal Notes</p>
            <p style={{ margin: 0, fontSize: 12, color: '#4f3e2f', lineHeight: 1.45 }}>
              {opportunity.internalNotes}
            </p>
          </div>
        ) : null}

        {source.isRecovery && (
          <p style={{ margin: 0, fontSize: 10, color: '#8a6d4c', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Price / availability confirmation required before sending
          </p>
        )}
      </div>

      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="bs-detail__main">
        {rec.safe ? (
          <DraftPanel opportunity={opportunity} displayContext={displayContext} />
        ) : (
          <div className="bs-draft" style={{ borderColor: 'rgba(180,106,45,0.35)' }}>
            <p className="bs-recovery__section-label">Follow-Up Draft</p>
            <p style={{ margin: 0, fontSize: 13, color: '#8a481d', fontWeight: 600 }}>
              Draft blocked — {rec.label.toLowerCase()}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{rec.reason}</p>
          </div>
        )}
        <ActivityLog opportunity={opportunity} activities={activities} onRefresh={handleRefresh} />
      </div>
    </div>
  )
}
