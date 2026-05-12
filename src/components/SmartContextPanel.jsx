import { useEffect, useMemo, useState } from 'react'
import {
  buildReferenceLibrary,
  buildHearthSessionReferences,
  deriveReferenceMatches,
  hasCriticalSmartContextReferences,
  searchReferences,
  describeReferenceForDrawer,
} from '../lib/referenceLibrary.js'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listSessions } from '../lib/hearthStudioSessionStorage.js'

const TONE_COLOR = {
  danger: 'var(--ember)',
  warning: 'var(--brass)',
  ready: 'var(--stone)',
  internal: 'var(--slate)',
  guardrail: 'var(--slate)',
}

function ReferenceCard({ reference, onOpenHearthSession }) {
  const desc = describeReferenceForDrawer(reference)
  const toneColor = TONE_COLOR[reference.safety?.tone] || 'var(--slate)'
  return (
    <div className="card-flat" style={{ padding: '10px 14px', marginTop: 8 }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>{desc.title}</span>
        <span className="spacer" />
        {desc.badge && (
          <span className="body-sm" style={{ color: toneColor }}>{desc.badge}</span>
        )}
      </div>
      {desc.sub && (
        <p className="body-sm" style={{ marginTop: 2, color: 'var(--slate)' }}>{desc.sub}</p>
      )}
      {reference.detectedReason && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--brass)' }}>{reference.detectedReason}</p>
      )}
      {Array.isArray(reference.details) && reference.details.slice(0, 3).map((line, i) => (
        <p key={i} className="body-sm" style={{ marginTop: 2, color: 'var(--ink)' }}>{line}</p>
      ))}
      {reference.type === 'hearthSession' && onOpenHearthSession && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onOpenHearthSession(reference.sessionId)}
          >
            Open session
          </button>
        </div>
      )}
    </div>
  )
}

export default function SmartContextPanel({
  file = {},
  quotePrepLines = [],
  onOpenHearthSession,
  compact = false,
  collapsible = false,
  defaultCollapsed = false,
}) {
  const [library] = useState(() => buildReferenceLibrary())
  const [query, setQuery] = useState('')
  const [hearthSessions, setHearthSessions] = useState([])
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [showAllSessions, setShowAllSessions] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setHearthSessions([])
      setShowAllSessions(false)
      if (!file?.id || String(file.id).startsWith('sample-')) return
      const ready = await ensureSalesOsBoot()
      if (cancelled || !ready.ok) return
      try {
        const storage = getSalesOsStorage()
        const sessions = await listSessions(storage, { customerFileId: file.id, includeSoftDeleted: false })
        if (!cancelled) setHearthSessions(sessions)
      } catch {
        if (!cancelled) setHearthSessions([])
      }
    })()
    return () => { cancelled = true }
  }, [file?.id])

  const detected = useMemo(
    () => deriveReferenceMatches({
      library,
      file,
      lineItems: quotePrepLines,
      hearthSessions,
      hearthSessionLimit: showAllSessions ? Number.MAX_SAFE_INTEGER : 3,
    }),
    [library, file, quotePrepLines, hearthSessions, showAllSessions]
  )

  const hasCritical = useMemo(
    () => hasCriticalSmartContextReferences(detected),
    [detected]
  )

  const searchableSessionRefs = useMemo(
    () => buildHearthSessionReferences(hearthSessions, { limit: Number.MAX_SAFE_INTEGER }),
    [hearthSessions]
  )

  const searchResults = useMemo(
    () => (query ? searchReferences([...library, ...searchableSessionRefs], query) : []),
    [library, searchableSessionRefs, query]
  )

  const effectiveCollapsed = collapsible && !hasCritical && collapsed

  return (
    <section className="card-flat" style={{ padding: compact ? 14 : 18 }}>
      <div className="hstack" style={{ marginBottom: 8 }}>
        <span className="eyebrow eyebrow-ink" style={{ fontSize: compact ? 10 : undefined }}>SMART CONTEXT</span>
        <span className="spacer" />
        {collapsible && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!effectiveCollapsed}
          >
            {effectiveCollapsed ? 'Open' : 'Collapse'}
          </button>
        )}
        <input
          type="search"
          className="field"
          placeholder="Search vendors, guardrails, displays..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: compact ? 180 : 220 }}
        />
      </div>
      {effectiveCollapsed ? (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
          {hasCritical ? 'Important context is available.' : 'Collapsed for Quote / Prep.'}
        </p>
      ) : query ? (
        searchResults.length === 0 ? (
          <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>No references matched.</p>
        ) : (
          searchResults.map((r) => <ReferenceCard key={r.id} reference={r} onOpenHearthSession={onOpenHearthSession} />)
        )
      ) : (
        detected.length === 0 ? (
          <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
            No references detected for this file. Search above to look up vendors, guardrails, or showroom displays.
          </p>
        ) : (
          <>
            {detected.map((r) => <ReferenceCard key={r.id} reference={r} onOpenHearthSession={onOpenHearthSession} />)}
            {detected.hiddenCount > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setShowAllSessions(true)}
                >
                  Show all sessions
                </button>
                <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
                  {detected.hiddenCount} older Hearth Studio session{detected.hiddenCount === 1 ? '' : 's'} hidden.
                </p>
              </div>
            )}
          </>
        )
      )}
    </section>
  )
}
