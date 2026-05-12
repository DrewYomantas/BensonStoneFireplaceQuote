import { categoryOptions, getPriceBookPath, listVendors } from './vendorPriceBooks.js'
import { listDisplayRecords } from './showroomDisplayRegister.js'
import { vendorWebReferenceManifest } from '../data/vendorWebReferenceManifest.js'
import { normalizeManifest } from './binderPageIndex.js'
import { CHAPTER_LABELS, SESSION_STATUS, projectHearthStudioSessionForDisplay } from './hearthStudioSessionStorage.js'

const stopWords = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'onto', 'that', 'this', 'there', 'their', 'they',
  'customer', 'project', 'quote', 'fireplace', 'unit', 'model', 'need', 'needs', 'want', 'wants',
  'looking', 'shown', 'show', 'good', 'nice', 'existing', 'current', 'new', 'old', 'more', 'less',
])

const categoryLabelMap = Object.fromEntries(categoryOptions.map((item) => [item.value, item.label]))

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeCode(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function compact(value) {
  return String(value || '').trim()
}

function unique(values) {
  return [...new Set(values.map((value) => compact(value)).filter(Boolean))]
}

function tokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token))
}

function hasAny(value, needles = []) {
  const normalized = normalizeText(value)
  return needles.some((needle) => normalized.includes(normalizeText(needle)))
}

function safeDateLabel(value) {
  return compact(value) || 'date unknown'
}

function safeTime(value) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function relativeTimeLabel(value, now = new Date()) {
  const time = safeTime(value)
  if (!time) return 'date unknown'
  const diff = Math.max(0, new Date(now).getTime() - time)
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 9) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

function chapterLabel(session = {}, now = new Date()) {
  const chapter = Number.isFinite(Number(session.currentChapter)) ? Number(session.currentChapter) : 0
  const padded = String(chapter).padStart(2, '0')
  const label = CHAPTER_LABELS[chapter] || 'Hearth Studio'
  if (session.status === SESSION_STATUS.completed) return `Completed ${relativeTimeLabel(session.completedAt || session.lastTouchedAt, now)}`
  if (session.status === SESSION_STATUS.paused) return `Paused at Chapter ${padded} - ${label}`
  return `Chapter ${padded} - ${label}`
}

function dimensionLabel(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') return ''
  const parts = [dimensions.w, dimensions.h, dimensions.d]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map((value) => String(value).trim())
  return parts.length ? parts.join(' x ') : ''
}

function sessionSelectionLine(selections = {}) {
  const stone = compact(selections.stoneSeries)
  const dims = dimensionLabel(selections.dimensions)
  if (stone && dims) return `${stone} - ${dims}`
  if (stone) return stone
  if (dims) return dims
  return 'Selections not yet recorded'
}

function referenceSafety(reference = {}) {
  if (reference.type === 'vendor-price-book') {
    const internal = normalizeText(reference.internalNote)
    if (internal.includes('dealer cost') || internal.includes('internal only')) {
      return {
        tone: 'danger',
        label: 'Internal only',
        warning: 'Contains dealer/internal pricing context. Use for salesperson reference only. Never copy into customer-facing output.',
        customerSafe: false,
      }
    }
    return {
      tone: 'internal',
      label: 'Internal reference',
      warning: 'Use to find the correct Benson/internal price-list source. BizTrack remains the quote source of truth.',
      customerSafe: false,
    }
  }

  if (reference.type === 'web-reference') {
    if (reference.customerSafe === 'yes') {
      return { tone: 'ready', label: 'Current vendor reference', warning: 'Customer-safe manufacturer reference. Still confirm model, revision, and field conditions before promising fit or scope.', customerSafe: true }
    }
    return { tone: 'warning', label: 'Verify before sharing', warning: 'Use this as an internal lookup first. Installation, compatibility, and clearance details must be confirmed against the exact model/manual revision.', customerSafe: false }
  }

  if (reference.type === 'binder-page') {
    return reference.safety || { tone: 'warning', label: 'Indexed page', warning: 'Use this page as lookup support. Confirm model and field conditions before sharing.', customerSafe: false }
  }

  if (reference.type === 'showroom-display') {
    if (reference.displayStatus === 'on-display') {
      return {
        tone: 'ready',
        label: 'Showroom verified',
        warning: 'Customer-facing wording is okay only after the salesperson confirms the customer actually saw this display.',
        customerSafe: true,
      }
    }
    return {
      tone: 'warning',
      label: 'Verify display',
      warning: 'Display record exists, but status is not confirmed on-display. Do not promise availability until verified.',
      customerSafe: false,
    }
  }

  if (reference.type === 'hearthSession') {
    return {
      tone: 'internal',
      label: 'Hearth Studio',
      warning: 'Rep-side session context. Use as discovery support; BisTrack remains the quote source of truth.',
      customerSafe: false,
    }
  }

  return {
    tone: 'guardrail',
    label: 'Sales guardrail',
    warning: 'Use as internal decision support. Confirm field conditions before making product promises.',
    customerSafe: false,
  }
}

