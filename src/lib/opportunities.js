export const opportunityStatuses = [
  'new-intake',
  'needs-review',
  'ready-for-proposal',
  'follow-up-needed',
  'proposal-sent',
  'waiting-on-customer',
  'closed-won',
  'closed-lost',
  'reference-only',
  'archived',
]

export const opportunityTemperatures = ['hot', 'warm', 'cool', 'unknown']
export const proposalReadinessOptions = ['blocked', 'needs-review', 'ready', 'sent']

const STORAGE_KEY = 'benson-stone-opportunity-queue-v1'

const storedKeys = [
  'id',
  'customerName',
  'customerEmail',
  'customerPhone',
  'quoteNumber',
  'quoteDate',
  'projectType',
  'status',
  'temperature',
  'sourceType',
  'recommendedPlaybookId',
  'selectedPlaybookId',
  'warnings',
  'nextAction',
  'nextActionDue',
  'lastContactedAt',
  'proposalReadiness',
  'createdAt',
  'updatedAt',
]

function parseCurrency(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function parseQuoteDate(value, now) {
  if (!value) return null
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) return null
  const [, month, day, year] = match
  const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year)
  const date = new Date(fullYear, Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function normalizeIdPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function sourceTypeFromContext(parseContext = {}) {
  if (parseContext.extractionSource === 'ocr') return 'OCR scanned source'
  if (parseContext.documentType && parseContext.documentType !== 'notes') return 'BisTrack PDF'
  if (parseContext.documentType === 'notes') return 'Pasted notes'
  return 'Internal/reference source'
}

function projectTypeFromContext(parseContext = {}, productIntelligence = {}) {
  if (parseContext.itemMix === 'outdoor') return 'Outdoor Living'
  const groups = (productIntelligence.groupedRows || []).map((group) => group.group)
  if (groups.includes('Fireplace Unit')) return 'Fireplace'
  if (groups.includes('Venting / Chimney')) return 'Venting / Chimney'
  return parseContext.outputLabel || 'Fireplace Project'
}

function isReferenceContext(parseContext = {}, fields = {}) {
  if (parseContext.fullyPaid) return true
  if (['bill', 'invoice', 'receipt'].includes(parseContext.documentType)) return true
  const balanceDue = parseCurrency(fields.BALANCE_DUE)
  const amountPaid = parseCurrency(fields.AMOUNT_PAID)
  return balanceDue === 0 && amountPaid !== null && amountPaid > 0
}

function warningMatches(warnings, pattern) {
  return warnings.some((warning) => pattern.test(warning))
}

function uniqueWarnings(warnings) {
  return [...new Set(warnings.filter(Boolean))]
}

function getMajorWarnings(warnings) {
  return warnings.filter((warning) => !/Sensitive BisTrack fields excluded/i.test(warning))
}

function determineStatus({ fields, parseContext, productIntelligence, warnings, quoteAgeDays }) {
  if (isReferenceContext(parseContext, fields)) return 'reference-only'
  if (!fields.CUSTOMER_NAME || (!fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE)) return 'needs-review'
  if ((productIntelligence.needsReviewCount || 0) > 0) return 'needs-review'
  if (warningMatches(warnings, /missing|needs review|paid\/closed\/reference/i)) return 'needs-review'
  if (quoteAgeDays !== null && quoteAgeDays > 90) return 'follow-up-needed'
  return 'ready-for-proposal'
}

function determineReadiness(status, warnings) {
  if (status === 'proposal-sent') return 'sent'
  if (status === 'ready-for-proposal' && getMajorWarnings(warnings).length === 0) return 'ready'
  if (status === 'reference-only' || status === 'needs-review') return 'blocked'
  return 'needs-review'
}

function determineTemperature(status, quoteAgeDays) {
  if (status === 'ready-for-proposal') return 'hot'
  if (status === 'follow-up-needed') return quoteAgeDays !== null && quoteAgeDays > 180 ? 'cool' : 'warm'
  if (status === 'waiting-on-customer' || status === 'proposal-sent') return 'warm'
  return 'unknown'
}

function determineNextAction(status) {
  if (status === 'ready-for-proposal') return 'Prepare customer-facing proposal'
  if (status === 'follow-up-needed') return 'Send follow-up path'
  if (status === 'reference-only') return 'Archive or keep as reference'
  if (status === 'needs-review') return 'Review before sending'
  if (status === 'waiting-on-customer') return 'Check back with customer'
  return 'Review opportunity'
}

function determineDueDate(status, now) {
  if (status === 'ready-for-proposal' || status === 'needs-review') return addDays(now, 1)
  if (status === 'follow-up-needed' || status === 'waiting-on-customer') return addDays(now, 3)
  return ''
}

function makeOpportunityId(fields, now) {
  if (fields.QUOTE_NO) return `quote-${normalizeIdPart(fields.QUOTE_NO)}`
  const customer = normalizeIdPart(fields.CUSTOMER_NAME)
  const date = normalizeIdPart(fields.QUOTE_DATE)
  if (customer || date) return `quote-${[customer, date].filter(Boolean).join('-')}`
  return `opportunity-${now.toISOString().replace(/[:.]/g, '-')}`
}

export function sanitizeOpportunity(opportunity) {
  const clean = Object.fromEntries(storedKeys.map((key) => [key, opportunity[key] ?? '']))
  clean.warnings = Array.isArray(opportunity.warnings) ? opportunity.warnings.slice() : []
  return clean
}

export function createOpportunityFromCurrentQuote({
  fields = {},
  parseContext = {},
  productIntelligence = {},
  playbookRecommendation = {},
  now = new Date(),
}) {
  const nowDate = new Date(now)
  const quoteAgeDays = parseQuoteDate(fields.QUOTE_DATE, nowDate)
  const modelWarnings = []
  if (isReferenceContext(parseContext, fields)) modelWarnings.push('Quote appears paid/closed/reference. Do not treat it as an active proposal without confirmation.')
  if (!fields.CUSTOMER_NAME || (!fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE)) modelWarnings.push('Missing customer contact info. Confirm preferred contact before sending.')
  if ((productIntelligence.needsReviewCount || 0) > 0) modelWarnings.push('Product match needs review before presenting selections as confirmed.')
  if (quoteAgeDays !== null && quoteAgeDays > 90) modelWarnings.push('Customer-facing proposal may need quote refresh before sending.')
  const warnings = uniqueWarnings([...(playbookRecommendation.warnings || []), ...modelWarnings])
  const status = determineStatus({ fields, parseContext, productIntelligence, warnings, quoteAgeDays })
  const proposalReadiness = determineReadiness(status, warnings)
  const temperature = determineTemperature(status, quoteAgeDays)
  const timestamp = nowDate.toISOString()

  return sanitizeOpportunity({
    id: makeOpportunityId(fields, nowDate),
    customerName: fields.CUSTOMER_NAME || '',
    customerEmail: fields.CUSTOMER_EMAIL || '',
    customerPhone: fields.CUSTOMER_PHONE || fields.PROJECT_PHONE || '',
    quoteNumber: fields.QUOTE_NO || '',
    quoteDate: fields.QUOTE_DATE || '',
    projectType: projectTypeFromContext(parseContext, productIntelligence),
    status,
    temperature,
    sourceType: sourceTypeFromContext(parseContext),
    recommendedPlaybookId: playbookRecommendation.id || '',
    selectedPlaybookId: playbookRecommendation.id || '',
    warnings,
    nextAction: determineNextAction(status),
    nextActionDue: determineDueDate(status, nowDate),
    lastContactedAt: '',
    proposalReadiness,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function getStorage(storage = globalThis.localStorage) {
  return storage || null
}

export function listOpportunities(storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  try {
    const parsed = JSON.parse(localStorageRef.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeOpportunity) : []
  } catch {
    return []
  }
}

function writeOpportunities(opportunities, storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  const clean = opportunities.map(sanitizeOpportunity)
  localStorageRef.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export function saveOpportunity(opportunity, storage) {
  const clean = sanitizeOpportunity(opportunity)
  const existing = listOpportunities(storage)
  const index = existing.findIndex((item) => item.id === clean.id)
  const merged = index === -1
    ? [clean, ...existing]
    : existing.map((item) => item.id === clean.id ? { ...item, ...clean, createdAt: item.createdAt || clean.createdAt } : item)
  writeOpportunities(merged, storage)
  return clean
}

export function updateOpportunity(id, patch, storage) {
  const existing = listOpportunities(storage)
  const updated = existing.map((item) =>
    item.id === id
      ? sanitizeOpportunity({ ...item, ...patch, id, updatedAt: patch.updatedAt || new Date().toISOString() })
      : item
  )
  writeOpportunities(updated, storage)
  return updated.find((item) => item.id === id) || null
}

export function removeOpportunity(id, storage) {
  const remaining = listOpportunities(storage).filter((item) => item.id !== id)
  writeOpportunities(remaining, storage)
  return remaining
}

export function summarizeOpportunities(opportunities) {
  return {
    needsReview: opportunities.filter((item) => item.status === 'needs-review').length,
    readyForProposal: opportunities.filter((item) => item.status === 'ready-for-proposal').length,
    followUpNeeded: opportunities.filter((item) => item.status === 'follow-up-needed').length,
    waitingOnCustomer: opportunities.filter((item) => item.status === 'waiting-on-customer').length,
    closedReference: opportunities.filter((item) => ['closed-won', 'closed-lost', 'reference-only', 'archived'].includes(item.status)).length,
  }
}

export function filterOpportunities(opportunities, filter) {
  if (filter === 'needs-review') return opportunities.filter((item) => item.status === 'needs-review')
  if (filter === 'ready-for-proposal') return opportunities.filter((item) => item.status === 'ready-for-proposal')
  if (filter === 'follow-up-needed') return opportunities.filter((item) => item.status === 'follow-up-needed')
  if (filter === 'waiting-on-customer') return opportunities.filter((item) => item.status === 'waiting-on-customer')
  if (filter === 'closed-reference') return opportunities.filter((item) => ['closed-won', 'closed-lost', 'reference-only', 'archived'].includes(item.status))
  return opportunities
}
