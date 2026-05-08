import SourceTrustBadge from '../file/SourceTrustBadge.jsx'

const STATE_STRIPE = {
  blocked: 'stripe-blocked',
  review: 'stripe-review',
  waiting: 'stripe-waiting',
  safe: 'stripe-safe',
  quiet: 'stripe-quiet',
}

const BADGE_CLASS = {
  blocked: 'badge badge-blocked',
  review: 'badge badge-review',
  waiting: 'badge badge-waiting',
  safe: 'badge badge-safe',
  quiet: 'badge badge-quiet',
}

function FieldRuleBadge({ badge }) {
  const cls = badge.tone === 'blocker' ? 'source source-assumed' : 'source source-manual'
  return (
    <span
      className={cls}
      aria-label={`Field rule: ${badge.label}`}
      title={`Field rule: ${badge.label}`}
      style={{ marginRight: 6 }}
    >
      {badge.label}
    </span>
  )
}

export default function TodayActionCard({
  stamp,
  state = 'quiet',
  name,
  note,
  tag,
  source,
  sourceLabel,
  nextAction,
  onOpen,
  fieldRuleBadges = [],
}) {
  const stripe = STATE_STRIPE[state] || STATE_STRIPE.quiet
  const badge = BADGE_CLASS[state] || BADGE_CLASS.quiet
  return (
    <article className={`card today-card ${stripe}`}>
      <div className="today-card-head">
        {stamp && <span className={badge}>{stamp}</span>}
        <span className="spacer" />
        {source && <SourceTrustBadge kind={source} label={sourceLabel} />}
      </div>
      <div className="today-card-body">
        <h3 className="serif-h h4" style={{ marginTop: 4 }}>{name}</h3>
        {note && <p className="body-sm" style={{ marginTop: 6, color: 'var(--ink)' }}>{note}</p>}
        {tag && <p className="body-sm" style={{ marginTop: 4 }}>{tag}</p>}
        {Array.isArray(fieldRuleBadges) && fieldRuleBadges.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {fieldRuleBadges.map((b) => (
              <FieldRuleBadge key={b.id} badge={b} />
            ))}
          </div>
        )}
      </div>
      {(nextAction || onOpen) && (
        <div className="today-card-foot">
          <span className="eyebrow eyebrow-ink">NEXT</span>
          {nextAction && <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{nextAction}</span>}
          <span className="spacer" />
          {onOpen && (
            <button type="button" className="btn btn-ghost" onClick={onOpen}>
              Open →
            </button>
          )}
        </div>
      )}
    </article>
  )
}
