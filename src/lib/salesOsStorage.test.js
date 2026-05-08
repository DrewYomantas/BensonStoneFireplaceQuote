import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import { STORE_NAMES, SCHEMA_VERSION } from './salesOsStorageSchema.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('salesOsStorage — record CRUD', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('open succeeds with the in-memory engine', async () => {
    const r = await storage.open()
    assert.equal(r.ok, true)
    assert.equal(storage.isAvailable(), true)
  })

  it('round-trips a customer file: put → getById → update → getAll → delete', async () => {
    const seedAt = new Date('2026-05-01T10:00:00Z')
    const put1 = await storage.putRecord(STORE_NAMES.customerFiles,
      { id: 'cf-anna', customerName: 'Anna Orlinska' }, seedAt)
    assert.equal(put1.ok, true)
    assert.equal(put1.data.customerName, 'Anna Orlinska')
    assert.equal(put1.data.createdAt, seedAt.toISOString())
    assert.equal(put1.data.updatedAt, seedAt.toISOString())
    assert.equal(put1.data.schemaVersion, SCHEMA_VERSION)

    const got = await storage.getById(STORE_NAMES.customerFiles, 'cf-anna')
    assert.equal(got.ok, true)
    assert.equal(got.data.customerName, 'Anna Orlinska')

    const updateAt = new Date('2026-05-02T12:00:00Z')
    const put2 = await storage.putRecord(STORE_NAMES.customerFiles,
      { id: 'cf-anna', customerName: 'Anna O.', createdAt: seedAt.toISOString() }, updateAt)
    assert.equal(put2.data.createdAt, seedAt.toISOString(), 'createdAt preserved')
    assert.equal(put2.data.updatedAt, updateAt.toISOString(), 'updatedAt advanced')

    const all = await storage.getAll(STORE_NAMES.customerFiles)
    assert.equal(all.data.length, 1)

    const del = await storage.deleteRecord(STORE_NAMES.customerFiles, 'cf-anna')
    assert.equal(del.ok, true)
    const after = await storage.getById(STORE_NAMES.customerFiles, 'cf-anna')
    assert.equal(after.data, null)
  })

  it('rejects unknown stores and missing ids at the wrapper boundary', () => {
    assert.throws(() => storage.getAll('not-a-store'))
    assert.throws(() => storage.putRecord('not-a-store', { id: 'x' }))
    assert.throws(() => storage.putRecord(STORE_NAMES.customerFiles, {}))
    assert.throws(() => storage.putRecord(STORE_NAMES.appMeta, { id: 'x' }))
  })

  it('appMeta uses key/value through getMeta/setMeta', async () => {
    const r1 = await storage.getMeta('lastBackupAt')
    assert.deepEqual(r1, { ok: true, data: null })

    const set = await storage.setMeta('lastBackupAt', '2026-05-07T08:00:00Z')
    assert.equal(set.ok, true)

    const r2 = await storage.getMeta('lastBackupAt')
    assert.equal(r2.data, '2026-05-07T08:00:00Z')
  })

  it('clearStore empties a store', async () => {
    await storage.putRecord(STORE_NAMES.followUpRecords, { id: 'fu-1' })
    await storage.putRecord(STORE_NAMES.followUpRecords, { id: 'fu-2' })
    const before = await storage.getAll(STORE_NAMES.followUpRecords)
    assert.equal(before.data.length, 2)
    await storage.clearStore(STORE_NAMES.followUpRecords)
    const after = await storage.getAll(STORE_NAMES.followUpRecords)
    assert.equal(after.data.length, 0)
  })

  it('returns { ok:false } when the engine throws and flips availability', async () => {
    const broken = createSalesOsStorage({
      engine: {
        name: 'broken',
        async open() {},
        async getAll() { throw new Error('disk full') },
        async getById() {},
        async put() {},
        async delete() {},
        async clear() {},
      },
    })
    const r = await broken.getAll(STORE_NAMES.customerFiles)
    assert.equal(r.ok, false)
    assert.match(r.error.message, /disk full/)
    assert.equal(broken.isAvailable(), false)
  })
})
