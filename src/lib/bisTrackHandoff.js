// BisTrack Handoff (PR 13) — pure projection.
//
// Read-only view model for the internal handoff sheet Drew uses while he
// builds/checks the official quote in BisTrack. Reuses every existing
// helper — projectCustomerFileForDisplay, quotePrepDraftFromCustomerFile,
// evaluateQuotePrepGate, projectQuotePrepGateStatus, evaluateFieldRules.
// No new rule logic, no new state, no customer-facing output.
//
// Every string surfaced by this projection is run through the same banned-
// phrase scrub the gate uses, so customer-facing wording (ready to send /
// proposal ready / customer ready / approved) cannot leak in.

import { isSensitiveKey } from './salesOsStorageSchema.js'
import { projectCustomerFileForDisplay } from './customerFileView.js'
import {
  quotePrepDraftFromCustomerFile,
  buildQuotePrepEngineInput,
  normalizeQuotePrepLine,
  SOURCE_BASIS_LABELS,
  REVIEW_STATUS_LABELS,
  REVIEW_FLAG_LABELS,
} from './quotePrepDraft.js'
import {
  evaluateQuotePrepGate,
  projectQuotePrepGateStatus,
  QUOTE_TYPE_LABELS,
  GATE_STATUS,
} from './quotePrepGate.js'
import { evaluateFieldRules } from './fieldRules.js'
import { SETUP_TYPE_LABELS, DESIRED_OUTCOME_LABELS } from './setupGoalLens.js'

const BANNED_DISPLAY_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value)
  const lower = s.toLowerCase()
  for (const phrase of BANNED_DISPLAY_PHRASES) {
    if (lower.includes(phrase)) return ''
  }
  return s
}

function safeList(values) {
  if (!Array.isArray(values)) return []
  return values.map(safe).filter(Boolean)
}

function pickContact(file) {
  return safe(file && (file.customerPhone || file.customerEmail))
}

function buildCustomerHeader(file) {
  return Object.freeze({
    customerName: safe(file.customerName) || 'Unnamed customer',
    contact: pickContact(file),
    projectAddress: safe(file.projectAddress),
  })
}

function buildLensFacts(file) {
  const setupKey = file.lensSetupType || ''
  const outcomeKey = file.lensDesiredOutcome || ''
  const facts = [
    {
      label: 'Customer goal',
      value: safe(file.customerGoal) || safe(DESIRED_OUTCOME_LABELS[outcomeKey]),
    },
    {
      label: 'Setup type',
      value: setupKey ? safe(SETUP_TYPE_LABELS[setupKey]) || safe(setupKey) : '',
    },
    { label: 'Existing notes', value: safe(file.existingNotes) },
    { label: 'Salesperson notes', value: safe(file.lensSalespersonNotes) },
    { label: 'Goal notes', value: safe(file.goalNotes) },
    { label: 'Likely path', value: safe(file.likelyPath) },
    {
      label: 'Gas line present',
      value: safe(file.lensFuelGasPresent === 'yes' ? 'Yes'
        : file.lensFuelGasPresent === 'no' ? 'No'
        : ''),
    },
    {
      label: 'Electric available',
      value: safe(file.lensFuelElectricPresent === 'yes' ? 'Yes'
        : file.lensFuelElectricPresent === 'no' ? 'No'
        : ''),
    },
    { label: 'Gas type', value: safe(file.lensGasType) },
    { label: 'Venting', value: safe(file.lensVenting) },
  ]
  return facts.filter((f) => f.value).map((f) => Object.freeze({
    label: safe(f.label),
    value: f.value,
  }))
}

function buildLineItems(draft) {
  const lines = Array.isArray(draft && draft.lines) ? draft.lines : []
  return lines.map((raw) => {
    // Re-normalize defensively so we never surface anything outside the
    // safe whitelist (sensitive-key strip already ran, but belt + braces).
    const line = normalizeQuotePrepLine(raw)
    const flagLabels = (line.reviewFlags || [])
      .map((f) => safe(REVIEW_FLAG_LABELS[f]))
      .filter(Boolean)
    return Object.freeze({
      id: safe(line.id),
      name: safe(line.name),
      description: safe(line.description),
      brand: safe(line.brand),
      partNumber: safe(line.partNumber),
      category: safe(line.category),
      quantity: safe(line.quantity),
      customerSafeNotes: safe(line.customerSafeNotes),
      internalPrepNote: safe(line.internalPrepNote),
      sourceBasisLabel: safe(SOURCE_BASIS_LABELS[line.sourceBasis]) || 'Manual entry',
      reviewStatusLabel: safe(REVIEW_STATUS_LABELS[line.reviewStatus]) || 'Draft',
      reviewFlags: Object.freeze(flagLabels),
    })
  })
}

