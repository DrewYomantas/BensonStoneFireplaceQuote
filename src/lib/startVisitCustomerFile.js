// Start Visit → Customer File draft builder.
//
// Pure helper. Converts a Start Visit seed (the small set of fields a rep can
// capture in seconds when a walk-in arrives) into a safe customer-file draft
// compatible with saveCustomerFileDurable / createCustomerFileDurable.
//
// Design-safe by intent: the helper produces data shape, deterministic warnings,
// a next-best-move hint, and a lightweight visit status. It does NOT decide UI
// copy, layout, or any customer-facing rendering — Claude Design owns that.
//
// Boundaries:
// - Sensitive keys (cost, margin, buy price, supplier history, raw OCR,
//   BisTrack confidence, etc.) are stripped from the seed before mapping.
// - Unknown enum values fall back to 'unknown' rather than guessing.
// - Output customer-file fields go through sanitizeCustomerFile so unknown
//   columns never reach storage.

import { createEmptyCustomerFile, sanitizeCustomerFile } from './customerFile.js'
import { isSensitiveKey } from './salesOsStorageSchema.js'

// Whitelist of Customer File fields that a Start Visit submit is allowed to
// write into an existing record. Everything else — and especially every
// lens-prefixed field — is preserved from the existing record on re-submit.
// Keep this list narrow: Start Visit captures contact and a one-line scope
// note, nothing else.
export const START_VISIT_MERGE_FIELDS = Object.freeze([
  'customerName',
  'customerPhone',
  'customerEmail',
  'projectAddress',
  'existingNotes',
  'customerGoal',
  'goalNotes',
  'visitedAt',
])

export const VISIT_TYPES = Object.freeze([
  'walk-in',
  'phone',
  'old-quote',
  'referral',
  'follow-up',
  'unknown',
])

export const CUSTOMER_GOALS = Object.freeze([
  'more-heat',
  'less-mess',
  'update-look',
  'easier-operation',
  'replace-existing',
  'explore-options',
  'unknown',
])

export const VISIT_STATUSES = Object.freeze([
  'draft',
  'visit-started',
])

function cleanString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function pickEnum(value, allowed, fallback = 'unknown') {
  const v = cleanString(value).toLowerCase()
  return allowed.includes(v) ? v : fallback
}

function stripSensitive(seed) {
  if (!seed || typeof seed !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(seed)) {
    if (isSensitiveKey(k)) continue
    out[k] = v
  }
  return out
}

// Normalize a raw seed into a known shape. Values that are missing or unusable
// land as '' or 'unknown' rather than throwing.
export function normalizeStartVisitSeed(rawSeed = {}) {
  const seed = stripSensitive(rawSeed)
  return {
    customerName: cleanString(seed.customerName),
    customerPhone: cleanString(seed.customerPhone ?? seed.phone),
    customerEmail: cleanString(seed.customerEmail ?? seed.email),
    projectAddress: cleanString(
      seed.projectAddress ?? seed.address ?? seed.projectLocation,
    ),
    visitType: pickEnum(seed.visitType ?? seed.visitSource ?? seed.source, VISIT_TYPES),
    customerGoal: pickEnum(seed.customerGoal ?? seed.goal, CUSTOMER_GOALS),
    currentSetupNote: cleanString(seed.currentSetupNote ?? seed.currentSetup),
    salespersonNotes: cleanString(seed.salespersonNotes ?? seed.repNotes),
  }
}

// Deterministic internal warnings. These are rep-only signals — never
// customer-facing. Order is stable so callers can render predictably.
export function deriveStartVisitWarnings(normalizedSeed) {
  const warnings = []
  const hasPhone = Boolean(normalizedSeed.customerPhone)
  const hasEmail = Boolean(normalizedSeed.customerEmail)
  if (!normalizedSeed.customerName) {
    warnings.push({ code: 'missing-customer-name', message: 'No customer name captured.' })
  }
  if (!hasPhone && !hasEmail) {
    warnings.push({ code: 'missing-contact', message: 'No phone or email — follow-up will not be possible.' })
  }
  if (!normalizedSeed.currentSetupNote) {
    warnings.push({ code: 'missing-current-setup', message: 'Current setup not captured.' })
  }
  if (normalizedSeed.customerGoal === 'unknown') {
    warnings.push({ code: 'unclear-goal', message: 'Customer goal not captured.' })
  }
  if (normalizedSeed.visitType === 'unknown') {
    warnings.push({ code: 'unknown-visit-type', message: 'Visit type not captured.' })
  }
  return warnings
}

