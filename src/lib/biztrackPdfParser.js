import { createEmptyFieldState, defaultFieldValues, orderedFields } from './fieldContract.js'

const FIREPLACE_KEYWORDS = /(insert|hearth|mantel|liner|chimney|gas\s*log|flue|fireplace|stove|firebox|surround|jotul|napoleon\s*(?:bgd|gd|hd)|kozy|heatilator|heat\s*&\s*glo)/i
const OUTDOOR_KEYWORDS = /(grill|smoker|kamado|outdoor\s*kitchen|big\s*green\s*egg|traeger|weber|firepit|fire\s*pit|napoleon\s*rogue|prestige|rouge|travelq)/i

const STORE_ADDRESS_HINTS = /(1100\s+eleventh|1100\s+11th|bensonstone\.com|815-?227-?2000)/i
const TERMS_VOCAB = /^(prepaid|cash|cod|net\s*\d+|on\s*account|charge|check|credit|invoice|paid)$/i

const DOC_TYPE_MAP = {
  quotation: 'quote',
  quote: 'quote',
  order: 'order',
  invoice: 'invoice',
  bill: 'bill',
  receipt: 'receipt',
}

const DOC_HEADER_PATTERN = /^(Quotation|Quote|Order|Invoice|Bill|Receipt)\s+(\d{4,7})\s+(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM))?)\s+(\d{4,6})\b\s*(.*)$/i

