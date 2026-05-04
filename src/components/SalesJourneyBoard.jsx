import { useMemo, useState } from 'react'
import { updateCustomerFile } from '../lib/customerFile.js'
import {
  applySalesJourneyQuickPatch,
  buildCustomerSafeSalesRecap,
  buildInternalSalesDigest,
  buildSalesJourneyQuickPatch,
  deriveSalesJourney,
} from '../lib/salesJourney.js'

const C = {
  forest: '#1f3527', mid: '#2d4a36', parchment: '#f3ead6', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const mono = { fontFamily: '"Courier New",Courier,monospace' }

function ToneChip({ children, tone = 'todo' }) {
  const map = {
    done: { bg: 'rgba(45,74,54,0.12)', fg: C.mid },
    todo: { bg: 'rgba(201,162,76,0.22)', fg: '#6b541c' },
    blocker: { bg: 'rgba(138,58,30,0.12)', fg: C.rust },
    system: { bg: 'rgba(31,53,39,0.08)', fg: C.forest },
  }
  const s = map[tone] || map.todo
  return <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 7px', background: s.bg, color: s.fg }}>{children}</span>
}

function Meter({ percent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: 'rgba(50,38,22,0.10)', border: `1px solid ${C.border}` }}>
        <div style={{ width: `${Math.max(0, Math.min(100, percent || 0))}%`, height: '100%', background: C.mid }} />
      </div>
      <div style={{ ...mono, color: C.inkMid, fontSize: 10 }}>{percent || 0}%</div>
    </div>
  )
}

function PhaseRail({ stages }) {
  if (!stages.length) return null
  return (
    <div className="wb-journey-rail" aria-label="Customer file lifecycle">
      {stages.map((stage) => (
        <div key={stage.id} className={`wb-journey-rail__step${stage.active ? ' is-active' : ''}${stage.complete ? ' is-complete' : ''}`}>
          <div className="wb-journey-rail__meta">{stage.active ? 'Now' : stage.complete ? 'Done' : 'Next'}</div>
          <div className="wb-journey-rail__label">{stage.label}</div>
        </div>
      ))}
    </div>
  )
}

function StatusToggle({ label, checked, onEnable, onClear, helper }) {
  return (
    <button
      type="button"
      className={`wb-status-toggle${checked ? ' is-on' : ''}`}
      onClick={checked ? onClear : onEnable}
      aria-pressed={Boolean(checked)}
      title={checked ? `Click to undo ${label.toLowerCase()}.` : `Click to mark ${label.toLowerCase()}.`}
    >
      <span className="wb-status-toggle__mark">{checked ? '✓' : '+'}</span>
      <span className="wb-status-toggle__body">
        <span className="wb-status-toggle__label">{label}</span>
        <span className="wb-status-toggle__helper">{checked ? 'Manual correction, click to undo' : helper || 'Add correction'}</span>
      </span>
    </button>
  )
}