export function buildHearthSessionReference(session = {}, { now = new Date() } = {}) {
  const view = projectHearthStudioSessionForDisplay(session)
  if (!view || !view.id) return null
  const selections = view.selections || {}
  const rules = Array.isArray(view.flags?.fieldRulesTriggered) ? view.flags.fieldRulesTriggered.filter(Boolean) : []
  const title = chapterLabel(view, now)
  const subtitle = sessionSelectionLine(selections)
  const setupGoal = [selections.setupType, selections.goal].map(compact).filter(Boolean).join(' - ')
  const lastTouched = relativeTimeLabel(view.lastTouchedAt, now)
  const ruleLine = rules.length
    ? `${rules.length} rule${rules.length === 1 ? '' : 's'}: ${rules.join(', ')}`
    : ''
  const reference = {
    id: `hearth-session:${view.id}`,
    type: 'hearthSession',
    title,
    subtitle,
    category: 'hearth-session',
    categoryLabel: 'Hearth Studio Session',
    sourceLabel: 'Hearth Studio session',
    sessionId: view.id,
    customerFileId: view.customerFileId,
    status: view.status,
    currentChapter: view.currentChapter,
    lastTouchedAt: view.lastTouchedAt,
    completedAt: view.completedAt,
    pausedAt: view.pausedAt,
    selections,
    flags: view.flags || {},
    aliases: unique([
      title,
      subtitle,
      selections.setupType,
      selections.goal,
      selections.stoneSeries,
      dimensionLabel(selections.dimensions),
      ...rules,
    ]),
    tags: unique(['hearth studio', 'hearth session', view.status, `chapter ${String(view.currentChapter).padStart(2, '0')}`]),
    details: [
      setupGoal ? `Setup + goal: ${setupGoal}` : '',
      `Last touched: ${lastTouched}`,
      ruleLine,
    ].filter(Boolean),
    detectedReason: 'Hearth Studio session context',
    customerSafeSummary: '',
  }
  return { ...reference, safety: referenceSafety(reference) }
}

export function buildHearthSessionReferences(sessions = [], { limit = 3, now = new Date() } = {}) {
  const all = sessions
    .map((session) => projectHearthStudioSessionForDisplay(session))
    .filter(Boolean)
    .filter((session) => session.status !== SESSION_STATUS.soft_deleted && !session.softDeletedAt)
    .sort((left, right) => safeTime(right.lastTouchedAt) - safeTime(left.lastTouchedAt))
    .map((session) => buildHearthSessionReference(session, { now }))
    .filter(Boolean)
  const visible = all.slice(0, limit)
  Object.defineProperty(visible, 'hiddenCount', { value: Math.max(0, all.length - visible.length), enumerable: false })
  Object.defineProperty(visible, 'allCount', { value: all.length, enumerable: false })
  return visible
}

