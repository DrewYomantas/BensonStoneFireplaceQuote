// Scanned packet grouping helpers (Milestone 19.7).
// Pure logic — no storage, no DOM, no File objects, no image bytes.
// Suggests which pages belong together as one customer packet, builds
// a packet group draft from selected pages, and imports it as one Customer File.

import { saveCustomerFileDurable } from './customerFileDurable.js'
import { appendActivityForFile } from './visitActivity.js'

// ---- Constants ---------------------------------------------------------------

// Reference doc types never produce customer identity on their own.
const REFERENCE_DOC_TYPES = new Set(['photo_or_sketch', 'unknown'])

// ---- Scrub -------------------------------------------------------------------

const BANNED_PHRASES = ['ready to send', 'proposal ready', 'customer ready', 'approved']
const SENSITIVE_TERMS = [
  'cost', 'buy price', 'average cost', 'margin', 'supplier total',
  'product rank', 'sales rank', 'raw ocr', 'raw pdf', 'ocr confidence',
  'fuzzy confidence', 'bistrack confidence', 'fuzzy match', 'internal confidence',
  'private catalog', 'private file path',
]

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value).trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  for (const p of BANNED_PHRASES) if (lower.includes(p)) return ''
  for (const t of SENSITIVE_TERMS) if (lower.includes(t)) return ''
  return s
}

// ---- Duplicate detection -----------------------------------------------------

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function detectPacketDuplicate(draft, existingFiles) {
  if (!Array.isArray(existingFiles)) return null
  const phone = normalizePhone(draft.phone)
  const email = normalizeEmail(draft.email)
  const name = normalizeName(draft.customerName)
  for (const file of existingFiles) {
    const fPhone = normalizePhone(file.customerPhone)
    const fEmail = normalizeEmail(file.customerEmail)
    if (phone && fPhone && phone === fPhone) return { kind: 'phone', existingId: file.id || '' }
    if (email && fEmail && email === fEmail) return { kind: 'email', existingId: file.id || '' }
  }
  if (name) {
    for (const file of existingFiles) {
      const fName = normalizeName(file.customerName)
      if (fName && fName === name) return { kind: 'name', existingId: file.id || '' }
    }
  }
  return null
}

// ---- Part A: suggestPageGroups -----------------------------------------------

// Suggests groups of pages that likely belong to the same customer packet.
// Returns an array of { pageIds, pageNumbers, reason, label }.
// Handles non-adjacent pages (same quote / same customer anywhere in the packet)
// and adjacent reference pages (photo/sketch/unknown next to a real page).
// Never auto-merges — caller shows these as soft suggestions only.
export function suggestPageGroups(pageItems) {
  if (!Array.isArray(pageItems) || pageItems.length < 2) return []
  const suggestions = []
  const seenGroupKeys = new Set()

  function groupKey(ids) {
    return ids.slice().sort().join('::')
  }

  // Pass 1: same quote number (non-adjacent allowed)
  const byQuote = {}
  for (const p of pageItems) {
    const q = String((p.scanDraftFields || {}).quoteNumber || '').trim().toLowerCase()
    if (!q) continue
    if (!byQuote[q]) byQuote[q] = []
    byQuote[q].push(p)
  }
  for (const [, group] of Object.entries(byQuote)) {
    if (group.length < 2) continue
    const pageIds = group.map((p) => p.id)
    const pageNumbers = group.map((p) => p.pageNumber).sort((a, b) => a - b)
    const key = groupKey(pageIds)
    if (seenGroupKeys.has(key)) continue
    seenGroupKeys.add(key)
    const qDisplay = String((group[0].scanDraftFields || {}).quoteNumber || '').trim()
    suggestions.push({
      pageIds,
      pageNumbers,
      reason: 'same_quote',
      label: `Possible same packet — ${pageNumbers.length} pages share quote/order #${qDisplay}`,
    })
  }

  // Pass 2: same customer name (non-adjacent allowed)
  const byName = {}
  for (const p of pageItems) {
    const n = String((p.scanDraftFields || {}).customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!n || n.length < 3) continue
    if (!byName[n]) byName[n] = []
    byName[n].push(p)
  }
  for (const [, group] of Object.entries(byName)) {
    if (group.length < 2) continue
    const pageIds = group.map((p) => p.id)
    const pageNumbers = group.map((p) => p.pageNumber).sort((a, b) => a - b)
    const key = groupKey(pageIds)
    if (seenGroupKeys.has(key)) continue
    seenGroupKeys.add(key)
    suggestions.push({
      pageIds,
      pageNumbers,
      reason: 'same_customer',
      label: `Possible same packet — ${pageNumbers.length} pages share customer name`,
    })
  }

  // Pass 3: adjacent reference page next to a non-reference page
  for (let i = 0; i < pageItems.length - 1; i++) {
    const a = pageItems[i]
    const b = pageItems[i + 1]
    const aIsRef = REFERENCE_DOC_TYPES.has(a.detectedDocType)
    const bIsRef = REFERENCE_DOC_TYPES.has(b.detectedDocType)
    if (aIsRef === bIsRef) continue
    const key = groupKey([a.id, b.id])
    if (seenGroupKeys.has(key)) continue
    seenGroupKeys.add(key)
    const refPage = aIsRef ? a : b
    const realPage = aIsRef ? b : a
    const pageNumbers = [refPage.pageNumber, realPage.pageNumber].sort((x, y) => x - y)
    suggestions.push({
      pageIds: [refPage.id, realPage.id],
      pageNumbers,
      reason: 'adjacent_reference',
      label: `Reference page (${refPage.pageNumber}) may belong with page ${realPage.pageNumber}`,
    })
  }

  return suggestions
}

