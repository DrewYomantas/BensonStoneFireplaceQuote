import { useEffect, useMemo, useState } from 'react'
import FieldRulesCard from '../components/file/FieldRulesCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
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
} from '../lib/quotePrepDraft.js'
import { evaluateFieldRules } from '../lib/fieldRules.js'
import { acknowledgeZcGasInsertOnFile } from '../lib/zcGasInsertAck.js'
import { SETUP_TYPE_LABELS } from '../lib/setupGoalLens.js'

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
    </div>
  )
}

export default function QuotePrepScreen({ fileId, onBack, onOpenLens }) {
  const [file, setFile] = useState(null)
  const [draft, setDraft] = useState(emptyQuotePrepDraft())
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setLoading(true); setMissing(false); setErrorMsg('')
      setDirty(false); setSavedAt(null); setSaveError('')
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

  async function handleSave(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!fileId || submitting) return
    setSubmitting(true); setSaveError('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      const patch = buildCustomerFilePatchFromQuotePrep(draft)
      saveState.markSaving()
      const updated = await updateCustomerFileDurable(storage, fileId, patch)
      saveState.markSaved()
      if (updated) {
        setFile(projectCustomerFileForDisplay(updated))
        setDraft(quotePrepDraftFromCustomerFile(updated))
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

  const fieldRulesBlocker = fieldRulesResult
    ? fieldRulesResult.findings.find((f) => f.severity === 'blocker' && f.status === 'triggered')
    : null

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

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'flex-start' }}>
            <form id="quote-prep-form" onSubmit={handleSave}>
              <section>
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

          <div style={{ marginTop: 18 }}>
            <span className="eyebrow eyebrow-ink">RULES CHECK</span>
            <div style={{ marginTop: 6 }}>
              <FieldRulesCard
                result={fieldRulesResult}
                onAcknowledgeZcAck={handleAcknowledgeZcAck}
                canAcknowledge={!submitting}
              />
            </div>
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
