// Customer file: the operational record for a real Benson Stone showroom journey.
// One file per customer/project — created at visit start OR on first BizTrack import.
// Holds the lifecycle state that the quote shell can derive status from.
//
// Persistence:
//   The legacy synchronous API below writes to localStorage so existing screens
//   keep working without an async refactor. When the durable Sales OS storage
//   is open, we ALSO mirror every mutation into IndexedDB so refresh-survival
//   and backup/restore include customer files. The new async API lives in
//   ./customerFileDurable.js.

const STORAGE_KEY = 'benson-stone-customer-file-v1'

// Opt-in mirror to the durable Sales OS storage. Wired from
// SalesOsStorageStatus.jsx after the IndexedDB engine opens. Tests can swap in
// an in-memory storage to verify mirror behavior. Default null = no mirror,
// which keeps every existing legacy test deterministic.
let durableMirror = null
let lastMirrorPromise = Promise.resolve()
const DURABLE_STORE = 'customerFiles'

export function setCustomerFileDurableMirror(storage) {
  durableMirror = storage || null
}

export function getCustomerFileDurableMirror() {
  return durableMirror
}

// Test helper — await the most recent fire-and-forget mirror write before
// asserting on durable storage state.
export function _flushCustomerFileDurableMirror() {
  return lastMirrorPromise
}

function mirrorPut(file) {
  if (!durableMirror || !file || !file.id) return
  lastMirrorPromise = Promise.resolve()
    .then(() => durableMirror.putRecord(DURABLE_STORE, sanitizeCustomerFile(file)))
    .catch(() => {})
}

function mirrorDelete(id) {
  if (!durableMirror || !id) return
  lastMirrorPromise = Promise.resolve()
    .then(() => durableMirror.deleteRecord(DURABLE_STORE, id))
    .catch(() => {})
}

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
  'archivedAt',
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
  'customerPainPoints',
  'heatExpectation',
  'likelyPath',
  'nextBestQuestion',
  'guidedPathNotes',
  'guidedPathCustomerSummary',
  // Setup + Goal Lens (PR 2). Each fact has a paired source-state string so the
  // Customer File can show inline source pills without re-deriving trust.
  'lensSetupType',
  'lensSetupTypeSource',
  'lensDesiredOutcome',
  'lensDesiredOutcomeSource',
  'lensFuelGasPresent',
  'lensFuelGasPresentSource',
  'lensFuelElectricPresent',
  'lensFuelElectricPresentSource',
  'lensGasType',
  'lensGasTypeSource',
  'lensVenting',
  'lensVentingSource',
  'lensSalespersonNotes',
  'lensUpdatedAt',
  // Field Rules — Liam's May 2026 Field Rules safety layer (PR 3).
  // Acknowledgement state for Field Rule 2 (ZC / prefab fireplace + gas
  // insert path). Persisted on the Customer File so the rule clears across
  // reloads. No customer-facing surface — these are internal facts.
  'zcGasInsertAcknowledgedAt',
  'zcGasInsertAcknowledgedBy',
  // Quote / Prep workspace (PR 8) — rep-only prep notes + last-touched stamp.
  // The proposed line items themselves live in the array store below.
  'quotePrepNotes',
  'quotePrepUpdatedAt',
  // Model tag / appliance verification
  'taggedModel',
  'taggedVendor',
  'modelTagReceived',
  // Packet status
  'lineItemQuoteIncluded',     // 'true' | 'false' | ''
  'lineItemQuoteExcludedReason',
  'detailedInvestmentBreakdownIncluded',
  'scopeResponsibilityNotesIncluded',
  'brochuresSamplesSummaryIncluded',
  'brochuresSamplesSummary',
  'packetGeneratedAt',
  'packetPrintedAt',
  'packetEmailDraftStatus',
  'packetSentAt',
  'packetSendChannel',         // sendChannels
  // Handoff
  'handoffType',
  'handoffState',
  'handoffScheduledFor',
  'handoffCreatedAt',
  'handoffSentAt',
  'handoffMeasureCompletedAt',
  'handoffMissingVerification',
  'handoffConcerns',
  'handoffSchedulerExpectation',
  'handoffNotes',
  'handoffSummary',
  // Pricing
  'pricingConfirmedAt',
]

const arrayKeys = [
  'photos',                    // [{ id, label, capturedAt, source }]
  'measurements',              // [{ id, label, value, capturedAt }]
  'displaysShown',             // [{ id, displayId, label, shownAt }]
  'brochuresGiven',            // [{ id, label, vendor, givenAt }]
  'samplesGiven',              // [{ id, label, givenAt }]
  'pinnedReferences',         // [{ id, referenceId, label, sourceLabel, pinnedAt }]
  'followUpTasks',             // [{ id, label, dueAt, doneAt }]
  'notes',                     // [{ id, body, createdAt }]
  'lensConstructionFlags',     // [string] — selected coordination flags
  'quotePrepLines',            // [{ id, name, description, brand, partNumber, category, quantity, customerSafeNotes, internalPrepNote }]
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
  const persisted = next.find((f) => f.id === clean.id) || clean
  mirrorPut(persisted)
  return clean
}

export function updateCustomerFile(id, patch, storage) {
  const all = listCustomerFiles(storage)
  const next = all.map((f) =>
    f.id === id ? sanitizeCustomerFile({ ...f, ...patch, id, updatedAt: nowIso() }) : f
  )
  writeAll(next, storage)
  const updated = next.find((f) => f.id === id) || null
  if (updated) mirrorPut(updated)
  return updated
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
  mirrorDelete(id)
  return remaining
}

export function mergeCustomerFileWithOpportunity(file = {}, opportunity = {}, now = new Date()) {
  const current = sanitizeCustomerFile(file)
  return sanitizeCustomerFile({
    ...current,
    opportunityId: opportunity.id || current.opportunityId,
    customerName: current.customerName || opportunity.customerName || '',
    customerEmail: current.customerEmail || opportunity.customerEmail || '',
    customerPhone: current.customerPhone || opportunity.customerPhone || '',
    projectAddress: current.projectAddress || opportunity.projectAddress || '',
    existingNotes: current.existingNotes || opportunity.existingSetup || '',
    customerGoal: current.customerGoal || opportunity.desiredOutcome || '',
    lineItemQuoteIncluded: current.lineItemQuoteIncluded || (opportunity.lineItemQuoteAttached === 'true' ? 'true' : ''),
    updatedAt: nowIso(now),
  })
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
