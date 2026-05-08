import { useEffect, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import TodayActionCard from '../components/today/TodayActionCard.jsx'
import { badgesForFile } from '../lib/fieldRulesBadges.js'
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

const SAMPLE_FILES = [
  {
    id: 'sample-karpinski',
    stamp: 'OVERDUE · 7 DAYS',
    state: 'blocked',
    name: 'Karpinski, Tom',
    note: 'Promised stone allowance estimate Friday.',
    tag: '04-198 · gas insert',
    source: 'bistrack',
    sourceLabel: 'BT-44217',
    nextAction: 'Call about stone allowance before noon',
    fieldRuleSample: {
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert into existing prefab; full install scope, drywall finish work.',
      projectAddress: '14 Oak Ln, Rockford IL 61104',
    },
  },
  {
    id: 'sample-hernandez',
    stamp: 'TODAY · 14:30',
    state: 'review',
    name: 'Hernandez, M & J',
    note: 'Showroom appt. Bring Cosmo I35 spec sheet.',
    tag: '04-217 · wood→gas insert',
    source: 'verified',
    nextAction: 'Confirm flue + gas line at the 2:30',
  },
  {
    id: 'sample-powell',
    stamp: 'WAITING · 11 DAYS',
    state: 'waiting',
    name: 'Powell, Rebecca',
    note: 'Asked about gas line cost. No reply.',
    tag: '04-189 · gas insert · prefers text',
    source: 'said',
    sourceLabel: 'CUSTOMER SAID',
    nextAction: 'Send a warm nudge text',
  },
  {
    id: 'sample-vinson',
    stamp: 'NEW · 11:14',
    state: 'review',
    name: 'Vinson, James',
    note: 'Walk-in. Existing zero-clearance, bedroom remodel.',
    tag: 'Draft 04-220 · file unfinished',
    source: 'manual',
    sourceLabel: 'DRAFT',
    nextAction: 'Finish visit capture + add measurements',
    fieldRuleSample: {
      existingNotes: 'Empire vent-free log set in masonry fireplace, customer wants more heat.',
    },
  },
]

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

function RecentFilesPanel({ state, onOpenFile, onOpenStartVisit, onOpenList }) {
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
          Files appear here after a Start Visit is created. Sample cards below
          are training references only.
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>
            Start a visit
          </button>
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

export default function TodayScreen({ onOpenStartVisit, onOpenFile, onOpenFilesList }) {
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
              />
            </div>
          </section>

          <section style={{ marginTop: 28 }} aria-labelledby="today-samples-heading">
            <div className="hstack">
              <span id="today-samples-heading" className="eyebrow eyebrow-ink">SAMPLE CARDS · TRAINING</span>
              <span className="spacer" />
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                Reference fixtures · not real customers
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 10 }}>
              {SAMPLE_FILES.map((f) => (
                <TodayActionCard
                  key={f.id}
                  stamp={f.stamp}
                  state={f.state}
                  name={f.name}
                  note={f.note}
                  tag={f.tag}
                  source={f.source}
                  sourceLabel={f.sourceLabel}
                  nextAction={f.nextAction}
                  fieldRuleBadges={f.fieldRuleSample ? badgesForFile(f.fieldRuleSample) : []}
                  onOpen={() => onOpenFile && onOpenFile(f.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
      <NextActionBar
        action="Reopen a recent file or start a new visit."
        why="Today is the daily landing page — the work continues from a Customer File."
        dontForget="Customer Files stay on this tablet. Backup from the top bar before closing."
        primary={
          <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>
            Start a new visit
          </button>
        }
        secondary={
          <button type="button" className="btn btn-quiet" onClick={onOpenFilesList}>
            View all Customer Files
          </button>
        }
      />
    </>
  )
}
