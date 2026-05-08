import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeQuotePrepLine,
  normalizeQuotePrepLines,
  quotePrepDraftFromCustomerFile,
  buildCustomerFilePatchFromQuotePrep,
  addQuotePrepLine,
  updateQuotePrepLine,
  removeQuotePrepLine,
  quotePrepLineSearchText,
  buildQuotePrepEngineInput,
  LINE_SAFE_KEYS,
} from './quotePrepDraft.js'
import { evaluateFieldRules } from './fieldRules.js'
import {
  createMemoryEngine,
  createSalesOsStorage,
} from './salesOsStorage.js'
import {
  saveCustomerFileDurable,
  getCustomerFileDurable,
} from './customerFileDurable.js'

describe('quotePrepDraft — normalize', () => {
  it('preserves all safe fields and generates a stable id when missing', () => {
    const line = normalizeQuotePrepLine({
      name: 'Whisper Flex 12',
      description: 'Vent-free flex line',
      brand: 'Empire',
      partNumber: 'T1009898-12',
      category: 'gas-flex',
      quantity: '1',
      customerSafeNotes: 'Required with vent-free log set.',
      internalPrepNote: 'Reminder for shop.',
    })
    assert.ok(line.id.startsWith('qpl-'))
    assert.equal(line.name, 'Whisper Flex 12')
    assert.equal(line.partNumber, 'T1009898-12')
    assert.equal(line.brand, 'Empire')
    assert.equal(line.quantity, '1')
    assert.equal(line.customerSafeNotes, 'Required with vent-free log set.')
    assert.equal(line.internalPrepNote, 'Reminder for shop.')
    for (const k of LINE_SAFE_KEYS) {
      assert.ok(k in line, `missing safe key: ${k}`)
    }
  })

  it('strips banned sensitive keys and any unknown fields', () => {
    const line = normalizeQuotePrepLine({
      name: 'Cosmo I35',
      partNumber: 'COS-I35',
      cost: 1234,
      margin: 0.42,
      buyPrice: 999,
      supplierTotal: 4321,
      rawOcr: 'noisy',
      rawPdf: 'bytes',
      bistrackConfidence: '0.7',
      fuzzyMatchConfidence: '0.5',
      ocrConfidence: '0.9',
      salesRank: 1,
      productRank: 2,
      somethingElse: 'reject',
    })
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'rawOcr', 'rawPdf',
      'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
      'salesRank', 'productRank', 'somethingElse',
    ]) {
      assert.equal(k in line, false, `leaked key: ${k}`)
    }
    assert.equal(line.name, 'Cosmo I35')
    assert.equal(line.partNumber, 'COS-I35')
  })

  it('empty / null / non-array input produces safe empty line state', () => {
    assert.deepEqual(quotePrepDraftFromCustomerFile({}), { lines: [], notes: '' })
    assert.deepEqual(quotePrepDraftFromCustomerFile(null), { lines: [], notes: '' })
    assert.deepEqual(normalizeQuotePrepLines(null), [])
    assert.deepEqual(normalizeQuotePrepLines('nope'), [])
    const line = normalizeQuotePrepLine({})
    for (const k of LINE_SAFE_KEYS) {
      if (k === 'id') {
        assert.ok(line.id.startsWith('qpl-'))
      } else {
        assert.equal(line[k], '')
      }
    }
  })

  it('add / update / remove preserve other lines and id stability', () => {
    let lines = []
    lines = addQuotePrepLine(lines, { name: 'A', partNumber: 'A-1' })
    lines = addQuotePrepLine(lines, { name: 'B', partNumber: 'B-1' })
    assert.equal(lines.length, 2)
    const targetId = lines[0].id
    lines = updateQuotePrepLine(lines, targetId, { quantity: '3' })
    assert.equal(lines[0].id, targetId, 'id must stay stable across updates')
    assert.equal(lines[0].quantity, '3')
    assert.equal(lines[1].name, 'B')
    lines = removeQuotePrepLine(lines, targetId)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].name, 'B')
  })

  it('search text combines name, description, brand, part number, category, and notes', () => {
    const text = quotePrepLineSearchText({
      name: 'Whisper Flex',
      description: 'flex line',
      brand: 'Empire',
      partNumber: 'T1009898-16',
      category: 'gas-flex',
      customerSafeNotes: 'Required with vent-free log set.',
      internalPrepNote: 'Pull from shop.',
    })
    for (const needle of [
      'Whisper Flex', 'flex line', 'Empire',
      'T1009898-16', 'gas-flex',
      'Required with vent-free log set.', 'Pull from shop.',
    ]) {
      assert.ok(text.includes(needle), `missing in search text: ${needle}`)
    }
  })
})

