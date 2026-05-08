import { useState } from 'react'
import { MANAGER_REVIEW_DEFAULTS, formatThreshold } from '../../config/managerReview.js'

// Manager-review block. The threshold and reason set come in via props; the
// component itself does NOT hardcode "$6k" or any reviewer name. Callers can
// pass a different config to swap defaults.
export default function ManagerReviewReasons({
  config = MANAGER_REVIEW_DEFAULTS,
  selected = [],
  onChange,
}) {
  const [internal, setInternal] = useState(selected)
  const isControlled = typeof onChange === 'function'
  const value = isControlled ? selected : internal

  function toggle(id) {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    if (isControlled) onChange(next)
    else setInternal(next)
  }

  const thresholdLabel = formatThreshold(config.thresholdCents, config.currency)

  return (
    <section className="card" style={{ padding: 18, borderLeft: '3px solid var(--review)' }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-brass">NEEDS MANAGER REVIEW</span>
      </div>
      <p className="body-sm" style={{ marginTop: 6 }}>
        Pick what makes this proposal need a second pair of eyes. Reasons come from settings — none are hard-coded into this screen.
      </p>
      <div className="mrr-grid">
        {config.reasons.map((reason) => {
          const on = value.includes(reason.id)
          const hint = reason.id === 'high-value'
            ? `Configurable threshold · ${thresholdLabel}`
            : reason.hint
          return (
            <button
              key={reason.id}
              type="button"
              className={`mrr-item ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(reason.id)}
            >
              <div className="mrr-item-head">
                <span className="mrr-check">{on ? '✓' : ''}</span>
                <span className="mrr-title">{reason.title}</span>
              </div>
              {hint && <p className="mrr-hint">{hint}</p>}
            </button>
          )
        })}
      </div>
      <div className="hstack" style={{ marginTop: 14, gap: 10, paddingTop: 12, borderTop: '1px dotted var(--stone-300)' }}>
        <p className="body-sm">
          <strong>{value.length} reason{value.length === 1 ? '' : 's'} selected.</strong>
          {value.length > 0 && ' Manager review recommended.'}
        </p>
      </div>
    </section>
  )
}
