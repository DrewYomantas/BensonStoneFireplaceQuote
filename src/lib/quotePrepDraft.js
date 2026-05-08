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
])

const LINE_SAFE_KEY_SET = new Set(LINE_SAFE_KEYS)

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
      } else {
        out[k] = clampString(v)
      }
    }
  }
  if (!out.id) out.id = safeId(options.idSeed || out.name || out.partNumber || '')
  for (const k of LINE_SAFE_KEYS) {
    if (out[k] === undefined) out[k] = ''
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
