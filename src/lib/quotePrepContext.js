// Quote Prep Source Context (Milestone 16) — pure projection.
//
// Builds the internal-only Smart Context view model displayed in the Source
// Context drawer on Quote / Prep. Read-only: no mutations, no durable writes,
// no customer-facing output. Every surfaced string is run through the same
// banned-phrase / sensitive-key scrub used elsewhere in the gate / handoff /
// activity projections.
//
// Inputs (all pre-loaded by the caller — no storage access here):
//   rawFile       — raw Customer File row (will be projected through display strip)
//   rawActivity   — raw activity event array (already loaded for the file)
//   rawFollowUp   — raw follow-up record or null
//   options       — { now: Date, activityLimit: number }
//
// Output: a frozen view model the SourceContextPanel renders directly.

import { projectCustomerFileForDisplay } from './customerFileView.js'
import {
  quotePrepDraftFromCustomerFile,
  buildQuotePrepEngineInput,
  summarizeQuotePrepReview,
  normalizeQuotePrepLine,
  SOURCE_BASIS_LABELS,
  REVIEW_STATUS_LABELS,
} from './quotePrepDraft.js'
import { evaluateFieldRules } from './fieldRules.js'
import { projectQuotePrepGateStatus } from './quotePrepGate.js'
import {
  normalizeActivityEvents,
  projectActivityForFile,
  normalizeFollowUp,
  describeFollowUp,
  ACTIVITY_KIND_LABELS,
} from './visitActivity.js'
import { SETUP_TYPE_LABELS, DESIRED_OUTCOME_LABELS } from './setupGoalLens.js'

// ---- Scrub helpers ----------------------------------------------------------

const BANNED_DISPLAY_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

const SENSITIVE_TEXT_TERMS = [
  'cost', 'buy price', 'average cost', 'margin', 'margin %',
  'supplier total', 'supplier history', 'inventory turn',
  'product rank', 'sales rank', 'sales performance',
  'raw ocr', 'raw pdf', 'private catalog', 'private path',
  'ocr confidence', 'fuzzy confidence', 'bistrack confidence',
]

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value)
  const lower = s.toLowerCase()
  for (const phrase of BANNED_DISPLAY_PHRASES) {
    if (lower.includes(phrase)) return ''
  }
  for (const term of SENSITIVE_TEXT_TERMS) {
    if (lower.includes(term)) return ''
  }
  return s
}

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

// ---- Section builders -------------------------------------------------------

function buildCustomerSection(file) {
  const contact = safe(file.customerPhone || file.customerEmail)
  return Object.freeze({
    name: safe(file.customerName) || '',
    contact,
    projectAddress: safe(file.projectAddress) || '',
  })
}

function buildSetupSection(file) {
  const setupKey = clampString(file.lensSetupType)
  const outcomeKey = clampString(file.lensDesiredOutcome)
  return Object.freeze({
    setupTypeLabel: safe(SETUP_TYPE_LABELS[setupKey]) || '',
    desiredOutcomeLabel: safe(DESIRED_OUTCOME_LABELS[outcomeKey]) || '',
    goal: safe(file.customerGoal) || safe(file.goalNotes) || '',
    gasPresent: clampString(file.lensFuelGasPresent),
    electricPresent: clampString(file.lensFuelElectricPresent),
    venting: safe(file.lensVenting) || '',
    salespersonNotes: safe(file.lensSalespersonNotes) || '',
    existingNotes: safe(file.existingNotes) || '',
    likelyPath: safe(file.likelyPath) || '',
  })
}

function buildLineReviewSection(draft) {
  const summary = summarizeQuotePrepReview(draft.lines || [])
  return Object.freeze({
    total: summary.total,
    draft: summary.draft,
    needsVerification: summary.needsVerification,
    readyForBistrack: summary.readyForBistrack,
    doNotUseYet: summary.doNotUseYet,
    reviewedForPrep: summary.reviewedForPrep,
    needsSource: summary.needsSource,
  })
}

