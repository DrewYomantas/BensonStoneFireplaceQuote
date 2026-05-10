import { useState, useMemo } from 'react'
import {
  buildReferenceLibrary,
  deriveReferenceMatches,
  searchReferences,
  describeReferenceForDrawer,
} from '../lib/referenceLibrary.js'

const TONE_COLOR = {
  danger: 'var(--ember)',
  warning: 'var(--brass)',
  ready: 'var(--stone)',
  internal: 'var(--slate)',
  guardrail: 'var(--slate)',
}

function ReferenceCard({ reference }) {
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
    </div>
  )
}

export default function SmartContextPanel({ file = {}, quotePrepLines = [] }) {
  const [library] = useState(() => buildReferenceLibrary())
  const [query, setQuery] = useState('')

  const detected = useMemo(
    () => deriveReferenceMatches({ library, file, lineItems: quotePrepLines }),
    [library, file, quotePrepLines]
  )

  const searchResults = useMemo(
    () => (query ? searchReferences(library, query) : []),
    [library, query]
  )

  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <div className="hstack" style={{ marginBottom: 8 }}>
        <span className="eyebrow eyebrow-ink">SMART CONTEXT</span>
        <span className="spacer" />
        <input
          type="search"
          className="field"
          placeholder="Search vendors, guardrails, displays…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
        />
      </div>
      {query ? (
        searchResults.length === 0 ? (
          <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>No references matched.</p>
        ) : (
          searchResults.map((r) => <ReferenceCard key={r.id} reference={r} />)
        )
      ) : (
        detected.length === 0 ? (
          <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
            No references detected for this file. Search above to look up vendors, guardrails, or showroom displays.
          </p>
        ) : (
          detected.map((r) => <ReferenceCard key={r.id} reference={r} />)
        )
      )}
    </section>
  )
}
