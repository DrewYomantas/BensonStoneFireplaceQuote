import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  exportSalesOsBackup,
  importSalesOsBackup,
  validateSalesOsBackup,
  summarizeBackup,
} from './salesOsBackup.js'
import { APP_NAME, BACKUP_VERSION, SCHEMA_VERSION, STORE_LIST, STORE_NAMES } from './salesOsStorageSchema.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

async function seedSample(storage) {
  await storage.putRecord(STORE_NAMES.customerFiles, { id: 'cf-1', customerName: 'A' })
  await storage.putRecord(STORE_NAMES.customerFiles, { id: 'cf-2', customerName: 'B' })
  await storage.putRecord(STORE_NAMES.activityTimeline, { id: 'act-1', body: 'note' })
  await storage.setMeta('lastBackupAt', '2026-05-07T08:00:00Z')
}

describe('salesOsBackup — export', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('produces a payload with appName, versions, exportedAt, and every store', async () => {
    await seedSample(storage)
    const payload = await exportSalesOsBackup(storage, { now: new Date('2026-05-07T09:00:00Z') })
    assert.equal(payload.appName, APP_NAME)
    assert.equal(payload.backupVersion, BACKUP_VERSION)
    assert.equal(payload.schemaVersion, SCHEMA_VERSION)
    assert.equal(payload.exportedAt, '2026-05-07T09:00:00.000Z')
    for (const store of STORE_LIST) {
      assert.ok(Array.isArray(payload.stores[store]), `${store} should be an array`)
    }
    assert.equal(payload.stores.customerFiles.length, 2)
    assert.equal(payload.stores.appMeta.length, 1)
  })

  it('strips sensitive keys from records before they leave the storage', async () => {
    await storage.putRecord(STORE_NAMES.quotePrepRecords, {
      id: 'qp-1',
      customerName: 'Drew',
      cost: 1234,
      margin: 0.42,
      averageCost: 900,
      buyPrice: 800,
      supplierTotal: 999,
      productRank: 5,
      bistrackConfidence: '95%',
      ocrConfidence: '88%',
      rawOcr: 'asd asd',
    })
    const payload = await exportSalesOsBackup(storage)
    const row = payload.stores.quotePrepRecords[0]
    assert.equal(row.customerName, 'Drew')
    assert.equal('cost' in row, false)
    assert.equal('margin' in row, false)
    assert.equal('averageCost' in row, false)
    assert.equal('buyPrice' in row, false)
    assert.equal('supplierTotal' in row, false)
    assert.equal('productRank' in row, false)
    assert.equal('bistrackConfidence' in row, false)
    assert.equal('ocrConfidence' in row, false)
    assert.equal('rawOcr' in row, false)

    const validation = validateSalesOsBackup(payload)
    assert.equal(validation.valid, true, validation.errors.join('; '))
  })
})

describe('salesOsBackup — validate', () => {
  it('rejects a non-object payload', () => {
    assert.equal(validateSalesOsBackup(null).valid, false)
    assert.equal(validateSalesOsBackup('a string').valid, false)
    assert.equal(validateSalesOsBackup([]).valid, false)
  })

  it('rejects mismatched appName, version, missing exportedAt or stores', () => {
    const v1 = validateSalesOsBackup({
      appName: 'other-app', backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z', stores: {},
    })
    assert.equal(v1.valid, false)
    assert.ok(v1.errors.some((e) => /appName/.test(e)))

    const v2 = validateSalesOsBackup({
      appName: APP_NAME, backupVersion: 99, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z', stores: {},
    })
    assert.equal(v2.valid, false)
    assert.ok(v2.errors.some((e) => /backupVersion/.test(e)))

    const v3 = validateSalesOsBackup({
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
    })
    assert.equal(v3.valid, false)
  })

  it('rejects unknown stores and sensitive fields in rows', () => {
    const v1 = validateSalesOsBackup({
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z',
      stores: { unknownStore: [] },
    })
    assert.equal(v1.valid, false)
    assert.ok(v1.errors.some((e) => /Unknown store/.test(e)))

    const v2 = validateSalesOsBackup({
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z',
      stores: { customerFiles: [{ id: 'x', cost: 99 }] },
    })
    assert.equal(v2.valid, false)
    assert.ok(v2.errors.some((e) => /sensitive field/.test(e)))
  })

  it('accepts a valid empty payload', () => {
    const empty = {
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z',
      stores: Object.fromEntries(STORE_LIST.map((s) => [s, []])),
    }
    assert.equal(validateSalesOsBackup(empty).valid, true)
  })
})

describe('salesOsBackup — import', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('round-trips a backup with replace mode and preserves createdAt', async () => {
    await storage.putRecord(STORE_NAMES.customerFiles, {
      id: 'cf-1', customerName: 'A', createdAt: '2024-01-01T00:00:00.000Z',
    }, new Date('2024-01-01T00:00:00Z'))
    const payload = await exportSalesOsBackup(storage)

    const fresh = makeStorage()
    const restored = await importSalesOsBackup(fresh, payload, { mode: 'replace' })
    assert.equal(restored.ok, true)
    assert.equal(restored.summary.customerFiles, 1)

    const out = await fresh.getById(STORE_NAMES.customerFiles, 'cf-1')
    assert.equal(out.data.customerName, 'A')
    assert.equal(out.data.createdAt, '2024-01-01T00:00:00.000Z', 'createdAt preserved through round-trip')
  })

  it('handles missing/empty stores safely', async () => {
    const payload = {
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z',
      stores: { customerFiles: [{ id: 'cf-only', customerName: 'Solo' }] },
    }
    const fresh = makeStorage()
    const restored = await importSalesOsBackup(fresh, payload)
    assert.equal(restored.ok, true)
    assert.equal(restored.summary.customerFiles, 1)
    assert.equal(restored.summary.followUpRecords, 0)
  })

  it('rejects malformed payloads with errors[]', async () => {
    const result = await importSalesOsBackup(makeStorage(), { junk: true })
    assert.equal(result.ok, false)
    assert.ok(result.errors.length > 0)
  })

  it('replace mode wipes pre-existing data first', async () => {
    await storage.putRecord(STORE_NAMES.customerFiles, { id: 'pre-existing', customerName: 'X' })
    const payload = {
      appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-07T00:00:00Z',
      stores: { customerFiles: [{ id: 'cf-new', customerName: 'New' }] },
    }
    await importSalesOsBackup(storage, payload, { mode: 'replace' })
    const all = await storage.getAll(STORE_NAMES.customerFiles)
    assert.equal(all.data.length, 1)
    assert.equal(all.data[0].id, 'cf-new')
  })
})

describe('salesOsBackup — summary', () => {
  it('reports counts and version on a valid payload', async () => {
    const storage = makeStorage()
    await seedSample(storage)
    const payload = await exportSalesOsBackup(storage)
    const summary = summarizeBackup(payload)
    assert.equal(summary.valid, true)
    assert.equal(summary.schemaVersion, SCHEMA_VERSION)
    assert.equal(summary.counts.customerFiles, 2)
    assert.equal(summary.counts.activityTimeline, 1)
  })
  it('flags invalid payloads with errors', () => {
    const summary = summarizeBackup({ junk: true })
    assert.equal(summary.valid, false)
    assert.ok(summary.errors.length > 0)
  })
})
