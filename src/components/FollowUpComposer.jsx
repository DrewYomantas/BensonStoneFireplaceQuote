import { followUpChannels, followUpTones } from '../lib/followUpComposer.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export default function FollowUpComposer({
  draft,
  opportunity,
  playbook,
  selectedChannel,
  selectedTone,
  onChannelChange,
  onCopyDraft,
  onLogSent,
  onSaveDraft,
  onToneChange,
}) {
  return (
    <section className="follow-up-composer">
      <div className="panel-heading">
        <div>
          <p className="kicker">Follow-Up Composer</p>
          <h4>Draft follow-up</h4>
          <p className="section-caption">{opportunity.customerName || 'Customer'} - {playbook?.name || 'No playbook selected'}</p>
        </div>
        <span className={`batch-status is-${draft.unsafeToSend ? 'needs-review' : 'ready'}`}>
          {draft.unsafeToSend ? 'Review before sending' : 'Ready to copy'}
        </span>
      </div>

      <div className="composer-controls">
        <label className="field">
          <span>Channel</span>
          <select value={selectedChannel} onChange={(event) => onChannelChange(event.target.value)}>
            {followUpChannels.map((channel) => <option key={channel} value={channel}>{titleLabel(channel)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tone</span>
          <select value={selectedTone} onChange={(event) => onToneChange(event.target.value)}>
            {followUpTones.map((tone) => <option key={tone} value={tone}>{titleLabel(tone)}</option>)}
          </select>
        </label>
      </div>

      {draft.warnings.length ? (
        <div className="opportunity-warning-box">
          <h4>Review before sending</h4>
          <ul className="notice-list notice-list--warning">
            {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <label className="field field--wide">
        <span>Subject</span>
        <input value={draft.subject} readOnly />
      </label>
      <label className="field field--wide">
        <span>Body</span>
        <textarea rows={7} value={draft.body} readOnly />
      </label>

      <div className="action-row">
        <button type="button" className="ghost-button" onClick={onCopyDraft}>Copy message</button>
        <button type="button" className="ghost-button" onClick={onSaveDraft}>Save draft to timeline</button>
        <button type="button" className="primary-button" onClick={onLogSent}>Log as sent</button>
      </div>
    </section>
  )
}
