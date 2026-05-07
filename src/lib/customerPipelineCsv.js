import {
  createOpportunityFromCurrentQuote,
  findOpportunityDuplicate,
  isSafeBulkAddDraft,
  sanitizeOpportunity,
  summarizeDrafts,
} from './opportunities.js'

const REQUIRED_HEADERS = ['Customer Name']

const STAGE_TO_STATUS = {
  'active - quote stage': 'needs-review',
  'active - quote sent': 'waiting-on-customer',
  'won - completed': 'closed-won',
  'lost': 'closed-lost',
  'closed - lost': 'closed-lost',
  'historical - unknown status': 'follow-up-needed',
  'stale - check status': 'follow-up-needed',
  'dead / needs revival': 'reference-only',
  'reference': 'reference-only',
}

function stripBom(value) {
  return value.replace(/^﻿/, '')
}

export function parseCsv(text) {
  const cleaned = stripBom(String(text || ''))
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  let cellStart = true
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') { cell += '"'; i++ }
        else { inQuotes = false }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      if (cellStart) { inQuotes = true; cellStart = false; continue }
      if (cleaned[i + 1] === '"') { cell += '"'; i++; continue }
      cell += '"'
      continue
    }
    if (ch === ',') { row.push(cell); cell = ''; cellStart = true; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; cellStart = true; continue }
    cell += ch
    cellStart = false
  }
  row.push(cell)
  rows.push(row)
  return rows.filter((r) => r.some((value) => String(value).trim().length > 0))
}

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function extractFirstPhone(value) {
  const match = String(value || '').match(/(\+?\d[\d\s().-]{6,}\d)/)
  if (!match) return ''
  const digits = match[1].replace(/[^\d]/g, '')
  if (digits.length < 7) return ''
  return match[1].trim()
}

