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
import { getChannelHints, recommendFollowUpCadence } from '../lib/followUpCadence.js'
import {
  getWorkspaceProposalPanel,
  getWorkspaceReadinessWarnings,
  getWorkspaceSourceSummary,
  getWorkspaceVendorRef,
} from '../lib/opportunityWorkspace.js'
import { deriveShowroomDisplayContext, listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import { listVendors, matchVendorToQuote } from '../lib/vendorPriceBooks.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function ReadinessStrip({ warnings }) {
  if (!warnings.length) return (
    <div className="ow-readiness-strip ow-readiness-strip--clear">
      <span>✓ No active blockers</span>
    </div>
  )
  return (
    <div className="ow-readiness-strip ow-readiness-strip--warn">
      <strong>Review before proceeding</strong>
      <ul className="ow-warning-list">
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  )
}

function SourceTrail({ source }) {
  return (
    <section className="ow-panel">
      <p className="ow-panel__eyebrow">Quote Source</p>
      <h3 className="ow-panel__title">{source.sourceTypeLabel}</h3>
      {source.sourceLabel ? <p className="ow-panel__line"><strong>Source:</strong> {source.sourceLabel}</p> : null}
      {source.safeFileName ? <p className="ow-panel__line"><strong>File:</strong> {source.safeFileName}</p> : null}
      {source.sourceDate ? (
        <p className="ow-panel__line">
          <strong>{source.isActive ? 'Saved:' : 'Imported:'}</strong>{' '}
          {new Date(source.sourceDate).toLocaleDateString()}
        </p>
      ) : null}
    </section>
  )
}

function ProposalReadinessPanel({ panel }) {
  if (!panel.isActive) {
    return (
      <section className="ow-panel">
        <p className="ow-panel__eyebrow">Proposal Readiness</p>
        <p className="ow-panel__hint">{panel.nextStep}</p>
      </section>
    )
  }
  const toneClass = panel.readinessTone === 'ready' ? 'ow-badge--ready' : panel.readinessTone === 'warning' ? 'ow-badge--warning' : 'ow-badge--blocked'
  return (
    <section className="ow-panel">
      <p className="ow-panel__eyebrow">Proposal Readiness</p>
      <div className="ow-panel__row">
        <h3 className="ow-panel__title">{panel.readinessLabel}</h3>
        <span className={`ow-badge ${toneClass}`}>{panel.readinessTone}</span>
      </div>
      <p className="ow-panel__line"><strong>Mode:</strong> {panel.modeLabel}</p>
      <p className="ow-panel__line">{panel.lineItemState}</p>
      <p className="ow-panel__hint">{panel.nextStep}</p>
    </section>
  )
}

function DisplayContextPanel({ opportunity }) {
  const context = useMemo(() => {
    const fields = {
      CUSTOMER_NAME: opportunity.customerName || '',
      QUOTE_NO: opportunity.quoteNumber || '',
    }
    const lineItems = opportunity.lineItems || []
    return deriveShowroomDisplayContext({ displayRecords: listDisplayRecords(), fields, lineItems })
  }, [opportunity])

  if (!context || context.status === 'none') {
    return (
      <section className="ow-panel">
        <p className="ow-panel__eyebrow">Display Context</p>
        <p className="ow-panel__hint">No display register match found for this record.</p>
        <p className="ow-panel__safe-note">Internal reference only — do not add uncertain display info to customer copy.</p>
      </section>
    )
  }

  return (
    <section className="ow-panel">
      <p className="ow-panel__eyebrow">Display Context</p>
      <div className="ow-panel__row">
        <h3 className="ow-panel__title">{context.headline || context.chipLabel}</h3>
        <span className={`ow-badge ${context.tone === 'ready' ? 'ow-badge--ready' : 'ow-badge--warning'}`}>{context.chipLabel}</span>
      </div>
      {context.locationLabel ? <p className="ow-panel__line"><strong>Location:</strong> {context.locationLabel}</p> : null}
      {context.note ? <p className="ow-panel__line">{context.note}</p> : null}
      {context.talkingPoints?.length ? (
        <ul className="ow-hint-list">
          {context.talkingPoints.map((tp) => <li key={tp}>{tp}</li>)}
        </ul>
      ) : null}
      <p className="ow-panel__safe-note">Internal reference only — confirm display details before mentioning to customer.</p>
    </section>
  )
}

