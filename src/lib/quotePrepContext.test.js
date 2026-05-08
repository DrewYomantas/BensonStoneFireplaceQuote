import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuotePrepContext } from './quotePrepContext.js'

// ---- Fixtures ---------------------------------------------------------------

function makeFile(overrides = {}) {
  return {
    id: 'cf-test-1',
    customerName: 'Helen Marsh',
    customerPhone: '555-1234',
    projectAddress: '412 Oak St, Rockford, IL',
    existingNotes: 'Prefab fireplace with open hearth.',
    customerGoal: 'Replace insert.',
    lensSetupType: 'zero-clearance-metal-fireplace',
    lensFuelGasPresent: 'yes',
    lensFuelElectricPresent: 'no',
    lensVenting: 'direct-vent',
    lensSalespersonNotes: 'Customer prefers a clean, simple look.',
    quotePrepLines: [
      {
        id: 'qpl-1',
        name: 'Gas Insert X45',
        description: 'Clean-face gas insert.',
        brand: 'Regency',
        partNumber: 'X45',
        category: 'gas-insert',
        quantity: '1',
        sourceBasis: 'from_bistrack_quote',
        reviewStatus: 'ready_for_bistrack',
        reviewFlags: [],
        evidenceNote: 'Per BisTrack quote 04-212, line 3.',
      },
    ],
    quotePrepNotes: 'Check flue size.',
    ...overrides,
  }
}

function makeActivity(fileId = 'cf-test-1') {
  return [
    {
      id: 'act-1',
      fileId,
      kind: 'visit_started',
      at: '2026-05-08T10:00:00.000Z',
      summary: 'Walk-in.',
    },
    {
      id: 'act-2',
      fileId,
      kind: 'quote_line_saved',
      at: '2026-05-08T11:00:00.000Z',
      summary: 'Quote / Prep saved.',
    },
    {
      id: 'act-3',
      fileId: 'cf-other',
      kind: 'lens_saved',
      at: '2026-05-08T11:30:00.000Z',
      summary: 'Different file.',
    },
  ]
}

function makeFollowUp(fileId = 'cf-test-1') {
  return {
    fileId,
    dueAt: '2026-05-15',
    note: 'Confirm flue size.',
    setAt: '2026-05-08T10:00:00.000Z',
  }
}

// ---- Tests ------------------------------------------------------------------

describe('buildQuotePrepContext — basic projection', () => {
  it('returns a frozen context object with all expected top-level keys', () => {
    const ctx = buildQuotePrepContext(makeFile(), makeActivity(), makeFollowUp(), {
      now: new Date('2026-05-08T12:00:00.000Z'),
    })
    assert.ok(typeof ctx === 'object')
    for (const key of ['customer', 'setup', 'lineReview', 'fieldRules', 'gate', 'activity', 'followUp', 'evidenceNotes', 'prepNotes']) {
      assert.ok(key in ctx, `missing key: ${key}`)
    }
  })

  it('projects customer name and contact correctly', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.equal(ctx.customer.name, 'Helen Marsh')
    assert.equal(ctx.customer.contact, '555-1234')
    assert.equal(ctx.customer.projectAddress, '412 Oak St, Rockford, IL')
  })

  it('projects setup facts from lens fields', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.ok(ctx.setup.setupTypeLabel.length > 0)
    assert.equal(ctx.setup.gasPresent, 'yes')
    assert.equal(ctx.setup.electricPresent, 'no')
    assert.equal(ctx.setup.existingNotes, 'Prefab fireplace with open hearth.')
    assert.equal(ctx.setup.salespersonNotes, 'Customer prefers a clean, simple look.')
  })

  it('projects line review counts from quotePrepLines', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.equal(ctx.lineReview.total, 1)
    assert.equal(ctx.lineReview.readyForBistrack, 1)
    assert.equal(ctx.lineReview.doNotUseYet, 0)
  })

  it('returns field rules result with counts shape', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.ok(typeof ctx.fieldRules.counts === 'object')
    assert.ok('triggered' in ctx.fieldRules.counts)
    assert.ok('cleared' in ctx.fieldRules.counts)
    assert.ok(Array.isArray(ctx.fieldRules.items))
  })

  it('returns gate status label without banned phrases', () => {
    const ctx = buildQuotePrepContext(makeFile())
    const label = ctx.gate.label.toLowerCase()
    assert.ok(!label.includes('ready to send'), 'banned phrase in gate label')
    assert.ok(!label.includes('proposal ready'), 'banned phrase in gate label')
    assert.ok(!label.includes('customer ready'), 'banned phrase in gate label')
    assert.ok(!label.includes('approved'), 'banned phrase in gate label')
  })

  it('returns prep notes from the customer file', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.equal(ctx.prepNotes, 'Check flue size.')
  })
})

