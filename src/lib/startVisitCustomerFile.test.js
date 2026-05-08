import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOMER_GOALS,
  VISIT_TYPES,
  buildStartVisitCustomerFile,
  deriveNextBestMove,
  deriveStartVisitWarnings,
  normalizeStartVisitSeed,
  mergeStartVisitIntoCustomerFile,
  START_VISIT_MERGE_FIELDS,
} from './startVisitCustomerFile.js'
import { submitStartVisitDraft } from './startVisitDraft.js'
import { sanitizeCustomerFile } from './customerFile.js'
import {
  createCustomerFileDurable,
  saveCustomerFileDurable,
  getCustomerFileDurable,
} from './customerFileDurable.js'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'

const SENSITIVE_FIELDS = [
  'cost',
  'averageCost',
  'buyPrice',
  'margin',
  'marginPercent',
  'supplierTotal',
  'supplierHistory',
  'rawOcr',
  'rawPdf',
  'bistrackConfidence',
  'fuzzyMatchConfidence',
  'ocrConfidence',
  'salesRank',
  'productRank',
]

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('startVisitCustomerFile — normalizeStartVisitSeed', () => {
  it('maps the public seed shape into known keys', () => {
    const seed = normalizeStartVisitSeed({
      customerName: '  Anna Orlinska  ',
      phone: '815-555-0101',
      email: 'anna@example.com',
      address: '123 Maple St, Rockford IL',
      visitType: 'walk-in',
      goal: 'more-heat',
      currentSetup: 'Old wood-burning insert, smoky',
      repNotes: 'Wants quiet operation',
    })
    assert.equal(seed.customerName, 'Anna Orlinska')
    assert.equal(seed.customerPhone, '815-555-0101')
    assert.equal(seed.customerEmail, 'anna@example.com')
    assert.equal(seed.projectAddress, '123 Maple St, Rockford IL')
    assert.equal(seed.visitType, 'walk-in')
    assert.equal(seed.customerGoal, 'more-heat')
    assert.equal(seed.currentSetupNote, 'Old wood-burning insert, smoky')
    assert.equal(seed.salespersonNotes, 'Wants quiet operation')
  })

  it('falls back to unknown for unrecognized enums', () => {
    const seed = normalizeStartVisitSeed({ visitType: 'spaceship', goal: 'time-travel' })
    assert.equal(seed.visitType, 'unknown')
    assert.equal(seed.customerGoal, 'unknown')
  })

  it('returns a safe shape with no inputs', () => {
    const seed = normalizeStartVisitSeed()
    assert.equal(seed.customerName, '')
    assert.equal(seed.customerPhone, '')
    assert.equal(seed.visitType, 'unknown')
    assert.equal(seed.customerGoal, 'unknown')
  })

  it('strips sensitive keys before mapping', () => {
    const raw = { customerName: 'X' }
    for (const k of SENSITIVE_FIELDS) raw[k] = 'leak'
    const seed = normalizeStartVisitSeed(raw)
    for (const k of SENSITIVE_FIELDS) {
      assert.equal(k in seed, false, `${k} must not appear on normalized seed`)
    }
  })
})

describe('startVisitCustomerFile — warnings', () => {
  it('flags every gap when the seed is empty', () => {
    const seed = normalizeStartVisitSeed()
    const warnings = deriveStartVisitWarnings(seed)
    const codes = warnings.map((w) => w.code)
    assert.ok(codes.includes('missing-customer-name'))
    assert.ok(codes.includes('missing-contact'))
    assert.ok(codes.includes('missing-current-setup'))
    assert.ok(codes.includes('unclear-goal'))
    assert.ok(codes.includes('unknown-visit-type'))
  })

  it('returns no warnings when all expected fields are captured', () => {
    const seed = normalizeStartVisitSeed({
      customerName: 'Anna',
      phone: '815-555-0101',
      visitType: 'walk-in',
      goal: 'more-heat',
      currentSetup: 'Wood insert',
    })
    assert.deepEqual(deriveStartVisitWarnings(seed), [])
  })

  it('email alone is enough to clear missing-contact', () => {
    const seed = normalizeStartVisitSeed({
      customerName: 'Anna',
      email: 'a@b.com',
      visitType: 'walk-in',
      goal: 'more-heat',
      currentSetup: 'X',
    })
    const codes = deriveStartVisitWarnings(seed).map((w) => w.code)
    assert.equal(codes.includes('missing-contact'), false)
  })
})

