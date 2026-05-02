import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KOMFORT_ZONE_EXPLAINER,
  ESTIMATE_BASIS_FALLBACK_NOTE,
  QUOTE_ATTACHMENT_NOTE,
  detectDetailedBreakdownRecommended,
  detectEstimateBasisItems,
  detectKomfortZone,
  getEstimateBasisSummary,
  groupLineItemsByCategory,
  hasUnclassifiedLineItems,
} from './proposalDetail.js'

function item(description, overrides = {}) {
  return { lineNumber: 1, code: '', description, qty: '1', unit: 'EA', unitPrice: '$100.00', total: '$100.00', ...overrides }
}

// --- groupLineItemsByCategory ---

test('fireplace description routes to fireplace-unit', () => {
  const groups = groupLineItemsByCategory([item('NAPOLEON GX70 DIRECT VENT GAS FIREPLACE')])
  assert.ok(groups.some((g) => g.key === 'fireplace-unit'))
})

test('stone with SF unit routes to stone-materials', () => {
  const groups = groupLineItemsByCategory([item('COUNTRY LEDGESTONE FLAT', { unit: 'SF' })])
  assert.ok(groups.some((g) => g.key === 'stone-materials'))
})

test('corner stone with LF unit routes to stone-materials', () => {
  const groups = groupLineItemsByCategory([item('COUNTRY LEDGESTONE CORNER RTN', { unit: 'LF' })])
  assert.ok(groups.some((g) => g.key === 'stone-materials'))
})

test('mortar bags route to stone-materials', () => {
  const groups = groupLineItemsByCategory([item('TYPE S MORTAR 80LB', { unit: 'BAG' })])
  assert.ok(groups.some((g) => g.key === 'stone-materials'))
})

test('stone labor routes to masonry-labor not stone-materials', () => {
  const groups = groupLineItemsByCategory([item('STONE INSTALLATION LABOR')])
  assert.ok(groups.some((g) => g.key === 'masonry-labor'))
  assert.ok(!groups.some((g) => g.key === 'stone-materials'))
})

test('fireplace installation labor routes to fireplace-labor not fireplace-unit', () => {
  const groups = groupLineItemsByCategory([item('FIREPLACE INSTALLATION LABOR')])
  assert.ok(groups.some((g) => g.key === 'fireplace-labor'))
  assert.ok(!groups.some((g) => g.key === 'fireplace-unit'))
})

test('Komfort Zone routes to heat-management', () => {
  const groups = groupLineItemsByCategory([item('KOMFORT ZONE PLENUM KIT')])
  assert.ok(groups.some((g) => g.key === 'heat-management'))
})

test('plenum box routes to heat-management', () => {
  const groups = groupLineItemsByCategory([item('PLENUM BOX 12IN')])
  assert.ok(groups.some((g) => g.key === 'heat-management'))
})

test('flex line routes to heat-management not venting', () => {
  const groups = groupLineItemsByCategory([item('FLEX LINE 8FT HEAT KIT')])
  assert.ok(groups.some((g) => g.key === 'heat-management'))
  assert.ok(!groups.some((g) => g.key === 'venting'))
})

test('vent pipe routes to venting', () => {
  const groups = groupLineItemsByCategory([item('DIRECT VENT PIPE 6IN FLEX')])
  assert.ok(groups.some((g) => g.key === 'venting'))
})

test('termination cap routes to venting', () => {
  const groups = groupLineItemsByCategory([item('TERMINATION CAP HORIZONTAL')])
  assert.ok(groups.some((g) => g.key === 'venting'))
})

test('limestone hearth routes to hearth-mantel', () => {
  const groups = groupLineItemsByCategory([item('LIMESTONE HEARTH PAD 48X16')])
  assert.ok(groups.some((g) => g.key === 'hearth-mantel'))
})

test('mantel shelf routes to hearth-mantel', () => {
  const groups = groupLineItemsByCategory([item('PINE MANTEL SHELF 6FT')])
  assert.ok(groups.some((g) => g.key === 'hearth-mantel'))
})

test('sales tax routes to sales-tax', () => {
  const groups = groupLineItemsByCategory([item('SALES TAX')])
  assert.ok(groups.some((g) => g.key === 'sales-tax'))
})

test('delivery charge routes to delivery-misc', () => {
  const groups = groupLineItemsByCategory([item('DELIVERY CHARGE')])
  assert.ok(groups.some((g) => g.key === 'delivery-misc'))
})

