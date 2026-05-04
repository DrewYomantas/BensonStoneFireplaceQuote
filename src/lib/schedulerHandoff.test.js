import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyCustomerFile } from './customerFile.js'
import { buildHandoffPatch, createSchedulerHandoff, deriveHandoffReadiness } from './schedulerHandoff.js'

function file(overrides = {}) {
  return createEmptyCustomerFile({
    customerName: 'Anna',
    customerPhone: '555',
    customerGoal: 'More heat',
    existingApplianceType: 'fireplace',
    existingFuelType: 'wood',
    photos: [{ id: 'p', label: 'full wall' }],
    measurements: [{ id: 'm', label: 'opening-width', value: '36 in' }],
    displaysShown: [{ id: 'd', label: '864 gas insert' }],
    brochuresGiven: [{ id: 'b', label: 'gas insert brochure' }],
    likelyPath: 'Gas insert path',
    opportunityId: 'EST123',
    lineItemQuoteIncluded: 'true',
    ...overrides,
  })
}

describe('schedulerHandoff', () => {
  it('derives needed_not_ready when core handoff facts are missing', () => {
    const r = deriveHandoffReadiness(createEmptyCustomerFile({ customerName: 'A', opportunityId: 'q' }))
    assert.equal(r.state, 'needed_not_ready')
    assert.ok(r.blockers.length > 0)
  })

  it('derives ready_to_create when handoff inputs are present', () => {
    const r = deriveHandoffReadiness(file())
    assert.equal(r.state, 'ready_to_create')
    assert.equal(r.ready, true)
  })

  it('creates a handoff summary from customer-file data', () => {
    const result = createSchedulerHandoff(file({ handoffConcerns: 'Verify chimney liner.' }))
    assert.ok(result.summary.includes('Customer/project: Anna'))
    assert.ok(result.summary.includes('Likely path: Gas insert path'))
    assert.ok(result.summary.includes('Verify chimney liner'))
    assert.ok(result.summary.includes('Original BizTrack quote: included'))
  })

  it('supports state transition patches', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    assert.equal(buildHandoffPatch('need-home-measure').handoffType, 'home-measure')
    assert.equal(buildHandoffPatch('created', 'summary', now).handoffCreatedAt, now.toISOString())
    assert.equal(buildHandoffPatch('sent', 'summary', now).handoffState, 'sent_to_scheduler')
    assert.equal(buildHandoffPatch('measure-completed', null, now).handoffMeasureCompletedAt, now.toISOString())
  })
})
