import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyCustomerFile } from './customerFile.js'
import {
  blockingIssues,
  buildResolutionPatch,
  evaluateIssues,
  getIssueById,
  unresolvedIssues,
} from './issueDefinitions.js'

describe('issueDefinitions', () => {
  it('flags blockers when no contact is on file', () => {
    const file = createEmptyCustomerFile({})
    const issues = unresolvedIssues(file)
    const blockers = blockingIssues(file)
    assert.ok(issues.length >= 4)
    assert.ok(blockers.some((b) => b.id === 'missing-customer-name'))
    assert.ok(blockers.some((b) => b.id === 'missing-customer-contact-channel'))
  })

  it('resolves contact-channel issue when phone is set', () => {
    const file = createEmptyCustomerFile({ customerName: 'A', customerPhone: '5551212' })
    const ids = unresolvedIssues(file).map((i) => i.id)
    assert.ok(!ids.includes('missing-customer-name'))
    assert.ok(!ids.includes('missing-customer-contact-channel'))
  })

  it('hides line-item-quote issue until quote is imported', () => {
    const noQuote = createEmptyCustomerFile({ customerName: 'A', customerPhone: '1' })
    assert.ok(!unresolvedIssues(noQuote).some((i) => i.id === 'line-item-quote-not-included'))
    const withQuote = createEmptyCustomerFile({ customerName: 'A', customerPhone: '1', opportunityId: 'q-1' })
    assert.ok(unresolvedIssues(withQuote).some((i) => i.id === 'line-item-quote-not-included'))
  })

  it('photos issue resolves when at least one photo logged', () => {
    const file = createEmptyCustomerFile({ customerName: 'A' })
    file.photos = [{ id: 'p1', label: 'firebox' }]
    assert.ok(!unresolvedIssues(file).some((i) => i.id === 'no-photos-on-file'))
  })

  it('pricing-stale resolves only within 30 days', () => {
    const file = createEmptyCustomerFile({ customerName: 'A', customerPhone: '1', opportunityId: 'q-1' })
    file.pricingConfirmedAt = new Date().toISOString()
    assert.ok(!unresolvedIssues(file).some((i) => i.id === 'pricing-stale'))
    file.pricingConfirmedAt = new Date(Date.now() - 60 * 86400000).toISOString()
    assert.ok(unresolvedIssues(file).some((i) => i.id === 'pricing-stale'))
  })

  it('buildResolutionPatch produces the right shape per kind', () => {
    const fields = evaluateIssues(createEmptyCustomerFile({}))
    const nameIssue = fields.find((i) => i.id === 'missing-customer-name')
    assert.deepEqual(buildResolutionPatch(nameIssue, { customerName: 'Linda' }), { customerName: 'Linda' })

    const toggleDef = getIssueById('line-item-quote-not-included')
    assert.deepEqual(
      buildResolutionPatch({ id: 'line-item-quote-not-included' }, { value: true }),
      { lineItemQuoteIncluded: 'true' },
    )
    assert.equal(toggleDef.resolution.kind, 'toggle')

    const stamp = buildResolutionPatch({ id: 'packet-not-generated' }, {})
    assert.ok(stamp.packetGeneratedAt)
  })

  it('evaluateIssues marks resolved=true after fix', () => {
    const file = createEmptyCustomerFile({ customerName: 'A' })
    const before = evaluateIssues(file).find((i) => i.id === 'missing-customer-name')
    assert.equal(before.resolved, true)
    const file2 = createEmptyCustomerFile({})
    const after = evaluateIssues(file2).find((i) => i.id === 'missing-customer-name')
    assert.equal(after.resolved, false)
  })
})
