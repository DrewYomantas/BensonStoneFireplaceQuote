// Zone-based OCR reader for the Benson Stone portrait BisTrack quote template.
// Pure parsers (testable in Node) + browser-only zone crop/OCR function.
// Caller must not persist dataUrl or worker references beyond onPageComplete.

import {
  normalizeScannedDraftField,
  detectScannedDraftWarnings,
  buildScannedCustomerDraft,
} from './scannedCustomerDraft.js'

// Zone fractions relative to page dimensions (portrait BisTrack two-column layout).
export const BENSON_QUOTE_ZONES = {
  invoiceAddress: { left: 0.04, top: 0.13, right: 0.34, bottom: 0.29 },
  deliveryAddress: { left: 0.34, top: 0.13, right: 0.62, bottom: 0.29 },
  metadata: { left: 0.60, top: 0.05, right: 0.98, bottom: 0.26 },
}

// ---- Rejection constants -----------------------------------------------------

const STORE_HINTS = /\b(?:benson|stone fireplace|co rockford|rockford il|61104|61101)\b/i
const BENSON_PHONE_DIGITS = '8152272000'
const INVOICE_LABEL_RE = /^\s*(?:invoice\s*address|bill\s*to|bill\s*address)\s*:?\s*$/i
const DELIVERY_LABEL_RE = /^\s*(?:delivery\s*address|ship\s*to|deliver\s*to|project\s*address)\s*:?\s*$/i

const SKIP_DELIVERY_RE = [
  /terms\s*pre\s*paid/i,
  /\bprepaid\b/i,
  /1100\s+eleventh/i,
  /customer\s*id/i,
  /www\.bensonstone\.com/i,
]

