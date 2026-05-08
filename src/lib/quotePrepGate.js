// Quote Prep Review Gate (PR 10) — pure logic.
//
// Answers one internal question: is this Customer File ready for Drew to
// build/verify the official quote in BisTrack? It does not assess customer
// readiness, pricing, or proposal output. BisTrack remains the source of
// truth for the official quote — this helper only surfaces missing
// assumptions so the next step is honest.
//
// Inputs: a sanitized Customer File, the current Quote / Prep draft (lines
// + notes), and the Field Rules result from the existing engine. Output is
// a stable, presentation-ready view model the screen renders directly.
//
// What this DOES NOT do (intentional):
//   - auto-flip line review flags
//   - block saves
//   - assert pricing or commitment
//   - duplicate Field Rule logic — it consumes the engine's output

import { isSensitiveKey } from './salesOsStorageSchema.js'
import {
  summarizeQuotePrepReview,
  quotePrepDraftFromCustomerFile,
  buildQuotePrepEngineInput,
} from './quotePrepDraft.js'
import { evaluateFieldRules } from './fieldRules.js'

export const QUOTE_TYPE_VALUES = Object.freeze(['unknown', 'planning', 'verified'])
export const QUOTE_TYPE_LABELS = Object.freeze({
  unknown: 'Not yet decided',
  planning: 'Planning / ballpark',
  verified: 'Verified / commitment',
})
export const DEFAULT_QUOTE_TYPE = 'unknown'

export const GATE_FIELD_KEYS = Object.freeze([
  'quotePrepQuoteType',
  'quotePrepVerificationOwner',
  'quotePrepUnverifiedItems',
  'quotePrepNextStep',
  'quotePrepGateUpdatedAt',
])

const GATE_STRING_KEYS = Object.freeze([
  'quotePrepVerificationOwner',
  'quotePrepUnverifiedItems',
  'quotePrepNextStep',
  'quotePrepGateUpdatedAt',
])

const QUOTE_TYPE_SET = new Set(QUOTE_TYPE_VALUES)

export const GATE_STATUS = Object.freeze({
  ready: 'ready',
  needsVerification: 'needs_verification',
  draft: 'draft',
})

// Stable action targets the screen layer maps to navigation/focus behavior.
// Helpers stay pure: they return descriptors only — no functions, no DOM.
export const REASON_ACTION_TARGETS = Object.freeze({
  lens: 'lens',
  addLine: 'quotePrepLine.add',
  reviewLines: 'quotePrepLine.review',
  gateField: 'quotePrepGateField',
  fieldRules: 'fieldRules',
})

const GATE_STATUS_LABELS = Object.freeze({
  ready: 'Ready to build in BisTrack',
  needs_verification: 'Needs verification before BisTrack',
  draft: 'Draft prep',
})

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function normalizeQuoteType(value, fallback = DEFAULT_QUOTE_TYPE) {
  const v = clampString(value).trim()
  if (!v) return fallback
  return QUOTE_TYPE_SET.has(v) ? v : fallback
}

// Strip sensitive keys + whitelist only the gate fields. Everything else is
// dropped — the gate never carries the rest of the customer file forward.
export function normalizeQuotePrepGateFields(input = {}) {
  const out = {}
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input)) {
      if (isSensitiveKey(k)) continue
      if (k === 'quotePrepQuoteType') {
        out.quotePrepQuoteType = normalizeQuoteType(v)
      } else if (GATE_STRING_KEYS.includes(k)) {
        out[k] = clampString(v)
      }
    }
  }
  out.quotePrepQuoteType = out.quotePrepQuoteType || DEFAULT_QUOTE_TYPE
  for (const k of GATE_STRING_KEYS) {
    if (out[k] === undefined) out[k] = ''
  }
  return out
}

export function quotePrepGateDraftFromCustomerFile(file) {
  return normalizeQuotePrepGateFields(file || {})
}

// Build a customer-file patch for the durable update path. The
// `quotePrepGateUpdatedAt` stamp is taken from `now` so tests stay
// deterministic; persistence routes through the same Customer File durable
// helpers as the rest of Quote / Prep.
export function buildCustomerFilePatchFromQuotePrepGate(draft = {}, now = new Date()) {
  const safe = normalizeQuotePrepGateFields(draft)
  return {
    quotePrepQuoteType: safe.quotePrepQuoteType,
    quotePrepVerificationOwner: safe.quotePrepVerificationOwner,
    quotePrepUnverifiedItems: safe.quotePrepUnverifiedItems,
    quotePrepNextStep: safe.quotePrepNextStep,
    quotePrepGateUpdatedAt: new Date(now).toISOString(),
  }
}

