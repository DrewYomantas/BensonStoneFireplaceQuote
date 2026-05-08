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
  summarizeQuotePrepReview,
  LINE_SAFE_KEYS,
  SOURCE_BASIS_VALUES,
  REVIEW_STATUS_VALUES,
  REVIEW_FLAG_VALUES,
  DEFAULT_SOURCE_BASIS,
  DEFAULT_REVIEW_STATUS,
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
      if (k === 'id') assert.ok(line.id.startsWith('qpl-'))
      else if (k === 'sourceBasis') assert.equal(line.sourceBasis, DEFAULT_SOURCE_BASIS)
      else if (k === 'reviewStatus') assert.equal(line.reviewStatus, DEFAULT_REVIEW_STATUS)
      else if (k === 'reviewFlags') assert.deepEqual(line.reviewFlags, [])
      else assert.equal(line[k], '')
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

describe('quotePrepDraft — source basis + review state', () => {
  it('legacy PR 8 lines without review fields normalize to safe defaults', () => {
    const line = normalizeQuotePrepLine({ name: 'Old line', partNumber: 'X-1' })
    assert.equal(line.sourceBasis, DEFAULT_SOURCE_BASIS)
    assert.equal(line.reviewStatus, DEFAULT_REVIEW_STATUS)
    assert.deepEqual(line.reviewFlags, [])
    assert.equal(line.sourceNote, '')
    assert.equal(line.reviewedAt, '')
    assert.equal(line.reviewedBy, '')
  })

  it('preserves a valid source basis', () => {
    for (const basis of SOURCE_BASIS_VALUES) {
      const line = normalizeQuotePrepLine({ name: 'A', sourceBasis: basis })
      assert.equal(line.sourceBasis, basis)
    }
  })

  it('falls back to manual_entry on an invalid source basis', () => {
    const line = normalizeQuotePrepLine({ name: 'A', sourceBasis: 'totally-bogus' })
    assert.equal(line.sourceBasis, 'manual_entry')
  })

  it('preserves a valid review status', () => {
    for (const status of REVIEW_STATUS_VALUES) {
      const line = normalizeQuotePrepLine({ name: 'A', reviewStatus: status })
      assert.equal(line.reviewStatus, status)
    }
  })

  it('falls back to draft on an invalid review status', () => {
    const line = normalizeQuotePrepLine({ name: 'A', reviewStatus: 'fake-status' })
    assert.equal(line.reviewStatus, 'draft')
  })

  it('reviewFlags preserves only allowed safe flags and dedupes', () => {
    const line = normalizeQuotePrepLine({
      name: 'A',
      reviewFlags: [
        'sku_or_part_confirmed', 'sku_or_part_confirmed',
        'needs_measurement', 'fake-flag', '', null, 'cost',
      ],
    })
    assert.deepEqual(line.reviewFlags, ['sku_or_part_confirmed', 'needs_measurement'])
    for (const f of line.reviewFlags) {
      assert.ok(REVIEW_FLAG_VALUES.includes(f))
    }
  })

  it('strips banned sensitive keys including from poisoned source/review payloads', () => {
    const line = normalizeQuotePrepLine({
      name: 'A',
      sourceNote: 'fine note',
      sourceBasis: 'manual_entry',
      reviewStatus: 'reviewed_for_prep',
      reviewFlags: ['needs_measurement'],
      cost: 999,
      margin: 0.42,
      buyPrice: 50,
      supplierTotal: 100,
      bistrackConfidence: '0.9',
      ocrConfidence: '0.7',
      rawOcr: 'noise',
    })
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'bistrackConfidence', 'ocrConfidence', 'rawOcr',
    ]) {
      assert.equal(k in line, false)
    }
    assert.equal(line.sourceNote, 'fine note')
    assert.equal(line.sourceBasis, 'manual_entry')
    assert.equal(line.reviewStatus, 'reviewed_for_prep')
    assert.deepEqual(line.reviewFlags, ['needs_measurement'])
  })

  it('summary counts total / needsVerification / readyForBistrack / doNotUseYet', () => {
    const lines = [
      { name: 'a', reviewStatus: 'draft' },
      { name: 'b', reviewStatus: 'needs_verification' },
      { name: 'c', reviewStatus: 'needs_verification' },
      { name: 'd', reviewStatus: 'ready_for_bistrack' },
      { name: 'e', reviewStatus: 'do_not_use_yet' },
      { name: 'f', reviewStatus: 'reviewed_for_prep', sourceBasis: 'needs_source' },
    ]
    const sum = summarizeQuotePrepReview(lines)
    assert.equal(sum.total, 6)
    assert.equal(sum.needsVerification, 2)
    assert.equal(sum.readyForBistrack, 1)
    assert.equal(sum.doNotUseYet, 1)
    assert.equal(sum.draft, 1)
    assert.equal(sum.reviewedForPrep, 1)
    assert.equal(sum.needsSource, 1)
  })

  it('summary on empty / null input returns zeros without crashing', () => {
    assert.deepEqual(summarizeQuotePrepReview([]), {
      total: 0, needsVerification: 0, readyForBistrack: 0, doNotUseYet: 0,
      draft: 0, reviewedForPrep: 0, needsSource: 0,
    })
    assert.equal(summarizeQuotePrepReview(null).total, 0)
    assert.equal(summarizeQuotePrepReview(undefined).total, 0)
  })

  it('durable round trip preserves source/review fields via memory storage', async () => {
    const storage = createSalesOsStorage({ engine: createMemoryEngine() })
    const draft = {
      lines: [
        {
          name: 'Whisper Flex 12',
          partNumber: 'T1009898-12',
          sourceBasis: 'from_pricebook_or_manual',
          sourceNote: 'Empire price list',
          reviewStatus: 'ready_for_bistrack',
          reviewFlags: ['sku_or_part_confirmed', 'field_rule_checked'],
        },
        {
          name: 'TBD insert',
          sourceBasis: 'needs_source',
          reviewStatus: 'do_not_use_yet',
        },
      ],
      notes: 'Confirm flue with Liam.',
    }
    const patch = buildCustomerFilePatchFromQuotePrep(draft, new Date('2026-05-08T16:00:00Z'))
    await saveCustomerFileDurable(storage, { id: 'cf-prep-review', customerName: 'Test', ...patch })
    const reloaded = await getCustomerFileDurable(storage, 'cf-prep-review')
    const reDraft = quotePrepDraftFromCustomerFile(reloaded)
    assert.equal(reDraft.lines.length, 2)
    const [line0, line1] = reDraft.lines
    assert.equal(line0.sourceBasis, 'from_pricebook_or_manual')
    assert.equal(line0.sourceNote, 'Empire price list')
    assert.equal(line0.reviewStatus, 'ready_for_bistrack')
    assert.deepEqual(line0.reviewFlags, ['sku_or_part_confirmed', 'field_rule_checked'])
    assert.equal(line1.sourceBasis, 'needs_source')
    assert.equal(line1.reviewStatus, 'do_not_use_yet')
  })

  it('updateQuotePrepLine on review/source fields keeps id stable and other lines intact', () => {
    let lines = [
      normalizeQuotePrepLine({ name: 'A', partNumber: 'A1' }),
      normalizeQuotePrepLine({ name: 'B', partNumber: 'B1' }),
    ]
    const targetId = lines[0].id
    lines = updateQuotePrepLine(lines, targetId, {
      sourceBasis: 'from_lens',
      reviewStatus: 'needs_verification',
      reviewFlags: ['needs_measurement'],
    })
    assert.equal(lines[0].id, targetId)
    assert.equal(lines[0].sourceBasis, 'from_lens')
    assert.equal(lines[0].reviewStatus, 'needs_verification')
    assert.deepEqual(lines[0].reviewFlags, ['needs_measurement'])
    assert.equal(lines[1].name, 'B')
    assert.equal(lines[1].sourceBasis, 'manual_entry')
  })
})
