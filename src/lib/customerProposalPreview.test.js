import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCustomerProposalPreview } from './customerProposalPreview.js'

// ---- Fixtures ---------------------------------------------------------------

function makeFile(overrides = {}) {
  return {
    id: 'cf-test-1',
    customerName: 'Helen Marsh',
    customerPhone: '555-1234',
    projectAddress: '412 Oak St, Rockford, IL',
    existingNotes: 'Prefab fireplace with open hearth.',
    customerGoal: 'Replace insert with gas insert.',
    lensSetupType: 'zero-clearance-metal-fireplace',
    lensFuelGasPresent: 'yes',
    quotePrepLines: [
      {
        id: 'qpl-1',
        name: 'Gas Insert X45',
        description: 'Clean-face gas insert.',
        brand: 'Regency',
        partNumber: 'X45',
        category: 'gas-insert',
        quantity: '1',
        customerSafeNotes: 'Fits existing opening.',
        internalPrepNote: 'Check flue adapter size.',
        evidenceNote: 'Per BisTrack quote 04-212, line 3.',
        sourceBasis: 'from_bistrack_quote',
        reviewStatus: 'ready_for_bistrack',
        reviewFlags: ['sku_or_part_confirmed'],
      },
    ],
    quotePrepNotes: 'Check flue size.',
    quotePrepQuoteType: 'verified',
    quotePrepVerificationOwner: 'Drew',
    quotePrepNextStep: 'Confirm flue adapter with Liam.',
    quotePrepUnverifiedItems: 'Flue adapter size still unconfirmed.',
    ...overrides,
  }
}

// ---- Basic projection -------------------------------------------------------

describe('buildCustomerProposalPreview — basic projection', () => {
  it('returns a frozen object with all expected top-level keys', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(typeof preview === 'object')
    for (const key of [
      'title', 'customerName', 'projectLabel', 'dateLabel', 'warmRecap',
      'goalSummary', 'setupSummary', 'breakdownGroups', 'assumptions',
      'nextStep', 'gateStatus', 'isEmpty', 'reviewedLineCount', 'disclaimers',
    ]) {
      assert.ok(key in preview, `missing key: ${key}`)
    }
    assert.ok(Object.isFrozen(preview))
  })

  it('projects customerName from file', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.customerName, 'Helen Marsh')
  })

  it('projects projectLabel from projectAddress', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.projectLabel, '412 Oak St, Rockford, IL')
  })

  it('returns title "Fireplace Project Proposal"', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.title, 'Fireplace Project Proposal')
  })

  it('returns a non-empty warmRecap string', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(typeof preview.warmRecap === 'string' && preview.warmRecap.length > 0)
  })

  it('returns goalSummary from customerGoal', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.goalSummary, 'Replace insert with gas insert.')
  })

  it('returns setupSummary that includes existing notes', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(preview.setupSummary.includes('Prefab fireplace with open hearth.'))
  })

  it('returns dateLabel as a non-empty string', () => {
    const preview = buildCustomerProposalPreview(makeFile(), { now: new Date('2026-05-08T12:00:00.000Z') })
    assert.ok(typeof preview.dateLabel === 'string' && preview.dateLabel.length > 0)
  })

  it('returns disclaimers array with at least one entry', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(Array.isArray(preview.disclaimers) && preview.disclaimers.length > 0)
    for (const d of preview.disclaimers) {
      assert.ok(typeof d === 'string' && d.length > 0)
    }
  })

  it('returns assumptions from quotePrepUnverifiedItems', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.assumptions, 'Flue adapter size still unconfirmed.')
  })

  it('returns nextStep from quotePrepNextStep', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.nextStep, 'Confirm flue adapter with Liam.')
  })
})

// ---- Empty / missing input --------------------------------------------------

