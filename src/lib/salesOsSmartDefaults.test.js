import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderOptions,
  suggestSetupTypeOrder,
  suggestDesiredOutcomeOrder,
  suggestPresenceOrder,
  suggestVentingOrder,
  suggestConstructionFlagOrder,
  commonBlockerCodes,
  commonNextStepCodes,
} from './salesOsSmartDefaults.js'
import {
  SETUP_TYPES,
  DESIRED_OUTCOMES,
  PRESENCE_VALUES,
  VENTING_TYPES,
  CONSTRUCTION_FLAGS,
} from './setupGoalLens.js'

describe('salesOsSmartDefaults — orderOptions', () => {
  it('returns an empty array when allowed is not an array', () => {
    assert.deepEqual(orderOptions(null), [])
    assert.deepEqual(orderOptions(undefined), [])
  })

  it('drops preferred entries that are not in allowed', () => {
    const out = orderOptions(['a', 'b', 'c'], ['x', 'a'])
    assert.deepEqual(out, ['a', 'b', 'c'])
  })

  it('preserves preferred order, then appends remaining in original order', () => {
    const out = orderOptions(['a', 'b', 'c', 'd'], ['c', 'a'])
    assert.deepEqual(out, ['c', 'a', 'b', 'd'])
  })

  it('does not mutate inputs', () => {
    const allowed = ['a', 'b', 'c']
    const preferred = ['c']
    orderOptions(allowed, preferred)
    assert.deepEqual(allowed, ['a', 'b', 'c'])
    assert.deepEqual(preferred, ['c'])
  })

  it('breaks ties via frequency descending when supplied', () => {
    const out = orderOptions(['a', 'b', 'c', 'd'], ['a'], { c: 5, b: 2, d: 0 })
    assert.deepEqual(out, ['a', 'c', 'b', 'd'])
  })
})

describe('salesOsSmartDefaults — domain orderings', () => {
  function assertSameSet(a, b, label) {
    assert.deepEqual([...a].sort(), [...b].sort(), `${label} must contain the same set of values`)
  }

  it('setup-type ordering covers every SETUP_TYPES value', () => {
    assertSameSet(suggestSetupTypeOrder(), SETUP_TYPES, 'setup type')
  })
  it('setup-type ordering puts a real setup type first', () => {
    assert.notEqual(suggestSetupTypeOrder()[0], 'unknown',
      'unknown should never lead the chip row')
  })

  it('desired-outcome ordering covers every DESIRED_OUTCOMES value', () => {
    assertSameSet(suggestDesiredOutcomeOrder(), DESIRED_OUTCOMES, 'desired outcome')
  })
  it('desired-outcome ordering puts more-heat first', () => {
    assert.equal(suggestDesiredOutcomeOrder()[0], 'more-heat')
  })

  it('presence ordering puts yes before no before unknown', () => {
    assert.deepEqual(suggestPresenceOrder(), ['yes', 'no', 'unknown'])
    assertSameSet(suggestPresenceOrder(), PRESENCE_VALUES, 'presence')
  })

  it('venting ordering covers every VENTING_TYPES value and pins masonry first', () => {
    assertSameSet(suggestVentingOrder(), VENTING_TYPES, 'venting')
    assert.equal(suggestVentingOrder()[0], 'masonry-chimney')
  })

  it('construction-flag ordering covers every CONSTRUCTION_FLAGS value', () => {
    assertSameSet(suggestConstructionFlagOrder(), CONSTRUCTION_FLAGS, 'construction flags')
  })

  it('orderings are deterministic across calls', () => {
    assert.deepEqual(suggestSetupTypeOrder(), suggestSetupTypeOrder())
    assert.deepEqual(suggestDesiredOutcomeOrder(), suggestDesiredOutcomeOrder())
  })

  it('frequency hook keeps allowed items but rebalances ties', () => {
    const ordered = suggestSetupTypeOrder({ 'electric-fireplace': 99 })
    // Preferred ordering wins for items in the preferred list — frequency only
    // affects the tail. So electric-fireplace stays in its preferred slot, but
    // among non-preferred entries it would lead. Sanity check: the result
    // still contains every setup type, with no duplicates.
    assert.equal(new Set(ordered).size, ordered.length)
    assertSameSet(ordered, SETUP_TYPES, 'frequency-hooked setup types')
  })
})

describe('salesOsSmartDefaults — common code lists', () => {
  it('commonBlockerCodes returns a fresh array each call', () => {
    const a = commonBlockerCodes()
    a.push('x')
    assert.notEqual(commonBlockerCodes().includes('x'), true)
  })

  it('commonNextStepCodes is non-empty and includes open-setup-goal-lens', () => {
    const codes = commonNextStepCodes()
    assert.ok(codes.length > 0)
    assert.ok(codes.includes('open-setup-goal-lens'))
  })
})