describe('buildQuotePrepContext — activity section', () => {
  it('filters activity to the current fileId only', () => {
    const ctx = buildQuotePrepContext(makeFile(), makeActivity(), null, {
      now: new Date('2026-05-08T12:00:00.000Z'),
    })
    for (const ev of ctx.activity) {
      assert.equal(ev.fileId, undefined, 'fileId should not be surfaced')
      assert.ok(ev.kind)
    }
    // All three raw events: only 2 belong to cf-test-1
    assert.equal(ctx.activity.length, 2)
  })

  it('attaches kindLabel to each activity event', () => {
    const ctx = buildQuotePrepContext(makeFile(), makeActivity())
    for (const ev of ctx.activity) {
      assert.ok(ev.kindLabel, `missing kindLabel for kind: ${ev.kind}`)
    }
  })

  it('returns empty activity array when no events provided', () => {
    const ctx = buildQuotePrepContext(makeFile(), [], null)
    assert.equal(ctx.activity.length, 0)
  })

  it('respects activityLimit option', () => {
    const manyEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `act-${i}`,
      fileId: 'cf-test-1',
      kind: 'manual_note',
      at: `2026-05-0${Math.min(i + 1, 9)}T10:00:00.000Z`,
      summary: `Note ${i}.`,
    }))
    const ctx = buildQuotePrepContext(makeFile(), manyEvents, null, { activityLimit: 3 })
    assert.ok(ctx.activity.length <= 3)
  })
})

describe('buildQuotePrepContext — follow-up section', () => {
  it('returns follow-up with signal when a valid follow-up is provided', () => {
    const ctx = buildQuotePrepContext(makeFile(), [], makeFollowUp(), {
      now: new Date('2026-05-08T12:00:00.000Z'),
    })
    assert.ok(ctx.followUp !== null)
    assert.equal(ctx.followUp.dueAt, '2026-05-15')
    assert.equal(ctx.followUp.note, 'Confirm flue size.')
    assert.ok(ctx.followUp.signal)
    assert.ok(['none', 'overdue', 'today', 'tomorrow', 'future'].includes(ctx.followUp.signal.kind))
  })

  it('returns null followUp when no follow-up is provided', () => {
    const ctx = buildQuotePrepContext(makeFile(), [], null)
    assert.equal(ctx.followUp, null)
  })

  it('returns null followUp when follow-up is missing dueAt', () => {
    const ctx = buildQuotePrepContext(makeFile(), [], { fileId: 'cf-test-1' })
    assert.equal(ctx.followUp, null)
  })
})