test('truly unknown item routes to other', () => {
  const groups = groupLineItemsByCategory([item('CUSTOM WIDGET PART ABC123 NONDESCRIPT')])
  assert.ok(groups.some((g) => g.key === 'other'))
})

test('unknown customer-facing group label is safe', () => {
  const groups = groupLineItemsByCategory([item('CUSTOM WIDGET PART ABC123 NONDESCRIPT')])
  const other = groups.find((g) => g.key === 'other')
  assert.equal(other.label, 'Additional Project Items')
  assert.equal(/Needs Review|Other/i.test(other.label), false)
})

test('detects unclassified line items for internal readiness warning', () => {
  assert.equal(hasUnclassifiedLineItems([item('CUSTOM WIDGET PART ABC123 NONDESCRIPT')]), true)
  assert.equal(hasUnclassifiedLineItems([item('NAPOLEON GX70 FIREPLACE')]), false)
})

test('empty line items returns empty groups', () => {
  const groups = groupLineItemsByCategory([])
  assert.equal(groups.length, 0)
})

test('category total sums item totals correctly', () => {
  const lineItems = [
    item('COUNTRY LEDGESTONE FLAT', { unit: 'SF', total: '$500.00' }),
    item('COUNTRY LEDGESTONE CORNER', { unit: 'SF', total: '$200.00' }),
  ]
  const groups = groupLineItemsByCategory(lineItems)
  const stoneGroup = groups.find((g) => g.key === 'stone-materials')
  assert.ok(stoneGroup)
  assert.equal(stoneGroup.categoryTotal, 700)
})

test('each group includes categoryTotalFormatted', () => {
  const groups = groupLineItemsByCategory([item('NAPOLEON GX70 FIREPLACE', { total: '$3,500.00' })])
  const fg = groups.find((g) => g.key === 'fireplace-unit')
  assert.ok(fg)
  assert.ok(typeof fg.categoryTotalFormatted === 'string')
  assert.ok(fg.categoryTotalFormatted.includes('3,500'))
})

test('groups do not contain sensitive internal terms', () => {
  const lineItems = [
    item('NAPOLEON GX70 DIRECT VENT GAS FIREPLACE', { total: '$3,500.00' }),
    item('VENT PIPE 6IN', { total: '$150.00' }),
  ]
  const groups = groupLineItemsByCategory(lineItems)
  const serialized = JSON.stringify(groups)
  assert.equal(
    /averageCost|standardBuy|estimatedMargin|productRank|salesRank|fuzzyMatch/i.test(serialized),
    false,
    'grouped output must not contain internal sensitive field names',
  )
})

test('remotes route to controls-electrical', () => {
  const groups = groupLineItemsByCategory([item('PROFLAME REMOTE CONTROL KIT')])
  assert.ok(groups.some((g) => g.key === 'controls-electrical'))
})

test('gas log set routes to fireplace-accessories', () => {
  const groups = groupLineItemsByCategory([item('GAS LOG SET 24IN')])
  assert.ok(groups.some((g) => g.key === 'fireplace-accessories'))
})

// --- detectDetailedBreakdownRecommended ---

test('returns true when 3+ major categories present', () => {
  const lineItems = [
    item('NAPOLEON GX70 DIRECT VENT FIREPLACE'),
    item('VENT PIPE 6IN FLEX'),
    item('COUNTRY LEDGESTONE FLAT', { unit: 'SF' }),
    item('STONE INSTALLATION LABOR'),
  ]
  assert.equal(detectDetailedBreakdownRecommended(lineItems), true)
})

test('returns false when fewer than 3 major categories', () => {
  const lineItems = [
    item('NAPOLEON GX70 DIRECT VENT FIREPLACE'),
    item('DELIVERY CHARGE'),
  ]
  assert.equal(detectDetailedBreakdownRecommended(lineItems), false)
})

test('returns false for empty line items', () => {
  assert.equal(detectDetailedBreakdownRecommended([]), false)
})

test('heat-management counts as a major category', () => {
  const lineItems = [
    item('NAPOLEON GX70 FIREPLACE'),
    item('VENT PIPE 6IN'),
    item('KOMFORT ZONE PLENUM KIT'),
  ]
  assert.equal(detectDetailedBreakdownRecommended(lineItems), true)
})

// --- detectKomfortZone ---

test('detects Komfort Zone from line item description', () => {
  assert.equal(detectKomfortZone([item('KOMFORT ZONE PLENUM KIT')]), true)
})

