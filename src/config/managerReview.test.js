import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MANAGER_REVIEW_DEFAULTS, formatThreshold, isOverThreshold } from './managerReview.js'

describe('managerReview config', () => {
  it('default threshold is configurable, not a literal hardcoded into the consumer', () => {
    // Defaults can change; we only assert the shape so a future deployment can swap them.
    assert.ok(typeof MANAGER_REVIEW_DEFAULTS.thresholdCents === 'number')
    assert.ok(MANAGER_REVIEW_DEFAULTS.thresholdCents > 0)
    assert.ok(Array.isArray(MANAGER_REVIEW_DEFAULTS.reasons))
    assert.ok(MANAGER_REVIEW_DEFAULTS.reasons.length >= 4)
  })

  it('reasons each carry id/title/hint and do not name a specific reviewer', () => {
    const blocked = /\b(liam|drew|kevin|jamie)\b/i
    for (const r of MANAGER_REVIEW_DEFAULTS.reasons) {
      assert.equal(typeof r.id, 'string')
      assert.equal(typeof r.title, 'string')
      assert.equal(typeof r.hint, 'string')
      assert.equal(blocked.test(r.title), false, `reason title must not name a specific person: ${r.title}`)
    }
  })

  it('formatThreshold renders currency correctly', () => {
    assert.match(formatThreshold(600000, 'USD'), /\$6,000/)
  })

  it('isOverThreshold compares against the supplied config, not a literal', () => {
    const config = { ...MANAGER_REVIEW_DEFAULTS, thresholdCents: 250000 }
    assert.equal(isOverThreshold(300000, config), true)
    assert.equal(isOverThreshold(100000, config), false)
    // default config still works
    assert.equal(isOverThreshold(700000), true)
    assert.equal(isOverThreshold(400000), false)
  })
})
