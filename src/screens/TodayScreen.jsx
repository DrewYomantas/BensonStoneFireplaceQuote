import { useEffect, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import { recentCustomerFiles, enrichCustomerFilesListWithFollowUps } from '../lib/customerFilesList.js'
import { GATE_STATUS } from '../lib/quotePrepGate.js'
import { listAllFollowUps } from '../lib/visitActivity.js'

function followUpToneColor(tone) {
  if (tone === 'ember') return 'var(--ember)'
  if (tone === 'brass') return 'var(--brass)'
  return 'var(--slate)'
}

function todayPrepSignal(quotePrep) {
  if (!quotePrep) return null
  if (!quotePrep.hasLines) {
    return { text: 'Quote Prep not started.', tone: 'var(--slate)' }
  }
  if (quotePrep.status === GATE_STATUS.ready) {
    return { text: 'Ready to build in BisTrack.', tone: 'var(--brass)' }
  }
  if (quotePrep.status === GATE_STATUS.needsVerification) {
    return { text: 'Prep needs verification.', tone: 'var(--ember)' }
  }
  return { text: 'Quote Prep draft.', tone: 'var(--slate)' }
}

const RECENT_LIMIT = 4


function formatStamp(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function RecentFileRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className="card today-recent-row"
      onClick={() => onOpen && onOpen(row.id)}
      aria-label={`Open Customer File for ${row.customerName || 'unnamed customer'}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: 14, marginTop: 10, cursor: 'pointer',
        background: 'var(--paper)', border: '1px solid var(--rule)',
        borderLeft: '3px solid var(--brass)',
      }}
    >
      <div className="hstack">
        <span className="eyebrow eyebrow-ink">{row.customerName || 'Unnamed customer'}</span>
        <span className="spacer" />
        {row.updatedAt && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>
            {formatStamp(row.updatedAt)}
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {row.contact && (
          <span className="body-sm" style={{ color: 'var(--ink)' }}>{row.contact}</span>
        )}
        {row.projectAddress && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{row.projectAddress}</span>
        )}
        {row.lensSetupTypeLabel && (
          <span className="source source-manual">{row.lensSetupTypeLabel.toUpperCase()}</span>
        )}
      </div>
      {row.summary && (
        <p className="body-sm" style={{ marginTop: 6 }}>{row.summary}</p>
      )}
      {row.followUp && row.followUp.signal && row.followUp.signal.kind !== 'none' && (
        <p className="body-sm" style={{ marginTop: 4, color: followUpToneColor(row.followUp.signal.tone) }}>
          {row.followUp.signal.text}
        </p>
      )}
      {(() => {
        const signal = todayPrepSignal(row.quotePrep)
        if (!signal) return null
        return (
          <p className="body-sm" style={{ marginTop: 4, color: signal.tone }}>
            {signal.text}
          </p>
        )
      })()}
    </button>
  )
}

function RecentFilesPanel({ state, onOpenFile, onOpenStartVisit, onOpenList, onOpenAddQuote }) {
  if (state.kind === 'loading') {
    return <p className="body-sm">Loading recent files…</p>
  }
  if (state.kind === 'error') {
    return (
      <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--ember)' }}>
        <span className="eyebrow eyebrow-ember">Storage error</span>
        <p className="body-sm" style={{ marginTop: 4 }}>{state.error}</p>
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
          Files stay on this tablet — try reloading.
        </p>
      </div>
    )
  }
  if (state.kind === 'empty') {
    return (
      <div className="card-flat" style={{ padding: 16 }}>
        <span className="eyebrow eyebrow-ink">No saved Customer Files yet</span>
        <p className="body-sm" style={{ marginTop: 6 }}>
          Add a quote PDF to start a Customer File, or open a brand-new visit.
        </p>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {onOpenAddQuote && (
            <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>
              Add Quote PDF
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>
            Start a visit
          </button>
          {onOpenList && (
            <button type="button" className="btn btn-quiet" onClick={onOpenList}>
              View all Customer Files
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <>
      {state.rows.map((row) => (
        <RecentFileRow key={row.id} row={row} onOpen={onOpenFile} />
      ))}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-quiet" onClick={onOpenList}>
          View all Customer Files →
        </button>
      </div>
    </>
  )
}

export default function TodayScreen({ onOpenStartVisit, onOpenFile, onOpenFilesList, onOpenAddQuote }) {
  const [recent, setRecent] = useState({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setRecent({ kind: 'error', error: ready.error || 'Storage unavailable' })
          return
        }
        const storage = getSalesOsStorage()
        const [raw, followUps] = await Promise.all([
          listCustomerFilesDurable(storage),
          listAllFollowUps(storage),
        ])
        if (cancelled) return
        const baseRows = recentCustomerFiles(raw, RECENT_LIMIT)
        const rows = enrichCustomerFilesListWithFollowUps(baseRows, followUps, new Date())
        setRecent(rows.length ? { kind: 'ok', rows } : { kind: 'empty' })
      } catch (err) {
        if (!cancelled) {
          setRecent({ kind: 'error', error: err.message || String(err) })
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px' }}>
          <h2 className="serif-h h3">Good morning, Drew.</h2>
          <p className="body" style={{ marginTop: 4, color: 'var(--slate)' }}>
            Pick up where you left off, or start a new visit.
          </p>

          <section style={{ marginTop: 20 }} aria-labelledby="today-recent-heading">
            <div className="hstack">
              <span id="today-recent-heading" className="eyebrow eyebrow-ember">RECENT CUSTOMER FILES</span>
              <span className="spacer" />
              {recent.kind === 'ok' && (
                <span className="body-sm" style={{ color: 'var(--slate)' }}>
                  {recent.rows.length} most recent
                </span>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <RecentFilesPanel
                state={recent}
                onOpenFile={onOpenFile}
                onOpenStartVisit={onOpenStartVisit}
                onOpenList={onOpenFilesList}
                onOpenAddQuote={onOpenAddQuote}
              />
            </div>
          </section>

        </div>
      </div>
      <NextActionBar
        action="Add a quote PDF, reopen a recent file, or start a new visit."
        why="Most days start with one quote PDF — the customer file builds from there."
        dontForget="Customer Files stay on this tablet. Backup from the top bar before closing."
        primary={
          onOpenAddQuote ? (
            <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>
              Add Quote PDF
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>
              Start a new visit
            </button>
          )
        }
        secondary={
          <>
            <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>
              Start a new visit
            </button>
            <button type="button" className="btn btn-quiet" onClick={onOpenFilesList}>
              View all Customer Files
            </button>
          </>
        }
      />
    </>
  )
}
