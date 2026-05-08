// Source Context Panel — Milestone 16.
// Internal-only drawer for Quote / Prep. Displays projected context from
// quotePrepContext.js: customer/setup facts, line review counts, field rules,
// gate blockers, recent activity, follow-up reminder, and line evidence notes.
// Read-only by default. The "Add context to prep notes" action requires an
// explicit user click and never auto-mutates.

import { useState } from 'react'
import { GATE_STATUS } from '../../lib/quotePrepGate.js'

// ---- Module-level helpers ---------------------------------------------------

function SectionToggle({ isOpen, onToggle, label, accent, children }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '5px 0',
          background: 'none',
          border: 'none',
          borderBottom: '1px solid var(--stone-200)',
          cursor: 'pointer',
          textAlign: 'left',
          marginBottom: isOpen ? 8 : 2,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: accent ? 'var(--ember)' : 'var(--slate-soft)',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--slate-soft)', userSelect: 'none' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>
      {isOpen && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  )
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 5, alignItems: 'flex-start' }}>
      <span
        className="body-sm"
        style={{ color: 'var(--slate-soft)', minWidth: 110, flexShrink: 0, fontSize: 11 }}
      >
        {label}
      </span>
      <span className="body-sm" style={{ color: 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}

function Pill({ text, tone }) {
  const cls = tone === 'ember' ? 'source source-assumed'
    : tone === 'brass' ? 'source source-said'
    : 'source source-manual'
  if (!text) return null
  return <span className={cls} style={{ fontSize: 11 }}>{text.toUpperCase()}</span>
}

function CountChip({ label, value, warn }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '6px 10px',
      background: warn && value > 0 ? 'var(--ember-quiet)' : 'var(--stone-75)',
      borderRadius: 'var(--r-2)',
      minWidth: 52,
    }}>
      <span style={{
        fontSize: 17, fontFamily: 'var(--font-serif)', fontWeight: 600, lineHeight: 1,
        color: warn && value > 0 ? 'var(--ember-dark)' : 'var(--ink)',
      }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--slate-soft)', marginTop: 2, textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </span>
    </div>
  )
}

// ---- Section components (module-level) --------------------------------------

function CustomerSetupSection({ ctx }) {
  const { customer, setup } = ctx
  const hasSetup = setup.setupTypeLabel || setup.goal || setup.gasPresent || setup.electricPresent
    || setup.venting || setup.existingNotes || setup.salespersonNotes
  return (
    <div style={{ marginBottom: 4 }}>
      <Row label="Customer" value={customer.name} />
      <Row label="Contact" value={customer.contact} />
      <Row label="Project" value={customer.projectAddress} />
      {setup.setupTypeLabel && <Row label="Setup type" value={setup.setupTypeLabel} />}
      {setup.goal && <Row label="Goal" value={setup.goal} />}
      {setup.desiredOutcomeLabel && <Row label="Desired outcome" value={setup.desiredOutcomeLabel} />}
      {setup.gasPresent && (
        <Row label="Gas line"
          value={setup.gasPresent === 'yes' ? 'Present' : setup.gasPresent === 'no' ? 'Not present' : setup.gasPresent}
        />
      )}
      {setup.electricPresent && (
        <Row label="Electric"
          value={setup.electricPresent === 'yes' ? 'Available' : setup.electricPresent === 'no' ? 'Not available' : setup.electricPresent}
        />
      )}
      {setup.venting && <Row label="Venting" value={setup.venting} />}
      {setup.existingNotes && <Row label="Existing notes" value={setup.existingNotes} />}
      {setup.salespersonNotes && <Row label="Salesperson notes" value={setup.salespersonNotes} />}
      {setup.likelyPath && <Row label="Likely path" value={setup.likelyPath} />}
      {!hasSetup && !customer.name && (
        <p className="body-sm" style={{ color: 'var(--slate-soft)', fontStyle: 'italic' }}>
          No customer or setup data captured yet.
        </p>
      )}
    </div>
  )
}