export function hasCriticalSmartContextReferences(references = []) {
  return references.some((reference) => {
    if (reference.type !== 'hearthSession') return reference.safety?.tone === 'danger'
    const rules = reference.flags?.fieldRulesTriggered
    return (Array.isArray(rules) && rules.length > 0) ||
      (reference.status === SESSION_STATUS.paused && (reference.flags?.needsFieldMeasure || reference.flags?.hasComplexSetup))
  })
}

function categoryLabel(category) {
  return categoryLabelMap[category] || category || 'Reference'
}

function locationLabel(record = {}) {
  const zone = record.locationZone === 'first-floor'
    ? 'First Floor'
    : record.locationZone === 'cellar'
      ? 'Cellar'
      : record.locationZone === 'outside'
        ? 'Outside'
        : 'Unknown location'
  return record.locationDetail ? `${zone} - ${record.locationDetail}` : zone
}

export function buildVendorReference(vendor = {}) {
  const reference = {
    id: `vendor:${vendor.id}`,
    type: 'vendor-price-book',
    title: vendor.name || 'Unnamed vendor',
    subtitle: `${categoryLabel(vendor.category)} · ${safeDateLabel(vendor.priceListDate)}`,
    category: vendor.category || 'all',
    categoryLabel: categoryLabel(vendor.category),
    sourceLabel: 'Vendor / price-list binder',
    fileName: vendor.priceListFile || '',
    path: getPriceBookPath(vendor),
    vendor: vendor.name || '',
    priceListDate: vendor.priceListDate || '',
    priceListYear: vendor.priceListYear || '',
    internalNote: vendor.internalNote || '',
    aliases: unique([vendor.name, ...(vendor.aliases || []), vendor.priceListFile, vendor.priceListDate, categoryLabel(vendor.category)]),
    tags: unique([vendor.category, categoryLabel(vendor.category), ...(vendor.aliases || [])]),
    customerSafeSummary: '',
    details: [
      vendor.priceListFile ? `File: ${vendor.priceListFile}` : '',
      vendor.priceListDate ? `Price-list date: ${vendor.priceListDate}` : '',
      vendor.internalNote || '',
    ].filter(Boolean),
  }
  return { ...reference, safety: referenceSafety(reference) }
}

export function buildDisplayReference(record = {}) {
  const reference = {
    id: `display:${record.id}`,
    type: 'showroom-display',
    title: record.modelName || record.productCode || 'Unnamed display',
    subtitle: `${record.brand || 'Display'} · ${locationLabel(record)}`,
    category: record.applianceType || 'showroom-display',
    categoryLabel: 'Showroom Display',
    sourceLabel: 'Showroom display register',
    displayId: record.id || '',
    productCode: record.productCode || '',
    modelName: record.modelName || '',
    vendor: record.brand || '',
    location: locationLabel(record),
    displayStatus: record.displayStatus || 'unknown',
    workingStatus: record.workingStatus || 'unknown',
    internalNote: record.internalNotes || '',
    talkingPoints: String(record.talkingPoints || '').split('\n').map((line) => line.trim()).filter(Boolean),
    aliases: unique([
      record.productCode,
      record.modelName,
      record.brand,
      record.applianceType,
      record.description,
      locationLabel(record),
    ]),
    tags: unique([record.applianceType, record.displayStatus, record.workingStatus, record.locationZone, record.brand]),
    customerSafeSummary: record.displayStatus === 'on-display'
      ? [record.modelName || record.productCode, record.brand, locationLabel(record)].filter(Boolean).join(' · ')
      : '',
    details: [
      record.productCode ? `Product code: ${record.productCode}` : '',
      record.description || '',
      `Display status: ${record.displayStatus || 'unknown'}`,
      `Working status: ${record.workingStatus || 'unknown'}`,
      record.lastVerifiedAt ? `Last verified: ${record.lastVerifiedAt}` : '',
      record.talkingPoints ? `Talking points: ${record.talkingPoints}` : '',
      record.internalNotes ? `Internal notes: ${record.internalNotes}` : '',
    ].filter(Boolean),
  }
  return { ...reference, safety: referenceSafety(reference) }
}

