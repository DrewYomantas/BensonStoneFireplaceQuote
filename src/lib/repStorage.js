import { STORE_NAMES } from './salesOsStorageSchema.js'

const STORE = STORE_NAMES.reps

function nowIso(now = new Date()) {
  return new Date(now).toISOString()
}

function clampString(v) {
  return v === undefined || v === null ? '' : String(v)
}

function unwrap(result, fallback) {
  if (!result || result.ok !== true) {
    const message = result && result.error ? result.error.message : 'storage error'
    throw new Error(message)
  }
  return result.data === undefined || result.data === null ? fallback : result.data
}

function makeRepId() {
  return `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function deriveInitials(firstName, lastName) {
  const f = clampString(firstName).trim()
  const l = clampString(lastName).trim()
  return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase()
}

// Validates and normalizes a rep record. Requires id, firstName, lastName, and
// a last4Ssn that is exactly 4 characters. Returns null for invalid input.
export function normalizeRep(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const id = clampString(input.id).trim()
  if (!id) return null
  const last4Ssn = clampString(input.last4Ssn).trim()
  if (last4Ssn.length !== 4) return null
  const firstName = clampString(input.firstName).trim()
  const lastName = clampString(input.lastName).trim()
  if (!firstName || !lastName) return null
  const initials = clampString(input.initials).trim() || deriveInitials(firstName, lastName)
  const startedAt = clampString(input.startedAt).trim() || nowIso()
  const active = typeof input.active === 'boolean' ? input.active : true
  return Object.freeze({ id, last4Ssn, firstName, lastName, initials, startedAt, active })
}

export async function listReps(storage) {
  const rows = unwrap(await storage.getAll(STORE), [])
  return rows.map(normalizeRep).filter(Boolean)
}

export async function getRep(storage, id) {
  if (!id) return null
  const row = unwrap(await storage.getById(STORE, id), null)
  return row ? normalizeRep(row) : null
}

export async function getRepByLast4Ssn(storage, last4Ssn) {
  if (!last4Ssn) return null
  const reps = await listReps(storage)
  return reps.find((r) => r.last4Ssn === clampString(last4Ssn).trim()) || null
}

export async function addRep(storage, input, now = new Date()) {
  if (!input || typeof input !== 'object') throw new Error('addRep: input required')
  const id = clampString(input.id).trim() || makeRepId()
  const startedAt = clampString(input.startedAt).trim() || nowIso(now)
  const normalized = normalizeRep({ ...input, id, startedAt })
  if (!normalized) {
    throw new Error(
      'addRep: invalid rep — firstName, lastName, and a 4-character last4Ssn are required',
    )
  }
  unwrap(await storage.putRecord(STORE, normalized, now), null)
  return normalized
}

export async function updateRep(storage, input, now = new Date()) {
  if (!input || !input.id) throw new Error('updateRep: id required')
  const existing = await getRep(storage, clampString(input.id).trim())
  if (!existing) throw new Error(`updateRep: rep not found: ${input.id}`)
  const merged = normalizeRep({ ...existing, ...input })
  if (!merged) throw new Error('updateRep: invalid rep data after merge')
  unwrap(await storage.putRecord(STORE, merged, now), null)
  return merged
}

export async function setActive(storage, id, active, now = new Date()) {
  if (!id) throw new Error('setActive: id required')
  const existing = await getRep(storage, clampString(id).trim())
  if (!existing) throw new Error(`setActive: rep not found: ${id}`)
  const updated = normalizeRep({ ...existing, active: Boolean(active) })
  unwrap(await storage.putRecord(STORE, updated, now), null)
  return updated
}
