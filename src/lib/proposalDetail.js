export const PROPOSAL_CATEGORIES = [
  { key: 'fireplace-unit', label: 'Fireplace Unit' },
  { key: 'fireplace-accessories', label: 'Fireplace Accessories' },
  { key: 'heat-management', label: 'Heat Management / Komfort Zone' },
  { key: 'venting', label: 'Venting / Chimney / Termination' },
  { key: 'controls-electrical', label: 'Controls / Electrical / TV Kit' },
  { key: 'fireplace-labor', label: 'Fireplace / Vent Installation Labor' },
  { key: 'stone-materials', label: 'Stone / Veneer / Masonry Materials' },
  { key: 'hearth-mantel', label: 'Hearth / Mantel / Limestone / Finish Materials' },
  { key: 'masonry-labor', label: 'Masonry / Stone Installation Labor' },
  { key: 'doors-specialty', label: 'Doors / Mantels / Specialty Orders' },
  { key: 'permits', label: 'Permits / Compliance' },
  { key: 'delivery-misc', label: 'Delivery / Freight / Miscellaneous' },
  { key: 'sales-tax', label: 'Sales Tax' },
  { key: 'other', label: 'Additional Project Items' },
]

// Priority-ordered — first match wins
const CATEGORY_RULES = [
  {
    key: 'sales-tax',
    test: ({ description }) => /\bsales[\s-]?tax\b|\bHST\b|\bGST\b/i.test(description),
  },
  {
    key: 'permits',
    test: ({ description }) => /\bpermit\b|\binspection[\s-]fee\b|\bcompliance\b/i.test(description),
  },
  {
    key: 'delivery-misc',
    test: ({ description }) => /\bdelivery\b|\bfreight\b|\bshipping\b|\bhandling\b|\bmisc(ellaneous)?\b/i.test(description),
  },
  {
    key: 'masonry-labor',
    test: ({ description }) =>
      /stone[\s-]?(install|labor|set|lay)|masonry[\s-]?(install|labor)|veneer[\s-]?(install|labor|set)|field[\s-]?labor/i.test(description),
  },
  {
    key: 'fireplace-labor',
    test: ({ description }) =>
      /(fireplace|vent|insert|chimney)[\s-]?(install|labor)|(install|labor)[\s-]?(fireplace|vent|insert)|labor.*fireplace|fireplace.*labor|install[\s-]labor/i.test(description),
  },
  {
    key: 'heat-management',
    test: ({ description, code = '' }) =>
      /komfort[\s-]?zone|\bplenum\b|flex[\s-]?line|heat[\s-]?(management|kit|deflector|shield|flex)/i.test(description) ||
      /^KZ/i.test(code),
  },
  {
    key: 'controls-electrical',
    test: ({ description }) =>
      /intellifire|proflame|\bthermostat\b|\bwall[\s-]?switch\b|remote[\s-]?(control|kit)|tv[\s-]?(kit|lift)|smart[\s-]?home|control[\s-]?kit|\bcontroller\b|\belectrical[\s-]?kit\b/i.test(description),
  },
  {
    key: 'venting',
    test: ({ description }) =>
      /(vent|chimney|flue|liner|chase)[\s-]?(pipe|cap|kit|collar|termination|adapter|elbow|tee|coupler|offset|screen|cover)|pipe[\s-]?\d|termination[\s-]?cap|liner[\s-]?kit|direct[\s-]?vent[\s-]?(kit|pipe|cap|termination)|vent[\s-]?pipe|cap[\s-]?chimney/i.test(description),
  },
  {
    key: 'fireplace-accessories',
    test: ({ description }) =>
      /\bblower[\s-]?kit\b|\bgrate\b|glass[\s-]?(media|beads|rocks|embers?)|embers?|\blog[\s-]?(set|lighter|grate)|hood[\s-]?kit|faceplate|frame[\s-]?kit|refractory|side[\s-]?panel|\bpilot[\s-]?(assembly|kit)?\b|\bignition\b|glass[\s-]?cleaner|\bash[\s-]?(dump|pan)|surround[\s-]?kit|barrier[\s-]?screen|ember[\s-]?kit/i.test(description),
  },
  {
    key: 'hearth-mantel',
    test: ({ description }) =>
      /\bmantel\b|\bhearth[\s-]?(pad|slab|board|material)?\b|\blimestone\b|\bmarble[\s-]?(surround|slab)?\b|\bslate\b|\bgranite\b|\bnoncombustible\b|\bhearth\b/i.test(description),
  },
  {
    key: 'stone-materials',
    test: ({ description, unit = '' }) =>
      /\bstone\b|\bveneer\b|fieldstone|cultured[\s-]?stone|thin[\s-]?veneer|\bmortar\b|\bbags?\b|scratch[\s-]?coat|\blath\b|waterproof|sealer|\bgrout\b|ledge[\s-]?stone|ledgestone/i.test(description) ||
      /^(SF|LF|BAG|SQ)$/i.test(String(unit).trim()),
  },
  {
    key: 'fireplace-unit',
    test: ({ description, code = '' }) =>
      /\bfireplace\b|\binsert\b|gas[\s-]?logs?|direct[\s-]?vent|heatilator|napoleon|lennox|regency|heat[\s-]?[&n][\s-]?glo|valor|superior|monessen|dimplex|majestic|quadra[\s-]?fire|jotul|kozy[\s-]?world|empire|travis/i.test(description) ||
      /^(GFL|GFI|BFD|FPX|GDST|BCDV|BCD|DVR|DVL|DVT|TFL|TDVT|TVFL|GX|NX|VLR|BHD|GD)/i.test(code),
  },
  {
    key: 'doors-specialty',
    test: ({ description }) =>
      /\bdoors?\b|\bbi[\s-]?fold\b|\bglass[\s-]?door\b|\bspecialty[\s-]?order\b|\bmantel[\s-]?(shelf|surround|package|kit)\b/i.test(description),
  },
]

