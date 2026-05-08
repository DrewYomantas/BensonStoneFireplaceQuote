// Field Rules engine — May 2026 (V1).
//
// Pure logic. Consumes a sanitized customer-file projection plus optional
// "discussion" text (free-text fields where products and scope can be
// captured before a full product line model exists), and returns
// deterministic findings the UI can render.
//
// Design rules followed here:
//   - This is a deterministic safety layer, not AI advice. Every finding is
//     derived from explicit text matches and structured Setup + Goal Lens
//     fields, never inferred.
//   - The rule definitions live in src/config/fieldRules.js. This module
//     decides when each rule fires; the wording, severity, and source label
//     come from config so the engine stays stable as wording is revised.
//   - No customer-safe message ever contains cost / margin / supplier / OCR
//     / BisTrack confidence / fuzzy-match language — that is the config's
//     contract, and the engine refuses to publish a customer-safe string
//     that would violate it (see scrubCustomerSafe below).
//   - Engine input is projected through projectFileForFieldRules, which
//     passes through customerFileView's strip + a defensive sensitive-key
//     scrub before any rule logic runs.

import {
  FIELD_RULES,
  FIELD_RULE_IDS,
  FIELD_RULES_VERSION,
  getEnabledFieldRules,
  getFieldRuleById,
} from '../config/fieldRules.js'
import { isSensitiveKey } from './salesOsStorageSchema.js'
import { projectCustomerFileForDisplay } from './customerFileView.js'

// ---- Text-pattern helpers -------------------------------------------------
//
// Discussion text fields can include free-form rep notes. We do not parse
// products from them — we only detect intent so the engine can decide
// whether a rule should fire. Patterns are conservative: prefer false
// negatives over false positives, since the rule wording is what Drew sees.

const EMPIRE_BRAND_PATTERN =
  /\b(empire|white\s*mountain\s*hearth|wmh|american\s*hearth)\b/i

const HARGROVE_PATTERN = /\bhargrove\b/i

const VENT_FREE_LOG_PATTERN =
  /\b(vent[-\s]*free|vf|ventless|unvented)\b[^.]{0,40}\b(log|logs|log\s*set)\b/i

const VENT_FREE_LOG_REVERSE_PATTERN =
  /\b(log|logs|log\s*set)\b[^.]{0,40}\b(vent[-\s]*free|vf|ventless|unvented)\b/i

const GAS_INSERT_PATTERN = /\b(gas\s*insert|gas\s*inserts)\b/i

const MILLIVOLT_PATTERN =
  /\b(millivolt|standing\s*pilot|continuous\s*pilot|continuous[-\s]*pilot)\b/i

const INSTALL_SCOPE_PATTERN =
  /\b(install(ation)?|installer|installed|installing|construct(ion)?|finish\s*work|drywall|stone\s*work|masonry|bump[-\s]*out|chase|framing)\b/i

const ROCKFORD_CITY_PATTERN = /\brockford\b/i

const ROCKFORD_STATE_PATTERN = /\bil\b|\billinois\b/i

// Collect text from any safe customer-file or discussion-text fields.
// Tolerant of additional caller-supplied free text.
function collectDiscussionText(file = {}, extraText = []) {
  const parts = [
    file.existingNotes,
    file.lensSalespersonNotes,
    file.customerPainPoints,
    file.goalNotes,
    file.likelyPath,
    file.heatExpectation,
    file.brochuresSamplesSummary,
    file.guidedPathNotes,
    file.guidedPathCustomerSummary,
    file.handoffNotes,
    file.handoffSummary,
  ]
  if (Array.isArray(extraText)) {
    for (const t of extraText) parts.push(t)
  } else if (extraText) {
    parts.push(String(extraText))
  }
  return parts.filter(Boolean).join(' \n ')
}

function lensIsZcOrPrefab(file = {}) {
  const raw = String(file.lensSetupType || '').toLowerCase()
  return raw === 'zero-clearance-metal-fireplace' ||
         raw === 'new-construction-or-framed-chase'
}

function lensIsMasonry(file = {}) {
  return String(file.lensSetupType || '').toLowerCase() === 'masonry-fireplace'
}

function isRockford(file = {}, extraText = []) {
  const fields = [file.projectAddress, file.invoiceCityStateZip]
  if (Array.isArray(extraText)) fields.push(...extraText)
  else if (extraText) fields.push(String(extraText))
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  return ROCKFORD_CITY_PATTERN.test(text) && ROCKFORD_STATE_PATTERN.test(text)
}