export function buildWebReference(item = {}) {
  const normalized = normalizeManifest([item])[0] || {}
  const reference = {
    id: `web:${normalized.id}`,
    type: 'web-reference',
    title: normalized.title || 'Vendor web reference',
    subtitle: `${normalized.vendor || 'Vendor'} · ${normalized.docTypeLabel || 'Reference'}${normalized.models ? ` · ${normalized.models}` : ''}`,
    category: normalized.category || 'vendor-web-reference',
    categoryLabel: normalized.docTypeLabel || 'Current Web Reference',
    sourceLabel: 'Current vendor web reference',
    fileName: normalized.pdfFileName || '',
    path: normalized.localPath || '',
    pdfUrl: normalized.pdfUrl || '',
    sourcePage: normalized.sourcePage || '',
    vendor: normalized.vendor || '',
    models: normalized.models || '',
    docType: normalized.docType || '',
    priority: normalized.priority || '',
    customerSafe: normalized.customerSafe || '',
    internalNote: normalized.notes || '',
    aliases: unique([normalized.vendor, normalized.title, normalized.models, normalized.pdfFileName, normalized.docTypeLabel, ...(normalized.aliases || [])]),
    tags: unique([normalized.category, normalized.docType, normalized.docTypeLabel, normalized.priority, normalized.vendor]),
    customerSafeSummary: normalized.customerSafe === 'yes' ? [normalized.vendor, normalized.title, normalized.models].filter(Boolean).join(' · ') : '',
    details: [normalized.models ? `Models/topics: ${normalized.models}` : '', normalized.pdfFileName ? `File: ${normalized.pdfFileName}` : '', normalized.status ? `Source status: ${normalized.status}` : '', normalized.notes || ''].filter(Boolean),
  }
  return { ...reference, safety: referenceSafety(reference) }
}

export function listWebReferences(manifest = vendorWebReferenceManifest) {
  return normalizeManifest(manifest).map(buildWebReference)
}

export const guardrailReferences = [
  {
    id: 'guardrail:prefab-zc-model-tag',
    type: 'sales-guardrail',
    title: 'Prefab/ZC compatibility check',
    subtitle: 'Get model tag before recommending inserts, logs, doors, or parts',
    category: 'guardrail',
    categoryLabel: 'Compatibility Guardrail',
    sourceLabel: 'Sales workflow guardrail',
    aliases: ['prefab', 'zero clearance', 'zc', 'model tag', 'tag', 'compatibility', 'manual', 'label'],
    tags: ['prefab', 'zc', 'model-tag', 'compatibility'],
    details: [
      'Ask for the model tag/photo before discussing compatibility.',
      'Do not assume a gas log set, insert, door, blower, or replacement part will fit a prefab/ZC fireplace.',
      'If the model tag is missing, move the job to waiting-on-customer or home-measure verification.',
    ],
  },
  {
    id: 'guardrail:masonry-heat-path',
    type: 'sales-guardrail',
    title: 'Masonry fireplace heat path',
    subtitle: 'Use goals to choose gas insert, wood insert, or gas log conversation',
    category: 'guardrail',
    categoryLabel: 'Path Guardrail',
    sourceLabel: 'Sales workflow guardrail',
    aliases: ['masonry', 'more heat', 'less mess', 'gas logs', 'gas insert', 'wood insert', 'chimney'],
    tags: ['masonry', 'insert', 'gas-log', 'heat'],
    details: [
      'If heat is the main expectation, lead toward gas insert or wood insert discussion.',
      'If ambiance and less mess are the main expectation, gas logs may fit if heat expectation is modest.',
      'Confirm gas type, fireplace opening measurements, chimney condition, and whether the customer wants real heat or mainly appearance.',
    ],
  },
  {
    id: 'guardrail:doors-screen-appearance',
    type: 'sales-guardrail',
    title: 'Appearance-only fireplace refresh',
    subtitle: 'Doors, screens, surrounds, mantels, stone, hearth, and trim options',
    category: 'guardrail',
    categoryLabel: 'Path Guardrail',
    sourceLabel: 'Sales workflow guardrail',
    aliases: ['doors', 'screen', 'surround', 'mantel', 'stone', 'hearth', 'appearance', 'refresh'],
    tags: ['doors-glass', 'stone-mantel', 'appearance'],
    details: [
      'Clarify whether the customer wants appearance only or heat/function change.',
      'For doors/screens, collect opening dimensions and photos before narrowing options.',
      'For stone/mantel/hearth, confirm clearances, wall dimensions, and whether the fireplace appliance is changing.',
    ],
  },
  {
    id: 'guardrail:new-wall-modern',
    type: 'sales-guardrail',
    title: 'New wall / remodel path',
    subtitle: 'Direct vent gas or electric after confirming wall, vent, gas, and electrical constraints',
    category: 'guardrail',
    categoryLabel: 'Path Guardrail',
    sourceLabel: 'Sales workflow guardrail',
    aliases: ['new wall', 'remodel', 'modern', 'direct vent', 'electric', 'framing', 'vent route'],
    tags: ['gas-fireplace', 'electric', 'remodel'],
    details: [
      'Confirm wall depth, framing plan, vent route, gas availability, and electrical plan.',
      'Electric can be a fit when venting or gas constraints make direct vent impractical.',
      'Do not quote final install scope until the site conditions are verified.',
    ],
  },
]
  .map((reference) => ({ ...reference, safety: referenceSafety(reference), customerSafeSummary: '' }))

