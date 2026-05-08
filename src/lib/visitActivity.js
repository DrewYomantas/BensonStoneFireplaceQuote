// Visit Activity + Follow-Up loop (Milestone 15) — pure logic + thin
// IndexedDB-backed helpers built on the existing Sales OS storage stores
// (`activityTimeline`, `followUpRecords`).
//
// Internal-only: no email, no SMS, no customer-facing output, no pricing.
// Every surfaced string runs through the same banned-phrase / sensitive-key
// scrub used elsewhere in the gate / handoff / list projections.

import { STORE_NAMES, isSensitiveKey } from './salesOsStorageSchema.js'

const ACTIVITY_STORE = STORE_NAMES.activityTimeline
const FOLLOW_UP_STORE = STORE_NAMES.followUpRecords

// ---- Constants ----------------------------------------------------------

export const ACTIVITY_KINDS = Object.freeze([
  'visit_started',
  'lens_saved',
  'quote_line_saved',
  'quote_gate_changed',
  'handoff_copied',
  'follow_up_set',
  'manual_note',
  'bulk_imported',
])

export const ACTIVITY_KIND_LABELS = Object.freeze({
  visit_started: 'Visit started',
  lens_saved: 'Lens saved',
  quote_line_saved: 'Quote / Prep saved',
  quote_gate_changed: 'Gate status changed',
  handoff_copied: 'Handoff copied',
  follow_up_set: 'Follow-up set',
  manual_note: 'Note',
  bulk_imported: 'Bulk imported',
})

const ACTIVITY_KIND_SET = new Set(ACTIVITY_KINDS)

// Banned customer-facing wording. The activity timeline is internal-only,
// but the same scrub is applied so wording stays consistent across surfaces.
const BANNED_DISPLAY_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

// Sensitive keyword patterns we never want to surface in a summary string.
// (Sensitive *keys* are stripped at the object boundary; this catches stray
// mentions inside a free-text summary.)
const SENSITIVE_TEXT_PATTERNS = [
  /\bcost\b/i, /\bmargin\b/i, /\bbuy\s*price\b/i,
  /\bsupplier\s*total\b/i, /\bsupplier\s*history\b/i,
  /\braw\s*ocr\b/i, /\braw\s*pdf\b/i,
  /\bbistrack\s*confidence\b/i, /\bocr\s*confidence\b/i,
  /\bfuzzy\s*match\b/i,
  /\bsales\s*rank\b/i, /\bproduct\s*rank\b/i,
]

// ---- Pure helpers -------------------------------------------------------

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString()
}

// Scrub a free-text summary. Returns '' if the string carries any banned
// phrase or sensitive keyword — callers should handle that as "no
// summary" rather than logging a poisoned line.
export function safeActivitySummary(text) {
  const s = clampString(text).trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  for (const phrase of BANNED_DISPLAY_PHRASES) {
    if (lower.includes(phrase)) return ''
  }
  for (const re of SENSITIVE_TEXT_PATTERNS) {
    if (re.test(s)) return ''
  }
  return s
}

function safeId(seed = '') {
  const tail = Math.random().toString(36).slice(2, 7)
  const stamp = Date.now().toString(36)
  const seedPart = clampString(seed).replace(/[^a-z0-9]+/gi, '').slice(0, 8).toLowerCase()
  return `act-${stamp}-${seedPart || 'x'}-${tail}`
}

// Normalize a raw event into the safe shape we persist + render. Strips
// sensitive keys, validates kind, scrubs summary, generates id if missing.
// Caller-supplied id is honored if present so tests stay deterministic.
export function normalizeActivityEvent(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }
  const safe = {}
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) continue
    safe[k] = v
  }
  const kind = clampString(safe.kind).trim()
  if (!ACTIVITY_KIND_SET.has(kind)) return null
  const fileId = clampString(safe.fileId).trim()
  if (!fileId) return null
  const at = safe.at ? clampString(safe.at) : nowIso(now)
  const id = clampString(safe.id).trim() || safeId(`${fileId}-${kind}`)
  const summary = safeActivitySummary(safe.summary)
  return Object.freeze({ id, fileId, at, kind, summary })
}

export function normalizeActivityEvents(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const item of input) {
    const ev = normalizeActivityEvent(item)
    if (ev) out.push(ev)
  }
  return out
}

// Project a list of raw activity rows into a display shape: filtered to a
// single fileId, sorted newest-first, capped to a sensible default.
export function projectActivityForFile(rawEvents, fileId, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : 8
  const events = normalizeActivityEvents(rawEvents).filter(
    (e) => e.fileId === fileId,
  )
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return limit > 0 ? events.slice(0, limit) : events
}

