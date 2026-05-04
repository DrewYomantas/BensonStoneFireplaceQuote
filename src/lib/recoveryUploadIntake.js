import { parseBisTrackText } from './biztrackPdfParser.js'
import { detectScannedBisTrack, parseBisTrackScannedQuote, parseBisTrackScannedQuoteFromZones } from './bisTrackScanParser.js'
import { evaluateCurrentSetup } from './currentSetup.js'
import { extractScannedBisTrackFields } from './scannedPacketParser.js'

function clean(value) {
  return String(value || '').trim()
}

function confidenceValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function sourceTypeFor(file, parsed, usedOcr) {
  if (file?.type?.startsWith('image/')) return 'image'
  if (usedOcr || parsed?.context?.extractionSource === 'ocr') return 'scan'
  return 'pdf'
}

function classificationFromParsed(parsed, warnings) {
  if (parsed?.context?.fullyPaid) return 'paid-closed'
  if (['bill', 'invoice', 'receipt', 'order'].includes(parsed?.documentType) && parsed?.fields?.BALANCE_DUE === '$0.00') return 'paid-closed'
  if (warnings.some((warning) => /missing contact/i.test(warning))) return 'missing-contact'
  return 'needs-review'
}

function buildSourceWarnings({ parsed, ocrConfidence, fields }) {
  const warnings = ['Review extracted text before follow-up.']
  const confidence = confidenceValue(ocrConfidence)
  if (confidence !== null && confidence < 70) warnings.push('OCR Review Required: low OCR confidence.')
  if (!fields.CUSTOMER_NAME || (!fields.CUSTOMER_EMAIL && !fields.CUSTOMER_PHONE)) warnings.push('Missing contact info.')
  if (!fields.QUOTE_DATE) warnings.push('Quote date missing.')
  if (!fields.QUOTATION_TOTAL && !fields.TOTAL_AMOUNT) warnings.push('Quote total missing.')
  if (!fields.PROJECT_NOTES && !fields.PROJECT_SCOPE_SUMMARY && !(parsed.lineItems || []).length) warnings.push('Product details need review.')
  warnings.push('Old quote likely needs pricing refresh.')
  return [...new Set(warnings)]
}

export function recoveryIntakeFromParsedQuote({
  fileName = '',
  fileType = '',
  parsed = {},
  ocrConfidence = '',
  usedOcr = false,
  scanResult = null,
  now = new Date(),
} = {}) {
  const fields = parsed.fields || {}
  const setupText = [
    fields.PROJECT_SCOPE_SUMMARY,
    fields.INSTALLATION_SCOPE,
    fields.PROJECT_NOTES,
  ].filter(Boolean).join('\n')
  const setupGuidance = evaluateCurrentSetup({ fields, parseContext: parsed.context || {}, now })
  const sourceType = sourceTypeFor({ type: fileType }, parsed, usedOcr)
  const sourceWarnings = buildSourceWarnings({ parsed, ocrConfidence, fields })
  const sourceTrailNote = [
    fileName ? `Source file: ${fileName}` : '',
    `Intake type: ${sourceType}`,
    usedOcr ? 'OCR Review Required' : 'Embedded text parsed',
  ].filter(Boolean).join(' | ')

  const isScannedBisTrack = Boolean(scanResult?.isScannedBisTrack)
  const scannedBisTrackNote = isScannedBisTrack
    ? buildScannedBisTrackNote(scanResult)
    : ''

  return {
    customerName: clean(fields.CUSTOMER_NAME),
    customerEmail: clean(fields.CUSTOMER_EMAIL),
    customerPhone: clean(fields.CUSTOMER_PHONE || fields.PROJECT_PHONE),
    quoteNumber: clean(fields.QUOTE_NO),
    quoteDate: clean(fields.QUOTE_DATE),
    originalQuoteAmount: clean(fields.TOTAL_AMOUNT || fields.QUOTATION_TOTAL),
    quotationTotal: clean(fields.QUOTATION_TOTAL),
    projectType: clean(parsed.context?.itemMix === 'outdoor' ? 'Outdoor Living' : fields.PROJECT_TITLE || parsed.context?.outputLabel || 'Fireplace Project'),
    projectTitle: clean(fields.PROJECT_TITLE || fields.PO_NUMBER),
    existingSetup: clean(fields.INSTALLATION_SCOPE),
    desiredOutcome: clean(fields.PROJECT_SCOPE_SUMMARY),
    productsNotes: clean(setupText),
    sourceFileNote: clean(fileName),
    sourceLabel: sourceTrailNote,
    sourceType,
    sourceConfidence: usedOcr && ocrConfidence !== '' ? `${ocrConfidence}% OCR` : parsed.extractionConfidence || 'parsed',
    sourceWarnings,
    sourceTrailNote,
    internalNotes: sourceWarnings.join('\n'),
    recoveryClassification: classificationFromParsed(parsed, sourceWarnings),
    reviewedForFollowUp: false,
    setupReviewStatus: setupGuidance.blockers?.length ? 'follow-up-needed' : 'review-required',
    isScannedBisTrack,
    scannedBisTrackNote,
  }
}

