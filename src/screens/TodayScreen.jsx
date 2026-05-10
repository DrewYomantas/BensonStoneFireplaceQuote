import { useEffect, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import { projectCustomerFilesList, enrichCustomerFilesListWithFollowUps } from '../lib/customerFilesList.js'
import { listAllFollowUps } from '../lib/visitActivity.js'
import { deriveTodayCockpit } from '../lib/todayCockpit.js'

function formatStamp(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

function formatDue(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return 'due today'
    return `due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  } catch { return '' }
}

// ---- Follow-Ups Due row ----------------------------------------------------

function FollowUpRow({ entry, onOpen }) {
  const { row, cadence } = entry
  const followUpNote = row.followUp?.note
  const dueLabel = formatDue(row.followUp?.dueAt)
  const isOverdue = row.followUp?.signal?.kind === 'overdue'
  const actionCopy = cadence?.nextActionCopy || ''

  return (
    <button
      type="button"
      className="card"
      onClick={() => onOpen && onOpen(row.id)}
      aria-label={`Open follow-up for ${row.customerName || 'unnamed customer'}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: 14, marginTop: 10, cursor: 'pointer',
        background: 'var(--paper)', border: '1px solid var(--rule)',
        borderLeft: `3px solid var(--ember)`,
      }}
    >
      <div className="hstack">
        <span className="eyebrow eyebrow-ink">{row.customerName || 'Unnamed customer'}</span>
        <span className="spacer" />
        <span className="body-sm" style={{ color: 'var(--ember)' }}>
          {isOverdue ? 'overdue' : dueLabel}
        </span>
      </div>
      {row.contact && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{row.contact}</p>
      )}
      {followUpNote && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--ink)' }}>{followUpNote}</p>
      )}
      {actionCopy && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--ember)' }}>{actionCopy}</p>
      )}
    </button>
  )
}

// ---- Quote Actions Needed row -----------------------------------------------

function QuoteActionRow({ entry, onOpen }) {
  const { row, reason } = entry
  return (
    <button
      type="button"
      className="card"
      onClick={() => onOpen && onOpen(row.id)}
      aria-label={`Open quote prep for ${row.customerName || 'unnamed customer'}`}
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
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{formatStamp(row.updatedAt)}</span>
        )}
      </div>
      {row.contact && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{row.contact}</p>
      )}
      {reason && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--brass)' }}>{reason}</p>
      )}
    </button>
  )
}

// ---- Recent file row --------------------------------------------------------

function RecentFileRow({ row, onOpen }) {
  const followUpSignal = row.followUp?.signal
  const prepLabel = (() => {
    if (!row.quotePrep?.hasLines) return null
    if (row.quotePrep.status === 'ready') return { text: 'Ready to build in BisTrack.', color: 'var(--brass)' }
    if (row.quotePrep.status === 'needs_verification') return { text: 'Prep needs verification.', color: 'var(--ember)' }
    return null
  })()

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
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{formatStamp(row.updatedAt)}</span>
        )}
      </div>
      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {row.contact && <span className="body-sm" style={{ color: 'var(--ink)' }}>{row.contact}</span>}
        {row.projectAddress && <span className="body-sm" style={{ color: 'var(--slate)' }}>{row.projectAddress}</span>}
        {row.lensSetupTypeLabel && <span className="source source-manual">{row.lensSetupTypeLabel.toUpperCase()}</span>}
      </div>
      {row.summary && <p className="body-sm" style={{ marginTop: 6 }}>{row.summary}</p>}
      {followUpSignal && followUpSignal.kind !== 'none' && followUpSignal.kind !== 'overdue' && followUpSignal.kind !== 'today' && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{followUpSignal.text}</p>
      )}
      {prepLabel && <p className="body-sm" style={{ marginTop: 4, color: prepLabel.color }}>{prepLabel.text}</p>}
    </button>
  )
}

// ---- Empty state panel -------------------------------------------------------

