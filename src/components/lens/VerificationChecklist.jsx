import {
  GAS_TYPES, GAS_TYPE_LABELS,
  VENTING_LABELS,
  CONSTRUCTION_FLAG_LABELS,
} from '../../lib/setupGoalLens.js'
import {
  suggestPresenceOrder,
  suggestVentingOrder,
  suggestConstructionFlagOrder,
} from '../../lib/salesOsSmartDefaults.js'

const PRESENCE_LABELS = { unknown: 'Not yet known', yes: 'Yes', no: 'No' }
const SOURCE_OPTIONS = ['said', 'assumed', 'verified']

function ChipRow({ value, options, labels, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip ${value === opt ? 'is-on' : ''}`}
          onClick={() => onChange(opt)}
        >
          {labels[opt] || opt}
        </button>
      ))}
    </div>
  )
}

function SourceRow({ value, source, onMarkSource }) {
  if (!value || value === 'unknown') return null
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="body-sm">Source:</span>
      {SOURCE_OPTIONS.map((kind) => (
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
  )
}

function Block({ label, children }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

export default function VerificationChecklist({ draft, onChange, onMarkSource, onToggleFlag }) {
  const presenceOptions = suggestPresenceOrder()
  const ventingOptions = suggestVentingOrder()
  const constructionFlagOptions = suggestConstructionFlagOrder()
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Block label="Gas at fireplace">
        <ChipRow
          value={draft.fuelGasPresent}
          options={presenceOptions}
          labels={PRESENCE_LABELS}
          onChange={(v) => onChange('fuelGasPresent', v)}
        />
        <SourceRow
          value={draft.fuelGasPresent}
          source={draft.fuelGasPresentSource}
          onMarkSource={(k) => onMarkSource('fuelGasPresent', k)}
        />
      </Block>

      <Block label="Gas type">
        <ChipRow
          value={draft.gasType}
          options={GAS_TYPES}
          labels={GAS_TYPE_LABELS}
          onChange={(v) => onChange('gasType', v)}
        />
        <SourceRow
          value={draft.gasType}
          source={draft.gasTypeSource}
          onMarkSource={(k) => onMarkSource('gasType', k)}
        />
      </Block>

      <Block label="Electric at fireplace">
        <ChipRow
          value={draft.fuelElectricPresent}
          options={presenceOptions}
          labels={PRESENCE_LABELS}
          onChange={(v) => onChange('fuelElectricPresent', v)}
        />
        <SourceRow
          value={draft.fuelElectricPresent}
          source={draft.fuelElectricPresentSource}
          onMarkSource={(k) => onMarkSource('fuelElectricPresent', k)}
        />
      </Block>

      <Block label="Venting / chimney">
        <ChipRow
          value={draft.venting}
          options={ventingOptions}
          labels={VENTING_LABELS}
          onChange={(v) => onChange('venting', v)}
        />
        <SourceRow
          value={draft.venting}
          source={draft.ventingSource}
          onMarkSource={(k) => onMarkSource('venting', k)}
        />
      </Block>

      <Block label="Construction coordination">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {constructionFlagOptions.map((flag) => (
            <button
              key={flag}
              type="button"
              className={`chip ${draft.constructionFlags.includes(flag) ? 'is-on' : ''}`}
              onClick={() => onToggleFlag(flag)}
            >
              {CONSTRUCTION_FLAG_LABELS[flag]}
            </button>
          ))}
        </div>
      </Block>
    </div>
  )
}
