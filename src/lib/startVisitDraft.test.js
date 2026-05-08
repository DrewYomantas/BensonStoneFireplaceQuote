import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import { STORE_NAMES } from './salesOsStorageSchema.js'
import {
  DRAFT_ID,
  emptyDraft,
  loadStartVisitDraft,
  saveStartVisitDraft,
  clearStartVisitDraft,
  submitStartVisitDraft,
} from './startVisitDraft.js'
import { getCustomerFileDurable } from './customerFileDurable.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('startVisitDraft — round-trip', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('emptyDraft has every seed field as a string', () => {
    const d = emptyDraft()
    assert.equal(d.id, DRAFT_ID)
    assert.equal(d.kind, 'start-visit')
    for (const k of ['customerName', 'customerPhone', 'customerEmail', 'projectAddress', 'visitType', 'customerGoal', 'currentSetupNote', 'salespersonNotes']) {
      assert.equal(d[k], '')
    }
  })

  it('saveStartVisitDraft persists and loadStartVisitDraft restores', async () => {
    await saveStartVisitDraft(storage, {
      customerName: 'Anna',
      customerPhone: '815-555-0101',
      visitType: 'walk-in',
      customerGoal: 'more-heat',
    })
    const loaded = await loadStartVisitDraft(storage)
    assert.equal(loaded.id, DRAFT_ID)
    assert.equal(loaded.customerName, 'Anna')
    assert.equal(loaded.customerPhone, '815-555-0101')
    assert.equal(loaded.visitType, 'walk-in')
    assert.equal(loaded.customerGoal, 'more-heat')
  })

  it('partial draft survives a fresh load (reload simulation)', async () => {
    await saveStartVisitDraft(storage, { customerName: 'Half-typed' })
    const reloaded = await loadStartVisitDraft(storage)
    assert.equal(reloaded.customerName, 'Half-typed')
    assert.equal(reloaded.customerPhone, '')
  })

  it('loadStartVisitDraft returns emptyDraft when nothing persisted', async () => {
    const loaded = await loadStartVisitDraft(storage)
    assert.deepEqual(loaded, emptyDraft())
  })

  it('clearStartVisitDraft removes the row', async () => {
    await saveStartVisitDraft(storage, { customerName: 'X' })
    await clearStartVisitDraft(storage)
    const after = await loadStartVisitDraft(storage)
    assert.equal(after.customerName, '')
  })

  it('sanitize strips sensitive keys before saving', async () => {
    await saveStartVisitDraft(storage, {
      customerName: 'Z',
      cost: 1000,
      margin: 0.4,
      buyPrice: 500,
      bistrackConfidence: '95%',
      rawOcr: 'leak',
    })
    const row = (await storage.getById(STORE_NAMES.visitSessions, DRAFT_ID)).data
    for (const k of ['cost', 'margin', 'buyPrice', 'bistrackConfidence', 'rawOcr']) {
      assert.equal(k in row, false, `${k} must not be persisted on the visit draft`)
    }
  })
})

describe('startVisitDraft — submit creates durable customer file', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('submit persists a customer file retrievable by id', async () => {
    const result = await submitStartVisitDraft(storage, {
      customerName: 'Anna Orlinska',
      customerPhone: '815-555-0101',
      customerGoal: 'more-heat',
      currentSetupNote: 'Old wood insert',
      visitType: 'walk-in',
    })
    assert.match(result.customerFile.id, /^cf-anna/)
    const fetched = await getCustomerFileDurable(storage, result.customerFile.id)
    assert.equal(fetched.customerName, 'Anna Orlinska')
    assert.equal(fetched.customerGoal, 'more-heat')
    assert.equal(fetched.existingNotes, 'Old wood insert')
  })

  it('submit returns warnings + nextBestMove from the builder', async () => {
    const result = await submitStartVisitDraft(storage, { customerName: 'Solo' })
    assert.ok(Array.isArray(result.warnings))
    assert.ok(result.nextBestMove && result.nextBestMove.code)
  })
})