describe('startVisitCustomerFile — nextBestMove', () => {
  it('asks for name first when missing', () => {
    const seed = normalizeStartVisitSeed({})
    assert.equal(deriveNextBestMove(seed).code, 'capture-name')
  })
  it('asks for contact when name is set but contact is not', () => {
    const seed = normalizeStartVisitSeed({ customerName: 'Anna' })
    assert.equal(deriveNextBestMove(seed).code, 'capture-contact')
  })
  it('asks for goal when basics are captured', () => {
    const seed = normalizeStartVisitSeed({ customerName: 'Anna', phone: '1' })
    assert.equal(deriveNextBestMove(seed).code, 'capture-goal')
  })
  it('asks for current setup when goal is set', () => {
    const seed = normalizeStartVisitSeed({
      customerName: 'Anna', phone: '1', goal: 'more-heat',
    })
    assert.equal(deriveNextBestMove(seed).code, 'capture-current-setup')
  })
  it('points to setup+goal lens when everything is captured', () => {
    const seed = normalizeStartVisitSeed({
      customerName: 'Anna', phone: '1', goal: 'more-heat', currentSetup: 'Wood insert',
    })
    assert.equal(deriveNextBestMove(seed).code, 'open-setup-goal-lens')
  })
})

describe('startVisitCustomerFile — buildStartVisitCustomerFile', () => {
  it('builds a draft compatible with sanitizeCustomerFile', () => {
    const { draft } = buildStartVisitCustomerFile({
      customerName: 'Anna',
      phone: '815-555-0101',
      email: 'a@b.com',
      address: '123 Maple',
      visitType: 'walk-in',
      goal: 'more-heat',
      currentSetup: 'Old wood insert',
      repNotes: 'Quiet operation desired',
    }, new Date('2026-05-07T12:00:00Z'))

    assert.equal(draft.customerName, 'Anna')
    assert.equal(draft.customerPhone, '815-555-0101')
    assert.equal(draft.customerEmail, 'a@b.com')
    assert.equal(draft.projectAddress, '123 Maple')
    assert.equal(draft.existingNotes, 'Old wood insert')
    assert.equal(draft.customerGoal, 'more-heat')
    assert.match(draft.goalNotes, /Visit type: walk-in/)
    assert.match(draft.goalNotes, /Quiet operation desired/)
    assert.equal(draft.visitedAt, '2026-05-07T12:00:00.000Z')
    assert.match(draft.id, /^cf-anna/)
    // sanitize round-trip is a no-op
    assert.deepEqual(sanitizeCustomerFile(draft), draft)
  })

  it('does not crash when seed is empty or partial', () => {
    const { draft, status, warnings } = buildStartVisitCustomerFile()
    assert.equal(draft.customerName, '')
    assert.equal(status, 'draft')
    assert.ok(warnings.length > 0)
  })

  it('leaves customerGoal blank when goal is unknown (does not write the literal "unknown")', () => {
    const { draft } = buildStartVisitCustomerFile({ customerName: 'A', phone: '1' })
    assert.equal(draft.customerGoal, '')
  })

  it('strips sensitive seed keys; none survive into the draft', () => {
    const raw = { customerName: 'A', phone: '1' }
    for (const k of SENSITIVE_FIELDS) raw[k] = 'leak'
    const { draft } = buildStartVisitCustomerFile(raw)
    for (const k of SENSITIVE_FIELDS) {
      assert.equal(k in draft, false, `${k} must not appear on customer-file draft`)
    }
  })

  it('status becomes visit-started once a name is captured', () => {
    const { status: noName } = buildStartVisitCustomerFile({ phone: '1' })
    assert.equal(noName, 'draft')
    const { status: named } = buildStartVisitCustomerFile({ customerName: 'A' })
    assert.equal(named, 'visit-started')
  })

  it('exposes the chosen visit type and goal alongside the draft', () => {
    const result = buildStartVisitCustomerFile({
      customerName: 'A', visitType: 'phone', goal: 'replace-existing',
    })
    assert.equal(result.visitType, 'phone')
    assert.equal(result.customerGoal, 'replace-existing')
    assert.ok(VISIT_TYPES.includes(result.visitType))
    assert.ok(CUSTOMER_GOALS.includes(result.customerGoal))
  })

  it('draft round-trips through saveCustomerFileDurable without losing data', async () => {
    const storage = makeStorage()
    const { draft } = buildStartVisitCustomerFile({
      customerName: 'Persisted', phone: '1', goal: 'more-heat',
    }, new Date('2026-05-07T12:00:00Z'))
    const saved = await saveCustomerFileDurable(storage, draft, new Date('2026-05-07T12:00:00Z'))
    const fetched = await getCustomerFileDurable(storage, saved.id)
    assert.equal(fetched.customerName, 'Persisted')
    assert.equal(fetched.customerGoal, 'more-heat')
  })

  it('createCustomerFileDurable accepts the draft shape', async () => {
    const storage = makeStorage()
    const { draft } = buildStartVisitCustomerFile({ customerName: 'Walk-in' })
    const created = await createCustomerFileDurable(storage, draft)
    assert.equal(created.customerName, 'Walk-in')
    assert.match(created.id, /^cf-/)
  })
})

