import { DESIRED_OUTCOMES, DESIRED_OUTCOME_LABELS } from '../../lib/setupGoalLens.js'

export default function GoalSelector({ value, source, onChange, onMarkSource }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {DESIRED_OUTCOMES.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${value === opt ? 'is-on' : ''}`}
            onClick={() => onChange(opt)}
          >
            {DESIRED_OUTCOME_LABELS[opt]}
          </button>
        ))}
      </div>
      {value !== 'unknown' && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="body-sm">Source:</span>
          {['said', 'assumed', 'verified'].map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${source === kind ? 'is-on' : ''}`}
              onClick={() => onMarkSource(kind)}
            >
              {kind.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