export function buildReferenceLibrary({ vendors = listVendors(), displayRecords = listDisplayRecords(), webReferences = listWebReferences(), includeGuardrails = true } = {}) {
  return [
    ...vendors.map(buildVendorReference),
    ...webReferences.map((reference) => reference.type === 'web-reference' ? reference : buildWebReference(reference)),
    ...displayRecords.map(buildDisplayReference),
    ...(includeGuardrails ? guardrailReferences : []),
  ]
}

function referenceSearchText(reference = {}) {
  return normalizeText([
    reference.title,
    reference.subtitle,
    reference.categoryLabel,
    reference.sourceLabel,
    reference.fileName,
    reference.path,
    reference.vendor,
    reference.productCode,
    reference.modelName,
    reference.internalNote,
    reference.searchText,
    ...(reference.aliases || []),
    ...(reference.tags || []),
    ...(reference.details || []),
    ...(reference.talkingPoints || []),
  ].join(' '))
}

function referenceCodes(reference = {}) {
  return unique([
    reference.productCode,
    reference.modelName,
    ...(reference.aliases || []),
  ]).map(normalizeCode).filter((value) => value.length >= 3)
}

function scoreReferenceForText(reference = {}, query = '') {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0
  const searchText = referenceSearchText(reference)
  const queryTokens = tokens(normalizedQuery)
  let score = 0

  if (searchText.includes(normalizedQuery)) score += 55
  if (normalizeText(reference.title).includes(normalizedQuery)) score += 45
  if ((reference.aliases || []).some((alias) => normalizeText(alias) === normalizedQuery)) score += 65

  const codeQuery = normalizeCode(query)
  if (codeQuery.length >= 3 && referenceCodes(reference).some((code) => code.includes(codeQuery) || codeQuery.includes(code))) score += 70

  for (const token of queryTokens) {
    if (searchText.includes(token)) score += 9
    if (normalizeText(reference.title).includes(token)) score += 7
    if ((reference.tags || []).some((tag) => normalizeText(tag).includes(token))) score += 6
  }

  return score
}

