const stopWords = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'onto', 'that', 'this', 'there', 'their', 'they',
  'fireplace', 'fireplaces', 'manual', 'brochure', 'installation', 'operation', 'owner', 'owners',
  'current', 'vendor', 'reference', 'product', 'guide', 'page', 'file', 'pdf', 'model', 'unit',
])

function compact(value) { return String(value || '').trim() }
export function normalizeText(value) { return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function normalizeCode(value) { return compact(value).toLowerCase().replace(/[^a-z0-9]/g, '') }
function unique(values) { return [...new Set(values.map((value) => compact(value)).filter(Boolean))] }
function tokens(value) { return normalizeText(value).split(' ').filter((token) => token.length >= 2 && !stopWords.has(token)) }
function slug(value) { return normalizeText(value).replace(/\s+/g, '-').replace(/(^-|-$)/g, '') || 'reference' }
function fileBaseName(value) { return compact(value).split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '') }
function pdfFileNameFromUrl(value) {
  try { const url = new URL(value); return decodeURIComponent(url.pathname.split('/').pop() || '') } catch { return compact(value).split('/').pop() }
}
export function deriveManifestPdfFileName(item = {}) {
  const fromUrl = pdfFileNameFromUrl(item.pdf_url || item.pdfUrl || '')
  if (fromUrl && fromUrl.toLowerCase().endsWith('.pdf')) return fromUrl
  return `${slug(item.title || item.vendor || 'reference')}.pdf`
}
function localPathForManifestItem(item = {}) {
  const folder = compact(item.folder) || slug(item.vendor || 'Vendor')
  return `Fireplace Department/_CURRENT_WEB_REFERENCES/${folder}/${deriveManifestPdfFileName(item)}`
}
function docTypeLabel(value) { return compact(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Reference' }
function customerSafeLabel(value) {
  const normalized = normalizeText(value)
  if (normalized === 'yes') return 'Customer-safe brochure/reference'
  if (normalized.includes('internal')) return 'Internal verify first'
  return 'Use with salesperson verification'
}
function inferCategoryFromManifestItem(item = {}) {
  const text = normalizeText([item.vendor, item.folder, item.doc_type || item.docType, item.title, item.models, item.notes].join(' '))
  if (text.includes('log')) return 'gas-log'
  if (text.includes('insert')) return 'gas-insert'
  if (text.includes('electric')) return 'electric-fireplace'
  if (text.includes('door') || text.includes('screen')) return 'doors-glass'
  if (text.includes('chimney') || text.includes('vent') || text.includes('pipe')) return 'venting'
  if (text.includes('outdoor') || text.includes('firegear') || text.includes('fire pit')) return 'outdoor'
  if (text.includes('wood')) return 'wood-fireplace'
  return 'vendor-web-reference'
}
export function normalizeManifestItem(item = {}, index = 0) {
  const title = compact(item.title) || `Vendor reference ${index + 1}`
  const vendor = compact(item.vendor) || 'Unknown vendor'
  const pdfUrl = compact(item.pdf_url || item.pdfUrl)
  const sourcePage = compact(item.source_page || item.sourcePage)
  const pdfFileName = deriveManifestPdfFileName(item)
  const id = compact(item.id) || `webdoc:${slug(vendor)}:${slug(title)}:${index}`
  return {
    id,
    sourceManifestIndex: index,
    vendor,
    folder: compact(item.folder),
    priority: compact(item.priority) || 'C',
    docType: compact(item.doc_type || item.docType),
    docTypeLabel: docTypeLabel(item.doc_type || item.docType),
    title,
    models: compact(item.models),
    sourcePage,
    pdfUrl,
    pdfFileName,
    localPath: localPathForManifestItem(item),
    customerSafe: compact(item.customer_safe || item.customerSafe),
    customerSafeLabel: customerSafeLabel(item.customer_safe || item.customerSafe),
    status: compact(item.status),
    notes: compact(item.notes),
    category: inferCategoryFromManifestItem(item),
    aliases: unique([vendor, title, item.folder, item.doc_type || item.docType, item.models, pdfFileName, ...compact(item.models).split(',').map((part) => part.trim())]),
  }
}
export function normalizeManifest(manifest = {}) {
  const items = Array.isArray(manifest.items) ? manifest.items : Array.isArray(manifest) ? manifest : []
  return items.map(normalizeManifestItem)
}
export function parseManifestJson(text = '') { return normalizeManifest(JSON.parse(text)) }
function parseCsvLine(line = '') {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { cells.push(cell); cell = '' }
    else cell += char
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}
export function parseManifestCsv(text = '') {
  const lines = compact(text).split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']))
  })
  return normalizeManifest(rows)
}
export function matchFileToManifestItem(file = {}, manifestItems = []) {
  const name = compact(file.name)
  if (!name) return null
  const normalizedName = normalizeCode(fileBaseName(name))
  const direct = manifestItems.find((item) => normalizeCode(fileBaseName(item.pdfFileName)) === normalizedName)
  if (direct) return { ...direct, matchQuality: 'exact-file-name' }
  const loose = manifestItems.map((item) => {
    const haystack = normalizeText([item.title, item.vendor, item.models, item.pdfFileName].join(' '))
    const fileTokens = tokens(fileBaseName(name))
    const score = fileTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0)
    return { item, score }
  }).filter((entry) => entry.score >= 2).sort((left, right) => right.score - left.score)[0]
  return loose ? { ...loose.item, matchQuality: 'loose-title-match' } : null
}
function extractModelCodes(value = '') { return unique(compact(value).match(/\b[A-Z]{0,4}\d{2,5}[A-Z0-9-]{0,8}\b/gi) || []) }
function buildSnippet(text = '', query = '') {
  const clean = compact(text).replace(/\s+/g, ' ')
  if (!clean) return ''
  const normalized = clean.toLowerCase()
  const queryTokens = tokens(query)
  const hit = queryTokens.find((token) => normalized.includes(token))
  const pos = hit ? normalized.indexOf(hit) : 0
  const start = Math.max(0, pos - 90)
  const end = Math.min(clean.length, pos + 230)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}
