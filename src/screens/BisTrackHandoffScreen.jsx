import { useEffect, useMemo, useRef, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getCustomerFileDurable } from '../lib/customerFileDurable.js'
import {
  projectBisTrackHandoff,
  formatBisTrackHandoffAsText,
} from '../lib/bisTrackHandoff.js'
import { GATE_STATUS } from '../lib/quotePrepGate.js'
import { appendActivityForFile } from '../lib/visitActivity.js'

function gateBadge(status) {
  if (status === GATE_STATUS.ready) return { label: 'READY FOR BISTRACK', cls: 'source source-verified' }
  if (status === GATE_STATUS.needsVerification) return { label: 'NEEDS VERIFICATION', cls: 'source source-said' }
  return { label: 'DRAFT', cls: 'source source-manual' }
}

function ruleStatusBadge(status) {
  if (status === 'cleared') return { label: 'CLEARED', cls: 'source source-verified' }
  if (status === 'satisfied') return { label: 'SATISFIED', cls: 'source source-verified' }
  if (status === 'soft-warning') return { label: 'WARN', cls: 'source source-said' }
  if (status === 'triggered') return { label: 'TRIGGERED', cls: 'source source-assumed' }
  return { label: status ? status.toUpperCase() : '', cls: 'source source-manual' }
}

function HeaderCard({ view }) {
  const badge = gateBadge(view.gate.status)
  return (
    <section className="card" style={{ padding: 18, borderLeft: '3px solid var(--ember)' }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">INTERNAL BISTRACK HANDOFF</span>
        <span className={badge.cls} style={{ marginLeft: 8 }}>{badge.label}</span>
      </div>
      <h2 className="serif-h h2" style={{ marginTop: 8 }}>
        {view.customer.customerName}
      </h2>
      <div className="hstack" style={{ marginTop: 6, gap: 12, flexWrap: 'wrap' }}>
        {view.customer.contact && (
          <span className="body-sm" style={{ color: 'var(--ink)' }}>{view.customer.contact}</span>
        )}
        {view.customer.projectAddress && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{view.customer.projectAddress}</span>
        )}
      </div>
      <p className="body-sm" style={{ marginTop: 8 }}>{view.subtitle}</p>
    </section>
  )
}

function GateSection({ gate }) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">QUOTE PREP GATE</span>
      <p className="body" style={{ marginTop: 6, fontWeight: 600 }}>{gate.label}</p>
      {gate.helper && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{gate.helper}</p>
      )}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <div>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>QUOTE TYPE</span>
          <p className="body-sm" style={{ marginTop: 2 }}>{gate.quoteType}</p>
        </div>
        <div>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>VERIFICATION OWNER</span>
          <p className="body-sm" style={{ marginTop: 2 }}>{gate.verificationOwner || '—'}</p>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>STILL UNVERIFIED</span>
          <p className="body-sm" style={{ marginTop: 2 }}>{gate.unverifiedItems || '—'}</p>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>NEXT STEP</span>
          <p className="body-sm" style={{ marginTop: 2 }}>{gate.nextStep || '—'}</p>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Stat label="Total" value={gate.counts.total} />
        <Stat label="Needs verification" value={gate.counts.needsVerification} />
        <Stat label="Ready for BisTrack" value={gate.counts.readyForBistrack} />
        <Stat label="Do not use yet" value={gate.counts.doNotUseYet} />
      </div>
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="serif-h" style={{ fontSize: 22, lineHeight: 1.1 }}>{value}</div>
      <div className="body-sm" style={{ color: 'var(--slate)' }}>{label}</div>
    </div>
  )
}