function isIllinoisAnywhere(file = {}, extraText = []) {
  const fields = [file.projectAddress, file.invoiceCityStateZip]
  if (Array.isArray(extraText)) fields.push(...extraText)
  else if (extraText) fields.push(String(extraText))
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  return ROCKFORD_STATE_PATTERN.test(text)
}

// ---- Sensitive-key safety net --------------------------------------------

const SAFE_FIELD_INPUT_KEYS = new Set([
  'id',
  'opportunityId',
  'customerName', 'customerEmail', 'customerPhone',
  'projectAddress', 'invoiceCityStateZip',
  'existingNotes', 'existingApplianceType', 'existingFuelType',
  'customerGoal', 'goalNotes', 'budgetBand', 'customerPainPoints',
  'heatExpectation', 'likelyPath',
  'guidedPathNotes', 'guidedPathCustomerSummary',
  'handoffNotes', 'handoffSummary',
  'brochuresSamplesSummary',
  'lensSetupType', 'lensSetupTypeSource',
  'lensDesiredOutcome', 'lensDesiredOutcomeSource',
  'lensFuelGasPresent', 'lensFuelGasPresentSource',
  'lensFuelElectricPresent', 'lensFuelElectricPresentSource',
  'lensGasType', 'lensGasTypeSource',
  'lensVenting', 'lensVentingSource',
  'lensConstructionFlags', 'lensSalespersonNotes', 'lensUpdatedAt',
  // Acknowledgement state — Field Rule 2.
  'zcGasInsertAcknowledgedAt',
  'zcGasInsertAcknowledgedBy',
])