const STATE_ZIP_TAIL = /^(.+?),\s*([A-Za-z]+)\.?,?\s+(\d{5}(?:-\d{4})?)\s*$/
const STREET_SUFFIX = /\b(?:Street|St|Drive|Dr|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Highway|Hwy|Place|Pl|Circle|Cir|Terrace|Ter|Trail|Tr|Parkway|Pkwy)\.?/i
const STREET_CITY_SPLIT = /^(.+?\b(?:Street|St|Drive|Dr|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Highway|Hwy|Place|Pl|Circle|Cir|Terrace|Ter|Trail|Tr|Parkway|Pkwy)\.?)\s+(.+)$/i
const ZIP_END_PATTERN = /\b\d{5}(?:-\d{4})?\s*$/
const PHONE_PATTERN = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/
const TEL_INLINE_PATTERN = /\bTel\.?\s*\d?\s*[-:]?\s*(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i
const UNIT_TOKEN = /^(?:EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)$/i

const TOTAL_LABELS = [
  { field: 'TOTAL_AMOUNT', pattern: /^(?:total\s*amount|sub\s*total|merchandise\s*total)$/i },
  { field: 'IR_TAX', pattern: /^(?:sales\s*tax|tax|ir\s*tax)$/i },
  { field: 'QUOTATION_TOTAL', pattern: /^(?:quotation\s*total|order\s*total|invoice\s*total|grand\s*total|total\s*due|bill\s*total)$/i },
  { field: 'AMOUNT_PAID', pattern: /^(?:amount\s*pa[il]d|paid|payment\s*received|deposit\s*paid)$/i },
  { field: 'BALANCE_DUE', pattern: /^balance\s*due$/i },
]

const CURRENCY_PATTERN = /^\$?-?[\d,]+\.\d{2}$/

const LINE_HEADER_LABELS = /^(?:order\s*no|quote\s*no|quotation\s*no|invoice\s*no|bill\s*no|receipt\s*no)\b.*\b(?:order\s*date|quote\s*date|invoice\s*date|date)\b.*\b(?:customer\s*id|cust\s*id|account)\b/i

function cleanLine(line) {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function setField(fields, sources, field, value, source = 'parsed') {
  if (value === '' || value === null || value === undefined) return
  const trimmed = String(value).trim()
  if (!trimmed) return
  fields[field] = trimmed
  sources[field] = source
}

function formatCurrency(raw) {
  if (raw === '' || raw === null || raw === undefined) return ''
  const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(numeric)) return ''
  return `$${numeric.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function parseCurrencyNumeric(text) {
  if (!text) return null
  const numeric = Number(String(text).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function isStoreLine(line) {
  return STORE_ADDRESS_HINTS.test(line)
}

function detectItemMix(lineItems) {
  const blob = lineItems.map((item) => `${item.code || ''} ${item.description || ''}`).join(' ')
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

function parseHeaderTail(tail, context) {
  if (!tail) return
  const byMatch = tail.match(/^(.*?)\s+By\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)$/i)
  let preBy = tail
  let postBy = ''
  if (byMatch) {
    preBy = byMatch[1].trim()
    context.deliveryDate = byMatch[2].trim()
    context.deliveryDateMentioned = true
    postBy = byMatch[3].trim()
  }
  if (preBy) {
    const tokens = preBy.split(/\s+/)
    let termsTokens = []
    let poTokens = []
    if (tokens.length) {
      const netMatch = preBy.match(/^(net\s*\d+|prepaid|cash|cod|on\s*account|charge|paid|check|credit)\b/i)
      if (netMatch) {
        termsTokens = netMatch[1].split(/\s+/)
        poTokens = preBy.slice(netMatch[1].length).trim().split(/\s+/).filter(Boolean)
      } else if (TERMS_VOCAB.test(tokens[0])) {
        termsTokens = [tokens[0]]
        poTokens = tokens.slice(1)
      } else {
        poTokens = tokens
      }
    }
    if (termsTokens.length) context.parsedTerms = termsTokens.join(' ')
    if (poTokens.length) context.parsedPo = poTokens.join(' ')
  }
  if (postBy) {
    const cleaned = postBy.replace(/\s+(?:this\s+is\s+a\s+reprint|page\s+\d+\s+of\s+\d+).*$/i, '').trim()
    const words = cleaned.split(/\s+/)
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2
      const firstHalf = words.slice(0, half).join(' ')
      const secondHalf = words.slice(half).join(' ')
      if (firstHalf === secondHalf) {
        context.takenBy = firstHalf
        context.salesRep = firstHalf
      } else {
        context.takenBy = firstHalf
        context.salesRep = secondHalf
      }
    } else if (words.length >= 2) {
      const half = Math.floor(words.length / 2) || 1
      context.takenBy = words.slice(0, half).join(' ')
      context.salesRep = words.slice(half).join(' ')
    } else if (words.length) {
      context.takenBy = words[0]
      context.salesRep = words[0]
    }
  }
}

function splitNameAndAddress(line) {
  const tail = line.match(STATE_ZIP_TAIL)
  if (!tail) return { name: '', addressLine: line, cityStateZip: '' }
  const [, prefix, state, zip] = tail
  const split = prefix.match(STREET_CITY_SPLIT)
  if (!split) {
    return { name: '', addressLine: prefix.trim(), cityStateZip: `${state.trim()}, ${zip.trim()}` }
  }
  const [, streetPart, cityPart] = split
  const cityStateZip = `${cityPart.trim()}, ${state.trim()}, ${zip.trim()}`
  const streetMatch = streetPart.match(/^(.*?)(\d+\s+.+)$/)
  if (streetMatch) {
    return {
      name: streetMatch[1].trim(),
      addressLine: streetMatch[2].trim(),
      cityStateZip,
    }
  }
  return { name: '', addressLine: streetPart.trim(), cityStateZip }
}

function looksLikeAddressLine(line) {
  if (!ZIP_END_PATTERN.test(line)) return false
  return STREET_SUFFIX.test(line) || STATE_ZIP_TAIL.test(line)
}

function parseAddressBlock(blockLines) {
  const out = { name: '', addressLine1: '', cityStateZip: '', phone: '' }
  if (!blockLines.length) return out
  const cleaned = []
  for (const raw of blockLines) {
    const phoneInline = raw.match(TEL_INLINE_PATTERN)
    if (phoneInline) {
      if (!out.phone) out.phone = phoneInline[1].replace(/\s+/g, '-').replace(/\.+/g, '-')
      const stripped = raw.replace(TEL_INLINE_PATTERN, '').replace(/\bTel\.?\s*\d?\b/gi, '').trim()
      if (stripped) cleaned.push(stripped)
      continue
    }
    const phoneMatch = raw.match(PHONE_PATTERN)
    if (phoneMatch && raw.replace(PHONE_PATTERN, '').replace(/[\s.-]+/g, '').length < 5) {
      if (!out.phone) out.phone = phoneMatch[1]
      continue
    }
    cleaned.push(raw)
  }

  let addressLineFound = false
  for (const line of cleaned) {
    if (looksLikeAddressLine(line) && !addressLineFound) {
      const split = splitNameAndAddress(line)
      if (split.name && !out.name) out.name = split.name
      if (split.addressLine) out.addressLine1 = split.addressLine
      if (split.cityStateZip) out.cityStateZip = split.cityStateZip
      addressLineFound = true
      continue
    }
    if (!out.name && /^[A-Z][A-Za-z'&.\- ]+$/.test(line) && line.length < 60) {
      out.name = line
      continue
    }
  }
  return out
}

function consumeUntil(lines, startIndex, stopPredicate, maxLines = 10) {
  const collected = []
  let i = startIndex
  while (i < lines.length && collected.length < maxLines) {
    const line = lines[i]
    if (line === '') { i += 1; continue }
    if (stopPredicate(line)) break
    if (isStoreLine(line)) { i += 1; continue }
    collected.push(line)
    i += 1
  }
  return { collected, nextIndex: i }
}

function findHeaderAnchor(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(DOC_HEADER_PATTERN)
    if (m) return { index: i, match: m }
  }
  return null
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
    const itemLabel = [item.code, item.description].filter(Boolean).join(' — ').slice(0, 200)
    setField(fields, sources, `DETAIL_${detail}_ITEM_${slot}`, itemLabel)
    if (item.qty) setField(fields, sources, `DETAIL_${detail}_QTY_${slot}`, item.qty)
    if (item.unitPrice) setField(fields, sources, `DETAIL_${detail}_UNIT_PRICE_${slot}`, item.unitPrice)
    if (item.total) setField(fields, sources, `DETAIL_${detail}_TOTAL_${slot}`, item.total)
  }
}

function extractLineItems(lines, headerIndex) {
  const items = []
  if (headerIndex === -1) return items
  const remaining = lines.slice(headerIndex + 1)
  const codeAnchorRegex = /^(\d{1,3})\s+([A-Za-z0-9_.\-/]+)\s*$/
  const fullRowRegex = /^(\d{1,3})\s+(\S+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)\s+\$?([\d,]+\.\d{2})\s+(?:EA\s+)?\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s*$/i
  const qtyUnitRegex = /^(\d+(?:\.\d+)?)\s+(EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)\s*$/i
  const priceUnitRegex = /^([\d,]+\.\d{2})\s+(EA|FT|LF|EACH|PC|PCS|PR|BX|BG|SET|SF|SY|YD|HR)\s*$/i
  const currencyOnlyRegex = /^([\d,]+\.\d{2})\s*$/

  const isCodeAnchorLine = (line) => {
    const m = line.match(codeAnchorRegex)
    if (!m) return null
    if (UNIT_TOKEN.test(m[2])) return null
    return m
  }

  let current = null
  let phase = 'await'

  const flush = () => {
    if (current && (current.code || current.description)) items.push(current)
    current = null
    phase = 'await'
  }

  for (let i = 0; i < remaining.length; i += 1) {
    const line = remaining[i]
    if (line === '') continue
    if (/^(?:total\s*amount|sub\s*total|sales\s*tax|order\s*total|quotation\s*total|invoice\s*total|grand\s*total|amount\s*pa[il]d|balance\s*due|payment\s*method|signature|returns\s+of\s+stock|any\s+alteration)/i.test(line)) {
      flush()
      break
    }

    const fullMatch = line.match(fullRowRegex)
    if (fullMatch) {
      flush()
      const [, lineNo, code, description, qty, unit, unitPrice, , total] = fullMatch
      items.push({
        lineNumber: lineNo,
        code,
        description: description.trim(),
        qty,
        unit,
        unitPrice: formatCurrency(unitPrice),
        total: formatCurrency(total),
      })
      continue
    }

    const qtyUnitMatch = line.match(qtyUnitRegex)
    const priceUnitMatch = line.match(priceUnitRegex)
    const currencyOnly = line.match(currencyOnlyRegex)
    const codeAnchor = isCodeAnchorLine(line)

    if (current && phase === 'price' && (priceUnitMatch || currencyOnly)) {
      const value = priceUnitMatch ? priceUnitMatch[1] : currencyOnly[1]
      current.unitPrice = formatCurrency(value)
      phase = 'discount'
      continue
    }
    if (current && phase === 'discount' && currencyOnly) {
      phase = 'total'
      continue
    }
    if (current && phase === 'total' && currencyOnly) {
      current.total = formatCurrency(currencyOnly[1])
      flush()
      continue
    }
    if (current && phase === 'desc' && qtyUnitMatch) {
      current.qty = qtyUnitMatch[1]
      current.unit = qtyUnitMatch[2]
      phase = 'price'
      continue
    }

    if (codeAnchor) {
      flush()
      current = {
        lineNumber: codeAnchor[1],
        code: codeAnchor[2],
        description: '',
        qty: '',
        unit: '',
        unitPrice: '',
        total: '',
      }
      phase = 'desc'
      continue
    }

    if (current && phase === 'desc') {
      current.description = current.description ? `${current.description} ${line}` : line
    }
  }
  flush()
  return items
}

function pairTotalsLabelsAndValues(rawLines, fields, sources) {
  const lines = rawLines.filter((l) => l !== '')
  const labelQueue = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const labelHit = TOTAL_LABELS.find((l) => l.pattern.test(line))
    if (labelHit) {
      labelQueue.push(labelHit.field)
      i += 1
      continue
    }
    if (CURRENCY_PATTERN.test(line)) {
      const collectedValues = []
      let j = i
      while (j < lines.length && CURRENCY_PATTERN.test(lines[j])) {
        collectedValues.push(lines[j])
        j += 1
      }
      const pairs = []
      const labelsToConsume = labelQueue.splice(0, Math.min(labelQueue.length, collectedValues.length))
      const leftover = labelQueue.splice(0)
      if (collectedValues.length === 1 && labelsToConsume.length === 1 && leftover.length === 1 && labelsToConsume[0] === 'AMOUNT_PAID' && leftover[0] === 'BALANCE_DUE') {
        pairs.push(['BALANCE_DUE', collectedValues[0]])
      } else {
        labelsToConsume.forEach((label, idx) => pairs.push([label, collectedValues[idx]]))
        if (leftover.length === 1 && labelsToConsume.length === 0) {
          pairs.push([leftover[0], collectedValues[0]])
        }
      }
      pairs.forEach(([label, value]) => {
        if (!fields[label]) setField(fields, sources, label, formatCurrency(value))
      })
      i = j
      continue
    }
    i += 1
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

  const lines = rawText.split(/\r?\n/).map(cleanLine)

  const anchor = findHeaderAnchor(lines)
  if (anchor) {
    const [, docTypeWord, docNumber, docDate, customerId, tail] = anchor.match
    context.documentType = DOC_TYPE_MAP[docTypeWord.toLowerCase()] || 'unknown'
    setField(fields, sources, 'QUOTE_NO', docNumber)
    setField(fields, sources, 'QUOTE_DATE', docDate)
    setField(fields, sources, 'CUSTOMER_ID', customerId)
    parseHeaderTail(tail, context)
    if (context.parsedTerms) setField(fields, sources, 'PAYMENT_TERMS', context.parsedTerms)
    if (context.parsedPo) setField(fields, sources, 'PO_NUMBER', context.parsedPo)
    if (context.takenBy) setField(fields, sources, 'TAKEN_BY', context.takenBy)
    if (context.salesRep) setField(fields, sources, 'SALES_REP', context.salesRep)
  }

  const invoiceAnchorIndex = lines.findIndex((l) => /^invoice\s+address\s*$/i.test(l))
  const deliveryAnchorIndex = lines.findIndex((l) => /^delivery\s+address\s*$/i.test(l))
  const labelRowIndex = lines.findIndex((l) => LINE_HEADER_LABELS.test(l))
  const headerIndex = anchor ? anchor.index : -1
  const blockTerminator = (line) => LINE_HEADER_LABELS.test(line) || DOC_HEADER_PATTERN.test(line) || /^delivery\s+address$/i.test(line) || /^invoice\s+address$/i.test(line) || /^line\s+(?:product|item)\s*code/i.test(line)

  if (invoiceAnchorIndex !== -1) {
    const { collected } = consumeUntil(lines, invoiceAnchorIndex + 1, blockTerminator, 8)
    const block = parseAddressBlock(collected)
    if (block.name) setField(fields, sources, 'CUSTOMER_NAME', block.name)
    if (block.addressLine1) setField(fields, sources, 'INVOICE_ADDRESS_LINE_1', block.addressLine1)
    if (block.cityStateZip) setField(fields, sources, 'INVOICE_CITY_STATE_ZIP', block.cityStateZip)
    if (block.phone) setField(fields, sources, 'CUSTOMER_PHONE', block.phone)
  }

  if (deliveryAnchorIndex !== -1) {
    const { collected } = consumeUntil(lines, deliveryAnchorIndex + 1, blockTerminator, 8)
    const block = parseAddressBlock(collected)
    if (block.addressLine1) setField(fields, sources, 'PROJECT_ADDRESS_LINE_1', block.addressLine1)
    if (block.cityStateZip) setField(fields, sources, 'PROJECT_CITY_STATE_ZIP', block.cityStateZip)
  } else if (invoiceAnchorIndex !== -1) {
    const upperBound = labelRowIndex !== -1 ? labelRowIndex : (headerIndex !== -1 ? headerIndex : lines.length)
    for (let i = invoiceAnchorIndex + 1; i < upperBound; i += 1) {
      const line = lines[i]
      if (!line || isStoreLine(line)) continue
      if (!looksLikeAddressLine(line)) continue
      const split = splitNameAndAddress(line)
      if (!split.addressLine) continue
      const sameAsInvoice = split.addressLine === fields.INVOICE_ADDRESS_LINE_1 && split.cityStateZip === fields.INVOICE_CITY_STATE_ZIP
      if (sameAsInvoice && i <= invoiceAnchorIndex + 3) continue
      setField(fields, sources, 'PROJECT_ADDRESS_LINE_1', split.addressLine)
      setField(fields, sources, 'PROJECT_CITY_STATE_ZIP', split.cityStateZip)
      break
    }
  }

  if (fields.PROJECT_CITY_STATE_ZIP && !fields.PROJECT_CITY_STATE) {
    const derived = fields.PROJECT_CITY_STATE_ZIP.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim()
    if (derived) setField(fields, sources, 'PROJECT_CITY_STATE', derived, 'derived')
  }

  const lineItemHeaderIndex = lines.findIndex((l) => /^line\s+(?:product\s+)?code/i.test(l) || /^line\s+item\s+code/i.test(l))
  const items = extractLineItems(lines, lineItemHeaderIndex !== -1 ? lineItemHeaderIndex : -1)
  lineItems.push(...items)
  applyLineItemsToFields(fields, sources, items)

  pairTotalsLabelsAndValues(lines, fields, sources)

  context.itemMix = detectItemMix(items)
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

  if (lineItemHeaderIndex !== -1 && items.length === 0) {
    warnings.push('Line items header was found but no rows were extracted. The PDF may have unusual column ordering — verify line items against the BisTrack PDF.')
  }

  const totalNum = parseCurrencyNumeric(fields.TOTAL_AMOUNT)
  const taxNum = parseCurrencyNumeric(fields.IR_TAX)
  const quoteTotalNum = parseCurrencyNumeric(fields.QUOTATION_TOTAL)
  const paidNum = parseCurrencyNumeric(fields.AMOUNT_PAID)
  const balanceNum = parseCurrencyNumeric(fields.BALANCE_DUE)

  if (totalNum !== null && taxNum !== null && quoteTotalNum !== null) {
    if (Math.abs(totalNum + taxNum - quoteTotalNum) > 0.01) {
      warnings.push('Total Amount plus Tax does not match the document total. Verify against the BisTrack PDF.')
    }
  }
  if (balanceNum !== null && balanceNum === 0 && paidNum !== null && paidNum > 0) {
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
    lineItems: items,
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