function LensFactsSection({ facts }) {
  if (!facts || facts.length === 0) return null
  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">SETUP + GOAL LENS</span>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {facts.map((f) => (
          <div key={f.label}>
            <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>{f.label.toUpperCase()}</span>
            <p className="body-sm" style={{ marginTop: 2 }}>{f.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function LineItemsSection({ items }) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">PROPOSED LINE ITEMS</span>
        <span className="spacer" />
        <span className="body-sm" style={{ color: 'var(--slate)' }}>
          {items.length} {items.length === 1 ? 'line' : 'lines'}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
          No proposed line items yet — open Quote / Prep to add lines before BisTrack.
        </p>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
          {items.map((line) => (
            <div
              key={line.id}
              style={{
                padding: 14,
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderLeft: '3px solid var(--brass)',
              }}
            >
              <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="eyebrow eyebrow-ink">{(line.name || 'Unnamed line').toUpperCase()}</span>
                <span className="spacer" />
                <span className="source source-manual">{line.sourceBasisLabel}</span>
                <span className="source source-said">{line.reviewStatusLabel}</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {line.brand && <span className="body-sm">Brand: {line.brand}</span>}
                {line.partNumber && <span className="body-sm">Part: <code>{line.partNumber}</code></span>}
                {line.category && <span className="body-sm">Category: {line.category}</span>}
                {line.quantity && <span className="body-sm">Qty: {line.quantity}</span>}
              </div>
              {line.description && (
                <p className="body-sm" style={{ marginTop: 6 }}>{line.description}</p>
              )}
              {line.customerSafeNotes && (
                <p className="body-sm" style={{ marginTop: 6 }}>
                  <strong>Notes:</strong> {line.customerSafeNotes}
                </p>
              )}
              {line.internalPrepNote && (
                <p className="body-sm" style={{ marginTop: 6, color: 'var(--ember)' }}>
                  <strong>Rep-only:</strong> {line.internalPrepNote}
                </p>
              )}
              {line.reviewFlags && line.reviewFlags.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {line.reviewFlags.map((flag) => (
                    <span key={flag} className="source source-manual">{flag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function FieldRulesSection({ fieldRules }) {
  if (!fieldRules || !fieldRules.items || fieldRules.items.length === 0) {
    return (
      <section className="card-flat" style={{ padding: 18 }}>
        <span className="eyebrow eyebrow-ink">FIELD RULES</span>
        <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
          No field rules apply to this file yet.
        </p>
      </section>
    )
  }
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">FIELD RULES</span>
        <span className="spacer" />
        {fieldRules.counts.triggered > 0 && (
          <span className="source source-assumed">{fieldRules.counts.triggered} TRIGGERED</span>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {fieldRules.items.map((f) => {
          const badge = ruleStatusBadge(f.status)
          return (
            <div key={f.id} className="fact-row">
              <div className="fact-row-head">
                <span className="fact-row-label">{f.label}</span>
                <span className={badge.cls}>{badge.label}</span>
              </div>
              {f.reason && <p className="fact-row-sub">{f.reason}</p>}
              {f.action && <p className="fact-row-sub" style={{ color: 'var(--slate)' }}>{f.action}</p>}
            </div>
          )
        })}
      </div>
      {fieldRules.version && (
        <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 8 }}>
          Field Rules · {fieldRules.version}
        </p>
      )}
    </section>
  )
}

function NextActionsSection({ actions, fileId, onOpenQuotePrep, onOpenLens }) {
  if (!actions || actions.length === 0) return null
  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">MISSING / NEXT ACTIONS</span>
      <ul className="body-sm" style={{ marginTop: 8, paddingLeft: 18 }}>
        {actions.map((a, idx) => (
          <li key={idx} style={{ marginBottom: 6 }}>
            <span>{a.message}</span>
            {a.actionTarget === 'lens' && onOpenLens && fileId && (
              <button
                type="button"
                className="btn btn-quiet"
                style={{ marginLeft: 8, padding: '2px 8px' }}
                onClick={() => onOpenLens(fileId)}
              >
                {a.actionLabel || 'Open Setup + Goal Lens'} →
              </button>
            )}
            {a.actionTarget && a.actionTarget.startsWith('quotePrepLine') && onOpenQuotePrep && fileId && (
              <button
                type="button"
                className="btn btn-quiet"
                style={{ marginLeft: 8, padding: '2px 8px' }}
                onClick={() => onOpenQuotePrep(fileId)}
              >
                Go fix in Quote / Prep →
              </button>
            )}
            {a.actionTarget === 'quotePrepGateField' && onOpenQuotePrep && fileId && (
              <button
                type="button"
                className="btn btn-quiet"
                style={{ marginLeft: 8, padding: '2px 8px' }}
                onClick={() => onOpenQuotePrep(fileId)}
              >
                Go fix in Quote / Prep →
              </button>
            )}
            {a.actionTarget === 'fieldRules' && onOpenQuotePrep && fileId && (
              <button
                type="button"
                className="btn btn-quiet"
                style={{ marginLeft: 8, padding: '2px 8px' }}
                onClick={() => onOpenQuotePrep(fileId)}
              >
                Review in Quote / Prep →
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function BisTrackHandoffScreen({ fileId, onBack, onOpenLens, onOpenQuotePrep }) {
  const [file, setFile] = useState(null)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copyState, setCopyState] = useState({ kind: 'idle', message: '' })
  const fallbackTextareaRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setFile(null); setMissing(false); setErrorMsg('')
      if (!fileId || fileId.startsWith('sample-')) {
        setMissing(true)
        return
      }
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) { setErrorMsg(ready.error || 'Storage unavailable'); return }
        const storage = getSalesOsStorage()
        const row = await getCustomerFileDurable(storage, fileId)
        if (cancelled) return
        if (!row) setMissing(true)
        else setFile(row)
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message || String(err))
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  const view = useMemo(() => (file ? projectBisTrackHandoff(file) : null), [file])
  const handoffText = useMemo(() => (view ? formatBisTrackHandoffAsText(view) : ''), [view])

  async function logHandoffCopied() {
    if (!fileId) return
    try {
      const storage = getSalesOsStorage()
      await appendActivityForFile(storage, fileId, {
        kind: 'handoff_copied',
        summary: 'Internal BisTrack handoff copied.',
      })
    } catch { /* activity is best-effort */ }
  }

  async function handleCopy() {
    if (!handoffText) return
    setCopyState({ kind: 'idle', message: '' })
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(handoffText)
        setCopyState({ kind: 'ok', message: 'Copied internal handoff' })
        setTimeout(() => setCopyState((s) => (s.kind === 'ok' ? { kind: 'idle', message: '' } : s)), 2500)
        await logHandoffCopied()
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      setCopyState({
        kind: 'fallback',
        message: 'Clipboard blocked — select the text below and copy manually.',
      })
      // Fallback path still represents intent to copy — log it so the
      // activity timeline reflects the rep's action either way.
      await logHandoffCopied()
      // Best-effort: highlight the textarea once it renders.
      setTimeout(() => {
        const el = fallbackTextareaRef.current
        if (el && el.select) {
          try { el.select() } catch { /* selection not critical */ }
        }
      }, 50)
    }
  }

  let body
  if (missing || !fileId) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <h2 className="serif-h h2">Internal BisTrack Handoff.</h2>
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
  } else if (!view) {
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <p className="body-sm">Loading handoff sheet…</p>
      </div>
    )
  } else {
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
          <HeaderCard view={view} />
          <section className="card-flat" style={{ padding: 14 }}>
            <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span className="eyebrow eyebrow-ink">COPY HANDOFF</span>
              <span className="spacer" />
              <button type="button" className="btn btn-quiet" onClick={handleCopy} disabled={!handoffText}>
                Copy Handoff
              </button>
            </div>
            <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
              Plain text for your own notes — paste into BisTrack or a chat to Liam. Internal prep only.
            </p>
            {copyState.kind === 'ok' && (
              <p className="body-sm" style={{ marginTop: 6, color: 'var(--brass)' }}>
                {copyState.message}
              </p>
            )}
            {copyState.kind === 'fallback' && (
              <div style={{ marginTop: 6 }}>
                <p className="body-sm" style={{ color: 'var(--ember)' }}>{copyState.message}</p>
                <textarea
                  ref={fallbackTextareaRef}
                  className="field"
                  readOnly
                  rows={10}
                  value={handoffText}
                  style={{ marginTop: 6, width: '100%', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                />
              </div>
            )}
          </section>
          {view.warnings.length > 0 && (
            <section className="card-flat" style={{ padding: 14, borderLeft: '3px solid var(--ember)' }}>
              <span className="eyebrow eyebrow-ember">WATCH-OUTS</span>
              <ul className="body-sm" style={{ marginTop: 6, paddingLeft: 18 }}>
                {view.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
              </ul>
            </section>
          )}
          <GateSection gate={view.gate} />
          <LensFactsSection facts={view.lensFacts} />
          <LineItemsSection items={view.lineItems} />
          <FieldRulesSection fieldRules={view.fieldRules} />
          <NextActionsSection
            actions={view.nextActions}
            fileId={fileId}
            onOpenQuotePrep={onOpenQuotePrep}
            onOpenLens={onOpenLens}
          />
          <p className="body-sm" style={{ color: 'var(--slate)' }}>
            {view.sourceNote}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="shell-content">{body}</div>
      <NextActionBar
        action="Build and verify the official quote in BisTrack."
        why="This sheet is internal prep only — BisTrack remains source of truth."
        dontForget="No customer-facing output here. Edit anything from Quote / Prep or Setup + Goal Lens."
        primary={
          onOpenQuotePrep && fileId ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenQuotePrep(fileId)}
            >
              Open Quote / Prep
            </button>
          ) : null
        }
        secondary={
          onBack ? (
            <button type="button" className="btn btn-quiet" onClick={onBack}>
              ← Back to Customer File
            </button>
          ) : null
        }
      />
    </>
  )
}