function buildContextText({ file = {}, fields = {}, lineItems = [] } = {}) {
  return [
    file.existingApplianceType,
    file.existingFuelType,
    file.existingNotes,
    file.existingVentingNotes,
    file.customerGoal,
    file.goalNotes,
    file.customerPainPoints,
    file.heatExpectation,
    file.likelyPath,
    file.taggedModel,
    file.taggedVendor,
    file.guidedPathNotes,
    file.guidedPathCustomerSummary,
    fields.PROJECT_TITLE,
    fields.PROJECT_SCOPE_SUMMARY,
    fields.PROJECT_NOTES,
    fields.INSTALLATION_SCOPE,
    fields.MANUFACTURER,
    fields.MODEL,
    ...lineItems.map((item) => `${item.sku || item.code || item.productCode || ''} ${item.description || item.name || ''}`),
  ].filter(Boolean).join(' ')
}

export function inferReferenceNeeds({ file = {}, fields = {}, lineItems = [] } = {}) {
  const text = normalizeText(buildContextText({ file, fields, lineItems }))
  const needs = []

  if (hasAny(text, ['masonry']) || hasAny(file.existingApplianceType, ['fireplace'])) {
    needs.push({ id: 'masonry', label: 'Masonry fireplace references', query: 'masonry gas logs gas insert wood insert doors' })
  }
  if (hasAny(text, ['less mess', 'ambiance', 'gas log', 'gas logs', 'log set'])) {
    needs.push({ id: 'gas-log', label: 'Gas log set references', query: 'hargrove realfyre gas logs vented vent free' })
  }
  if (hasAny(text, ['more heat', 'heat', 'heater', 'insert'])) {
    needs.push({ id: 'insert', label: 'Insert / heat-path references', query: 'gas insert wood insert heat fireplace' })
  }
  if (hasAny(text, ['prefab', 'zero clearance', 'zc']) || (file.existingApplianceType === 'fireplace' && !file.modelTagReceived && hasAny(text, ['model tag', 'metal fireplace']))) {
    needs.push({ id: 'prefab-zc', label: 'Prefab/ZC compatibility guardrail', query: 'prefab zero clearance model tag compatibility manual' })
  }
  if (hasAny(text, ['door', 'doors', 'screen', 'appearance', 'refresh'])) {
    needs.push({ id: 'doors', label: 'Door / screen / appearance references', query: 'stoll doors glass screen appearance' })
  }
  if (hasAny(text, ['mantel', 'stone', 'hearth', 'surround', 'limestone'])) {
    needs.push({ id: 'stone-mantel', label: 'Stone / mantel references', query: 'mantel stone hearth surround magrahearth ironhaus uptown' })
  }
  if (hasAny(text, ['modern', 'new wall', 'remodel', 'direct vent', 'electric', 'linear'])) {
    needs.push({ id: 'modern-remodel', label: 'Modern remodel references', query: 'direct vent gas electric davinci dimplex modern remodel' })
  }
  if (hasAny(text, ['grill', 'outdoor', 'fire pit', 'burner'])) {
    needs.push({ id: 'outdoor', label: 'Outdoor / grill references', query: 'grill outdoor fire pit burner warming trends' })
  }

  return needs.filter((need, index, arr) => arr.findIndex((item) => item.id === need.id) === index)
}

