import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHEMA_VERSION,
  STORE_NAMES,
  STORE_LIST,
  RECORD_STORES,
  keyPathFor,
  isSensitiveKey,
  scrubSensitiveKeys,
  stampRecord,
} from './salesOsStorageSchema.js'

describe('salesOsStorageSchema — v2 constants', () => {
  it('SCHEMA_VERSION is 2', () => {
    assert.equal(SCHEMA_VERSION, 2)
  })

  it('STORE_NAMES includes reps', () => {
    assert.equal(STORE_NAMES.reps, 'reps')
  })

  it('STORE_LIST includes reps', () => {
    assert.ok(STORE_LIST.includes('reps'))
  })

  it('RECORD_STORES includes reps (it is not appMeta)', () => {
    assert.ok(RECORD_STORES.includes('reps'))
  })

  it('RECORD_STORES does not include appMeta', () => {
    assert.ok(!RECORD_STORES.includes(STORE_NAMES.appMeta))
  })

  it('keyPathFor reps returns id', () => {
    assert.equal(keyPathFor(STORE_NAMES.reps), 'id')
  })

  it('keyPathFor appMeta returns key', () => {
    assert.equal(keyPathFor(STORE_NAMES.appMeta), 'key')
  })

  it('all expected V1 stores are still present', () => {
    const v1Stores = [
      'customerFiles',
      'visitSessions',
      'quotePrepRecords',
      'followUpRecords',
      'activityTimeline',
      'recoveryQueue',
      'appMeta',
    ]
    for (const name of v1Stores) {
      assert.ok(STORE_LIST.includes(name), `missing v1 store: ${name}`)
    }
  })
})

describe('salesOsStorageSchema — sensitive key scrub', () => {
  it('isSensitiveKey flags cost, margin, buy price, etc.', () => {
    assert.ok(isSensitiveKey('cost'))
    assert.ok(isSensitiveKey('margin'))
    assert.ok(isSensitiveKey('buyPrice'))
    assert.ok(isSensitiveKey('salesRank'))
    assert.ok(isSensitiveKey('rawOcr'))
    assert.ok(isSensitiveKey('bistrackConfidence'))
  })

  it('isSensitiveKey does not flag safe keys', () => {
    assert.ok(!isSensitiveKey('firstName'))
    assert.ok(!isSensitiveKey('last4Ssn'))
    assert.ok(!isSensitiveKey('repId'))
    assert.ok(!isSensitiveKey('fileId'))
    assert.ok(!isSensitiveKey('customerName'))
  })

  it('scrubSensitiveKeys removes sensitive fields from rep-like records', () => {
    const record = { id: 'rep-1', firstName: 'Drew', cost: 9999 }
    const scrubbed = scrubSensitiveKeys(record)
    assert.equal(scrubbed.id, 'rep-1')
    assert.equal(scrubbed.firstName, 'Drew')
    assert.equal(scrubbed.cost, undefined)
  })
})

describe('salesOsStorageSchema — stampRecord', () => {
  it('adds createdAt and updatedAt on new record', () => {
    const now = new Date('2026-05-12T10:00:00Z')
    const stamped = stampRecord({ id: 'x' }, now)
    assert.equal(stamped.createdAt, '2026-05-12T10:00:00.000Z')
    assert.equal(stamped.updatedAt, '2026-05-12T10:00:00.000Z')
    assert.equal(stamped.schemaVersion, SCHEMA_VERSION)
  })

  it('preserves existing createdAt on update', () => {
    const created = '2026-04-01T00:00:00.000Z'
    const now = new Date('2026-05-12T10:00:00Z')
    const stamped = stampRecord({ id: 'x', createdAt: created }, now)
    assert.equal(stamped.createdAt, created)
    assert.equal(stamped.updatedAt, '2026-05-12T10:00:00.000Z')
  })
})
