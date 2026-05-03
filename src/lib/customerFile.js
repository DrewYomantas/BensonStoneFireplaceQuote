// Customer file: the operational record for a real Benson Stone showroom journey.
// One file per customer/project — created at visit start OR on first BizTrack import.
// Holds the lifecycle state that the quote shell can derive status from.

const STORAGE_KEY = 'benson-stone-customer-file-v1'

export const lifecycleStages = [
  'visit-started',
  'goal-discovered',
  'showroom-walked',
  'quote-imported',
  'packet-generated',
  'packet-sent',
  'handoff-scheduled',
  'follow-up',
  'closed',
]

export const fuelTypes = ['unknown', 'gas', 'wood', 'pellet', 'electric']
export const applianceTypes = ['unknown', 'fireplace', 'insert', 'stove', 'log-set', 'outdoor']
export const handoffTypes = ['none', 'home-measure', 'install-schedule', 'delivery']
export const sendChannels = ['none', 'email', 'print', 'both']

const stringKeys = [
  'id',
  'opportunityId',
  'createdAt',
  'updatedAt',
  'visitedAt',
  // Contact
  'customerName',
  'customerEmail',
  'customerPhone',
  'projectAddress',
  // Existing setup (page 3 / scope notes only — never customer-facing on page 1)
  'existingApplianceType',
  'existingFuelType',
  'existingVentingNotes',
  'existingNotes',
  // Goal
  'customerGoal',
  'goalNotes',
  'budgetBand',
  // Model tag (when a specific display unit was tagged)
  'taggedModel',
  'taggedVendor',
  // Packet status
  'lineItemQuoteIncluded',     // 'true' | 'false' | ''
  'packetGeneratedAt',
  'packetSentAt',
  'packetSendChannel',         // sendChannels
  // Handoff
  'handoffType',
  'handoffScheduledFor',
  'handoffNotes',
  // Pricing
  'pricingConfirmedAt',
]

const arrayKeys = [
  'photos',                    // [{ id, label, capturedAt, source }]
  'measurements',              // [{ id, label, value, capturedAt }]
  'displaysShown',             // [{ id, displayId, label, shownAt }]
  'brochuresGiven',            // [{ id, label, vendor, givenAt }]
  'samplesGiven',              // [{ id, label, givenAt }]
  'followUpTasks',             // [{ id, label, dueAt, doneAt }]
  'notes',                     // [{ id, body, createdAt }]
]

function getStorage(storage = globalThis.localStorage) {
  return storage || null
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString()
}

function normalizeIdPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function makeCustomerFileId({ customerName, customerPhone, opportunityId } = {}, now = new Date()) {
  if (opportunityId) return `cf-${normalizeIdPart(opportunityId)}`
  const parts = [normalizeIdPart(customerName), normalizeIdPart(customerPhone)].filter(Boolean)
  if (parts.length) return `cf-${parts.join('-')}`
  return `cf-${new Date(now).toISOString().replace(/[:.]/g, '-')}`
}

export function sanitizeCustomerFile(input = {}) {
  const out = {}
  for (const k of stringKeys) out[k] = String(input[k] ?? '')
  for (const k of arrayKeys) out[k] = Array.isArray(input[k]) ? input[k].slice() : []
  return out
}

export function createEmptyCustomerFile(seed = {}, now = new Date()) {
  const ts = nowIso(now)
  return sanitizeCustomerFile({
    ...seed,
    id: seed.id || makeCustomerFileId(seed, now),
    createdAt: seed.createdAt || ts,
    updatedAt: ts,
  })
}

export function listCustomerFiles(storage) {
  const ref = getStorage(storage)
  if (!ref) return []
  try {
    const parsed = JSON.parse(ref.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeCustomerFile) : []
  } catch {
    return []
  }
}

function writeAll(files, storage) {
  const ref = getStorage(storage)
  if (!ref) return []
  const clean = files.map(sanitizeCustomerFile)
  ref.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export function getCustomerFile(id, storage) {
  return listCustomerFiles(storage).find((f) => f.id === id) || null
}

export function getCustomerFileByOpportunity(opportunityId, storage) {
  if (!opportunityId) return null
  return listCustomerFiles(storage).find((f) => f.opportunityId === opportunityId) || null
}

export function saveCustomerFile(file, storage) {
  const clean = sanitizeCustomerFile({ ...file, updatedAt: nowIso() })
  const all = listCustomerFiles(storage)
  const idx = all.findIndex((f) => f.id === clean.id)
  const next = idx === -1
    ? [clean, ...all]
    : all.map((f) => f.id === clean.id ? { ...f, ...clean, createdAt: f.createdAt || clean.createdAt } : f)
  writeAll(next, storage)
  return clean
}

export function updateCustomerFile(id, patch, storage) {
  const all = listCustomerFiles(storage)
  const next = all.map((f) =>
    f.id === id ? sanitizeCustomerFile({ ...f, ...patch, id, updatedAt: nowIso() }) : f
  )
  writeAll(next, storage)
  return next.find((f) => f.id === id) || null
}

export function appendCustomerFileItem(id, key, item, storage) {
  if (!arrayKeys.includes(key)) throw new Error(`appendCustomerFileItem: ${key} is not an array field`)
  const file = getCustomerFile(id, storage)
  if (!file) return null
  const stamped = { id: item.id || `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...item }
  return updateCustomerFile(id, { [key]: [...file[key], stamped] }, storage)
}

export function removeCustomerFile(id, storage) {
  const remaining = listCustomerFiles(storage).filter((f) => f.id !== id)
  writeAll(remaining, storage)
  return remaining
}

// --- Adapter: hydrate a customer file from a parsed BizTrack opportunity ---
// Used when a quote is imported before a visit-started file exists.
export function customerFileFromOpportunity(opportunity = {}, now = new Date()) {
  return createEmptyCustomerFile({
    opportunityId: opportunity.id || '',
    customerName: opportunity.customerName || '',
    customerEmail: opportunity.customerEmail || '',
    customerPhone: opportunity.customerPhone || '',
    projectAddress: opportunity.projectAddress || '',
    existingNotes: opportunity.existingSetup || '',
    customerGoal: opportunity.desiredOutcome || '',
    lineItemQuoteIncluded: opportunity.lineItemQuoteAttached === 'true' ? 'true' : '',
  }, now)
}
