import {
  createOpportunityFromCurrentQuote,
  findOpportunityDuplicate,
  listOpportunities,
  sanitizeOpportunity,
} from './opportunities.js'

const setupBlockerPattern = /current appliance type is unknown|chimney or venting path|fuel type is unknown|customer says insert|framing|electrical availability/i
const sensitivePattern = /raw\s*ocr|file\s*bytes|private\s*(file\s*)?path|average\s*cost|buy\s*price|\bcost\b|\bmargin\b|supplier|product\s*rank|sales\s*rank|internal\s*confidence|fuzzy\s*match/i

function uniqueWarnings(warnings) {
  return [...new Set(warnings.filter(Boolean))]
}

function sourceFileNameFromContext(parseContext = {}) {
  const value = String(parseContext.sourceFileName || '')
  if (!value) return ''
  return value.split(/[\\/]/).pop()
}

function projectTitle(fields = {}) {
  return safeText(fields.PROJECT_TITLE || fields.PO_NUMBER || '')
}

function safeText(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !sensitivePattern.test(line))
    .join('\n')
}

function productsNotes(fields = {}, lineItems = []) {
  const explicit = [fields.PROJECT_SCOPE_SUMMARY, fields.INSTALLATION_SCOPE, fields.PROJECT_NOTES].map(safeText).filter(Boolean).join('\n')
  if (explicit) return explicit
  return lineItems.slice(0, 8).map((item) => safeText(item.description)).filter(Boolean).join('\n')
}

function determineReviewWarnings({ fields, setupGuidance, proposalReviewState, lineItemQuoteAttached, sendReadinessWarnings }) {
  const warnings = [...sendReadinessWarnings]
  if (!fields.CUSTOMER_NAME || (!fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE && !fields.CUSTOMER_EMAIL)) {
    warnings.push('Missing customer contact info. Confirm preferred contact before follow-up.')
  }
  if (proposalReviewState === 'unresolved') warnings.push('Proposal readiness unresolved. Review before follow-up.')
  if (proposalReviewState === 'follow-up') warnings.push('Follow-up details needed before proposal send.')
  if (!lineItemQuoteAttached) warnings.push('Original BisTrack line-item quote attachment is not confirmed.')
  if ((setupGuidance?.blockers || []).some((warning) => setupBlockerPattern.test(warning))) {
    warnings.push('Current setup or customer goal needs clarification before sending.')
  }
  return uniqueWarnings(warnings)
}

function determineStatus({ baseStatus, warnings, proposalReviewState, lineItemQuoteAttached }) {
  if (baseStatus === 'reference-only') return 'reference-only'
  if (warnings.some((warning) => /missing customer contact|readiness unresolved|attachment is not confirmed|current setup|goal needs clarification/i.test(warning))) {
    return 'needs-review'
  }
  if (proposalReviewState === 'follow-up') return 'follow-up-needed'
  if (proposalReviewState === 'reviewed' && lineItemQuoteAttached) return 'ready-for-proposal'
  return baseStatus || 'needs-review'
}

function determineReadiness(status, warnings, proposalReviewState, lineItemQuoteAttached) {
  if (status === 'reference-only') return 'blocked'
  if (proposalReviewState === 'reviewed' && lineItemQuoteAttached && warnings.length === 0) return 'ready'
  if (proposalReviewState === 'follow-up') return 'needs-review'
  return 'blocked'
}

function determineClassification(status, fields) {
  if (!fields.CUSTOMER_NAME || (!fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE && !fields.CUSTOMER_EMAIL)) return 'missing-contact'
  if (status === 'ready-for-proposal') return 'hot'
  if (status === 'follow-up-needed') return 'warm'
  if (status === 'reference-only') return 'reference-only'
  return 'needs-review'
}

function determineNextAction({ status, proposalReviewState, lineItemQuoteAttached }) {
  if (status === 'reference-only') return 'Archive or keep as reference'
  if (!lineItemQuoteAttached) return 'Confirm attached line-item quote'
  if (proposalReviewState === 'unresolved') return 'Review before follow-up'
  if (proposalReviewState === 'follow-up') return 'Confirm follow-up details'
  if (status === 'ready-for-proposal') return 'Prepare customer-facing proposal'
  return 'Review saved quote'
}

