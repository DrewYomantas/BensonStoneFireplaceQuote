// Scanned customer draft helpers (Milestone 19.5).
// Extracts obvious customer fields from free-form OCR text using safe regex
// patterns. Never infers setup type, creates quote prep lines, or touches BisTrack.
// commitScannedDraft() is the one async function — all others are pure.

import { saveCustomerFileDurable } from './customerFileDurable.js'
import { appendActivityForFile } from './visitActivity.js'

// ---- Scrub ------------------------------------------------------------------

const BANNED_PHRASES = ['ready to send', 'proposal ready', 'customer ready', 'approved']
const SENSITIVE_TERMS = [
  'cost', 'buy price', 'average cost', 'margin', 'supplier total',
  'product rank', 'sales rank', 'raw ocr', 'raw pdf', 'ocr confidence',
  'fuzzy confidence', 'bistrack confidence', 'fuzzy match', 'internal confidence',
  'private catalog', 'private file path',
]

// Known store fragments that should not be extracted as customer names.
const STORE_HINTS = /\b(?:benson|stone fireplace|co rockford|rockford il|61104|61101)\b/i

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value).trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  for (const p of BANNED_PHRASES) if (lower.includes(p)) return ''
  for (const t of SENSITIVE_TERMS) if (lower.includes(t)) return ''
  return s
}

// ---- Field normalizer -------------------------------------------------------

// Cleans a single extracted field value: trims, collapses spaces, strips
// leading/trailing colons and dashes that bleed in from OCR label lines.
export function normalizeScannedDraftField(value) {
  if (value === undefined || value === null) return ''
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+/, '')
    .replace(/[\s:–—-]+$/, '')
    .trim()
}

// ---- Phone ------------------------------------------------------------------

const LABELED_PHONE_RE = /(?:phone|ph\.?|tel\.?|mobile|cell|contact|telephone)[\s:]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/i
const BARE_PHONE_RE = /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/

function extractPhone(text) {
  const labeled = text.match(LABELED_PHONE_RE)
  if (labeled) return normalizePhone(labeled[1])
  const bare = text.match(BARE_PHONE_RE)
  if (bare) return normalizePhone(bare[1])
  return ''
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') return formatPhone(digits.slice(1))
  if (digits.length === 10) return formatPhone(digits)
  return ''
}

