function parseAmount(raw) {
  if (!raw) return null
  const numeric = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function deriveOutputLabel(documentType, itemMix, fallback) {
  if (fallback) return fallback
  if (documentType === 'quote' || documentType === 'notes') {
    return itemMix === 'outdoor' ? 'Outdoor Living Proposal' : 'Fireplace Project Proposal'
  }
  if (itemMix === 'outdoor') return 'Order Summary'
  if (documentType === 'order' || documentType === 'bill') return 'Project Confirmation'
  if (documentType === 'invoice' || documentType === 'receipt') return 'Order Summary'
  return 'Project Summary'
}

export function buildCustomerView(fields, parseContext = {}, options = {}) {
  const documentType = parseContext.documentType || 'notes'
  const itemMix = parseContext.itemMix || 'unknown'
  const isQuote = documentType === 'quote' || documentType === 'notes'
  const outputLabel = deriveOutputLabel(documentType, itemMix, parseContext.outputLabel)

  const balanceDue = parseAmount(fields.BALANCE_DUE)
  const amountPaid = parseAmount(fields.AMOUNT_PAID)
  const fullyPaid =
    Boolean(parseContext.fullyPaid) ||
    (balanceDue !== null && balanceDue === 0 && amountPaid !== null && amountPaid > 0)

  const showDepositLanguage = isQuote && !fullyPaid && Boolean(fields.DEPOSIT_TERMS)
  const showQuoteGoodFor = isQuote && Boolean(fields.QUOTE_GOOD_FOR)
  const showSignature = isQuote
  const includeDelivery = Boolean(options.includeDeliveryDate)
  const deliveryDate = includeDelivery && parseContext.deliveryDate ? parseContext.deliveryDate : ''
  const balanceCallout = fullyPaid
    ? 'Paid in full — thank you!'
    : balanceDue !== null
      ? `Balance due: ${fields.BALANCE_DUE}`
      : ''

  return {
    outputLabel,
    documentType,
    isQuote,
    fullyPaid,
    showDepositLanguage,
    showQuoteGoodFor,
    showSignature,
    showDeliveryDate: includeDelivery && Boolean(deliveryDate),
    deliveryDate,
    balanceCallout,
  }
}

export function collectPackages(fields) {
  return [1, 2]
    .map((n) => {
      const items = Array.from({ length: 4 }, (_, i) => i + 1)
        .map((slot) => ({
          name: fields[`PACKAGE_${n}_ITEM_${slot}`] || '',
          price: fields[`PACKAGE_${n}_PRICE_${slot}`] || '',
        }))
        .filter((row) => row.name || row.price)
      return {
        n,
        title: fields[`PACKAGE_${n}_TITLE`] || '',
        items,
        liner: {
          name: fields[`PACKAGE_${n}_LINER_KIT_NAME`] || '',
          subtotal: fields[`PACKAGE_${n}_LINER_KIT_SUBTOTAL`] || '',
        },
        install: {
          note: fields[`PACKAGE_${n}_INSTALL_NOTE`] || '',
          price: fields[`PACKAGE_${n}_INSTALL_PRICE`] || '',
        },
      }
    })
    .filter((pkg) => pkg.title || pkg.items.length || pkg.liner.name || pkg.install.note)
}

export function collectDetailItems(fields) {
  const sections = []
  for (const detail of [1, 2]) {
    const rows = Array.from({ length: 9 }, (_, i) => i + 1)
      .map((slot) => ({
        item: fields[`DETAIL_${detail}_ITEM_${slot}`] || '',
        qty: fields[`DETAIL_${detail}_QTY_${slot}`] || '',
        unitPrice: fields[`DETAIL_${detail}_UNIT_PRICE_${slot}`] || '',
        total: fields[`DETAIL_${detail}_TOTAL_${slot}`] || '',
      }))
      .filter((row) => row.item || row.total || row.unitPrice)
    if (rows.length || fields[`DETAIL_SECTION_${detail}_TITLE`]) {
      sections.push({
        n: detail,
        title: fields[`DETAIL_SECTION_${detail}_TITLE`] || `Detail Section ${detail}`,
        subtotal: fields[`DETAIL_SECTION_${detail}_SUBTOTAL`] || '',
        rows,
      })
    }
  }
  return sections
}