describe('buildCustomerProposalPreview — empty/missing input', () => {
  it('handles null rawFile gracefully', () => {
    const preview = buildCustomerProposalPreview(null)
    assert.equal(preview.customerName, '')
    assert.equal(preview.breakdownGroups.length, 0)
    assert.equal(preview.isEmpty, true)
    assert.equal(preview.reviewedLineCount, 0)
  })

  it('handles undefined rawFile gracefully', () => {
    const preview = buildCustomerProposalPreview(undefined)
    assert.equal(preview.customerName, '')
  })

  it('returns empty breakdownGroups when no quotePrepLines', () => {
    const preview = buildCustomerProposalPreview(makeFile({ quotePrepLines: [] }))
    assert.equal(preview.breakdownGroups.length, 0)
    assert.equal(preview.isEmpty, true)
    assert.equal(preview.reviewedLineCount, 0)
  })

  it('handles missing quotePrepLines (backwards compat)', () => {
    const preview = buildCustomerProposalPreview(makeFile({ quotePrepLines: undefined }))
    assert.equal(preview.breakdownGroups.length, 0)
    assert.equal(preview.isEmpty, true)
  })
})

// ---- Detailed Investment Breakdown ------------------------------------------

describe('buildCustomerProposalPreview — Detailed Investment Breakdown', () => {
  it('surfaces ready_for_bistrack lines in breakdownGroups', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.ok(allLines.some((l) => l.name === 'Gas Insert X45'))
  })

  it('counts reviewedLineCount correctly', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.equal(preview.reviewedLineCount, 1)
  })

  it('does NOT surface draft lines', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-draft',
          name: 'Unreviewed Mantel',
          category: 'trim',
          reviewStatus: 'draft',
          sourceBasis: 'manual_entry',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.equal(allLines.length, 0)
    assert.equal(preview.isEmpty, true)
  })

  it('does NOT surface needs_verification lines', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-nv',
          name: 'Gas Log Set',
          category: 'accessories',
          reviewStatus: 'needs_verification',
          sourceBasis: 'manual_entry',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.equal(allLines.length, 0)
  })

  it('does NOT surface do_not_use_yet lines', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-dnu',
          name: 'Old Insert Model',
          category: 'gas-insert',
          reviewStatus: 'do_not_use_yet',
          sourceBasis: 'manual_entry',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.equal(allLines.length, 0)
  })

  it('surfaces reviewed_for_prep lines alongside ready_for_bistrack lines', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-rfp',
          name: 'Flex Vent Pipe',
          category: 'venting',
          reviewStatus: 'reviewed_for_prep',
          sourceBasis: 'from_bistrack_quote',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.ok(allLines.some((l) => l.name === 'Flex Vent Pipe'))
  })

  it('groups lines by category keyword', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-a',
          name: 'Gas Insert X45',
          category: 'gas-insert',
          reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'from_bistrack_quote',
        },
        {
          id: 'qpl-b',
          name: 'DV Vent Cap',
          category: 'venting',
          reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'from_bistrack_quote',
        },
        {
          id: 'qpl-c',
          name: 'Wall Remote Kit',
          category: 'controls',
          reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'from_bistrack_quote',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const groupIds = preview.breakdownGroups.map((g) => g.id)
    assert.ok(groupIds.includes('fireplace-appliance'))
    assert.ok(groupIds.includes('venting-chimney'))
    assert.ok(groupIds.includes('controls-electrical'))
  })

  it('omits empty groups from breakdownGroups', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      assert.ok(g.lines.length > 0, `group ${g.id} should not be empty`)
    }
  })

  it('surfaces customerSafeNotes on a line item', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    const line = allLines.find((l) => l.name === 'Gas Insert X45')
    assert.ok(line)
    assert.equal(line.customerSafeNotes, 'Fits existing opening.')
  })

  it('surfaces brand and partNumber on a line item', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    const line = allLines.find((l) => l.name === 'Gas Insert X45')
    assert.ok(line)
    assert.equal(line.brand, 'Regency')
    assert.equal(line.partNumber, 'X45')
  })
})