// Pick the single most useful next move based on what is missing. Internal-only.
// Returns { code, label } where label is rep-facing shorthand, not final UI copy.
export function deriveNextBestMove(normalizedSeed) {
  if (!normalizedSeed.customerName) {
    return { code: 'capture-name', label: 'Capture customer name.' }
  }
  if (!normalizedSeed.customerPhone && !normalizedSeed.customerEmail) {
    return { code: 'capture-contact', label: 'Capture phone or email.' }
  }
  if (normalizedSeed.customerGoal === 'unknown') {
    return { code: 'capture-goal', label: 'Ask what the customer wants from this fireplace.' }
  }
  if (!normalizedSeed.currentSetupNote) {
    return { code: 'capture-current-setup', label: 'Note current fireplace setup.' }
  }
  return { code: 'open-setup-goal-lens', label: 'Open Setup + Goal Lens.' }
}

function deriveStatus(normalizedSeed) {
  if (!normalizedSeed.customerName) return 'draft'
  return 'visit-started'
}

function composeNotesFromSeed(normalizedSeed) {
  const lines = []
  if (normalizedSeed.visitType && normalizedSeed.visitType !== 'unknown') {
    lines.push(`Visit type: ${normalizedSeed.visitType}`)
  }
  if (normalizedSeed.salespersonNotes) {
    lines.push(normalizedSeed.salespersonNotes)
  }
  return lines.join('\n')
}

// Build a customer-file draft (sanitized shape, ready for
// saveCustomerFileDurable). The draft is design-safe: only known customer-file
// keys are populated, and sensitive seed keys never reach the storage layer.
export function buildStartVisitCustomerFile(rawSeed = {}, now = new Date()) {
  const seed = normalizeStartVisitSeed(rawSeed)
  const warnings = deriveStartVisitWarnings(seed)
  const nextBestMove = deriveNextBestMove(seed)
  const status = deriveStatus(seed)

  const customerFile = createEmptyCustomerFile({
    customerName: seed.customerName,
    customerPhone: seed.customerPhone,
    customerEmail: seed.customerEmail,
    projectAddress: seed.projectAddress,
    existingNotes: seed.currentSetupNote,
    customerGoal: seed.customerGoal === 'unknown' ? '' : seed.customerGoal,
    goalNotes: composeNotesFromSeed(seed),
    visitedAt: new Date(now).toISOString(),
  }, now)

  // Defense in depth: sanitize again so absolutely nothing extra leaks.
  const draft = sanitizeCustomerFile(customerFile)

  return {
    draft,
    seed,
    warnings,
    nextBestMove,
    status,
    visitType: seed.visitType,
    customerGoal: seed.customerGoal,
  }
}

// Merge a Start Visit-built customer file into an existing one without
// erasing meaningful fields. Used when a rep re-submits Start Visit for a
// customer who already has a Customer File (typically same name + phone, so
// the deterministic id collides).
//
// Rules:
// - Only fields in START_VISIT_MERGE_FIELDS are eligible to be overwritten.
// - An incoming string only overwrites if it has non-whitespace content and
//   is not the literal 'unknown'. This means a blank field on a re-submit
//   never erases a real value the rep already captured.
// - Every lens-prefixed field, every array, and every other column is
//   preserved verbatim from the existing record.
// - The output passes through sanitizeCustomerFile so the schema stays
//   honest and any sensitive keys (which sanitize already strips) cannot
//   sneak in via a malformed seed.
export function mergeStartVisitIntoCustomerFile(existingFile = {}, startVisitFile = {}) {
  const existingSafe = sanitizeCustomerFile(existingFile)
  const incomingSafe = sanitizeCustomerFile(startVisitFile)
  const merged = { ...existingSafe }

  for (const key of START_VISIT_MERGE_FIELDS) {
    const value = incomingSafe[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase() === 'unknown') continue
    merged[key] = value
  }

  // Preserve id / createdAt from the existing record. If the existing record
  // was malformed and lacked them, fall through to the incoming values so
  // the save layer still has something to work with.
  merged.id = existingSafe.id || incomingSafe.id
  merged.createdAt = existingSafe.createdAt || incomingSafe.createdAt

  return sanitizeCustomerFile(merged)
}