const PHONE_RE = /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/
const QUOTE_NUM_ZONE_RE = /quote\s*no\.?\s*[:#\s]+(\d{3,8})/i
const QUOTE_DATE_ZONE_RE = /quote\s*date\s*[:#\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i

// Label words that would appear at the start of a field-label line — not a name.
const NAME_REJECT_RE = /^\s*(?:id|customer|cust|terms|prepaid|quotation|quote|invoice|delivery|address|date|phone|fax|email|po|page|sales|rep|taken\s*by)\b/i

// ---- Helpers -----------------------------------------------------------------

function formatPhone(ten) {
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') return formatPhone(digits.slice(1))
  if (digits.length === 10) return formatPhone(digits)
  return ''
}

function isBensonPhone(line) {
  return line.replace(/\D/g, '') === BENSON_PHONE_DIGITS
}

function looksLikeName(line) {
  if (!line) return false
  const trimmed = line.trim()
  if (/^\d/.test(trimmed)) return false
  if (NAME_REJECT_RE.test(trimmed)) return false
  if (STORE_HINTS.test(trimmed)) return false
  // Reject city/state/zip lines (e.g. "Walworth, WI 53184")
  if (/,\s*[A-Z]{2}\s+\d{5}/.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  if (words.length > 5) return false
  if (!/^[A-Z]/.test(words[0])) return false
  // First word must not contain digits — rejects address tokens like "W6302"
  if (/\d/.test(words[0])) return false
  return true
}

// ---- Pure zone parsers (testable) --------------------------------------------

export function parseBensonInvoiceAddressZone(zoneText) {
  if (!zoneText || typeof zoneText !== 'string') return { customerName: '', customerPhone: '' }
  let customerName = ''
  let customerPhone = ''
  for (const rawLine of zoneText.split('\n')) {
    const line = normalizeScannedDraftField(rawLine)
    if (!line) continue
    if (INVOICE_LABEL_RE.test(line)) continue
    if (STORE_HINTS.test(line)) continue
    const phoneMatch = line.match(PHONE_RE)
    if (phoneMatch) {
      const formatted = normalizePhone(phoneMatch[1])
      if (formatted && !isBensonPhone(line) && !customerPhone) customerPhone = formatted
      continue
    }
    if (!customerName && looksLikeName(line)) customerName = line
  }
  return { customerName, customerPhone }
}

export function parseBensonDeliveryAddressZone(zoneText) {
  if (!zoneText || typeof zoneText !== 'string') return { deliveryAddress: '' }
  for (const rawLine of zoneText.split('\n')) {
    const line = normalizeScannedDraftField(rawLine)
    if (!line) continue
    if (DELIVERY_LABEL_RE.test(line)) continue
    if (STORE_HINTS.test(line)) continue
    if (SKIP_DELIVERY_RE.some((re) => re.test(line))) continue
    return { deliveryAddress: line }
  }
  return { deliveryAddress: '' }
}

export function parseBensonMetadataZone(zoneText) {
  if (!zoneText || typeof zoneText !== 'string') return { quoteNumber: '', quoteDate: '' }
  const numMatch = zoneText.match(QUOTE_NUM_ZONE_RE)
  const dateMatch = zoneText.match(QUOTE_DATE_ZONE_RE)
  return {
    quoteNumber: numMatch ? normalizeScannedDraftField(numMatch[1]) : '',
    quoteDate: dateMatch ? normalizeScannedDraftField(dateMatch[1]) : '',
  }
}

// ---- Draft builder (pure) ----------------------------------------------------

export function buildBensonQuoteDraftFromZones(zoneTexts = {}, options = {}) {
  const invoice = parseBensonInvoiceAddressZone(zoneTexts.invoiceAddress || '')
  const delivery = parseBensonDeliveryAddressZone(zoneTexts.deliveryAddress || '')
  const meta = parseBensonMetadataZone(zoneTexts.metadata || '')

  const allText = [zoneTexts.invoiceAddress, zoneTexts.deliveryAddress, zoneTexts.metadata]
    .filter(Boolean).join('\n')
  const fallback = buildScannedCustomerDraft(allText, { existingFiles: options.existingFiles || [] })

  const fields = {
    customerName: invoice.customerName || fallback.fields.customerName || '',
    customerPhone: invoice.customerPhone || fallback.fields.customerPhone || '',
    customerEmail: fallback.fields.customerEmail || '',
    projectAddress: delivery.deliveryAddress || fallback.fields.projectAddress || '',
    quoteNumber: meta.quoteNumber || fallback.fields.quoteNumber || '',
    quoteDate: meta.quoteDate || fallback.fields.quoteDate || '',
    existingNotes: '',
  }

  const templateHint = fields.customerName
    ? 'Benson quote layout detected — fields pulled from Invoice Address and Quote No blocks.'
    : 'Benson quote layout detected — some fields need review.'

  const warnings = detectScannedDraftWarnings(fields, options.existingFiles || [])
  return { fields, warnings, templateHint }
}

// ---- Browser-only zone OCR ---------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function cropImageToZone(img, zone) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const x = Math.floor(zone.left * iw)
  const y = Math.floor(zone.top * ih)
  const cw = Math.floor((zone.right - zone.left) * iw)
  const ch = Math.floor((zone.bottom - zone.top) * ih)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d').drawImage(img, x, y, cw, ch, 0, 0, cw, ch)
  const dataUrl = canvas.toDataURL('image/png')
  canvas.width = 0
  canvas.height = 0
  return dataUrl
}

// Crops each layout zone from the already-rendered page image and OCRs with
// the shared Tesseract worker. Returns plain text per zone — no image bytes.
// dataUrl and worker are both transient; do not persist them.
export async function extractBensonQuoteZoneTexts(dataUrl, worker) {
  const img = await loadImage(dataUrl)
  const results = {}
  for (const [zoneName, zone] of Object.entries(BENSON_QUOTE_ZONES)) {
    try {
      const croppedUrl = cropImageToZone(img, zone)
      const result = await worker.recognize(croppedUrl)
      results[zoneName] = result.data?.text || ''
    } catch {
      results[zoneName] = ''
    }
  }
  return results
}
