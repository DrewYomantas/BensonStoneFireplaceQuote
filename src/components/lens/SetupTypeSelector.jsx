import { SETUP_TYPE_LABELS } from '../../lib/setupGoalLens.js'
import { suggestSetupTypeOrder } from '../../lib/salesOsSmartDefaults.js'

export default function SetupTypeSelector({ value, source, onChange, onMarkVerified }) {
  const options = suggestSetupTypeOrder()
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${value === opt ? 'is-on' : ''}`}
            onClick={() => onChange(opt)}
          >
            {SETUP_TYPE_LABELS[opt]}
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
              onClick={() => onMarkVerified(kind)}
            >
              {kind.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