export function createQuotePolishOpportunity({
  fields = {},
  parseContext = {},
  lineItems = [],
  proposalMode = 'summary',
  proposalReviewState = 'unresolved',
  lineItemQuoteAttached = false,
  setupGuidance = {},
  sendReadinessWarnings = [],
  now = new Date(),
} = {}) {
  const nowDate = new Date(now)
  const importedAt = nowDate.toISOString()
  const sourceFileName = sourceFileNameFromContext(parseContext)
  const safeParseContext = {
    ...parseContext,
    sourceType: 'quote-polish',
    sourceLabel: parseContext.sourceLabel || 'Quote Polish / BisTrack PDF',
    sourceFileName,
    sourceImportedAt: parseContext.sourceImportedAt || importedAt,
    sourceConfidence: '',
    sourceWarnings: [],
  }

  const base = createOpportunityFromCurrentQuote({
    fields,
    parseContext: safeParseContext,
    productIntelligence: { needsReviewCount: 0, groupedRows: [] },
    playbookRecommendation: { id: 'quote-polish-proposal', warnings: [] },
    now: nowDate,
  })

  const reviewWarnings = determineReviewWarnings({
    fields,
    setupGuidance,
    proposalReviewState,
    lineItemQuoteAttached,
    sendReadinessWarnings,
  })
  const warnings = uniqueWarnings([...base.warnings, ...reviewWarnings])
  const status = determineStatus({
    baseStatus: base.status,
    warnings,
    proposalReviewState,
    lineItemQuoteAttached,
  })
  const proposalReadiness = determineReadiness(status, warnings, proposalReviewState, lineItemQuoteAttached)
  const recoveryClassification = determineClassification(status, fields)
  const nextAction = determineNextAction({ status, proposalReviewState, lineItemQuoteAttached })

  return sanitizeOpportunity({
    ...base,
    sourceType: 'quote-polish',
    sourceLabel: safeParseContext.sourceLabel,
    sourceFileName,
    sourceImportedAt: safeParseContext.sourceImportedAt,
    sourceConfidence: '',
    sourceWarnings: [],
    sourceTrailNote: [
      'Saved from Quote Polish',
      sourceFileName ? `Source file: ${sourceFileName}` : '',
      fields.QUOTE_NO ? `Quote #${fields.QUOTE_NO}` : '',
    ].filter(Boolean).join(' | '),
    projectTitle: projectTitle(fields),
    originalQuoteAmount: fields.TOTAL_AMOUNT || fields.QUOTATION_TOTAL || '',
    quotationTotal: fields.QUOTATION_TOTAL || fields.TOTAL_AMOUNT || '',
    existingSetup: safeText(fields.INSTALLATION_SCOPE),
    desiredOutcome: safeText(fields.PROJECT_OVERVIEW || fields.PROJECT_SCOPE_SUMMARY),
    productsNotes: productsNotes(fields, lineItems),
    status,
    temperature: status === 'ready-for-proposal' ? 'hot' : status === 'follow-up-needed' ? 'warm' : base.temperature,
    warnings,
    nextAction,
    proposalReadiness,
    proposalMode,
    proposalReviewState,
    lineItemQuoteAttached: lineItemQuoteAttached ? 'true' : 'false',
    recoverySource: 'true',
    recoveryClassification,
    needsRefresh: '',
    reviewedForFollowUp: proposalReviewState === 'reviewed' ? 'true' : 'false',
    internalNotes: '',
    updatedAt: importedAt,
  })
}

export function findQuotePolishDuplicate(opportunity, existingOpportunities = listOpportunities()) {
  return findOpportunityDuplicate(opportunity, existingOpportunities)
}

export function mergeQuotePolishOpportunity(existing = {}, incoming = {}, now = new Date()) {
  return sanitizeOpportunity({
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    customerName: incoming.customerName || existing.customerName || '',
    customerEmail: incoming.customerEmail || existing.customerEmail || '',
    customerPhone: incoming.customerPhone || existing.customerPhone || '',
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: new Date(now).toISOString(),
  })
}

export function buildQuotePolishQueueDraft(input = {}, existingOpportunities = listOpportunities()) {
  const opportunity = createQuotePolishOpportunity(input)
  const duplicate = findQuotePolishDuplicate(opportunity, existingOpportunities)
  return { opportunity, duplicate }
}
