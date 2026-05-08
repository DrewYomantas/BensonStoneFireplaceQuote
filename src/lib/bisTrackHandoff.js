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

// ---- Copy-friendly text formatter (Milestone 14) -------------------------
//
// Plain text only. No Markdown tables, no HTML. Built from the same view
// model `projectBisTrackHandoff` returns so we don't grow a second
// projection path. Every emitted line is run through `safe()` so banned
// customer-facing wording cannot leak in.

function line(parts) {
  return parts.map(safe).filter(Boolean).join(' ')
}

// Emit `Label: value` only when value is non-empty after the safe scrub.
function labeled(label, value) {
  const v = safe(value)
  if (!v) return ''
  return `${label} ${v}`
}

function bullet(text) {
  const t = safe(text)
  return t ? `- ${t}` : ''
}

function nonEmpty(arr) {
  return arr.filter((s) => typeof s === 'string' && s.trim().length > 0)
}

export function formatBisTrackHandoffAsText(rawView) {
  const view = rawView && typeof rawView === 'object' ? rawView : null
  const sections = []

  // Header
  const headerLines = [
    safe(view && view.title) || 'Internal BisTrack Handoff',
  ]
  const subtitle = safe(view && view.subtitle)
  if (subtitle) headerLines.push(subtitle)
  const sourceNote = safe(view && view.sourceNote)
  if (sourceNote) headerLines.push(sourceNote)
  sections.push(nonEmpty(headerLines).join('\n'))

  // Customer / project
  if (view && view.customer) {
    const c = view.customer
    const filled = nonEmpty([
      labeled('Name:', c.customerName),
      labeled('Contact:', c.contact),
      labeled('Project:', c.projectAddress),
    ])
    if (filled.length) sections.push(['CUSTOMER', ...filled].join('\n'))
  }

  // Watch-outs
  if (view && Array.isArray(view.warnings) && view.warnings.length > 0) {
    const warns = view.warnings.map(bullet).filter(Boolean)
    if (warns.length) sections.push(['WATCH-OUTS', ...warns].join('\n'))
  }

  // Gate
  if (view && view.gate) {
    const g = view.gate
    const lines = [
      labeled('Status:', g.label),
      labeled('Quote type:', g.quoteType),
      labeled('Verification owner:', g.verificationOwner),
      labeled('Still unverified:', g.unverifiedItems),
      labeled('Next step:', g.nextStep),
    ]
    if (g.counts && (g.counts.total || g.counts.needsVerification || g.counts.readyForBistrack || g.counts.doNotUseYet)) {
      const c = g.counts
      lines.push(line([
        'Counts:',
        `${c.total || 0} total`,
        c.needsVerification ? `· ${c.needsVerification} needs verification` : '',
        c.readyForBistrack ? `· ${c.readyForBistrack} ready for BisTrack` : '',
        c.doNotUseYet ? `· ${c.doNotUseYet} do not use yet` : '',
      ]))
    }
    const filled = nonEmpty(lines)
    if (filled.length) sections.push(['QUOTE PREP GATE', ...filled].join('\n'))
  }

  // Lens facts
  if (view && Array.isArray(view.lensFacts) && view.lensFacts.length > 0) {
    const facts = view.lensFacts
      .map((f) => line([`${f.label}:`, f.value]))
      .filter(Boolean)
    if (facts.length) sections.push(['SETUP + GOAL LENS', ...facts].join('\n'))
  }

  // Proposed line items
  if (view && Array.isArray(view.lineItems) && view.lineItems.length > 0) {
    const blocks = view.lineItems.map((item, idx) => {
      const head = `Line ${idx + 1}: ${safe(item.name) || 'Unnamed'}`
      const meta = [
        item.brand && `Brand: ${safe(item.brand)}`,
        item.partNumber && `Part: ${safe(item.partNumber)}`,
        item.category && `Category: ${safe(item.category)}`,
        item.quantity && `Qty: ${safe(item.quantity)}`,
      ].filter(Boolean).join(' · ')
      const lines = [head]
      if (meta) lines.push(`  ${meta}`)
      if (item.description) lines.push(`  Description: ${safe(item.description)}`)
      if (item.customerSafeNotes) lines.push(`  Notes: ${safe(item.customerSafeNotes)}`)
      if (item.internalPrepNote) lines.push(`  Rep-only: ${safe(item.internalPrepNote)}`)
      lines.push(`  Source basis: ${safe(item.sourceBasisLabel)}`)
      lines.push(`  Review status: ${safe(item.reviewStatusLabel)}`)
      if (Array.isArray(item.reviewFlags) && item.reviewFlags.length > 0) {
        const flags = item.reviewFlags.map(safe).filter(Boolean).join(', ')
        if (flags) lines.push(`  Flags: ${flags}`)
      }
      return nonEmpty(lines).join('\n')
    }).filter(Boolean)
    if (blocks.length) sections.push(['PROPOSED LINE ITEMS', ...blocks].join('\n\n'))
  }

  // Field Rules
  if (view && view.fieldRules && Array.isArray(view.fieldRules.items) && view.fieldRules.items.length > 0) {
    const counts = view.fieldRules.counts || {}
    const summary = line([
      'Counts:',
      counts.triggered ? `${counts.triggered} triggered` : '',
      counts.softWarning ? `· ${counts.softWarning} soft-warning` : '',
      counts.cleared ? `· ${counts.cleared} cleared` : '',
      counts.satisfied ? `· ${counts.satisfied} satisfied` : '',
    ])
    const items = view.fieldRules.items.map((f) => {
      const status = (safe(f.status) || '').toUpperCase()
      const head = `- ${safe(f.label)} [${status}]`
      const reasonLine = f.reason ? `    ${safe(f.reason)}` : ''
      const actionLine = f.action ? `    Action: ${safe(f.action)}` : ''
      return nonEmpty([head, reasonLine, actionLine]).join('\n')
    }).filter(Boolean)
    const lines = nonEmpty([summary, ...items])
    if (lines.length) sections.push(['FIELD RULES', ...lines].join('\n'))
  }

  // Missing / next actions
  if (view && Array.isArray(view.nextActions) && view.nextActions.length > 0) {
    const items = view.nextActions.map((a) => {
      const msg = safe(a.message)
      if (!msg) return ''
      const tag = a.actionLabel ? ` (${safe(a.actionLabel)})` : ''
      return `- ${msg}${tag}`
    }).filter(Boolean)
    if (items.length) sections.push(['MISSING / NEXT ACTIONS', ...items].join('\n'))
  }

  return sections.filter(Boolean).join('\n\n')
}
