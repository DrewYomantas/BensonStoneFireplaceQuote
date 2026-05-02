const STORAGE_KEY = 'benson-stone-showroom-display-register-v1'

export const displayStatusOptions = ['on-display', 'not-on-display', 'unknown', 'needs-verification']
export const workingStatusOptions = ['burning', 'display-only', 'disconnected', 'unknown']
export const locationZoneOptions = ['first-floor', 'cellar', 'outside', 'unknown']

export const displayFilterDefinitions = [
  { value: 'all', label: 'All' },
  { value: 'on-display', label: 'On Display' },
  { value: 'needs-verification', label: 'Needs Verification' },
  { value: 'first-floor', label: 'First Floor' },
  { value: 'cellar', label: 'Cellar' },
  { value: 'unknown-location', label: 'Unknown Location' },
]

const storedKeys = [
  'id',
  'productCode',
  'modelName',
  'description',
  'brand',
  'applianceType',
  'locationZone',
  'locationDetail',
  'displayStatus',
  'workingStatus',
  'lastVerifiedAt',
  'internalNotes',
  'talkingPoints',
  'createdAt',
  'updatedAt',
]

const stopWords = new Set([
  'and', 'the', 'with', 'from', 'this', 'that', 'fireplace', 'insert', 'stove', 'model', 'unit',
  'vent', 'kit', 'trim', 'door', 'glass', 'for', 'near', 'wall', 'bay', 'customer', 'project',
])

function getStorage(storage = globalThis.localStorage) {
  return storage || null
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeCode(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeIdPart(value) {
  return normalizeText(value).replace(/\s+/g, '-')
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token))
}

function splitLines(value) {
  return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean)
}

function locationLabel(zone, detail = '') {
  const base = zone === 'first-floor'
    ? 'First Floor'
    : zone === 'cellar'
      ? 'Cellar'
      : zone === 'outside'
        ? 'Outside'
        : 'Unknown Location'
  return detail ? `${base} - ${detail}` : base
}

function recordSearchText(record = {}) {
  return normalizeText([
    record.productCode,
    record.modelName,
    record.description,
    record.brand,
    record.applianceType,
    locationLabel(record.locationZone, record.locationDetail),
    record.internalNotes,
    record.talkingPoints,
  ].join(' '))
}

function candidateSearchText({ opportunity = {}, fields = {}, lineItems = [] } = {}) {
  return normalizeText([
    opportunity.projectTitle,
    opportunity.productsNotes,
    opportunity.existingSetup,
    opportunity.desiredOutcome,
    fields.PROJECT_TITLE,
    fields.PROJECT_SCOPE_SUMMARY,
    fields.PROJECT_NOTES,
    fields.INSTALLATION_SCOPE,
    ...lineItems.map((item) => `${item.sku || item.code || item.productCode || ''} ${item.description || item.name || ''}`),
  ].join(' '))
}

function candidateCodes({ opportunity = {}, fields = {}, lineItems = [] } = {}) {
  const rawValues = [
    opportunity.productsNotes,
    opportunity.projectTitle,
    fields.PROJECT_TITLE,
    fields.PROJECT_SCOPE_SUMMARY,
    fields.PROJECT_NOTES,
    ...lineItems.map((item) => item.sku || item.code || item.productCode || item.description || item.name || ''),
  ]
  const matches = rawValues.flatMap((value) => String(value || '').match(/[A-Z0-9][A-Z0-9-]{3,}/gi) || [])
  return uniqueStrings(matches.map(normalizeCode))
}

function scoreSuggestedMatch(record, candidateTokens) {
  const recordTokens = uniqueStrings([
    ...tokenize(record.modelName),
    ...tokenize(record.description),
    ...tokenize(record.brand),
    ...tokenize(record.applianceType),
  ])
  const overlap = recordTokens.filter((token) => candidateTokens.includes(token))
  return overlap.length >= 2 ? overlap.length : 0
}

export function sanitizeDisplayRecord(record = {}) {
  const clean = Object.fromEntries(storedKeys.map((key) => [key, record[key] ?? '']))
  clean.locationZone = locationZoneOptions.includes(clean.locationZone) ? clean.locationZone : 'unknown'
  clean.displayStatus = displayStatusOptions.includes(clean.displayStatus) ? clean.displayStatus : 'unknown'
  clean.workingStatus = workingStatusOptions.includes(clean.workingStatus) ? clean.workingStatus : 'unknown'
  return clean
}

export function createDisplayRecord(input = {}, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  const idBase = normalizeIdPart(input.productCode || input.modelName || 'display')
  return sanitizeDisplayRecord({
    id: input.id || `display-${idBase || 'record'}-${timestamp.replace(/[:.]/g, '-')}`,
    productCode: String(input.productCode || ''),
    modelName: String(input.modelName || ''),
    description: String(input.description || ''),
    brand: String(input.brand || ''),
    applianceType: String(input.applianceType || ''),
    locationZone: input.locationZone || 'unknown',
    locationDetail: String(input.locationDetail || ''),
    displayStatus: input.displayStatus || 'unknown',
    workingStatus: input.workingStatus || 'unknown',
    lastVerifiedAt: String(input.lastVerifiedAt || ''),
    internalNotes: String(input.internalNotes || ''),
    talkingPoints: String(input.talkingPoints || ''),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  })
}

export function listDisplayRecords(storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  try {
    const parsed = JSON.parse(localStorageRef.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeDisplayRecord) : []
  } catch {
    return []
  }
}

