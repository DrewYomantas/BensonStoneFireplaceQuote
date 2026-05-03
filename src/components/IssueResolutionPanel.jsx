import { useMemo, useState } from 'react'
import {
  appendCustomerFileItem,
  updateCustomerFile,
} from '../lib/customerFile.js'
import {
  buildResolutionPatch,
  evaluateIssues,
} from '../lib/issueDefinitions.js'

// Tokens kept in-step with the WorkbenchShell aesthetic.
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

const SEVERITY_STYLE = {
  block: { tag: 'Blocker', bg: 'rgba(138,58,30,0.12)', edge: '#8a3a1e', tagBg: '#8a3a1e', tagFg: '#fff' },
  warn:  { tag: 'Resolve', bg: 'rgba(201,162,76,0.16)', edge: '#c9a24c', tagBg: '#c9a24c', tagFg: '#3a2a08' },
  info:  { tag: 'Suggested', bg: 'rgba(45,74,54,0.08)', edge: '#2d4a36', tagBg: '#2d4a36', tagFg: '#f3ead6' },
}

function fieldInput(field, value, onChange) {
  const baseStyle = {
    padding: '6px 9px', border: `1px solid ${C.border}`, background: '#fff',
    fontSize: 12, fontFamily: 'inherit', color: C.ink, width: '100%',
  }
  if (field.kind === 'longtext') {
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder || ''}
        style={{ ...baseStyle, resize: 'vertical' }}
      />
    )
  }
  if (field.kind === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(field.key, e.target.value)} style={baseStyle}>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt || '—'}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      type={field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : 'text'}
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      placeholder={field.placeholder || ''}
      style={baseStyle}
    />
  )
}

function FieldsResolution({ issue, file, onSubmit }) {
  const r = issue.resolution
  const [draft, setDraft] = useState(() => {
    const seed = {}
    for (const f of r.fields) seed[f.key] = String(file[f.key] ?? '')
    return seed
  })
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  function handleSubmit() {
    const patch = buildResolutionPatch(issue, draft)
    if (Object.keys(patch).length === 0) return
    onSubmit(patch)
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {r.helper && <div style={{ fontSize: 11, color: C.inkMid }}>{r.helper}</div>}
      {r.fields.map((f) => (
        <label key={f.key} style={{ display: 'grid', gap: 3 }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>
            {f.label}{f.required ? ' *' : ''}
          </span>
          {fieldInput(f, draft[f.key] ?? '', change)}
        </label>
      ))}
      <button
        type="button"
        className="wb-btn wb-btn--primary"
        style={{ justifySelf: 'start', fontSize: 11 }}
        onClick={handleSubmit}
      >
        {r.cta || 'Save'}
      </button>
    </div>
  )
}

function ToggleResolution({ issue, file, onSubmit }) {
  const r = issue.resolution
  const isOn = String(file[r.key] ?? '') === r.truthyValue
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.ink }}>
        <input
          type="checkbox"
          checked={isOn}
          onChange={(e) => onSubmit(buildResolutionPatch(issue, { value: e.target.checked }))}
          style={{ width: 16, height: 16 }}
        />
        {isOn ? r.onLabel : r.offLabel || r.onLabel}
      </label>
    </div>
  )
}

function DatetimeResolution({ issue, onSubmit }) {
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="wb-btn wb-btn--primary"
        style={{ fontSize: 11 }}
        onClick={() => onSubmit(buildResolutionPatch(issue, {}))}
      >
        {issue.resolution.cta || 'Confirm now'}
      </button>
    </div>
  )
}