function VendorReferencePanel({ opportunity }) {
  const vendorRef = useMemo(() => {
    const fields = {
      CUSTOMER_NAME: opportunity.customerName || '',
      QUOTE_NO: opportunity.quoteNumber || '',
      PROJECT_TITLE: opportunity.projectTitle || '',
    }
    const lineItems = opportunity.lineItems || []
    const matched = matchVendorToQuote(listVendors(), { fields, lineItems })
    return getWorkspaceVendorRef(matched)
  }, [opportunity])

  if (!vendorRef.hasVendors) {
    return (
      <section className="ow-panel">
        <p className="ow-panel__eyebrow">Vendor Reference</p>
        <p className="ow-panel__hint">No vendor match for this record. Check Vendors &amp; Price Books tab manually.</p>
        <p className="ow-panel__safe-note">Vendor pricing and file paths are internal only.</p>
      </section>
    )
  }

  return (
    <section className="ow-panel">
      <p className="ow-panel__eyebrow">Vendor Reference</p>
      {vendorRef.vendors.map((v) => (
        <div key={v.id} className="ow-vendor-item">
          <strong>{v.name}</strong>
          <span className="ow-vendor-item__cat">{v.category}</span>
          {v.priceListDate ? <span className="ow-vendor-item__date">Price list: {v.priceListDate}</span> : null}
        </div>
      ))}
      <p className="ow-panel__safe-note">Vendor pricing and file paths are internal only — do not expose in customer proposals.</p>
    </section>
  )
}