function formatPhone(ten) {
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

// ---- Email ------------------------------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

function extractEmail(text) {
  const m = text.match(EMAIL_RE)
  return m ? m[0].toLowerCase().trim() : ''
}

// ---- Name -------------------------------------------------------------------

// Using literal space (not \s) so the capture group cannot consume newlines and
// eat the next labeled line in the same match.
const NAME_LABEL_RE = /(?:customer|client|name|contact|bill\s*to|sold\s*to|ship\s*to|attention|attn|dear|prepared\s*for)[\s:]+([A-Z][a-zA-Z ',.]{1,50})/gim

function extractName(text) {
  // Try all labeled matches in document order; skip store hits and address lines.
  const re = new RegExp(NAME_LABEL_RE.source, 'gim')
  let m
  while ((m = re.exec(text)) !== null) {
    const candidate = normalizeScannedDraftField(m[1].split('\n')[0])
    if (candidate && !STORE_HINTS.test(candidate) && !/^\d/.test(candidate)) {
      return safe(candidate)
    }
  }
  // BisTrack zone header fallback — first non-address line after INVOICE ADDRESS ZONE
  const zoneM = text.match(/---\s*INVOICE ADDRESS ZONE\s*---\s*\n+([^\n]+)/)
  if (zoneM) {
    const candidate = normalizeScannedDraftField(zoneM[1])
    if (candidate.length >= 3 && !STORE_HINTS.test(candidate) && !/^\d/.test(candidate)) {
      return safe(candidate)
    }
  }
  return ''
}

// ---- Address ----------------------------------------------------------------

const STREET_RE = /\b(\d{1,5}\s+(?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z\s]{2,25}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Ct|Court|Pl(?:ace)?|Way|Cir(?:cle)?|Pkwy|Parkway|Terr?(?:ace)?|Trl|Trail|Hwy|Highway)\b)/i
const CITY_STATE_ZIP_RE = /([A-Za-z][A-Za-z\s]{2,20}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/

function extractAddress(text) {
  const street = text.match(STREET_RE)
  if (!street) return ''
  const start = text.indexOf(street[0])
  const snippet = text.slice(start, start + 150)
  const csz = snippet.match(CITY_STATE_ZIP_RE)
  if (csz) {
    return safe(`${street[1].trim()}, ${csz[1].trim()}, ${csz[2]} ${csz[3]}`)
  }
  return safe(street[1].trim())
}

// ---- Delivery / project address ---------------------------------------------
// Prefer the delivery or ship-to address as the project address on Benson quotes.

const DELIVERY_ADDRESS_LABEL_RE = /(?:delivery\s*address|ship\s*to|deliver\s*to|delivery\s*to|project\s*address)[\s:]+([^\n]{3,80})/i

function extractDeliveryAddress(text) {
  const m = text.match(DELIVERY_ADDRESS_LABEL_RE)
  if (!m) return ''
  const candidate = normalizeScannedDraftField(m[1].split('\n')[0])
  return safe(candidate)
}

// ---- Service order number ---------------------------------------------------

const SERVICE_ORDER_RE = /(?:service\s*order|work\s*order|s\.?o\.?|service\s*ticket|ticket)\s*(?:no\.?|number|num)?\s*[#:\s]*([A-Z0-9/-]{2,20})/i

function extractServiceOrderNumber(text) {
  const m = text.match(SERVICE_ORDER_RE)
  return m ? normalizeScannedDraftField(m[1]) : ''
}

// ---- Quote number -----------------------------------------------------------

const QUOTE_NUM_RE = /(?:quote|quotation|order|job|estimate|invoice|bid|proposal|po)\s*(?:no\.?|number|#|num)?[:\s]+([A-Z0-9/-]{3,20})/i

function extractQuoteNumber(text) {
  const m = text.match(QUOTE_NUM_RE)
  return m ? normalizeScannedDraftField(m[1]) : ''
}

// ---- Quote date -------------------------------------------------------------

const DATE_RE = /(?:date|dated|quote\s*date|order\s*date|estimate\s*date|prepared)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i

function extractQuoteDate(text) {
  const m = text.match(DATE_RE)
  return m ? normalizeScannedDraftField(m[1]) : ''
}

// ---- Empty fields -----------------------------------------------------------

function emptyFields() {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    projectAddress: '',
    quoteNumber: '',
    quoteDate: '',
    existingNotes: '',
  }
}

// ---- Main extractor ---------------------------------------------------------

// Build a customer draft from free-form OCR text. Returns { fields, warnings }.
// Fields are extracted using safe labeled patterns; nothing is marked verified.
// Does not mutate ocrText.
export function buildScannedCustomerDraft(ocrText, options = {}) {
  if (!ocrText || typeof ocrText !== 'string') {
    return { fields: emptyFields(), warnings: ['OCR text was empty or missing.'] }
  }
  const text = String(ocrText)
  // Prefer delivery/ship-to address as project address when available.
  const deliveryAddr = extractDeliveryAddress(text)
  const streetAddr = safe(extractAddress(text))
  const serviceOrderNum = safe(extractServiceOrderNumber(text))
  const quoteNum = safe(extractQuoteNumber(text))
  const fields = {
    customerName: safe(extractName(text)),
    customerPhone: extractPhone(text),
    customerEmail: safe(extractEmail(text)),
    projectAddress: deliveryAddr || streetAddr,
    quoteNumber: quoteNum || serviceOrderNum,
    quoteDate: safe(extractQuoteDate(text)),
    existingNotes: '',
  }
  const warnings = detectScannedDraftWarnings(fields, options.existingFiles || [])
  return { fields, warnings }
}

// ---- Duplicate detection ----------------------------------------------------

function detectScannedDuplicate(draft, existingFiles) {
  if (!Array.isArray(existingFiles)) return null
  const phone = String(draft.customerPhone || '').replace(/\D/g, '')
  const email = String(draft.customerEmail || '').trim().toLowerCase()
  const name = String(draft.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')
  for (const file of existingFiles) {
    const fPhone = String(file.customerPhone || '').replace(/\D/g, '')
    const fEmail = String(file.customerEmail || '').trim().toLowerCase()
    if (phone && fPhone && phone === fPhone) return { kind: 'phone', existingId: file.id || '' }
    if (email && fEmail && email === fEmail) return { kind: 'email', existingId: file.id || '' }
  }
  if (name) {
    for (const file of existingFiles) {
      const fName = String(file.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')
      if (fName && fName === name) return { kind: 'name', existingId: file.id || '' }
    }
  }
  return null
}

// ---- Warning generator ------------------------------------------------------

// Returns a list of human-readable warning strings for the draft.
// Uses the same "warn, don't block" philosophy — the user decides.
export function detectScannedDraftWarnings(draft, existingFiles = []) {
  const warnings = []
  if (!draft.customerName) warnings.push('Missing name')
  if (!draft.customerPhone && !draft.customerEmail) warnings.push('Missing contact')
  const dup = detectScannedDuplicate(draft, existingFiles)
  if (dup) {
    if (dup.kind === 'phone' || dup.kind === 'email') {
      warnings.push('Possible duplicate — same contact already in Customer Files')
    } else if (dup.kind === 'name') {
      warnings.push('Possible duplicate — same name already in Customer Files')
    }
  }
  return warnings
}

// ---- Commit -----------------------------------------------------------------

// Import a single scanned draft as a new Customer File. Never merges or
// overwrites an existing record. Quote number and date are folded into notes.
// Activity event 'scan_imported' is appended best-effort.
export async function commitScannedDraft(fields, storage, now = new Date()) {
  if (!fields || !fields.customerName) throw new Error('Customer name is required.')
  const ts = new Date(now)
  const stamp = ts.getTime().toString(36)
  const rand = Math.random().toString(36).slice(2, 5)
  const id = `cf-scan-${stamp}-${rand}`
  const noteParts = []
  if (fields.quoteNumber) noteParts.push(`Quote #${fields.quoteNumber}`)
  if (fields.quoteDate) noteParts.push(`Date: ${fields.quoteDate}`)
  if (fields.existingNotes) noteParts.push(fields.existingNotes)
  const file = await saveCustomerFileDurable(storage, {
    id,
    customerName: fields.customerName,
    customerPhone: fields.customerPhone || '',
    customerEmail: fields.customerEmail || '',
    projectAddress: fields.projectAddress || '',
    existingNotes: noteParts.join('\n') || '',
    customerGoal: '',
  }, ts)
  try {
    await appendActivityForFile(storage, file.id, {
      kind: 'scan_imported',
      summary: 'Customer file created from scanned PDF intake.',
    }, ts)
  } catch {
    // Activity is best-effort.
  }
  return file
}
