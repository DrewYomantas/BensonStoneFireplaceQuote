// Persistence helpers for an in-progress Start Visit.
// A draft is a single record in the visitSessions store with a stable id so
// the form can survive reload mid-typing. On submit the draft is cleared and
// a real Customer File is saved through customerFileDurable.

import { STORE_NAMES, isSensitiveKey } from './salesOsStorageSchema.js'
import { getCustomerFileDurable, saveCustomerFileDurable } from './customerFileDurable.js'
import {
  buildStartVisitCustomerFile,
  mergeStartVisitIntoCustomerFile,
  normalizeStartVisitSeed,
} from './startVisitCustomerFile.js'

export const DRAFT_ID = 'start-visit-draft'
const STORE = STORE_NAMES.visitSessions

const SEED_FIELDS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'projectAddress',
  'visitType',
  'customerGoal',
  'currentSetupNote',
  'salespersonNotes',
]

export function emptyDraft() {
  const out = { id: DRAFT_ID, kind: 'start-visit', status: 'draft' }
  for (const k of SEED_FIELDS) out[k] = ''
  return out
}

function unwrap(result) {
  if (!result || result.ok !== true) {
    const message = result && result.error ? result.error.message : 'storage error'
    throw new Error(message)
  }
  return result.data
}

function sanitizeDraftInput(input = {}) {
  const out = { id: DRAFT_ID, kind: 'start-visit', status: 'draft' }
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) continue
    if (!SEED_FIELDS.includes(k)) continue
    out[k] = v == null ? '' : String(v)
  }
  for (const k of SEED_FIELDS) if (!(k in out)) out[k] = ''
  return out
}

export async function loadStartVisitDraft(storage) {
  const row = unwrap(await storage.getById(STORE, DRAFT_ID))
  if (!row) return emptyDraft()
  return sanitizeDraftInput(row)
}

export async function saveStartVisitDraft(storage, input, now = new Date()) {
  const draft = sanitizeDraftInput(input)
  unwrap(await storage.putRecord(STORE, draft, now))
  return draft
}

export async function clearStartVisitDraft(storage) {
  unwrap(await storage.deleteRecord(STORE, DRAFT_ID))
  return true
}

// Submit: build a customer file from the draft and persist it durably.
// Returns { customerFile, warnings, nextBestMove, status }. Caller is
// responsible for calling clearStartVisitDraft after success.
export async function submitStartVisitDraft(storage, input, now = new Date()) {
  const seed = normalizeStartVisitSeed(input)
  const built = buildStartVisitCustomerFile(seed, now)
  // If a Customer File with this deterministic id already exists, merge the
  // Start Visit fields in non-destructively so re-submits don't erase
  // lens-stamped facts. New customers fall through to the original path.
  const existing = await getCustomerFileDurable(storage, built.draft.id)
  const toSave = existing
    ? mergeStartVisitIntoCustomerFile(existing, built.draft)
    : built.draft
  const saved = await saveCustomerFileDurable(storage, toSave, now)
  return {
    customerFile: saved,
    warnings: built.warnings,
    nextBestMove: built.nextBestMove,
    status: built.status,
    visitType: built.visitType,
    customerGoal: built.customerGoal,
    mergedExisting: Boolean(existing),
  }
}

export const _internals = { sanitizeDraftInput, SEED_FIELDS }