export default function OpportunityWorkspace({ opportunity, playbooks, onClose, onUpdateOpportunity }) {
  const [activityVersion, setActivityVersion] = useState(0)
  const [selectedTone, setSelectedTone] = useState(
    opportunity.status === 'follow-up-needed' ? 'reactivation' : 'warm'
  )
  const [selectedChannel, setSelectedChannel] = useState('email')
  const [noteBody, setNoteBody] = useState('')
  const [noteType, setNoteType] = useState('note')
  const [noteChannel, setNoteChannel] = useState('manual')

  const activities = useMemo(() => {
    void activityVersion
    return listOpportunityActivities(opportunity.id)
  }, [activityVersion, opportunity.id])

  const source = useMemo(() => getWorkspaceSourceSummary(opportunity), [opportunity])
  const warnings = useMemo(() => getWorkspaceReadinessWarnings(opportunity), [opportunity])
  const proposalPanel = useMemo(() => getWorkspaceProposalPanel(opportunity), [opportunity])
  const cadence = useMemo(() => recommendFollowUpCadence({ opportunity, activities }), [opportunity, activities])
  const channelHints = useMemo(() => getChannelHints(opportunity), [opportunity])

  const playbook = useMemo(() =>
    playbooks.find((p) => p.id === opportunity.selectedPlaybookId) ||
    playbooks.find((p) => p.id === opportunity.recommendedPlaybookId) ||
    null,
    [playbooks, opportunity]
  )

  const draft = useMemo(() =>
    composeFollowUpDraft({ opportunity, playbook, warnings: opportunity.warnings, tone: selectedTone, channel: selectedChannel }),
    [opportunity, playbook, selectedTone, selectedChannel]
  )

  function refreshActivities() {
    setActivityVersion((v) => v + 1)
  }

  function saveDraftActivity(draftItem) {
    addOpportunityActivity(opportunity.id, {
      type: 'follow-up-draft',
      title: draftItem.subject,
      body: draftItem.body,
      channel: draftItem.channel === 'phone-script' ? 'phone' : draftItem.channel === 'nextdoor-reply' ? 'nextdoor' : draftItem.channel,
      metadata: { tone: draftItem.tone, unsafeToSend: String(draftItem.unsafeToSend) },
    })
    refreshActivities()
  }

  function logSentActivity(draftItem) {
    addOpportunityActivity(opportunity.id, {
      type: 'follow-up-sent',
      title: draftItem.subject || 'Follow-up sent',
      body: draftItem.body,
      channel: draftItem.channel === 'phone-script' ? 'phone' : draftItem.channel === 'nextdoor-reply' ? 'nextdoor' : draftItem.channel,
      metadata: { tone: draftItem.tone, unsafeToSend: String(draftItem.unsafeToSend) },
    })
    onUpdateOpportunity(opportunity.id, buildSentOpportunityPatch(opportunity))
    refreshActivities()
  }

  const lastActivity = activities[0] || null

  return (
    <div className="ow-workspace">
      <div className="ow-workspace__bar">
        <button type="button" className="ow-back-button" onClick={onClose}>
          ← Back to Queue
        </button>
        <span className="ow-workspace__title">Opportunity Workspace</span>
      </div>

      {/* Header / Snapshot */}
      <header className="ow-header">
        <div className="ow-header__main">
          <p className="ow-header__eyebrow">{source.sourceTypeLabel}</p>
          <h2 className="ow-header__name">{opportunity.customerName || 'Customer name missing'}</h2>
          <p className="ow-header__meta">
            {opportunity.quoteNumber ? `Quote #${opportunity.quoteNumber}` : 'No quote number'}{' '}
            {opportunity.quoteDate ? `· ${opportunity.quoteDate}` : ''}
            {opportunity.projectTitle ? ` · ${opportunity.projectTitle}` : ''}
          </p>
          {opportunity.totalAmount ? (
            <p className="ow-header__amount">{opportunity.totalAmount}</p>
          ) : null}
        </div>
        <div className="ow-header__badges">
          <span className={`ow-badge ${cadence.priority === 'blocked' ? 'ow-badge--blocked' : cadence.priority === 'today' ? 'ow-badge--today' : 'ow-badge--neutral'}`}>
            {cadence.label}
          </span>
          <span className="ow-badge ow-badge--neutral">{titleLabel(opportunity.status)}</span>
          <span className="ow-badge ow-badge--neutral">{titleLabel(opportunity.temperature)}</span>
          <span className="ow-badge ow-badge--neutral">{titleLabel(opportunity.proposalReadiness)}</span>
        </div>
        <div className="ow-header__next-action">
          <span className="ow-panel__eyebrow">Next action</span>
          <strong>{opportunity.nextAction || cadence.nextActionCopy || 'Review opportunity'}</strong>
          {opportunity.nextActionDue ? <span> · Due {opportunity.nextActionDue}</span> : null}
        </div>
        {lastActivity ? (
          <div className="ow-header__last-activity">
            <span className="ow-panel__eyebrow">Latest activity</span>
            <strong>{lastActivity.title || titleLabel(lastActivity.type)}</strong>
            <span> · {new Date(lastActivity.createdAt).toLocaleDateString()}</span>
          </div>
        ) : null}
      </header>

      {/* Readiness Strip */}
      <ReadinessStrip warnings={warnings} />

      {/* Channel hints */}
      {channelHints.length ? (
        <div className="ow-channel-hints">
          {channelHints.map((h) => <span key={h} className="ow-hint-chip">{h}</span>)}
          <span className="ow-hint-chip">Suggested: {titleLabel(cadence.suggestedChannel)}</span>
        </div>
      ) : null}

      {/* Two-column body */}
      <div className="ow-body">
        <div className="ow-body__main">
          <SourceTrail source={source} />
          <ProposalReadinessPanel panel={proposalPanel} />
          <DisplayContextPanel opportunity={opportunity} />
          <VendorReferencePanel opportunity={opportunity} />

          {/* Quick edit strip */}
          <section className="ow-panel ow-panel--edit">
            <p className="ow-panel__eyebrow">Internal Fields</p>
            <div className="ow-edit-grid">
              <label className="field">
                <span>Status</span>
                <select value={opportunity.status} onChange={(e) => onUpdateOpportunity(opportunity.id, { status: e.target.value })}>
                  {['needs-review', 'ready-for-proposal', 'follow-up-needed', 'waiting-on-customer', 'closed-reference'].map((s) => (
                    <option key={s} value={s}>{titleLabel(s)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Temperature</span>
                <select value={opportunity.temperature} onChange={(e) => onUpdateOpportunity(opportunity.id, { temperature: e.target.value })}>
                  {['hot', 'warm', 'cold', 'unknown'].map((t) => (
                    <option key={t} value={t}>{titleLabel(t)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Readiness</span>
                <select value={opportunity.proposalReadiness} onChange={(e) => onUpdateOpportunity(opportunity.id, { proposalReadiness: e.target.value })}>
                  {['not-started', 'in-progress', 'ready', 'sent', 'archived'].map((r) => (
                    <option key={r} value={r}>{titleLabel(r)}</option>
                  ))}
                </select>
              </label>
              <label className="field field--wide">
                <span>Next action</span>
                <input value={opportunity.nextAction || ''} onChange={(e) => onUpdateOpportunity(opportunity.id, { nextAction: e.target.value })} />
              </label>
              <label className="field">
                <span>Due</span>
                <input type="date" value={opportunity.nextActionDue || ''} onChange={(e) => onUpdateOpportunity(opportunity.id, { nextActionDue: e.target.value })} />
              </label>
            </div>
          </section>
        </div>

        <div className="ow-body__sidebar">
          <FollowUpComposer
            draft={draft}
            opportunity={opportunity}
            playbook={playbook}
            selectedChannel={selectedChannel}
            selectedTone={selectedTone}
            onChannelChange={setSelectedChannel}
            onToneChange={setSelectedTone}
            onCopyDraft={() => navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`)}
            onLogSent={() => logSentActivity(draft)}
            onSaveDraft={() => saveDraftActivity(draft)}
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
              setNoteBody('')
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
            onNoteBodyChange={setNoteBody}
            onNoteChannelChange={setNoteChannel}
            onNoteTypeChange={setNoteType}
          />
        </div>
      </div>
    </div>
  )
}
