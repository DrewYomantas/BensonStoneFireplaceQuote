import { useEffect, useState } from 'react'
import SetupGoalLensForm from '../components/lens/SetupGoalLensForm.jsx'
import ClarifyingQuestionsCard from '../components/lens/ClarifyingQuestionsCard.jsx'
import FieldRulesCard from '../components/file/FieldRulesCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { evaluateFieldRules } from '../lib/fieldRules.js'
import { buildLensEngineInput } from '../lib/lensFieldRulesInput.js'
import { acknowledgeZcGasInsertOnFile } from '../lib/zcGasInsertAck.js'
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
  emptyLensDraft,
  lensDraftFromCustomerFile,
  buildCustomerFilePatchFromLens,
  setLensFactSource,
  setLensFactValue,
  deriveLensWarnings,
  isLensReadyForProposal,
  CONSTRUCTION_FLAGS,
} from '../lib/setupGoalLens.js'

const SOURCE_PAIRED_FIELDS = new Set([
  'setupType', 'desiredOutcome', 'fuelGasPresent',
  'fuelElectricPresent', 'gasType', 'venting',
])

export default function SetupGoalLensScreen({ fileId, onBack, onSaved }) {
  const [file, setFile] = useState(null)
  const [draft, setDraft] = useState(emptyLensDraft())
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [missing, setMissing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setLoading(true); setMissing(false); setErrorMsg('')
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
        setDraft(lensDraftFromCustomerFile(row))
        setLoading(false)
      } catch (err) {
        if (!cancelled) { setErrorMsg(err.message || String(err)); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  function update(field, value) {
    setDraft((prev) => SOURCE_PAIRED_FIELDS.has(field)
      ? setLensFactValue(prev, field, value)
      : { ...prev, [field]: value })
    setDirty(true); setSavedAt(null)
  }

  function markSource(field, kind) {
    setDraft((prev) => setLensFactSource(prev, field, kind))
    setDirty(true); setSavedAt(null)
  }

  function toggleFlag(flag) {
    if (!CONSTRUCTION_FLAGS.includes(flag)) return
    setDraft((prev) => {
      const has = prev.constructionFlags.includes(flag)
      const next = has
        ? prev.constructionFlags.filter((f) => f !== flag)
        : [...prev.constructionFlags, flag]
      return { ...prev, constructionFlags: next }
    })
    setDirty(true); setSavedAt(null)
  }

  async function handleAcknowledgeZcAck() {
    if (!fileId || submitting) return
    setSubmitting(true); setErrorMsg('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      const lensPatch = buildCustomerFilePatchFromLens(draft)
      saveState.markSaving()
      const updated = await acknowledgeZcGasInsertOnFile({
        storage,
        fileId,
        actor: (file && file.customerName) || '',
        extraPatch: lensPatch,
      })
      saveState.markSaved()
      if (updated) {
        setFile(projectCustomerFileForDisplay(updated))
        setDraft(lensDraftFromCustomerFile(updated))
      }
      setDirty(false); setSavedAt(new Date().toISOString())
      if (onSaved) onSaved(fileId)
    } catch (err) {
      saveState.markError(err.message || String(err))
      setErrorMsg(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSave(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!fileId || submitting) return
    setSubmitting(true); setErrorMsg('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      const patch = buildCustomerFilePatchFromLens(draft)
      saveState.markSaving()
      const updated = await updateCustomerFileDurable(storage, fileId, patch)
      saveState.markSaved()
      if (updated) {
        setFile(projectCustomerFileForDisplay(updated))
        setDraft(lensDraftFromCustomerFile(updated))
      }
      setDirty(false); setSavedAt(new Date().toISOString())
      if (onSaved) onSaved(fileId)
    } catch (err) {
      saveState.markError(err.message || String(err))
      setErrorMsg(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const { blockers, warnings, questions } = deriveLensWarnings(draft)
  const ready = isLensReadyForProposal(draft)
  const lensFieldRulesResult = file
    ? evaluateFieldRules(buildLensEngineInput(file, draft))
    : null
  const lensHasUnsavedChanges = dirty

  let primaryAction
  let primaryButton
  if (dirty) {
    primaryAction = 'Save setup lens.'
    primaryButton = (
      <button type="submit" form="setup-goal-lens-form" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save setup lens'}
      </button>
    )
  } else if (savedAt) {
    primaryAction = 'Return to Customer File.'
    primaryButton = (
      <button type="button" className="btn btn-primary" onClick={onBack}>
        Return to Customer File
      </button>
    )
  } else {
    primaryAction = ready ? 'Save setup lens to confirm what was captured.' : 'Capture what you know — leave the rest unknown.'
    primaryButton = (
      <button type="submit" form="setup-goal-lens-form" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save setup lens'}
      </button>
    )
  }

  let body
  if (loading) {
    body = <div style={{ padding: '24px 28px 28px' }}><p className="body-sm">Loading file…</p></div>
  } else if (missing) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <h2 className="serif-h h2">Setup + Goal Lens.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Open a real Customer File first — sample cards don&apos;t carry through.
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
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h2 className="serif-h h2">Setup + Goal Lens.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            {file && file.customerName ? `${file.customerName} · ` : ''}
            What do they have? What do they want? What still needs to be verified?
          </p>
          {savedAt && !dirty && (
            <p className="body-sm" style={{ marginTop: 8, color: 'var(--brass)' }}>
              Saved locally · {new Date(savedAt).toLocaleTimeString()}
            </p>
          )}
          <hr className="rule-brass" style={{ margin: '20px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'flex-start' }}>
            <form id="setup-goal-lens-form" onSubmit={handleSave}>
              <SetupGoalLensForm
                draft={draft}
                onChange={update}
                onMarkSource={markSource}
                onToggleFlag={toggleFlag}
              />
            </form>
            <ClarifyingQuestionsCard blockers={blockers} warnings={warnings} questions={questions} />
          </div>
          <div style={{ marginTop: 18 }}>
            <FieldRulesCard
              result={lensFieldRulesResult}
              onAcknowledgeZcAck={handleAcknowledgeZcAck}
              canAcknowledge={!submitting}
            />
            {lensHasUnsavedChanges && (
              <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                Acknowledging here also saves the Lens.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="shell-content">{body}</div>
      <NextActionBar
        action={primaryAction}
        why="Source-stamped facts are how we keep assumptions out of customer-facing proposals."
        blocking={blockers[0] ? blockers[0].message : null}
        dontForget="VERIFIED is for things you've physically seen. Otherwise SAID or ASSUMED."
        primary={primaryButton}
        secondary={onBack ? (
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            ← Back to Customer File
          </button>
        ) : null}
      />
    </>
  )
}
