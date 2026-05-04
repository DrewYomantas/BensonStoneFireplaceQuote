import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyCustomerFile } from './customerFile.js'
import { buildCustomerSafePacketSummary, buildPacketPatch, getCustomerPacketState, sanitizeCustomerFacingText } from './customerPacketState.js'

function readyFile(overrides = {}) {
  return createEmptyCustomerFile({
    customerName: 'Anna',
    customerPhone: '555',
    customerGoal: 'Gas insert',
    opportunityId: 'quote-1',
    lineItemQuoteIncluded: 'true',
    photos: [{ id: 'p1' }],
    measurements: [{ id: 'm1' }],
    displaysShown: [{ id: 'd1' }],
    brochuresGiven: [{ id: 'b1' }],
    pricingConfirmedAt: new Date().toISOString(),
    ...overrides,
  })
}

describe('customerPacketState', () => {
  it('reports blockers from quote status instead of manual readiness', () => {
    const packet = getCustomerPacketState(createEmptyCustomerFile({ customerName: '' }))
    assert.equal(packet.readyToGenerate, false)
    assert.ok(packet.blockers.some((b) => /customer name/i.test(b)))
  })

  it('allows original quote to be included or intentionally excluded with reason', () => {
    assert.equal(getCustomerPacketState(readyFile()).readyToGenerate, true)
    const excluded = readyFile({ lineItemQuoteIncluded: 'false', lineItemQuoteExcludedReason: 'Customer requested summary packet first.' })
    const packet = getCustomerPacketState(excluded)
    assert.equal(packet.decisions.originalBizTrackLineItemQuote, 'excluded-with-reason')
    assert.equal(packet.readyToGenerate, true)
  })

  it('requires an original quote decision when a quote is imported', () => {
    const packet = getCustomerPacketState(readyFile({ lineItemQuoteIncluded: '', lineItemQuoteExcludedReason: '' }))
    assert.equal(packet.readyToGenerate, false)
    assert.ok(packet.blockers.some((b) => /original BizTrack/i.test(b)))
  })

  it('builds timestamp patches for packet actions', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    assert.deepEqual(buildPacketPatch('include-original-quote', null, now), { lineItemQuoteIncluded: 'true', lineItemQuoteExcludedReason: '' })
    assert.equal(buildPacketPatch('mark-generated', null, now).packetGeneratedAt, now.toISOString())
    assert.equal(buildPacketPatch('mark-sent-email', null, now).packetSendChannel, 'email')
  })

  it('strips internal/local/source metadata from customer-facing summaries', () => {
    const clean = sanitizeCustomerFacingText('Looks good\nC:\\Users\\drew\\dealer cost internal only\nDealer cost: $1')
    assert.equal(clean, 'Looks good')
    const summary = buildCustomerSafePacketSummary(readyFile({ brochuresSamplesSummaryIncluded: 'true', brochuresSamplesSummary: 'Take home brochure\n/mnt/data/source metadata' }))
    assert.ok(summary.includes('Take home brochure'))
    assert.equal(/mnt|source metadata/i.test(summary), false)
  })
})