function pickContact(file) {
  return clampString(file && (file.customerPhone || file.customerEmail))
}

function row(id, label, status, detail) {
  return Object.freeze({ id, label, status, detail: detail || '' })
}

// Build the grouped checklist + headline status. Pure; the screen renders
// the result directly.
export function evaluateQuotePrepGate(input = {}) {
  const file = input.file && typeof input.file === 'object' ? input.file : {}
  const draft = input.draft && typeof input.draft === 'object' ? input.draft : {}
  const fieldRulesResult = input.fieldRulesResult || null
  const gateFields = normalizeQuotePrepGateFields(file)

  const summary = summarizeQuotePrepReview(draft.lines || [])

  // Group A — customer + project context.
  const contextRows = [
    row(
      'customer-name',
      'Customer name captured',
      file.customerName ? 'complete' : 'missing',
      file.customerName ? '' : 'No customer name on file.',
    ),
    row(
      'primary-contact',
      'Primary contact captured',
      pickContact(file) ? 'complete' : 'missing',
      pickContact(file) ? '' : 'No phone or email — follow-up will not be possible.',
    ),
    row(
      'project-location',
      'Project address / location',
      file.projectAddress ? 'complete' : 'warning',
      file.projectAddress ? '' : 'No project address yet — confirm before BisTrack if applicable.',
    ),
    row(
      'customer-goal',
      'Customer goal captured',
      file.customerGoal || file.goalNotes ? 'complete' : 'missing',
      file.customerGoal || file.goalNotes ? '' : 'Capture the customer goal in Setup + Goal Lens.',
    ),
  ]

  // Group B — setup + assumptions.
  const setupKnown = Boolean(file.lensSetupType)
  const fuelKnown = Boolean(file.lensFuelGasPresent || file.lensFuelElectricPresent)
  const assumptionsRows = [
    row(
      'setup-type',
      'Setup type captured',
      setupKnown && file.lensSetupType !== 'unknown' ? 'complete'
        : file.lensSetupType === 'unknown' ? 'warning'
        : 'missing',
      setupKnown
        ? (file.lensSetupType === 'unknown' ? 'Marked unknown — note the gap below.' : '')
        : 'Open Setup + Goal Lens and pick a setup type.',
    ),
    row(
      'fuel-clues',
      'Fuel / path clues captured',
      fuelKnown ? 'complete' : 'warning',
      fuelKnown ? '' : 'Lens has no fuel-presence answers yet.',
    ),
    row(
      'unverified-items',
      'Unverified items noted',
      gateFields.quotePrepUnverifiedItems ? 'complete' : 'warning',
      gateFields.quotePrepUnverifiedItems ? '' : 'List anything still unverified so the next step is honest.',
    ),
  ]

  // Group C — quote prep lines.
  const hasLines = summary.total > 0
  const allDoNotUse = hasLines && summary.doNotUseYet === summary.total
  const everyLineHasBasis = (draft.lines || []).every(
    (line) => line && line.sourceBasis && line.sourceBasis !== '' && line.sourceBasis !== 'needs_source',
  )
  const lineRows = [
    row(
      'has-lines',
      'At least one proposed line item',
      hasLines ? 'complete' : 'missing',
      hasLines ? '' : 'Add a proposed line item.',
    ),
    row(
      'every-line-source',
      'Every line has a source basis',
      !hasLines ? 'missing'
        : summary.needsSource > 0 ? 'warning'
        : everyLineHasBasis ? 'complete' : 'warning',
      summary.needsSource > 0
        ? `${summary.needsSource} line${summary.needsSource === 1 ? '' : 's'} marked "needs source".`
        : '',
    ),
    row(
      'do-not-use',
      'No line marked "do not use yet"',
      summary.doNotUseYet > 0 ? 'warning' : 'complete',
      summary.doNotUseYet > 0
        ? `${summary.doNotUseYet} line${summary.doNotUseYet === 1 ? '' : 's'} flagged "do not use yet".`
        : '',
    ),
    row(
      'needs-verification',
      'Lines needing verification',
      summary.needsVerification > 0 ? 'warning' : 'complete',
      summary.needsVerification > 0
        ? `${summary.needsVerification} line${summary.needsVerification === 1 ? '' : 's'} still need verification.`
        : '',
    ),
    row(
      'ready-for-bistrack',
      'Lines ready for BisTrack',
      hasLines && summary.readyForBistrack > 0 ? 'complete' : 'warning',
      hasLines
        ? `${summary.readyForBistrack} of ${summary.total} marked ready for BisTrack.`
        : '',
    ),
  ]

  // Group D — field rules.
  const findings = (fieldRulesResult && Array.isArray(fieldRulesResult.findings))
    ? fieldRulesResult.findings
    : []
  const triggeredBlockers = findings.filter(
    (f) => f.severity === 'blocker' && f.status === 'triggered',
  ).length
  const triggeredChecklist = findings.filter(
    (f) => f.severity !== 'blocker' && f.status === 'triggered',
  ).length
  const fieldRulesRows = [
    row(
      'blockers',
      'No triggered Field Rule blockers',
      triggeredBlockers === 0 ? 'complete' : 'missing',
      triggeredBlockers === 0
        ? ''
        : `${triggeredBlockers} blocker${triggeredBlockers === 1 ? '' : 's'} triggered — resolve before BisTrack.`,
    ),
    row(
      'checklist',
      'Field Rule checklist items resolved',
      triggeredChecklist === 0 ? 'complete' : 'warning',
      triggeredChecklist === 0
        ? ''
        : `${triggeredChecklist} checklist item${triggeredChecklist === 1 ? '' : 's'} still open.`,
    ),
  ]

  // Group E — handoff / next step.
  const handoffRows = [
    row(
      'quote-type',
      'Quote type selected',
      gateFields.quotePrepQuoteType === 'unknown' ? 'missing' : 'complete',
      gateFields.quotePrepQuoteType === 'unknown'
        ? 'Pick planning/ballpark or verified/commitment.'
        : `Marked ${QUOTE_TYPE_LABELS[gateFields.quotePrepQuoteType]}.`,
    ),
    row(
      'verification-owner',
      'Verification owner',
      gateFields.quotePrepVerificationOwner ? 'complete' : 'warning',
      gateFields.quotePrepVerificationOwner
        ? ''
        : 'Note who needs to verify next.',
    ),
    row(
      'next-step',
      'Next step / follow-up',
      gateFields.quotePrepNextStep ? 'complete' : 'warning',
      gateFields.quotePrepNextStep ? '' : 'Capture the next concrete action.',
    ),
  ]

  const groups = [
    { id: 'context', label: 'Customer + project context', rows: contextRows },
    { id: 'setup', label: 'Setup + assumptions', rows: assumptionsRows },
    { id: 'lines', label: 'Quote prep lines', rows: lineRows },
    { id: 'field-rules', label: 'Field Rules', rows: fieldRulesRows },
    { id: 'handoff', label: 'Handoff / next step', rows: handoffRows },
  ]

  // Status decision. "Ready" requires that the must-have rows are complete
  // AND no Field Rule blocker is triggered AND there is at least one line
  // marked ready for BisTrack AND no line is do-not-use AND quote type is
  // chosen. Otherwise: "needs verification" if there's something to act on,
  // "draft" if Quote / Prep is essentially empty.
  const requiredComplete =
    file.customerName &&
    pickContact(file) &&
    (file.customerGoal || file.goalNotes) &&
    setupKnown && file.lensSetupType !== 'unknown'

  const reason = (message, action) => Object.freeze({ message, action: action || null })

  const reasons = []
  let status
  if (!hasLines) {
    status = GATE_STATUS.draft
    reasons.push(reason(
      'No proposed line items yet.',
      { label: 'Add line item', target: REASON_ACTION_TARGETS.addLine },
    ))
  } else if (
    requiredComplete &&
    triggeredBlockers === 0 &&
    !allDoNotUse &&
    summary.doNotUseYet === 0 &&
    summary.readyForBistrack > 0 &&
    gateFields.quotePrepQuoteType !== 'unknown'
  ) {
    status = GATE_STATUS.ready
  } else {
    status = GATE_STATUS.needsVerification
    if (!file.customerName) reasons.push(reason('Customer name not captured.'))
    if (!pickContact(file)) reasons.push(reason('Primary contact not captured.'))
    if (!(file.customerGoal || file.goalNotes)) reasons.push(reason(
      'Customer goal not captured.',
      { label: 'Open Setup + Goal Lens', target: REASON_ACTION_TARGETS.lens },
    ))
    if (!setupKnown || file.lensSetupType === 'unknown') reasons.push(reason(
      'Setup type not captured.',
      { label: 'Open Setup + Goal Lens', target: REASON_ACTION_TARGETS.lens },
    ))
    if (triggeredBlockers > 0) reasons.push(reason(
      'Field Rule blocker still triggered.',
      { label: 'Review Field Rules', target: REASON_ACTION_TARGETS.fieldRules },
    ))
    if (summary.doNotUseYet > 0) reasons.push(reason(
      'A line is marked "do not use yet".',
      { label: 'Review proposed lines', target: REASON_ACTION_TARGETS.reviewLines },
    ))
    if (summary.readyForBistrack === 0) reasons.push(reason(
      'No line is marked ready for BisTrack yet.',
      { label: 'Review proposed lines', target: REASON_ACTION_TARGETS.reviewLines },
    ))
    if (gateFields.quotePrepQuoteType === 'unknown') reasons.push(reason(
      'Quote type not selected.',
      {
        label: 'Set quote type',
        target: REASON_ACTION_TARGETS.gateField,
        field: 'quotePrepQuoteType',
      },
    ))
    if (summary.needsVerification > 0) reasons.push(reason(
      'Some lines still need verification.',
      { label: 'Review proposed lines', target: REASON_ACTION_TARGETS.reviewLines },
    ))
  }

  return Object.freeze({
    status,
    label: GATE_STATUS_LABELS[status] || GATE_STATUS_LABELS.draft,
    groups,
    counts: Object.freeze({
      total: summary.total,
      needsVerification: summary.needsVerification,
      readyForBistrack: summary.readyForBistrack,
      doNotUseYet: summary.doNotUseYet,
      triggeredBlockers,
      triggeredChecklist,
    }),
    reasons: Object.freeze(reasons),
    fields: Object.freeze(gateFields),
  })
}

