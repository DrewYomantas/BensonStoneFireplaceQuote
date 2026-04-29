const PRODUCT_GROUPS = [
  'Fireplace Unit',
  'Venting / Chimney',
  'Controls / Remotes',
  'Doors / Screens',
  'Trim / Surround',
  'Accessories',
  'Delivery / Labor / Service / Adjustments',
]

const INTERNAL_EXPORT_BLOCKLIST = [
  'average_cost_with_add',
  'standard_buy',
  'estimated_margin_pct_at_standard_sell',
  'inventory_turns',
  'total_sales_snapshot',
  'total_quantity_snapshot',
  'product_rank_snapshot',
]

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      value += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(value)
      value = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(value)
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      value = ''
      continue
    }

    value += char
  }

  row.push(value)
  if (row.some((cell) => cell !== '')) rows.push(row)

  const [headers = [], ...body] = rows
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function toNumber(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function toBool(value) {
  return /^(true|yes|1)$/i.test(String(value || '').trim())
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter((token) => token.length > 2)
}

function productGroupForProduct(product) {
  const text = normalizeText(`${product.categoryGuess} ${product.name} ${product.description}`)
  if (/\b(direct vent fireplace|electric fireplace|fireplace|insert|stove|firebox|gas log|logs)\b/.test(text)) return 'Fireplace Unit'
  if (/\b(remote|control|thermostat|pilot|skytech|switch)\b/.test(text)) return 'Controls / Remotes'
  if (/\b(chimney|vent|flue|pipe|liner|adapter|adaptor|cap|termination)\b/.test(text)) return 'Venting / Chimney'
  if (/\b(door|screen|barrier|face)\b/.test(text)) return 'Doors / Screens'
  if (/\b(trim|surround|mantel|front|panel|shelf)\b/.test(text)) return 'Trim / Surround'
  return 'Accessories'
}

function productGroupForManualLine(lineType) {
  const text = normalizeText(`${lineType.code} ${lineType.name}`)
  if (/\b(delivery|labor|service|adjust|change order|chimney sweep|design fee|commission|install|repair)\b/.test(text)) {
    return 'Delivery / Labor / Service / Adjustments'
  }
  return 'Accessories'
}

function sanitizeProduct(row) {
  const product = {
    type: 'catalog-product',
    productId: row.product_id,
    code: normalizeCode(row.product_code),
    department: row.department,
    name: row.customer_facing_name_seed,
    description: row.bistrack_description,
    categoryGuess: row.category_guess,
    onDisplay: toBool(row.on_display),
    displayDepartment: row.display_department,
    stockActual: toNumber(row.stock_actual),
    stockAvailable: toNumber(row.stock_available),
    stockOnOrder: toNumber(row.stock_on_order),
    allocatedStock: toNumber(row.allocated_stock),
    standardSell: toNumber(row.standard_sell),
    standardBuy: toNumber(row.standard_buy),
    averageCostWithAdd: toNumber(row.average_cost_with_add),
    estimatedMarginPctAtStandardSell: toNumber(row.estimated_margin_pct_at_standard_sell),
    inventoryTurns: toNumber(row.inventory_turns),
    productRankSnapshot: toNumber(row.product_rank_snapshot),
    sourceSnapshot: row.source_snapshot,
  }
  return { ...product, group: productGroupForProduct(product) }
}

function sanitizeManualLineType(row) {
  const lineType = {
    type: 'manual-order-line-type',
    id: row.manual_order_line_type_id,
    code: normalizeCode(row.default_code),
    department: row.department,
    name: row.name,
    sourceSnapshot: row.source_snapshot,
  }
  return { ...lineType, group: productGroupForManualLine(lineType) }
}

function buildBadges(match) {
  const badges = []
  if (!match || match.matchType !== 'exact') return ['Needs Review']

  const item = match.product
  if (item.onDisplay) badges.push('On Display')
  if ((item.stockActual || 0) > 0) badges.push('In Stock')
  if ((item.stockAvailable || 0) > 0) badges.push('Available')
  if ((item.stockOnOrder || 0) > 0) badges.push('On Order')
  if (item.type === 'catalog-product' && item.estimatedMarginPctAtStandardSell !== null && item.estimatedMarginPctAtStandardSell < 0.35) {
    badges.push('Margin Sensitive')
  }
  if (!badges.length) badges.push('Needs Review')
  return badges
}

function fuzzyScore(queryTokens, product) {
  if (!queryTokens.length) return 0
  const productTokens = new Set(tokenize(`${product.code} ${product.name} ${product.description} ${product.categoryGuess}`))
  const hits = queryTokens.filter((token) => productTokens.has(token)).length
  return hits / Math.max(queryTokens.length, 1)
}

function findFuzzySuggestion(description, products) {
  const queryTokens = tokenize(description)
  if (queryTokens.length < 2) return null

  let best = null
  for (const product of products) {
    const score = fuzzyScore(queryTokens, product)
    if (score >= 0.45 && (!best || score > best.score)) {
      best = { product, score }
    }
  }
  return best
}

export function createProductCatalog({ fireplaceCatalogCsv, manualLineTypesCsv, manifestJson = '{}' }) {
  const products = parseCsv(fireplaceCatalogCsv).map(sanitizeProduct).filter((product) => product.code)
  const manualLineTypes = parseCsv(manualLineTypesCsv).map(sanitizeManualLineType).filter((lineType) => lineType.code)
  const exactByCode = new Map([...products, ...manualLineTypes].map((item) => [item.code, item]))
  let manifest
  try { manifest = JSON.parse(manifestJson) } catch { manifest = {} }

  return {
    products,
    manualLineTypes,
    exactByCode,
    snapshotDate: manifest.snapshot_date || products[0]?.sourceSnapshot?.replace(/^.*?(\d{4}-\d{2}-\d{2}).*$/, '$1') || '',
  }
}

export function extractLineItemsFromFields(fields) {
  const rows = []
  for (const detail of [1, 2]) {
    for (let slot = 1; slot <= 9; slot += 1) {
      const item = fields[`DETAIL_${detail}_ITEM_${slot}`]
      if (!item) continue
      rows.push({
        code: item.split(/\s+[—-]\s+/)[0],
        description: item,
        qty: fields[`DETAIL_${detail}_QTY_${slot}`],
        unitPrice: fields[`DETAIL_${detail}_UNIT_PRICE_${slot}`],
        total: fields[`DETAIL_${detail}_TOTAL_${slot}`],
      })
    }
  }
  return rows
}

export function buildProductIntelligence(lineItems, catalog) {
  const rows = lineItems.map((line, index) => {
    const exact = catalog.exactByCode.get(normalizeCode(line.code))
    const suggestion = exact ? null : findFuzzySuggestion(line.description || line.code, catalog.products)
    const match = exact
      ? { matchType: 'exact', product: exact }
      : suggestion
        ? { matchType: 'suggestion', product: suggestion.product, score: suggestion.score }
        : null
    const group = exact?.group || suggestion?.product.group || 'Accessories'

    return {
      id: `${index}-${line.code || line.description}`,
      sourceLine: line,
      code: line.code || '',
      description: line.description || '',
      qty: line.qty || '',
      unitPrice: line.unitPrice || '',
      total: line.total || '',
      group,
      match,
      badges: buildBadges(match),
      needsReview: !match || match.matchType !== 'exact',
    }
  })

  return {
    snapshotDate: catalog.snapshotDate,
    rows,
    groupedRows: PRODUCT_GROUPS.map((group) => ({
      group,
      rows: rows.filter((row) => row.group === group),
    })).filter((section) => section.rows.length),
    exactMatchCount: rows.filter((row) => row.match?.matchType === 'exact').length,
    suggestionCount: rows.filter((row) => row.match?.matchType === 'suggestion').length,
    needsReviewCount: rows.filter((row) => row.needsReview).length,
    internalExportBlocklist: INTERNAL_EXPORT_BLOCKLIST,
  }
}

export { INTERNAL_EXPORT_BLOCKLIST, PRODUCT_GROUPS }