function buildFieldRulesProjection(result) {
  const findings = (result && Array.isArray(result.findings)) ? result.findings : []
  const counts = { triggered: 0, cleared: 0, satisfied: 0, softWarning: 0 }
  const items = findings.map((f) => {
    if (f.status === 'triggered') counts.triggered += 1
    else if (f.status === 'cleared') counts.cleared += 1
    else if (f.status === 'satisfied') counts.satisfied += 1
    else if (f.status === 'soft-warning') counts.softWarning += 1
    return Object.freeze({
      id: safe(f.id),
      label: safe(f.label),
      severity: safe(f.severity),
      status: safe(f.status),
      reason: safe(f.reason),
      action: safe(f.action),
    })
  })
  return Object.freeze({
    version: safe(result && result.version),
    items: Object.freeze(items),
    counts: Object.freeze(counts),
  })
}

function buildNextActions(gate) {
  const reasons = (gate && Array.isArray(gate.reasons)) ? gate.reasons : []
  return reasons
    .map((r) => {
      if (!r) return null
      const message = typeof r === 'string' ? safe(r) : safe(r.message)
      if (!message) return null
      const action = (r && typeof r === 'object' && r.action) ? r.action : null
      return Object.freeze({
        message,
        actionLabel: action && action.label ? safe(action.label) : '',
        actionTarget: action && action.target ? safe(action.target) : '',
        actionField: action && action.field ? safe(action.field) : '',
      })
    })
    .filter(Boolean)
}

function buildGateProjection(file, draft, fieldRulesResult) {
  const evaluated = evaluateQuotePrepGate({ file, draft, fieldRulesResult })
  const display = projectQuotePrepGateStatus(file, {
    fieldRulesResult,
    reasonLimit: 8,
  })
  const fields = evaluated.fields || {}
  return Object.freeze({
    status: evaluated.status,
    label: safe(display.label) || 'Draft prep',
    helper: safe(display.helper),
    counts: evaluated.counts,
    quoteType: safe(QUOTE_TYPE_LABELS[fields.quotePrepQuoteType]) || 'Not yet decided',
    verificationOwner: safe(fields.quotePrepVerificationOwner),
    unverifiedItems: safe(fields.quotePrepUnverifiedItems),
    nextStep: safe(fields.quotePrepNextStep),
  })
}

function buildWarnings(file, gate) {
  const warnings = []
  if (!file.customerName) warnings.push('Customer name not captured.')
  if (!pickContact(file)) warnings.push('No phone or email — follow-up will not be possible.')
  if (gate && gate.counts && gate.counts.doNotUseYet > 0) {
    warnings.push(`${gate.counts.doNotUseYet} line${gate.counts.doNotUseYet === 1 ? '' : 's'} flagged "do not use yet".`)
  }
  if (gate && gate.counts && gate.counts.triggeredBlockers > 0) {
    warnings.push(`${gate.counts.triggeredBlockers} Field Rule blocker${gate.counts.triggeredBlockers === 1 ? '' : 's'} still triggered.`)
  }
  return safeList(warnings)
}

// ---- Public projection -----------------------------------------------------

export function projectBisTrackHandoff(rawFile, options = {}) {
  const file = projectCustomerFileForDisplay(rawFile || {})
  const draft = quotePrepDraftFromCustomerFile(rawFile || {})
  // Field Rules: if a result is supplied, use it; otherwise compute the same
  // way Quote / Prep does so the handoff matches what the rep saw there.
  let fieldRulesResult = options.fieldRulesResult || null
  if (!fieldRulesResult) {
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })
  }

  const gate = buildGateProjection(file, draft, fieldRulesResult)
  const helperLine = gate.status === GATE_STATUS.ready
    ? 'Build and verify the official quote in BisTrack.'
    : 'Internal prep only — BisTrack remains source of truth.'

  const view = {
    title: 'Internal BisTrack Handoff',
    subtitle: safe(helperLine),
    customer: buildCustomerHeader(file),
    gate,
    lensFacts: buildLensFacts(file),
    lineItems: buildLineItems(draft),
    fieldRules: buildFieldRulesProjection(fieldRulesResult),
    nextActions: buildNextActions(evaluateQuotePrepGate({ file, draft, fieldRulesResult })),
    warnings: buildWarnings(file, gate),
    sourceNote: 'BisTrack remains the official quote/order. This sheet is internal prep only.',
  }

  // Defensive sweep: ensure no top-level key looks like a sensitive field.
  for (const k of Object.keys(view)) {
    if (isSensitiveKey(k)) delete view[k]
  }

  return Object.freeze(view)
}
