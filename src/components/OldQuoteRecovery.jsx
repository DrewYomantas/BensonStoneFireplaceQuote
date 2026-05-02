import { useMemo, useRef, useState } from 'react'
import {
  createOldQuoteOpportunity,
  deriveRecoveryRecommendation,
  getRecoveryFollowUpDraft,
  getRecoveryProposalPackage,
  isSafeActivityForStatus,
  recoveryActivityOptions,
  recoveryClassifications,
} from '../lib/oldQuoteRecovery.js'
import {
  filterOpportunities,
  listOpportunities,
  saveOpportunity,
  updateOpportunity,
} from '../lib/opportunities.js'
import {
  addOpportunityActivity,
  buildSentOpportunityPatch,
  listOpportunityActivities,
} from '../lib/opportunityActivity.js'
import { parseRecoveryUploadFile, parseRecoveryUploadFiles, summarizeRecoveryUploadDrafts } from '../lib/recoveryUploadIntake.js'

const emptyIntake = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  quoteNumber: '',
  quoteDate: '',
  originalQuoteAmount: '',
  quotationTotal: '',
  projectType: '',
  projectTitle: '',
  existingSetup: '',
  desiredOutcome: '',
  productsNotes: '',
  sourceFileNote: '',
  sourceLabel: '',
  sourceType: 'manual',
  sourceConfidence: '',
  sourceWarnings: [],
  sourceTrailNote: '',
  internalNotes: '',
  recoveryClassification: 'unknown',
  reviewedForFollowUp: true,
}

const queueFilters = [
  { value: 'all', label: 'All' },
  { value: 'needs-review', label: 'Needs Review' },
  { value: 'follow-up-needed', label: 'Follow Up' },
  { value: 'ready-for-proposal', label: 'Ready' },
  { value: 'closed-reference', label: 'Reference / Closed' },
]

