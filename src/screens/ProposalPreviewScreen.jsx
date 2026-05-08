import { useEffect, useMemo, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getCustomerFileDurable } from '../lib/customerFileDurable.js'
import { projectCustomerFileForDisplay } from '../lib/customerFileView.js'
import { buildCustomerProposalPreview } from '../lib/customerProposalPreview.js'

// ---- Proposal document sub-components (module-level, not inside render) ----

function ProposalHeader({ preview }) {
  return (
    <div style={{ borderBottom: '2px solid var(--brass)', paddingBottom: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow eyebrow-ember" style={{ marginBottom: 6, letterSpacing: '0.18em' }}>
            BENSON STONE · FIREPLACE DEPARTMENT
          </p>
          <h1
            className="serif-h"
            style={{
              fontSize: 28, fontWeight: 700, color: 'var(--ink)',
              margin: 0, lineHeight: 1.15,
            }}
          >
            {preview.title}
          </h1>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p className="body-sm" style={{ color: 'var(--slate)', margin: 0 }}>{preview.dateLabel}</p>
        </div>
      </div>
      {(preview.customerName || preview.projectLabel) && (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {preview.customerName && (
            <span
              className="serif-h"
              style={{ fontSize: 17, color: 'var(--ink)', fontWeight: 600, margin: 0 }}
            >
              {preview.customerName}
            </span>
          )}
          {preview.customerName && preview.projectLabel && (
            <span style={{ color: 'var(--stone-300)', lineHeight: '1.6' }}>·</span>
          )}
          {preview.projectLabel && (
            <span className="body-sm" style={{ color: 'var(--slate)', lineHeight: '1.6' }}>
              {preview.projectLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ProposalSection({ eyebrow, children, style }) {
  return (
    <div style={{ marginBottom: 28, ...style }}>
      {eyebrow && (
        <p
          className="eyebrow eyebrow-ink"
          style={{ letterSpacing: '0.16em', marginBottom: 8 }}
        >
          {eyebrow}
        </p>
      )}
      {children}
    </div>
  )
}

function BreakdownGroup({ group }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p
        className="eyebrow eyebrow-ember"
        style={{ fontSize: 10, letterSpacing: '0.18em', marginBottom: 6 }}
      >
        {group.label.toUpperCase()}
      </p>
      <div>
        {group.lines.map((line) => (
          <div
            key={line.id}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid var(--stone-150)',
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                className="body-sm"
                style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}
              >
                {line.name}
              </span>
              {(line.brand || line.partNumber) && (
                <span className="body-sm" style={{ color: 'var(--slate-soft)', marginLeft: 8 }}>
                  {[line.brand, line.partNumber].filter(Boolean).join(' · ')}
                </span>
              )}
              {line.customerSafeNotes && (
                <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2, marginBottom: 0 }}>
                  {line.customerSafeNotes}
                </p>
              )}
            </div>
            {line.quantity && (
              <span
                className="body-sm"
                style={{
                  color: 'var(--slate)', flexShrink: 0,
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  minWidth: 24, textAlign: 'right',
                }}
              >
                {line.quantity}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProposalDocument({ preview }) {
  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--paper-edge)',
        borderRadius: 6,
        boxShadow: 'var(--sh-paper)',
        padding: '40px 48px',
        maxWidth: 720,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <ProposalHeader preview={preview} />

      {/* Warm recap */}
      {preview.warmRecap && (
        <ProposalSection>
          <p
            className="body-sm"
            style={{
              color: 'var(--slate)',
              lineHeight: 1.7,
              fontStyle: 'italic',
              fontFamily: 'var(--font-serif)',
              fontSize: 15,
            }}
          >
            {preview.warmRecap}
          </p>
        </ProposalSection>
      )}

      {/* Customer goal */}
      {preview.goalSummary && (
        <ProposalSection eyebrow="YOUR GOAL">
          <p className="body-sm" style={{ color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {preview.goalSummary}
          </p>
        </ProposalSection>
      )}

      {/* Current setup */}
      {preview.setupSummary && (
        <ProposalSection eyebrow="CURRENT SETUP">
          <p className="body-sm" style={{ color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {preview.setupSummary}
          </p>
        </ProposalSection>
      )}

      {/* Detailed Investment Breakdown */}
      <ProposalSection eyebrow="DETAILED INVESTMENT BREAKDOWN">
        {preview.isEmpty ? (
          <div
            style={{
              border: '1px dashed var(--stone-200)',
              borderRadius: 4,
              padding: '16px 20px',
              textAlign: 'center',
            }}
          >
            <p className="body-sm" style={{ color: 'var(--slate-soft)', margin: 0 }}>
              No reviewed line items yet. Mark proposed items as reviewed in Quote / Prep to see them here.
            </p>
          </div>
        ) : (
          <>
            {preview.breakdownGroups.map((group) => (
              <BreakdownGroup key={group.id} group={group} />
            ))}
            <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 10, margin: '10px 0 0' }}>
              {preview.reviewedLineCount} reviewed item{preview.reviewedLineCount === 1 ? '' : 's'} shown above.
            </p>
          </>
        )}
      </ProposalSection>

      {/* Items to confirm */}
      {preview.assumptions && (
        <ProposalSection eyebrow="ITEMS TO CONFIRM">
          <p className="body-sm" style={{ color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {preview.assumptions}
          </p>
        </ProposalSection>
      )}

      {/* Next step */}
      {preview.nextStep && (
        <ProposalSection eyebrow="NEXT STEP">
          <p className="body-sm" style={{ color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {preview.nextStep}
          </p>
        </ProposalSection>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--stone-200)', paddingTop: 20, marginTop: 8 }}>
        {preview.disclaimers.map((d, i) => (
          <p
            key={i}
            className="body-sm"
            style={{
              color: 'var(--slate-soft)',
              fontSize: 12,
              lineHeight: 1.6,
              margin: i === 0 ? 0 : '6px 0 0',
            }}
          >
            {d}
          </p>
        ))}
      </div>
    </div>
  )
}

function GateWarningPanel({ gateStatus, onOpenQuotePrep, onOpenLens, fileId, disabled }) {
  if (gateStatus.isReady) return null
  return (
    <div
      style={{
        background: 'var(--review-soft)',
        border: '1px solid var(--brass)',
        borderRadius: 6,
        padding: '14px 18px',
        marginBottom: 24,
        maxWidth: 720,
        margin: '0 auto 24px',
      }}
    >
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">NEEDS REVIEW BEFORE CUSTOMER USE</span>
      </div>
      <p className="body-sm" style={{ marginTop: 6, color: 'var(--ink)' }}>
        {gateStatus.hasLines
          ? 'Some proposed items are not yet fully reviewed. Mark lines as ready in Quote / Prep to complete the breakdown.'
          : 'No reviewed line items yet. Open Quote / Prep to add and review proposed items.'}
      </p>
      {gateStatus.reasons.length > 0 && (
        <ul className="body-sm" style={{ marginTop: 8, paddingLeft: 18, color: 'var(--slate)' }}>
          {gateStatus.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onOpenQuotePrep && fileId && (
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled}
            onClick={() => onOpenQuotePrep(fileId)}
          >
            Open Quote / Prep
          </button>
        )}
        {onOpenLens && fileId && (
          <button
            type="button"
            className="btn btn-quiet"
            disabled={disabled}
            onClick={() => onOpenLens(fileId)}
          >
            Open Setup + Goal Lens
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Screen -----------------------------------------------------------------

export default function ProposalPreviewScreen({
  fileId,
  onBack,
  onOpenQuotePrep,
  onOpenLens,
}) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setLoading(true); setMissing(false); setErrorMsg(''); setFile(null)
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
        setLoading(false)
      } catch (err) {
        if (!cancelled) { setErrorMsg(err.message || String(err)); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  const preview = useMemo(() => {
    if (!file) return null
    return buildCustomerProposalPreview(file)
  }, [file])

  let body
  if (loading) {
    body = <div style={{ padding: '24px 28px 28px' }}><p className="body-sm">Loading file…</p></div>
  } else if (missing) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <h2 className="serif-h h2">Proposal Preview.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Open a real Customer File first — the proposal preview attaches to saved files.
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
  } else if (!preview) {
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <p className="body-sm">Loading preview…</p>
      </div>
    )
  } else {
    body = (
      <div
        style={{
          padding: '24px 28px 40px',
          background: 'var(--stone-75)',
          minHeight: '100%',
        }}
      >
        {/* Internal header — not part of the proposal document */}
        <div style={{ maxWidth: 720, margin: '0 auto 20px' }}>
          <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <p className="eyebrow eyebrow-ink" style={{ marginBottom: 2 }}>PROPOSAL PREVIEW · INTERNAL</p>
              <p className="body-sm" style={{ color: 'var(--slate)', margin: 0 }}>
                Read-only draft view. Nothing is sent. Official quote stays in BisTrack.
              </p>
            </div>
          </div>
        </div>

        {/* Gate warning — above the document, not part of the proposal */}
        <GateWarningPanel
          gateStatus={preview.gateStatus}
          onOpenQuotePrep={onOpenQuotePrep}
          onOpenLens={onOpenLens}
          fileId={fileId}
          disabled={false}
        />

        {/* Customer-facing proposal document */}
        <ProposalDocument preview={preview} />
      </div>
    )
  }

  return (
    <>
      <div className="shell-content">{body}</div>
      <NextActionBar
        action={
          preview && preview.gateStatus.isReady
            ? 'Ready to build in BisTrack. Build and verify the official quote there.'
            : 'Review and mark proposed items in Quote / Prep to complete this preview.'
        }
        why="The official quote stays in BisTrack. This is a draft preview only — nothing is sent."
        dontForget="Share nothing from this screen directly with the customer — copy from BisTrack."
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
