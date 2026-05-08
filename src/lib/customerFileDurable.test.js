import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import { STORE_NAMES, SCHEMA_VERSION, APP_NAME, BACKUP_VERSION } from './salesOsStorageSchema.js'
import {
  createCustomerFileDurable,
  getCustomerFileByOpportunityDurable,
  getCustomerFileDurable,
  listCustomerFilesDurable,
  removeCustomerFileDurable,
  saveCustomerFileDurable,
  updateCustomerFileDurable,
} from './customerFileDurable.js'
import {
  _flushCustomerFileDurableMirror,
  saveCustomerFile,
  updateCustomerFile,
  removeCustomerFile,
  appendCustomerFileItem,
  setCustomerFileDurableMirror,
} from './customerFile.js'
import {
  exportSalesOsBackup,
  importSalesOsBackup,
  validateSalesOsBackup,
} from './salesOsBackup.js'
import { migrateLegacyLocalStorage, LEGACY_KEYS } from './salesOsMigration.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

function memLocalStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _raw: map,
  }
}

describe('customerFileDurable — async API', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('save → get → list round-trip stamps createdAt/updatedAt and preserves them', async () => {
    const t1 = new Date('2026-05-01T10:00:00Z')
    const saved = await saveCustomerFileDurable(storage, {
      id: 'cf-anna',
      customerName: 'Anna Orlinska',
    }, t1)
    assert.equal(saved.customerName, 'Anna Orlinska')
    assert.equal(saved.createdAt, t1.toISOString())
    assert.equal(saved.updatedAt, t1.toISOString())

    const fetched = await getCustomerFileDurable(storage, 'cf-anna')
    assert.equal(fetched.customerName, 'Anna Orlinska')
    assert.equal(fetched.createdAt, t1.toISOString())

    const t2 = new Date('2026-05-02T12:00:00Z')
    const updated = await updateCustomerFileDurable(storage, 'cf-anna', { customerGoal: 'Gas insert' }, t2)
    assert.equal(updated.customerGoal, 'Gas insert')
    assert.equal(updated.createdAt, t1.toISOString(), 'createdAt preserved')
    assert.equal(updated.updatedAt, t2.toISOString(), 'updatedAt advanced')
  })

  it('list returns every saved file', async () => {
    await saveCustomerFileDurable(storage, { id: 'cf-1', customerName: 'A' })
    await saveCustomerFileDurable(storage, { id: 'cf-2', customerName: 'B' })
    await saveCustomerFileDurable(storage, { id: 'cf-3', customerName: 'C' })
    const all = await listCustomerFilesDurable(storage)
    assert.equal(all.length, 3)
    const ids = all.map((f) => f.id).sort()
    assert.deepEqual(ids, ['cf-1', 'cf-2', 'cf-3'])
  })

  it('remove deletes a file', async () => {
    await saveCustomerFileDurable(storage, { id: 'cf-1', customerName: 'A' })
    assert.equal(await removeCustomerFileDurable(storage, 'cf-1'), true)
    assert.equal(await getCustomerFileDurable(storage, 'cf-1'), null)
  })

  it('createCustomerFileDurable seeds metadata', async () => {
    const created = await createCustomerFileDurable(storage, { customerName: 'New Walk-in' }, new Date('2026-05-07T09:00:00Z'))
    assert.match(created.id, /^cf-/)
    assert.equal(created.customerName, 'New Walk-in')
  })

  it('lookup by opportunity id', async () => {
    await saveCustomerFileDurable(storage, { id: 'cf-1', opportunityId: 'quote-99', customerName: 'Linked' })
    const found = await getCustomerFileByOpportunityDurable(storage, 'quote-99')
    assert.equal(found.id, 'cf-1')
    const missing = await getCustomerFileByOpportunityDurable(storage, 'quote-nope')
    assert.equal(missing, null)
  })
})

