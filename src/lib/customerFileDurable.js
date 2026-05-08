// Async, IndexedDB-backed customer file API.
// The legacy synchronous helpers in ./customerFile.js continue to work and
// mirror their writes into the same store. New shell code should prefer this
// module so reads and writes share one source of truth.

import { STORE_NAMES } from './salesOsStorageSchema.js'
import {
  createEmptyCustomerFile,
  makeCustomerFileId,
  sanitizeCustomerFile,
} from './customerFile.js'

const STORE = STORE_NAMES.customerFiles

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

export async function listCustomerFilesDurable(storage) {
  const rows = unwrap(await storage.getAll(STORE), [])
  return rows.map(sanitizeCustomerFile)
}

export async function getCustomerFileDurable(storage, id) {
  if (!id) return null
  const row = unwrap(await storage.getById(STORE, id), null)
  return row ? sanitizeCustomerFile(row) : null
}

export async function getCustomerFileByOpportunityDurable(storage, opportunityId) {
  if (!opportunityId) return null
  const all = await listCustomerFilesDurable(storage)
  return all.find((file) => file.opportunityId === opportunityId) || null
}

export async function saveCustomerFileDurable(storage, file, now = new Date()) {
  if (!file || typeof file !== 'object') throw new Error('saveCustomerFileDurable: file required')
  const id = file.id || makeCustomerFileId(file, now)
  const existing = await getCustomerFileDurable(storage, id)
  const ts = nowIso(now)
  const merged = sanitizeCustomerFile({
    ...(existing || {}),
    ...file,
    id,
    createdAt: (existing && existing.createdAt) || file.createdAt || ts,
    updatedAt: ts,
  })
  unwrap(await storage.putRecord(STORE, merged, now), null)
  return merged
}

export async function updateCustomerFileDurable(storage, id, patch, now = new Date()) {
  if (!id) throw new Error('updateCustomerFileDurable: id required')
  const existing = await getCustomerFileDurable(storage, id)
  if (!existing) return null
  return saveCustomerFileDurable(storage, { ...existing, ...patch, id, createdAt: existing.createdAt }, now)
}

export async function removeCustomerFileDurable(storage, id) {
  if (!id) return false
  unwrap(await storage.deleteRecord(STORE, id), null)
  return true
}

// Convenience: create-from-empty + save in one call. The new shell uses this
// when Start Visit creates a brand-new customer file before any opportunity
// exists.
export async function createCustomerFileDurable(storage, seed = {}, now = new Date()) {
  return saveCustomerFileDurable(storage, createEmptyCustomerFile(seed, now), now)
}