// ---- Follow-up helpers --------------------------------------------------

// Internal-only follow-up record. Single row per Customer File so the
// `id` doubles as `fileId`. No email/SMS draft attached.
export function normalizeFollowUp(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const safe = {}
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) continue
    safe[k] = v
  }
  const fileId = clampString(safe.fileId).trim()
  if (!fileId) return null
  const dueAt = clampString(safe.dueAt).trim()
  if (!dueAt) return null
  const note = safeActivitySummary(safe.note)
  return Object.freeze({
    id: fileId,
    fileId,
    dueAt,
    note,
    setAt: clampString(safe.setAt) || nowIso(now),
  })
}

function startOfDayIso(date) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

function dueAtToDate(dueAt) {
  // Accept a yyyy-mm-dd or full ISO. Local-time interpretation keeps
  // "today" honest on the rep's tablet.
  const s = clampString(dueAt).trim()
  if (!s) return null
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (ymdMatch) {
    return new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]))
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// Describe a follow-up relative to a reference "now". Returns a small
// signal { kind, text, tone } the screens render. `kind` is one of:
// none / overdue / today / tomorrow / future.
export function describeFollowUp(followUp, now = new Date()) {
  if (!followUp || !followUp.dueAt) return { kind: 'none', text: '', tone: '' }
  const due = dueAtToDate(followUp.dueAt)
  if (!due) return { kind: 'none', text: '', tone: '' }
  const todayStart = startOfDayIso(now)
  const tomorrowStart = startOfDayIso(new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000))
  const dueStart = startOfDayIso(due)
  if (dueStart < todayStart) return { kind: 'overdue', text: 'Follow-up overdue.', tone: 'ember' }
  if (dueStart === todayStart) return { kind: 'today', text: 'Follow-up due today.', tone: 'ember' }
  if (dueStart === tomorrowStart) return { kind: 'tomorrow', text: 'Follow-up due tomorrow.', tone: 'brass' }
  const formatted = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { kind: 'future', text: `Follow-up set for ${formatted}.`, tone: 'slate' }
}

export function isFollowUpDueOrOverdue(followUp, now = new Date()) {
  const desc = describeFollowUp(followUp, now)
  return desc.kind === 'overdue' || desc.kind === 'today'
}

// ---- Durable storage --------------------------------------------------

function unwrap(result, fallback) {
  if (!result || result.ok !== true) {
    const message = result && result.error ? result.error.message : 'storage error'
    throw new Error(message)
  }
  return result.data === undefined || result.data === null ? fallback : result.data
}

export async function listAllActivity(storage) {
  const rows = unwrap(await storage.getAll(ACTIVITY_STORE), [])
  return normalizeActivityEvents(rows)
}

export async function listActivityForFile(storage, fileId, options = {}) {
  if (!fileId) return []
  const all = await listAllActivity(storage)
  return projectActivityForFile(all, fileId, options)
}

export async function appendActivityForFile(storage, fileId, event, now = new Date()) {
  if (!fileId) throw new Error('appendActivityForFile: fileId required')
  const ev = normalizeActivityEvent({ ...event, fileId }, now)
  if (!ev) return null
  unwrap(await storage.putRecord(ACTIVITY_STORE, ev, now), null)
  return ev
}

export async function listAllFollowUps(storage) {
  const rows = unwrap(await storage.getAll(FOLLOW_UP_STORE), [])
  const out = {}
  for (const row of rows) {
    const norm = normalizeFollowUp(row)
    if (norm) out[norm.fileId] = norm
  }
  return out
}

export async function getFollowUpForFile(storage, fileId) {
  if (!fileId) return null
  const row = unwrap(await storage.getById(FOLLOW_UP_STORE, fileId), null)
  return row ? normalizeFollowUp(row) : null
}

export async function saveFollowUpForFile(storage, fileId, input, now = new Date()) {
  if (!fileId) throw new Error('saveFollowUpForFile: fileId required')
  const norm = normalizeFollowUp({ ...input, fileId }, now)
  if (!norm) throw new Error('saveFollowUpForFile: dueAt required')
  unwrap(await storage.putRecord(FOLLOW_UP_STORE, norm, now), null)
  return norm
}

export async function clearFollowUpForFile(storage, fileId) {
  if (!fileId) return false
  unwrap(await storage.deleteRecord(FOLLOW_UP_STORE, fileId), null)
  return true
}
