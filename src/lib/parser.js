import {
  createEmptyFieldState,
  defaultFieldValues,
  fieldGroups,
  fieldToSection,
  getFieldLabel,
  orderedFields,
} from './fieldContract.js'

const directFieldMatchers = [
  ['CUSTOMER_NAME', /^(customer|customer name)$/i],
  ['CUSTOMER_ID', /^(customer id|cust(?:omer)? #|customer #)$/i],
  ['CUSTOMER_PHONE', /^(customer phone|phone|billing phone)$/i],
  ['INVOICE_ADDRESS_LINE_1', /^(invoice address|billing address)$/i],
  ['INVOICE_CITY_STATE_ZIP', /^(invoice city\/state\/zip|billing city\/state\/zip|invoice city state zip)$/i],
  ['PROJECT_ADDRESS_LINE_1', /^(project address|job address|install address)$/i],
  ['PROJECT_CITY_STATE_ZIP', /^(project city\/state\/zip|job city\/state\/zip|project city state zip)$/i],
  ['PROJECT_PHONE', /^(project phone|job phone|install phone)$/i],
  ['QUOTE_NO', /^(quote no|quote #|proposal #)$/i],
  ['QUOTE_DATE', /^(quote date|proposal date)$/i],
  ['PROJECT_TITLE', /^(project title|title)$/i],
  ['PROJECT_CITY_STATE', /^(project city\/state|project city state)$/i],
  ['PAYMENT_TERMS', /^(payment terms|terms)$/i],
  ['PO_NUMBER', /^(po number|po#|po #)$/i],
  ['QUOTE_GOOD_FOR', /^(quote good for|good for)$/i],
  ['TAKEN_BY', /^(taken by)$/i],
  ['SALES_REP', /^(sales rep|salesperson|rep)$/i],
  ['INSTALLATION_TOTAL', /^(installation total)$/i],
  ['TOTAL_AMOUNT', /^(total amount)$/i],
  ['IR_TAX', /^(ir tax|tax)$/i],
  ['QUOTATION_TOTAL', /^(quotation total|quote total|grand total)$/i],
  ['AMOUNT_PAID', /^(amount paid|deposit paid)$/i],
  ['BALANCE_DUE', /^(balance due)$/i],
  ['DEPOSIT_TERMS', /^(deposit terms)$/i],
]

const multilineHeadings = {
  PROJECT_OVERVIEW: /^project overview$/i,
  INSTALLATION_SCOPE: /^installation scope$/i,
  PROJECT_NOTES: /^project notes$/i,
  LEGAL_TERMS: /^(legal terms|terms & conditions)$/i,
}

const packageHeadings = {
  package1: /^package\s*1\b[:-]?\s*(.*)$/i,
  package2: /^package\s*2\b[:-]?\s*(.*)$/i,
}

const detailHeadings = {
  detail1: /^detail(?: section)?\s*1\b[:-]?\s*(.*)$/i,
  detail2: /^detail(?: section)?\s*2\b[:-]?\s*(.*)$/i,
}

function cleanLine(line) {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripBullet(line) {
  return line.replace(/^[-*]\s*/, '').trim()
}

function appendMultilineField(fields, field, line) {
  const next = stripBullet(line)

  if (!next) {
    return
  }

  fields[field] = fields[field] ? `${fields[field]}\n${next}` : next
}

function parseLabelLine(line) {
  const colonMatch = line.match(/^([^:]+):\s*(.*)$/)

  if (colonMatch) {
    return {
      label: colonMatch[1].trim(),
      value: colonMatch[2].trim(),
    }
  }

  const dashMatch = line.match(/^([A-Za-z][A-Za-z0-9 /#&().-]+)\s+-\s+(.+)$/)

  if (!dashMatch) {
    return null
  }

  return {
    label: dashMatch[1].trim(),
    value: dashMatch[2].trim(),
  }
}

function matchDirectField(label) {
  const normalized = label.trim()
  const match = directFieldMatchers.find(([, pattern]) => pattern.test(normalized))
  return match ? match[0] : null
}

function setField(fields, sources, field, value, source) {
  if (value === '') {
    return
  }

  fields[field] = value
  sources[field] = source
}

function parseAmount(line) {
  const match = line.match(/\$[\d,]+(?:\.\d{2})?/)
  return match ? match[0] : ''
}

function parsePackageLine(line) {
  const text = stripBullet(line)
  const amount = parseAmount(text)

  if (!amount) {
    return null
  }

  const name = text.replace(amount, '').replace(/\s*[-–—:]\s*$/, '').trim()

  if (!name) {
    return null
  }

  return { name, amount }
}

function populatePackage(fields, sources, packageNumber, line, itemCount) {
  const parsed = parsePackageLine(line)

  if (!parsed) {
    return itemCount
  }

  const normalizedName = parsed.name.toLowerCase()

  if (normalizedName.includes('liner kit')) {
    setField(fields, sources, `PACKAGE_${packageNumber}_LINER_KIT_NAME`, parsed.name, 'parsed')
    setField(fields, sources, `PACKAGE_${packageNumber}_LINER_KIT_SUBTOTAL`, parsed.amount, 'parsed')
    return itemCount
  }

  if (normalizedName.includes('install')) {
    setField(fields, sources, `PACKAGE_${packageNumber}_INSTALL_NOTE`, parsed.name, 'parsed')
    setField(fields, sources, `PACKAGE_${packageNumber}_INSTALL_PRICE`, parsed.amount, 'parsed')
    return itemCount
  }

  if (itemCount >= 4) {
    return itemCount
  }

  const nextIndex = itemCount + 1
  setField(fields, sources, `PACKAGE_${packageNumber}_ITEM_${nextIndex}`, parsed.name, 'parsed')
  setField(fields, sources, `PACKAGE_${packageNumber}_PRICE_${nextIndex}`, parsed.amount, 'parsed')
  return nextIndex
}

function parseDetailLine(line) {
  const text = stripBullet(line)
  const pipeParts = text.split('|').map((part) => part.trim())

  if (pipeParts.length === 4) {
    return {
      item: pipeParts[0],
      qty: pipeParts[1],
      unit: pipeParts[2],
      total: pipeParts[3],
    }
  }

  const compactMatch = text.match(/^(.*?)\s+x\s*([0-9.]+)\s+@\s+(\$[\d,]+(?:\.\d{2})?)\s+=\s+(\$[\d,]+(?:\.\d{2})?)$/i)

  if (!compactMatch) {
    return null
  }

  return {
    item: compactMatch[1].trim(),
    qty: compactMatch[2].trim(),
    unit: compactMatch[3].trim(),
    total: compactMatch[4].trim(),
  }
}

function populateDetail(fields, sources, detailNumber, line, itemCount) {
  const subtotalMatch = line.match(/^subtotal\s*:\s*(.+)$/i)

  if (subtotalMatch) {
    setField(fields, sources, `DETAIL_SECTION_${detailNumber}_SUBTOTAL`, subtotalMatch[1].trim(), 'parsed')
    return itemCount
  }

  const parsed = parseDetailLine(line)

  if (!parsed || itemCount >= 9) {
    return itemCount
  }

  const nextIndex = itemCount + 1

  setField(fields, sources, `DETAIL_${detailNumber}_ITEM_${nextIndex}`, parsed.item, 'parsed')
  setField(fields, sources, `DETAIL_${detailNumber}_QTY_${nextIndex}`, parsed.qty, 'parsed')
  setField(fields, sources, `DETAIL_${detailNumber}_UNIT_PRICE_${nextIndex}`, parsed.unit, 'parsed')
  setField(fields, sources, `DETAIL_${detailNumber}_TOTAL_${nextIndex}`, parsed.total, 'parsed')

  return nextIndex
}

function deriveProjectCityState(fields, sources) {
  if (fields.PROJECT_CITY_STATE) {
    return
  }

  const sourceValue = fields.PROJECT_CITY_STATE_ZIP
  if (!sourceValue) {
    return
  }

  const derived = sourceValue.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim()
  if (!derived) {
    return
  }

  fields.PROJECT_CITY_STATE = derived
  sources.PROJECT_CITY_STATE = 'derived'
}

function parseCurrencyValue(value) {
  if (!value) {
    return null
  }

  const normalized = value.replace(/[^0-9.-]/g, '')
  if (!normalized) {
    return null
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function roughlyEqual(left, right) {
  return Math.abs(left - right) < 0.01
}

export function buildAudit(fields, sources, context = {}) {
  const missingFields = orderedFields.filter((field) => fields[field] === '')
  const warnings = []
  const infos = []

  if (context.deliveryDateMentioned) {
    warnings.push('Delivery date was mentioned in the notes and intentionally left out of the customer-facing field set.')
  }

  if (context.unmatchedLines?.length) {
    warnings.push(`${context.unmatchedLines.length} note line(s) did not map cleanly and should be reviewed.`)
  }

  const totalAmount = parseCurrencyValue(fields.TOTAL_AMOUNT)
  const taxAmount = parseCurrencyValue(fields.IR_TAX)
  const quotationTotal = parseCurrencyValue(fields.QUOTATION_TOTAL)
  const amountPaid = parseCurrencyValue(fields.AMOUNT_PAID)
  const balanceDue = parseCurrencyValue(fields.BALANCE_DUE)

  if (totalAmount !== null && taxAmount !== null && quotationTotal !== null) {
    if (!roughlyEqual(totalAmount + taxAmount, quotationTotal)) {
      warnings.push('Total Amount plus IR Tax does not match Quotation Total.')
    }
  }

  if (quotationTotal !== null && amountPaid !== null && balanceDue !== null) {
    if (!roughlyEqual(quotationTotal - amountPaid, balanceDue)) {
      warnings.push('Quotation Total minus Amount Paid does not match Balance Due.')
    }
  }

  Object.entries(defaultFieldValues).forEach(([field, value]) => {
    if (sources[field] === 'default' && fields[field] === value) {
      infos.push(`${getFieldLabel(field)} used the default business rule: ${value}.`)
    }
  })

  return {
    missingFields,
    missingBySection: fieldGroups.map((group) => ({
      key: group.key,
      label: group.label,
      fields: group.fields.filter((field) => fields[field] === ''),
    })),
    warnings,
    infos,
    unmatchedLines: context.unmatchedLines || [],
    deliveryDateMentioned: Boolean(context.deliveryDateMentioned),
    totalFieldsPresent:
      totalAmount !== null &&
      taxAmount !== null &&
      quotationTotal !== null &&
      amountPaid !== null &&
      balanceDue !== null,
    fieldCount: orderedFields.length,
  }
}

export function parseNotes(rawNotes) {
  const fields = createEmptyFieldState()
  const sources = Object.fromEntries(orderedFields.map((field) => [field, 'blank']))
  const context = {
    unmatchedLines: [],
    deliveryDateMentioned: /delivery date/i.test(rawNotes),
  }

  Object.entries(defaultFieldValues).forEach(([field, value]) => {
    fields[field] = value
    sources[field] = 'default'
  })

  const packageItemCounts = { 1: 0, 2: 0 }
  const detailItemCounts = { 1: 0, 2: 0 }
  let activeMode = null

  const lines = rawNotes
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line !== '')

  lines.forEach((line) => {
    const labeled = parseLabelLine(line)

    if (labeled) {
      const multilineField = Object.entries(multilineHeadings).find(([, pattern]) =>
        pattern.test(labeled.label),
      )

      if (multilineField) {
        const [field] = multilineField
        if (labeled.value) {
          appendMultilineField(fields, field, labeled.value)
          sources[field] = 'parsed'
        }
        activeMode = { type: 'multiline', field }
        return
      }

      const directField = matchDirectField(labeled.label)
      if (directField) {
        setField(fields, sources, directField, labeled.value, 'parsed')
        activeMode = null
        return
      }
    }

    const packageMatch = Object.entries(packageHeadings).find(([, pattern]) => pattern.test(line))
    if (packageMatch) {
      const [key, pattern] = packageMatch
      const packageNumber = key === 'package1' ? 1 : 2
      const title = line.match(pattern)?.[1]?.trim()
      if (title) {
        setField(fields, sources, `PACKAGE_${packageNumber}_TITLE`, title, 'parsed')
      }
      activeMode = { type: 'package', packageNumber }
      return
    }

    const detailMatch = Object.entries(detailHeadings).find(([, pattern]) => pattern.test(line))
    if (detailMatch) {
      const [key, pattern] = detailMatch
      const detailNumber = key === 'detail1' ? 1 : 2
      const title = line.match(pattern)?.[1]?.trim()
      if (title) {
        setField(fields, sources, `DETAIL_SECTION_${detailNumber}_TITLE`, title, 'parsed')
      }
      activeMode = { type: 'detail', detailNumber }
      return
    }

    if (activeMode?.type === 'multiline') {
      appendMultilineField(fields, activeMode.field, line)
      sources[activeMode.field] = 'parsed'
      return
    }

    if (activeMode?.type === 'package') {
      const nextCount = populatePackage(
        fields,
        sources,
        activeMode.packageNumber,
        line,
        packageItemCounts[activeMode.packageNumber],
      )
      if (nextCount !== packageItemCounts[activeMode.packageNumber]) {
        packageItemCounts[activeMode.packageNumber] = nextCount
        return
      }

      if (/liner kit|install/i.test(line)) {
        return
      }
    }

    if (activeMode?.type === 'detail') {
      const nextCount = populateDetail(
        fields,
        sources,
        activeMode.detailNumber,
        line,
        detailItemCounts[activeMode.detailNumber],
      )
      if (nextCount !== detailItemCounts[activeMode.detailNumber] || /^subtotal/i.test(line)) {
        detailItemCounts[activeMode.detailNumber] = nextCount
        return
      }
    }

    context.unmatchedLines.push(line)
  })

  deriveProjectCityState(fields, sources)

  return {
    fields,
    sources,
    context,
    audit: buildAudit(fields, sources, context),
  }
}

export function fieldsToExportLines(fields) {
  return orderedFields.map((field) => `${field}: ${fields[field] || ''}`).join('\n')
}

export function getFieldStatusClass(source) {
  if (source === 'default') {
    return 'is-default'
  }
  if (source === 'derived') {
    return 'is-derived'
  }
  if (source === 'manual') {
    return 'is-manual'
  }
  if (source === 'parsed') {
    return 'is-parsed'
  }
  return 'is-blank'
}

export function getSectionForField(field) {
  return fieldToSection[field]
}