export function searchReferences(library = [], query = '', { limit = 12, category = 'all' } = {}) {
  const normalizedQuery = normalizeText(query)
  const candidates = library.filter((reference) => {
    if (category === 'all') return true
    if (category === 'detected') return true
    if (category === 'price-books') return reference.type === 'vendor-price-book'
    if (category === 'web') return reference.type === 'web-reference' || reference.type === 'binder-page'
    if (category === 'displays') return reference.type === 'showroom-display'
    if (category === 'guardrails') return reference.type === 'sales-guardrail'
    if (category === 'hearth-sessions') return reference.type === 'hearthSession'
    return reference.category === category
  })

  if (!normalizedQuery) return candidates.slice(0, limit)

  return candidates
    .map((reference) => ({ reference, score: scoreReferenceForText(reference, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.reference.title.localeCompare(right.reference.title))
    .slice(0, limit)
    .map((entry) => ({ ...entry.reference, searchScore: entry.score }))
}

export function getReferenceAutocompleteOptions(library = [], query = '', { limit = 8 } = {}) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  const options = []
  for (const reference of library) {
    for (const value of unique([reference.title, ...(reference.aliases || []), ...(reference.tags || []), reference.categoryLabel])) {
      const normalized = normalizeText(value)
      if (!normalized) continue
      if (normalized.includes(normalizedQuery) || normalizedQuery.split(' ').every((token) => normalized.includes(token))) {
        options.push({ value, referenceId: reference.id, label: value, title: reference.title })
      }
    }
  }

  return options
    .filter((option, index, arr) => arr.findIndex((item) => normalizeText(item.value) === normalizeText(option.value)) === index)
    .slice(0, limit)
}

export function deriveReferenceMatches({ library = [], file = {}, fields = {}, lineItems = [], hearthSessions = [], hearthSessionLimit = 3, limit = 8 } = {}) {
  const needs = inferReferenceNeeds({ file, fields, lineItems })
  const contextText = buildContextText({ file, fields, lineItems })
  const directMatches = searchReferences(library, contextText, { limit: Math.max(limit * 2, 12) })
  const hearthMatches = buildHearthSessionReferences(hearthSessions, { limit: hearthSessionLimit })

  const needMatches = needs.flatMap((need) => (
    searchReferences(library, need.query, { limit: 4 }).map((reference) => ({
      ...reference,
      detectedReason: need.label,
    }))
  ))

  const combined = [...hearthMatches, ...needMatches, ...directMatches.map((reference) => ({ ...reference, detectedReason: 'Matched from active customer file / quote text' }))]
  const seen = new Set()
  const visible = combined
    .filter((reference) => {
      if (seen.has(reference.id)) return false
      seen.add(reference.id)
      return true
    })
    .sort((left, right) => {
      const priority = { hearthSession: 4, 'sales-guardrail': 3, 'showroom-display': 2, 'vendor-price-book': 1 }
      return (priority[right.type] || 0) - (priority[left.type] || 0) || (right.searchScore || 0) - (left.searchScore || 0)
    })
    .slice(0, limit)
  Object.defineProperty(visible, 'hiddenCount', { value: hearthMatches.hiddenCount || 0, enumerable: false })
  return visible
}

export function buildPinnedReferenceItem(reference = {}, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  return {
    id: `ref-${reference.id.replace(/[^a-z0-9]+/gi, '-')}-${timestamp.replace(/[:.]/g, '-')}`,
    referenceId: reference.id,
    referenceType: reference.type,
    label: reference.title || 'Reference',
    sourceLabel: reference.sourceLabel || '',
    vendor: reference.vendor || '',
    fileName: reference.fileName || '',
    path: reference.path || '',
    safetyLabel: reference.safety?.label || '',
    pinnedAt: timestamp,
  }
}

export function buildDisplayShownItem(reference = {}, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  return {
    id: `shown-${reference.displayId || reference.id}-${timestamp.replace(/[:.]/g, '-')}`,
    displayId: reference.displayId || '',
    label: reference.title || reference.modelName || reference.productCode || 'Showroom display',
    shownAt: timestamp,
    location: reference.location || '',
    customerSafeSummary: reference.customerSafeSummary || '',
  }
}

export function buildBrochureGivenItem(reference = {}, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  return {
    id: `brochure-${reference.id.replace(/[^a-z0-9]+/gi, '-')}-${timestamp.replace(/[:.]/g, '-')}`,
    label: reference.title || 'Reference brochure',
    vendor: reference.vendor || '',
    givenAt: timestamp,
    sourceLabel: reference.sourceLabel || '',
  }
}

export function describeReferenceForDrawer(reference = {}) {
  return {
    title: reference.title,
    sub: reference.subtitle || reference.sourceLabel,
    category: reference.categoryLabel,
    vendor: reference.vendor || '',
    badge: reference.safety?.label || '',
    danger: reference.safety?.tone === 'danger',
    reference,
  }
}