// Banned phrases — these must never appear in any string surfaced through
// the gate display. The gate's label set deliberately uses
// "Ready to build in BisTrack" so customer-facing language can't leak in.
const BANNED_DISPLAY_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

function safeDisplayString(value) {
  if (value === undefined || value === null) return ''
  const s = String(value)
  const lower = s.toLowerCase()
  for (const phrase of BANNED_DISPLAY_PHRASES) {
    if (lower.includes(phrase)) return ''
  }
  return s
}

// Small read-only projection for surfaces outside Quote / Prep (e.g.
// Customer File detail). Computes the same gate result the Quote / Prep
// screen would, then returns a compact display shape. No durable writes,
// no rule logic duplicated, no sensitive keys surfaced.
export function projectQuotePrepGateStatus(file, options = {}) {
  const safeFile = file && typeof file === 'object' ? file : {}
  const draft = quotePrepDraftFromCustomerFile(safeFile)
  // Field Rules result: callers may pass one in (when they already evaluated
  // it for FieldRulesCard), otherwise compute the same way Quote / Prep does
  // so the answer matches what the rep sees on Quote / Prep.
  let fieldRulesResult = options.fieldRulesResult || null
  if (!fieldRulesResult) {
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(safeFile, draft)
    fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })
  }
  const gate = evaluateQuotePrepGate({ file: safeFile, draft, fieldRulesResult })
  const reasonCap = Number.isFinite(options.reasonLimit) ? options.reasonLimit : 2
  const cappedReasons = (gate.reasons || [])
    .map((r) => {
      if (!r) return null
      // Backwards tolerant: if a reason ever comes through as a plain
      // string, wrap it. New shape is { message, action }.
      if (typeof r === 'string') {
        const message = safeDisplayString(r)
        return message ? Object.freeze({ message, action: null }) : null
      }
      const message = safeDisplayString(r.message)
      if (!message) return null
      let action = null
      if (r.action && typeof r.action === 'object') {
        const label = safeDisplayString(r.action.label)
        const target = safeDisplayString(r.action.target)
        if (label && target) {
          action = Object.freeze({
            label,
            target,
            field: safeDisplayString(r.action.field) || null,
          })
        }
      }
      return Object.freeze({ message, action })
    })
    .filter(Boolean)
    .slice(0, Math.max(0, reasonCap))

  let helper
  if (gate.counts.total === 0) {
    helper = 'Open Quote / Prep to start the prep workbench.'
  } else if (gate.status === GATE_STATUS.ready) {
    helper = 'Build and verify the official quote in BisTrack.'
  } else {
    helper = 'BisTrack remains source of truth — this is internal prep.'
  }

  return Object.freeze({
    status: gate.status,
    label: safeDisplayString(gate.label) || 'Draft prep',
    helper: safeDisplayString(helper),
    hasLines: gate.counts.total > 0,
    counts: gate.counts,
    reasons: Object.freeze(cappedReasons),
  })
}