function EmptyPanel({ onOpenStartVisit, onOpenAddQuote, onOpenList }) {
  return (
    <div className="card-flat" style={{ padding: 16 }}>
      <span className="eyebrow eyebrow-ink">No saved Customer Files yet</span>
      <p className="body-sm" style={{ marginTop: 6 }}>
        Add a quote PDF to start a Customer File, or open a brand-new visit.
      </p>
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {onOpenAddQuote && (
          <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>Add Quote PDF</button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>Start a visit</button>
        {onOpenList && (
          <button type="button" className="btn btn-quiet" onClick={onOpenList}>View all Customer Files</button>
        )}
      </div>
    </div>
  )
}

// ---- NextActionBar derived content ------------------------------------------

function deriveNextBar({ oneThing, onOpenFile, onOpenAddQuote, onOpenStartVisit }) {
  if (!oneThing) {
    return {
      action: 'Add a quote PDF, reopen a recent file, or start a new visit.',
      why: 'Most days start with one quote PDF — the customer file builds from there.',
      primary: onOpenAddQuote ? (
        <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>Add Quote PDF</button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>Start a new visit</button>
      ),
    }
  }

  const action = oneThing.text
  let primary
  if (oneThing.kind === 'follow-up' || oneThing.kind === 'recent-file') {
    primary = (
      <button type="button" className="btn btn-primary" onClick={() => onOpenFile && onOpenFile(oneThing.targetFileId)}>
        Open file
      </button>
    )
  } else if (oneThing.kind === 'quote-action') {
    primary = (
      <button type="button" className="btn btn-primary" onClick={() => onOpenFile && onOpenFile(oneThing.targetFileId)}>
        Open file
      </button>
    )
  } else {
    primary = onOpenAddQuote ? (
      <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>Add Quote PDF</button>
    ) : (
      <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>Start a new visit</button>
    )
  }

  return { action, why: null, primary }
}

// ---- Main screen -----------------------------------------------------------

export default function TodayScreen({ onOpenStartVisit, onOpenFile, onOpenFilesList, onOpenAddQuote }) {
  const [state, setState] = useState({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setState({ kind: 'error', error: ready.error || 'Storage unavailable' })
          return
        }
        const storage = getSalesOsStorage()
        const [raw, followUps] = await Promise.all([
          listCustomerFilesDurable(storage),
          listAllFollowUps(storage),
        ])
        if (cancelled) return
        const now = new Date()
        const allRows = enrichCustomerFilesListWithFollowUps(projectCustomerFilesList(raw), followUps, now)
        const cockpit = deriveTodayCockpit(allRows, now)
        const isEmpty = allRows.length === 0
        setState({ kind: 'ok', cockpit, isEmpty })
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', error: err.message || String(err) })
      }
    })()
    return () => { cancelled = true }
  }, [])

  const cockpit = state.kind === 'ok' ? state.cockpit : null
  const { followUpsToday = [], quoteActionsNeeded = [], recentRows = [], oneThing = null } = cockpit || {}

  const nextBar = deriveNextBar({ oneThing, onOpenFile, onOpenAddQuote, onOpenStartVisit })

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px' }}>
          <h2 className="serif-h h3">Good morning, Drew.</h2>
          <p className="body" style={{ marginTop: 4, color: 'var(--slate)' }}>
            {state.kind === 'loading'
              ? 'Loading…'
              : oneThing
                ? oneThing.text
                : 'Pick up where you left off, or start a new visit.'}
          </p>

          {state.kind === 'error' && (
            <div className="card" style={{ marginTop: 16, padding: 14, borderLeft: '3px solid var(--ember)' }}>
              <span className="eyebrow eyebrow-ember">Storage error</span>
              <p className="body-sm" style={{ marginTop: 4 }}>{state.error}</p>
              <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>Files stay on this tablet — try reloading.</p>
            </div>
          )}

          {state.kind === 'ok' && state.isEmpty && (
            <section style={{ marginTop: 20 }}>
              <EmptyPanel
                onOpenStartVisit={onOpenStartVisit}
                onOpenAddQuote={onOpenAddQuote}
                onOpenList={onOpenFilesList}
              />
            </section>
          )}

          {/* Section 1: Follow-ups due */}
          {followUpsToday.length > 0 && (
            <section style={{ marginTop: 20 }} aria-labelledby="today-followup-heading">
              <div className="hstack">
                <span id="today-followup-heading" className="eyebrow eyebrow-ember">FOLLOW-UPS DUE</span>
                <span className="spacer" />
                <span className="body-sm" style={{ color: 'var(--ember)' }}>
                  {followUpsToday.length} waiting
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                {followUpsToday.map((entry) => (
                  <FollowUpRow key={entry.row.id} entry={entry} onOpen={onOpenFile} />
                ))}
              </div>
            </section>
          )}

          {/* Section 2: Quote actions needed */}
          {quoteActionsNeeded.length > 0 && (
            <section style={{ marginTop: 20 }} aria-labelledby="today-quoteaction-heading">
              <div className="hstack">
                <span id="today-quoteaction-heading" className="eyebrow eyebrow-ink">QUOTE ACTIONS NEEDED</span>
                <span className="spacer" />
                <span className="body-sm" style={{ color: 'var(--slate)' }}>
                  {quoteActionsNeeded.length} {quoteActionsNeeded.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                {quoteActionsNeeded.map((entry) => (
                  <QuoteActionRow key={entry.row.id} entry={entry} onOpen={onOpenFile} />
                ))}
              </div>
            </section>
          )}

          {/* Section 3: Recent Customer Files */}
          {!state.isEmpty && (
            <section style={{ marginTop: 20 }} aria-labelledby="today-recent-heading">
              <div className="hstack">
                <span id="today-recent-heading" className="eyebrow eyebrow-ember">RECENT CUSTOMER FILES</span>
                <span className="spacer" />
                {recentRows.length > 0 && (
                  <span className="body-sm" style={{ color: 'var(--slate)' }}>{recentRows.length} most recent</span>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                {state.kind === 'loading' && <p className="body-sm">Loading recent files…</p>}
                {recentRows.length === 0 && state.kind === 'ok' && followUpsToday.length + quoteActionsNeeded.length > 0 && (
                  <p className="body-sm" style={{ color: 'var(--slate)' }}>All active files are shown above.</p>
                )}
                {recentRows.map((row) => (
                  <RecentFileRow key={row.id} row={row} onOpen={onOpenFile} />
                ))}
                {recentRows.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-quiet" onClick={onOpenFilesList}>
                      View all Customer Files →
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

        </div>
      </div>

      <NextActionBar
        action={nextBar.action}
        why={nextBar.why || 'Customer Files stay on this tablet. Backup from the top bar before closing.'}
        dontForget="Customer Files stay on this tablet. Backup from the top bar before closing."
        primary={nextBar.primary}
        secondary={
          <>
            <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>Start a new visit</button>
            <button type="button" className="btn btn-quiet" onClick={onOpenFilesList}>View all Customer Files</button>
          </>
        }
      />
    </>
  )
}
