import { useEffect, useMemo, useRef, useState } from 'react'
import FieldRulesCard from '../components/file/FieldRulesCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import SourceContextPanel from '../components/quotePrep/SourceContextPanel.jsx'
import {
  ensureSalesOsBoot,
  getSalesOsStorage,
  getSalesOsSaveState,
} from '../lib/salesOsStorageBoot.js'
import {
  getCustomerFileDurable,
  updateCustomerFileDurable,
} from '../lib/customerFileDurable.js'
import { projectCustomerFileForDisplay } from '../lib/customerFileView.js'
import {
  emptyQuotePrepDraft,
  quotePrepDraftFromCustomerFile,
  buildCustomerFilePatchFromQuotePrep,
  buildQuotePrepEngineInput,
  addQuotePrepLine,
  updateQuotePrepLine,
  removeQuotePrepLine,
  normalizeQuotePrepLine,
  summarizeQuotePrepReview,
  SOURCE_BASIS_VALUES,
  SOURCE_BASIS_LABELS,
  REVIEW_STATUS_VALUES,
  REVIEW_STATUS_LABELS,
  REVIEW_FLAG_VALUES,
  REVIEW_FLAG_LABELS,
} from '../lib/quotePrepDraft.js'
import { evaluateFieldRules } from '../lib/fieldRules.js'
import { acknowledgeZcGasInsertOnFile } from '../lib/zcGasInsertAck.js'
import {
  appendActivityForFile,
  listActivityForFile,
  getFollowUpForFile,
} from '../lib/visitActivity.js'
import { SETUP_TYPE_LABELS } from '../lib/setupGoalLens.js'
import {
  evaluateQuotePrepGate,
  quotePrepGateDraftFromCustomerFile,
  buildCustomerFilePatchFromQuotePrepGate,
  projectQuotePrepGateStatus,
  QUOTE_TYPE_VALUES,
  QUOTE_TYPE_LABELS,
  GATE_STATUS,
  REASON_ACTION_TARGETS,
} from '../lib/quotePrepGate.js'
import { buildQuotePrepContext } from '../lib/quotePrepContext.js'