function cleanCustomerName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/"+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDateLoose(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const match = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) return ''
  const [, m, d, y] = match
  const yyyy = y.length === 2 ? `20${y}` : y
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${yyyy}`
}

function parseCurrencyToString(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^\$?[\d.,]+$/.test(trimmed.replace(/\s/g, ''))) {
    return trimmed.startsWith('$') ? trimmed : `$${trimmed}`
  }
  return ''
}

function pickStatus(stageRaw) {
  const key = String(stageRaw || '').trim().toLowerCase()
  if (STAGE_TO_STATUS[key]) return STAGE_TO_STATUS[key]
  for (const [stage, status] of Object.entries(STAGE_TO_STATUS)) {
    if (key.includes(stage)) return status
  }
  return ''
}

function projectTypeFromInterest(interest) {
  const value = String(interest || '').toLowerCase()
  if (!value || /^n\/?a$/.test(value.trim())) return 'Fireplace Project'
  if (/grill|bbq/.test(value)) return 'Outdoor Living'
  if (/insert/.test(value)) return 'Fireplace Insert'
  if (/stove/.test(value)) return 'Stove'
  if (/door|surround/.test(value)) return 'Door / Surround'
  return 'Fireplace'
}

function combineNotes(parts) {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join(' | ')
}

export function normalizePipelineRow(rawRow) {
  const name = cleanCustomerName(rawRow['Customer Name'])
  if (!name) return null
  const phone = extractFirstPhone(rawRow['Phone'])
  const email = String(rawRow['Email'] || '').trim()
  const stage = String(rawRow['Stage'] || '').trim()
  const source = String(rawRow['Source'] || '').trim()
  const whoHelped = String(rawRow['Who Helped'] || '').trim()
  const fireplaceInterest = String(rawRow['Fireplace / Product Interest'] || '').trim()
  const stoneInterest = String(rawRow['Stone / Surround Interest'] || '').trim()
  const total = parseCurrencyToString(rawRow['Quote Total'])
  const nextAction = String(rawRow['Next Action'] || '').trim()
  const notes = String(rawRow['Notes'] || '').trim()
  const dateVisited = parseDateLoose(rawRow['Date Visited'])

  return {
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    rawPhoneCell: String(rawRow['Phone'] || '').trim(),
    quoteDate: dateVisited,
    stage,
    status: pickStatus(stage),
    source,
    whoHelped,
    projectType: projectTypeFromInterest(fireplaceInterest),
    productsNotes: combineNotes([fireplaceInterest, stoneInterest]),
    quoteTotal: total,
    nextAction,
    internalNotes: combineNotes([
      whoHelped ? `Helped by ${whoHelped}` : '',
      notes,
      String(rawRow['Phone'] || '').trim() && String(rawRow['Phone']).trim() !== phone
        ? `Phone cell raw: ${String(rawRow['Phone']).trim()}`
        : '',
    ]),
  }
}

export function parseCustomerPipelineCsv(text) {
  const rows = parseCsv(text)
  if (!rows.length) return { headers: [], records: [], skipped: 0 }
  const headers = rows[0].map((h) => String(h || '').trim())
  const normalizedHeaders = headers.map(normalizeHeader)
  const missing = REQUIRED_HEADERS.filter(
    (req) => !normalizedHeaders.includes(normalizeHeader(req))
  )
  if (missing.length) {
    return { headers, records: [], skipped: 0, error: `Missing required columns: ${missing.join(', ')}` }
  }
  const records = []
  let skipped = 0
  for (let i = 1; i < rows.length; i++) {
    const raw = {}
    headers.forEach((h, idx) => { raw[h] = rows[i][idx] ?? '' })
    const normalized = normalizePipelineRow(raw)
    if (!normalized) { skipped += 1; continue }
    records.push(normalized)
  }
  return { headers, records, skipped }
}

function statusOverrideOpportunity(opportunity, overrideStatus) {
  if (!overrideStatus) return opportunity
  return sanitizeOpportunity({
    ...opportunity,
    status: overrideStatus,
    proposalReadiness: overrideStatus === 'closed-won' || overrideStatus === 'closed-lost'
      ? 'sent'
      : overrideStatus === 'reference-only'
        ? 'blocked'
        : opportunity.proposalReadiness,
    temperature: overrideStatus === 'closed-won' || overrideStatus === 'closed-lost' || overrideStatus === 'reference-only'
      ? 'unknown'
      : opportunity.temperature,
  })
}

export function buildPipelineDraft(record, { existingOpportunities = [], now = new Date() } = {}) {
  const fields = {
    CUSTOMER_NAME: record.customerName,
    CUSTOMER_PHONE: record.customerPhone,
    CUSTOMER_EMAIL: record.customerEmail,
    QUOTE_DATE: record.quoteDate,
    QUOTATION_TOTAL: record.quoteTotal,
  }
  const parseContext = {
    documentType: 'notes',
    sourceType: 'customer-pipeline-csv',
    sourceLabel: record.source ? `Customer Pipeline CSV (${record.source})` : 'Customer Pipeline CSV',
    sourceFileName: 'Customer Pipeline.csv',
    sourceImportedAt: new Date(now).toISOString(),
    sourceConfidence: '',
    sourceWarnings: [],
    outputLabel: record.projectType || 'Fireplace Project',
  }
  const opportunity = createOpportunityFromCurrentQuote({
    fields,
    parseContext,
    productIntelligence: { needsReviewCount: 0, groupedRows: [] },
    playbookRecommendation: { id: '', warnings: [] },
    now,
  })
  const withOverride = statusOverrideOpportunity(opportunity, record.status)
  const withRecord = sanitizeOpportunity({
    ...withOverride,
    projectType: record.projectType || withOverride.projectType,
    productsNotes: record.productsNotes,
    originalQuoteAmount: record.quoteTotal,
    quotationTotal: record.quoteTotal,
    nextAction: record.nextAction || withOverride.nextAction,
    internalNotes: record.internalNotes,
    sourceTrailNote: record.source,
    recoverySource: 'true',
  })
  const duplicate = findOpportunityDuplicate(withRecord, existingOpportunities)
  const finalOpportunity = duplicate.isDuplicate && duplicate.confidence !== 'high'
    ? sanitizeOpportunity({
      ...withRecord,
      status: 'needs-review',
      proposalReadiness: 'blocked',
      warnings: [...(withRecord.warnings || []), 'Possible duplicate requires review before adding to queue.'],
    })
    : withRecord
  return {
    id: `${finalOpportunity.id}-pipeline`,
    opportunity: finalOpportunity,
    duplicate,
    sourceLabel: parseContext.sourceLabel,
    action: duplicate.isDuplicate && duplicate.confidence === 'high'
      ? 'update-existing'
      : finalOpportunity.status === 'needs-review'
        ? 'review-first'
        : 'add',
  }
}

export function createOpportunityDraftsFromPipelineCsv(text, { existingOpportunities = [], now = new Date() } = {}) {
  const parsed = parseCustomerPipelineCsv(text)
  if (parsed.error) return { error: parsed.error, drafts: [], summary: summarizeDrafts([]), skipped: parsed.skipped }
  const drafts = parsed.records.map((record) => buildPipelineDraft(record, { existingOpportunities, now }))
  return {
    skipped: parsed.skipped,
    drafts,
    summary: { ...summarizeDrafts(drafts), importedPackets: 1 },
    importedPacketCount: 1,
  }
}

export function getPipelineDraftReadiness(drafts) {
  return drafts.filter((draft) => isSafeBulkAddDraft(draft)).length
}