describe('startVisitCustomerFile — mergeStartVisitIntoCustomerFile', () => {
  function existingWithLensState() {
    // A customer file that has already been through Start Visit + Lens. Set
    // every lens-prefixed field to a real value so the test fails loudly if
    // a re-submit blanks any of them.
    return {
      id: 'cf-jordan-555',
      createdAt: '2026-05-01T10:00:00Z',
      customerName: 'Jordan',
      customerPhone: '555-0001',
      customerEmail: 'jordan@example.com',
      projectAddress: '12 Birch',
      existingNotes: 'Masonry, brick, open hearth',
      customerGoal: 'more-heat',
      goalNotes: 'Visit type: walk-in',
      lensSetupType: 'gas-insert',
      lensSetupTypeSource: 'verified',
      lensDesiredOutcome: 'more-heat',
      lensDesiredOutcomeSource: 'said',
      lensFuelGasPresent: 'yes',
      lensFuelGasPresentSource: 'verified',
      lensVenting: 'masonry-chimney',
      lensVentingSource: 'verified',
      lensConstructionFlags: ['stone-or-masonry-work'],
      lensSalespersonNotes: 'wife wants cleaner look',
      lensUpdatedAt: '2026-05-02T11:00:00Z',
    }
  }

  function builtDraft(seed) {
    return buildStartVisitCustomerFile(seed, new Date('2026-05-08T15:00:00Z')).draft
  }

  it('blank re-submit preserves every lens-prefixed field', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({ customerName: 'Jordan', phone: '555-0001' })
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.lensSetupType, 'gas-insert')
    assert.equal(merged.lensSetupTypeSource, 'verified')
    assert.equal(merged.lensDesiredOutcome, 'more-heat')
    assert.equal(merged.lensDesiredOutcomeSource, 'said')
    assert.equal(merged.lensFuelGasPresent, 'yes')
    assert.equal(merged.lensVenting, 'masonry-chimney')
    assert.deepEqual(merged.lensConstructionFlags, ['stone-or-masonry-work'])
    assert.equal(merged.lensSalespersonNotes, 'wife wants cleaner look')
    assert.equal(merged.lensUpdatedAt, '2026-05-02T11:00:00Z')
  })

  it('blank existing setup note does not erase a real one', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({ customerName: 'Jordan', phone: '555-0001' })
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.existingNotes, 'Masonry, brick, open hearth')
  })

  it('unknown / blank goal does not overwrite a real customerGoal', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({ customerName: 'Jordan', phone: '555-0001' })
    // buildStartVisitCustomerFile maps an unspecified goal to '' before save.
    assert.equal(draft.customerGoal, '')
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.customerGoal, 'more-heat')
  })

  it('non-empty start visit fields update safely', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({
      customerName: 'Jordan Updated',
      phone: '555-0002',
      email: 'jordan.new@example.com',
      address: '14 Birch',
      currentSetup: 'New scope note',
      goal: 'easier-operation',
    })
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.customerName, 'Jordan Updated')
    assert.equal(merged.customerPhone, '555-0002')
    assert.equal(merged.customerEmail, 'jordan.new@example.com')
    assert.equal(merged.projectAddress, '14 Birch')
    assert.equal(merged.existingNotes, 'New scope note')
    assert.equal(merged.customerGoal, 'easier-operation')
    // Lens fields still preserved.
    assert.equal(merged.lensSetupType, 'gas-insert')
  })

  it('preserves existing id and createdAt', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({ customerName: 'Jordan', phone: '555-0001' })
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.id, 'cf-jordan-555')
    assert.equal(merged.createdAt, '2026-05-01T10:00:00Z')
  })

  it('only fields in START_VISIT_MERGE_FIELDS are eligible to overwrite', () => {
    const existing = { ...existingWithLensState(), notes: [{ id: 'n1', body: 'kept' }] }
    // A pretend-malicious draft that tries to bypass the whitelist. None of
    // these keys are in START_VISIT_MERGE_FIELDS, so they must be ignored.
    const draft = {
      ...builtDraft({ customerName: 'Jordan', phone: '555-0001' }),
      lensSetupType: 'electric-fireplace',
      lensSetupTypeSource: 'manual',
      handoffNotes: 'overwrite attempt',
      notes: [],
    }
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.lensSetupType, 'gas-insert')
    assert.equal(merged.lensSetupTypeSource, 'verified')
    assert.equal(merged.handoffNotes, '')
    assert.deepEqual(merged.notes, [{ id: 'n1', body: 'kept' }])
  })

  it('strips sensitive keys from incoming Start Visit data', () => {
    const existing = existingWithLensState()
    const draft = {
      ...builtDraft({ customerName: 'Jordan', phone: '555-0001' }),
      cost: 999,
      buyPrice: 'leak',
      rawOcr: 'leak',
      bistrackConfidence: 0.99,
    }
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal('cost' in merged, false)
    assert.equal('buyPrice' in merged, false)
    assert.equal('rawOcr' in merged, false)
    assert.equal('bistrackConfidence' in merged, false)
  })

  it('whitespace-only string is treated as blank', () => {
    const existing = existingWithLensState()
    const draft = builtDraft({ customerName: '   ', phone: '   ', currentSetup: '   ' })
    const merged = mergeStartVisitIntoCustomerFile(existing, draft)
    assert.equal(merged.customerName, 'Jordan')
    assert.equal(merged.customerPhone, '555-0001')
    assert.equal(merged.existingNotes, 'Masonry, brick, open hearth')
  })

  it('the START_VISIT_MERGE_FIELDS whitelist excludes every lens-prefixed key', () => {
    for (const field of START_VISIT_MERGE_FIELDS) {
      assert.equal(field.startsWith('lens'), false, `${field} must not be in the whitelist`)
    }
  })
})