test('detects plenum from line item description', () => {
  assert.equal(detectKomfortZone([item('PLENUM BOX 12IN')]), true)
})

test('detects flex-line from line item description', () => {
  assert.equal(detectKomfortZone([item('FLEX LINE 8FT')]), true)
})

test('detects heat management from fields', () => {
  assert.equal(
    detectKomfortZone([], { PROJECT_NOTES: 'Includes Komfort Zone heat management for the mantel area.' }),
    true,
  )
})

test('detects plenum from installation scope field', () => {
  assert.equal(
    detectKomfortZone([], { INSTALLATION_SCOPE: 'Plenum box and flex line included for heat management.' }),
    true,
  )
})

test('returns false when no heat management indicators', () => {
  assert.equal(
    detectKomfortZone([item('NAPOLEON GX70 FIREPLACE'), item('VENT PIPE 6IN')], {}),
    false,
  )
})

// --- detectEstimateBasisItems ---

test('detects stone SF from unit field', () => {
  const items = detectEstimateBasisItems([item('COUNTRY LEDGESTONE FLAT', { unit: 'SF', qty: '120' })])
  assert.ok(items.some((i) => i.type === 'stone-sf'))
})

test('detects corner LF from unit field', () => {
  const items = detectEstimateBasisItems([item('COUNTRY LEDGESTONE CORNER RTN', { unit: 'LF', qty: '24' })])
  assert.ok(items.some((i) => i.type === 'corner-lf'))
})

test('detects mortar bags from unit field', () => {
  const items = detectEstimateBasisItems([item('TYPE S MORTAR 80LB', { unit: 'BAG', qty: '8' })])
  assert.ok(items.some((i) => i.type === 'mortar'))
})

test('detects final measure note from fields when no other allowance', () => {
  const items = detectEstimateBasisItems([], { PROJECT_NOTES: 'Subject to final measure before order.' })
  assert.ok(items.some((i) => i.type === 'final-measure-note'))
})

test('detects final measure from installation scope', () => {
  const items = detectEstimateBasisItems([], { INSTALLATION_SCOPE: 'Final measure required before stone order.' })
  assert.ok(items.some((i) => i.type === 'final-measure-note'))
})

test('returns empty array when no basis indicators', () => {
  const items = detectEstimateBasisItems([item('NAPOLEON GX70 FIREPLACE')])
  assert.equal(items.length, 0)
})

test('ignores unclear parsed finish quantities', () => {
  const items = detectEstimateBasisItems([
    item('COUNTRY LEDGESTONE FLAT', { qty: '3', unit: 'HP' }),
    item('LIMESTONE HEARTH PAD', { qty: '1', unit: 'BB' }),
  ])
  assert.equal(items.length, 0)
})

test('estimate basis summary falls back when no confident quantity is available', () => {
  const summary = getEstimateBasisSummary([item('COUNTRY LEDGESTONE FLAT', { qty: '3', unit: 'HP' })])
  assert.equal(summary.fallbackUsed, true)
  assert.equal(summary.items.length, 0)
  assert.equal(summary.fallbackNote, ESTIMATE_BASIS_FALLBACK_NOTE)
  assert.equal(/3 HP|1 BB/i.test(summary.fallbackNote), false)
})

test('preserves qty and unit on basis items', () => {
  const items = detectEstimateBasisItems([item('COUNTRY LEDGESTONE FLAT', { unit: 'SF', qty: '95' })])
  const sf = items.find((i) => i.type === 'stone-sf')
  assert.ok(sf)
  assert.equal(sf.qty, '95')
  assert.equal(sf.unit, 'SF')
})

// --- exported constants safety ---

test('KOMFORT_ZONE_EXPLAINER does not contain sensitive internal terms', () => {
  assert.equal(
    /\bcost\b|margin|bistrack|fuzzy|ocr|supplier|rank/i.test(KOMFORT_ZONE_EXPLAINER),
    false,
  )
})

test('QUOTE_ATTACHMENT_NOTE is customer-safe', () => {
  assert.equal(
    /margin|\bcost\b|fuzzy|ocr|supplier|rank/i.test(QUOTE_ATTACHMENT_NOTE),
    false,
  )
})

test('ESTIMATE_BASIS_FALLBACK_NOTE is customer-safe', () => {
  assert.equal(
    /margin|\bcost\b|fuzzy|ocr|supplier|rank|needs review|bistrack|3 HP|1 BB/i.test(ESTIMATE_BASIS_FALLBACK_NOTE),
    false,
  )
})