function VerifiedFromLensCard({ file }) {
  if (!file) return null
  const setupLabel = SETUP_TYPE_LABELS[file.lensSetupType] || ''
  const rows = [
    { label: 'Setup type', value: setupLabel },
    { label: 'Customer goal', value: file.customerGoal },
    { label: 'Existing notes', value: file.existingNotes },
    { label: 'Salesperson notes', value: file.lensSalespersonNotes },
    { label: 'Likely path', value: file.likelyPath },
    { label: 'Project address', value: file.projectAddress },
  ].filter((r) => r.value)
  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">VERIFIED FROM LENS</span>
      {rows.length === 0 ? (
        <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
          Nothing captured in Setup + Goal Lens yet — open the Lens to fill this in.
        </p>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>{r.label.toUpperCase()}</span>
              <p className="body-sm" style={{ marginTop: 2 }}>{r.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function LineRow({ line, onPatch, onRemove, disabled }) {
  return (
    <div
      className="card"
      style={{
        padding: 14, marginTop: 10,
        background: 'var(--paper)', border: '1px solid var(--rule)',
        borderLeft: '3px solid var(--brass)',
      }}
    >
      <div className="hstack">
        <span className="eyebrow eyebrow-ink">PROPOSED LINE</span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-quiet"
          aria-label={`Remove proposed line ${line.name || ''}`}
          onClick={() => onRemove(line.id)}
          disabled={disabled}
        >
          Remove
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 8 }}>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>NAME</span>
          <input
            className="field"
            value={line.name}
            onChange={(e) => onPatch(line.id, { name: e.target.value })}
            placeholder="e.g. Whisper Flex 12"
            disabled={disabled}
          />
        </label>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>QUANTITY</span>
          <input
            className="field"
            value={line.quantity}
            onChange={(e) => onPatch(line.id, { quantity: e.target.value })}
            placeholder="1"
            disabled={disabled}
          />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>BRAND / VENDOR</span>
          <input
            className="field"
            value={line.brand}
            onChange={(e) => onPatch(line.id, { brand: e.target.value })}
            placeholder="Empire"
            disabled={disabled}
          />
        </label>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>PART / SKU</span>
          <input
            className="field"
            value={line.partNumber}
            onChange={(e) => onPatch(line.id, { partNumber: e.target.value })}
            placeholder="T1009898-12"
            disabled={disabled}
          />
        </label>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>CATEGORY</span>
          <input
            className="field"
            value={line.category}
            onChange={(e) => onPatch(line.id, { category: e.target.value })}
            placeholder="gas-insert"
            disabled={disabled}
          />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>DESCRIPTION</span>
        <input
          className="field"
          value={line.description}
          onChange={(e) => onPatch(line.id, { description: e.target.value })}
          placeholder="Vent-free flex line, 12&quot;"
          disabled={disabled}
        />
      </label>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>CUSTOMER-SAFE NOTES</span>
        <textarea
          className="field"
          rows={2}
          value={line.customerSafeNotes}
          onChange={(e) => onPatch(line.id, { customerSafeNotes: e.target.value })}
          placeholder="Wording you'd be comfortable showing the customer."
          disabled={disabled}
        />
      </label>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ember" style={{ fontSize: 11 }}>INTERNAL PREP NOTE · REP-ONLY</span>
        <textarea
          className="field"
          rows={2}
          value={line.internalPrepNote}
          onChange={(e) => onPatch(line.id, { internalPrepNote: e.target.value })}
          placeholder="Reminders for the shop. Not customer-facing."
          disabled={disabled}
        />
      </label>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ember" style={{ fontSize: 11 }}>EVIDENCE NOTE · REP-ONLY</span>
        <textarea
          className="field"
          rows={2}
          value={line.evidenceNote}
          onChange={(e) => onPatch(line.id, { evidenceNote: e.target.value })}
          placeholder="Why this line exists — e.g. per BisTrack quote 04-212, line 3; customer confirmed at May 2 visit."
          disabled={disabled}
        />
      </label>

      <div style={{
        marginTop: 12, paddingTop: 12,
        borderTop: '1px dashed var(--rule)',
      }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>SOURCE / REVIEW · REP-ONLY</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <label>
            <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>WHERE THIS CAME FROM</span>
            <select
              className="field"
              value={line.sourceBasis}
              onChange={(e) => onPatch(line.id, { sourceBasis: e.target.value })}
              disabled={disabled}
            >
              {SOURCE_BASIS_VALUES.map((v) => (
                <option key={v} value={v}>{SOURCE_BASIS_LABELS[v]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>REVIEW STATUS</span>
            <select
              className="field"
              value={line.reviewStatus}
              onChange={(e) => onPatch(line.id, { reviewStatus: e.target.value })}
              disabled={disabled}
            >
              {REVIEW_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>{REVIEW_STATUS_LABELS[v]}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 10 }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>SOURCE NOTE</span>
          <input
            className="field"
            value={line.sourceNote}
            onChange={(e) => onPatch(line.id, { sourceNote: e.target.value })}
            placeholder="Where exactly — e.g. 04-198 BisTrack quote, May 2 Lens, etc."
            disabled={disabled}
          />
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: '10px 0 0' }}>
          <legend className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>REVIEW FLAGS</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
            {REVIEW_FLAG_VALUES.map((flag) => {
              const checked = Array.isArray(line.reviewFlags) && line.reviewFlags.includes(flag)
              return (
                <label key={flag} className="body-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const current = Array.isArray(line.reviewFlags) ? line.reviewFlags : []
                      const next = e.target.checked
                        ? [...current.filter((f) => f !== flag), flag]
                        : current.filter((f) => f !== flag)
                      onPatch(line.id, { reviewFlags: next })
                    }}
                    disabled={disabled}
                  />
                  <span>{REVIEW_FLAG_LABELS[flag]}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

function ReviewSummaryCard({ summary }) {
  if (!summary || summary.total === 0) return null
  const items = [
    { label: 'Total proposed lines', value: summary.total },
    { label: 'Needs verification', value: summary.needsVerification },
    { label: 'Ready for BisTrack', value: summary.readyForBistrack },
    { label: 'Do not use yet', value: summary.doNotUseYet },
  ]
  return (
    <section className="card-flat" style={{ padding: 14, marginTop: 18 }}>
      <span className="eyebrow eyebrow-ink">PREP REVIEW SUMMARY · INTERNAL</span>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {items.map((it) => (
          <div key={it.label}>
            <div className="serif-h" style={{ fontSize: 22, lineHeight: 1.1 }}>{it.value}</div>
            <div className="body-sm" style={{ color: 'var(--slate)' }}>{it.label}</div>
          </div>
        ))}
      </div>
      <p className="body-sm" style={{ marginTop: 10, color: 'var(--slate)' }}>
        This is prep review only. Build the official quote in BisTrack.
      </p>
    </section>
  )
}

function gateBadge(status) {
  if (status === GATE_STATUS.ready) return { label: 'READY', cls: 'source source-verified' }
  if (status === GATE_STATUS.needsVerification) return { label: 'NEEDS VERIFICATION', cls: 'source source-said' }
  return { label: 'DRAFT', cls: 'source source-manual' }
}

function rowStatusBadge(status) {
  if (status === 'complete') return { label: 'OK', cls: 'source source-verified' }
  if (status === 'warning') return { label: 'WARN', cls: 'source source-said' }
  return { label: 'MISSING', cls: 'source source-assumed' }
}

function GateCard({ result, gateDraft, onPatch, onReasonAction, disabled, quoteTypeRef }) {
  if (!result) return null
  const badge = gateBadge(result.status)
  return (
    <section
      className="card"
      style={{ padding: 18, marginTop: 18, borderLeft: '3px solid var(--ember)' }}
      aria-labelledby="quote-prep-gate-heading"
    >
      <div className="hstack">
        <span id="quote-prep-gate-heading" className="eyebrow eyebrow-ember">
          PRE-BISTRACK REVIEW
        </span>
        <span className={badge.cls} style={{ marginLeft: 8 }}>{badge.label}</span>
      </div>
      <p className="body-sm" style={{ marginTop: 6 }}>
        {result.label}.
        {result.status === GATE_STATUS.ready
          ? ' Build and verify the official quote in BisTrack.'
          : ' This is internal prep — BisTrack remains source of truth.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>QUOTE TYPE</span>
          <select
            ref={quoteTypeRef}
            className="field"
            value={gateDraft.quotePrepQuoteType}
            onChange={(e) => onPatch({ quotePrepQuoteType: e.target.value })}
            disabled={disabled}
          >
            {QUOTE_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>{QUOTE_TYPE_LABELS[v]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>VERIFICATION OWNER</span>
          <input
            className="field"
            value={gateDraft.quotePrepVerificationOwner}
            onChange={(e) => onPatch({ quotePrepVerificationOwner: e.target.value })}
            placeholder="Who verifies next — Drew, Liam, customer…"
            disabled={disabled}
          />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>STILL UNVERIFIED</span>
        <textarea
          className="field"
          rows={2}
          value={gateDraft.quotePrepUnverifiedItems}
          onChange={(e) => onPatch({ quotePrepUnverifiedItems: e.target.value })}
          placeholder="Flue size, gas line, mantel clearance — anything still assumed."
          disabled={disabled}
        />
      </label>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>NEXT STEP / FOLLOW-UP</span>
        <input
          className="field"
          value={gateDraft.quotePrepNextStep}
          onChange={(e) => onPatch({ quotePrepNextStep: e.target.value })}
          placeholder="One concrete action — e.g. confirm flue size with Liam Wed."
          disabled={disabled}
        />
      </label>

      {result.reasons && result.reasons.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>WHY NOT YET</span>
          <ul className="body-sm" style={{ marginTop: 4, paddingLeft: 18 }}>
            {result.reasons.map((r, idx) => {
              const message = typeof r === 'string' ? r : r && r.message
              const action = typeof r === 'string' ? null : r && r.action
              return (
                <li key={idx} style={{ marginBottom: 4 }}>
                  <span>{message}</span>
                  {action && onReasonAction && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      style={{ marginLeft: 8, padding: '2px 8px' }}
                      onClick={() => onReasonAction(action)}
                      disabled={disabled}
                    >
                      {action.label} →
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {result.groups.map((group) => (
          <div key={group.id}>
            <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>
              {group.label.toUpperCase()}
            </span>
            <div style={{ marginTop: 4 }}>
              {group.rows.map((r) => {
                const b = rowStatusBadge(r.status)
                return (
                  <div key={r.id} className="fact-row">
                    <div className="fact-row-head">
                      <span className="fact-row-label body-sm">{r.label}</span>
                      <span className={b.cls} aria-label={`Status: ${b.label}`}>{b.label}</span>
                    </div>
                    {r.detail && <p className="fact-row-sub">{r.detail}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function QuotePrepScreen({ fileId, onBack, onOpenLens, onOpenHandoff, onOpenProposalPreview }) {
  const [file, setFile] = useState(null)
  const [draft, setDraft] = useState(emptyQuotePrepDraft())
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [gateDraft, setGateDraft] = useState(quotePrepGateDraftFromCustomerFile(null))
  // Source Context drawer state (Milestone 16)
  const [showContext, setShowContext] = useState(false)
  const [activityEvents, setActivityEvents] = useState([])
  const [followUp, setFollowUp] = useState(null)
  const [contextNoteAdded, setContextNoteAdded] = useState(false)

  const linesSectionRef = useRef(null)
  const fieldRulesSectionRef = useRef(null)
  const quoteTypeRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setLoading(true); setMissing(false); setErrorMsg('')
      setDirty(false); setSavedAt(null); setSaveError('')
      setActivityEvents([]); setFollowUp(null); setContextNoteAdded(false)
      if (!fileId || fileId.startsWith('sample-')) {
        setMissing(true); setLoading(false)
        return
      }
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setErrorMsg(ready.error || 'Storage unavailable'); setLoading(false)
          return
        }
        const storage = getSalesOsStorage()
        const row = await getCustomerFileDurable(storage, fileId)
        if (cancelled) return
        if (!row) { setMissing(true); setLoading(false); return }
        setFile(projectCustomerFileForDisplay(row))
        setDraft(quotePrepDraftFromCustomerFile(row))
        setGateDraft(quotePrepGateDraftFromCustomerFile(row))
        // Load activity + follow-up for Source Context drawer. Best-effort:
        // a failure here must not prevent Quote / Prep from loading.
        try {
          const [events, fu] = await Promise.all([
            listActivityForFile(storage, fileId, { limit: 8 }),
            getFollowUpForFile(storage, fileId),
          ])
          if (!cancelled) {
            setActivityEvents(events || [])
            setFollowUp(fu || null)
          }
        } catch { /* Source Context data is best-effort */ }
        setLoading(false)
      } catch (err) {
        if (!cancelled) { setErrorMsg(err.message || String(err)); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  function handleAdd() {
    setDraft((prev) => ({ ...prev, lines: addQuotePrepLine(prev.lines, {}) }))
    setDirty(true); setSavedAt(null)
  }

  function handlePatch(id, patch) {
    setDraft((prev) => ({ ...prev, lines: updateQuotePrepLine(prev.lines, id, patch) }))
    setDirty(true); setSavedAt(null)
  }

  function handleRemove(id) {
    setDraft((prev) => ({ ...prev, lines: removeQuotePrepLine(prev.lines, id) }))
    setDirty(true); setSavedAt(null)
  }

  function handleNotes(value) {
    setDraft((prev) => ({ ...prev, notes: value }))
    setDirty(true); setSavedAt(null)
  }

  function handleGatePatch(patch) {
    setGateDraft((prev) => ({ ...prev, ...patch }))
    setDirty(true); setSavedAt(null)
  }

  function handleReasonAction(action) {
    if (!action || !action.target) return
    if (action.target === REASON_ACTION_TARGETS.lens) {
      if (onOpenLens && fileId) onOpenLens(fileId)
      return
    }
    if (action.target === REASON_ACTION_TARGETS.addLine) {
      handleAdd()
      // Best-effort scroll to the lines list so the new card is visible.
      if (linesSectionRef.current && linesSectionRef.current.scrollIntoView) {
        linesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (action.target === REASON_ACTION_TARGETS.reviewLines) {
      if (linesSectionRef.current && linesSectionRef.current.scrollIntoView) {
        linesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (action.target === REASON_ACTION_TARGETS.fieldRules) {
      if (fieldRulesSectionRef.current && fieldRulesSectionRef.current.scrollIntoView) {
        fieldRulesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }
    if (action.target === REASON_ACTION_TARGETS.gateField) {
      if (action.field === 'quotePrepQuoteType' && quoteTypeRef.current) {
        try { quoteTypeRef.current.focus() } catch { /* focus unsupported — fall back to visible card */ }
      }
    }
  }

  async function handleSave(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!fileId || submitting) return
    setSubmitting(true); setSaveError('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      const linePatch = buildCustomerFilePatchFromQuotePrep(draft)
      const gatePatch = buildCustomerFilePatchFromQuotePrepGate(gateDraft)
      // Snapshot the pre-save gate status from the saved file (not the
      // memoized gateResult) so the React compiler can keep its useMemo.
      const prevGateStatus = file ? projectQuotePrepGateStatus(file).status : null
      saveState.markSaving()
      const updated = await updateCustomerFileDurable(storage, fileId, { ...linePatch, ...gatePatch })
      saveState.markSaved()
      if (updated) {
        setFile(projectCustomerFileForDisplay(updated))
        setDraft(quotePrepDraftFromCustomerFile(updated))
        setGateDraft(quotePrepGateDraftFromCustomerFile(updated))
        // Activity: quote_line_saved on every save; quote_gate_changed when
        // the gate status flipped against the pre-save snapshot.
        try {
          await appendActivityForFile(storage, fileId, {
            kind: 'quote_line_saved',
            summary: 'Quote / Prep saved.',
          })
          const postStatus = projectQuotePrepGateStatus(updated).status
          if (prevGateStatus && postStatus && prevGateStatus !== postStatus) {
            await appendActivityForFile(storage, fileId, {
              kind: 'quote_gate_changed',
              summary: `Gate moved to ${postStatus.replace(/_/g, ' ')}.`,
            })
          }
        } catch { /* activity is best-effort */ }
      }
      setDirty(false); setSavedAt(new Date().toISOString())
    } catch (err) {
      saveState.markError(err.message || String(err))
      setSaveError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAcknowledgeZcAck() {
    if (!fileId || submitting) return
    setSubmitting(true); setSaveError('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      saveState.markSaving()
      const updated = await acknowledgeZcGasInsertOnFile({
        storage,
        fileId,
        actor: (file && file.customerName) || '',
      })
      saveState.markSaved()
      if (updated) {
        setFile(projectCustomerFileForDisplay(updated))
        // Lines / notes are preserved on the file row; refresh the draft from
        // the same row so the engine input stays in sync with saved state.
        setDraft(quotePrepDraftFromCustomerFile(updated))
        setGateDraft(quotePrepGateDraftFromCustomerFile(updated))
      }
    } catch (err) {
      saveState.markError(err.message || String(err))
      setSaveError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldRulesResult = useMemo(() => {
    if (!file) return null
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    return evaluateFieldRules(engineFile, { discussionText })
  }, [file, draft])

  const reviewSummary = useMemo(
    () => summarizeQuotePrepReview(draft.lines),
    [draft.lines],
  )

  const gateResult = useMemo(() => {
    if (!file) return null
    // Gate evaluator reads gate fields off the file shape; overlay the
    // unsaved gate draft so the rep sees the impact of edits live.
    const fileWithGate = { ...file, ...gateDraft }
    return evaluateQuotePrepGate({ file: fileWithGate, draft, fieldRulesResult })
  }, [file, draft, fieldRulesResult, gateDraft])

  const fieldRulesBlocker = fieldRulesResult
    ? fieldRulesResult.findings.find((f) => f.severity === 'blocker' && f.status === 'triggered')
    : null

  // Source Context view model — built from the saved file + pre-loaded activity/follow-up.
  // Uses the saved file (not unsaved draft) so the context reflects what is durable.
  const contextView = useMemo(() => {
    if (!file) return null
    // Merge saved file with unsaved draft lines so evidence notes in the
    // active draft are visible in the drawer before saving.
    const fileWithDraft = { ...file, quotePrepLines: draft.lines, quotePrepNotes: draft.notes }
    return buildQuotePrepContext(fileWithDraft, activityEvents, followUp)
  }, [file, draft, activityEvents, followUp])

  function handleAddContextToPrepNotes(summary) {
    if (!summary) return
    const stamp = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const note = `[Context · ${stamp}] ${summary}`
    setDraft((prev) => {
      const sep = prev.notes ? '\n' : ''
      return { ...prev, notes: prev.notes + sep + note }
    })
    setDirty(true); setSavedAt(null)
    setContextNoteAdded(true)
  }

  let body
  if (loading) {
    body = <div style={{ padding: '24px 28px 28px' }}><p className="body-sm">Loading file…</p></div>
  } else if (missing) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <h2 className="serif-h h2">Quote / Prep.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Open a real Customer File first — this workspace only attaches to saved files.
        </p>
      </div>
    )
  } else if (errorMsg) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--ember)' }}>
          <span className="eyebrow eyebrow-ember">Storage error</span>
          <p className="body-sm" style={{ marginTop: 4 }}>{errorMsg}</p>
        </div>
      </div>
    )
  } else {
    const setupLabel = (file && SETUP_TYPE_LABELS[file.lensSetupType]) || ''
    const lines = draft.lines
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h2 className="serif-h h2">Quote / Prep.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            {file && file.customerName ? `${file.customerName} · ` : ''}
            Prep workbench for proposed line items and assumptions.
          </p>
          <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
            Prep only · BisTrack remains source of truth for the official quote.
          </p>
          <div className="hstack" style={{ marginTop: 8, gap: 12, flexWrap: 'wrap' }}>
            {file && file.projectAddress && (
              <span className="body-sm" style={{ color: 'var(--ink)' }}>{file.projectAddress}</span>
            )}
            {setupLabel && (
              <span className="source source-manual">{setupLabel.toUpperCase()}</span>
            )}
          </div>
          {savedAt && !dirty && (
            <p className="body-sm" style={{ marginTop: 8, color: 'var(--brass)' }}>
              Saved locally · {new Date(savedAt).toLocaleTimeString()}
            </p>
          )}
          {saveError && (
            <p className="body-sm" style={{ marginTop: 8, color: 'var(--ember)' }}>
              Save failed: {saveError}
            </p>
          )}
          <hr className="rule-brass" style={{ margin: '20px 0' }} />

          <ReviewSummaryCard summary={reviewSummary} />

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'flex-start', marginTop: 18 }}>
            <form id="quote-prep-form" onSubmit={handleSave}>
              <section ref={linesSectionRef}>
                <div className="hstack">
                  <span className="eyebrow eyebrow-ember">PROPOSED LINE ITEMS</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={handleAdd}
                    disabled={submitting}
                  >
                    + Add line item
                  </button>
                </div>
                {lines.length === 0 ? (
                  <div className="card-flat" style={{ padding: 18, marginTop: 10 }}>
                    <span className="eyebrow eyebrow-ink">NO PROPOSED LINE ITEMS YET</span>
                    <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                      Add line items as you work them out. Nothing here goes to the
                      customer — this is your prep workbench.
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className="btn btn-primary" onClick={handleAdd}>
                        Add line item
                      </button>
                    </div>
                  </div>
                ) : (
                  lines.map((line) => (
                    <LineRow
                      key={line.id}
                      line={normalizeQuotePrepLine(line)}
                      onPatch={handlePatch}
                      onRemove={handleRemove}
                      disabled={submitting}
                    />
                  ))
                )}
              </section>

              <section style={{ marginTop: 18 }}>
                <span className="eyebrow eyebrow-ink">PREP NOTES · REP-ONLY</span>
                <textarea
                  className="field"
                  rows={4}
                  value={draft.notes}
                  onChange={(e) => handleNotes(e.target.value)}
                  placeholder="Open questions, assumptions, things to confirm before BisTrack."
                  disabled={submitting}
                  style={{ marginTop: 6, width: '100%' }}
                />
              </section>
            </form>

            <div>
              <VerifiedFromLensCard file={file} />
              <div style={{ marginTop: 18 }}>
                <span className="eyebrow eyebrow-ink">SOURCE CHECK</span>
                <p className="body-sm" style={{ marginTop: 6 }}>
                  BisTrack remains final. Items here are proposed and editable
                  until the official quote is written.
                </p>
              </div>
            </div>
          </div>

          <div ref={fieldRulesSectionRef} style={{ marginTop: 18 }}>
            <span className="eyebrow eyebrow-ink">RULES CHECK</span>
            <div style={{ marginTop: 6 }}>
              <FieldRulesCard
                result={fieldRulesResult}
                onAcknowledgeZcAck={handleAcknowledgeZcAck}
                canAcknowledge={!submitting}
              />
            </div>
          </div>

          <GateCard
            result={gateResult}
            gateDraft={gateDraft}
            onPatch={handleGatePatch}
            onReasonAction={handleReasonAction}
            quoteTypeRef={quoteTypeRef}
            disabled={submitting}
          />

          <div style={{ marginTop: 24, borderTop: '1px solid var(--stone-200)', paddingTop: 16 }}>
            <div className="hstack" style={{ marginBottom: showContext ? 14 : 0 }}>
              <span className="eyebrow eyebrow-ink">SOURCE CONTEXT</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setShowContext((v) => {
                    if (v) setContextNoteAdded(false)
                    return !v
                  })
                }}
                aria-expanded={showContext}
              >
                {showContext ? 'Close Source Context' : 'Open Source Context'}
              </button>
            </div>
            {!showContext && (
              <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 4 }}>
                Internal evidence trail — customer context, field rule findings, gate status, recent activity, and line evidence notes.
              </p>
            )}
            {showContext && contextView && (
              <SourceContextPanel
                ctx={contextView}
                onAddToPrepNotes={handleAddContextToPrepNotes}
                addedToPrepNotes={contextNoteAdded}
                disabled={submitting}
              />
            )}
            {showContext && !contextView && (
              <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 4 }}>
                Source context unavailable — open a real Customer File first.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  let primaryAction
  let primaryButton
  if (dirty) {
    primaryAction = 'Save Quote / Prep changes.'
    primaryButton = (
      <button type="submit" form="quote-prep-form" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save Quote / Prep'}
      </button>
    )
  } else {
    primaryAction = 'Add or refine proposed line items.'
    primaryButton = (
      <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={submitting || missing || loading || !!errorMsg}>
        Add line item
      </button>
    )
  }

  const lensCta = onOpenLens && fileId ? (
    <button type="button" className="btn btn-quiet" onClick={() => onOpenLens(fileId)}>
      Open Setup + Goal Lens
    </button>
  ) : null

  const handoffCta = onOpenHandoff && fileId ? (
    <button type="button" className="btn btn-quiet" onClick={() => onOpenHandoff(fileId)}>
      Open BisTrack Handoff
    </button>
  ) : null

  const proposalCta = onOpenProposalPreview && fileId ? (
    <button type="button" className="btn btn-quiet" onClick={() => onOpenProposalPreview(fileId)}>
      Preview Proposal
    </button>
  ) : null

  return (
    <>
      <div className="shell-content">{body}</div>
      <NextActionBar
        action={primaryAction}
        why="Quote / Prep is the rep-only workbench. The official quote stays in BisTrack."
        blocking={fieldRulesBlocker ? `${fieldRulesBlocker.label} — ${fieldRulesBlocker.action || 'review needed'}.` : null}
        dontForget="No customer-facing output here yet — this is prep, not a proposal."
        primary={primaryButton}
        secondary={
          <>
            {proposalCta}
            {handoffCta}
            {lensCta}
            {onBack ? (
              <button type="button" className="btn btn-quiet" onClick={onBack}>← Back to Customer File</button>
            ) : null}
          </>
        }
      />
    </>
  )
}
