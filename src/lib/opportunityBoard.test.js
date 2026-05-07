import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HEARTH_LANES,
  getOpportunityLane,
  getOpportunityMomentum,
  getOpportunitySeverity,
  getOpportunitySourceLabel,
  getOpportunityWarnings,
  groupOpportunitiesByLane,
  sortOpportunitiesForBoard,
} from './opportunityBoard.js'

test('HEARTH_LANES has the five v1 lanes in order', () => {
  assert.deepEqual(HEARTH_LANES.map((l) => l.id), ['discover', 'quote', 'active', 'won', 'cold'])
})

test('getOpportunityLane maps each known status to a lane', () => {
  assert.equal(getOpportunityLane({ status: 'new-intake' }), 'discover')
  assert.equal(getOpportunityLane({ status: 'needs-review' }), 'quote')
  assert.equal(getOpportunityLane({ status: 'ready-for-proposal' }), 'quote')
  assert.equal(getOpportunityLane({ status: 'proposal-sent' }), 'active')
  assert.equal(getOpportunityLane({ status: 'waiting-on-customer' }), 'active')
  assert.equal(getOpportunityLane({ status: 'follow-up-needed' }), 'active')
  assert.equal(getOpportunityLane({ status: 'closed-won' }), 'won')
  assert.equal(getOpportunityLane({ status: 'closed-lost' }), 'cold')
  assert.equal(getOpportunityLane({ status: 'reference-only' }), 'cold')
  assert.equal(getOpportunityLane({ status: 'archived' }), 'cold')
})

test('getOpportunityLane falls back to quote for unknown / missing status', () => {
  assert.equal(getOpportunityLane({}), 'quote')
  assert.equal(getOpportunityLane({ status: 'something-weird' }), 'quote')
})

test('getOpportunityMomentum prefers won/cold for closed states', () => {
  assert.equal(getOpportunityMomentum({ status: 'closed-won', temperature: 'hot' }), 'won')
  assert.equal(getOpportunityMomentum({ status: 'closed-lost', temperature: 'hot' }), 'cold')
  assert.equal(getOpportunityMomentum({ status: 'archived' }), 'cold')
  assert.equal(getOpportunityMomentum({ status: 'reference-only' }), 'cold')
})

test('getOpportunityMomentum reads temperature when present', () => {
  assert.equal(getOpportunityMomentum({ temperature: 'hot' }), 'hot')
  assert.equal(getOpportunityMomentum({ temperature: 'warm' }), 'warm')
  assert.equal(getOpportunityMomentum({ temperature: 'cool' }), 'cooling')
})

test('getOpportunityMomentum derives from status when temperature is unknown', () => {
  assert.equal(getOpportunityMomentum({ status: 'ready-for-proposal', temperature: 'unknown' }), 'hot')
  assert.equal(getOpportunityMomentum({ status: 'follow-up-needed', temperature: 'unknown' }), 'warm')
  assert.equal(getOpportunityMomentum({ status: 'waiting-on-customer' }), 'warm')
  assert.equal(getOpportunityMomentum({}), 'cold')
})

test('getOpportunityWarnings filters out sensitive-fields and quote-refresh noise', () => {
  const warnings = [
    'Missing customer phone',
    'Sensitive BisTrack fields excluded from customer export.',
    'Customer-facing proposal may need quote refresh before sending.',
    'Product match needs review',
  ]
  const filtered = getOpportunityWarnings({ warnings })
  assert.deepEqual(filtered, ['Missing customer phone', 'Product match needs review'])
})

test('getOpportunityWarnings tolerates missing or non-array values', () => {
  assert.deepEqual(getOpportunityWarnings({}), [])
  assert.deepEqual(getOpportunityWarnings({ warnings: null }), [])
  assert.deepEqual(getOpportunityWarnings({ warnings: 'oops' }), [])
})

test('getOpportunitySeverity flags block / warn / ok / none', () => {
  assert.equal(getOpportunitySeverity({ status: 'needs-review' }), 'block')
  assert.equal(getOpportunitySeverity({ proposalReadiness: 'blocked' }), 'block')
  assert.equal(
    getOpportunitySeverity({ status: 'follow-up-needed', warnings: ['Missing phone'] }),
    'warn',
  )
  assert.equal(getOpportunitySeverity({ status: 'ready-for-proposal' }), 'ok')
  assert.equal(getOpportunitySeverity({ proposalReadiness: 'ready' }), 'ok')
  assert.equal(getOpportunitySeverity({ status: 'waiting-on-customer' }), 'none')
})

test('getOpportunitySourceLabel covers known source types', () => {
  assert.equal(getOpportunitySourceLabel({ sourceType: 'quote-polish' }), 'Active BisTrack Quote')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'pdf' }), 'Uploaded Old Quote')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'scan' }), 'Scanned Intake')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'ocr-packet' }), 'OCR Packet')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'pipeline-csv' }), 'Pipeline CSV')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'bulk-pdf' }), 'Bulk Upload')
})

test('getOpportunitySourceLabel falls back to label / Local Entry', () => {
  assert.equal(getOpportunitySourceLabel({}), 'Local Entry')
  assert.equal(
    getOpportunitySourceLabel({ sourceLabel: 'Workbench draft' }),
    'Workbench draft',
  )
})

test('sortOpportunitiesForBoard orders by lane, then momentum, then recency', () => {
  const list = [
    { id: 'a', status: 'closed-won', updatedAt: '2026-04-01' },
    { id: 'b', status: 'ready-for-proposal', temperature: 'hot', updatedAt: '2026-03-01' },
    { id: 'c', status: 'follow-up-needed', temperature: 'warm', updatedAt: '2026-04-10' },
    { id: 'd', status: 'new-intake', updatedAt: '2026-04-12' },
    { id: 'e', status: 'reference-only', updatedAt: '2026-04-20' },
  ]
  const sorted = sortOpportunitiesForBoard(list)
  assert.deepEqual(sorted.map((o) => o.id), ['d', 'b', 'c', 'a', 'e'])
})

test('sortOpportunitiesForBoard tolerates non-array input', () => {
  assert.deepEqual(sortOpportunitiesForBoard(), [])
  assert.deepEqual(sortOpportunitiesForBoard(null), [])
})

test('groupOpportunitiesByLane returns one bucket per lane in lane order', () => {
  const list = [
    { id: 'q1', status: 'needs-review' },
    { id: 'a1', status: 'follow-up-needed' },
    { id: 'd1', status: 'new-intake' },
  ]
  const groups = groupOpportunitiesByLane(list)
  assert.deepEqual(groups.map((g) => g.id), ['discover', 'quote', 'active', 'won', 'cold'])
  assert.equal(groups.find((g) => g.id === 'discover').opportunities[0].id, 'd1')
  assert.equal(groups.find((g) => g.id === 'quote').opportunities[0].id, 'q1')
  assert.equal(groups.find((g) => g.id === 'active').opportunities[0].id, 'a1')
  assert.equal(groups.find((g) => g.id === 'won').opportunities.length, 0)
})

test('groupOpportunitiesByLane handles empty input cleanly', () => {
  const groups = groupOpportunitiesByLane([])
  assert.equal(groups.length, HEARTH_LANES.length)
  assert.ok(groups.every((g) => Array.isArray(g.opportunities) && g.opportunities.length === 0))
})
