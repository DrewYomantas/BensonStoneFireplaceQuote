import { useState } from 'react'
import { followUpChannels, followUpTones } from '../lib/followUpComposer.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export default function FollowUpComposer({
  draft,
  opportunity,
  selectedChannel,
  selectedTone,
  onChannelChange,
  onToneChange,
  onLogSent,
  onSaveDraft,
}) {
  const [copied, setCopied] = useState(false)
  const [fallbackVisible, setFallbackVisible] = useState(false)

  const fullText = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body

  function handleCopy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => setFallbackVisible(true))
    } else {
      setFallbackVisible(true)
    }
  }

  return (
    <section className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="hstack" style={{ marginBottom: 10 }}>
        <span className="eyebrow eyebrow-ink">FOLLOW-UP COMPOSER</span>
        <span className="spacer" />
        <span
          className="source"
          style={{ background: draft.unsafeToSend ? 'var(--ember)' : 'var(--brass)', color: '#fff' }}
        >
          {draft.unsafeToSend ? 'Review before sending' : 'Ready to copy'}
        </span>
      </div>

      <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 10 }}>
        {opportunity.customerName || 'Customer'}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span>Channel</span>
          <select value={selectedChannel} onChange={(e) => onChannelChange(e.target.value)}>
            {followUpChannels.map((ch) => <option key={ch} value={ch}>{titleLabel(ch)}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span>Tone</span>
          <select value={selectedTone} onChange={(e) => onToneChange(e.target.value)}>
            {followUpTones.map((t) => <option key={t} value={t}>{titleLabel(t)}</option>)}
          </select>
        </label>
      </div>

      {draft.warnings.length > 0 && (
        <div className="card-inset" style={{ marginBottom: 10, borderLeft: '3px solid var(--ember)', padding: '8px 12px' }}>
          <span className="eyebrow eyebrow-ember" style={{ display: 'block', marginBottom: 4 }}>Review before sending</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {draft.warnings.map((w) => <li key={w} className="body-sm">{w}</li>)}
          </ul>
        </div>
      )}

      <label className="field" style={{ display: 'block', marginBottom: 8 }}>
        <span>Subject</span>
        <input className="field" value={draft.subject} readOnly style={{ width: '100%' }} />
      </label>
      <label className="field" style={{ display: 'block', marginBottom: 10 }}>
        <span>Body</span>
        <textarea className="field field-textarea" rows={7} value={draft.body} readOnly style={{ width: '100%', resize: 'vertical' }} />
      </label>

      {fallbackVisible && (
        <div style={{ marginBottom: 10 }}>
          <span className="eyebrow eyebrow-ink" style={{ display: 'block', marginBottom: 4 }}>Copy manually:</span>
          <textarea
            className="field field-textarea"
            rows={5}
            readOnly
            value={fullText}
            style={{ width: '100%' }}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn btn-quiet" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy message'}
        </button>
        {onSaveDraft && (
          <button type="button" className="btn btn-quiet" onClick={onSaveDraft}>Save draft to timeline</button>
        )}
        {onLogSent && (
          <button type="button" className="btn btn-primary" onClick={onLogSent}>Log as sent</button>
        )}
      </div>
    </section>
  )
}