describe('startVisitCustomerFile — submitStartVisitDraft round-trip', () => {
  it('first submit creates the file like before', async () => {
    const storage = makeStorage()
    const result = await submitStartVisitDraft(storage, {
      customerName: 'Brand New', phone: '555-9000', goal: 'more-heat',
    })
    assert.equal(result.mergedExisting, false)
    assert.equal(result.customerFile.customerName, 'Brand New')
    assert.equal(result.customerFile.customerGoal, 'more-heat')
  })

  it('re-submit with same name+phone preserves Lens facts', async () => {
    const storage = makeStorage()
    const first = await submitStartVisitDraft(storage, {
      customerName: 'Repeater', phone: '555-7777', goal: 'more-heat',
      currentSetup: 'masonry brick',
    })
    // Simulate Lens save: write lens-prefixed fields onto the existing file.
    await saveCustomerFileDurable(storage, {
      ...(await getCustomerFileDurable(storage, first.customerFile.id)),
      lensSetupType: 'gas-insert',
      lensSetupTypeSource: 'verified',
      lensDesiredOutcome: 'more-heat',
      lensDesiredOutcomeSource: 'said',
      lensUpdatedAt: '2026-05-02T11:00:00Z',
    })

    // Now re-submit Start Visit with blanks (the bug repro).
    const again = await submitStartVisitDraft(storage, {
      customerName: 'Repeater', phone: '555-7777',
    })
    assert.equal(again.mergedExisting, true)
    const after = await getCustomerFileDurable(storage, again.customerFile.id)
    assert.equal(after.lensSetupType, 'gas-insert',
      'lens setup must survive a blank re-submit')
    assert.equal(after.lensSetupTypeSource, 'verified',
      'lens source must survive a blank re-submit')
    assert.equal(after.lensDesiredOutcome, 'more-heat')
    assert.equal(after.lensDesiredOutcomeSource, 'said')
    assert.equal(after.existingNotes, 'masonry brick',
      'a real captured scope note must not be erased by a blank re-submit')
  })
})