// ---- Gate status ------------------------------------------------------------

describe('buildCustomerProposalPreview — gate status', () => {
  it('returns gateStatus with expected shape', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    const g = preview.gateStatus
    assert.ok('status' in g)
    assert.ok('isReady' in g)
    assert.ok('hasLines' in g)
    assert.ok('counts' in g)
    assert.ok(Array.isArray(g.reasons))
  })

  it('returns isReady false when required gate conditions are not met', () => {
    // No lensSetupType → gate cannot be ready
    const preview = buildCustomerProposalPreview(makeFile({ lensSetupType: '' }))
    assert.equal(preview.gateStatus.isReady, false)
  })

  it('returns isReady false when no ready_for_bistrack lines', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-1',
          name: 'Gas Insert X45',
          reviewStatus: 'draft',
          sourceBasis: 'manual_entry',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    assert.equal(preview.gateStatus.isReady, false)
  })

  it('gate status does not contain banned phrases', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const r of preview.gateStatus.reasons) {
      const lower = r.toLowerCase()
      assert.ok(!lower.includes('ready to send'), `banned phrase in gate reason: ${r}`)
      assert.ok(!lower.includes('proposal ready'), `banned phrase in gate reason: ${r}`)
      assert.ok(!lower.includes('customer ready'), `banned phrase in gate reason: ${r}`)
    }
  })
})

// ---- Sensitive field scrub --------------------------------------------------

describe('buildCustomerProposalPreview — sensitive field scrub', () => {
  it('scrubs banned phrase from customerName', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerName: 'This is approved.' }))
    assert.equal(preview.customerName, '')
  })

  it('scrubs sensitive term "cost" from goalSummary', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerGoal: 'Buy at cost.' }))
    assert.equal(preview.goalSummary, '')
  })

  it('scrubs sensitive term from setupSummary', () => {
    const preview = buildCustomerProposalPreview(makeFile({ existingNotes: 'Average cost was noted.' }))
    assert.equal(preview.setupSummary.includes('Average cost'), false)
  })

  it('scrubs sensitive term from assumptions', () => {
    const preview = buildCustomerProposalPreview(
      makeFile({ quotePrepUnverifiedItems: 'Vendor margin details still pending.' }),
    )
    assert.equal(preview.assumptions, '')
  })

  it('scrubs a line name containing sensitive term', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-s',
          name: 'High margin insert',
          category: 'gas-insert',
          reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'from_bistrack_quote',
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.equal(allLines.length, 0)
  })
})

// ---- Internal field isolation -----------------------------------------------

describe('buildCustomerProposalPreview — internal fields do not leak', () => {
  it('does not surface internalPrepNote on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('internalPrepNote' in l), 'internalPrepNote must not appear on preview line')
      }
    }
  })

  it('does not surface evidenceNote on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('evidenceNote' in l), 'evidenceNote must not appear on preview line')
      }
    }
  })

  it('does not surface sourceBasis on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('sourceBasis' in l), 'sourceBasis must not appear on preview line')
      }
    }
  })

  it('does not surface reviewFlags on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('reviewFlags' in l), 'reviewFlags must not appear on preview line')
      }
    }
  })

  it('does not surface reviewStatus on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('reviewStatus' in l), 'reviewStatus must not appear on preview line')
      }
    }
  })

  it('does not surface sourceNote on any breakdown line', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    for (const g of preview.breakdownGroups) {
      for (const l of g.lines) {
        assert.ok(!('sourceNote' in l), 'sourceNote must not appear on preview line')
      }
    }
  })

  it('preview model has no activity or follow-up keys', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    const keys = Object.keys(preview)
    assert.ok(!keys.includes('activity'), 'activity must not be in preview')
    assert.ok(!keys.includes('followUp'), 'followUp must not be in preview')
    assert.ok(!keys.includes('activityEvents'), 'activityEvents must not be in preview')
  })

  it('helper does not accept activity or follow-up (no leak path)', () => {
    // buildCustomerProposalPreview only takes rawFile and options — no activity param.
    // Passing extra props via options should not surface them.
    const preview = buildCustomerProposalPreview(makeFile(), { activity: [{ kind: 'visit_started' }] })
    assert.ok(!('activity' in preview))
  })
})

