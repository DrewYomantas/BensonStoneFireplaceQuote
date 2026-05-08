// Quote / Prep workspace (PR 8) — pure logic.
//
// This is the prep/review layer attached to a Customer File. BisTrack remains
// the source of truth for quotes; this helper only normalizes the rep-only
// proposed line items, prep notes, and the searchable text the Field Rules
// engine consumes. No customer-facing output, no pricing, no cost/margin.
//
// Sensitive keys (cost / margin / buy price / supplier total / raw OCR / raw
// PDF / sales rank / product rank / BisTrack confidence / fuzzy match
// confidence / OCR confidence) are stripped at every helper boundary. The
// whitelist below is the only safe shape a quote prep line is allowed to
// carry.

import { isSensitiveKey } from './salesOsStorageSchema.js'

export const LINE_SAFE_KEYS = Object.freeze([
  'id',
  'name',
  'description',
  'brand',
  'partNumber',
  'category',
  'quantity',
  'customerSafeNotes',
  'internalPrepNote',
  // PR 9 — source basis + review state. Internal-only, never customer-facing.
  'sourceBasis',
  'sourceNote',
  'reviewStatus',
  'reviewFlags',
  'reviewedAt',
  'reviewedBy',
])

const LINE_SAFE_KEY_SET = new Set(LINE_SAFE_KEYS)

// Where the rep traced this line back to. The default for a fresh hand-typed
// line is `manual_entry`; `needs_source` is the explicit "I don't know yet"
// state so the summary can flag it.
export const SOURCE_BASIS_VALUES = Object.freeze([
  'manual_entry',
  'from_lens',
  'from_bistrack_quote',
  'from_customer_notes',
  'from_photo_or_measurement',
  'from_pricebook_or_manual',
  'needs_source',
])

export const SOURCE_BASIS_LABELS = Object.freeze({
  manual_entry: 'Manual entry',
  from_lens: 'From Setup + Goal Lens',
  from_bistrack_quote: 'From BisTrack quote',
  from_customer_notes: 'From customer notes',
  from_photo_or_measurement: 'From photo / measurement',
  from_pricebook_or_manual: 'From price list / manual',
  needs_source: 'Needs source',
})

export const DEFAULT_SOURCE_BASIS = 'manual_entry'

// How confident the rep is that this line should leave Quote / Prep. None of
// these mean the proposal is ready — they only describe internal review.
export const REVIEW_STATUS_VALUES = Object.freeze([
  'draft',
  'needs_verification',
  'reviewed_for_prep',
  'ready_for_bistrack',
  'do_not_use_yet',
])

export const REVIEW_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  needs_verification: 'Needs verification',
  reviewed_for_prep: 'Reviewed for prep',
  ready_for_bistrack: 'Ready for BisTrack',
  do_not_use_yet: 'Do not use yet',
})

export const DEFAULT_REVIEW_STATUS = 'draft'

export const REVIEW_FLAG_VALUES = Object.freeze([
  'sku_or_part_confirmed',
  'quantity_confirmed',
  'customer_goal_matches',
  'install_implication_checked',
  'field_rule_checked',
  'needs_liam_review',
  'needs_measurement',
  'not_customer_ready',
])

export const REVIEW_FLAG_LABELS = Object.freeze({
  sku_or_part_confirmed: 'SKU / part confirmed',
  quantity_confirmed: 'Quantity confirmed',
  customer_goal_matches: 'Customer goal matches',
  install_implication_checked: 'Install implication checked',
  field_rule_checked: 'Field rule checked',
  needs_liam_review: 'Needs Liam review',
  needs_measurement: 'Needs measurement',
  not_customer_ready: 'Not customer-ready',
})

const SOURCE_BASIS_SET = new Set(SOURCE_BASIS_VALUES)
const REVIEW_STATUS_SET = new Set(REVIEW_STATUS_VALUES)
const REVIEW_FLAG_SET = new Set(REVIEW_FLAG_VALUES)

function normalizeSourceBasis(value, fallback = DEFAULT_SOURCE_BASIS) {
  const v = clampString(value).trim()
  if (!v) return fallback
  return SOURCE_BASIS_SET.has(v) ? v : fallback
}

function normalizeReviewStatus(value, fallback = DEFAULT_REVIEW_STATUS) {
  const v = clampString(value).trim()
  if (!v) return fallback
  return REVIEW_STATUS_SET.has(v) ? v : fallback
}