// Project a customer-file-like input into the strict shape this engine reads.
// Strips internal/sensitive keys defensively, then keeps only the safe input
// keys this engine looks at. Anything else is dropped before rules run.
export function projectFileForFieldRules(file = {}) {
  // First pass: customerFileView's display strip — removes sensitive keys
  // and limits to display-safe fields. Returns a plain object.
  const display = projectCustomerFileForDisplay(file || {})
  const out = {}
  for (const [k, v] of Object.entries({ ...display, ...(file || {}) })) {
    if (isSensitiveKey(k)) continue
    if (!SAFE_FIELD_INPUT_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

// ---- Safety net for customer-safe wording --------------------------------

const CUSTOMER_UNSAFE_TERMS = [
  'cost', 'margin', 'buy price', 'supplier total', 'supplier history',
  'sales rank', 'product rank', 'inventory turn',
  'raw ocr', 'raw pdf', 'private catalog',
  'bistrack confidence', 'fuzzy match confidence', 'ocr confidence',
]

function scrubCustomerSafe(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const lower = text.toLowerCase()
  for (const term of CUSTOMER_UNSAFE_TERMS) {
    if (lower.includes(term)) return null
  }
  return text
}

// Build a finding object from a config rule + status + reason.
function buildFinding(rule, { status, reason, action, internalNote, parts }) {
  return Object.freeze({
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    surfaces: rule.surfaces,
    source: rule.source,
    status,           // 'triggered' | 'cleared' | 'satisfied' | 'soft-warning' | 'inactive'
    reason,           // short internal reason ("ZC + gas insert detected")
    action,           // short action verb ("Acknowledge", "Add Whisper Flex", etc.)
    internalNote: internalNote || rule.internal || null,
    customerSafe: scrubCustomerSafe(rule.customerSafe),
    parts: parts || rule.parts || null,
  })
}

// ---- Rule evaluators ------------------------------------------------------
//
// Each evaluator returns a finding (with status='triggered' | 'soft-warning')
// or null when the rule doesn't apply.

function evaluateWhisperFlex(rule, file, text) {
  if (!rule.enabled) return null
  const empireMatch = EMPIRE_BRAND_PATTERN.test(text)
  const hargroveMatch = HARGROVE_PATTERN.test(text)
  const ventFreeLogMatch =
    VENT_FREE_LOG_PATTERN.test(text) || VENT_FREE_LOG_REVERSE_PATTERN.test(text)
  if (!empireMatch || !ventFreeLogMatch) return null
  // Hargrove-only product: do not warn (already includes flex).
  if (hargroveMatch && !empireMatch) return null
  return buildFinding(rule, {
    status: 'triggered',
    reason: 'Empire / WMH vent-free log set detected without confirmed flex line.',
    action: 'Add Whisper Flex line',
    parts: rule.parts,
  })
}

function evaluateZcAck(rule, file, text) {
  if (!rule.enabled) return null
  const setupIsZc = lensIsZcOrPrefab(file)
  const setupIsMasonry = lensIsMasonry(file)
  const gasInsertMentioned = GAS_INSERT_PATTERN.test(text)
  if (!gasInsertMentioned) return null
  // Masonry + gas insert is the supported path; no acknowledgement needed.
  if (setupIsMasonry) return null
  if (!setupIsZc) return null
  const acknowledged = Boolean(file.zcGasInsertAcknowledgedAt)
  if (acknowledged) {
    return buildFinding(rule, {
      status: 'cleared',
      reason: 'Acknowledgement recorded.',
      action: null,
    })
  }
  return buildFinding(rule, {
    status: 'triggered',
    reason: 'ZC / prefab fireplace + gas insert path detected; customer acknowledgement is required.',
    action: 'Acknowledge with customer',
  })
}

function evaluateRockfordIgnition(rule, file, text) {
  if (!rule.enabled) return null
  const millivoltMatch = MILLIVOLT_PATTERN.test(text)
  if (!millivoltMatch) return null
  if (isRockford(file, [text])) {
    return buildFinding(rule, {
      status: 'triggered',
      reason: 'Rockford project + millivolt / standing-pilot wording detected.',
      action: 'Confirm IPI / on-demand ignition or escalate',
    })
  }
  if (isIllinoisAnywhere(file, [text])) {
    return buildFinding(rule, {
      status: 'soft-warning',
      reason: 'Illinois project + millivolt / standing-pilot wording detected.',
      action: 'Confirm ignition system before finalizing',
    })
  }
  // Outside Illinois: not a hard block; surface a soft warning so reps know
  // to double-check the AHJ.
  return buildFinding(rule, {
    status: 'soft-warning',
    reason: 'Millivolt / standing-pilot wording detected; confirm local ignition rules.',
    action: 'Confirm ignition system before finalizing',
  })
}

function evaluateIrtaxHeader(rule, file, text) {
  if (!rule.enabled) return null
  const installScope = INSTALL_SCOPE_PATTERN.test(text)
  if (!installScope) return null
  return buildFinding(rule, {
    status: 'triggered',
    reason: 'Install scope detected — use IRTAX order header.',
    action: 'Set order header to IRTAX',
  })
}

const EVALUATORS = Object.freeze({
  [FIELD_RULE_IDS.whisperFlex]: evaluateWhisperFlex,
  [FIELD_RULE_IDS.zcGasInsertAck]: evaluateZcAck,
  [FIELD_RULE_IDS.rockfordIgnition]: evaluateRockfordIgnition,
  [FIELD_RULE_IDS.irtaxInstallHeader]: evaluateIrtaxHeader,
})

// ---- Public API -----------------------------------------------------------

// Evaluate the rule set against a customer-file-like input plus optional
// discussion text. Returns { version, findings } where findings is the list
// of triggered / soft-warning / cleared rules in config order.
export function evaluateFieldRules(input = {}, options = {}) {
  const rules = options.rules || getEnabledFieldRules()
  const projected = projectFileForFieldRules(input)
  const text = collectDiscussionText(projected, options.discussionText || [])
  const findings = []
  for (const rule of rules) {
    const evaluator = EVALUATORS[rule.id]
    if (!evaluator) continue
    const finding = evaluator(rule, projected, text)
    if (finding) findings.push(finding)
  }
  return Object.freeze({
    version: FIELD_RULES_VERSION,
    findings: Object.freeze(findings),
  })
}

// Convenience — does this evaluation contain any blocker still triggered?
export function hasUnclearedBlocker(result) {
  if (!result || !Array.isArray(result.findings)) return false
  return result.findings.some(
    (f) => f.severity === 'blocker' && f.status === 'triggered'
  )
}

// Acknowledgement helpers — Field Rule 2 (and any future ack rule).
export function buildZcGasInsertAckPatch(now = new Date(), actor = '') {
  const ts = new Date(now).toISOString()
  return {
    zcGasInsertAcknowledgedAt: ts,
    zcGasInsertAcknowledgedBy: String(actor || '').trim(),
  }
}

export function buildZcGasInsertClearPatch() {
  return {
    zcGasInsertAcknowledgedAt: '',
    zcGasInsertAcknowledgedBy: '',
  }
}

// Re-export the pieces components and tests reach for.
export { FIELD_RULES, FIELD_RULES_VERSION, FIELD_RULE_IDS, getFieldRuleById }