describe('customerFile — durable mirror from sync API', () => {
  let storage
  let local
  beforeEach(() => {
    storage = makeStorage()
    local = memLocalStorage()
    setCustomerFileDurableMirror(storage)
  })
  afterEach(() => { setCustomerFileDurableMirror(null) })

  it('saveCustomerFile mirrors into durable storage', async () => {
    saveCustomerFile({ id: 'cf-1', customerName: 'Mirror Me' }, local)
    await _flushCustomerFileDurableMirror()
    const durable = await getCustomerFileDurable(storage, 'cf-1')
    assert.equal(durable.customerName, 'Mirror Me')
  })

  it('updateCustomerFile mirrors patch into durable storage', async () => {
    saveCustomerFile({ id: 'cf-1', customerName: 'X' }, local)
    await _flushCustomerFileDurableMirror()
    updateCustomerFile('cf-1', { customerGoal: 'Wood stove' }, local)
    await _flushCustomerFileDurableMirror()
    const durable = await getCustomerFileDurable(storage, 'cf-1')
    assert.equal(durable.customerGoal, 'Wood stove')
  })

  it('appendCustomerFileItem mirrors via updateCustomerFile', async () => {
    saveCustomerFile({ id: 'cf-1', customerName: 'X' }, local)
    await _flushCustomerFileDurableMirror()
    appendCustomerFileItem('cf-1', 'notes', { body: 'Walked showroom' }, local)
    await _flushCustomerFileDurableMirror()
    const durable = await getCustomerFileDurable(storage, 'cf-1')
    assert.equal(durable.notes.length, 1)
    assert.equal(durable.notes[0].body, 'Walked showroom')
  })

  it('removeCustomerFile mirrors deletion', async () => {
    saveCustomerFile({ id: 'cf-1', customerName: 'X' }, local)
    await _flushCustomerFileDurableMirror()
    removeCustomerFile('cf-1', local)
    await _flushCustomerFileDurableMirror()
    assert.equal(await getCustomerFileDurable(storage, 'cf-1'), null)
  })

  it('does not mirror when mirror is null (legacy default)', async () => {
    setCustomerFileDurableMirror(null)
    const fresh = makeStorage()
    saveCustomerFile({ id: 'cf-1', customerName: 'Solo' }, local)
    await _flushCustomerFileDurableMirror()
    assert.equal(await getCustomerFileDurable(fresh, 'cf-1'), null)
  })

  it('legacy localStorage is not deleted by mirroring', async () => {
    saveCustomerFile({ id: 'cf-1', customerName: 'Both' }, local)
    await _flushCustomerFileDurableMirror()
    const raw = local.getItem('benson-stone-customer-file-v1')
    const legacy = JSON.parse(raw)
    assert.equal(legacy[0].customerName, 'Both')
  })
})

describe('customerFile — legacy migration into durable storage', () => {
  let storage
  let local
  beforeEach(() => {
    storage = makeStorage()
    local = memLocalStorage()
  })

  it('migrates the legacy customer-file localStorage key into customerFiles', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([
      { id: 'cf-1', customerName: 'Legacy Anna' },
      { id: 'cf-2', customerName: 'Legacy Bo' },
    ]))
    const result = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(result.ok, true)
    assert.equal(result.summary.customerFiles, 2)

    const fetched = await getCustomerFileDurable(storage, 'cf-1')
    assert.equal(fetched.customerName, 'Legacy Anna')
  })

  it('migration is idempotent and does not delete the legacy key', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([{ id: 'cf-1', customerName: 'A' }]))
    await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    const second = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(second.skipped, true)
    assert.notEqual(local.getItem(LEGACY_KEYS.customerFiles), null)
  })
})

describe('customerFile — backup / restore round-trip', () => {
  it('export includes customerFiles and restore brings them back', async () => {
    const source = makeStorage()
    await saveCustomerFileDurable(source, { id: 'cf-1', customerName: 'Backed Up' }, new Date('2026-05-01T10:00:00Z'))
    await saveCustomerFileDurable(source, { id: 'cf-2', customerName: 'Also Backed' })

    const payload = await exportSalesOsBackup(source)
    assert.equal(payload.stores.customerFiles.length, 2)
    const validation = validateSalesOsBackup(payload)
    assert.equal(validation.valid, true, validation.errors.join('; '))

    const fresh = makeStorage()
    const restored = await importSalesOsBackup(fresh, payload, { mode: 'replace' })
    assert.equal(restored.ok, true)
    assert.equal(restored.summary.customerFiles, 2)

    const out = await getCustomerFileDurable(fresh, 'cf-1')
    assert.equal(out.customerName, 'Backed Up')
    assert.equal(out.createdAt, '2026-05-01T10:00:00.000Z')
  })

  it('sensitive fields injected into a customer file are scrubbed on export', async () => {
    const storage = makeStorage()
    // sanitizeCustomerFile drops unknown fields; bypass it by writing raw to the
    // storage layer so we can verify exportSalesOsBackup also scrubs.
    await storage.putRecord(STORE_NAMES.customerFiles, {
      id: 'cf-x',
      customerName: 'Audit',
      cost: 1000,
      margin: 0.5,
      bistrackConfidence: '95%',
    })
    const payload = await exportSalesOsBackup(storage)
    const row = payload.stores.customerFiles[0]
    assert.equal(row.customerName, 'Audit')
    assert.equal('cost' in row, false)
    assert.equal('margin' in row, false)
    assert.equal('bistrackConfidence' in row, false)
    assert.equal(payload.appName, APP_NAME)
    assert.equal(payload.backupVersion, BACKUP_VERSION)
    assert.equal(payload.schemaVersion, SCHEMA_VERSION)
  })
})