describe('quotePrepDraft — buildQuotePrepEngineInput + Field Rules', () => {
  it('Whisper Flex stays triggered when WMH vent-free context exists without T1009898-12/16', () => {
    const file = {
      lensSetupType: 'masonry-fireplace',
      existingNotes: 'Customer wants White Mountain Hearth vent-free log set in their masonry fireplace.',
    }
    const draft = {
      lines: [
        { name: 'Empire log set', description: 'vent-free logs', brand: 'WMH', partNumber: 'WMHLOG-24' },
      ],
      notes: '',
    }
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const result = evaluateFieldRules(engineFile, { discussionText })
    const wf = result.findings.find((f) => f.id === 'whisper-flex')
    assert.ok(wf, 'whisper-flex finding should exist')
    assert.equal(wf.status, 'triggered')
  })

  it('Whisper Flex flips satisfied when a line item carries T1009898-12', () => {
    const file = {
      lensSetupType: 'masonry-fireplace',
      existingNotes: 'WMH vent-free log set requested.',
    }
    const draft = {
      lines: [
        { name: 'Whisper Flex 12', partNumber: 'T1009898-12' },
      ],
      notes: '',
    }
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const result = evaluateFieldRules(engineFile, { discussionText })
    const wf = result.findings.find((f) => f.id === 'whisper-flex')
    assert.ok(wf)
    assert.equal(wf.status, 'satisfied')
  })

  it('ZC acknowledgement state on the file is respected from the Quote / Prep input', () => {
    const file = {
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Considering a gas insert.',
      zcGasInsertAcknowledgedAt: '2026-05-08T12:00:00Z',
      zcGasInsertAcknowledgedBy: 'Drew',
    }
    const draft = { lines: [{ name: 'Some gas insert' }], notes: '' }
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const result = evaluateFieldRules(engineFile, { discussionText })
    const ack = result.findings.find((f) => f.id === 'zc-gas-insert-ack')
    assert.ok(ack)
    assert.equal(ack.status, 'cleared')
  })

  it('missing optional file/lens fields do not crash', () => {
    const { file, discussionText } = buildQuotePrepEngineInput(undefined, undefined)
    const result = evaluateFieldRules(file, { discussionText })
    assert.ok(Array.isArray(result.findings))
  })
})

describe('quotePrepDraft — durable round trip', () => {
  it('save → reload preserves quote prep lines + notes via memory storage', async () => {
    const storage = createSalesOsStorage({ engine: createMemoryEngine() })
    const baseFile = {
      id: 'cf-test-quote-prep',
      customerName: 'Test Customer',
      lensSetupType: 'masonry-fireplace',
    }
    const draft = {
      lines: [
        { name: 'Whisper Flex 12', partNumber: 'T1009898-12' },
        { name: 'Trim kit', description: 'matte black', brand: 'Empire' },
      ],
      notes: 'Pull from showroom.',
    }
    const patch = buildCustomerFilePatchFromQuotePrep(draft, new Date('2026-05-08T15:00:00Z'))
    await saveCustomerFileDurable(storage, { ...baseFile, ...patch })
    const reloaded = await getCustomerFileDurable(storage, baseFile.id)
    assert.ok(reloaded)
    assert.equal(reloaded.quotePrepNotes, 'Pull from showroom.')
    assert.equal(reloaded.quotePrepUpdatedAt, '2026-05-08T15:00:00.000Z')
    assert.equal(reloaded.quotePrepLines.length, 2)
    assert.equal(reloaded.quotePrepLines[0].partNumber, 'T1009898-12')
    assert.equal(reloaded.quotePrepLines[1].brand, 'Empire')
    // After reload + draft project, normalize keeps structure stable.
    const reDraft = quotePrepDraftFromCustomerFile(reloaded)
    assert.equal(reDraft.lines.length, 2)
    assert.equal(reDraft.notes, 'Pull from showroom.')
  })

  it('build patch strips banned keys baked into a poisoned line', () => {
    const draft = {
      lines: [
        { name: 'Bad line', cost: 9999, margin: 0.5, partNumber: 'X-1' },
      ],
      notes: '',
    }
    const patch = buildCustomerFilePatchFromQuotePrep(draft, new Date('2026-05-08T15:00:00Z'))
    const line = patch.quotePrepLines[0]
    assert.equal('cost' in line, false)
    assert.equal('margin' in line, false)
    assert.equal(line.partNumber, 'X-1')
  })
})