function titleCase(str) {
  return String(str || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function classificationBadgeClass(classification) {
  if (classification === 'hot') return 'bs-badge bs-badge--hot'
  if (classification === 'warm') return 'bs-badge bs-badge--warm'
  if (classification === 'cool') return 'bs-badge bs-badge--cool'
  if (['paid-closed', 'reference-only'].includes(classification)) return 'bs-badge bs-badge--blocked'
  return 'bs-badge bs-badge--unknown'
}

function statusBadgeClass(status) {
  if (status === 'reference-only' || status === 'archived') return 'bs-badge bs-badge--blocked'
  if (status === 'needs-review') return 'bs-badge bs-badge--warning'
  if (status === 'ready-for-proposal') return 'bs-badge bs-badge--status'
  return 'bs-badge bs-badge--unknown'
}

function loadRecoveryOpportunities() {
  return listOpportunities().filter((opp) => opp.recoverySource === 'true')
}

function IntakeField({ id, label, value, onChange, multiline = false, required = false, type = 'text' }) {
  return (
    <label className={`bs-field ${multiline ? 'bs-field--wide' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(id, e.target.value)} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(id, e.target.value)} />
      )}
    </label>
  )
}

function IntakeSelect({ id, label, value, options, onChange, wide = false }) {
  return (
    <label className={`bs-field ${wide ? 'bs-field--wide' : ''}`}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(id, e.target.value)}
        style={{ font: 'inherit', fontSize: 13, padding: '7px 9px', border: '1px solid rgba(94,73,51,0.22)', borderRadius: 4, background: '#fffdf6' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  )
}

function QueueCard({ opportunity, onSelect }) {
  const rec = deriveRecoveryRecommendation(opportunity)
  const warningCount = (opportunity.warnings || []).filter((w) => !/Sensitive BisTrack fields|quote refresh/i.test(w)).length

  return (
    <button type="button" className="bs-queue-card" onClick={() => onSelect(opportunity)}>
      <div className="bs-queue-card__head">
        <span className="bs-queue-card__name">{opportunity.customerName || 'Unnamed'}</span>
        <span className="bs-queue-card__meta">
          {opportunity.quoteNumber ? `#${opportunity.quoteNumber}` : opportunity.sourceFileName || ''}
          {opportunity.quoteDate ? ` - ${opportunity.quoteDate}` : ''}
        </span>
      </div>
      <div className="bs-queue-card__subline">
        {[opportunity.originalQuoteAmount || opportunity.quotationTotal, opportunity.sourceType || opportunity.sourceLabel].filter(Boolean).join(' | ')}
      </div>
      <div className="bs-queue-card__badges">
        <span className={classificationBadgeClass(opportunity.recoveryClassification)}>
          {titleCase(opportunity.recoveryClassification || 'unknown')}
        </span>
        <span className={statusBadgeClass(opportunity.status)}>
          {titleCase(opportunity.status || 'unknown')}
        </span>
        {warningCount > 0 && (
          <span className="bs-badge bs-badge--warning">{warningCount} warning{warningCount === 1 ? '' : 's'}</span>
        )}
      </div>
      <div className="bs-queue-card__action">{rec.label}</div>
    </button>
  )
}

function WarningsList({ warnings }) {
  const visible = (warnings || []).filter((w) => !/Sensitive BisTrack fields/i.test(w))
  if (!visible.length) return null
  return (
    <div className="bs-recovery__warnings">
      <p className="bs-recovery__section-label">Warnings</p>
      <ul className="bs-lens-list bs-lens-list--warning">
        {visible.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  )
}

function SourceTrail({ opportunity }) {
  if (!opportunity.sourceTrailNote && !opportunity.sourceFileName && !opportunity.sourceType) return null
  return (
    <div>
      <p className="bs-recovery__section-label">Source Trail</p>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#4f3e2f', lineHeight: 1.45 }}>
        {opportunity.sourceTrailNote || opportunity.sourceLabel || opportunity.sourceFileName}
      </p>
      {opportunity.sourceConfidence ? (
        <p style={{ margin: 0, fontSize: 11, color: '#8a6d4c' }}>{opportunity.sourceConfidence}</p>
      ) : null}
    </div>
  )
}

function DraftPanel({ opportunity, activities }) {
  const [tone, setTone] = useState('reactivation')
  const [channel, setChannel] = useState('email')
  const [copyStatus, setCopyStatus] = useState('')

  const draft = useMemo(
    () => getRecoveryFollowUpDraft(opportunity, { tone, channel }),
    [opportunity, tone, channel],
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

  // Suppress the activities warning (passed but used to signal parent refresh after copy)
  void activities

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
        <button type="button" className="bs-lens__copy" onClick={handleCopy} disabled={draft.unsafeToSend && draft.body === ''}>
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
        <div className="bs-draft__body">{draft.body || '(No draft available for this channel/tone combination.)'}</div>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: '#8a481d' }}>
        Review before sending. No automatic sending. Copy the draft and send manually.
      </p>
    </div>
  )
}

function ActivityLog({ opportunity, activities, onRefresh }) {
  const [actType, setActType] = useState('note')
  const [actNote, setActNote] = useState('')
  const [actChannel, setActChannel] = useState('manual')

  const safeOptions = recoveryActivityOptions.filter((opt) =>
    isSafeActivityForStatus(opt.type, opportunity.status),
  )

  function handleLog() {
    if (!actType) return
    if (!isSafeActivityForStatus(actType, opportunity.status)) return

    addOpportunityActivity(opportunity.id, {
      type: actType,
      title: titleCase(actType.replace(/-/g, ' ')),
      body: actNote,
      channel: actChannel,
    })

    if (actType === 'follow-up-sent') {
      const patch = buildSentOpportunityPatch(opportunity)
      updateOpportunity(opportunity.id, patch)
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

function DetailView({ opportunity, onBack, onRefreshQueue }) {
  const [activities, setActivities] = useState(() => listOpportunityActivities(opportunity.id))

  const rec = deriveRecoveryRecommendation(opportunity)
  const pkg = useMemo(() => getRecoveryProposalPackage(opportunity), [opportunity])

  function handleRefresh() {
    setActivities(listOpportunityActivities(opportunity.id))
    if (onRefreshQueue) onRefreshQueue()
  }

  return (
    <div className="bs-detail">
      <div className="bs-detail__sidebar">
        <div>
          <button type="button" className="bs-lens__copy" onClick={onBack}>← Back to Queue</button>
        </div>

        <div>
          <p className="bs-recovery__section-label">Opportunity</p>
          <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#173321' }}>
            {opportunity.customerName || 'Unnamed Customer'}
          </p>
          {opportunity.quoteNumber && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>Quote #{opportunity.quoteNumber}</p>
          )}
          {opportunity.quoteDate && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>Originally quoted {opportunity.quoteDate}</p>
          )}
          {opportunity.customerEmail && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{opportunity.customerEmail}</p>
          )}
          {opportunity.customerPhone && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b5a47' }}>{opportunity.customerPhone}</p>
          )}
        </div>

        <div className="bs-queue-card__badges" style={{ marginTop: 0 }}>
          <span className={classificationBadgeClass(opportunity.recoveryClassification)}>
            {titleCase(opportunity.recoveryClassification || 'unknown')}
          </span>
          <span className={statusBadgeClass(opportunity.status)}>
            {titleCase(opportunity.status || 'unknown')}
          </span>
        </div>

        <div className={`bs-rec ${rec.safe ? 'bs-rec--safe' : 'bs-rec--blocked'}`}>
          <p className="bs-recovery__section-label">Next Action</p>
          <p className="bs-rec__label">{rec.label}</p>
          <p className="bs-rec__reason">{rec.reason}</p>
        </div>

        <div>
          <p className="bs-recovery__section-label">Proposal Path</p>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#173321' }}>{pkg.label}</p>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b5a47' }}>{pkg.purpose}</p>
          {pkg.internalChecklist.slice(0, 4).map((item) => (
            <p key={item} style={{ margin: '0 0 3px', fontSize: 12, color: '#4f3e2f', paddingLeft: 10 }}>· {item}</p>
          ))}
        </div>

        <WarningsList warnings={opportunity.warnings} />
        <SourceTrail opportunity={opportunity} />

        {opportunity.internalNotes ? (
          <div>
            <p className="bs-recovery__section-label">Internal Notes</p>
            <p style={{ margin: 0, fontSize: 12, color: '#4f3e2f', lineHeight: 1.45 }}>{opportunity.internalNotes}</p>
          </div>
        ) : null}

        <p style={{ margin: 0, fontSize: 10, color: '#8a6d4c', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Needs Refresh · Price/availability confirmation required before sending
        </p>
      </div>

      <div className="bs-detail__main">
        {rec.safe ? (
          <DraftPanel opportunity={opportunity} activities={activities} />
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

function IntakeForm({ onSave, onCancel }) {
  const [form, setForm] = useState(emptyIntake)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  function handleSubmit() {
    if (!form.customerName.trim() && !form.quoteNumber.trim()) {
      setError('Enter at least a customer name or quote number to continue.')
      return
    }
    const opportunity = createOldQuoteOpportunity(form)
    saveOpportunity(opportunity)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setForm(emptyIntake)
      if (onSave) onSave()
    }, 900)
  }

  const classificationOptions = recoveryClassifications.map((c) => ({ value: c, label: titleCase(c) }))
  const confidenceOptions = [
    { value: '', label: 'Unknown confidence' },
    { value: 'confirmed', label: 'Confirmed — source is reliable' },
    { value: 'estimated', label: 'Estimated — needs spot-check' },
    { value: 'uncertain', label: 'Uncertain — manual review needed' },
  ]

  return (
    <div className="bs-intake">
      <div>
        <p className="bs-lens__eyebrow">Old Quote Recovery</p>
        <h2 style={{ margin: '0 0 4px', color: '#173321', fontSize: 20 }}>Add Old Quote for Review</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>
          Fill in what you know. Fields can be left blank if information is missing.
          Pricing and product availability must be refreshed before any customer outreach.
        </p>
      </div>

      <div className="bs-form__group">
        <h3 style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#173321' }}>Customer Contact</h3>
        <div className="bs-grid">
          <IntakeField id="customerName" label="Customer Name" value={form.customerName} onChange={handleChange} required />
          <IntakeField id="customerEmail" label="Email" type="email" value={form.customerEmail} onChange={handleChange} />
          <IntakeField id="customerPhone" label="Phone" type="tel" value={form.customerPhone} onChange={handleChange} />
          <IntakeSelect
            id="recoveryClassification"
            label="Lead Temperature"
            value={form.recoveryClassification}
            options={classificationOptions}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="bs-form__group">
        <h3 style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#173321' }}>Quote Info</h3>
        <div className="bs-grid">
          <IntakeField id="quoteNumber" label="Quote Number" value={form.quoteNumber} onChange={handleChange} />
          <IntakeField id="quoteDate" label="Quote Date (MM/DD/YYYY)" value={form.quoteDate} onChange={handleChange} />
          <IntakeField id="originalQuoteAmount" label="Original Amount" value={form.originalQuoteAmount} onChange={handleChange} />
          <IntakeField id="projectType" label="Project Type" value={form.projectType} onChange={handleChange} />
        </div>
      </div>

      <div className="bs-form__group">
        <h3 style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#173321' }}>Setup + Goals</h3>
        <div className="bs-grid">
          <IntakeField id="existingSetup" label="Existing Setup (what they currently have)" value={form.existingSetup} onChange={handleChange} multiline />
          <IntakeField id="desiredOutcome" label="Customer Goal / Desired Outcome" value={form.desiredOutcome} onChange={handleChange} multiline />
          <IntakeField id="productsNotes" label="Products or Notes from Quote" value={form.productsNotes} onChange={handleChange} multiline />
        </div>
      </div>

      <div className="bs-form__group">
        <h3 style={{ margin: 0, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#173321' }}>Source Trail</h3>
        <div className="bs-grid">
          <IntakeField id="sourceFileNote" label="Source File / Folder Note" value={form.sourceFileNote} onChange={handleChange} />
          <IntakeSelect
            id="sourceConfidence"
            label="Source Confidence"
            value={form.sourceConfidence}
            options={confidenceOptions}
            onChange={handleChange}
          />
          <IntakeField id="internalNotes" label="Internal Notes (never customer-facing)" value={form.internalNotes} onChange={handleChange} multiline />
        </div>
      </div>

      {error ? <p style={{ margin: 0, fontSize: 13, color: '#8a2a0d', fontWeight: 600 }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="bs-button bs-button--primary"
          onClick={handleSubmit}
          disabled={saved}
          style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
        >
          {saved ? 'Saved ✓' : 'Add to Recovery Queue'}
        </button>
        <button type="button" className="bs-button bs-button--ghost" onClick={onCancel} style={{ color: '#2d2217', borderColor: 'rgba(94,73,51,0.3)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function RecoveryUploadReview({ onSave, onCancel }) {
  const fileRef = useRef(null)
  const [form, setForm] = useState(emptyIntake)
  const [status, setStatus] = useState('Upload an old quote PDF or image to start recovery intake.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasUpload, setHasUpload] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const result = await parseRecoveryUploadFile(file, {
        onProgress: (progress) => {
          if (typeof progress === 'string') setStatus(progress)
          else {
            const action = progress.stage === 'rendering' ? 'Rendering' : 'Reading'
            setStatus(`${action} page ${progress.pageNumber} of ${progress.pageCount}...`)
          }
        },
      })
      setForm({ ...emptyIntake, ...result.intake, reviewedForFollowUp: false })
      setHasUpload(true)
      setStatus('Review extracted quote fields before saving to the recovery queue.')
    } catch (err) {
      setError(err.message || String(err))
      setStatus('Upload failed. Try a PDF or image with readable quote content.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSubmit() {
    if (!hasUpload) {
      setError('Upload a file before saving.')
      return
    }
    if (!form.customerName.trim() && !form.quoteNumber.trim() && !form.sourceFileNote.trim()) {
      setError('Keep at least a customer name, quote number, or source file name.')
      return
    }
    const opportunity = createOldQuoteOpportunity(form)
    saveOpportunity(opportunity)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (onSave) onSave()
    }, 700)
  }

  const classificationOptions = recoveryClassifications.map((c) => ({ value: c, label: titleCase(c) }))

  return (
    <div className="bs-intake bs-upload-intake">
      <div className="bs-upload-intake__head">
        <div>
          <p className="bs-lens__eyebrow">Recovery Intake</p>
          <h2>Upload Old Quote</h2>
          <p>Extract the old quote, review the fields, then add it to the existing recovery queue.</p>
        </div>
        <label className={`bs-button bs-button--primary ${busy ? 'is-disabled' : ''}`}>
          {busy ? 'Reading...' : 'Upload Old Quote'}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/*"
            onChange={handleFile}
            disabled={busy}
            hidden
          />
        </label>
      </div>

      <p className="bs-status" role="status">{status}</p>

      {form.sourceWarnings?.length ? (
        <div className="bs-upload-warning">
          <p className="bs-recovery__section-label">OCR Review Required</p>
          <ul className="bs-lens-list bs-lens-list--warning">
            {form.sourceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="bs-form__group">
        <h3>Review Extracted Quote</h3>
        <div className="bs-grid">
          <IntakeField id="customerName" label="Customer Name" value={form.customerName} onChange={handleChange} />
          <IntakeField id="customerEmail" label="Email" type="email" value={form.customerEmail} onChange={handleChange} />
          <IntakeField id="customerPhone" label="Phone" type="tel" value={form.customerPhone} onChange={handleChange} />
          <IntakeField id="quoteNumber" label="Quote Number" value={form.quoteNumber} onChange={handleChange} />
          <IntakeField id="quoteDate" label="Quote Date" value={form.quoteDate} onChange={handleChange} />
          <IntakeField id="originalQuoteAmount" label="Original Quote Amount" value={form.originalQuoteAmount} onChange={handleChange} />
          <IntakeField id="quotationTotal" label="Quotation Total" value={form.quotationTotal} onChange={handleChange} />
          <IntakeSelect id="recoveryClassification" label="Recovery Classification" value={form.recoveryClassification} options={classificationOptions} onChange={handleChange} />
          <IntakeField id="projectTitle" label="Project Title / PO Number" value={form.projectTitle} onChange={handleChange} />
          <IntakeField id="projectType" label="Project Type" value={form.projectType} onChange={handleChange} />
          <IntakeField id="existingSetup" label="Existing Setup, if detected" value={form.existingSetup} onChange={handleChange} multiline />
          <IntakeField id="desiredOutcome" label="Desired Outcome / Goal, if detected" value={form.desiredOutcome} onChange={handleChange} multiline />
          <IntakeField id="productsNotes" label="Products / Notes from Quote" value={form.productsNotes} onChange={handleChange} multiline />
        </div>
      </div>

      <div className="bs-form__group">
        <h3>Source Trail</h3>
        <div className="bs-grid">
          <IntakeField id="sourceFileNote" label="Source File Name" value={form.sourceFileNote} onChange={handleChange} />
          <IntakeField id="sourceType" label="Source Type" value={form.sourceType} onChange={handleChange} />
          <IntakeField id="sourceConfidence" label="OCR Confidence (internal)" value={form.sourceConfidence} onChange={handleChange} />
          <IntakeField id="sourceTrailNote" label="Source Trail Note" value={form.sourceTrailNote} onChange={handleChange} multiline />
          <IntakeField id="internalNotes" label="Internal Notes" value={form.internalNotes} onChange={handleChange} multiline />
        </div>
      </div>

      <label className="bs-upload-review-check">
        <input
          type="checkbox"
          checked={form.reviewedForFollowUp === true}
          onChange={(event) => handleChange('reviewedForFollowUp', event.target.checked)}
        />
        <span>Ready for Recovery Queue: I reviewed the extracted fields for follow-up use.</span>
      </label>

      {error ? <p style={{ margin: 0, fontSize: 13, color: '#8a2a0d', fontWeight: 600 }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="bs-button bs-button--primary"
          onClick={handleSubmit}
          disabled={saved || !hasUpload}
          style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
        >
          {saved ? 'Saved' : 'Add to Recovery Queue'}
        </button>
        <button type="button" className="bs-button bs-button--ghost" onClick={onCancel} style={{ color: '#2d2217', borderColor: 'rgba(94,73,51,0.3)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function BulkRecoveryUpload({ onSave, onCancel }) {
  const fileRef = useRef(null)
  const [drafts, setDrafts] = useState([])
  const [status, setStatus] = useState('Upload multiple old quote PDFs or images to create recovery drafts.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const summary = summarizeRecoveryUploadDrafts(drafts)
  const selectedCount = drafts.filter((draft) => draft.status === 'ready-for-review' && draft.intake.reviewedForFollowUp === true).length

  async function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      const result = await parseRecoveryUploadFiles(files, {
        onProgress: ({ fileName, fileIndex, fileCount, progress }) => {
          if (typeof progress === 'string') setStatus(`${fileIndex}/${fileCount}: ${fileName} - ${progress}`)
          else if (progress?.progress) setStatus(`${fileIndex}/${fileCount}: ${fileName}`)
          else {
            const action = progress?.stage === 'rendering' ? 'Rendering' : 'Reading'
            setStatus(`${fileIndex}/${fileCount}: ${action} page ${progress?.pageNumber || 1} of ${progress?.pageCount || 1}`)
          }
        },
      })
      setDrafts(result.drafts)
      setStatus(`Created ${result.summary.readyForReview} recovery draft${result.summary.readyForReview === 1 ? '' : 's'} for review.`)
    } catch (err) {
      setError(err.message || String(err))
      setStatus('Bulk upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function updateDraft(id, patch) {
    setDrafts((current) => current.map((draft) =>
      draft.id === id ? { ...draft, intake: { ...draft.intake, ...patch } } : draft
    ))
  }

  function removeDraft(id) {
    setDrafts((current) => current.filter((draft) => draft.id !== id))
  }

  function markAllReviewed() {
    setDrafts((current) => current.map((draft) =>
      draft.status === 'ready-for-review'
        ? { ...draft, intake: { ...draft.intake, reviewedForFollowUp: true } }
        : draft
    ))
  }

  function handleSaveSelected() {
    const selected = drafts.filter((draft) => draft.status === 'ready-for-review' && draft.intake.reviewedForFollowUp === true)
    if (!selected.length) {
      setError('Mark at least one reviewed draft before saving.')
      return
    }
    selected.forEach((draft) => saveOpportunity(createOldQuoteOpportunity(draft.intake)))
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (onSave) onSave()
    }, 700)
  }

  return (
    <div className="bs-intake bs-upload-intake">
      <div className="bs-upload-intake__head">
        <div>
          <p className="bs-lens__eyebrow">Bulk Recovery Intake</p>
          <h2>Bulk Upload Old Quotes</h2>
          <p>Create reviewed recovery drafts from multiple PDFs or images. No raw OCR text is saved.</p>
        </div>
        <label className={`bs-button bs-button--primary ${busy ? 'is-disabled' : ''}`}>
          {busy ? 'Reading...' : 'Bulk Upload'}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/*"
            multiple
            onChange={handleFiles}
            disabled={busy}
            hidden
          />
        </label>
      </div>

      <p className="bs-status" role="status">{status}</p>

      {drafts.length ? (
        <div className="bs-bulk-summary">
          <span><strong>{summary.draftCount}</strong> files</span>
          <span><strong>{summary.readyForReview}</strong> drafts</span>
          <span><strong>{summary.reviewed}</strong> reviewed</span>
          <span><strong>{summary.missingContact}</strong> missing contact</span>
          <span><strong>{summary.errors}</strong> errors</span>
        </div>
      ) : null}

      {drafts.length ? (
        <div className="bs-bulk-actions">
          <button type="button" className="bs-lens__copy" onClick={markAllReviewed}>Mark All Reviewed</button>
          <button type="button" className="bs-lens__copy" onClick={handleSaveSelected} disabled={saved || !selectedCount}>
            {saved ? 'Saved' : `Save ${selectedCount} Reviewed`}
          </button>
        </div>
      ) : null}

      <div className="bs-bulk-drafts">
        {drafts.map((draft) => (
          <article className={`bs-bulk-draft ${draft.status === 'error' ? 'is-error' : ''}`} key={draft.id}>
            <div className="bs-bulk-draft__head">
              <div>
                <strong>{draft.intake.customerName || draft.fileName || 'Unreviewed source'}</strong>
                <span>{draft.intake.quoteNumber ? `Quote #${draft.intake.quoteNumber}` : 'Quote number missing'} | {draft.intake.quoteDate || 'Date missing'}</span>
                <span>{draft.intake.originalQuoteAmount || draft.intake.quotationTotal || 'Total missing'} | {draft.intake.sourceType}</span>
              </div>
              <label className="bs-upload-review-check">
                <input
                  type="checkbox"
                  checked={draft.intake.reviewedForFollowUp === true}
                  disabled={draft.status === 'error'}
                  onChange={(event) => updateDraft(draft.id, { reviewedForFollowUp: event.target.checked })}
                />
                <span>Reviewed</span>
              </label>
            </div>
            {draft.error ? <p className="bs-bulk-error">{draft.error}</p> : null}
            {draft.intake.sourceWarnings?.length ? (
              <ul className="bs-lens-list bs-lens-list--warning">
                {draft.intake.sourceWarnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
            <div className="bs-bulk-draft__fields">
              <IntakeField id="customerName" label="Customer Name" value={draft.intake.customerName} onChange={(field, value) => updateDraft(draft.id, { [field]: value })} />
              <IntakeField id="customerEmail" label="Email" value={draft.intake.customerEmail} onChange={(field, value) => updateDraft(draft.id, { [field]: value })} />
              <IntakeField id="customerPhone" label="Phone" value={draft.intake.customerPhone} onChange={(field, value) => updateDraft(draft.id, { [field]: value })} />
              <IntakeField id="quoteNumber" label="Quote Number" value={draft.intake.quoteNumber} onChange={(field, value) => updateDraft(draft.id, { [field]: value })} />
            </div>
            <div className="bs-bulk-draft__footer">
              <span>{draft.intake.sourceTrailNote || draft.fileName}</span>
              <button type="button" className="bs-lens__copy" onClick={() => removeDraft(draft.id)}>Skip</button>
            </div>
          </article>
        ))}
      </div>

      {error ? <p style={{ margin: 0, fontSize: 13, color: '#8a2a0d', fontWeight: 600 }}>{error}</p> : null}

      <button type="button" className="bs-button bs-button--ghost" onClick={onCancel} style={{ justifySelf: 'start', color: '#2d2217', borderColor: 'rgba(94,73,51,0.3)' }}>
        Cancel
      </button>
    </div>
  )
}

export default function OldQuoteRecovery() {
  const [view, setView] = useState('queue')
  const [selectedId, setSelectedId] = useState('')
  const [opportunities, setOpportunities] = useState(loadRecoveryOpportunities)
  const [filter, setFilter] = useState('all')

  function refreshOpportunities() {
    setOpportunities(loadRecoveryOpportunities())
  }

  function handleSelectOpportunity(opportunity) {
    setSelectedId(opportunity.id)
    setView('detail')
  }

  function handleBack() {
    refreshOpportunities()
    setView('queue')
    setSelectedId('')
  }

  const filteredOpportunities = useMemo(() => {
    if (filter === 'all') return opportunities
    return filterOpportunities(opportunities, filter)
  }, [opportunities, filter])

  const selectedOpportunity = useMemo(
    () => opportunities.find((o) => o.id === selectedId) || null,
    [opportunities, selectedId],
  )

  if (view === 'intake') {
    return (
      <IntakeForm
        onSave={() => {
          refreshOpportunities()
          setView('queue')
        }}
        onCancel={() => setView('queue')}
      />
    )
  }

  if (view === 'upload') {
    return (
      <RecoveryUploadReview
        onSave={() => {
          refreshOpportunities()
          setView('queue')
        }}
        onCancel={() => setView('queue')}
      />
    )
  }

  if (view === 'bulk-upload') {
    return (
      <BulkRecoveryUpload
        onSave={() => {
          refreshOpportunities()
          setView('queue')
        }}
        onCancel={() => setView('queue')}
      />
    )
  }

  if (view === 'detail' && selectedOpportunity) {
    return (
      <DetailView
        opportunity={selectedOpportunity}
        onBack={handleBack}
        onRefreshQueue={refreshOpportunities}
      />
    )
  }

  const summary = {
    needsReview: opportunities.filter((o) => o.status === 'needs-review').length,
    followUp: opportunities.filter((o) => o.status === 'follow-up-needed').length,
    ready: opportunities.filter((o) => o.status === 'ready-for-proposal').length,
    reference: opportunities.filter((o) => ['reference-only', 'closed-won', 'closed-lost', 'archived'].includes(o.status)).length,
  }

  return (
    <div className="bs-recovery">
      <div className="bs-recovery__toolbar no-print">
        <button
          type="button"
          className="bs-button bs-button--primary"
          onClick={() => setView('intake')}
          style={{ background: '#173321', borderColor: '#173321' }}
        >
          Manual Entry
        </button>

        <button
          type="button"
          className="bs-button"
          onClick={() => setView('upload')}
          style={{ color: '#173321', borderColor: 'rgba(23,51,33,0.35)' }}
        >
          Upload Old Quote
        </button>

        <button
          type="button"
          className="bs-button"
          onClick={() => setView('bulk-upload')}
          style={{ color: '#173321', borderColor: 'rgba(23,51,33,0.35)' }}
        >
          Bulk Upload
        </button>

        <div className="bs-recovery__filters">
          {queueFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`bs-section-toggle ${filter === f.value ? 'bs-section-toggle--active' : ''}`}
              onClick={() => setFilter(f.value)}
              style={{ padding: '6px 12px' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {opportunities.length > 0 && (
          <div className="bs-recovery__summary">
            {summary.needsReview > 0 && <span className="bs-badge bs-badge--warning">{summary.needsReview} review</span>}
            {summary.followUp > 0 && <span className="bs-badge bs-badge--warm">{summary.followUp} follow up</span>}
            {summary.ready > 0 && <span className="bs-badge bs-badge--status">{summary.ready} ready</span>}
            {summary.reference > 0 && <span className="bs-badge bs-badge--unknown">{summary.reference} reference</span>}
          </div>
        )}
      </div>

      {filteredOpportunities.length === 0 ? (
        <div className="bs-queue-empty">
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#173321', fontSize: 16 }}>
            {opportunities.length === 0 ? 'Opportunity Queue is Empty' : 'No matches for this filter'}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>
            {opportunities.length === 0
              ? 'Upload an old quote or add one manually. Each entry will be classified, reviewed, and queued for safe follow-up.'
              : 'Try a different filter to see other opportunities.'}
          </p>
        </div>
      ) : (
        <div className="bs-queue">
          {filteredOpportunities.map((opp) => (
            <QueueCard key={opp.id} opportunity={opp} onSelect={handleSelectOpportunity} />
          ))}
        </div>
      )}
    </div>
  )
}