function buildScannedBisTrackNote(scanResult) {
  if (!scanResult) return ''
  const { score } = scanResult
  const lines = [
    'Scanned BisTrack quote detected. Fields were extracted from the page image. Review customer, totals, and line items against the original scan before sending.',
  ]
  if (score) {
    if (score.headerFields) lines.push(`Header fields extracted: ${score.headerFields.found} of 6`)
    if (score.addressFields) lines.push(`Address extracted: ${score.addressFields.found} of 3`)
    if (score.totalsFields) lines.push(`Totals extracted: ${score.totalsFields.found} of 4`)
    if (score.lineItems) {
      const li = score.lineItems
      lines.push(
        li.count > 0
          ? `Line items: ${li.count} extracted${li.needsReview > 0 ? ` (${li.needsReview} need review)` : ''}${li.notes > 0 ? `, ${li.notes} note line(s)` : ''}`
          : 'Line items: none extracted — enter manually',
      )
    }
  }
  return lines.join('\n')
}

export async function parseRecoveryUploadFile(file, options = {}) {
  const { onProgress } = options
  if (!file) throw new Error('Select a file to upload.')
  const { extractOcrFromImage, extractOcrFromPdf, extractOcrFromPdfForBisTrackScan, extractTextFromPdf } = await import('./pdfTextExtraction.js')

  if (file.type?.startsWith('image/')) {
    onProgress?.('Reading image with OCR...')
    const ocr = await extractOcrFromImage(file, options)
    // Image files are always image-only; always attempt BisTrack scan parse.
    const scanResult = parseBisTrackScannedQuote(ocr.rawText)
    const parsed = extractScannedBisTrackFields(ocr.rawText)
    mergeAllScannedFieldsToFields(parsed, scanResult)
    const ocrDebug = buildOcrDebug({ embeddedTextLength: 0, ocr })
    return {
      intake: recoveryIntakeFromParsedQuote({
        fileName: file.name,
        fileType: file.type,
        parsed,
        ocrConfidence: ocr.confidence,
        usedOcr: true,
        scanResult,
      }),
      parsed,
      rawText: ocr.rawText,
      usedOcr: true,
      scanResult,
      ocrDebug,
    }
  }

  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    throw new Error('Upload a PDF or image file.')
  }

  onProgress?.('Reading PDF text...')
  const extracted = await extractTextFromPdf(file)
  if (!extracted.embeddedTextLikelyMissing) {
    const parsed = parseBisTrackText(extracted.rawText)
    return {
      intake: recoveryIntakeFromParsedQuote({
        fileName: file.name,
        fileType: file.type,
        parsed,
        usedOcr: false,
      }),
      parsed,
      rawText: extracted.rawText,
      usedOcr: false,
    }
  }

  // Scanned / image-only PDF — always use the BisTrack high-res zone OCR path.
  onProgress?.('Scanned PDF detected — running zone OCR at higher resolution...')
  let ocr
  try {
    ocr = await extractOcrFromPdfForBisTrackScan(file, options)
  } catch {
    ocr = await extractOcrFromPdf(file, options)
  }

  const detection = detectScannedBisTrack(extracted.rawText, ocr.fullPageText || ocr.rawText, file.name)

  // Use zone-aware parser when zone text is available, otherwise full-page.
  const scanResult = ocr.zoneText
    ? parseBisTrackScannedQuoteFromZones(ocr.zoneText, ocr.fullPageText || ocr.rawText)
    : parseBisTrackScannedQuote(ocr.rawText)

  // If the file name + sparse OCR clearly says "scanned BisTrack quote", make
  // sure the scan-wins precedence kicks in even when marker count was low.
  if (detection.likelyBisTrackScan) scanResult.isScannedBisTrack = true

  const parsed = extractScannedBisTrackFields(ocr.rawText)
  mergeAllScannedFieldsToFields(parsed, scanResult)

  const embeddedLength = (extracted.rawText || '').replace(/\s+/g, '').length
  const ocrDebug = buildOcrDebug({ embeddedTextLength: embeddedLength, ocr, detection })

  const avgConfidence = Math.round(
    ocr.pages.reduce((sum, page) => sum + (page.confidence || 0), 0) / Math.max(ocr.pages.length, 1),
  )
  return {
    intake: recoveryIntakeFromParsedQuote({
      fileName: file.name,
      fileType: file.type,
      parsed,
      ocrConfidence: avgConfidence,
      usedOcr: true,
      scanResult,
    }),
    parsed,
    rawText: ocr.rawText,
    usedOcr: true,
    scanResult,
    ocrDebug,
  }
}