export function buildPageIndexRecord({ manifestItem = {}, file = {}, pageNumber = 1, text = '', extractionSource = 'embedded-text' } = {}) {
  const cleanText = compact(text).replace(/\s+/g, ' ')
  const normalized = normalizeText(cleanText).slice(0, 6000)
  const doc = normalizeManifestItem(manifestItem)
  return {
    id: `${doc.id}:page:${pageNumber}`,
    documentId: doc.id,
    title: doc.title,
    vendor: doc.vendor,
    folder: doc.folder,
    category: doc.category,
    docType: doc.docType,
    docTypeLabel: doc.docTypeLabel,
    models: doc.models,
    pdfFileName: file.name || doc.pdfFileName,
    pdfUrl: doc.pdfUrl,
    sourcePage: doc.sourcePage,
    localPath: doc.localPath,
    customerSafe: doc.customerSafe,
    customerSafeLabel: doc.customerSafeLabel,
    pageNumber: Number(pageNumber) || 1,
    text: normalized,
    displayText: cleanText.slice(0, 2400),
    modelCodes: unique([...extractModelCodes(doc.models), ...extractModelCodes(cleanText)]),
    extractionSource,
    indexedAt: new Date().toISOString(),
  }
}
export function buildDocumentPageIndex({ manifestItem = {}, file = {}, pages = [], extractionSource = 'embedded-text' } = {}) {
  return pages.map((text, index) => buildPageIndexRecord({ manifestItem, file, pageNumber: index + 1, text, extractionSource })).filter((record) => record.text.length > 0)
}
function scorePageRecord(record = {}, query = '') {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0
  const queryTokens = tokens(normalizedQuery)
  const haystack = [record.text, normalizeText(record.title), normalizeText(record.vendor), normalizeText(record.models), normalizeText(record.pdfFileName)].join(' ')
  let score = 0
  if (haystack.includes(normalizedQuery)) score += 80
  if (normalizeText(record.title).includes(normalizedQuery)) score += 55
  if (normalizeText(record.models).includes(normalizedQuery)) score += 45
  const codeQuery = normalizeCode(query)
  if (codeQuery.length >= 3 && (record.modelCodes || []).some((code) => normalizeCode(code).includes(codeQuery) || codeQuery.includes(normalizeCode(code)))) score += 95
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 10
    if (normalizeText(record.title).includes(token)) score += 6
    if (normalizeText(record.vendor).includes(token)) score += 5
  }
  if (record.customerSafe === 'yes') score += 3
  if (record.docType?.includes('manual')) score += normalizedQuery.includes('manual') || normalizedQuery.includes('install') ? 8 : 0
  if (record.docType?.includes('brochure')) score += normalizedQuery.includes('brochure') || normalizedQuery.includes('flyer') ? 8 : 0
  return score
}
export function searchBinderPages(pageIndex = [], query = '', { limit = 8, customerSafeOnly = false } = {}) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []
  return pageIndex.filter((record) => !customerSafeOnly || record.customerSafe === 'yes')
    .map((record) => ({ record, score: scorePageRecord(record, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.record.title.localeCompare(right.record.title) || left.record.pageNumber - right.record.pageNumber)
    .slice(0, limit)
    .map(({ record, score }) => ({ ...record, searchScore: score, snippet: buildSnippet(record.displayText || record.text, query) }))
}
export function deriveBinderPageMatches({ pageIndex = [], file = {}, fields = {}, lineItems = [], limit = 6 } = {}) {
  const context = [file.customerGoal, file.customerPainPoints, file.likelyPath, file.taggedModel, file.taggedVendor, file.existingNotes, fields.MANUFACTURER, fields.MODEL, fields.PROJECT_TITLE, fields.PROJECT_SCOPE_SUMMARY, ...lineItems.map((item) => `${item.sku || item.code || item.productCode || ''} ${item.description || item.name || ''}`)].filter(Boolean).join(' ')
  return searchBinderPages(pageIndex, context, { limit })
}
export function pageRecordToReference(record = {}) {
  return {
    id: `page:${record.id}`,
    type: 'binder-page',
    title: `${record.title} · p. ${record.pageNumber}`,
    subtitle: `${record.vendor || 'Vendor'} · ${record.docTypeLabel || 'Document page'}`,
    category: record.category || 'binder-page',
    categoryLabel: 'Indexed Binder Page',
    sourceLabel: 'Current web reference page index',
    vendor: record.vendor || '',
    fileName: record.pdfFileName || '',
    path: record.localPath || '',
    pdfUrl: record.pdfUrl || '',
    sourcePage: record.sourcePage || '',
    pageNumber: record.pageNumber,
    customerSafeSummary: record.customerSafe === 'yes' ? `${record.title}, page ${record.pageNumber}` : '',
    details: [`Document: ${record.title}`, `Page: ${record.pageNumber}`, record.models ? `Models/topics: ${record.models}` : '', record.snippet ? `Matched text: ${record.snippet}` : '', `Use status: ${record.customerSafeLabel || 'Verify before sharing'}`].filter(Boolean),
    safety: record.customerSafe === 'yes'
      ? { tone: 'ready', label: 'Customer-safe page', warning: 'This page appears to come from a customer-safe brochure/reference. Still confirm model and field conditions before making promises.', customerSafe: true }
      : { tone: 'warning', label: 'Verify before sharing', warning: 'Use this page for internal lookup first. Confirm the exact model, revision, and installer requirements before using customer-facing wording.', customerSafe: false },
  }
}
export function summarizePageIndex(pageIndex = []) {
  const docs = new Set(pageIndex.map((record) => record.documentId).filter(Boolean))
  const vendors = new Set(pageIndex.map((record) => record.vendor).filter(Boolean))
  return { pages: pageIndex.length, documents: docs.size, vendors: vendors.size, latestIndexedAt: pageIndex.map((record) => record.indexedAt).sort().at(-1) || '' }
}
