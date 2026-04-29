import { defaultFieldValues, orderedFields } from './fieldContract.js'
import { parseBisTrackText } from './biztrackPdfParser.js'

const MONEY = '\\$?\\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\\.([0-9]{2})'
const PHONE = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/

function clean(text) {
  return String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim()
}

function normalized(text) {
  return clean(text).replace(/\n+/g, ' ')
}

function formatCurrencyMatch(match) {
  if (!match) return ''
  const raw = Array.isArray(match) ? `${match[1]}.${match[2]}` : match
  const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(numeric)) return ''
  return `$${numeric.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function parseAmount(raw) {
  if (!raw) return null
  const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function amountsMatch(a, b) {
  if (a === null || b === null) return false
  return Math.abs(a - b) < 0.01
}

function getFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function extractMoneyAfter(text, label) {
  const match = text.match(new RegExp(`(?:${label})[^$0-9-]{0,40}${MONEY}`, 'i'))
  return formatCurrencyMatch(match)
}

function classifyByText(text) {
  const value = normalized(text)
  const lower = value.toLowerCase()

  if (!value || value.length < 25) return { type: 'site_photo', label: 'Site Photo / Image', confidence: 'low' }
  if (/field measure checklist/i.test(value)) return { type: 'field_measure', label: 'Field Measure Sheet', confidence: 'high' }
  if (/installation job sheet|install job sheet/i.test(value)) return { type: 'install_job_sheet', label: 'Install Job Sheet', confidence: 'high' }
  if (/service order/i.test(value)) return { type: 'service_order', label: 'Service Order', confidence: 'high' }
  if (/firebuilder|quote form|lopi/i.test(value) && /product details|additional charges|quote form/i.test(value)) {
    return { type: 'vendor_quote', label: 'Vendor Quote / FireBuilder Quote', confidence: 'high' }
  }
  const orderTotal = parseAmount(extractMoneyAfter(value, 'Order Total|Grand Total'))
  const amountPaid = parseAmount(extractMoneyAfter(value, 'Amount Paid|Amount Pald'))
  const balanceDue = parseAmount(extractMoneyAfter(value, 'Balance Due'))
  const paidClosed = (balanceDue !== null && balanceDue === 0) || amountsMatch(orderTotal, amountPaid)

  if (/quotation/i.test(value) && /quote\s*no/i.test(value)) return { type: 'bistrack_quote', label: 'BisTrack Quotation', confidence: 'high' }
  if (/\border\b/i.test(value) && /order\s*no/i.test(value)) {
    return paidClosed
      ? { type: 'paid_closed_order', label: 'Paid / Closed Order', confidence: 'high' }
      : { type: 'bistrack_order', label: 'BisTrack Order', confidence: 'high' }
  }
  if (/invoice/i.test(value) && /(invoice\s*no|invoice\s*total)/i.test(value)) return { type: 'bistrack_invoice', label: 'Invoice / Receipt', confidence: 'high' }
  if (/receipt/i.test(value) && /(receipt\s*no|amount\s*paid)/i.test(value)) return { type: 'bistrack_receipt', label: 'Invoice / Receipt', confidence: 'high' }
  if (/benson\s+stone/i.test(value) && /(quote\s*no|quotation|total\s*amount|balance\s*due)/i.test(value)) {
    return { type: 'bistrack_unknown', label: 'BisTrack Document', confidence: 'medium' }
  }
  if (/jpg|png|image|photo|picture/i.test(lower)) return { type: 'site_photo', label: 'Site Photo / Image', confidence: 'low' }
  return { type: 'unknown', label: 'Unknown / Reference', confidence: 'low' }
}

export function classifyScannedPage(text) {
  return classifyByText(text)
}

function getRecommendation(classification, parsed) {
  const type = classification.type
  const fields = parsed?.fields || {}
  const docNumber = fields.QUOTE_NO
  const docDate = fields.QUOTE_DATE
  const total = fields.QUOTATION_TOTAL || fields.TOTAL_AMOUNT

  if (type === 'paid_closed_order') return 'Paid / closed'
  if (type === 'bistrack_quote' && (docNumber || docDate || total)) return 'Follow-up candidate'
  if (type === 'bistrack_quote') return 'Needs manual review'
  if (type === 'bistrack_order' || type === 'bistrack_invoice' || type === 'bistrack_receipt') return 'Needs manual review'
  if (type === 'field_measure' || type === 'install_job_sheet' || type === 'service_order') return 'Field measure / install support'
  if (type === 'site_photo') return 'Site photo'
  if (type === 'vendor_quote') return 'Reference only'
  return 'Needs manual review'
}

function getStatusFromRecommendation(recommendation) {
  if (recommendation === 'Follow-up candidate' || recommendation === 'Needs manual review') return 'Needs Review'
  if (recommendation === 'Paid / closed') return 'Paid / Closed'
  if (recommendation === 'Field measure / install support') return 'Support'
  if (recommendation === 'Site photo') return 'Reference'
  return 'Reference'
}

function extractAddressBlock(text, label) {
  const source = clean(text)
  const labelPattern = new RegExp(`${label}\\s*\\n+([\\s\\S]{0,220})`, 'i')
  const match = source.match(labelPattern)
  if (!match) return { name: '', addressLine1: '', cityStateZip: '', phone: '' }

  const block = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(delivery address|quote no|customer id|terms|po#|special instructions|notes|line\b)/i.test(line))

  const phoneLine = block.find((line) => PHONE.test(line)) || ''
  const phone = phoneLine.match(PHONE)?.[1] || ''
  const nonPhone = block.map((line) => line.replace(/\bTel\.?\s*\d?\s*[-:]?\s*.*$/i, '').trim()).filter(Boolean)

  const name = nonPhone[0] || ''
  const addressLine1 = nonPhone.find((line, index) => index > 0 && /\d+\s+/.test(line)) || ''
  const cityStateZip = nonPhone.find((line) => /\b\d{5}(?:-\d{4})?\b/.test(line) && line !== addressLine1) || ''

  return { name, addressLine1, cityStateZip, phone }
}

export function extractScannedBisTrackFields(rawText) {
  const base = parseBisTrackText(rawText)
  const fields = { ...base.fields }
  const sources = { ...base.sources }
  const context = { ...base.context, rawText, extractionSource: 'ocr' }
  const flat = normalized(rawText)

  const classification = classifyScannedPage(rawText)
  if (classification.type === 'bistrack_quote') context.documentType = 'quote'
  if (classification.type === 'bistrack_order') context.documentType = 'order'
  if (classification.type === 'paid_closed_order') context.documentType = 'order'
  if (classification.type === 'bistrack_invoice') context.documentType = 'invoice'
  if (classification.type === 'bistrack_receipt') context.documentType = 'receipt'

  const setIfBlank = (field, value, source = 'ocr') => {
    if (!fields[field] && value) {
      fields[field] = value
      sources[field] = source
    }
  }

  setIfBlank('QUOTE_NO', getFirstMatch(flat, [/quote\s*no\s*(\d{4,7})/i, /quotation\s+(\d{4,7})/i, /order\s*no\s*(\d{4,7})/i]))
  setIfBlank('QUOTE_DATE', getFirstMatch(flat, [/quote\s*date\s*(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i, /date\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i]))
  setIfBlank('CUSTOMER_ID', getFirstMatch(flat, [/customer\s*id\s*(\d{3,6})/i]))
  setIfBlank('PAYMENT_TERMS', getFirstMatch(flat, [/terms\s*(Pre\s*Paid|PrePaid|Cash|COD|Net\s*\d+)/i]))
  setIfBlank('PO_NUMBER', getFirstMatch(flat, [/PO#?\s*([^\n]{2,80}?)(?:Delivery|Taken By|Sales Rep|Line|Special Instructions|$)/i]))
  setIfBlank('TAKEN_BY', getFirstMatch(flat, [/taken\s*by\s*([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i]))
  setIfBlank('SALES_REP', getFirstMatch(flat, [/sales\s*rep\s*([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i]))

  const invoice = extractAddressBlock(rawText, 'Invoice Address')
  const delivery = extractAddressBlock(rawText, 'Delivery Address')
  setIfBlank('CUSTOMER_NAME', invoice.name)
  setIfBlank('INVOICE_ADDRESS_LINE_1', invoice.addressLine1)
  setIfBlank('INVOICE_CITY_STATE_ZIP', invoice.cityStateZip)
  setIfBlank('CUSTOMER_PHONE', invoice.phone)
  setIfBlank('PROJECT_ADDRESS_LINE_1', delivery.addressLine1 || invoice.addressLine1)
  setIfBlank('PROJECT_CITY_STATE_ZIP', delivery.cityStateZip || invoice.cityStateZip)
  setIfBlank('PROJECT_PHONE', delivery.phone)

  if (fields.PROJECT_CITY_STATE_ZIP && !fields.PROJECT_CITY_STATE) {
    fields.PROJECT_CITY_STATE = fields.PROJECT_CITY_STATE_ZIP.replace(/\s+\d{5}(?:-\d{4})?\b.*$/, '').trim()
    sources.PROJECT_CITY_STATE = 'derived'
  }

  setIfBlank('TOTAL_AMOUNT', extractMoneyAfter(flat, 'Total Amount'))
  setIfBlank('IR_TAX', extractMoneyAfter(flat, 'Sales Tax|IR Tax|Tax'))
  setIfBlank('QUOTATION_TOTAL', extractMoneyAfter(flat, 'Quotation Total|Order Total|Invoice Total|Grand Total'))
  setIfBlank('AMOUNT_PAID', extractMoneyAfter(flat, 'Amount Paid|Amount Pald'))
  setIfBlank('BALANCE_DUE', extractMoneyAfter(flat, 'Balance Due'))

  const orderTotal = parseAmount(fields.QUOTATION_TOTAL || fields.TOTAL_AMOUNT)
  const amountPaid = parseAmount(fields.AMOUNT_PAID)
  const balanceDue = parseAmount(fields.BALANCE_DUE)
  const fullyPaid = (balanceDue !== null && balanceDue === 0) || amountsMatch(orderTotal, amountPaid)

  if (fullyPaid) {
    context.fullyPaid = true
  }

  if (context.documentType === 'quote') {
    Object.entries(defaultFieldValues).forEach(([field, value]) => setIfBlank(field, value, 'default'))
    context.outputLabel = 'Fireplace Project Proposal'
  }

  const warnings = [
    ...(base.warnings || []).filter((warning) => !/scanned or image-based/i.test(warning)),
    'OCR extraction used. Review every field against the scanned document before sending anything to a customer.',
  ]
  const populated = orderedFields.filter((field) => fields[field] !== '').length
  const extractionConfidence = populated >= 12 ? 'medium' : 'low'

  return {
    ...base,
    fields,
    sources,
    context,
    documentType: context.documentType,
    warnings,
    infos: base.infos || [],
    extractionConfidence,
    pageClassification: classification,
  }
}

export function buildFollowUpItems(pages) {
  return pages
    .filter((page) => page.recommendation === 'Follow-up candidate')
    .map((page) => ({
      pageNumber: page.pageNumber,
      quoteNo: page.documentNumber,
      lastQuoteDate: page.documentDate,
      customerName: page.customerName,
      customerPhone: page.parsed.fields.CUSTOMER_PHONE || '',
      projectAddress: page.parsed.fields.PROJECT_ADDRESS_LINE_1 || page.parsed.fields.INVOICE_ADDRESS_LINE_1 || '',
      quoteTotal: page.parsed.fields.QUOTATION_TOTAL || page.total || '',
      balanceDue: page.parsed.fields.BALANCE_DUE || page.balanceDue || '',
      followUpNeeded: true,
      followUpStage: 'Old quote follow-up',
      followUpReason: 'Scanned quote found in follow-up packet',
      followUpNotes: 'Review quote details and contact customer if still relevant.',
    }))
}

export function buildScannedPacket(ocrPages) {
  const pages = ocrPages.map((page) => {
    const parsed = extractScannedBisTrackFields(page.text || '')
    const classification = parsed.pageClassification || classifyScannedPage(page.text || '')
    const recommendation = getRecommendation(classification, parsed)
    return {
      pageNumber: page.pageNumber,
      text: page.text || '',
      ocrConfidence: page.confidence,
      classification,
      parsed,
      customerName: parsed.fields.CUSTOMER_NAME || '',
      documentNumber: parsed.fields.QUOTE_NO || '',
      documentDate: parsed.fields.QUOTE_DATE || '',
      total: parsed.fields.QUOTATION_TOTAL || parsed.fields.TOTAL_AMOUNT || '',
      amountPaid: parsed.fields.AMOUNT_PAID || '',
      balanceDue: parsed.fields.BALANCE_DUE || '',
      imageDataUrl: page.imageDataUrl || '',
      recommendation,
      originalRecommendation: recommendation,
      status: getStatusFromRecommendation(recommendation),
    }
  })

  return { pages, followUpItems: buildFollowUpItems(pages) }
}
