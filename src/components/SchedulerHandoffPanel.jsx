import { useMemo, useState } from 'react'
import { updateCustomerFile } from '../lib/customerFile.js'
import { buildHandoffPatch, createSchedulerHandoff, deriveHandoffReadiness } from '../lib/schedulerHandoff.js'

const C = {
  mid: '#2d4a36', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const inputStyle = { padding: '7px 9px', border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 12, fontFamily: 'inherit', width: '100%' }

const stateLabels = {
  not_needed: 'Not needed',
  needed_not_ready: 'Needed, not ready',
  ready_to_create: 'Ready to create',
  created: 'Created',
  sent_to_scheduler: 'Sent to scheduler',
  waiting_for_measure: 'Waiting for measure',
  measure_completed: 'Measure completed',
}

export default function SchedulerHandoffPanel({ file, onChange }) {
  const readiness = useMemo(() => deriveHandoffReadiness(file || {}), [file])
  const generated = useMemo(() => createSchedulerHandoff(file || {}), [file])
  const [missing, setMissing] = useState(file?.handoffMissingVerification || '')
  const [concerns, setConcerns] = useState(file?.handoffConcerns || '')
  const [expectation, setExpectation] = useState(file?.handoffSchedulerExpectation || '')
  const [notes, setNotes] = useState(file?.handoffNotes || '')
  const [summary, setSummary] = useState(file?.handoffSummary || generated.summary)

  function patch(action, value) {
    if (!file?.id) return
    const updated = updateCustomerFile(file.id, buildHandoffPatch(action, value))
    if (onChange) onChange(updated)
  }

  function saveNotes() {
    if (!file?.id) return
    const updated = updateCustomerFile(file.id, {
      handoffMissingVerification: missing,
      handoffConcerns: concerns,
      handoffSchedulerExpectation: expectation,
      handoffNotes: notes,
    })
    if (onChange) onChange(updated)
  }

  function createHandoff() {
    const result = createSchedulerHandoff({ ...file, handoffMissingVerification: missing, handoffConcerns: concerns, handoffSchedulerExpectation: expectation, handoffNotes: notes })
    setSummary(result.summary)
    patch('created', result.summary)
  }

  return (
    <section style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${readiness.ready ? C.mid : C.copper}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Scheduler / Home-Measure Handoff</div>
        <span className={`wb-pill ${readiness.ready ? 'wb-pill--green' : 'wb-pill--rust'}`}>{stateLabels[readiness.state] || readiness.state}</span>
      </div>
      <div style={{ ...serif, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>{readiness.nextAction || readiness.nextRecommendedAction}</div>

      {readiness.blockers?.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 11px', background: 'rgba(138,58,30,0.10)', border: `1px solid rgba(138,58,30,0.22)`, color: C.rust, fontSize: 11.5, lineHeight: 1.45 }}>
          <strong>Need before handoff:</strong> {readiness.blockers.join('; ')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Missing verification</span>
          <textarea rows={2} value={missing} onChange={(e) => setMissing(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Gas / electrical / chimney / venting concerns</span>
          <textarea rows={2} value={concerns} onChange={(e) => setConcerns(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Scheduler / home-measure expectation</span>
          <textarea rows={2} value={expectation} onChange={(e) => setExpectation(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Internal notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" className="wb-btn" onClick={() => patch('need-home-measure')} style={{ fontSize: 11 }}>Needs home-measure</button>
        <button type="button" className="wb-btn" onClick={() => patch('not-needed')} style={{ fontSize: 11 }}>No handoff needed</button>
        <button type="button" className="wb-btn" onClick={saveNotes} style={{ fontSize: 11 }}>Save handoff notes</button>
        <button type="button" className="wb-btn wb-btn--primary" disabled={!readiness.ready} onClick={createHandoff} style={{ fontSize: 11, opacity: readiness.ready ? 1 : 0.5 }}>Create handoff</button>
        <button type="button" className="wb-btn wb-btn--copper" disabled={readiness.state !== 'created'} onClick={() => patch('sent', summary)} style={{ fontSize: 11, opacity: readiness.state === 'created' ? 1 : 0.5 }}>Mark sent to scheduler</button>
        <button type="button" className="wb-btn" disabled={!['sent_to_scheduler', 'created'].includes(readiness.state)} onClick={() => patch('waiting-for-measure')} style={{ fontSize: 11, opacity: ['sent_to_scheduler', 'created'].includes(readiness.state) ? 1 : 0.5 }}>Waiting for measure</button>
        <button type="button" className="wb-btn wb-btn--primary" disabled={readiness.state !== 'waiting_for_measure'} onClick={() => patch('measure-completed')} style={{ fontSize: 11, opacity: readiness.state === 'waiting_for_measure' ? 1 : 0.5 }}>Measure completed</button>
      </div>

      <label style={{ display: 'grid', gap: 4, marginTop: 12 }}>
        <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Internal handoff summary</span>
        <textarea rows={9} value={summary} onChange={(e) => setSummary(e.target.value)} style={{ ...inputStyle, resize: 'vertical', fontFamily: '"Courier New",monospace', fontSize: 11 }} />
      </label>
    </section>
  )
}
