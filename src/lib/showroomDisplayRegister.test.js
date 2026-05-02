import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDisplayRecord,
  deriveShowroomDisplayContext,
  filterDisplayRecords,
  listDisplayRecords,
  saveDisplayRecord,
  updateDisplayRecord,
} from './showroomDisplayRegister.js'

function storageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

function record(overrides = {}) {
  return createDisplayRecord({
    productCode: 'DVX-36',
    modelName: 'Deluxe View 36',
    description: 'Gas fireplace display',
    brand: 'DemoFlame',
    applianceType: 'Gas Fireplace',
    locationZone: 'first-floor',
    locationDetail: 'north wall',
    displayStatus: 'on-display',
    workingStatus: 'display-only',
    lastVerifiedAt: '2026-05-02',
    internalNotes: 'Check trim before quoting showroom visit.',
    talkingPoints: 'Strong viewing glass and clean face.',
    ...overrides,
  }, '2026-05-02T12:00:00.000Z')
}

test('display records can be created and stored locally', () => {
  const storage = storageMock()
  const created = record()

  saveDisplayRecord(created, storage)
  const saved = listDisplayRecords(storage)

  assert.equal(saved.length, 1)
  assert.equal(saved[0].productCode, 'DVX-36')
  assert.equal(saved[0].displayStatus, 'on-display')
  assert.ok(saved[0].createdAt)
})

test('display records can be updated locally', () => {
  const storage = storageMock()
  const created = record()
  saveDisplayRecord(created, storage)

  updateDisplayRecord(created.id, {
    displayStatus: 'needs-verification',
    locationZone: 'cellar',
    locationDetail: 'bay 2',
  }, storage)

  const saved = listDisplayRecords(storage)[0]
  assert.equal(saved.displayStatus, 'needs-verification')
  assert.equal(saved.locationZone, 'cellar')
  assert.equal(saved.locationDetail, 'bay 2')
})

test('display filters support status, location, and search', () => {
  const records = [
    record(),
    record({ id: 'cellar', productCode: 'SL-42', modelName: 'Summit Linear 42', locationZone: 'cellar', displayStatus: 'needs-verification' }),
    record({ id: 'unknown', productCode: 'RETRO', modelName: 'Retro Stove', locationZone: 'unknown', displayStatus: 'unknown' }),
  ]

  assert.equal(filterDisplayRecords(records, 'on-display').length, 1)
  assert.equal(filterDisplayRecords(records, 'needs-verification').length, 1)
  assert.equal(filterDisplayRecords(records, 'cellar').length, 1)
  assert.equal(filterDisplayRecords(records, 'unknown-location').length, 1)
  assert.equal(filterDisplayRecords(records, 'all', 'summit').length, 1)
})

test('exact product code match creates safe internal display context', () => {
  const context = deriveShowroomDisplayContext({
    displayRecords: [record()],
    lineItems: [{ sku: 'DVX-36', description: 'Deluxe View 36 fireplace' }],
    fields: { PROJECT_SCOPE_SUMMARY: 'Customer liked the Deluxe View 36 layout.' },
  })

  assert.equal(context.status, 'exact-on-display')
  assert.equal(context.customerFacingAllowed, true)
  assert.equal(context.followUpContext.displayModelAvailable, true)
  assert.match(context.chipLabel, /On Display: First Floor/)
  assert.equal(/north wall|Check trim/i.test(`${context.chipLabel} ${context.note}`), false)
})

test('uncertain text match stays suggestion-only and internal', () => {
  const context = deriveShowroomDisplayContext({
    displayRecords: [record({ productCode: 'SL-42', modelName: 'Summit Linear 42', description: 'Linear gas fireplace' })],
    opportunity: { productsNotes: 'Customer asked about a summit linear fireplace look.' },
  })

  assert.equal(context.status, 'suggested')
  assert.equal(context.customerFacingAllowed, false)
  assert.equal(context.followUpContext.displayModelAvailable, false)
  assert.equal(context.suggestedMatches.length, 1)
  assert.match(context.note, /Suggestion only/i)
})
