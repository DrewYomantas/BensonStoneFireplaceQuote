import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import { migrateLegacyLocalStorage, LEGACY_KEYS, MIGRATION_META_KEY } from './salesOsMigration.js'
import { STORE_NAMES } from './salesOsStorageSchema.js'

function memStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('migrateLegacyLocalStorage', () => {
  let storage
  let local
  beforeEach(() => {
    storage = makeStorage()
    local = memStorage()
  })

  it('moves customer files, opportunities (split active vs recovery), and activities', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([
      { id: 'cf-1', customerName: 'Anna' },
      { id: 'cf-2', customerName: 'Bo' },
    ]))
    local.setItem(LEGACY_KEYS.opportunityQueue, JSON.stringify([
      { id: 'opp-active', sourceType: 'quote-polish', customerName: 'Active' },
      { id: 'opp-recovery', sourceType: 'bulk-pdf', customerName: 'Recovery' },
      { id: 'opp-recovery-2', recoverySource: 'true', sourceType: 'manual', customerName: 'Recov2' },
    ]))
    local.setItem(LEGACY_KEYS.opportunityActivities, JSON.stringify([
      { id: 'act-1', body: 'note one' },
      { id: 'act-2', body: 'note two' },
    ]))

    const result = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(result.ok, true)
    assert.equal(result.skipped, false)
    assert.equal(result.summary.customerFiles, 2)
    assert.equal(result.summary.quotePrepRecords, 1)
    assert.equal(result.summary.recoveryQueue, 2)
    assert.equal(result.summary.activityTimeline, 2)

    const cf = await storage.getAll(STORE_NAMES.customerFiles)
    assert.equal(cf.data.length, 2)
    const active = await storage.getAll(STORE_NAMES.quotePrepRecords)
    assert.equal(active.data[0].id, 'opp-active')
    const recovery = await storage.getAll(STORE_NAMES.recoveryQueue)
    assert.equal(recovery.data.length, 2)
    const acts = await storage.getAll(STORE_NAMES.activityTimeline)
    assert.equal(acts.data.length, 2)
  })

  it('is idempotent — second run is skipped via appMeta marker', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([{ id: 'cf-1', customerName: 'A' }]))
    const first = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(first.ok, true)
    assert.equal(first.skipped, false)

    const second = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(second.ok, true)
    assert.equal(second.skipped, true)
    assert.equal(second.reason, 'already-migrated')
  })

  it('does not delete legacy localStorage entries', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([{ id: 'cf-1', customerName: 'A' }]))
    await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(local.getItem(LEGACY_KEYS.customerFiles), JSON.stringify([{ id: 'cf-1', customerName: 'A' }]))
  })

  it('reports counts of legacy keys it intentionally skips', async () => {
    local.setItem(LEGACY_KEYS.binderPageIndex, JSON.stringify([{ id: 'p1', text: 'x' }, { id: 'p2', text: 'y' }]))
    local.setItem(LEGACY_KEYS.showroomDisplay, JSON.stringify([{ id: 'd1' }]))
    const result = await migrateLegacyLocalStorage(storage, { localStorageRef: local })
    assert.equal(result.summary.skipped.binderPageIndex, 2)
    assert.equal(result.summary.skipped.showroomDisplay, 1)
  })

  it('records a migration meta marker with completedAt and summary', async () => {
    local.setItem(LEGACY_KEYS.customerFiles, JSON.stringify([{ id: 'cf-1', customerName: 'A' }]))
    await migrateLegacyLocalStorage(storage, {
      localStorageRef: local,
      now: new Date('2026-05-07T10:00:00Z'),
    })
    const meta = await storage.getMeta(MIGRATION_META_KEY)
    assert.equal(meta.data.completed, true)
    assert.equal(meta.data.completedAt, '2026-05-07T10:00:00.000Z')
    assert.equal(meta.data.summary.customerFiles, 1)
  })

  it('returns ok:false when no localStorage is available', async () => {
    const result = await migrateLegacyLocalStorage(storage, { localStorageRef: null })
    assert.equal(result.ok, false)
    assert.match(result.errors[0], /localStorage unavailable/)
  })
})
