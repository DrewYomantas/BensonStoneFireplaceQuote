import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCustomerFileSignals, isSignalDetected } from './customerFileSignals.js'

test('deriveCustomerFileSignals detects explicit logged evidence', () => {
  const signals = deriveCustomerFileSignals({
    customerGoal: 'Wants less mess',
    likelyPath: 'Gas insert',
    photos: [{ id: 'p1', label: 'Firebox' }],
    measurements: [{ id: 'm1', value: '36 x 30' }],
    modelTagReceived: 'true',
    displaysShown: [{ id: 'd1', label: '864 display' }],
    opportunityId: 'opp-1',
    packetGeneratedAt: '2026-05-04T12:00:00Z',
  })
  assert.equal(signals.signals.photos.detected, true)
  assert.equal(signals.signals.measurements.detected, true)
  assert.equal(signals.signals.modelTag.detected, true)
  assert.equal(signals.signals.showroom.detected, true)
  assert.equal(signals.signals.quote.detected, true)
  assert.equal(signals.signals.packet.detected, true)
})

test('deriveCustomerFileSignals infers photos and measurements from notes without salesperson checklist clicks', () => {
  const signals = deriveCustomerFileSignals({
    notes: [{ body: 'Customer texted photos and rough opening dimensions 36 x 30.' }],
  })
  assert.equal(signals.signals.photos.detected, true)
  assert.equal(signals.signals.photos.source, 'Detected from notes')
  assert.equal(signals.signals.measurements.detected, true)
})

test('isSignalDetected returns derived signal state', () => {
  assert.equal(isSignalDetected({ taggedModel: '864 TRV' }, 'modelTag'), true)
  assert.equal(isSignalDetected({}, 'modelTag'), false)
})
