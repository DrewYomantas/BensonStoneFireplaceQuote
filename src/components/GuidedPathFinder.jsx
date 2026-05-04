import { updateCustomerFile } from '../lib/customerFile.js'
import { buildGuidedPathPatch, getGuidedPathRecommendation } from '../lib/guidedPathRules.js'

const C = {
  mid: '#2d4a36', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const inputStyle = { padding: '7px 9px', border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 12, fontFamily: 'inherit', width: '100%' }

function Chip({ children, tone = 'green' }) {
  const map = {
    green: { bg: 'rgba(45,74,54,0.1)', fg: C.mid },
    gold: { bg: 'rgba(201,162,76,0.2)', fg: '#6b541c' },
    rust: { bg: 'rgba(138,58,30,0.12)', fg: C.rust },
  }
  const s = map[tone] || map.green
  return <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 7px', background: s.bg, color: s.fg }}>{children}</span>
}

function readForm(form) {
  const data = new FormData(form)
  return {
    likelyPath: String(data.get('likelyPath') || '').trim(),
    nextBestQuestion: String(data.get('nextBestQuestion') || '').trim(),
    guidedPathNotes: String(data.get('guidedPathNotes') || '').trim(),
    guidedPathCustomerSummary: String(data.get('guidedPathCustomerSummary') || '').trim(),
  }
}

export default function GuidedPathFinder({ file, onChange }) {
  // Keep this component intentionally hook-free. A stale Vite/React optimizer cache can
  // surface an "Invalid hook call" here before the rest of the workbench loads. This
  // panel does not need local React state; the form remains fully functional by reading
  // values at save-time and writing them to the customer file.
  const rec = getGuidedPathRecommendation(file || {})
  const defaults = {
    likelyPath: file?.likelyPath || rec.likelyPath || '',
    nextBestQuestion: file?.nextBestQuestion || rec.nextBestQuestion || '',
    guidedPathNotes: file?.guidedPathNotes || '',
    guidedPathCustomerSummary: file?.guidedPathCustomerSummary || rec.safeDiscussionSummary || '',
  }

  function saveFromForm(event) {
    event.preventDefault()
    if (!file?.id) return
    const draft = readForm(event.currentTarget)
    const updated = updateCustomerFile(file.id, buildGuidedPathPatch(file, draft))
    if (onChange) onChange(updated)
  }

  function applyQuestion(event, question) {
    const form = event.currentTarget.form
    const input = form?.elements?.nextBestQuestion
    if (input) input.value = question
  }

  function applyPath(event, path) {
    const form = event.currentTarget.form
    const input = form?.elements?.likelyPath
    if (input) input.value = path
  }

  return (
    <form onSubmit={saveFromForm} style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.copper}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Guided Path Finder</div>
        <Chip tone={rec.evidence.modelTagReceived ? 'green' : 'gold'}>Model tag {rec.evidence.modelTagReceived ? 'received' : 'not confirmed'}</Chip>
        <Chip tone={rec.evidence.photosReceived ? 'green' : 'gold'}>Photos {rec.evidence.photosReceived ? 'received' : 'needed'}</Chip>
        <Chip tone={rec.evidence.measurementsReceived ? 'green' : 'gold'}>Measurements {rec.evidence.measurementsReceived ? 'received' : 'needed'}</Chip>
      </div>
      <div style={{ ...serif, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 6 }}>{rec.likelyPath || 'Discovery path'}</div>
      <p style={{ fontSize: 12, color: C.inkMid, lineHeight: 1.55, margin: '6px 0 12px' }}>{rec.safeDiscussionSummary}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 6 }}>Possible paths</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rec.possiblePaths.map((p) => (
              <button
                key={p.id}
                type="button"
                className="wb-btn"
                onClick={(event) => applyPath(event, p.label)}
                style={{ justifyContent: 'space-between', fontSize: 11, textAlign: 'left' }}
              >
                <span>{p.label}</span>
                <span style={{ color: C.inkLight }}>{p.confidence}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 6 }}>Safe next questions</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rec.questions.slice(0, 5).map((q) => (
              <li key={q} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11.5, color: C.inkMid, lineHeight: 1.4 }}>
                <span style={{ color: C.copper, fontWeight: 800 }}>?</span>
                <button type="button" onClick={(event) => applyQuestion(event, q)} style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>{q}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {rec.cautions.length > 0 && (
        <div style={{ marginTop: 12, padding: '8px 11px', background: 'rgba(138,58,30,0.10)', border: `1px solid rgba(138,58,30,0.22)`, color: C.rust, fontSize: 11.5, lineHeight: 1.45 }}>
          <strong>Slow down:</strong> {rec.cautions.join(' ')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>Likely path to save</span>
          <input name="likelyPath" defaultValue={defaults.likelyPath} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>Next best question</span>
          <input name="nextBestQuestion" defaultValue={defaults.nextBestQuestion} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>Internal notes</span>
          <textarea name="guidedPathNotes" rows={2} defaultValue={defaults.guidedPathNotes} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
        <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
          <span style={{ ...eyebrow, fontSize: 7.5, color: C.inkLight }}>Customer-safe discussion summary</span>
          <textarea name="guidedPathCustomerSummary" rows={2} defaultValue={defaults.guidedPathCustomerSummary} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
      </div>
      <button type="submit" className="wb-btn wb-btn--primary" style={{ marginTop: 10, fontSize: 11 }}>Save path guidance</button>
    </form>
  )
}
