import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  saveCustomerFileDurable,
  getCustomerFileDurable,
} from './customerFileDurable.js'
import { acknowledgeZcGasInsertOnFile } from './zcGasInsertAck.js'
import { evaluateFieldRules } from './fieldRules.js'
import { FIELD_RULE_IDS } from '../config/fieldRules.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

function findFinding(result, id) {
  return result.findings.find((f) => f.id === id) || null
}

describe('acknowledgeZcGasInsertOnFile', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('writes ack keys to the durable customer file', async () => {
    await saveCustomerFileDurable(storage, {
      id: 'cf-1',
      customerName: 'Lens Ack',
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Customer wants a gas insert in the existing prefab.',
    })
    const updated = await acknowledgeZcGasInsertOnFile({
      storage,
      fileId: 'cf-1',
      actor: 'Drew',
      now: new Date('2026-05-08T15:00:00Z'),
    })
    assert.equal(updated.zcGasInsertAcknowledgedAt, '2026-05-08T15:00:00.000Z')
    assert.equal(updated.zcGasInsertAcknowledgedBy, 'Drew')

    const fetched = await getCustomerFileDurable(storage, 'cf-1')
    assert.equal(fetched.zcGasInsertAcknowledgedAt, '2026-05-08T15:00:00.000Z')
  })

  it('flips the rule from triggered to cleared after ack', async () => {
    await saveCustomerFileDurable(storage, {
      id: 'cf-2',
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert path discussed.',
    })
    const beforeRow = await getCustomerFileDurable(storage, 'cf-2')
    const before = evaluateFieldRules(beforeRow)
    assert.equal(findFinding(before, FIELD_RULE_IDS.zcGasInsertAck).status, 'triggered')

    const updated = await acknowledgeZcGasInsertOnFile({
      storage, fileId: 'cf-2', actor: 'Drew',
    })
    const after = evaluateFieldRules(updated)
    assert.equal(findFinding(after, FIELD_RULE_IDS.zcGasInsertAck).status, 'cleared')
  })

  it('merges Lens patch in the same write so unsaved fields are preserved', async () => {
    await saveCustomerFileDurable(storage, {
      id: 'cf-3',
      customerName: 'Drew',
      lensSetupType: 'unknown',
    })
    const lensPatch = {
      lensSetupType: 'zero-clearance-metal-fireplace',
      lensSetupTypeSource: 'verified',
      lensSalespersonNotes: 'Customer wants a gas insert. Confirmed in showroom.',
    }
    const updated = await acknowledgeZcGasInsertOnFile({
      storage,
      fileId: 'cf-3',
      actor: 'Drew',
      extraPatch: lensPatch,
    })
    assert.equal(updated.lensSetupType, 'zero-clearance-metal-fireplace')
    assert.equal(updated.lensSetupTypeSource, 'verified')
    assert.equal(updated.lensSalespersonNotes, 'Customer wants a gas insert. Confirmed in showroom.')
    assert.ok(updated.zcGasInsertAcknowledgedAt)
    assert.equal(updated.zcGasInsertAcknowledgedBy, 'Drew')
  })

  it('strips sensitive keys from extraPatch before write', async () => {
    await saveCustomerFileDurable(storage, { id: 'cf-4', customerName: 'Audit' })
    const updated = await acknowledgeZcGasInsertOnFile({
      storage,
      fileId: 'cf-4',
      actor: 'Drew',
      extraPatch: {
        lensSetupType: 'zero-clearance-metal-fireplace',
        cost: 9999,
        margin: 0.4,
        buyPrice: 1,
        rawOcr: 'redacted',
        bistrackConfidence: 0.7,
      },
    })
    assert.equal(updated.lensSetupType, 'zero-clearance-metal-fireplace')
    for (const k of ['cost', 'margin', 'buyPrice', 'rawOcr', 'bistrackConfidence']) {
      assert.equal(k in updated, false, `${k} leaked`)
    }
  })

  it('throws if fileId is missing — caller should not mark cleared on failure', async () => {
    await assert.rejects(() => acknowledgeZcGasInsertOnFile({ storage, fileId: '' }))
  })

  it('throws if storage is missing', async () => {
    await assert.rejects(() => acknowledgeZcGasInsertOnFile({ fileId: 'cf-x' }))
  })

  it('returns null when fileId does not exist (no rule clearing)', async () => {
    const updated = await acknowledgeZcGasInsertOnFile({
      storage, fileId: 'cf-nope', actor: 'Drew',
    })
    assert.equal(updated, null)
  })

  it('Customer File ack path (no extraPatch) still works', async () => {
    await saveCustomerFileDurable(storage, {
      id: 'cf-5',
      customerName: 'CF Path',
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert into the existing prefab.',
    })
    const updated = await acknowledgeZcGasInsertOnFile({
      storage, fileId: 'cf-5', actor: 'CF Path',
    })
    assert.ok(updated.zcGasInsertAcknowledgedAt)
    const result = evaluateFieldRules(updated)
    assert.equal(findFinding(result, FIELD_RULE_IDS.zcGasInsertAck).status, 'cleared')
  })
})
