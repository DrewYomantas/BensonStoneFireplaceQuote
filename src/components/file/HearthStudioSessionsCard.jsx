import { SESSION_STATUS, CHAPTER_LABELS, sessionTopLineSummary } from '../../lib/hearthStudioSessionStorage.js'

function StatusPill({ status }) {
  const map = {
    [SESSION_STATUS.active]: { label: 'Active', color: 'var(--ember)' },
    [SESSION_STATUS.paused]: { label: 'Paused', color: 'var(--brass)' },
    [SESSION_STATUS.completed]: { label: 'Completed', color: 'var(--slate)' },
    [SESSION_STATUS.soft_deleted]: { label: 'Removed', color: 'var(--slate)' },
  }
  const { label, color } = map[status] || { label: status, color: 'var(--slate)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: color,
      color: '#fff',
    }}>
      {label}
    </span>
  )
}

function ChapterProgress({ currentChapter, chaptersCompleted }) {
  const total = Object.keys(CHAPTER_LABELS).length
  const done = Array.isArray(chaptersCompleted) ? chaptersCompleted.length : 0
  return (
    <span className="body-sm" style={{ color: 'var(--slate)' }}>
      {done}/{total} chapters · {CHAPTER_LABELS[currentChapter] || `Ch ${currentChapter}`}
    </span>
  )
}

export default function HearthStudioSessionsCard({ sessions = [], onOpenHearthSession, disabled = false }) {
  const visible = sessions.filter((s) => s && s.status !== SESSION_STATUS.soft_deleted)

  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <div className="hstack" style={{ marginBottom: 12 }}>
        <span className="eyebrow eyebrow-ember">HEARTH STUDIO</span>
        <span className="spacer" />
        <button
          className="btn btn-quiet"
          onClick={() => onOpenHearthSession && onOpenHearthSession(null)}
          disabled={disabled}
          style={{ fontSize: 13 }}
        >
          + New session
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="body-sm" style={{ color: 'var(--slate)' }}>
          No Hearth Studio sessions yet. Start one to guide this customer through the discovery journey.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((s) => (
            <li
              key={s.id}
              style={{
                borderTop: '1px solid var(--stone-100)',
                paddingTop: 10,
                paddingBottom: 10,
              }}
            >
              <div className="hstack" style={{ gap: 8 }}>
                <StatusPill status={s.status} />
                <span className="spacer" />
                <button
                  className="btn btn-quiet"
                  style={{ fontSize: 12 }}
                  onClick={() => onOpenHearthSession && onOpenHearthSession(s.id)}
                  disabled={disabled}
                >
                  Open
                </button>
              </div>
              <p className="body-sm" style={{ margin: '4px 0 2px' }}>
                {sessionTopLineSummary(s)}
              </p>
              <ChapterProgress
                currentChapter={s.currentChapter}
                chaptersCompleted={s.chaptersCompleted}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
