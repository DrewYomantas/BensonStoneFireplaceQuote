import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOMER_GOALS,
  VISIT_TYPES,
  buildStartVisitCustomerFile,
  deriveNextBestMove,
  deriveStartVisitWarnings,
  normalizeStartVisitSeed,
} from './startVisitCustomerFile.js'
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