function writeDisplayRecords(records, storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  const clean = records.map(sanitizeDisplayRecord)
  localStorageRef.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export function saveDisplayRecord(record, storage) {
  const clean = sanitizeDisplayRecord(record)
  const existing = listDisplayRecords(storage)
  const index = existing.findIndex((item) => item.id === clean.id)
  const next = index === -1
    ? [clean, ...existing]
    : existing.map((item) => item.id === clean.id ? { ...item, ...clean, createdAt: item.createdAt || clean.createdAt } : item)
  writeDisplayRecords(next, storage)
  return clean
}

export function updateDisplayRecord(id, patch, storage) {
  const existing = listDisplayRecords(storage)
  const updated = existing.map((item) =>
    item.id === id
      ? sanitizeDisplayRecord({ ...item, ...patch, id, updatedAt: patch.updatedAt || new Date().toISOString() })
      : item
  )
  writeDisplayRecords(updated, storage)
  return updated.find((item) => item.id === id) || null
}

export function filterDisplayRecords(records = [], filter = 'all', search = '') {
  const normalizedSearch = normalizeText(search)
  return records.filter((record) => {
    if (filter === 'on-display' && record.displayStatus !== 'on-display') return false
    if (filter === 'needs-verification' && record.displayStatus !== 'needs-verification') return false
    if (filter === 'first-floor' && record.locationZone !== 'first-floor') return false
    if (filter === 'cellar' && record.locationZone !== 'cellar') return false
    if (filter === 'unknown-location' && record.locationZone !== 'unknown') return false
    if (normalizedSearch && !recordSearchText(record).includes(normalizedSearch)) return false
    return true
  })
}

export function getDisplayFilterCounts(records = [], search = '') {
  return Object.fromEntries(displayFilterDefinitions.map((filter) => [
    filter.value,
    filterDisplayRecords(records, filter.value, search).length,
  ]))
}

export function getDisplayRegisterEmptyState(filter = 'all', search = '') {
  if (search.trim()) {
    return {
      title: 'No matching display records',
      body: 'Try a different product code, model, description, or location search.',
    }
  }
  const states = {
    all: {
      title: 'Showroom Display Register is empty',
      body: 'Add the first manually verified fireplace display so quotes and follow-up drafts can use safe showroom context.',
    },
    'on-display': {
      title: 'No displays marked on display',
      body: 'Mark a record On Display once someone confirms it is physically on the floor or in the cellar.',
    },
    'needs-verification': {
      title: 'Nothing waiting on verification',
      body: 'Use Needs Verification when a display might be present but should not be promised yet.',
    },
    'first-floor': {
      title: 'No First Floor displays yet',
      body: 'Add a First Floor display once the product and location are manually confirmed.',
    },
    cellar: {
      title: 'No Cellar displays yet',
      body: 'Add a Cellar display once the product and location are manually confirmed.',
    },
    'unknown-location': {
      title: 'No unknown-location records',
      body: 'Unknown Location records help flag displays that still need a physical location check.',
    },
  }
  return states[filter] || states.all
}

export function deriveShowroomDisplayContext(input = {}) {
  const displayRecords = input.displayRecords || []
  const candidateText = candidateSearchText(input)
  const candidateTokens = tokenize(candidateText)
  const codes = candidateCodes(input)
  const exactMatch = displayRecords.find((record) => {
    const code = normalizeCode(record.productCode)
    return code && codes.includes(code)
  }) || null

  const suggestedMatches = exactMatch
    ? []
    : displayRecords
      .map((record) => ({ record, score: scoreSuggestedMatch(record, candidateTokens) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((entry) => entry.record)

  const strongestMatch = exactMatch || suggestedMatches[0] || null
  const exactOnDisplay = Boolean(exactMatch && exactMatch.displayStatus === 'on-display')
  const exactNeedsVerification = Boolean(exactMatch && ['needs-verification', 'unknown'].includes(exactMatch.displayStatus))

  let chipLabel = ''
  let tone = 'neutral'
  let headline = ''
  let note = ''

  if (exactOnDisplay) {
    chipLabel = `On Display: ${locationLabel(exactMatch.locationZone, '')}`
    tone = 'ready'
    headline = 'Manually verified showroom display'
    note = 'Ask before saying the customer saw it.'
  } else if (exactNeedsVerification) {
    chipLabel = 'Display status needs verification'
    tone = 'warning'
    headline = 'Matching product found in Display Register'
    note = 'Ask before saying the customer saw it.'
  } else if (exactMatch) {
    chipLabel = 'Display record found'
    tone = 'neutral'
    headline = 'Matching product found in Display Register'
    note = 'Ask before saying the customer saw it.'
  } else if (suggestedMatches.length) {
    chipLabel = 'Possible showroom display match'
    tone = 'warning'
    headline = 'Possible showroom display match'
    note = 'Suggestion only. Do not use it in customer-facing copy without manual confirmation.'
  }

  return {
    status: exactOnDisplay
      ? 'exact-on-display'
      : exactNeedsVerification
        ? 'exact-needs-verification'
        : exactMatch
          ? 'exact-other'
          : suggestedMatches.length
            ? 'suggested'
            : 'none',
    chipLabel,
    tone,
    headline,
    note,
    exactMatch,
    suggestedMatches,
    strongestMatch,
    locationLabel: strongestMatch ? locationLabel(strongestMatch.locationZone, strongestMatch.locationDetail) : '',
    talkingPoints: strongestMatch ? splitLines(strongestMatch.talkingPoints) : [],
    internalNotes: strongestMatch ? splitLines(strongestMatch.internalNotes) : [],
    customerFacingAllowed: exactOnDisplay,
    followUpContext: {
      displayModelAvailable: exactOnDisplay,
      displayModelLocation: exactOnDisplay ? locationLabel(exactMatch.locationZone, exactMatch.locationDetail) : '',
      warnings: suggestedMatches.length || exactNeedsVerification
        ? ['Display-model wording requires salesperson confirmation. Do not say the customer viewed it unless approved notes confirm that.']
        : [],
    },
  }
}

