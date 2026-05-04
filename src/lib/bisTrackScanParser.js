// Deterministic parser for scanned Benson Stone BisTrack quote documents.
// Called when embedded PDF text is absent and OCR markers match BisTrack format.

const BISTRACK_SCAN_MARKERS = [
  /benson\s+stone/i,
  /quotation/i,
  /quote\s*no/i,
  /quote\s*date/i,
  /invoice\s+address/i,
  /delivery\s+address/i,
  /total\s+amount/i,
  /quotation\s+total/i,
  /balance\s+due/i,
  /sales\s+tax/i,
  /customer\s*id/i,
  /taken\s*by/i,
]

function matchCount(text, patterns) {
  return patterns.filter((p) => p.test(text)).length
}

export function detectScannedBisTrack(embeddedText, ocrText = '', fileName = '') {
  const embeddedLength = (embeddedText || '').replace(/\s+/g, '').length
  const isImageOnly = embeddedLength < 50
  const checkText = isImageOnly ? (ocrText || '') : (embeddedText || '')
  const markerHits = matchCount(checkText, BISTRACK_SCAN_MARKERS)
  const fileHint = /benson\s*stone|bistrack|quote\b|quotation/i.test(String(fileName || ''))

  // For image-only PDFs be very forgiving — file-name hint OR even 1 marker hit
  // is enough. Weak OCR from a real scan often misses several labels.
  const likelyBisTrackScan = isImageOnly
    ? (markerHits >= 1 || fileHint)
    : markerHits >= 4

  if (isImageOnly && likelyBisTrackScan) {
    const reasons = []
    if (markerHits >= 1) reasons.push(`${markerHits} OCR marker${markerHits === 1 ? '' : 's'}`)
    if (fileHint) reasons.push('file name hint')
    return {
      isImageOnly: true,
      likelyBisTrackScan: true,
      reason: `No embedded text; ${reasons.join(' + ') || 'image-only PDF'}`,
      markerHits,
      fileHint,
    }
  }
  if (isImageOnly) {
    return { isImageOnly: true, likelyBisTrackScan: false, reason: 'No embedded text; document type unclear from OCR', markerHits, fileHint }
  }
  if (likelyBisTrackScan) {
    return {
      isImageOnly: false,
      likelyBisTrackScan: true,
      reason: `BisTrack markers detected in sparse text (${markerHits} markers)`,
      markerHits,
      fileHint,
    }
  }
  return { isImageOnly: false, likelyBisTrackScan: false, reason: 'Embedded text found; standard parse', markerHits, fileHint }
}

export function normalizeBisTrackOcrText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function normalizeBisTrackMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const cleaned = String(value).replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

