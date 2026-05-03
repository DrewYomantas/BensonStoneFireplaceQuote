import { useState } from 'react'
import {
  createEmptyCustomerFile,
  saveCustomerFile,
} from '../lib/customerFile.js'

const C = {
  forest: '#1f3527',
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
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }

const goalSuggestions = [
  'New gas fireplace',
  'Convert wood to gas',
  'Replace existing insert',
  'Add an outdoor fire feature',
  'Pellet stove for whole-home heat',
  'Just browsing — early research',
]

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

const inputStyle = {
  padding: '8px 11px',
  border: `1px solid ${C.border}`,
  background: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  color: C.ink,
}

export default function ShowroomVisitStart({ onCreated, onCancel }) {
  const [draft, setDraft] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerGoal: '',
    existingApplianceType: 'unknown',
    existingFuelType: 'unknown',
  })
  const [error, setError] = useState('')

  const set = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setError('')
  }

  function handleStart() {
    if (!draft.customerName.trim()) {
      setError('Customer name is required to start a visit.')
      return
    }
    const file = createEmptyCustomerFile({
      ...draft,
      visitedAt: new Date().toISOString(),
    })
    const saved = saveCustomerFile(file)
    if (onCreated) onCreated(saved)
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: C.parchment, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 620, background: C.paper, border: `1px solid ${C.border}`, padding: '28px 30px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -10, left: 26, padding: '3px 12px', background: C.copper, color: '#fff', ...eyebrow, fontSize: 9 }}>
          Walk-In Visit
        </div>

        <div style={{ ...eyebrow, color: C.copper, fontSize: 9, marginTop: 4 }}>Start a visit</div>
        <div style={{ ...serif, fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 4, lineHeight: 1.15 }}>
          Who walked in, and what did they say?
        </div>
        <div style={{ fontSize: 12.5, color: C.inkMid, marginTop: 6, lineHeight: 1.5 }}>
          Captures the customer file before any quote exists. Everything tagged on the showroom floor — displays shown, brochures given, photos collected — links back to this file.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
          <Field label="Customer name" required>
            <input
              autoFocus
              value={draft.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              placeholder="First Last"
              style={inputStyle}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={draft.customerPhone}
              onChange={(e) => set('customerPhone', e.target.value)}
              placeholder="(207) 555-0100"
              style={inputStyle}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={draft.customerEmail}
              onChange={(e) => set('customerEmail', e.target.value)}
              placeholder="optional"
              style={inputStyle}
            />
          </Field>
          <Field label="Existing appliance">
            <select
              value={draft.existingApplianceType}
              onChange={(e) => set('existingApplianceType', e.target.value)}
              style={inputStyle}
            >
              {['unknown', 'fireplace', 'insert', 'stove', 'log-set', 'outdoor', 'none'].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </Field>
          <Field label="Existing fuel">
            <select
              value={draft.existingFuelType}
              onChange={(e) => set('existingFuelType', e.target.value)}
              style={inputStyle}
            >
              {['unknown', 'gas', 'wood', 'pellet', 'electric', 'none'].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </Field>
          <Field label="Customer goal (their words)">
            <textarea
              rows={2}
              value={draft.customerGoal}
              onChange={(e) => set('customerGoal', e.target.value)}
              placeholder='e.g. "Wants real flame for the family room, hates the old wood mess."'
              style={{ ...inputStyle, resize: 'vertical', gridColumn: '1 / -1' }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {goalSuggestions.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => set('customerGoal', g)}
              style={{
                fontSize: 10.5,
                padding: '4px 9px',
                background: '#fff',
                border: `1px solid ${C.border}`,
                color: C.inkMid,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + {g}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '8px 11px', background: 'rgba(138,58,30,0.12)', border: `1px solid rgba(138,58,30,0.3)`, color: C.rust, fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {onCancel && (
            <button type="button" className="wb-btn" onClick={onCancel} style={{ fontSize: 12 }}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="wb-btn wb-btn--copper"
            onClick={handleStart}
            style={{ fontSize: 13, padding: '9px 18px' }}
          >
            Start visit →
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 10.5, color: C.inkLight, lineHeight: 1.5 }}>
          Customer file is local to this device. BizTrack remains the source of truth — quote and pricing fields link in once the BizTrack PDF is imported.
        </div>
      </div>
    </div>
  )
}
