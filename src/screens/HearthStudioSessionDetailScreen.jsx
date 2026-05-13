import { useEffect, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import {
  SESSION_STATUS,
  CHAPTER_LABELS,
  sessionTopLineSummary,
  getSession,
  pauseSession,
  resumeSession,
  completeSession,
  softDeleteSession,
  restoreSession,
} from '../lib/hearthStudioSessionStorage.js'
import { buildHearthSessionBackstageSummary } from '../lib/todayHearthSessions.js'

function BackstageSummaryCard({ session }) {
  const summary = buildHearthSessionBackstageSummary(session)
  if (!summary) return null
  return (
    <section className="card-flat" style={{ padding: 18, marginTop: 16, borderLeft: '3px solid var(--brass)' }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">BACKSTAGE HANDOFF SUMMARY</span>
        <span className="spacer" />
        <span className="body-sm" style={{ color: 'var(--slate)' }}>Internal sales context</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>GUEST DESIGN DIRECTION</span>
        <p className="body-sm" style={{ marginTop: 4 }}>{summary.guestDirection}</p>
      </div>

      {summary.exploredSelections.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>EXPLORED SELECTIONS</span>
          <ul className="body-sm" style={{ marginTop: 4, paddingLeft: 18 }}>
            {summary.exploredSelections.map(({ label, value }) => (
              <li key={label}><strong>{label}:</strong> {value}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>NEEDS VERIFICATION</span>
        <ul className="body-sm" style={{ marginTop: 4, paddingLeft: 18 }}>
          {summary.verificationChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className="body-sm" style={{ marginTop: 12, color: 'var(--slate)', fontStyle: 'italic' }}>
        Sales note: {summary.salesNote}
      </p>
    </section>
  )
}

function ChapterList({ session }) {
  const total = Object.keys(CHAPTER_LABELS).length
  const done = new Set(Array.isArray(session.chaptersCompleted) ? session.chaptersCompleted : [])
  return (
    <div style={{ marginTop: 12 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 0',
            borderBottom: i < total - 1 ? '1px solid var(--stone-100)' : 'none',
          }}
        >
          <span style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: done.has(i) ? 'var(--ember)' : (i === session.currentChapter ? 'var(--brass)' : 'var(--stone-100)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: done.has(i) || i === session.currentChapter ? '#fff' : 'var(--slate)',
            flexShrink: 0,
          }}>
            {done.has(i) ? '✓' : i + 1}
          </span>
          <span
            className="body-sm"
            style={{ fontWeight: i === session.currentChapter ? 600 : 400 }}
          >
            {CHAPTER_LABELS[i]}
          </span>
          {i === session.currentChapter && (
            <span className="body-sm" style={{ color: 'var(--slate)', marginLeft: 'auto' }}>
              ← current
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function HearthStudioSessionDetailScreen({ sessionId, onBack, rep }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [opError, setOpError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      if (!sessionId) {
        if (!cancelled) { setError('No session ID provided.'); setLoading(false) }
        return
      }
      try {
        await ensureSalesOsBoot()
        const storage = getSalesOsStorage()
        const s = await getSession(storage, sessionId)
        if (!cancelled) {
          if (!s) setError('Session not found.')
          else setSession(s)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionId])

  async function runOp(fn) {
    if (busy || !session) return
    setBusy(true); setOpError('')
    try {
      const storage = getSalesOsStorage()
      const repId = rep ? rep.id : null
      const updated = await fn(storage, session.id, repId)
      setSession(updated)
    } catch (err) {
      setOpError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const isActive = session && session.status === SESSION_STATUS.active
  const isPaused = session && session.status === SESSION_STATUS.paused
  const isCompleted = session && session.status === SESSION_STATUS.completed
  const isSoftDeleted = session && session.status === SESSION_STATUS.soft_deleted

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px', maxWidth: 760, margin: '0 auto' }}>
          <div className="hstack" style={{ marginBottom: 4 }}>
            <button type="button" className="btn btn-quiet" onClick={onBack} style={{ fontSize: 13 }}>
              ← Customer File
            </button>
          </div>
          <h2 className="serif-h h2" style={{ marginTop: 8 }}>Hearth Studio.</h2>

          {loading && (
            <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 12 }}>Loading session…</p>
          )}
          {error && (
            <p className="body-sm" style={{ color: 'var(--ember)', marginTop: 12 }}>{error}</p>
          )}

          {session && (
            <>
              <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
                {sessionTopLineSummary(session)}
              </p>
              <hr className="rule-brass" style={{ margin: '16px 0' }} />

              <section className="card-flat" style={{ padding: 18 }}>
                <span className="eyebrow eyebrow-ember">SESSION ACTIONS</span>
                {opError && (
                  <p className="body-sm" style={{ color: 'var(--ember)', marginTop: 8 }}>{opError}</p>
                )}
                <div className="hstack" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
                  {isActive && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      onClick={() => runOp(pauseSession)}
                    >
                      Pause session
                    </button>
                  )}
                  {isPaused && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      onClick={() => runOp(resumeSession)}
                    >
                      Resume session
                    </button>
                  )}
                  {(isActive || isPaused) && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => runOp(completeSession)}
                    >
                      Complete session
                    </button>
                  )}
                  {isSoftDeleted && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      onClick={() => runOp(restoreSession)}
                    >
                      Restore session
                    </button>
                  )}
                  {!isSoftDeleted && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      style={{ color: 'var(--slate)' }}
                      onClick={() => runOp(softDeleteSession)}
                    >
                      Remove session
                    </button>
                  )}
                  {isCompleted && (
                    <span className="body-sm" style={{ color: 'var(--slate)', alignSelf: 'center' }}>
                      Session is complete.
                    </span>
                  )}
                </div>
              </section>

              <BackstageSummaryCard session={session} />

              <section className="card-flat" style={{ padding: 18, marginTop: 16 }}>
                <span className="eyebrow eyebrow-ink">CHAPTER PROGRESS</span>
                <ChapterList session={session} />
              </section>
            </>
          )}
        </div>
      </div>
      <NextActionBar
        action="Return to the Customer File when done."
        primary={
          <button type="button" className="btn btn-primary" onClick={onBack}>
            Back to Customer File
          </button>
        }
      />
    </>
  )
}
