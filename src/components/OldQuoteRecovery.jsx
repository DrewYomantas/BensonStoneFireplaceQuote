import { useMemo, useRef, useState } from 'react'
import {
  createOldQuoteOpportunity,
  recoveryClassifications,
} from '../lib/oldQuoteRecovery.js'
import {
  filterOpportunities,
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
  saveOpportunity,
} from '../lib/opportunities.js'
import { listOpportunityActivities } from '../lib/opportunityActivity.js'
import { parseRecoveryUploadFile, parseRecoveryUploadFiles, triageBulkDraft } from '../lib/recoveryUploadIntake.js'
import { deriveShowroomDisplayContext, listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import OpportunityWorkspace from './OpportunityWorkspace.jsx'

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

function titleCase(str) {
  return String(str || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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

function readinessBadgeClass(tone) {
  if (tone === 'ready') return 'bs-badge bs-badge--status'
  if (tone === 'waiting') return 'bs-badge bs-badge--cool'
  if (tone === 'follow-up') return 'bs-badge bs-badge--warm'
  if (tone === 'warning') return 'bs-badge bs-badge--warning'
  return 'bs-badge bs-badge--unknown'
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

function QueueCard({ opportunity, activities, displayContext, onSelect, onDelete }) {
  const warningCount = (opportunity.warnings || []).filter((w) => !/Sensitive BisTrack fields|quote refresh/i.test(w)).length
  const sourceLabel = getOpportunitySourceLabel(opportunity)
  const readiness = getOpportunityReadinessBadge(opportunity)
  const attachmentWarning = getLineItemAttachmentWarning(opportunity)
  const latestActivity = getLatestActivitySummary(activities[0], opportunity)
  const total = opportunity.originalQuoteAmount || opportunity.quotationTotal
  const nextAction = getOpportunityNextActionLabel(opportunity)

  return (
    <div className="bs-queue-card">
      <div className="bs-queue-card__head">
        <span className="bs-queue-card__name">{opportunity.customerName || 'Unnamed'}</span>
        <span className="bs-queue-card__meta">
          {opportunity.quoteNumber ? `#${opportunity.quoteNumber}` : opportunity.sourceFileName || ''}
          {opportunity.quoteDate ? ` · ${opportunity.quoteDate}` : ''}
        </span>
      </div>
      <div className="bs-queue-card__source-row">
        <span className="bs-source-chip">{sourceLabel}</span>
        {total ? <span className="bs-queue-card__total">{total}</span> : null}
      </div>
      <div className="bs-queue-card__badges">
        <span className={classificationBadgeClass(opportunity.recoveryClassification)}>
          {titleCase(opportunity.recoveryClassification || 'unknown')}
        </span>
        <span className={readinessBadgeClass(readiness.tone)}>{readiness.label}</span>
        <span className={statusBadgeClass(opportunity.status)}>{titleCase(opportunity.status || 'unknown')}</span>
        {displayContext?.chipLabel ? (
          <span className={readinessBadgeClass(displayContext.tone)}>{displayContext.chipLabel}</span>
        ) : null}
        {warningCount > 0 && (
          <span className="bs-badge bs-badge--warning">{warningCount} warning{warningCount === 1 ? '' : 's'}</span>
        )}
      </div>
      {attachmentWarning ? (
        <div className="bs-queue-card__warning">{attachmentWarning}. Confirm original BisTrack quote before sending.</div>
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

      {form.isScannedBisTrack ? (
        <div className="bs-upload-warning bs-upload-warning--scan">
          <p className="bs-recovery__section-label">Scanned Quote Detected</p>
          {form.scannedBisTrackNote
            ? form.scannedBisTrackNote.split('\n').map((line, i) => (
              <p key={i} className={i === 0 ? 'bs-upload-warning__lead' : 'bs-upload-warning__detail'}>{line}</p>
            ))
            : <p>Fields were extracted from the page image. Review all fields against the original scan before sending.</p>}
        </div>
      ) : null}

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
  const [status, setStatus] = useState('Select multiple old quote PDFs to batch-add to the recovery queue.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addedCount, setAddedCount] = useState(0)
  const [refOpen, setRefOpen] = useState(false)

  const triaged = useMemo(() => {
    const buckets = { ready: [], needsReview: [], reference: [], error: [] }
    drafts.forEach((draft) => {
      const t = triageBulkDraft(draft)
      buckets[t.bucket].push({ draft, reason: t.reason })
    })
    return buckets
  }, [drafts])

  async function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setBusy(true)
    setError('')
    setAddedCount(0)
    try {
      const result = await parseRecoveryUploadFiles(files, {
        onProgress: ({ fileName, fileIndex, fileCount, progress }) => {
          if (typeof progress === 'string') setStatus(`${fileIndex}/${fileCount}: ${fileName} — ${progress}`)
          else {
            const action = progress?.stage === 'rendering' ? 'Rendering' : 'Reading'
            setStatus(`${fileIndex}/${fileCount}: ${action} page ${progress?.pageNumber || 1} of ${progress?.pageCount || 1}`)
          }
        },
      })
      setDrafts(result.drafts)
      const s = result.summary
      setStatus(`${s.ready || 0} ready · ${s.needsReview || 0} need review · ${s.reference || 0} reference · ${s.errors || 0} failed`)
    } catch (err) {
      setError(err.message || String(err))
      setStatus('Bulk upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removeDraft(id) {
    setDrafts((current) => current.filter((d) => d.id !== id))
  }

  function updateDraft(id, patch) {
    setDrafts((current) => current.map((d) =>
      d.id === id ? { ...d, intake: { ...d.intake, ...patch } } : d
    ))
  }

  function saveDraft(draft, overrides = {}) {
    saveOpportunity(createOldQuoteOpportunity({
      ...draft.intake,
      ...overrides,
      sourceType: `bulk-${draft.intake.sourceType || 'upload'}`,
      sourceLabel: draft.intake.sourceLabel || 'Bulk uploaded old quote',
      reviewedForFollowUp: true,
    }))
  }

  function handleAddBucket(bucket, overrides = {}) {
    const items = triaged[bucket]
    items.forEach(({ draft }) => saveDraft(draft, overrides))
    const ids = new Set(items.map(({ draft }) => draft.id))
    setDrafts((current) => current.filter((d) => !ids.has(d.id)))
    setAddedCount((c) => c + items.length)
  }

  function handleAddSingle(id) {
    const draft = drafts.find((d) => d.id === id)
    if (!draft) return
    saveDraft(draft)
    setAddedCount((c) => c + 1)
    removeDraft(id)
  }

  function skipBucket(bucket) {
    const ids = new Set(triaged[bucket].map(({ draft }) => draft.id))
    setDrafts((current) => current.filter((d) => !ids.has(d.id)))
  }

  return (
    <div className="bs-intake bs-upload-intake">
      <div className="bs-upload-intake__head">
        <div>
          <p className="bs-lens__eyebrow">Bulk Recovery Intake</p>
          <h2>Bulk Upload Old Quotes</h2>
          <p>Auto-triages uploads into ready, needs-review, and reference buckets. No raw OCR text is saved.</p>
        </div>
        <label className={`bs-button bs-button--primary ${busy ? 'is-disabled' : ''}`}>
          {busy ? 'Reading...' : 'Select PDFs'}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" multiple onChange={handleFiles} disabled={busy} hidden />
        </label>
      </div>

      <p className="bs-status" role="status">{status}</p>

      {(drafts.length > 0 || addedCount > 0) && (
        <div className="bs-triage-summary">
          {addedCount > 0 && <span className="bs-badge bs-badge--status">✓ {addedCount} added to queue</span>}
          {triaged.ready.length > 0 && <span className="bs-badge bs-badge--status">{triaged.ready.length} ready</span>}
          {triaged.needsReview.length > 0 && <span className="bs-badge bs-badge--warning">{triaged.needsReview.length} need review</span>}
          {triaged.reference.length > 0 && <span className="bs-badge bs-badge--unknown">{triaged.reference.length} reference/paid</span>}
          {triaged.error.length > 0 && <span className="bs-badge bs-badge--blocked">{triaged.error.length} failed</span>}
        </div>
      )}

      {triaged.ready.length > 0 && (
        <div className="bs-triage-bucket">
          <div className="bs-triage-bucket__header">
            <div>
              <strong>Ready to Add</strong>
              <span className="bs-badge bs-badge--status">{triaged.ready.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="bs-button bs-button--primary"
                onClick={() => handleAddBucket('ready')}
                style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd', fontSize: 13, padding: '7px 14px' }}>
                Add All Ready ({triaged.ready.length})
              </button>
              <button type="button" className="bs-lens__copy" onClick={() => skipBucket('ready')}>Skip All</button>
            </div>
          </div>
          <div className="bs-triage-rows">
            {triaged.ready.map(({ draft }) => (
              <div key={draft.id} className="bs-triage-row">
                <div className="bs-triage-row__info">
                  <strong>{draft.intake.customerName}</strong>
                  <span>
                    {draft.intake.quoteNumber ? `#${draft.intake.quoteNumber}` : ''}
                    {draft.intake.quoteDate ? ` · ${draft.intake.quoteDate}` : ''}
                    {draft.intake.originalQuoteAmount || draft.intake.quotationTotal ? ` · ${draft.intake.originalQuoteAmount || draft.intake.quotationTotal}` : ''}
                  </span>
                </div>
                <button type="button" className="bs-lens__copy" onClick={() => removeDraft(draft.id)}>Skip</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {triaged.needsReview.length > 0 && (
        <div className="bs-triage-bucket bs-triage-bucket--warn">
          <div className="bs-triage-bucket__header">
            <div>
              <strong>Needs Review</strong>
              <span className="bs-badge bs-badge--warning">{triaged.needsReview.length}</span>
            </div>
            <button type="button" className="bs-lens__copy" onClick={() => skipBucket('needsReview')}>Skip All</button>
          </div>
          <div className="bs-triage-cards">
            {triaged.needsReview.map(({ draft, reason }) => (
              <article key={draft.id} className="bs-triage-card">
                <div className="bs-triage-card__head">
                  <div>
                    <strong>{draft.intake.customerName || draft.fileName || 'Unknown'}</strong>
                    <span>
                      {draft.intake.quoteNumber ? `#${draft.intake.quoteNumber}` : 'No quote #'}
                      {draft.intake.quoteDate ? ` · ${draft.intake.quoteDate}` : ''}
                    </span>
                  </div>
                  <span className="bs-badge bs-badge--warning">{reason}</span>
                </div>
                <div className="bs-bulk-draft__fields">
                  {!draft.intake.customerName?.trim() && (
                    <IntakeField id="customerName" label="Customer Name" value={draft.intake.customerName} onChange={(f, v) => updateDraft(draft.id, { [f]: v })} />
                  )}
                  <IntakeField id="customerEmail" label="Email" value={draft.intake.customerEmail} onChange={(f, v) => updateDraft(draft.id, { [f]: v })} />
                  <IntakeField id="customerPhone" label="Phone" value={draft.intake.customerPhone} onChange={(f, v) => updateDraft(draft.id, { [f]: v })} />
                </div>
                <div className="bs-triage-card__actions">
                  <button type="button" className="bs-button bs-button--primary" onClick={() => handleAddSingle(draft.id)}
                    style={{ fontSize: 12, padding: '6px 12px', background: '#173321', borderColor: '#173321', color: '#f6eddd' }}>
                    Add to Queue
                  </button>
                  <button type="button" className="bs-lens__copy" onClick={() => removeDraft(draft.id)}>Skip</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {triaged.reference.length > 0 && (
        <div className="bs-triage-bucket">
          <div className="bs-triage-bucket__header">
            <button type="button" className="bs-triage-bucket__toggle" onClick={() => setRefOpen((o) => !o)}>
              <strong>{refOpen ? '▾' : '▸'} Reference / Paid ({triaged.reference.length})</strong>
              <span style={{ fontSize: 11, color: '#8a6d4c', fontWeight: 400 }}>Closed or paid quotes — not active follow-ups</span>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="bs-lens__copy" onClick={() => handleAddBucket('reference', { recoveryClassification: 'reference-only' })}>Add as Reference</button>
              <button type="button" className="bs-lens__copy" onClick={() => skipBucket('reference')}>Skip All</button>
            </div>
          </div>
          {refOpen && (
            <div className="bs-triage-rows">
              {triaged.reference.map(({ draft, reason }) => (
                <div key={draft.id} className="bs-triage-row">
                  <div className="bs-triage-row__info">
                    <strong>{draft.intake.customerName || draft.fileName || 'Unknown'}</strong>
                    <span>{draft.intake.quoteNumber ? `#${draft.intake.quoteNumber}` : ''}{draft.intake.quoteDate ? ` · ${draft.intake.quoteDate}` : ''}</span>
                    <span style={{ color: '#8a481d' }}>{reason}</span>
                  </div>
                  <button type="button" className="bs-lens__copy" onClick={() => removeDraft(draft.id)}>Skip</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {triaged.error.length > 0 && (
        <div className="bs-triage-bucket bs-triage-bucket--err">
          <div className="bs-triage-bucket__header">
            <strong>Failed to Parse ({triaged.error.length})</strong>
            <button type="button" className="bs-lens__copy" onClick={() => skipBucket('error')}>Dismiss All</button>
          </div>
          <div className="bs-triage-rows">
            {triaged.error.map(({ draft, reason }) => (
              <div key={draft.id} className="bs-triage-row">
                <div className="bs-triage-row__info">
                  <strong>{draft.fileName}</strong>
                  <span style={{ color: '#8a2a0d' }}>{reason}</span>
                </div>
                <button type="button" className="bs-lens__copy" onClick={() => removeDraft(draft.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {addedCount > 0 && drafts.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: '#173321', fontWeight: 600 }}>
          ✓ All handled. {addedCount} added to the recovery queue.
        </p>
      )}

      {error ? <p style={{ margin: 0, fontSize: 13, color: '#8a2a0d', fontWeight: 600 }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {addedCount > 0 && (
          <button type="button" className="bs-button bs-button--primary" onClick={onSave}
            style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd' }}>
            Done — View Queue
          </button>
        )}
        <button type="button" className="bs-button bs-button--ghost" onClick={onCancel}
          style={{ color: '#2d2217', borderColor: 'rgba(94,73,51,0.3)' }}>
          {addedCount > 0 ? 'Cancel Remaining' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

export default function OldQuoteRecovery() {
  const [view, setView] = useState('queue')
  const [selectedId, setSelectedId] = useState('')
  const [opportunities, setOpportunities] = useState(loadRecoveryOpportunities)
  const [filter, setFilter] = useState('all')
  const displayRecords = useMemo(() => listDisplayRecords(), [])

  function refreshOpportunities() {
    setOpportunities(loadRecoveryOpportunities())
  }

  function handleDeleteOpportunity(id) {
    removeOpportunity(id)
    refreshOpportunities()
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
    if (queueFilterDefinitions.some((item) => item.value === filter)) return filterQueueOpportunities(opportunities, filter)
    if (filter === 'all') return opportunities
    return filterOpportunities(opportunities, filter)
  }, [opportunities, filter])

  const activityCache = useMemo(() => (
    Object.fromEntries(opportunities.map((opportunity) => [opportunity.id, listOpportunityActivities(opportunity.id)]))
  ), [opportunities])

  const selectedOpportunity = useMemo(
    () => opportunities.find((o) => o.id === selectedId) || null,
    [opportunities, selectedId],
  )
  const displayContextByOpportunity = useMemo(
    () => Object.fromEntries(opportunities.map((opportunity) => [
      opportunity.id,
      deriveShowroomDisplayContext({ displayRecords, opportunity }),
    ])),
    [displayRecords, opportunities],
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
      <OpportunityWorkspace
        opportunity={selectedOpportunity}
        onBack={handleBack}
        onRefresh={refreshOpportunities}
      />
    )
  }

  const summary = {
    needsReview: opportunities.filter((o) => o.status === 'needs-review').length,
    followUp: opportunities.filter((o) => o.status === 'follow-up-needed').length,
    ready: opportunities.filter((o) => o.status === 'ready-for-proposal').length,
    reference: opportunities.filter((o) => ['reference-only', 'closed-won', 'closed-lost', 'archived'].includes(o.status)).length,
  }
  const filterCounts = getQueueFilterCounts(opportunities)
  const emptyState = getQueueEmptyState(filter)

  return (
    <div className="bs-recovery">
      <div className="bs-recovery__toolbar no-print">
        <button
          type="button"
          className="bs-button bs-button--primary"
          onClick={() => setView('intake')}
          style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
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
            {emptyState.title}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#6b5a47' }}>
            {emptyState.body}
          </p>
        </div>
      ) : (
        <div className="bs-queue">
          {filteredOpportunities.map((opp) => (
            <QueueCard
              key={opp.id}
              opportunity={opp}
              activities={activityCache[opp.id] || []}
              displayContext={displayContextByOpportunity[opp.id]}
              onSelect={handleSelectOpportunity}
              onDelete={handleDeleteOpportunity}
            />
          ))}
        </div>
      )}
    </div>
  )
}
