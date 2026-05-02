import vendorData from '../data/vendorPriceBooks.json' with { type: 'json' }

const NOTES_KEY = 'benson-stone-vendor-notes-v1'

export const PRICE_BOOK_FOLDER =
  'Fireplace Department/Fireplace Department/01 - Price Lists/CURRENT (2024-2026)/FP Central Price List'

export const categoryOptions = [
  { value: 'all', label: 'All' },
  { value: 'gas-fireplace', label: 'Gas Fireplace' },
  { value: 'gas-log', label: 'Gas Log Sets' },
  { value: 'wood', label: 'Wood & Pellet' },
  { value: 'electric', label: 'Electric' },
  { value: 'grill-outdoor', label: 'Grill & Outdoor' },
  { value: 'doors-glass', label: 'Doors & Glass' },
  { value: 'stone-mantel', label: 'Stone & Mantel' },
  { value: 'accessories', label: 'Accessories' },
]

export const PRICING_HIERARCHY = [
  'Reviewed BisTrack quote lines for the active customer — always the final word.',
  'FP CURRENT PRICE LIST / FP Central Price List — current Benson-offered pricing authority.',
  '2025+ vendor price books — supporting reference only.',
  '2024 and older files — history/archive only unless Drew or Liam approve.',
]

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function listVendors() {
  return vendorData
}

export function filterVendors(vendors = [], category = 'all', search = '') {
  const normalized = normalizeText(search)
  return vendors.filter((vendor) => {
    if (category !== 'all' && vendor.category !== category) return false
    if (normalized) {
      const searchText = normalizeText(
        [vendor.name, vendor.priceListFile, vendor.priceListDate, vendor.internalNote].join(' '),
      )
      if (!searchText.includes(normalized)) return false
    }
    return true
  })
}

export function getVendorCategoryCounts(vendors = [], search = '') {
  return Object.fromEntries(
    categoryOptions.map(({ value }) => [value, filterVendors(vendors, value, search).length]),
  )
}

export function loadVendorNotes(storage = globalThis.localStorage) {
  if (!storage) return {}
  try {
    return JSON.parse(storage.getItem(NOTES_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveVendorNote(vendorId, note, storage = globalThis.localStorage) {
  if (!storage) return
  const notes = loadVendorNotes(storage)
  notes[vendorId] = String(note || '')
  storage.setItem(NOTES_KEY, JSON.stringify(notes))
}

export function mergeVendorNotes(vendors = [], notes = {}) {
  return vendors.map((vendor) => ({ ...vendor, userNote: notes[vendor.id] || '' }))
}

export function getPriceBookPath(vendor) {
  return `${PRICE_BOOK_FOLDER}/${vendor.priceListFile}`
}

export function matchVendorToQuote(vendors = [], { fields = {}, lineItems = [] } = {}) {
  const quoteText = normalizeText(
    [
      fields.PROJECT_TITLE,
      fields.PROJECT_SCOPE_SUMMARY,
      fields.PROJECT_NOTES,
      fields.INSTALLATION_SCOPE,
      ...lineItems.map(
        (item) =>
          `${item.sku || item.code || item.productCode || ''} ${item.description || item.name || ''}`,
      ),
    ].join(' '),
  )

  if (!quoteText.trim()) return []

  const seen = new Set()
  const matched = []

  for (const vendor of vendors) {
    const familyKey = vendor.aliases?.[0] || vendor.id
    if (seen.has(familyKey)) continue
    for (const alias of vendor.aliases || []) {
      const normalized = normalizeText(alias)
      if (normalized && quoteText.includes(normalized)) {
        seen.add(familyKey)
        matched.push(vendor)
        break
      }
    }
  }

  return matched
}
