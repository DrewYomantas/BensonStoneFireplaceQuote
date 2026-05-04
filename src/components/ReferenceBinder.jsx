import { useMemo, useState } from 'react'
import BinderIndexPanel from './BinderIndexPanel.jsx'
import { updateCustomerFile } from '../lib/customerFile.js'
import {
  buildBrochureGivenItem,
  buildDisplayShownItem,
  buildPinnedReferenceItem,
  buildReferenceLibrary,
  deriveReferenceMatches,
  describeReferenceForDrawer,
  getReferenceAutocompleteOptions,
  searchReferences,
} from '../lib/referenceLibrary.js'
import { deriveBinderPageMatches, pageRecordToReference, searchBinderPages } from '../lib/binderPageIndex.js'

const C = {
  forest: '#1f3527', mid: '#2d4a36', parchment: '#f3ead6', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const mono = { fontFamily: '"Courier New",Courier,monospace' }

const FILTERS = [
  { value: 'detected', label: 'Detected' },
  { value: 'all', label: 'All' },
  { value: 'price-books', label: 'Price Books' },
  { value: 'web', label: 'Current Web' },
  { value: 'pages', label: 'Indexed Pages' },
  { value: 'displays', label: 'Displays' },
  { value: 'guardrails', label: 'Guardrails' },
  { value: 'gas-fireplace', label: 'Gas' },
  { value: 'gas-log', label: 'Logs' },
  { value: 'doors-glass', label: 'Doors' },
  { value: 'stone-mantel', label: 'Stone' },
]

function safetyStyle(tone) {
  if (tone === 'danger') return { bg: 'rgba(138,58,30,0.14)', fg: C.rust, border: 'rgba(138,58,30,0.28)' }
  if (tone === 'warning') return { bg: 'rgba(201,162,76,0.24)', fg: '#6b541c', border: 'rgba(201,162,76,0.35)' }
  if (tone === 'ready') return { bg: 'rgba(45,74,54,0.12)', fg: C.mid, border: 'rgba(45,74,54,0.22)' }
  return { bg: 'rgba(50,38,22,0.06)', fg: C.inkMid, border: C.border }
}

function RefTypeIcon({ type }) {
  const icon = type === 'vendor-price-book' ? '📕' : type === 'web-reference' ? '🌐' : type === 'binder-page' ? '📄' : type === 'showroom-display' ? '🪵' : '⚠️'
  return <span style={{ fontSize: 15 }}>{icon}</span>
}

function SafetyChip({ safety }) {
  const style = safetyStyle(safety?.tone)
  return (
    <span style={{ fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 800, padding: '3px 7px', background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}>
      {safety?.label || 'Reference'}
    </span>
  )
}

function ReferenceCard({ reference, onView, onPin, onMarkShown, onBrochureGiven, pinned, canWrite, compact = false }) {
  const canMarkShown = reference.type === 'showroom-display'
  const canBrochure = reference.type === 'vendor-price-book' || reference.type === 'web-reference' || reference.type === 'binder-page'
  return (
    <article style={{ background: '#fff', border: `1px solid ${C.border}`, borderLeft: `3px solid ${reference.safety?.tone === 'danger' ? C.rust : reference.safety?.tone === 'ready' ? C.mid : C.copper}`, padding: compact ? 9 : 11, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <RefTypeIcon type={reference.type} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: compact ? 11.5 : 12.5, color: C.ink, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reference.title}</div>
          <div style={{ fontSize: 10.5, color: C.inkMid, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reference.subtitle || reference.sourceLabel}</div>
        </div>
        <SafetyChip safety={reference.safety} />
      </div>

      {reference.detectedReason && (
        <div style={{ padding: '6px 8px', background: 'rgba(185,116,58,0.08)', border: `1px solid rgba(185,116,58,0.18)`, color: C.copper, fontSize: 10.5, fontWeight: 700 }}>
          Auto-detected: {reference.detectedReason}
        </div>
      )}

      {!compact && reference.safety?.warning && (
        <div style={{ fontSize: 10.5, color: C.inkMid, lineHeight: 1.45 }}>{reference.safety.warning}</div>
      )}

      {reference.fileName && !compact && (
        <div style={{ ...mono, fontSize: 9.5, color: C.inkLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reference.fileName}</div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="wb-btn wb-btn--primary" onClick={() => onView(reference)} style={{ fontSize: 10 }}>View</button>
        <button type="button" className="wb-btn" onClick={() => onPin(reference)} disabled={pinned || !canWrite} title={!canWrite ? 'Open or create a customer file before pinning.' : ''} style={{ fontSize: 10, opacity: pinned || !canWrite ? 0.45 : 1, cursor: pinned || !canWrite ? 'not-allowed' : 'pointer' }}>{pinned ? 'Pinned' : 'Pin to file'}</button>
        {canMarkShown && <button type="button" className="wb-btn" onClick={() => onMarkShown(reference)} disabled={!canWrite} title={!canWrite ? 'Open or create a customer file before logging displays.' : ''} style={{ fontSize: 10, opacity: canWrite ? 1 : 0.45, cursor: canWrite ? 'pointer' : 'not-allowed' }}>Log shown</button>}
        {canBrochure && <button type="button" className="wb-btn" onClick={() => onBrochureGiven(reference)} disabled={!canWrite} title={!canWrite ? 'Open or create a customer file before logging brochures.' : ''} style={{ fontSize: 10, opacity: canWrite ? 1 : 0.45, cursor: canWrite ? 'pointer' : 'not-allowed' }}>Log brochure/sample</button>}
      </div>
    </article>
  )
}

function SuggestionList({ suggestions, onSelect }) {
  if (!suggestions.length) return null
  return (
    <div role="listbox" id="reference-binder-suggestions" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 8px 24px rgba(50,38,22,0.16)', zIndex: 20, maxHeight: 220, overflowY: 'auto' }}>
      {suggestions.map((suggestion) => (
        <button
          key={`${suggestion.referenceId}-${suggestion.value}`}
          type="button"
          role="option"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion.value)}
          style={{ width: '100%', display: 'block', textAlign: 'left', padding: '8px 10px', border: 0, borderBottom: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <div style={{ fontSize: 11.5, color: C.ink, fontWeight: 700 }}>{suggestion.label}</div>
          <div style={{ fontSize: 10, color: C.inkLight }}>{suggestion.title}</div>
        </button>
      ))}
    </div>
  )
}

function PinnedList({ file }) {
  const pinned = file?.pinnedReferences || []
  if (!pinned.length) return null
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(45,74,54,0.06)', border: `1px solid rgba(45,74,54,0.16)` }}>
      <div style={{ ...eyebrow, color: C.mid, fontSize: 7.5, marginBottom: 5 }}>Pinned to this file</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {pinned.slice(0, 8).map((item) => (
          <span key={item.id} style={{ fontSize: 10, color: C.inkMid, padding: '3px 7px', background: '#fff', border: `1px solid ${C.border}` }}>{item.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function ReferenceBinder({
  file,
  fields = {},
  lineItems = [],
  displayRecords,
  vendors,
  onOpenReference,
  onCustomerFileChange,
  compact = false,
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('detected')
  const [focused, setFocused] = useState(false)
  const [lastAction, setLastAction] = useState('')
  const [pageIndex, setPageIndex] = useState([])

  const library = useMemo(() => buildReferenceLibrary({
    ...(vendors ? { vendors } : {}),
    ...(displayRecords ? { displayRecords } : {}),
  }), [vendors, displayRecords])
  const detected = useMemo(() => deriveReferenceMatches({ library, file: file || {}, fields, lineItems, limit: compact ? 5 : 10 }), [library, file, fields, lineItems, compact])
  const pageMatches = useMemo(() => {
    if (query.trim()) return searchBinderPages(pageIndex, query, { limit: compact ? 4 : 8 }).map(pageRecordToReference)
    if (filter === 'detected') return deriveBinderPageMatches({ pageIndex, file: file || {}, fields, lineItems, limit: compact ? 3 : 6 }).map(pageRecordToReference)
    return []
  }, [pageIndex, query, filter, file, fields, lineItems, compact])

  const searched = useMemo(() => {
    if (filter === 'pages') return pageMatches
    if (filter === 'detected' && !query.trim()) return [...pageMatches, ...detected]
    if (filter === 'detected') return [...pageMatches, ...searchReferences(detected, query, { limit: compact ? 6 : 12 })]
    if (filter === 'all' && query.trim()) return [...pageMatches, ...searchReferences(library, query, { limit: compact ? 6 : 16, category: filter })]
    return searchReferences(library, query, { limit: compact ? 6 : 16, category: filter })
  }, [filter, query, detected, library, compact, pageMatches])
  const suggestions = useMemo(() => getReferenceAutocompleteOptions(library, query, { limit: 7 }), [library, query])
  const pinnedIds = new Set((file?.pinnedReferences || []).map((item) => item.referenceId))
  const canWrite = Boolean(file?.id)
  const visibleResults = compact ? searched.slice(0, query.trim() ? 5 : 3) : searched

  function updateFile(patch, message) {
    if (!file?.id) return
    const updated = updateCustomerFile(file.id, patch)
    setLastAction(message)
    if (onCustomerFileChange) onCustomerFileChange(updated)
  }

  function handleView(reference) {
    if (onOpenReference) onOpenReference(describeReferenceForDrawer(reference))
  }

  function handlePin(reference) {
    if (!file?.id) return
    if (pinnedIds.has(reference.id)) return
    updateFile({ pinnedReferences: [buildPinnedReferenceItem(reference), ...(file.pinnedReferences || [])] }, `Pinned ${reference.title}`)
  }

  function handleMarkShown(reference) {
    if (!file?.id || reference.type !== 'showroom-display') return
    updateFile({ displaysShown: [buildDisplayShownItem(reference), ...(file.displaysShown || [])] }, `Logged display shown: ${reference.title}`)
  }

  function handleBrochureGiven(reference) {
    if (!file?.id || !['vendor-price-book', 'web-reference', 'binder-page'].includes(reference.type)) return
    updateFile({ brochuresGiven: [buildBrochureGivenItem(reference), ...(file.brochuresGiven || [])] }, `Logged brochure/sample: ${reference.title}`)
  }

  return (
    <section style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `4px solid ${detected.length ? C.mid : C.copper}`, padding: compact ? 12 : 15 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Smart Binder</div>
            <span className="wb-pill wb-pill--green">{detected.length} auto match{detected.length === 1 ? '' : 'es'}</span>
            <span className="wb-pill wb-pill--gold">{library.length} searchable refs</span>
          </div>
          <div style={{ ...serif, fontSize: compact ? 16 : 18, fontWeight: 700, color: C.ink, marginTop: 5 }}>
            Smart Binder quick matches
          </div>
          {!compact && (
            <div style={{ fontSize: 11.5, color: C.inkMid, lineHeight: 1.45, marginTop: 5 }}>
              Search by vendor, product family, model/code, path, display location, or customer goal. Results stay internal unless a display/talking point is manually confirmed as customer-safe.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(260px, 1fr) auto', gap: 8, alignItems: 'start', marginTop: 12 }}>
        <div style={{ position: 'relative' }}>
          <label htmlFor="reference-binder-search" style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5, display: 'block', marginBottom: 4 }}>Search / autocomplete</label>
          <input
            id="reference-binder-search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={focused && suggestions.length > 0}
            aria-controls="reference-binder-suggestions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder="Try: Stoll doors, Hargrove logs, 864, prefab model tag…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontFamily: 'inherit', fontSize: 12 }}
          />
          {focused && <SuggestionList suggestions={suggestions} onSelect={(value) => { setQuery(value); setFocused(false) }} />}
        </div>
        {!compact && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignSelf: 'end' }}>
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                style={{ fontSize: 9.5, padding: '5px 8px', border: `1px solid ${filter === item.value ? C.mid : C.border}`, background: filter === item.value ? C.mid : '#fff', color: filter === item.value ? C.parchment : C.inkMid, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )} 
      </div>

      <PinnedList file={file} />

      {!compact && <BinderIndexPanel compact={compact} onIndexChange={setPageIndex} />}
      {compact && (
        <div style={{ marginTop: 8, padding: '7px 9px', background: 'rgba(45,74,54,0.08)', border: `1px solid rgba(45,74,54,0.16)`, fontSize: 10.5, color: C.inkMid, lineHeight: 1.35 }}>
          Use the Smart Binder tab for full search, PDF import, and page indexing.
        </div>
      )}

      {lastAction && (
        <div style={{ marginTop: 9, padding: '7px 9px', background: 'rgba(45,74,54,0.08)', border: `1px solid rgba(45,74,54,0.18)`, color: C.mid, fontSize: 11, fontWeight: 700 }}>
          Saved: {lastAction}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 9 }}>
        {visibleResults.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 16, background: '#fff', border: `1px dashed ${C.border}`, color: C.inkMid, fontSize: 12 }}>
            No references matched. Try a vendor name, product family, model/code, or broader path like “gas logs,” “doors,” “electric,” or “model tag.”
          </div>
        ) : visibleResults.map((reference) => (
          <ReferenceCard
            key={reference.id}
            reference={reference}
            onView={handleView}
            onPin={handlePin}
            onMarkShown={handleMarkShown}
            onBrochureGiven={handleBrochureGiven}
            pinned={pinnedIds.has(reference.id)}
            canWrite={canWrite}
            compact={compact}
          />
        ))}
      </div>
      {compact && searched.length > visibleResults.length && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: C.inkLight }}>
          Showing {visibleResults.length} of {searched.length}. Open the Smart Binder tab for the full list.
        </div>
      )}
    </section>
  )
}