function AppendResolution({ issue, onAppend }) {
  const r = issue.resolution
  const [draft, setDraft] = useState(() => {
    const seed = {}
    for (const f of r.fields) seed[f.key] = ''
    return seed
  })
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  function handleSubmit() {
    const required = r.fields.filter((f) => f.required)
    for (const f of required) if (!String(draft[f.key] || '').trim()) return
    onAppend(r.target, { ...draft, capturedAt: new Date().toISOString() })
    const reset = {}
    for (const f of r.fields) reset[f.key] = ''
    setDraft(reset)
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {r.fields.map((f) => (
        <label key={f.key} style={{ display: 'grid', gap: 3 }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>
            {f.label}{f.required ? ' *' : ''}
          </span>
          {fieldInput(f, draft[f.key] ?? '', change)}
        </label>
      ))}
      <button
        type="button"
        className="wb-btn wb-btn--primary"
        style={{ justifySelf: 'start', fontSize: 11 }}
        onClick={handleSubmit}
      >
        {r.cta || 'Add'}
      </button>
    </div>
  )
}

function InstructionResolution({ issue }) {
  return (
    <div style={{ marginTop: 8, padding: '8px 11px', background: C.paper, border: `1px dashed ${C.border}`, fontSize: 11.5, color: C.inkMid, lineHeight: 1.5 }}>
      {issue.resolution.body}
    </div>
  )
}

function IssueCard({ issue, file, expanded, onToggle, onPatch, onAppend }) {
  const sev = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.warn
  if (issue.resolved) {
    return (
      <div style={{ background: 'rgba(45,74,54,0.06)', border: `1px solid rgba(45,74,54,0.18)`, borderLeft: `3px solid ${C.mid}`, padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: C.mid, color: C.parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>✓</div>
        <div style={{ fontSize: 11.5, color: C.inkMid, flex: 1 }}>{issue.label}</div>
        <span style={{ fontSize: 9, color: C.mid, fontFamily: '"Courier New",monospace' }}>resolved</span>
      </div>
    )
  }
  const r = issue.resolution
  return (
    <div style={{ background: sev.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${sev.edge}`, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', background: sev.tagBg, color: sev.tagFg, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
          {sev.tag}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{issue.label}</div>
          {issue.detail && (
            <div style={{ fontSize: 11, color: C.inkMid, marginTop: 2, lineHeight: 1.45 }}>{issue.detail}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="wb-btn"
          style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }}
        >
          {expanded ? 'Hide' : r?.kind === 'instruction' ? 'How to fix' : 'Resolve'}
        </button>
      </div>
      {expanded && r && (
        <>
          {r.kind === 'fields' && <FieldsResolution issue={issue} file={file} onSubmit={onPatch} />}
          {r.kind === 'toggle' && <ToggleResolution issue={issue} file={file} onSubmit={onPatch} />}
          {r.kind === 'datetime' && <DatetimeResolution issue={issue} onSubmit={onPatch} />}
          {r.kind === 'append' && <AppendResolution issue={issue} onAppend={onAppend} />}
          {r.kind === 'instruction' && <InstructionResolution issue={issue} />}
        </>
      )}
    </div>
  )
}

export default function IssueResolutionPanel({ file, onChange, sectionFilter, title = 'Resolve Before Send' }) {
  const [expanded, setExpanded] = useState(() => new Set())

  const allIssues = useMemo(() => evaluateIssues(file || {}), [file])
  const issues = useMemo(
    () => sectionFilter ? allIssues.filter((i) => sectionFilter.includes(i.section)) : allIssues,
    [allIssues, sectionFilter],
  )
  const unresolved = issues.filter((i) => !i.resolved)
  const resolved = issues.filter((i) => i.resolved)

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handlePatch(issue, patch) {
    const updated = updateCustomerFile(file.id, patch)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(issue.id)
      return next
    })
    if (onChange) onChange(updated)
  }

  function handleAppend(issue, target, item) {
    const updated = appendCustomerFileItem(file.id, target, item)
    if (onChange) onChange(updated)
  }

  if (!file) {
    return (
      <div style={{ padding: '12px 14px', background: C.paper, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.inkMid, lineHeight: 1.5 }}>
        No customer file open. Start a visit or open a saved ticket to surface resolvable issues.
      </div>
    )
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>{title}</div>
        <div style={{ ...serif, fontSize: 13, fontWeight: 700, color: C.ink }}>
          {unresolved.length} to resolve
        </div>
        {resolved.length > 0 && (
          <div style={{ fontSize: 10.5, color: C.inkLight }}>
            {resolved.length} resolved
          </div>
        )}
      </div>

      {unresolved.length === 0 ? (
        <div style={{ padding: '10px 12px', background: 'rgba(45,74,54,0.08)', border: `1px solid rgba(45,74,54,0.2)`, color: C.mid, fontSize: 12, fontWeight: 600 }}>
          All issues in this section are resolved.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unresolved.map((i) => (
            <IssueCard
              key={i.id}
              issue={i}
              file={file}
              expanded={expanded.has(i.id)}
              onToggle={() => toggle(i.id)}
              onPatch={(patch) => handlePatch(i, patch)}
              onAppend={(target, item) => handleAppend(i, target, item)}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ ...eyebrow, fontSize: 8, color: C.inkLight, cursor: 'pointer' }}>
            Resolved ({resolved.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
            {resolved.map((i) => (
              <IssueCard key={i.id} issue={i} file={file} expanded={false} onToggle={() => {}} onPatch={() => {}} onAppend={() => {}} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

