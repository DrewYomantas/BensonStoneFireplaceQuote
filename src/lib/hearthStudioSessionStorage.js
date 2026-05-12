// Hearth Studio Session storage (Milestone 25) — pure logic + IndexedDB-backed helpers.
// Sessions capture a rep-guided discovery journey for a customer file.
// selections.investment and selections.roomContext are stripped from display and backup exports.

import { STORE_NAMES, isSensitiveKey } from './salesOsStorageSchema.js'
import { appendActivityForFile } from './visitActivity.js'

const SESSION_STORE = STORE_NAMES.hearthStudioSessions

// ---- Constants ----------------------------------------------------------

export const SESSION_STATUS = Object.freeze({
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  soft_deleted: 'soft_deleted',
})

export const CHAPTER_LABELS = Object.freeze({
  0: 'Setup Type',
  1: 'Goal',
  2: 'Fit Gauge',
  3: 'Room Context',
  4: 'Room Conditions',
  5: 'Stone Series',
  6: 'Dimensions',
  7: 'Hearth Geometry',
  8: 'TV / Mantel Plan',
  9: 'Recommended Path',
  10: 'Investment',
  11: 'Verification',
  12: 'Next Steps',
})

const SELECTION_KEYS = Object.freeze([
  'setupType', 'goal', 'fitGauge', 'roomContext', 'roomConditions',
  'stoneSeries', 'dimensions', 'hearthGeometry', 'tvMantelPlan',
  'recommendedPath', 'investment', 'verificationStatus', 'nextSteps',
])

const SELECTION_KEY_SET = new Set(SELECTION_KEYS)
const SESSION_STATUS_SET = new Set(Object.values(SESSION_STATUS))

// Stripped from display projection and backup exports (contain pricing / internal context).
const SELECTION_SCRUB_KEYS = new Set(['investment', 'roomContext'])

// ---- Pure helpers -------------------------------------------------------

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString()
}

function unwrap(result, fallback) {
  if (!result || result.ok !== true) {
    const message = result && result.error ? result.error.message : 'storage error'
    throw new Error(message)
  }
  return result.data === undefined || result.data === null ? fallback : result.data
}