export function normalizeBisTrackDate(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function flatLine(text) {
  return String(text || '').replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

export function parseBisTrackHeaderFields(text) {
  const f = flatLine(text)
  // Real Tesseract output frequently includes colons after labels (e.g. "Customer ID: 22054")
  // and replaces "0" with "O", "1" with "I", etc. Patterns below tolerate optional ":" "." "—".
  return {
    quoteNo: firstMatch(f, [
      /quote\s*no\.?\s*[:#-]?\s*(\d{4,7})/i,
      /quotation\s*[:#]?\s*(\d{4,7})/i,
      /quote\s*#\s*(\d{4,7})/i,
    ]),
    quoteDate: firstMatch(f, [
      /quote\s*date\s*[:-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i,
      /date\s*[:-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i,
    ]),
    customerId: firstMatch(f, [
      /customer\s*id\s*[:#-]?\s*([A-Za-z0-9_]{3,20})/i,
      /\bcust\s*id\s*[:#-]?\s*([A-Za-z0-9_]{3,20})/i,
    ]),
    terms: firstMatch(f, [
      /terms\s*[:-]?\s*(Pre\s*Paid|PrePaid|Cash|COD|Net\s*\d+|On\s*Account|Paid)/i,
    ]),
    poNumber: firstMatch(f, [
      /PO\s*#?\s*[:-]?\s*(INST\s*[-—]\s*[^\n]{2,60}?)(?=\s*(?:Delivery|Taken By|Sales Rep|Tel\.?|Line\b|Special Instructions|\n|$))/i,
      /PO\s*#?\s*[:-]?\s*([A-Za-z0-9][^\n]{2,60}?)(?=\s*(?:Delivery By|Taken By|Sales Rep|Tel\.?|Line\b|\n|$))/i,
    ]),
    takenBy: firstMatch(f, [
      /taken\s*by\s*[:-]?\s*([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i,
      /took\s*by\s*[:-]?\s*([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i,
    ]),
    salesRep: firstMatch(f, [
      /sales\s*rep\s*[:-]?\s*([A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+)/i,
    ]),
  }
}

// Store address fragments — these must never land in the customer/invoice slot.
// Real OCR drops the "Benson Stone" prefix and leaves variants like "Co Rockford"
// or "Stone Co. Rockford". Match the unique store ZIP and the city/state combo.
const STORE_HINT = /1100\s+eleventh|bensonstone|benson\s+stone|\b61104\b|rockford,?\s*(il|illinois|llinois)\b|^co\b\s+rockford/i
const PHONE_RE = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/

// Parse an address block from arbitrary text — no anchor label required.
// Used for zone-OCR'd address crops and as fallback. Real Tesseract output
// frequently bleeds two side-by-side address columns into one wide line, so we
// also split on multi-space gaps when a line looks like "Name<gap>StreetNumber".
export function parseAddressFromBlock(text) {
  const rawLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(?:invoice|delivery)\s+address\s*$/i.test(l))
    .filter((l) => !STORE_HINT.test(l))

  // Split column-bleed lines like "Teresa Geiger    1125 A Inlet" into two.
  const lines = []
  for (const line of rawLines) {
    const m = line.match(/^([A-Z][A-Za-z .'-]{2,40})\s{2,}(\d+\s+\S.*)$/)
    if (m) {
      lines.push(m[1].trim())
      lines.push(m[2].trim())
      continue
    }
    // Strip leading "Invoice Address" / "Delivery Address" if it sits inline.
    const stripped = line.replace(/^(?:invoice|delivery)\s+address\s*[:-]?\s*/i, '').trim()
    if (stripped) lines.push(stripped)
  }

  let name = ''
  let addressLine1 = ''
  let cityStateZip = ''
  let phone = ''

  for (const line of lines) {
    const stripped = line.replace(/\bTel\.?\s*\d?\s*[-:]?\s*/gi, '').trim()
    const phoneM = stripped.match(PHONE_RE)
    if (phoneM && stripped.replace(PHONE_RE, '').replace(/[\s.-]+/g, '').length < 5) {
      phone = phone || phoneM[1]
      continue
    }
    if (!addressLine1 && /^\d+\s+\S/.test(line)) {
      addressLine1 = line
      continue
    }
    if (!cityStateZip && /\d{5}/.test(line) && !/^\d+\s+\S/.test(line)) {
      cityStateZip = line
      continue
    }
    if (!name && /^[A-Z]/.test(line) && !/^\d/.test(line) && line.length < 60) {
      name = line
    }
  }

  return { name, addressLine1, cityStateZip, phone }
}

const BLOCK_STOP = /^(?:delivery\s+address|invoice\s+address|quote\s*no|customer\s*id|terms|po#|line\s+product|total\s+amount|sales\s+tax|quotation\s+total|balance\s+due)/i

export function parseBisTrackAddressBlocks(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  function findAnchor(label) {
    const labelRe = new RegExp(`\\b${label}\\b`, 'i')
    const exactRe = new RegExp(`^${label}$`, 'i')

    // Prefer exact standalone match
    let idx = lines.findIndex((l) => exactRe.test(l))
    if (idx !== -1) return { idx, inlineAfter: '' }

    // Fall back to substring match (e.g. "Invoice Address Delivery Address")
    idx = lines.findIndex((l) => labelRe.test(l))
    if (idx !== -1) {
      const after = lines[idx].replace(labelRe, '').trim()
      return { idx, inlineAfter: after }
    }
    return null
  }

  function extractBlock(label) {
    const anchor = findAnchor(label)
    if (!anchor) return { name: '', addressLine1: '', cityStateZip: '', phone: '' }

    const block = []

    // If the anchor line had content after the label, include it as the first line
    if (anchor.inlineAfter && !BLOCK_STOP.test(anchor.inlineAfter)) {
      block.push(anchor.inlineAfter)
    }

    for (let i = anchor.idx + 1; i < lines.length && block.length < 8; i++) {
      if (BLOCK_STOP.test(lines[i])) break
      if (STORE_HINT.test(lines[i])) continue
      block.push(lines[i])
    }

    let name = ''
    let addressLine1 = ''
    let cityStateZip = ''
    let phone = ''

    for (const line of block) {
      const stripped = line.replace(/\bTel\.?\s*\d?\s*[-:]?\s*/gi, '').trim()
      const phoneM = stripped.match(PHONE_RE)
      if (phoneM && stripped.replace(PHONE_RE, '').replace(/[\s.-]+/g, '').length < 5) {
        phone = phone || phoneM[1]
        continue
      }
      if (!addressLine1 && /^\d+\s+\S/.test(line)) {
        addressLine1 = line
        continue
      }
      if (!cityStateZip && /\d{5}/.test(line) && !/^\d+\s+\S/.test(line)) {
        cityStateZip = line
        continue
      }
      if (!name && /^[A-Z]/.test(line) && !/^\d/.test(line) && line.length < 60) {
        name = line
      }
    }

    return { name, addressLine1, cityStateZip, phone }
  }

  return {
    invoice: extractBlock('Invoice Address'),
    delivery: extractBlock('Delivery Address'),
  }
}

export function parseBisTrackTotals(text) {
  const f = flatLine(text)

  function extractMoney(labelPattern) {
    // Tolerate colons, dashes, and stray non-numeric OCR noise between label and value.
    const m = f.match(new RegExp(`(?:${labelPattern})\\s*[:\\-]?[^$0-9-]{0,40}\\$?\\s*([0-9]{1,3}(?:,[0-9]{3})*\\.[0-9]{2})`, 'i'))
    return m ? normalizeBisTrackMoney(m[1]) : null
  }

  return {
    totalAmount: extractMoney('Total Amount|Sub\\s*Total|Merchandise Total'),
    salesTax: extractMoney('Sales\\s*Tax|IR\\s*Tax'),
    quotationTotal: extractMoney('Quotation Total|Order Total|Invoice Total|Grand Total|Total Due'),
    amountPaid: extractMoney('Amount\\s*Pa[il]d'),
    balanceDue: extractMoney('Balance\\s*Due'),
  }
}

const UNIT_TOKENS = /^(?:EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)$/i
const LINE_STOP = /^(?:total\s*amount|sales\s*tax|quotation\s*total|order\s*total|invoice\s*total|grand\s*total|amount\s*pa[il]d|balance\s*due|payment\s*method|signature|returns\s+of\s+stock)/i

function parseMoney(str) {
  if (!str) return null
  const n = Number(String(str).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function fmtMoney(num) {
  if (num === null || !Number.isFinite(num)) return ''
  return `$${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function parseBisTrackLineItems(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  const headerIdx = lines.findIndex((l) => /line\s+(?:product\s+)?code/i.test(l))
  if (headerIdx === -1) return []

  const items = []
  const tableLines = lines.slice(headerIdx + 1)

  // Standard row: lineNo code description qty unit unitPrice [unit] discount total
  const FULL_ROW = /^(\d{1,3})\s+(\S+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)\s+([\d,]+\.\d{2})\s+(?:EA\s+)?[\d,]+\.\d{2}\s+([\d,]+\.\d{2})\s*$/i

  // Installation row: lineNo "Installation Xxx" description ... total
  // Must be checked before FULL_ROW so "Installation Fireplace" isn't split by \S+
  const INSTALL_ROW = /^(\d{1,3})\s+(Installation\s+\w+)\s+(.+?)\s+(?:\d+\s+)?(?:(?:EA|FT|LF)\s+)?(?:[\d,]+\.\d{2}\s+){0,2}([\d,]+\.\d{2})\s*$/i

  // Short row: lineNo code description total (degraded columns)
  const SHORT_ROW = /^(\d{1,3})\s+([A-Za-z0-9_.\-/]+)\s+(.+?)\s+([\d,]+\.\d{2})\s*$/

  const NOTE_LINE = /^note:?\s+(.+)/i

  for (const line of tableLines) {
    if (LINE_STOP.test(line)) break

    const noteM = line.match(NOTE_LINE)
    if (noteM) {
      items.push({ lineNumber: '', code: 'NOTE', description: noteM[1].trim(), qty: '', unit: '', unitPrice: '', total: '', isNote: true })
      continue
    }

    const installM = line.match(INSTALL_ROW)
    if (installM) {
      const [, lineNo, code, desc, total] = installM
      items.push({ lineNumber: lineNo, code, description: desc.trim(), qty: '1', unit: 'EA', unitPrice: '', total: fmtMoney(parseMoney(total)), isNote: false })
      continue
    }

    const fullM = line.match(FULL_ROW)
    if (fullM) {
      const [, lineNo, code, desc, qty, unit, unitPrice, total] = fullM
      items.push({ lineNumber: lineNo, code, description: desc.trim(), qty, unit, unitPrice: fmtMoney(parseMoney(unitPrice)), total: fmtMoney(parseMoney(total)), isNote: false })
      continue
    }

    const shortM = line.match(SHORT_ROW)
    if (shortM) {
      const [, lineNo, code, desc, total] = shortM
      if (UNIT_TOKENS.test(code)) continue
      items.push({ lineNumber: lineNo, code, description: desc.trim(), qty: '', unit: '', unitPrice: '', total: fmtMoney(parseMoney(total)), isNote: false })
    }
  }

  return items
}

export function scoreBisTrackScanExtraction({ header = {}, addresses = {}, totals = {}, lineItems = [] }) {
  const headerKeys = ['quoteNo', 'quoteDate', 'customerId', 'terms', 'poNumber', 'salesRep']
  const headerFound = headerKeys.filter((k) => header[k]).length
  const headerMissing = headerKeys.filter((k) => !header[k])

  const invoice = addresses.invoice || {}
  const addrKeys = ['name', 'addressLine1', 'cityStateZip']
  const addressFound = addrKeys.filter((k) => invoice[k]).length
  const addressMissing = addrKeys.filter((k) => !invoice[k])

  const totalsKeys = ['totalAmount', 'salesTax', 'quotationTotal', 'balanceDue']
  const totalsFound = totalsKeys.filter((k) => totals[k] !== null && totals[k] !== undefined).length
  const totalsMissing = totalsKeys.filter((k) => totals[k] === null || totals[k] === undefined)

  const realItems = lineItems.filter((i) => !i.isNote)
  const noteItems = lineItems.filter((i) => i.isNote)
  const needsReview = realItems.filter((i) => !i.total).length

  let overall = 'low'
  if (header.quoteNo && totals.quotationTotal !== null && (invoice.name || invoice.addressLine1) && realItems.length >= 3) {
    overall = 'high'
  } else if (header.quoteNo && totals.quotationTotal !== null && (invoice.name || invoice.addressLine1)) {
    overall = 'medium'
  } else if (header.quoteNo) {
    overall = 'low'
  }

  return {
    documentTypeDetected: true,
    headerFields: { found: headerFound, missing: headerMissing },
    addressFields: { found: addressFound, missing: addressMissing },
    totalsFields: { found: totalsFound, missing: totalsMissing },
    lineItems: { count: realItems.length, notes: noteItems.length, needsReview },
    overall,
  }
}

export function buildScannedBisTrackIssues(score, header = {}, addresses = {}, totals = {}) {
  const invoice = addresses.invoice || {}
  const issues = []

  issues.push({
    id: 'scanned-customer-confirm',
    severity: 'required',
    label: 'Confirm scanned customer and address',
    detail: invoice.name
      ? `Extracted: ${[invoice.name, invoice.addressLine1, invoice.cityStateZip].filter(Boolean).join(', ')}. Verify against original scan.`
      : 'Customer name and address were not extracted — enter manually from the scan.',
  })

  issues.push({
    id: 'scanned-totals-confirm',
    severity: 'required',
    label: 'Confirm scanned totals',
    detail: totals.quotationTotal !== null
      ? `Quotation Total: $${totals.quotationTotal.toFixed(2)}${totals.salesTax !== null ? `, Sales Tax: $${totals.salesTax.toFixed(2)}` : ''}. Verify against original scan.`
      : 'Totals were not extracted — enter manually from the scan.',
  })

  if (score.lineItems.count === 0) {
    issues.push({
      id: 'scanned-line-items-missing',
      severity: 'required',
      label: 'Line items not extracted',
      detail: 'No line items were parsed from the scanned table. Enter products manually from the original scan.',
    })
  } else {
    issues.push({
      id: 'scanned-line-items-confirm',
      severity: score.lineItems.needsReview > 0 ? 'required' : 'review',
      label: `Confirm ${score.lineItems.count} line item(s) from scan`,
      detail: score.lineItems.needsReview > 0
        ? `${score.lineItems.needsReview} item(s) missing totals or codes — verify against the scan.`
        : 'Review all line items against the original scan before sending.',
    })
  }

  if (score.lineItems.notes > 0) {
    issues.push({
      id: 'scanned-note-lines',
      severity: 'info',
      label: 'Note lines detected in scan',
      detail: 'One or more note lines were found (e.g. "Gas/Electric NOT Included"). Confirm they are carried over correctly.',
    })
  }

  issues.push({
    id: 'scanned-original-attached',
    severity: 'info',
    label: 'Attach original scan to customer file',
    detail: 'Save the original scanned PDF to the customer file for reference before closing.',
  })

  return issues
}

export function parseBisTrackScannedQuote(text) {
  const normalized = normalizeBisTrackOcrText(text)
  const header = parseBisTrackHeaderFields(normalized)
  const addresses = parseBisTrackAddressBlocks(normalized)
  const totals = parseBisTrackTotals(normalized)
  const lineItems = parseBisTrackLineItems(normalized)
  const score = scoreBisTrackScanExtraction({ header, addresses, totals, lineItems })
  const issues = buildScannedBisTrackIssues(score, header, addresses, totals)

  return {
    header,
    addresses,
    totals,
    lineItems,
    score,
    issues,
    extractionSource: 'bistrack-scan',
    extractionConfidence: score.overall,
    isScannedBisTrack: true,
  }
}

// Zone-aware orchestrator: each zone text is fed to the parser that matches its content.
// Falls back to full-page text for any zone that is empty.
export function parseBisTrackScannedQuoteFromZones(zoneTexts, fullPageText = '') {
  const n = (t) => normalizeBisTrackOcrText(t || fullPageText || '')

  const metaText = n(zoneTexts.metadata)
  const invoiceText = n(zoneTexts.invoiceAddress)
  const deliveryText = n(zoneTexts.deliveryAddress)
  const tableText = n(zoneTexts.table)
  const totalsText = n(zoneTexts.totals)
  const fallback = n(fullPageText)

  const header = parseBisTrackHeaderFields(metaText || fallback)

  // Parse addresses directly from zone blocks (no anchor search needed for zone text)
  const invoice = invoiceText ? parseAddressFromBlock(invoiceText) : (parseBisTrackAddressBlocks(fallback).invoice)
  const delivery = deliveryText ? parseAddressFromBlock(deliveryText) : (parseBisTrackAddressBlocks(fallback).delivery)
  const addresses = { invoice, delivery }

  const totals = parseBisTrackTotals(totalsText || fallback)
  const lineItems = parseBisTrackLineItems(tableText || fallback)

  const score = scoreBisTrackScanExtraction({ header, addresses, totals, lineItems })
  const issues = buildScannedBisTrackIssues(score, header, addresses, totals)

  return {
    header,
    addresses,
    totals,
    lineItems,
    score,
    issues,
    extractionSource: 'bistrack-zone-ocr',
    extractionConfidence: score.overall,
    isScannedBisTrack: true,
  }
}
