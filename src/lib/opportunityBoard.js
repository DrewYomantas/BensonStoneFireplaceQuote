// Pure helpers for the Hearth Board v1.
//
// All functions tolerate missing fields and return deterministic primitives.
// No localStorage, no DOM, no AI — these run in tests under node:test.

export const HEARTH_LANES = [
  { id: 'discover', label: 'Discover',         tone: 'discover' },
  { id: 'quote',    label: 'Quote',            tone: 'quote' },
  { id: 'active',   label: 'Active',           tone: 'active' },
  { id: 'won',      label: 'Won',              tone: 'won' },
  { id: 'cold',     label: 'Cold / Reference', tone: 'cold' },
]

const STATUS_TO_LANE = {
  'new-intake':           'discover',
  'needs-review':         'quote',
  'ready-for-proposal':   'quote',
  'proposal-sent':        'active',
  'waiting-on-customer':  'active',
  'follow-up-needed':     'active',
  'closed-won':           'won',
  'closed-lost':          'cold',
  'reference-only':       'cold',
  'archived':             'cold',
}

export function getOpportunityLane(opportunity = {}) {
  const status = String(opportunity.status || '').toLowerCase()
  return STATUS_TO_LANE[status] || 'quote'
}

export function getOpportunityMomentum(opportunity = {}) {
  const status = String(opportunity.status || '').toLowerCase()
  if (status === 'closed-won') return 'won'
  if (status === 'closed-lost' || status === 'archived' || status === 'reference-only') return 'cold'

  const temp = String(opportunity.temperature || '').toLowerCase()
  if (temp === 'hot') return 'hot'
  if (temp === 'warm') return 'warm'
  if (temp === 'cool') return 'cooling'
  if (status === 'ready-for-proposal') return 'hot'
  if (status === 'follow-up-needed' || status === 'waiting-on-customer' || status === 'proposal-sent') return 'warm'
  return 'cold'
}

export function getOpportunityWarnings(opportunity = {}) {
  const raw = Array.isArray(opportunity.warnings) ? opportunity.warnings : []
  return raw.filter((w) => w && !/Sensitive BisTrack fields|quote refresh/i.test(w))
}

export function getOpportunitySeverity(opportunity = {}) {
  const status = String(opportunity.status || '').toLowerCase()
  const readiness = String(opportunity.proposalReadiness || '').toLowerCase()
  const warnings = getOpportunityWarnings(opportunity)

  if (readiness === 'blocked' || status === 'needs-review') return 'block'
  if (warnings.length > 0) return 'warn'
  if (status === 'ready-for-proposal' || readiness === 'ready') return 'ok'
  return 'none'
}

const SOURCE_TYPE_LABELS = {
  'quote-polish':         'Active BisTrack Quote',
  'manual':               'Manual Entry',
  'old-quote-recovery':   'Manual Recovery',
  'pdf':                  'Uploaded Old Quote',
  'scan':                 'Scanned Intake',
  'image':                'Scanned Intake',
  'ocr-packet':           'OCR Packet',
  'csv':                  'CSV Import',
  'pipeline-csv':         'Pipeline CSV',
}

export function getOpportunitySourceLabel(opportunity = {}) {
  const sourceType = String(opportunity.sourceType || '').toLowerCase()
  if (SOURCE_TYPE_LABELS[sourceType]) return SOURCE_TYPE_LABELS[sourceType]
  if (sourceType.startsWith('bulk-')) return 'Bulk Upload'
  if (sourceType) return opportunity.sourceLabel || opportunity.sourceType
  return opportunity.sourceLabel || 'Local Entry'
}

const LANE_ORDER = HEARTH_LANES.reduce((acc, lane, i) => { acc[lane.id] = i; return acc }, {})

const MOMENTUM_ORDER = { hot: 0, warm: 1, cooling: 2, cold: 3, won: 4 }

function timestampMs(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

export function sortOpportunitiesForBoard(opportunities = []) {
  const list = Array.isArray(opportunities) ? opportunities.slice() : []
  list.sort((a, b) => {
    const laneDiff = (LANE_ORDER[getOpportunityLane(a)] ?? 99) - (LANE_ORDER[getOpportunityLane(b)] ?? 99)
    if (laneDiff !== 0) return laneDiff
    const momDiff = (MOMENTUM_ORDER[getOpportunityMomentum(a)] ?? 9) - (MOMENTUM_ORDER[getOpportunityMomentum(b)] ?? 9)
    if (momDiff !== 0) return momDiff
    return timestampMs(b.updatedAt) - timestampMs(a.updatedAt)
  })
  return list
}

export function groupOpportunitiesByLane(opportunities = []) {
  const sorted = sortOpportunitiesForBoard(opportunities)
  const buckets = Object.fromEntries(HEARTH_LANES.map((lane) => [lane.id, []]))
  for (const opp of sorted) {
    const laneId = getOpportunityLane(opp)
    if (!buckets[laneId]) buckets[laneId] = []
    buckets[laneId].push(opp)
  }
  return HEARTH_LANES.map((lane) => ({ ...lane, opportunities: buckets[lane.id] || [] }))
}
