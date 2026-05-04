import { useMemo, useState } from 'react'
import { updateCustomerFile } from '../lib/customerFile.js'
import { buildCustomerSafePacketSummary, buildPacketPatch, getCustomerPacketState } from '../lib/customerPacketState.js'

const C = {
  mid: '#2d4a36', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const inputStyle = { padding: '7px 9px', border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 12, fontFamily: 'inherit', width: '100%' }

function Stamp({ label, value }) {
  return (
    <div style={{ fontSize: 11, color: C.inkMid }}>
      <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>{label}: </span>
      {value ? new Date(value).toLocaleString() : 'not logged'}
    </div>
  )
}

export default function CustomerPacketPanel({ file, onChange, onPrint }) {
  const state = useMemo(() => getCustomerPacketState(file || {}), [file])
  const [excludeReason, setExcludeReason] = useState(file?.lineItemQuoteExcludedReason || '')
  const [summary, setSummary] = useState(file?.brochuresSamplesSummary || '')

  function patch(action, value) {
    if (!file?.id) return
    const updated = updateCustomerFile(file.id, buildPacketPatch(action, value))
    if (onChange) onChange(updated)
  }

  function markPrinted() {
    patch('mark-printed')
    if (onPrint) onPrint()
  }

  const safeSummary = buildCustomerSafePacketSummary(file || {})

  return (
    <section style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${state.readyToGenerate ? C.mid : C.copper}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Customer Packet</div>
        <span className={`wb-pill ${state.readyToGenerate ? 'wb-pill--green' : 'wb-pill--rust'}`}>{state.readyToGenerate ? 'Ready' : `${state.blockers.length} blocker${state.blockers.length === 1 ? '' : 's'}`}</span>
      </div>
      <div style={{ ...serif, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>{state.nextAction}</div>

      {state.blockers.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 11px', background: 'rgba(138,58,30,0.10)', border: `1px solid rgba(138,58,30,0.22)`, color: C.rust, fontSize: 11.5, lineHeight: 1.45 }}>
          <strong>Blocked by:</strong> {state.blockers.join('; ')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div style={{ border: `1px solid ${C.border}`, background: '#fff', padding: 10 }}>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 7 }}>Packet decisions</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
            <input type="checkbox" checked={state.decisions.detailedInvestmentBreakdownIncluded} onChange={(e) => patch('include-breakdown', e.target.checked)} />
            Detailed Investment Breakdown included
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
            <input type="checkbox" checked={state.decisions.scopeResponsibilityNotesIncluded} onChange={(e) => patch('include-scope-notes', e.target.checked)} />
            Scope / responsibility notes included
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
            <input type="checkbox" checked={state.decisions.brochuresSamplesSummaryIncluded} onChange={(e) => patch('include-brochures-summary', e.target.checked)} />
            Brochures / samples summary included
          </label>
          <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Customer-safe brochure/sample summary</span>
            <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
          <button type="button" className="wb-btn" onClick={() => patch('set-brochures-summary', summary)} style={{ marginTop: 7, fontSize: 10 }}>Save summary</button>
        </div>

        <div style={{ border: `1px solid ${C.border}`, background: '#fff', padding: 10 }}>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 7 }}>Original BizTrack line-item quote</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button type="button" className={`wb-btn ${state.decisions.originalBizTrackLineItemQuote === 'included' ? 'wb-btn--primary' : ''}`} onClick={() => patch('include-original-quote')} style={{ fontSize: 10 }}>Included</button>
            <button type="button" className={`wb-btn ${state.decisions.originalBizTrackLineItemQuote === 'excluded-with-reason' ? 'wb-btn--primary' : ''}`} onClick={() => patch('exclude-original-quote', excludeReason || 'Intentionally excluded from this customer packet.')} style={{ fontSize: 10 }}>Excluded with reason</button>
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Reason if excluded</span>
            <textarea rows={2} value={excludeReason} onChange={(e) => setExcludeReason(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
          <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            <Stamp label="Generated" value={state.timestamps.generatedAt} />
            <Stamp label="Printed" value={state.timestamps.printedAt} />
            <Stamp label="Sent" value={state.timestamps.sentAt} />
            <div style={{ fontSize: 11, color: C.inkMid }}><span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Email:</span> {state.email.draftStatus}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button type="button" className="wb-btn wb-btn--primary" disabled={!state.readyToGenerate} onClick={() => patch('mark-generated')} style={{ fontSize: 11, opacity: state.readyToGenerate ? 1 : 0.5 }}>Mark generated</button>
        <button type="button" className="wb-btn wb-btn--copper" disabled={!state.readyToGenerate} onClick={markPrinted} style={{ fontSize: 11, opacity: state.readyToGenerate ? 1 : 0.5 }}>Print / Save PDF</button>
        <button type="button" className="wb-btn" disabled={!state.packetGenerated} onClick={() => patch('mark-email-draft', 'drafted')} style={{ fontSize: 11, opacity: state.packetGenerated ? 1 : 0.5 }}>Mark email drafted</button>
        <button type="button" className="wb-btn wb-btn--primary" disabled={!state.packetGenerated} onClick={() => patch('mark-sent-email')} style={{ fontSize: 11, opacity: state.packetGenerated ? 1 : 0.5 }}>Log sent by email</button>
        <button type="button" className="wb-btn" disabled={!state.packetGenerated} onClick={() => patch('mark-sent-print')} style={{ fontSize: 11, opacity: state.packetGenerated ? 1 : 0.5 }}>Log printed handoff</button>
      </div>

      <div style={{ marginTop: 10, padding: '8px 11px', background: 'rgba(45,74,54,0.06)', border: `1px solid rgba(45,74,54,0.16)`, fontSize: 11, color: C.inkMid, lineHeight: 1.45 }}>
        <strong>Customer-safe packet summary preview:</strong><br />{safeSummary || 'No customer-facing packet notes saved yet.'}
      </div>
    </section>
  )
}
