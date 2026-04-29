import { activityChannels, activityTypes } from '../lib/opportunityActivity.js'

function titleLabel(value) {
  return String(value || '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export default function ActivityTimeline({
  activities,
  noteBody,
  noteChannel,
  noteType,
  onAddNote,
  onDeleteActivity,
  onMarkDraftSent,
  onNoteBodyChange,
  onNoteChannelChange,
  onNoteTypeChange,
}) {
  return (
    <section className="activity-timeline">
      <div className="panel-heading">
        <div>
          <h4>Activity Timeline</h4>
          <p className="section-caption">Local notes and follow-up history. No external messages are sent.</p>
        </div>
      </div>

      <div className="activity-note-box">
        <div className="activity-note-controls">
          <label className="field">
            <span>Activity type</span>
            <select value={noteType} onChange={(event) => onNoteTypeChange(event.target.value)}>
              {activityTypes.filter((type) => ['note', 'phone-call', 'voicemail', 'showroom-visit'].includes(type)).map((type) => (
                <option key={type} value={type}>{titleLabel(type)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Channel</span>
            <select value={noteChannel} onChange={(event) => onNoteChannelChange(event.target.value)}>
              {activityChannels.map((channel) => <option key={channel} value={channel}>{titleLabel(channel)}</option>)}
            </select>
          </label>
        </div>
        <label className="field field--wide">
          <span>Internal note</span>
          <textarea rows={3} value={noteBody} onChange={(event) => onNoteBodyChange(event.target.value)} />
        </label>
        <button type="button" className="ghost-button ghost-button--subtle" onClick={onAddNote}>Add internal note</button>
      </div>

      <div className="activity-list">
        {activities.length ? activities.map((activity) => (
          <article className="activity-item" key={activity.id}>
            <div>
              <strong>{activity.title || titleLabel(activity.type)}</strong>
              <span>{new Date(activity.createdAt).toLocaleString()} - {titleLabel(activity.channel)}</span>
            </div>
            {activity.body ? <p>{activity.body.length > 260 ? `${activity.body.slice(0, 260)}...` : activity.body}</p> : null}
            <div className="activity-actions">
              {activity.type === 'follow-up-draft' ? (
                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onMarkDraftSent(activity)}>Mark draft as sent</button>
              ) : null}
              <button type="button" className="ghost-button ghost-button--subtle" onClick={() => onDeleteActivity(activity.id)}>Delete</button>
            </div>
          </article>
        )) : <p className="empty-copy">No activity logged yet.</p>}
      </div>
    </section>
  )
}