function safeId() {
  return `hs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeSelections(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const key of SELECTION_KEY_SET) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key]
  }
  return out
}

function normalizeFlags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: [] }
  }
  return {
    needsFieldMeasure: raw.needsFieldMeasure === true,
    hasComplexSetup: raw.hasComplexSetup === true,
    fieldRulesTriggered: Array.isArray(raw.fieldRulesTriggered) ? [...raw.fieldRulesTriggered] : [],
  }
}

export function normalizeSession(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const safe = {}
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) continue
    safe[k] = v
  }
  const customerFileId = clampString(safe.customerFileId).trim()
  if (!customerFileId) return null
  const id = clampString(safe.id).trim() || safeId()
  const startedByRepId = clampString(safe.startedByRepId).trim() || null
  const lastTouchedByRepId = clampString(safe.lastTouchedByRepId).trim() || startedByRepId
  const startedAt = clampString(safe.startedAt) || nowIso(now)
  const lastTouchedAt = clampString(safe.lastTouchedAt) || startedAt
  const pausedAt = clampString(safe.pausedAt) || null
  const completedAt = clampString(safe.completedAt) || null
  const softDeletedAt = clampString(safe.softDeletedAt) || null
  const statusVal = clampString(safe.status).trim()
  const status = SESSION_STATUS_SET.has(statusVal) ? statusVal : SESSION_STATUS.active
  const rawChapter = Number(safe.currentChapter)
  const currentChapter = Number.isFinite(rawChapter) && rawChapter >= 0 && rawChapter <= 12
    ? Math.floor(rawChapter) : 0
  const chaptersCompleted = Array.isArray(safe.chaptersCompleted)
    ? safe.chaptersCompleted.filter((n) => n != null && Number.isFinite(Number(n))).map(Number)
    : []
  const selections = normalizeSelections(safe.selections)
  const flags = normalizeFlags(safe.flags)
  return Object.freeze({
    id, customerFileId, startedByRepId, lastTouchedByRepId,
    startedAt, lastTouchedAt, pausedAt, completedAt, softDeletedAt,
    status, currentChapter, chaptersCompleted, selections, flags,
  })
}

// Strip investment + roomContext from selections before display rendering.
export function projectHearthStudioSessionForDisplay(session) {
  if (!session) return null
  const selections = { ...session.selections }
  for (const key of SELECTION_SCRUB_KEYS) delete selections[key]
  return { ...session, selections }
}

// Strip selections.investment + selections.roomContext for backup export.
// Call after scrubSensitiveKeys — this handles the nested scrub that the top-level key
// scrubber cannot reach.
export function scrubSessionRecord(record) {
  if (!record || typeof record !== 'object') return record
  if (!record.selections) return record
  const selections = { ...record.selections }
  for (const key of SELECTION_SCRUB_KEYS) delete selections[key]
  return { ...record, selections }
}

// One-line summary for list rendering.
export function sessionTopLineSummary(session) {
  if (!session) return ''
  const label = CHAPTER_LABELS[session.currentChapter] || `Chapter ${session.currentChapter}`
  const done = session.chaptersCompleted.length
  if (session.status === SESSION_STATUS.completed) return `Completed · ${done} of 13 chapters`
  if (session.status === SESSION_STATUS.paused) return `Paused at ${label}`
  return `Active · ${label}`
}

// ---- Durable storage --------------------------------------------------

export async function listSessions(storage, { customerFileId = '', includeSoftDeleted = false } = {}) {
  const rows = unwrap(await storage.getAll(SESSION_STORE), [])
  return rows.map((r) => normalizeSession(r)).filter(Boolean).filter((session) => {
    if (customerFileId && session.customerFileId !== customerFileId) return false
    if (!includeSoftDeleted && (session.status === SESSION_STATUS.soft_deleted || session.softDeletedAt)) return false
    return true
  })
}

export async function getSession(storage, id) {
  if (!id) return null
  const row = unwrap(await storage.getById(SESSION_STORE, id), null)
  return row ? normalizeSession(row) : null
}

export async function getActiveSessionsForCustomer(storage, customerFileId) {
  if (!customerFileId) return []
  const all = await listSessions(storage)
  return all.filter(
    (s) => s.customerFileId === customerFileId &&
      (s.status === SESSION_STATUS.active || s.status === SESSION_STATUS.paused),
  )
}

export async function createSession(storage, customerFileId, repId = null, now = new Date()) {
  if (!customerFileId) throw new Error('createSession: customerFileId required')
  const session = normalizeSession({
    customerFileId,
    startedByRepId: repId,
    lastTouchedByRepId: repId,
    status: SESSION_STATUS.active,
  }, now)
  if (!session) throw new Error('createSession: normalizeSession failed')
  unwrap(await storage.putRecord(SESSION_STORE, session, now), null)
  appendActivityForFile(storage, customerFileId, { kind: 'hearth_session_created', repId }, now)
    .catch(() => {})
  return session
}

export async function updateSession(storage, id, patch = {}, now = new Date()) {
  if (!id) throw new Error('updateSession: id required')
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`updateSession: session ${id} not found`)
  const merged = normalizeSession({
    ...existing,
    ...patch,
    id,
    lastTouchedAt: nowIso(now),
    selections: { ...existing.selections, ...(patch.selections || {}) },
    flags: { ...existing.flags, ...(patch.flags || {}) },
  }, now)
  if (!merged) throw new Error('updateSession: merge produced invalid session')
  unwrap(await storage.putRecord(SESSION_STORE, merged, now), null)
  return merged
}

export async function pauseSession(storage, id, repId = null, now = new Date()) {
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`pauseSession: session ${id} not found`)
  const updated = await updateSession(storage, id, {
    status: SESSION_STATUS.paused,
    pausedAt: nowIso(now),
    lastTouchedByRepId: repId,
  }, now)
  appendActivityForFile(storage, existing.customerFileId, { kind: 'hearth_session_paused', repId }, now)
    .catch(() => {})
  return updated
}

export async function resumeSession(storage, id, repId = null, now = new Date()) {
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`resumeSession: session ${id} not found`)
  const updated = await updateSession(storage, id, {
    status: SESSION_STATUS.active,
    pausedAt: null,
    lastTouchedByRepId: repId,
  }, now)
  appendActivityForFile(storage, existing.customerFileId, { kind: 'hearth_session_resumed', repId }, now)
    .catch(() => {})
  return updated
}

export async function completeSession(storage, id, repId = null, now = new Date()) {
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`completeSession: session ${id} not found`)
  const updated = await updateSession(storage, id, {
    status: SESSION_STATUS.completed,
    completedAt: nowIso(now),
    lastTouchedByRepId: repId,
  }, now)
  appendActivityForFile(storage, existing.customerFileId, { kind: 'hearth_session_completed', repId }, now)
    .catch(() => {})
  return updated
}

export async function softDeleteSession(storage, id, repId = null, now = new Date()) {
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`softDeleteSession: session ${id} not found`)
  const updated = await updateSession(storage, id, {
    status: SESSION_STATUS.soft_deleted,
    softDeletedAt: nowIso(now),
    lastTouchedByRepId: repId,
  }, now)
  appendActivityForFile(storage, existing.customerFileId, { kind: 'hearth_session_soft_deleted', repId }, now)
    .catch(() => {})
  return updated
}

export async function restoreSession(storage, id, repId = null, now = new Date()) {
  const existing = await getSession(storage, id)
  if (!existing) throw new Error(`restoreSession: session ${id} not found`)
  const updated = await updateSession(storage, id, {
    status: SESSION_STATUS.active,
    softDeletedAt: null,
    lastTouchedByRepId: repId,
  }, now)
  appendActivityForFile(storage, existing.customerFileId, { kind: 'hearth_session_restored', repId }, now)
    .catch(() => {})
  return updated
}
