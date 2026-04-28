import { createEmptyFieldState, defaultFieldValues, orderedFields } from './fieldContract.js'

const DOC_TYPE_PATTERNS = [
  { type: 'quote', pattern: /\b(quotation|quote)\b/i },
  { type: 'invoice', pattern: /\binvoice\b/i },
  { type: 'receipt', pattern: /\breceipt\b/i },
  { type: 'order', pattern: /\border\b/i },
  { type: 'bill', pattern: /(^|\n)\s*bill\b(?!\s*to)/i },
]

const FIREPLACE_KEYWORDS = /(insert|hearth|mantel|liner|chimney|gas\s*log|flue|fireplace|stove|firebox|surround)/i
const OUTDOOR_KEYWORDS = /(grill|smoker|kamado|outdoor\s*kitchen|big\s*green\s*egg|traeger|weber|firepit|fire\s*pit)/i

const LABEL_FIELD_PATTERNS = [
  { field: 'CUSTOMER_NAME', pattern: /^customer(?:\s*name)?\s*[:#-]\s*(.+)$/i },
  { field: 'CUSTOMER_ID', pattern: /^customer\s*(?:id|#|code)\s*[:#-]?\s*(.+)$/i },
  { field: 'CUSTOMER_PHONE', pattern: /^(?:customer\s*)?phone\s*[:#-]?\s*(.+)$/i },
  { field: 'QUOTE_NO', pattern: /^(?:document|quote|quotation|order|invoice|bill|receipt)\s*(?:no\.?|number|#)\s*[:#-]?\s*(.+)$/i },
  { field: 'QUOTE_DATE', pattern: /^(?:document\s*)?date\s*[:#-]?\s*(.+)$/i },
  { field: 'PAYMENT_TERMS', pattern: /^(?:terms|payment\s*terms)\s*[:#-]?\s*(.+)$/i },
  { field: 'PO_NUMBER', pattern: /^p\.?o\.?\s*(?:#|number|no\.?)?\s*[:#-]?\s*(.+)$/i },
  { field: 'TAKEN_BY', pattern: /^taken\s*by\s*[:#-]?\s*(.+)$/i },
  { field: 'SALES_REP', pattern: /^(?:sales\s*rep|salesperson|sales\s*person|rep)\s*[:#-]?\s*(.+)$/i },
  { field: '__DELIVERY_DATE__', pattern: /^delivery\s*date\s*[:#-]?\s*(.+)$/i },
  { field: 'TOTAL_AMOUNT', pattern: /^(?:sub\s*total|subtotal|total\s*amount|merchandise\s*total)\s*[:#-]?\s*\$?([\d,]+(?:\.\d{2})?)\s*$/i },
  { field: 'IR_TAX', pattern: /^(?:tax|sales\s*tax|ir\s*tax)\s*[:#-]?\s*\$?([\d,]+(?:\.\d{2})?)\s*$/i },
  { field: 'QUOTATION_TOTAL', pattern: /^(?:quotation\s*total|order\s*total|invoice\s*total|grand\s*total|total\s*due|total)\s*[:#-]?\s*\$?([\d,]+(?:\.\d{2})?)\s*$/i },
  { field: 'AMOUNT_PAID', pattern: /^(?:amount\s*paid|paid|deposit\s*paid|payment\s*received)\s*[:#-]?\s*\$?([\d,]+(?:\.\d{2})?)\s*$/i },
  { field: 'BALANCE_DUE', pattern: /^balance\s*due\s*[:#-]?\s*\$?([\d,]+(?:\.\d{2})?)\s*$/i },
]

const ADDRESS_BLOCK_HEADINGS = {
  invoice: /^(?:bill\s*to|invoice\s*(?:to|address)|sold\s*to|customer\s*address)\s*:?\s*$/i,
  project: /^(?:ship\s*to|deliver\s*to|delivery\s*(?:to|address)|project\s*address|job\s*address|install\s*address)\s*:?\s*$/i,
  notes: /^(?:special\s*instructions|notes|comments)\s*:?\s*$/i,
}

const STOP_LINE = /^(?:terms|po\b|sales\s*rep|taken\s*by|phone|line\s*#|line\s+item|qty|sub\s*total|subtotal|tax|order\s*total|quotation\s*total|invoice\s*total|grand\s*total|total\s*due|amount\s*paid|balance\s*due|payment|customer)\b/i

const LINE_ITEM_HEADER = /(line|item)\s+.*\b(qty|quantity)\b.*\b(price|total)\b/i

const LINE_ITEM_PATTERN = /^(\d{1,3})\s+(\S+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(?:(EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)\s+)?\$?([\d,]+\.\d{2})\s+(?:\$?([\d,]+\.\d{2})\s+)?\$?([\d,]+\.\d{2})\s*$/i

function cleanLine(line) {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function setField(fields, sources, field, value, source = 'parsed') {
  if (value === '' || value === null || value === undefined) return
  fields[field] = String(value).trim()
  sources[field] = source
}

function formatCurrency(raw) {
  if (raw === '' || raw === null || raw === undefined) return ''
  const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(numeric)) return ''
  return `$${numeric.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function detectDocumentType(rawText) {
  const head = rawText.split(/\r?\n/).slice(0, 30).join('\n')
  for (const { type, pattern } of DOC_TYPE_PATTERNS) {
    if (pattern.test(head)) return type
  }
  return 'unknown'
}

function detectItemMix(lineItems) {
  const blob = lineItems.map((item) => item.description || '').join(' ')
  if (OUTDOOR_KEYWORDS.test(blob) && !FIREPLACE_KEYWORDS.test(blob)) return 'outdoor'
  if (FIREPLACE_KEYWORDS.test(blob)) return 'fireplace'
  return 'unknown'
}

export function getOutputLabel(documentType, itemMix) {
  const isQuote = documentType === 'quote'
  if (itemMix === 'outdoor') {
    return isQuote ? 'Outdoor Living Proposal' : 'Order Summary'
  }
  if (isQuote) return 'Fireplace Project Proposal'
  if (documentType === 'order' || documentType === 'bill') return 'Project Confirmation'
  if (documentType === 'invoice' || documentType === 'receipt') return 'Order Summary'
  return 'Project Summary'
}

function consumeAddressBlock(lines, startIndex) {
  const collected = []
  let i = startIndex
  while (i < lines.length) {
    const line = lines[i]
    if (line === '') { i += 1; if (collected.length) break; continue }
    if (STOP_LINE.test(line)) break
    if (Object.values(ADDRESS_BLOCK_HEADINGS).some((p) => p.test(line))) break
    collected.push(line)
    if (collected.length >= 5) { i += 1; break }
    i += 1
  }
  return { lines: collected, nextIndex: i }
}

function splitAddress(addressLines) {
  if (!addressLines.length) return { line1: '', cityStateZip: '', phone: '' }
  let phone = ''
  const remaining = addressLines.filter((l) => {
    const m = l.match(/^(?:phone\s*[:#-]?\s*)?(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\s*$/i)
    if (m) { phone = m[1]; return false }
    return true
  })
  let cityStateZip = ''
  let bodyLines = remaining
  for (let i = remaining.length - 1; i >= 0; i -= 1) {
    if (/[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(remaining[i])) {
      cityStateZip = remaining[i]
      bodyLines = remaining.slice(0, i)
      break
    }
  }
  const line1 = bodyLines.join(', ')
  return { line1, cityStateZip, phone }
}

function parseLineItem(line) {
  const m = line.match(LINE_ITEM_PATTERN)
  if (!m) return null
  const [, lineNo, code, description, qty, unit, unitPrice, discountOrTotal, maybeTotal] = m
  const total = maybeTotal ?? discountOrTotal
  const discount = maybeTotal ? discountOrTotal : ''
  return {
    lineNumber: lineNo,
    code,
    description: description.trim(),
    qty,
    unit: unit || '',
    unitPrice: formatCurrency(unitPrice),
    discount: discount ? formatCurrency(discount) : '',
    total: formatCurrency(total),
  }
}

function applyLineItemsToFields(fields, sources, lineItems) {
  let detail = 1
  let slot = 0
  for (const item of lineItems) {
    if (slot >= 9) {
      if (detail === 2) break
      detail = 2
      slot = 0
    }
    slot += 1
    setField(fields, sources, `DETAIL_${detail}_ITEM_${slot}`, [item.code, item.description].filter(Boolean).join(' — '))
    setField(fields, sources, `DETAIL_${detail}_QTY_${slot}`, item.qty)
    setField(fields, sources, `DETAIL_${detail}_UNIT_PRICE_${slot}`, item.unitPrice)
    setField(fields, sources, `DETAIL_${detail}_TOTAL_${slot}`, item.total)
  }
}

export function parseBisTrackText(rawText) {
  const fields = createEmptyFieldState()
  const sources = Object.fromEntries(orderedFields.map((f) => [f, 'blank']))
  const warnings = []
  const infos = []
  const lineItems = []
  const context = {
    unmatchedLines: [],
    deliveryDateMentioned: false,
    deliveryDate: '',
    documentType: 'unknown',
    outputLabel: 'Project Summary',
    itemMix: 'unknown',
    rawText,
  }

  const trimmed = (rawText || '').trim()
  if (trimmed.length < 50) {
    warnings.push('This Epicor BisTrack PDF looks scanned or image-based. Embedded text is missing or very sparse — review extracted fields carefully.')
    return {
      fields,
      sources,
      context: { ...context, embeddedTextLikelyMissing: true },
      documentType: 'unknown',
      lineItems,
      warnings,
      infos,
      extractionConfidence: 'low',
    }
  }

  context.documentType = detectDocumentType(rawText)

  const allLines = rawText.split(/\r?\n/).map(cleanLine)
  let inLineItemBlock = false

  for (let i = 0; i < allLines.length; i += 1) {
    const line = allLines[i]
    if (line === '') continue

    if (LINE_ITEM_HEADER.test(line)) {
      inLineItemBlock = true
      continue
    }

    if (inLineItemBlock) {
      const item = parseLineItem(line)
      if (item) {
        lineItems.push(item)
        continue
      }
      if (/^(?:sub\s*total|subtotal|tax|total|amount\s*paid|balance|order\s*total|quotation\s*total|invoice\s*total)/i.test(line)) {
        inLineItemBlock = false
      }
    }

    if (ADDRESS_BLOCK_HEADINGS.invoice.test(line)) {
      const { lines: blockLines, nextIndex } = consumeAddressBlock(allLines, i + 1)
      if (blockLines.length) {
        const customerLine = blockLines[0]
        let addressBody = blockLines.slice(1)
        if (!fields.CUSTOMER_NAME && !/^\d/.test(customerLine) && !/[A-Z]{2}\s+\d{5}/.test(customerLine)) {
          setField(fields, sources, 'CUSTOMER_NAME', customerLine)
        } else {
          addressBody = blockLines
        }
        const { line1, cityStateZip, phone } = splitAddress(addressBody)
        setField(fields, sources, 'INVOICE_ADDRESS_LINE_1', line1)
        setField(fields, sources, 'INVOICE_CITY_STATE_ZIP', cityStateZip)
        if (phone) setField(fields, sources, 'CUSTOMER_PHONE', phone)
      }
      i = nextIndex - 1
      continue
    }

    if (ADDRESS_BLOCK_HEADINGS.project.test(line)) {
      const { lines: blockLines, nextIndex } = consumeAddressBlock(allLines, i + 1)
      if (blockLines.length) {
        const { line1, cityStateZip } = splitAddress(blockLines)
        setField(fields, sources, 'PROJECT_ADDRESS_LINE_1', line1)
        setField(fields, sources, 'PROJECT_CITY_STATE_ZIP', cityStateZip)
        if (cityStateZip) {
          const cityState = cityStateZip.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim()
          if (cityState) setField(fields, sources, 'PROJECT_CITY_STATE', cityState, 'derived')
        }
      }
      i = nextIndex - 1
      continue
    }

    if (ADDRESS_BLOCK_HEADINGS.notes.test(line)) {
      const { lines: blockLines, nextIndex } = consumeAddressBlock(allLines, i + 1)
      if (blockLines.length) {
        setField(fields, sources, 'PROJECT_NOTES', blockLines.join('\n'))
      }
      i = nextIndex - 1
      continue
    }

    let matched = false
    for (const { field, pattern } of LABEL_FIELD_PATTERNS) {
      const m = line.match(pattern)
      if (!m) continue
      const value = m[1].trim()
      if (field === '__DELIVERY_DATE__') {
        context.deliveryDateMentioned = true
        context.deliveryDate = value
      } else if (['TOTAL_AMOUNT', 'IR_TAX', 'QUOTATION_TOTAL', 'AMOUNT_PAID', 'BALANCE_DUE'].includes(field)) {
        setField(fields, sources, field, formatCurrency(value))
      } else {
        if (!fields[field]) setField(fields, sources, field, value)
      }
      matched = true
      break
    }

    if (!matched && line.length > 0) {
      context.unmatchedLines.push(line)
    }
  }

  applyLineItemsToFields(fields, sources, lineItems)

  context.itemMix = detectItemMix(lineItems)
  context.outputLabel = getOutputLabel(context.documentType, context.itemMix)

  if (context.documentType === 'quote') {
    Object.entries(defaultFieldValues).forEach(([field, value]) => {
      if (!fields[field]) {
        fields[field] = value
        sources[field] = 'default'
      }
    })
  }

  if (context.documentType !== 'quote' && context.documentType !== 'unknown') {
    warnings.push(`This is a ${context.documentType.toUpperCase()} document. Customer-facing output will use "${context.outputLabel}" instead of "Fireplace Project Proposal".`)
  }
  if (context.documentType === 'unknown') {
    warnings.push('Document type could not be detected from the BisTrack PDF. Review the document-type badge before exporting.')
  }

  const totalNum = Number((fields.TOTAL_AMOUNT || '').replace(/[^0-9.-]/g, ''))
  const taxNum = Number((fields.IR_TAX || '').replace(/[^0-9.-]/g, ''))
  const quoteTotalNum = Number((fields.QUOTATION_TOTAL || '').replace(/[^0-9.-]/g, ''))
  const paidNum = Number((fields.AMOUNT_PAID || '').replace(/[^0-9.-]/g, ''))
  const balanceNum = Number((fields.BALANCE_DUE || '').replace(/[^0-9.-]/g, ''))

  if (Number.isFinite(totalNum) && Number.isFinite(taxNum) && Number.isFinite(quoteTotalNum)) {
    if (Math.abs(totalNum + taxNum - quoteTotalNum) > 0.01) {
      warnings.push('Total Amount plus Tax does not match the document total. Verify against the BisTrack PDF.')
    }
  }

  if (Number.isFinite(balanceNum) && balanceNum === 0 && Number.isFinite(paidNum) && paidNum > 0) {
    infos.push('Order is fully paid — deposit language hidden in the customer-facing output.')
    context.fullyPaid = true
  }

  if (context.deliveryDateMentioned) {
    infos.push('Delivery date detected and intentionally excluded from the customer-facing proposal.')
  }

  const populated = orderedFields.filter((f) => fields[f] !== '').length
  let extractionConfidence = 'high'
  if (populated < 8) extractionConfidence = 'low'
  else if (populated < 16) extractionConfidence = 'medium'

  return {
    fields,
    sources,
    context,
    documentType: context.documentType,
    lineItems,
    warnings,
    infos,
    extractionConfidence,
  }
}

export function mapToFieldContract(parseResult) {
  return {
    fields: parseResult.fields,
    sources: parseResult.sources,
    context: parseResult.context,
  }
}