describe('buildQuotePrepContext — evidence notes section', () => {
  it('surfaces lines with non-empty evidenceNote', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.equal(ctx.evidenceNotes.length, 1)
    assert.equal(ctx.evidenceNotes[0].evidenceNote, 'Per BisTrack quote 04-212, line 3.')
    assert.equal(ctx.evidenceNotes[0].name, 'Gas Insert X45')
  })

  it('does not surface lines with empty evidenceNote', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-2',
          name: 'Mantel shelf',
          sourceBasis: 'manual_entry',
          reviewStatus: 'draft',
          evidenceNote: '',
        },
      ],
    })
    const ctx = buildQuotePrepContext(file)
    assert.equal(ctx.evidenceNotes.length, 0)
  })

  it('scrubs banned phrases from evidenceNote', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-3',
          name: 'Test line',
          sourceBasis: 'manual_entry',
          reviewStatus: 'draft',
          evidenceNote: 'This is approved by the customer.',
        },
      ],
    })
    const ctx = buildQuotePrepContext(file)
    // "approved" triggers the banned phrase scrub → evidenceNote becomes ''
    // so no evidence note entry is surfaced
    assert.equal(ctx.evidenceNotes.length, 0)
  })

  it('scrubs sensitive terms from evidenceNote', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-4',
          name: 'Test line',
          sourceBasis: 'manual_entry',
          reviewStatus: 'draft',
          evidenceNote: 'Vendor margin is 40%.',
        },
      ],
    })
    const ctx = buildQuotePrepContext(file)
    // "margin" triggers sensitive term scrub
    assert.equal(ctx.evidenceNotes.length, 0)
  })

  it('surfaces multiple lines with evidence notes', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-5a',
          name: 'Line A',
          sourceBasis: 'from_bistrack_quote',
          reviewStatus: 'ready_for_bistrack',
          evidenceNote: 'Confirmed with Liam.',
        },
        {
          id: 'qpl-5b',
          name: 'Line B',
          sourceBasis: 'manual_entry',
          reviewStatus: 'draft',
          evidenceNote: '',
        },
        {
          id: 'qpl-5c',
          name: 'Line C',
          sourceBasis: 'from_lens',
          reviewStatus: 'needs_verification',
          evidenceNote: 'From Setup + Goal Lens, customer said 36 inch.',
        },
      ],
    })
    const ctx = buildQuotePrepContext(file)
    assert.equal(ctx.evidenceNotes.length, 2)
    assert.equal(ctx.evidenceNotes[0].name, 'Line A')
    assert.equal(ctx.evidenceNotes[1].name, 'Line C')
  })
})

describe('buildQuotePrepContext — scrub across sections', () => {
  it('scrubs banned phrases from setup salesperson notes', () => {
    const file = makeFile({ lensSalespersonNotes: 'Customer ready — good to go.' })
    const ctx = buildQuotePrepContext(file)
    // "customer ready" triggers scrub → empty string
    assert.equal(ctx.setup.salespersonNotes, '')
  })

  it('scrubs sensitive terms from setup existingNotes', () => {
    const file = makeFile({ existingNotes: 'Buy price was discussed.' })
    const ctx = buildQuotePrepContext(file)
    assert.equal(ctx.setup.existingNotes, '')
  })

  it('scrubs sensitive terms from prep notes', () => {
    const file = makeFile({ quotePrepNotes: 'Raw OCR result attached.' })
    const ctx = buildQuotePrepContext(file)
    assert.equal(ctx.prepNotes, '')
  })

  it('returns safe strings for gate label even when underlying strings have banned phrases', () => {
    const ctx = buildQuotePrepContext(makeFile())
    // Gate labels in the helper are already "safe" — just confirm no leak
    const label = ctx.gate.label
    assert.equal(typeof label, 'string')
    assert.ok(!label.toLowerCase().includes('proposal ready'))
  })
})

describe('buildQuotePrepContext — no mutation', () => {
  it('does not mutate the input rawFile object', () => {
    const file = makeFile()
    const original = JSON.stringify(file)
    buildQuotePrepContext(file, [], null)
    assert.equal(JSON.stringify(file), original)
  })

  it('does not mutate the input rawActivity array', () => {
    const activity = makeActivity()
    const original = JSON.stringify(activity)
    buildQuotePrepContext(makeFile(), activity, null)
    assert.equal(JSON.stringify(activity), original)
  })

  it('returns frozen top-level object', () => {
    const ctx = buildQuotePrepContext(makeFile())
    assert.ok(Object.isFrozen(ctx))
  })
})

describe('buildQuotePrepContext — edge cases', () => {
  it('handles null/undefined rawFile gracefully', () => {
    const ctx = buildQuotePrepContext(null, [], null)
    assert.equal(ctx.customer.name, '')
    assert.equal(ctx.lineReview.total, 0)
    assert.equal(ctx.activity.length, 0)
    assert.equal(ctx.followUp, null)
  })

  it('handles missing rawActivity gracefully', () => {
    const ctx = buildQuotePrepContext(makeFile(), null, null)
    assert.equal(ctx.activity.length, 0)
  })

  it('handles file with no quotePrepLines (backwards compat)', () => {
    const file = makeFile({ quotePrepLines: undefined })
    const ctx = buildQuotePrepContext(file)
    assert.equal(ctx.lineReview.total, 0)
    assert.equal(ctx.evidenceNotes.length, 0)
  })
})
