import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyCustomerFile } from './customerFile.js'
import {
  derivePacketReadiness,
  deriveLifecycleStage,
  deriveQuoteStatus,
  deriveQueueBucket,
  deriveNextBestAction,
  deriveHandoffReadiness,
  getCurrentStageIndex,
  getNextStage,
  getStatusLabel,
} from './quoteStatusEngine.js'

function richFile(overrides = {}) {
  const base = createEmptyCustomerFile({
    customerName: 'Anna Orlinska',
    customerPhone: '5551212',
    customerGoal: 'Convert wood insert to gas',
    opportunityId: 'quote-1',
    lineItemQuoteIncluded: 'true',
  })
  return { ...base, ...overrides }
}

describe('quoteStatusEngine', () => {
  it('lifecycle stages light up only when their data exists', () => {
    const empty = createEmptyCustomerFile({})
    const stages = deriveLifecycleStage(empty)
    assert.equal(stages['goal-discovered'], false)
    assert.equal(stages['quote-imported'], false)

    const file = richFile()
    const lit = deriveLifecycleStage(file)
    assert.equal(lit['goal-discovered'], true)
    assert.equal(lit['quote-imported'], true)
  })

  it('packet readiness blocks without contact, goal, or quote', () => {
    const r1 = derivePacketReadiness(createEmptyCustomerFile({}))
    assert.equal(r1.ready, false)
    assert.ok(r1.reasons.length >= 3)

    const r2 = derivePacketReadiness(richFile())
    assert.equal(r2.ready, true, `expected ready, blocked by: ${r2.reasons.join('; ')}`)
  })

  it('status walks the lifecycle as data fills in', () => {
    assert.equal(deriveQuoteStatus(createEmptyCustomerFile({})).status, 'new')

    const visit = createEmptyCustomerFile({ customerName: 'A', visitedAt: new Date().toISOString() })
    assert.equal(deriveQuoteStatus(visit).status, 'in-discovery')

    const walked = { ...visit, displaysShown: [{ id: 'd1', label: 'Mendota DXV' }] }
    assert.equal(deriveQuoteStatus(walked).status, 'awaiting-quote-import')

    const imported = { ...walked, opportunityId: 'q-1', customerPhone: '1', customerGoal: 'g', lineItemQuoteIncluded: 'true' }
    assert.equal(deriveQuoteStatus(imported).status, 'ready-to-generate-packet')

    const generated = { ...imported, packetGeneratedAt: new Date().toISOString() }
    assert.equal(deriveQuoteStatus(generated).status, 'packet-ready-to-send')

    const sent = { ...generated, packetSentAt: new Date().toISOString(), packetSendChannel: 'email' }
    assert.equal(deriveQuoteStatus(sent).status, 'waiting-on-customer')

    const handoff = { ...sent, handoffType: 'home-measure' }
    assert.equal(deriveQuoteStatus(handoff).status, 'handoff-scheduled')
  })

  it('stage index and next stage advance with data', () => {
    const file = richFile()
    const idx = getCurrentStageIndex(file)
    assert.ok(idx >= 3, `expected at least quote-imported, got ${idx}`)
    assert.ok(getNextStage(file))
  })


  it('derives expanded queue bucket, next action, and handoff readiness', () => {
    const file = richFile({
      likelyPath: 'Gas insert path',
      photos: [{ id: 'p1' }],
      measurements: [{ id: 'm1' }],
      existingApplianceType: 'fireplace',
    })
    assert.equal(deriveQueueBucket(file), 'ready-to-generate-packet')
    assert.equal(deriveHandoffReadiness(file).state, 'ready_to_create')
    assert.equal(deriveNextBestAction({ ...file, packetGeneratedAt: new Date().toISOString(), packetSentAt: new Date().toISOString() }), 'Create scheduler/home-measure handoff')
  })

  it('exports human labels for status', () => {
    assert.equal(getStatusLabel('new'), 'New File')
    assert.equal(getStatusLabel('handoff-scheduled'), 'Handoff Scheduled')
  })
})