function QuotePrepStatusSection({ ctx }) {
  const { lineReview, prepNotes } = ctx
  return (
    <div style={{ marginBottom: 4 }}>
      {lineReview.total === 0 ? (
        <p className="body-sm" style={{ color: 'var(--slate-soft)', fontStyle: 'italic' }}>
          No proposed lines yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <CountChip label="Total" value={lineReview.total} />
          <CountChip label="Draft" value={lineReview.draft} />
          <CountChip label="Needs verify" value={lineReview.needsVerification} warn />
          <CountChip label="Ready" value={lineReview.readyForBistrack} />
          <CountChip label="Do not use" value={lineReview.doNotUseYet} warn />
          {lineReview.needsSource > 0 && <CountChip label="Needs source" value={lineReview.needsSource} warn />}
        </div>
      )}
      {prepNotes && (
        <div style={{ marginTop: 6 }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 10 }}>PREP NOTES</span>
          <p className="body-sm" style={{ marginTop: 4, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {prepNotes}
          </p>
        </div>
      )}
    </div>
  )
}

function ruleStatusBadge(status) {
  if (status === 'cleared') return { label: 'CLEARED', cls: 'source source-verified' }
  if (status === 'satisfied') return { label: 'SATISFIED', cls: 'source source-verified' }
  if (status === 'soft-warning') return { label: 'WARN', cls: 'source source-said' }
  if (status === 'triggered') return { label: 'TRIGGERED', cls: 'source source-assumed' }
  return { label: status ? status.toUpperCase() : '', cls: 'source source-manual' }
}

function FieldRulesSection({ ctx }) {
  const { fieldRules } = ctx
  const { counts, items } = fieldRules
  const hasFindings = items.length > 0
  return (
    <div style={{ marginBottom: 4 }}>
      {!hasFindings ? (
        <p className="body-sm" style={{ color: 'var(--slate-soft)', fontStyle: 'italic' }}>
          No field rules triggered.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {counts.triggered > 0 && (
            <p className="body-sm" style={{ color: 'var(--ember)', fontWeight: 600, marginBottom: 4 }}>
              {counts.triggered} blocker{counts.triggered === 1 ? '' : 's'} triggered — resolve before BisTrack.
            </p>
          )}
          {items.map((item) => {
            const badge = ruleStatusBadge(item.status)
            return (
              <div key={item.id} style={{
                padding: '6px 8px',
                background: 'var(--stone-75)',
                borderRadius: 'var(--r-2)',
                borderLeft: item.status === 'triggered' ? '2px solid var(--ember)' : '2px solid var(--stone-300)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: item.reason ? 3 : 0 }}>
                  <span className="body-sm" style={{ fontWeight: 500, color: 'var(--ink)' }}>{item.label}</span>
                  <span className={badge.cls} style={{ fontSize: 10 }}>{badge.label}</span>
                </div>
                {item.reason && (
                  <p className="body-sm" style={{ color: 'var(--slate)', fontSize: 12, marginTop: 2 }}>{item.reason}</p>
                )}
                {item.action && (
                  <p className="body-sm" style={{ color: 'var(--slate-soft)', fontSize: 11, marginTop: 2 }}>
                    Action: {item.action}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GateSection({ ctx }) {
  const { gate } = ctx
  const isReady = gate.status === GATE_STATUS.ready
  const hasBlockers = gate.reasons.length > 0
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          className={isReady ? 'source source-verified' : hasBlockers ? 'source source-assumed' : 'source source-manual'}
          style={{ fontSize: 11 }}
        >
          {gate.label.toUpperCase()}
        </span>
      </div>
      {gate.helper && (
        <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 8 }}>{gate.helper}</p>
      )}
      {gate.reasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gate.reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--ember)', marginTop: 1, flexShrink: 0 }}>·</span>
              <span className="body-sm" style={{ color: 'var(--ink)' }}>{r.message}</span>
              {r.actionLabel && (
                <span className="body-sm" style={{ color: 'var(--slate-soft)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  → {r.actionLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtEventTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return '' }
}

function ActivitySection({ ctx }) {
  const { activity } = ctx
  return (
    <div style={{ marginBottom: 4 }}>
      {activity.length === 0 ? (
        <p className="body-sm" style={{ color: 'var(--slate-soft)', fontStyle: 'italic' }}>No activity recorded.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activity.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--brass)', flexShrink: 0, marginTop: 5,
              }} />
              <div>
                <span className="body-sm" style={{ fontWeight: 500, color: 'var(--ink)' }}>
                  {ev.kindLabel}
                </span>
                {ev.summary && (
                  <span className="body-sm" style={{ color: 'var(--slate)', marginLeft: 6 }}>
                    {ev.summary}
                  </span>
                )}
                <div style={{ fontSize: 11, color: 'var(--slate-soft)', marginTop: 1 }}>
                  {fmtEventTime(ev.at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtDueDate(dueAt) {
  if (!dueAt) return ''
  try {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueAt)
    if (ymd) {
      const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    }
    return new Date(dueAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return dueAt }
}

function FollowUpSection({ ctx }) {
  const { followUp } = ctx
  if (!followUp) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Pill text={followUp.signal && followUp.signal.text} tone={followUp.signal && followUp.signal.tone} />
        <span className="body-sm" style={{ color: 'var(--slate)' }}>{fmtDueDate(followUp.dueAt)}</span>
      </div>
      {followUp.note && (
        <p className="body-sm" style={{ color: 'var(--ink)', marginTop: 4 }}>{followUp.note}</p>
      )}
    </div>
  )
}

function EvidenceNotesSection({ ctx }) {
  const { evidenceNotes } = ctx
  if (!evidenceNotes || evidenceNotes.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {evidenceNotes.map((en) => (
          <div key={en.lineId} style={{
            padding: '8px 10px',
            background: 'var(--stone-75)',
            borderRadius: 'var(--r-2)',
            borderLeft: '2px solid var(--brass)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span className="body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>{en.name}</span>
              <span className="source source-manual" style={{ fontSize: 10 }}>{en.reviewStatusLabel.toUpperCase()}</span>
            </div>
            <p className="body-sm" style={{ color: 'var(--slate)', fontSize: 12, lineHeight: 1.5 }}>{en.evidenceNote}</p>
            <p className="body-sm" style={{ color: 'var(--slate-soft)', fontSize: 11, marginTop: 3 }}>
              Source: {en.sourceBasisLabel}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildContextSummary(ctx) {
  const triggeredBlockers = ctx.fieldRules && ctx.fieldRules.counts
    ? ctx.fieldRules.counts.triggered : 0
  const parts = []
  if (ctx.gate && ctx.gate.label) parts.push(ctx.gate.label)
  if (ctx.lineReview && ctx.lineReview.total > 0) {
    parts.push(`${ctx.lineReview.total} proposed line${ctx.lineReview.total === 1 ? '' : 's'}`)
  }
  if (triggeredBlockers > 0) {
    parts.push(`${triggeredBlockers} field rule blocker${triggeredBlockers === 1 ? '' : 's'} triggered`)
  }
  if (ctx.followUp && ctx.followUp.signal && ctx.followUp.signal.text) {
    parts.push(ctx.followUp.signal.text)
  }
  return parts.join(' · ')
}

// ---- Root component ---------------------------------------------------------

export default function SourceContextPanel({
  ctx,
  onAddToPrepNotes,
  addedToPrepNotes,
  disabled,
}) {
  const [collapsed, setCollapsed] = useState({
    customerSetup: false,
    quotePrepStatus: false,
    fieldRules: false,
    gate: false,
    activity: false,
    followUp: false,
    evidenceNotes: false,
  })

  if (!ctx) return null

  function toggle(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const hasFollowUp = Boolean(ctx.followUp)
  const hasEvidenceNotes = ctx.evidenceNotes && ctx.evidenceNotes.length > 0
  const triggeredBlockers = ctx.fieldRules && ctx.fieldRules.counts
    ? ctx.fieldRules.counts.triggered : 0
  const hasGateBlockers = ctx.gate && ctx.gate.reasons && ctx.gate.reasons.length > 0

  return (
    <div
      style={{
        background: 'var(--stone-75)',
        border: '1px solid var(--stone-200)',
        borderRadius: 'var(--r-3)',
        padding: '14px 16px',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="eyebrow eyebrow-ember" style={{ fontSize: 12 }}>SOURCE CONTEXT · INTERNAL</span>
        <span className="body-sm" style={{ color: 'var(--slate-soft)', fontSize: 11 }}>Read-only · Internal only</span>
      </div>

      <SectionToggle
        isOpen={!collapsed.customerSetup}
        onToggle={() => toggle('customerSetup')}
        label="Customer + Setup"
      >
        <CustomerSetupSection ctx={ctx} />
      </SectionToggle>

      <SectionToggle
        isOpen={!collapsed.quotePrepStatus}
        onToggle={() => toggle('quotePrepStatus')}
        label="Quote Prep Status"
      >
        <QuotePrepStatusSection ctx={ctx} />
      </SectionToggle>

      <SectionToggle
        isOpen={!collapsed.fieldRules}
        onToggle={() => toggle('fieldRules')}
        label="Field Rules"
        accent={triggeredBlockers > 0}
      >
        <FieldRulesSection ctx={ctx} />
      </SectionToggle>

      <SectionToggle
        isOpen={!collapsed.gate}
        onToggle={() => toggle('gate')}
        label="Gate / Next Actions"
        accent={hasGateBlockers}
      >
        <GateSection ctx={ctx} />
      </SectionToggle>

      <SectionToggle
        isOpen={!collapsed.activity}
        onToggle={() => toggle('activity')}
        label="Recent Activity"
      >
        <ActivitySection ctx={ctx} />
      </SectionToggle>

      {hasFollowUp && (
        <SectionToggle
          isOpen={!collapsed.followUp}
          onToggle={() => toggle('followUp')}
          label="Follow-Up Reminder"
          accent={
            ctx.followUp.signal &&
            (ctx.followUp.signal.kind === 'overdue' || ctx.followUp.signal.kind === 'today')
          }
        >
          <FollowUpSection ctx={ctx} />
        </SectionToggle>
      )}

      {hasEvidenceNotes && (
        <SectionToggle
          isOpen={!collapsed.evidenceNotes}
          onToggle={() => toggle('evidenceNotes')}
          label="Line Evidence Notes"
        >
          <EvidenceNotesSection ctx={ctx} />
        </SectionToggle>
      )}

      {onAddToPrepNotes && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--stone-200)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              const summary = buildContextSummary(ctx)
              if (summary) onAddToPrepNotes(summary)
            }}
            disabled={disabled || addedToPrepNotes}
            style={{ fontSize: 12 }}
          >
            {addedToPrepNotes ? 'Added to prep notes ✓' : 'Add context summary to prep notes'}
          </button>
          {!addedToPrepNotes && (
            <span className="body-sm" style={{ color: 'var(--slate-soft)', fontSize: 11 }}>
              Appends a one-line status summary. Does not change line or gate status.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