// ---- No mutation ------------------------------------------------------------

describe('buildCustomerProposalPreview — no mutation', () => {
  it('does not mutate the input rawFile', () => {
    const file = makeFile()
    const original = JSON.stringify(file)
    buildCustomerProposalPreview(file)
    assert.equal(JSON.stringify(file), original)
  })

  it('returns a frozen top-level object', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(Object.isFrozen(preview))
  })

  it('returns frozen breakdownGroups array', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(Object.isFrozen(preview.breakdownGroups))
  })

  it('returns frozen disclaimers array', () => {
    const preview = buildCustomerProposalPreview(makeFile())
    assert.ok(Object.isFrozen(preview.disclaimers))
  })
})

// ---- Backwards compatibility ------------------------------------------------

describe('buildCustomerProposalPreview — backwards compatibility', () => {
  it('handles lines without evidenceNote (pre-Milestone-16 data)', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-old',
          name: 'Gas Log Set',
          category: 'accessories',
          quantity: '1',
          reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'manual_entry',
          // No evidenceNote, no customerSafeNotes — pre-M16 shape
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.ok(allLines.some((l) => l.name === 'Gas Log Set'))
  })

  it('handles lines without reviewStatus (very old data) — defaults to draft, excluded', () => {
    const file = makeFile({
      quotePrepLines: [
        {
          id: 'qpl-nostat',
          name: 'Unnamed Line',
          sourceBasis: 'manual_entry',
          // No reviewStatus — normalizeQuotePrepLine defaults to 'draft'
        },
      ],
    })
    const preview = buildCustomerProposalPreview(file)
    // 'draft' is not a REVIEWED_STATUS, so it should not appear
    const allLines = preview.breakdownGroups.flatMap((g) => g.lines)
    assert.equal(allLines.length, 0)
  })
})

// ---- goalSummary slug suppression -------------------------------------------

describe('buildCustomerProposalPreview — goalSummary slug suppression', () => {
  it('does not surface a bare slug key from customerGoal', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerGoal: 'replace-existing' }))
    assert.notEqual(preview.goalSummary, 'replace-existing')
  })

  it('does not surface "replace-existing" slug even if DESIRED_OUTCOME_LABELS has no match', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerGoal: 'replace-existing', lensDesiredOutcome: '' }))
    assert.equal(preview.goalSummary, '')
  })

  it('does not surface multi-word slug-shaped key', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerGoal: 'add-new-fireplace', lensDesiredOutcome: '' }))
    assert.equal(preview.goalSummary, '')
  })

  it('surfaces free-form human text from customerGoal', () => {
    const preview = buildCustomerProposalPreview(makeFile({ customerGoal: 'Replace insert with gas insert.' }))
    assert.equal(preview.goalSummary, 'Replace insert with gas insert.')
  })

  it('does not surface goalNotes (contains internal Visit type prefix)', () => {
    const preview = buildCustomerProposalPreview(makeFile({
      customerGoal: '',
      lensDesiredOutcome: '',
      goalNotes: 'Visit type: walk-in\nWants gas insert.',
    }))
    assert.equal(preview.goalSummary, '')
  })

  it('uses DESIRED_OUTCOME_LABELS when lensDesiredOutcome matches a known key', () => {
    const preview = buildCustomerProposalPreview(makeFile({
      customerGoal: '',
      lensDesiredOutcome: 'replace-existing-unit',
    }))
    assert.ok(preview.goalSummary.length > 0)
    assert.notEqual(preview.goalSummary, 'replace-existing-unit')
  })
})
