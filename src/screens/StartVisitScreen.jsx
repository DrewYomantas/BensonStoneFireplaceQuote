import { useEffect, useRef, useState } from 'react'
import StartVisitSection from '../components/visit/StartVisitSection.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import {
  emptyDraft,
  loadStartVisitDraft,
  saveStartVisitDraft,
  clearStartVisitDraft,
  submitStartVisitDraft,
} from '../lib/startVisitDraft.js'
import { ensureSalesOsBoot, getSalesOsStorage, getSalesOsSaveState } from '../lib/salesOsStorageBoot.js'
import { buildStartVisitCustomerFile } from '../lib/startVisitCustomerFile.js'

export default function StartVisitScreen({ onCustomerFileCreated }) {
  const [values, setValues] = useState(emptyDraft())
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const dirtyRef = useRef(false)
  const valuesRef = useRef(values)
  useEffect(() => { valuesRef.current = values }, [values])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (!ready.ok) {
          if (!cancelled) { setErrorMsg(ready.error || 'Storage unavailable'); setLoaded(true) }
          return
        }
        const storage = getSalesOsStorage()
        const draft = await loadStartVisitDraft(storage)
        if (!cancelled) { setValues(draft); setLoaded(true) }
      } catch (err) {
        if (!cancelled) { setErrorMsg(err.message || String(err)); setLoaded(true) }
      }
    })()
    return () => { cancelled = true }
  }, [])

  function onChange(name, value) {
    dirtyRef.current = true
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function persistDraft(next) {
    if (!loaded) return
    const payload = next || valuesRef.current
    const storage = getSalesOsStorage()
    const saveState = getSalesOsSaveState()
    try {
      saveState.markSaving()
      await saveStartVisitDraft(storage, payload)
      saveState.markSaved()
      dirtyRef.current = false
    } catch (err) {
      saveState.markError(err.message || String(err))
      setErrorMsg(err.message || String(err))
    }
  }

  function onBlur() {
    // Use a microtask so any pending React state commit lands before we
    // snapshot valuesRef. This keeps "blur right after typing" honest.
    if (dirtyRef.current) Promise.resolve().then(() => persistDraft())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrorMsg('')
    const saveState = getSalesOsSaveState()
    try {
      const storage = getSalesOsStorage()
      saveState.markSaving()
      const result = await submitStartVisitDraft(storage, values)
      await clearStartVisitDraft(storage)
      saveState.markSaved()
      setValues(emptyDraft())
      if (onCustomerFileCreated) onCustomerFileCreated(result.customerFile)
    } catch (err) {
      saveState.markError(err.message || String(err))
      setErrorMsg(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const preview = buildStartVisitCustomerFile(values)
  const canSubmit = Boolean(values.customerName && (values.customerPhone || values.customerEmail))
  const blocking = preview.warnings.find((w) => w.code === 'missing-customer-name' || w.code === 'missing-contact')

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
          <h2 className="serif-h h2">Start a visit.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            Capture what you have now. Half-finished is fine — this survives a reload.
          </p>
          <hr className="rule-brass" style={{ margin: '20px 0' }} />
          {errorMsg && (
            <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid var(--ember)' }}>
              <span className="eyebrow eyebrow-ember">Storage error</span>
              <p className="body-sm" style={{ marginTop: 4 }}>{errorMsg}</p>
            </div>
          )}
          <form id="start-visit-form" onSubmit={handleSubmit}>
            <StartVisitSection values={values} onChange={onChange} onBlur={onBlur} />
          </form>
        </div>
      </div>
      <NextActionBar
        action={preview.nextBestMove ? preview.nextBestMove.label : 'Capture customer name to start the file.'}
        why="Visit notes are saved as you type. Reload won't lose anything."
        blocking={blocking ? blocking.message : null}
        dontForget="One line in 'Current setup' is enough — refine later."
        primary={
          <button type="submit" form="start-visit-form" className="btn btn-primary" disabled={!canSubmit || submitting}>
            {submitting ? 'Creating…' : 'Create customer file'}
          </button>
        }
      />
    </>
  )
}