// ---- Part A: buildPacketGroupDraft -------------------------------------------

function generateDraftId() {
  return `pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

// Generate warnings for a packet group draft.
// Exported for re-evaluation after field edits.
export function revalidatePacketGroupDraft(draft, existingFiles = []) {
  if (!draft) return draft
  return { ...draft, warnings: _buildPacketDraftWarnings(draft, existingFiles) }
}

export function _buildPacketDraftWarnings(draft, existingFiles = []) {
  const warnings = []
  if (!draft.customerName) warnings.push('Missing customer name')
  if (!draft.phone && !draft.email) warnings.push('Missing contact info')
  const dup = detectPacketDuplicate(draft, existingFiles)
  if (dup) {
    if (dup.kind === 'phone' || dup.kind === 'email') {
      warnings.push('Possible duplicate — same contact already in Customer Files. Needs review before importing.')
    } else if (dup.kind === 'name') {
      warnings.push('Possible duplicate — same name already in Customer Files. Needs review before importing.')
    }
  }
  return warnings
}

// Build a packet group draft from an array of selected page items.
// options.existingFiles — for duplicate detection.
// options.sourceFileName — the original upload file name (no path).
// Returns { id, sourceFileName, pageNumbers, detectedDocTypes, customerName,
//           phone, email, address, quoteNumbers, orderNumbers, notes, warnings }.
// Does not mutate the input pages.
export function buildPacketGroupDraft(selectedPages, options = {}) {
  if (!Array.isArray(selectedPages) || selectedPages.length === 0) return null
  const sourceFileName = safe(options.sourceFileName || '')
  const existingFiles = Array.isArray(options.existingFiles) ? options.existingFiles : []

  let customerName = ''
  let phone = ''
  let email = ''
  let address = ''
  const quoteNumbers = []
  const detectedDocTypes = []
  const pageNumbers = []

  for (const page of selectedPages) {
    pageNumbers.push(page.pageNumber)
    const docType = String(page.detectedDocType || 'unknown')
    if (!detectedDocTypes.includes(docType)) detectedDocTypes.push(docType)
    // Skip identity fields from reference pages
    if (REFERENCE_DOC_TYPES.has(docType)) continue
    const f = page.scanDraftFields || {}
    if (!customerName && f.customerName) customerName = safe(f.customerName)
    if (!phone && f.customerPhone) phone = safe(f.customerPhone)
    if (!email && f.customerEmail) email = safe(f.customerEmail)
    if (!address && f.projectAddress) address = safe(f.projectAddress)
    if (f.quoteNumber) {
      const qn = safe(f.quoteNumber)
      if (qn && !quoteNumbers.includes(qn)) quoteNumbers.push(qn)
    }
  }

  pageNumbers.sort((a, b) => a - b)

  const draft = {
    id: generateDraftId(),
    sourceFileName,
    pageNumbers,
    detectedDocTypes,
    customerName,
    phone,
    email,
    address,
    quoteNumbers,
    orderNumbers: [],
    notes: '',
    warnings: [],
  }
  draft.warnings = _buildPacketDraftWarnings(draft, existingFiles)
  return draft
}

// ---- Part A: normalizeSourceTrail -------------------------------------------

const TRAIL_BANNED_KEYS = new Set([
  'rawOcr', 'rawPdf', 'ocrText', 'imageData', 'canvasData',
  'filePath', 'localPath',
  'cost', 'margin', 'buyPrice', 'supplierTotal',
  'salesRank', 'productRank',
  'bistrackConfidence', 'ocrConfidence', 'fuzzyMatchConfidence',
])

const TRAIL_ARRAY_KEYS = new Set(['pageNumbers', 'quoteNumbers', 'orderNumbers', 'detectedDocTypes'])
const TRAIL_STRING_KEYS = new Set(['sourceFileName', 'importedAt', 'importedBy'])

// Normalize a raw source trail object: strips sensitive keys, coerces arrays to
// safe string arrays, and coerces string scalars through the safe() scrub.
// Returns a clean trail object suitable for embedding on a Customer File,
// or null if input is not a plain object.
export function normalizeSourceTrail(sourceTrail) {
  if (!sourceTrail || typeof sourceTrail !== 'object' || Array.isArray(sourceTrail)) return null
  const out = {}
  for (const [k, v] of Object.entries(sourceTrail)) {
    if (TRAIL_BANNED_KEYS.has(k)) continue
    if (TRAIL_ARRAY_KEYS.has(k)) {
      out[k] = Array.isArray(v) ? v.map(safe).filter(Boolean) : []
    } else if (TRAIL_STRING_KEYS.has(k)) {
      out[k] = safe(v)
    }
    // Unknown keys are dropped (forward-compatible)
  }
  return out
}

// ---- Part D: commitPacketGroupDraft -----------------------------------------

// Import a packet group draft as one new Customer File. Never merges or
// overwrites an existing record. Source trail is embedded on the Customer File.
// Returns the created Customer File.
export async function commitPacketGroupDraft(packetDraft, storage, options = {}) {
  if (!packetDraft || !packetDraft.customerName) {
    throw new Error('Customer name is required.')
  }
  const now = options.now || new Date()
  const ts = new Date(now)
  const stamp = ts.getTime().toString(36)
  const rand = Math.random().toString(36).slice(2, 5)
  const id = `cf-pkt-${stamp}-${rand}`

  const trail = normalizeSourceTrail({
    sourceFileName: packetDraft.sourceFileName || '',
    pageNumbers: packetDraft.pageNumbers || [],
    detectedDocTypes: packetDraft.detectedDocTypes || [],
    quoteNumbers: packetDraft.quoteNumbers || [],
    orderNumbers: packetDraft.orderNumbers || [],
    importedAt: ts.toISOString(),
  })

  const noteParts = []
  if (packetDraft.quoteNumbers && packetDraft.quoteNumbers.length) {
    noteParts.push(`Quote: ${packetDraft.quoteNumbers.join(', ')}`)
  }
  if (packetDraft.notes) noteParts.push(safe(packetDraft.notes))

  const pageLabel = trail && trail.pageNumbers && trail.pageNumbers.length
    ? ` (pages ${trail.pageNumbers.join(', ')})`
    : ''

  const file = await saveCustomerFileDurable(storage, {
    id,
    customerName: packetDraft.customerName,
    customerPhone: packetDraft.phone || '',
    customerEmail: packetDraft.email || '',
    projectAddress: packetDraft.address || '',
    existingNotes: noteParts.join('\n') || '',
    customerGoal: '',
    sourceLabel: 'Imported from scanned packet',
    sourceTrail: trail ? [trail] : [],
  }, ts)

  try {
    await appendActivityForFile(storage, file.id, {
      kind: 'scanned_packet_imported',
      summary: `Customer file created from scanned packet${pageLabel}.`,
    }, ts)
  } catch {
    // Activity is best-effort.
  }

  return file
}
