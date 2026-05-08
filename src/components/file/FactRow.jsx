import SourceTrustBadge from './SourceTrustBadge.jsx'

export default function FactRow({ label, value, source, sourceLabel, sub, warn }) {
  return (
    <div className="fact-row">
      <div className="fact-row-head">
        <span className="eyebrow eyebrow-ink fact-row-label">{label}</span>
        <span className="fact-row-value">{value || <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>not captured</span>}</span>
        {source && <SourceTrustBadge kind={source} label={sourceLabel} />}
      </div>
      {sub && <p className={`fact-row-sub ${warn ? 'is-warn' : ''}`}>{sub}</p>}
    </div>
  )
}
