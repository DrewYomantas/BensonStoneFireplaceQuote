import { useEffect, useState } from 'react'
import { ensureSalesOsBoot, getSalesOsStorage } from '../../lib/salesOsStorageBoot.js'
import {
  SESSION_STATUS,
  CHAPTER_LABELS,
  sessionTopLineSummary,
  listSessions,
} from '../../lib/hearthStudioSessionStorage.js'

const STATUS_LABEL = {
  [SESSION_STATUS.active]: 'Active',
  [SESSION_STATUS.paused]: 'Paused',
  [SESSION_STATUS.completed]: 'Completed',
  [SESSION_STATUS.soft_deleted]: 'Removed',
}

function formatStamp(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function HearthStudioSessionsAdmin() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await ensureSalesOsBoot()
        const storage = getSalesOsStorage()
        const all = await listSessions(storage)
        if (!cancelled) setSessions(all)
      } catch (err) {
        if (!cancelled) setError(err.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const counts = {
    active: sessions.filter((s) => s.status === SESSION_STATUS.active).length,
    paused: sessions.filter((s) => s.status === SESSION_STATUS.paused).length,
    completed: sessions.filter((s) => s.status === SESSION_STATUS.completed).length,
    removed: sessions.filter((s) => s.status === SESSION_STATUS.soft_deleted).length,
  }
  const chapterCount = Object.keys(CHAPTER_LABELS).length

  return (
    <section className="card" style={{ padding: 18, borderLeft: '3px solid var(--ember)' }}>
      <span className="eyebrow eyebrow-ember">HEARTH STUDIO — BACKSTAGE</span>
      <h3 className="serif-h h4" style={{ marginTop: 6 }}>Hearth Studio Sessions</h3>
      <p className="body-sm" style={{ marginTop: 6 }}>
        Discovery journey sessions tied to Customer Files. {chapterCount} chapters per session.
        Sessions are internal-only — investment and room context are stripped from backups.
      </p>

      {loading && (
        <p className="body-sm" style={{ marginTop: 10, color: 'var(--slate)' }}>Loading…</p>
      )}
      {error && (
        <p className="body-sm" style={{ marginTop: 10, color: 'var(--ember)' }}>{error}</p>
      )}

      {!loading && !error && (
        <>
          <div className="hstack" style={{ marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Active', value: counts.active },
              { label: 'Paused', value: counts.paused },
              { label: 'Completed', value: counts.completed },
              { label: 'Removed', value: counts.removed },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
                <div className="body-sm" style={{ color: 'var(--slate)' }}>{label}</div>
              </div>
            ))}
          </div>

          {sessions.length === 0 ? (
            <p className="body-sm" style={{ marginTop: 16, color: 'var(--slate)' }}>
              No sessions yet. Start one from a Customer File.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
              {sessions.map((s) => (
                <li key={s.id} style={{ padding: '10px 0', borderTop: '1px solid var(--rule)' }}>
                  <div className="hstack">
                    <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                    <span className="spacer" />
                    <span className="body-sm" style={{ color: 'var(--slate)' }}>
                      {formatStamp(s.lastTouchedAt)}
                    </span>
                  </div>
                  <p className="body-sm" style={{ marginTop: 2 }}>
                    {sessionTopLineSummary(s)}
                  </p>
                  <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
                    File: {s.customerFileId}
                    {s.startedByRepId && ` · Rep: ${s.startedByRepId}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