function normalizeReviewFlags(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const f of value) {
    const v = clampString(f).trim()
    if (!v) continue
    if (!REVIEW_FLAG_SET.has(v)) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

function safeId(seed = '') {
  const tail = Math.random().toString(36).slice(2, 7)
  const stamp = Date.now().toString(36)
  const seedPart = String(seed || '').replace(/[^a-z0-9]+/gi, '').slice(0, 6).toLowerCase()
  return `qpl-${stamp}-${seedPart || 'x'}-${tail}`
}

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function normalizeQuantity(value) {
  if (value === undefined || value === null || value === '') return ''
  const s = String(value).trim()
  if (!s) return ''
  // Keep loose: many shops write "2", "2 ea", "10 ft". Trim to a string.
  return s
}

// Normalize a single proposed line item:
// - Strip banned/sensitive keys (cost, margin, etc.).
// - Whitelist only the safe keys above.
// - Coerce safe fields to strings; quantity stays a string for tablet entry.
// - Generate a stable id if missing.
export function normalizeQuotePrepLine(input = {}, options = {}) {
  const out = { id: '' }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input)) {
      if (isSensitiveKey(k)) continue
      if (!LINE_SAFE_KEY_SET.has(k)) continue
      if (k === 'quantity') {
        out.quantity = normalizeQuantity(v)
      } else if (k === 'id') {
        out.id = clampString(v).trim()
      } else if (k === 'sourceBasis') {
        out.sourceBasis = normalizeSourceBasis(v)
      } else if (k === 'reviewStatus') {
        out.reviewStatus = normalizeReviewStatus(v)
      } else if (k === 'reviewFlags') {
        out.reviewFlags = normalizeReviewFlags(v)
      } else {
        out[k] = clampString(v)
      }
    }
  }
  if (!out.id) out.id = safeId(options.idSeed || out.name || out.partNumber || '')
  // Defaults for the source / review fields. Apply before generic fill so
  // the array/select fields land with the right shape.
  if (out.sourceBasis === undefined) out.sourceBasis = DEFAULT_SOURCE_BASIS
  if (out.reviewStatus === undefined) out.reviewStatus = DEFAULT_REVIEW_STATUS
  if (!Array.isArray(out.reviewFlags)) out.reviewFlags = []
  for (const k of LINE_SAFE_KEYS) {
    if (out[k] === undefined) {
      out[k] = k === 'reviewFlags' ? [] : ''
    }
  }
  return out
}

export function normalizeQuotePrepLines(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const out = []
  for (const item of input) {
    const line = normalizeQuotePrepLine(item)
    // De-dup ids defensively. Don't blow up — just regenerate.
    if (seen.has(line.id)) line.id = safeId(line.name)
    seen.add(line.id)
    out.push(line)
  }
  return out
}

// Turn a stored Customer File row into a quote prep editing draft.
export function quotePrepDraftFromCustomerFile(file) {
  const f = file && typeof file === 'object' ? file : {}
  return {
    lines: normalizeQuotePrepLines(f.quotePrepLines),
    notes: clampString(f.quotePrepNotes || ''),
  }
}

export function emptyQuotePrepDraft() {
  return { lines: [], notes: '' }
}

// Build a customer-file patch the durable update path can write. The
// updatedAt stamp is derived from the supplied "now" so tests stay
// deterministic.
export function buildCustomerFilePatchFromQuotePrep(draft = {}, now = new Date()) {
  const lines = normalizeQuotePrepLines(draft.lines)
  const notes = clampString(draft.notes || '')
  return {
    quotePrepLines: lines,
    quotePrepNotes: notes,
    quotePrepUpdatedAt: new Date(now).toISOString(),
  }
}

// Editing helpers — pure, return new arrays.
export function addQuotePrepLine(lines, seed = {}) {
  const list = normalizeQuotePrepLines(lines)
  return [...list, normalizeQuotePrepLine(seed)]
}

export function updateQuotePrepLine(lines, id, patch = {}) {
  const list = normalizeQuotePrepLines(lines)
  return list.map((line) => {
    if (line.id !== id) return line
    return normalizeQuotePrepLine({ ...line, ...patch, id: line.id })
  })
}

export function removeQuotePrepLine(lines, id) {
  const list = normalizeQuotePrepLines(lines)
  return list.filter((line) => line.id !== id)
}

// Build the searchable / rules-friendly text for one line. Customer-safe
// notes and the internal prep note are both included because Field Rules is
// rep-only and reads any field that helps it decide.
export function quotePrepLineSearchText(line = {}) {
  const safe = normalizeQuotePrepLine(line)
  return [
    safe.name,
    safe.description,
    safe.brand,
    safe.partNumber,
    safe.category,
    safe.customerSafeNotes,
    safe.internalPrepNote,
  ].filter(Boolean).join(' \n ')
}

export function quotePrepLinesSearchText(lines) {
  return normalizeQuotePrepLines(lines)
    .map(quotePrepLineSearchText)
    .filter(Boolean)
    .join(' \n ')
}

// Internal summary of review state across the proposed line items. Counts
// only — never a "the proposal is ready" signal. If everything is still in
// `draft` / `needs_verification`, `readyForBistrack` is zero and the UI is
// expected to lean on that, not infer readiness.
export function summarizeQuotePrepReview(lines) {
  const list = normalizeQuotePrepLines(lines)
  const summary = {
    total: list.length,
    needsVerification: 0,
    readyForBistrack: 0,
    doNotUseYet: 0,
    draft: 0,
    reviewedForPrep: 0,
    needsSource: 0,
  }
  for (const line of list) {
    if (line.reviewStatus === 'needs_verification') summary.needsVerification += 1
    else if (line.reviewStatus === 'ready_for_bistrack') summary.readyForBistrack += 1
    else if (line.reviewStatus === 'do_not_use_yet') summary.doNotUseYet += 1
    else if (line.reviewStatus === 'reviewed_for_prep') summary.reviewedForPrep += 1
    else summary.draft += 1
    if (line.sourceBasis === 'needs_source') summary.needsSource += 1
  }
  return summary
}

// Build the input shape Field Rules consumes for the Quote / Prep surface.
// The base file (already saved) carries lens facts + acknowledgement state;
// the proposed line items are surfaced through the engine's `discussionText`
// option so existing rules (Whisper Flex, Rockford ignition, IRTAX install
// header, ZC ack) read them without new rule logic.
export function buildQuotePrepEngineInput(savedFile = {}, draft = {}) {
  const base = savedFile && typeof savedFile === 'object' ? savedFile : {}
  const lineText = quotePrepLinesSearchText(draft && draft.lines)
  const notesText = clampString(draft && draft.notes)
  return {
    file: base,
    discussionText: [lineText, notesText].filter(Boolean),
  }
}
