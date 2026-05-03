import { useState } from 'react'
import {
  appendCustomerFileItem,
  updateCustomerFile,
} from '../lib/customerFile.js'

const C = {
  mid: '#2d4a36',
  parchment: '#f3ead6',
  paper: '#faf6ec',
  copper: '#b9743a',
  gold: '#c9a24c',
  rust: '#8a3a1e',
  ink: '#2a221a',
  inkMid: '#5a4f3f',
  inkLight: '#8a7c64',
  border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Section({ label, items, emptyHint, addPlaceholder, onAdd, onRemove }) {
  const [draft, setDraft] = useState('')
  function commit() {
    const v = draft.trim()
    if (!v) return
    onAdd(v)
    setDraft('')
  }
  return (
    <div>
      <div style={{ ...eyebrow, color: C.copper, fontSize: 8, marginBottom: 6 }}>{label}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 6, fontStyle: 'italic' }}>{emptyHint}</div>
      ) : (
        <ul style={{ margin: '0 0 6px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it) => (
            <li key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11.5, color: C.ink, padding: '4px 6px', background: '#fff', border: `1px solid ${C.border}` }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: C.mid, color: C.parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>✓</div>
              <span style={{ flex: 1 }}>{it.label || it.value || '(unnamed)'}</span>
              {(it.givenAt || it.shownAt || it.capturedAt) && (
                <span style={{ fontSize: 9.5, color: C.inkLight, fontFamily: '"Courier New",monospace' }}>
                  {formatDate(it.givenAt || it.shownAt || it.capturedAt)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                style={{ background: 'none', border: 'none', color: C.inkLight, cursor: 'pointer', fontSize: 12, padding: 0 }}
                aria-label={`Remove ${it.label}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={addPlaceholder}
          style={{ flex: 1, padding: '5px 8px', border: `1px solid ${C.border}`, background: '#fff', fontSize: 11.5, fontFamily: 'inherit', color: C.ink }}
        />
        <button type="button" className="wb-btn" style={{ fontSize: 10, padding: '3px 9px' }} onClick={commit}>
          + Add
        </button>
      </div>
    </div>
  )
}

export default function TakeHomeChecklist({ file, onChange }) {
  if (!file) return null

  function appendItem(key, label) {
    const stamp = key === 'displaysShown' ? { shownAt: new Date().toISOString() } : { givenAt: new Date().toISOString() }
    const updated = appendCustomerFileItem(file.id, key, { label, ...stamp })
    if (onChange) onChange(updated)
  }

  function removeItem(key, id) {
    const updated = updateCustomerFile(file.id, { [key]: file[key].filter((i) => i.id !== id) })
    if (onChange) onChange(updated)
  }

  const totalItems =
    file.displaysShown.length + file.brochuresGiven.length + file.samplesGiven.length

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Take-Home Checklist</div>
        <div style={{ fontSize: 11, color: C.inkLight }}>What the customer is leaving with — drives follow-up framing.</div>
      </div>
      <div style={{ fontSize: 11, color: C.inkMid, marginBottom: 12 }}>
        {totalItems === 0
          ? 'Nothing logged yet. Tag at least one display or brochure before they leave.'
          : `${totalItems} item${totalItems === 1 ? '' : 's'} on the take-home file.`}
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        <Section
          label="Displays Shown"
          items={file.displaysShown}
          emptyHint="No displays tagged yet."
          addPlaceholder='e.g. "Mendota DXV-35"'
          onAdd={(label) => appendItem('displaysShown', label)}
          onRemove={(id) => removeItem('displaysShown', id)}
        />
        <Section
          label="Brochures Given"
          items={file.brochuresGiven}
          emptyHint="No brochures handed out yet."
          addPlaceholder='e.g. "Hearthstone 2025 Catalog"'
          onAdd={(label) => appendItem('brochuresGiven', label)}
          onRemove={(id) => removeItem('brochuresGiven', id)}
        />
        <Section
          label="Samples Given"
          items={file.samplesGiven}
          emptyHint="No samples handed out yet."
          addPlaceholder='e.g. "Stone veneer chip set"'
          onAdd={(label) => appendItem('samplesGiven', label)}
          onRemove={(id) => removeItem('samplesGiven', id)}
        />
      </div>
    </div>
  )
}