// Writes every field extracted by the scan parser into parsed.fields.
// For scanned BisTrack quotes, zone-OCR values WIN over the text-parser's
// fallback fishing, because parseBisTrackText running on combined OCR text
// frequently picks up garbage that then blocks the cleaner zone-OCR value.
function mergeAllScannedFieldsToFields(parsed, scanResult) {
  if (!scanResult) return

  const scanWins = Boolean(scanResult.isScannedBisTrack)
  const setField = (field, value) => {
    if (!value) return
    if (scanWins || !parsed.fields[field]) {
      parsed.fields[field] = value
      parsed.sources[field] = 'bistrack-scan'
    }
  }
  const setIfBlank = setField

  const fmt = (n) => (n !== null && n !== undefined ? `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '')

  const h = scanResult.header || {}
  setIfBlank('QUOTE_NO', h.quoteNo)
  setIfBlank('QUOTE_DATE', h.quoteDate)
  setIfBlank('CUSTOMER_ID', h.customerId)
  setIfBlank('PAYMENT_TERMS', h.terms)
  setIfBlank('PO_NUMBER', h.poNumber)
  setIfBlank('TAKEN_BY', h.takenBy)
  setIfBlank('SALES_REP', h.salesRep)

  const invoice = scanResult.addresses?.invoice || {}
  const delivery = scanResult.addresses?.delivery || {}
  setIfBlank('CUSTOMER_NAME', invoice.name)
  setIfBlank('INVOICE_ADDRESS_LINE_1', invoice.addressLine1)
  setIfBlank('INVOICE_CITY_STATE_ZIP', invoice.cityStateZip)
  setIfBlank('CUSTOMER_PHONE', invoice.phone)
  setIfBlank('PROJECT_ADDRESS_LINE_1', delivery.addressLine1 || invoice.addressLine1)
  setIfBlank('PROJECT_CITY_STATE_ZIP', delivery.cityStateZip || invoice.cityStateZip)

  const totals = scanResult.totals || {}
  setIfBlank('TOTAL_AMOUNT', fmt(totals.totalAmount))
  setIfBlank('IR_TAX', fmt(totals.salesTax))
  setIfBlank('QUOTATION_TOTAL', fmt(totals.quotationTotal))
  setIfBlank('BALANCE_DUE', fmt(totals.balanceDue))

  // Apply scan line items when field-contract parser found none.
  const scanItems = (scanResult.lineItems || []).filter((i) => !i.isNote)
  if (scanItems.length > 0 && !(parsed.lineItems || []).length) {
    let detail = 1
    let slot = 0
    for (const item of scanItems) {
      if (slot >= 9) {
        if (detail === 2) break
        detail = 2
        slot = 0
      }
      slot += 1
      const label = [item.code, item.description].filter(Boolean).join(' - ').slice(0, 200)
      parsed.fields[`DETAIL_${detail}_ITEM_${slot}`] = label
      parsed.fields[`DETAIL_${detail}_QTY_${slot}`] = item.qty ? `${item.qty} ${item.unit}`.trim() : ''
      parsed.fields[`DETAIL_${detail}_UNIT_PRICE_${slot}`] = item.unitPrice || ''
      parsed.fields[`DETAIL_${detail}_TOTAL_${slot}`] = item.total || ''
      parsed.sources[`DETAIL_${detail}_ITEM_${slot}`] = 'bistrack-scan'
    }
    parsed.fields.DETAIL_SECTION_1_TITLE = parsed.fields.DETAIL_SECTION_1_TITLE || 'Fireplace, venting, and materials'
    parsed.fields.DETAIL_SECTION_2_TITLE = parsed.fields.DETAIL_SECTION_2_TITLE || 'Additional materials and labor'
    parsed.lineItems = scanItems
  }
}

function buildOcrDebug({ embeddedTextLength, ocr, detection = null }) {
  const zones = ocr.zones || {}
  const sample = (text) => (text || '').slice(0, 200).replace(/\n+/g, ' ').trim()
  return {
    embeddedTextLength,
    fullPageOcrTextSample: sample(ocr.fullPageText || ocr.rawText),
    fullPageOcrConfidence: ocr.fullPageConfidence ?? (ocr.pages?.[0]?.confidence ?? 0),
    extractionSource: ocr.extractionSource || 'ocr',
    markerHits: detection?.markerHits ?? null,
    fileHint: detection?.fileHint ?? null,
    detectionReason: detection?.reason || '',
    zones: {
      metadata: zones.metadata ? { textSample: sample(zones.metadata.text), confidence: zones.metadata.confidence } : null,
      invoiceAddress: zones.invoiceAddress ? { textSample: sample(zones.invoiceAddress.text), confidence: zones.invoiceAddress.confidence } : null,
      deliveryAddress: zones.deliveryAddress ? { textSample: sample(zones.deliveryAddress.text), confidence: zones.deliveryAddress.confidence } : null,
      table: zones.table ? { textSample: sample(zones.table.text), confidence: zones.table.confidence } : null,
      totals: zones.totals ? { textSample: sample(zones.totals.text), confidence: zones.totals.confidence } : null,
    },
  }
}

export async function parseRecoveryUploadFiles(files = [], options = {}) {
  const list = Array.from(files || [])
  const drafts = []

  for (let index = 0; index < list.length; index += 1) {
    const file = list[index]
    try {
      const result = await parseRecoveryUploadFile(file, {
        ...options,
        onProgress: (progress) => {
          options.onProgress?.({
            fileName: file.name,
            fileIndex: index + 1,
            fileCount: list.length,
            progress,
          })
        },
      })
      drafts.push({
        id: `bulk-${index}-${file.name}`,
        fileName: file.name,
        intake: { ...result.intake, reviewedForFollowUp: false },
        status: 'ready-for-review',
        error: '',
      })
    } catch (err) {
      drafts.push({
        id: `bulk-${index}-${file.name}`,
        fileName: file.name,
        intake: recoveryIntakeFromParsedQuote({ fileName: file.name, fileType: file.type }),
        status: 'error',
        error: err.message || String(err),
      })
    }
  }

  return {
    drafts,
    summary: summarizeRecoveryUploadDrafts(drafts),
  }
}

export function triageBulkDraft(draft) {
  if (draft.status === 'error') return { bucket: 'error', reason: draft.error || 'Parse failed' }
  const { intake } = draft
  const classification = intake?.recoveryClassification || 'unknown'
  if (classification === 'paid-closed') return { bucket: 'reference', reason: 'Appears paid or closed' }
  if (classification === 'reference-only') return { bucket: 'reference', reason: 'Reference only' }
  if (!intake?.customerName?.trim()) return { bucket: 'needsReview', reason: 'Customer name missing' }
  if (!intake?.customerEmail?.trim() && !intake?.customerPhone?.trim()) return { bucket: 'needsReview', reason: 'No email or phone found' }
  return { bucket: 'ready', reason: '' }
}

export function summarizeRecoveryUploadDrafts(drafts = []) {
  const triaged = drafts.map(triageBulkDraft)
  return {
    draftCount: drafts.length,
    readyForReview: drafts.filter((draft) => draft.status === 'ready-for-review').length,
    reviewed: drafts.filter((draft) => draft.intake?.reviewedForFollowUp === true).length,
    missingContact: drafts.filter((draft) => (draft.intake?.sourceWarnings || []).some((warning) => /missing contact/i.test(warning))).length,
    errors: drafts.filter((draft) => draft.status === 'error').length,
    ready: triaged.filter((t) => t.bucket === 'ready').length,
    needsReview: triaged.filter((t) => t.bucket === 'needsReview').length,
    reference: triaged.filter((t) => t.bucket === 'reference').length,
  }
}