function buildFieldRulesSection(fieldRulesResult) {
  const findings = (fieldRulesResult && Array.isArray(fieldRulesResult.findings))
    ? fieldRulesResult.findings : []
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
    version: safe(fieldRulesResult && fieldRulesResult.version),
    counts: Object.freeze(counts),
    items: Object.freeze(items),
  })
}

function buildGateSection(file, draft, fieldRulesResult) {
  const status = projectQuotePrepGateStatus(file, {
    fieldRulesResult,
    reasonLimit: 6,
  })
  return Object.freeze({
    status: status.status,
    label: safe(status.label) || 'Draft prep',
    helper: safe(status.helper) || '',
    counts: status.counts,
    reasons: Object.freeze(
      (status.reasons || []).map((r) => {
        if (!r) return null
        const message = typeof r === 'string' ? safe(r) : safe(r.message)
        if (!message) return null
        const action = (r && typeof r === 'object' && r.action) ? r.action : null
        return Object.freeze({
          message,
          actionLabel: action && action.label ? safe(action.label) : '',
          actionTarget: action && action.target ? safe(action.target) : '',
        })
      }).filter(Boolean),
    ),
  })
}

function buildActivitySection(rawActivity, fileId, limit) {
  const allNorm = normalizeActivityEvents(Array.isArray(rawActivity) ? rawActivity : [])
  const events = projectActivityForFile(allNorm, fileId, { limit })
  return Object.freeze(
    events.map((ev) => Object.freeze({
      id: ev.id,
      at: ev.at,
      kind: ev.kind,
      kindLabel: safe(ACTIVITY_KIND_LABELS[ev.kind]) || ev.kind,
      summary: safe(ev.summary),
    })),
  )
}

function buildFollowUpSection(rawFollowUp, now) {
  const norm = normalizeFollowUp(rawFollowUp || {}, now)
  if (!norm) return null
  const signal = describeFollowUp(norm, now)
  return Object.freeze({
    dueAt: norm.dueAt,
    note: safe(norm.note) || '',
    signal: Object.freeze({ kind: signal.kind, text: signal.text, tone: signal.tone }),
  })
}

// Build line evidence notes — only lines with a non-empty, safe evidenceNote.
function buildEvidenceNotesSection(draft) {
  const lines = Array.isArray(draft && draft.lines) ? draft.lines : []
  const out = []
  for (const raw of lines) {
    const line = normalizeQuotePrepLine(raw)
    const note = safe(clampString(line.evidenceNote).trim())
    if (!note) continue
    out.push(Object.freeze({
      lineId: line.id,
      name: safe(line.name) || '',
      sourceBasisLabel: safe(SOURCE_BASIS_LABELS[line.sourceBasis]) || 'Manual entry',
      reviewStatusLabel: safe(REVIEW_STATUS_LABELS[line.reviewStatus]) || 'Draft',
      evidenceNote: note,
    }))
  }
  return Object.freeze(out)
}

// ---- Public API -------------------------------------------------------------

export function buildQuotePrepContext(rawFile, rawActivity, rawFollowUp, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date()
  const activityLimit = Number.isFinite(options.activityLimit) && options.activityLimit > 0
    ? options.activityLimit : 6

  const file = projectCustomerFileForDisplay(rawFile || {})
  const draft = quotePrepDraftFromCustomerFile(rawFile || {})
  const fileId = clampString(file.id)

  const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
  const fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })

  const context = Object.freeze({
    customer: buildCustomerSection(file),
    setup: buildSetupSection(file),
    lineReview: buildLineReviewSection(draft),
    fieldRules: buildFieldRulesSection(fieldRulesResult),
    gate: buildGateSection(file, draft, fieldRulesResult),
    activity: buildActivitySection(rawActivity, fileId, activityLimit),
    followUp: buildFollowUpSection(rawFollowUp, now),
    evidenceNotes: buildEvidenceNotesSection(draft),
    prepNotes: safe(clampString(draft.notes)),
  })
  return context
}