function parseCurrencyAmount(value) {
  if (!value && value !== 0) return 0
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function classifyItem(item) {
  const rule = CATEGORY_RULES.find(({ test }) => test(item))
  return rule?.key ?? 'other'
}

export function groupLineItemsByCategory(lineItems = []) {
  const buckets = new Map(
    PROPOSAL_CATEGORIES.map(({ key, label }) => [key, { key, label, items: [], categoryTotal: 0 }]),
  )

  for (const item of lineItems) {
    const key = classifyItem(item)
    const bucket = buckets.get(key)
    bucket.items.push(item)
    bucket.categoryTotal += parseCurrencyAmount(item.total)
  }

  return PROPOSAL_CATEGORIES
    .map(({ key }) => buckets.get(key))
    .filter((bucket) => bucket.items.length > 0)
    .map((bucket) => ({ ...bucket, categoryTotalFormatted: formatCurrency(bucket.categoryTotal) }))
}

export function hasUnclassifiedLineItems(lineItems = []) {
  return lineItems.some((item) => classifyItem(item) === 'other')
}

const MAJOR_CATEGORY_KEYS = new Set([
  'fireplace-unit',
  'venting',
  'stone-materials',
  'fireplace-labor',
  'masonry-labor',
  'heat-management',
  'hearth-mantel',
])

export function detectDetailedBreakdownRecommended(lineItems = []) {
  const groups = groupLineItemsByCategory(lineItems)
  const majorCount = groups.filter((g) => MAJOR_CATEGORY_KEYS.has(g.key)).length
  return majorCount >= 3
}

export function detectKomfortZone(lineItems = [], fields = {}) {
  if (lineItems.some((item) =>
    /komfort[\s-]?zone|\bplenum\b|flex[\s-]?line|heat[\s-]?(management|kit|deflector)/i.test(item.description || ''),
  )) return true
  const searchText = [
    fields.PROJECT_NOTES,
    fields.INSTALLATION_SCOPE,
    fields.PROJECT_SCOPE_SUMMARY,
  ].filter(Boolean).join(' ')
  return /komfort.?zone|heat.?management|plenum|flex.?line/i.test(searchText)
}

export function detectEstimateBasisItems(lineItems = [], fields = {}) {
  const items = []

  for (const line of lineItems) {
    const desc = String(line.description || '').toLowerCase()
    const unit = String(line.unit || '').trim().toUpperCase()
    const qty = String(line.qty || '')
    const safeQty = /^\d+(\.\d+)?$/.test(qty.trim())

    if ((unit === 'SF' || /square[\s-]?f(oo|ee)t|sq\.?\s*ft|\bsf\b/.test(desc)) && safeQty) {
      if (/stone|veneer|fieldstone|ledge|masonry/.test(desc) || unit === 'SF') {
        items.push({ type: 'stone-sf', label: 'Stone / Veneer Square Footage', qty, unit, description: line.description })
        continue
      }
    }
    if ((unit === 'LF' || /lineal[\s-]?f(oo|ee)t|lin\.?\s*ft|\blf\b/.test(desc)) && safeQty) {
      items.push({ type: 'corner-lf', label: 'Corner / Return Lineal Footage', qty, unit, description: line.description })
      continue
    }
    if ((/\bmortar\b/.test(desc) || (unit === 'BAG' && /type\s*[sms]|mortar/.test(desc))) && safeQty) {
      items.push({ type: 'mortar', label: 'Mortar / Bags', qty, unit, description: line.description })
      continue
    }
    if (/mantel.*allow|allow.*mantel|hearth.*allow|allow.*hearth/i.test(desc)) {
      items.push({ type: 'mantel-allowance', label: 'Mantel / Hearth Allowance', qty, unit, description: line.description })
      continue
    }
    if (/\ballowance\b|\ballow\b.*(?:stone|material|labor)|(?:stone|material|labor).*\ballow\b/i.test(desc)) {
      items.push({ type: 'allowance', label: 'Material / Labor Allowance (Subject to Final Measure)', qty, unit, description: line.description })
    }
  }

  const noteText = [fields.PROJECT_NOTES, fields.INSTALLATION_SCOPE].filter(Boolean).join(' ')
  if (/final[\s-]?meas|subject\s*to\s*change/i.test(noteText) && !items.some((i) => i.type === 'allowance')) {
    items.push({
      type: 'final-measure-note',
      label: 'Final Measure Required',
      qty: '',
      unit: '',
      description: 'Final dimensions to be confirmed before material order is placed.',
    })
  }

  return items
}

export const ESTIMATE_BASIS_FALLBACK_NOTE =
  'The stone and finish material estimate is based on the quantities shown in the attached line-item quote. Final material needs may change after site measure, final layout, and selected stone design are confirmed.'

export function getEstimateBasisSummary(lineItems = [], fields = {}) {
  const items = detectEstimateBasisItems(lineItems, fields)
  return {
    items,
    fallbackUsed: items.length === 0,
    fallbackNote: items.length === 0 ? ESTIMATE_BASIS_FALLBACK_NOTE : '',
  }
}

export const KOMFORT_ZONE_EXPLAINER =
  'Komfort Zone is not the sealed direct-vent exhaust system. The direct-vent system is handled separately through the fireplace venting components. Komfort Zone is a heat-management system that uses plenum and flex-line components to help move heat from the fireplace chase. It may be recommended when a project includes a mantel, TV area, finish materials, or other design elements where heat management matters. Final recommendations should be confirmed against the fireplace model, layout, framing, mantel plan, and installation conditions.'

export const QUOTE_ATTACHMENT_NOTE =
  'A full line-item quote is attached for official pricing detail. This proposal summarizes the project in a customer-friendly format and explains the major scope areas and assumptions.'