function ReadOnlyCheck({ label, checked }) {
  return (
    <div className={`wb-readonly-check${checked ? ' is-on' : ''}`}>
      <span>{checked ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  )
}

function SignalCard({ signal }) {
  return (
    <article className={`wb-signal-card${signal.detected ? ' is-detected' : ''}`}>
      <div className="wb-signal-card__icon">{signal.detected ? '✓' : '•'}</div>
      <div className="wb-signal-card__body">
        <div className="wb-signal-card__label">{signal.label}</div>
        <div className="wb-signal-card__source">{signal.detected ? signal.source : signal.action}</div>
        {signal.evidence && <div className="wb-signal-card__evidence">{signal.evidence}</div>}
      </div>
    </article>
  )
}

function SmartSignals({ signals }) {
  const visible = signals.systemTracking?.length
    ? signals.systemTracking.map((item) => ({
        id: item.id,
        label: item.label,
        detected: item.tone === 'done',
        source: item.tone === 'done' ? 'Tracked from real file evidence' : 'Still missing from the file',
      }))
    : [
        signals.signals.photos,
        signals.signals.measurements,
        signals.signals.modelTag,
        signals.signals.showroom,
      ]
  return (
    <div className="wb-smart-signals" aria-label="Smart background signals">
      <div className="wb-smart-signals__head">
        <div>
          <div className="wb-journey-board__section-title">System is tracking</div>
          <div className="wb-smart-signals__subcopy">Photos, measurements, model tags, quote import, and packet state are inferred from the file first. Manual fixes stay tucked away unless you need them.</div>
        </div>
        <ToneChip tone="system">{signals.summary}</ToneChip>
      </div>
      <div className="wb-signal-grid">
        {visible.map((signal) => <SignalCard key={signal.id} signal={signal} />)}
      </div>
    </div>
  )
}

function FactGrid({ facts, compact }) {
  return (
    <div className="wb-fact-grid">
      {facts.slice(0, compact ? 6 : 10).map((fact) => (
        <div key={fact.label} className="wb-fact-tile">
          <div className="wb-fact-tile__label">{fact.label}</div>
          <div className="wb-fact-tile__value">{fact.value}</div>
        </div>
      ))}
    </div>
  )
}

export default function SalesJourneyBoard({ file, onChange, compact = false }) {
  const journey = useMemo(() => deriveSalesJourney(file || {}), [file])
  const [showDetails, setShowDetails] = useState(false)
  const [showCorrections, setShowCorrections] = useState(false)
  const [lastAction, setLastAction] = useState('')
  const safeRecap = useMemo(() => buildCustomerSafeSalesRecap(file || {}), [file])
  const internalDigest = useMemo(() => buildInternalSalesDigest(file || {}), [file])

  function applyQuickAction(action, label) {
    if (!file?.id) return
    const patch = buildSalesJourneyQuickPatch(action)
    const merged = applySalesJourneyQuickPatch(file, patch)
    const updated = updateCustomerFile(file.id, merged)
    setLastAction(label)
    if (onChange) onChange(updated)
  }

  const quickToggles = [
    {
      label: 'Photos',
      checked: Boolean((file?.photos || []).length),
      helper: 'Add manual photo note',
      onEnable: () => applyQuickAction('log-photos-received', 'Photos corrected as received'),
      onClear: () => applyQuickAction('clear-photos-received', 'Photos correction removed'),
    },
    {
      label: 'Measurements',
      checked: Boolean((file?.measurements || []).length),
      helper: 'Add manual rough dimensions note',
      onEnable: () => applyQuickAction('log-rough-measurements', 'Measurements corrected as received'),
      onClear: () => applyQuickAction('clear-rough-measurements', 'Measurements correction removed'),
    },
    {
      label: 'Model tag',
      checked: Boolean(file?.modelTagReceived || file?.taggedModel),
      helper: 'Add manual model tag confirmation',
      onEnable: () => applyQuickAction('mark-model-tag-received', 'Model tag corrected as received'),
      onClear: () => applyQuickAction('clear-model-tag-received', 'Model tag correction removed'),
    },
    {
      label: 'Showroom walk',
      checked: Boolean((file?.displaysShown || []).length),
      helper: 'Add manual showroom walk note',
      onEnable: () => applyQuickAction('mark-showroom-walked', 'Showroom walk corrected as discussed'),
      onClear: () => applyQuickAction('clear-showroom-walked', 'Showroom walk correction removed'),
    },
    {
      label: 'Pricing checked',
      checked: Boolean(file?.pricingConfirmedAt),
      helper: 'Add manual pricing confirmation',
      onEnable: () => applyQuickAction('mark-pricing-confirmed', 'Pricing corrected as current'),
      onClear: () => applyQuickAction('clear-pricing-confirmed', 'Pricing correction removed'),
    },
  ]

  const topAttention = journey.attention.slice(0, compact ? 3 : 4)

  return (
    <section className={`wb-journey-board${compact ? ' wb-journey-board--compact' : ''}${journey.blockers.length ? ' has-blockers' : ''}`}>
      <div className="wb-journey-board__top">
        <div className="wb-journey-board__main">
          <div className="wb-meta-row">
            <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Sales Journey</div>
            <ToneChip tone={journey.blockers.length ? 'blocker' : 'done'}>{journey.status.status}</ToneChip>
            <ToneChip>{journey.queueBucket}</ToneChip>
          </div>
          <div className="wb-journey-board__action">{journey.nextBestAction}</div>
          {!compact && (
          <div className="wb-journey-board__copy">
            The file stays calmer now: one next step up top, a quiet background tracker underneath, and deeper detail only when you ask for it.
          </div>
          )}
        </div>
        <div className="wb-journey-board__meter">
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5, marginBottom: 5 }}>File confidence</div>
          <Meter percent={journey.completion.percent} />
          <div style={{ fontSize: 10, color: C.inkLight, marginTop: 4 }}>{journey.completion.completed} of {journey.completion.total} core signals</div>
        </div>
      </div>

      {!compact && <PhaseRail stages={journey.stages} />}

      <SmartSignals signals={journey.smartSignals} />

      <div className="wb-journey-board__split wb-journey-board__split--attention-first">
        <div>
          <div className="wb-journey-board__section-title">Needs your attention</div>
          {topAttention.length === 0 ? (
            <div className="wb-empty-good">No immediate gaps from the customer file.</div>
          ) : (
            <div className="wb-attention-list">
              {topAttention.map((item) => (
                <div key={item.id} className="wb-attention-item">
                  <ToneChip tone={item.tone}>{item.tone}</ToneChip>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          {journey.attention.length > topAttention.length && (
            <div className="wb-muted-note">{journey.attention.length - topAttention.length} more item{journey.attention.length - topAttention.length === 1 ? '' : 's'} tucked into details.</div>
          )}
        </div>
        <div>
          <div className="wb-journey-board__section-title">Useful file facts</div>
          <FactGrid facts={journey.quickFacts.filter((fact) => ['Customer', 'Contact', 'Setup', 'Goal', 'Likely path', 'Packet'].includes(fact.label))} compact={compact} />
        </div>
      </div>

      <div className="wb-disclosure-row">
        <button
          type="button"
          className="wb-btn wb-btn--ghost wb-details-toggle"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          aria-controls="sales-journey-details"
        >
          {showDetails ? 'Hide detail drawer' : 'Show detail drawer'}
        </button>
        <button
          type="button"
          className="wb-btn wb-btn--ghost wb-details-toggle"
          onClick={() => setShowCorrections((value) => !value)}
          aria-expanded={showCorrections}
          aria-controls="sales-journey-corrections"
        >
          {showCorrections ? 'Hide manual corrections' : 'Manual corrections'}
        </button>
        {lastAction && <div className="wb-save-note">Saved: {lastAction}</div>}
      </div>

      {showCorrections && (
        <div id="sales-journey-corrections" className="wb-correction-panel">
          <div>
            <div className="wb-journey-board__section-title">Manual corrections only</div>
            <p>Use these when the system missed something. The goal is still for photos, measurements, displays, brochures, quotes, packets, and handoffs to be detected from the actual workflow.</p>
          </div>
          <div className="wb-status-toggle-grid">
            {quickToggles.map((item) => <StatusToggle key={item.label} {...item} />)}
          </div>
        </div>
      )}

      {showDetails && (
        <div id="sales-journey-details" className="wb-journey-details">
          <div>
            <div className="wb-journey-board__section-title">Verification</div>
            <div className="wb-readonly-check-grid">
              <ReadOnlyCheck label="Contact" checked={journey.verification.contact} />
              <ReadOnlyCheck label="Goal" checked={journey.verification.goal} />
              <ReadOnlyCheck label="Likely path" checked={journey.verification.likelyPath} />
              <ReadOnlyCheck label="Photos" checked={journey.verification.photos} />
              <ReadOnlyCheck label="Measurements" checked={journey.verification.measurements} />
              <ReadOnlyCheck label="Quote" checked={journey.verification.quoteImported} />
              <ReadOnlyCheck label="Packet sent" checked={journey.verification.packetSent} />
              <ReadOnlyCheck label="Handoff" checked={journey.verification.handoffActive} />
            </div>
          </div>
          <div className="wb-recap-box">
            <div className="wb-journey-board__section-title">Customer-safe recap</div>
            <pre>{safeRecap || 'No customer-facing recap yet.'}</pre>
          </div>
          <div className="wb-recap-box">
            <div className="wb-journey-board__section-title">Internal digest</div>
            <pre>{internalDigest}</pre>
          </div>
        </div>
      )}
    </section>
  )
}
