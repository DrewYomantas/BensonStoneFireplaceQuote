import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyLensDraft,
  normalizeLensDraft,
  lensDraftFromCustomerFile,
  buildCustomerFilePatchFromLens,
  applyLensDraftToCustomerFile,
  setLensFactSource,
  deriveLensWarnings,
  isLensReadyForProposal,
  lensFactsForDisplay,
  SETUP_TYPES,
  DESIRED_OUTCOMES,
} from './setupGoalLens.js'
import { projectCustomerFileForDisplay } from './customerFileView.js'

const SENSITIVE = [
  'cost', 'averageCost', 'buyPrice', 'margin', 'marginPercent',
  'supplierTotal', 'supplierHistory', 'rawOcr', 'rawPdf',
  'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
  'salesRank', 'productRank',
]

describe('setupGoalLens — defaults', () => {
  it('emptyLensDraft has unknown values and manual sources', () => {
    const d = emptyLensDraft()
    assert.equal(d.setupType, 'unknown')
    assert.equal(d.desiredOutcome, 'unknown')
    assert.equal(d.setupTypeSource, 'manual')
    assert.deepEqual(d.constructionFlags, [])
  })

  it('normalizeLensDraft falls back to unknown on garbage', () => {
    const d = normalizeLensDraft({
      setupType: 'rocket-fireplace',
      desiredOutcome: 'win-the-lottery',
      fuelGasPresent: 'maybe',
    })
    assert.equal(d.setupType, 'unknown')
    assert.equal(d.desiredOutcome, 'unknown')
    assert.equal(d.fuelGasPresent, 'unknown')
  })
})

describe('setupGoalLens — Customer File hydration', () => {
  it('Start Visit facts default to non-verified source states (said)', () => {
    const file = { existingNotes: 'masonry brick', customerGoal: 'more-heat' }
    const draft = lensDraftFromCustomerFile(file)
    // Setup type isn't auto-promoted — Drew must pick it. Goal maps from said.
    assert.equal(draft.desiredOutcome, 'more-heat')
    assert.equal(draft.desiredOutcomeSource, 'said')
    assert.notEqual(draft.desiredOutcomeSource, 'verified')
    assert.notEqual(draft.setupTypeSource, 'verified')
  })

  it('lensDraftFromCustomerFile rehydrates persisted lens facts', () => {
    const file = {
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
    }
    const draft = lensDraftFromCustomerFile(file)
    assert.equal(draft.setupType, 'gas-insert')
    assert.equal(draft.setupTypeSource, 'verified')
    assert.equal(draft.fuelGasPresent, 'yes')
    assert.deepEqual(draft.constructionFlags, ['stone-or-masonry-work'])
    assert.equal(draft.salespersonNotes, 'wife wants cleaner look')
  })

  it('rejects invalid construction flags during hydration', () => {
    const draft = lensDraftFromCustomerFile({
      lensConstructionFlags: ['stone-or-masonry-work', 'rocket-fuel', 42],
    })
    assert.deepEqual(draft.constructionFlags, ['stone-or-masonry-work'])
  })
})

describe('setupGoalLens — patch + sensitive scrub', () => {
  it('buildCustomerFilePatchFromLens maps to whitelisted lens-prefixed keys', () => {
    const patch = buildCustomerFilePatchFromLens({
      setupType: 'gas-insert', setupTypeSource: 'verified',
      desiredOutcome: 'more-heat', desiredOutcomeSource: 'said',
      fuelGasPresent: 'yes', fuelGasPresentSource: 'verified',
      venting: 'masonry-chimney', ventingSource: 'verified',
      constructionFlags: ['stone-or-masonry-work'],
    })
    assert.equal(patch.lensSetupType, 'gas-insert')
    assert.equal(patch.lensSetupTypeSource, 'verified')
    assert.equal(patch.lensDesiredOutcome, 'more-heat')
    assert.equal(patch.customerGoal, 'more-heat', 'mirrors goal onto legacy field')
    assert.ok(patch.existingNotes && patch.existingNotes.length > 0)
    assert.deepEqual(patch.lensConstructionFlags, ['stone-or-masonry-work'])
  })

  it('does not mirror goal/setup when still unknown', () => {
    const patch = buildCustomerFilePatchFromLens({})
    assert.equal(patch.customerGoal, undefined)
    assert.equal(patch.existingNotes, undefined)
  })

  it('strips sensitive keys from raw draft before saving', () => {
    const raw = { setupType: 'gas-insert', cost: 999, marginPercent: 12 }
    for (const key of SENSITIVE) raw[key] = 'leak'
    const patch = buildCustomerFilePatchFromLens(raw)
    for (const key of SENSITIVE) {
      assert.equal(key in patch, false, `${key} must not reach the patch`)
    }
  })

  it('applyLensDraftToCustomerFile produces a sanitized merged file', () => {
    const file = { customerName: 'Anna' }
    const merged = applyLensDraftToCustomerFile(file, {
      setupType: 'gas-insert', setupTypeSource: 'verified',
      desiredOutcome: 'more-heat', desiredOutcomeSource: 'said',
    })
    assert.equal(merged.customerName, 'Anna')
    assert.equal(merged.lensSetupType, 'gas-insert')
    assert.equal(merged.customerGoal, 'more-heat')
    // Sanitization keeps the file shape predictable.
    assert.equal(typeof merged.lensUpdatedAt, 'string')
  })

  it('display projection reflects saved lens fields and stays sensitive-clean', () => {
    const merged = applyLensDraftToCustomerFile(
      { customerName: 'Anna', cost: 1, rawOcr: 'x' },
      { setupType: 'gas-insert', setupTypeSource: 'verified',
        desiredOutcome: 'more-heat', desiredOutcomeSource: 'said' },
    )
    const view = projectCustomerFileForDisplay(merged)
    assert.equal(view.lensSetupType, 'gas-insert')
    assert.equal(view.lensDesiredOutcome, 'more-heat')
    for (const key of SENSITIVE) {
      assert.equal(key in view, false, `${key} must not reach display projection`)
    }
  })
})

describe('setupGoalLens — fact source promotion', () => {
  it('marking a fact verified updates only that fact source', () => {
    const draft = emptyLensDraft()
    const next = setLensFactSource({ ...draft, setupType: 'gas-insert' }, 'setupType', 'verified')
    assert.equal(next.setupTypeSource, 'verified')
    assert.equal(next.desiredOutcomeSource, 'manual')
  })

  it('ignores unknown fact keys', () => {
    const next = setLensFactSource(emptyLensDraft(), 'rocketFuel', 'verified')
    // No throw, no source change to known fields.
    assert.equal(next.setupTypeSource, 'manual')
  })

  it('falls back to known source kinds when an invalid one is passed', () => {
    const next = setLensFactSource(
      { ...emptyLensDraft(), setupTypeSource: 'said' },
      'setupType',
      'totally-bogus',
    )
    // Invalid source kinds normalize to manual via sourceTrust.
    assert.equal(next.setupTypeSource, 'manual')
  })
})

describe('setupGoalLens — warnings + readiness', () => {
  it('unknown setup and goal create blockers with clarifying questions', () => {
    const { blockers, questions } = deriveLensWarnings(emptyLensDraft())
    const codes = blockers.map((b) => b.code)
    assert.ok(codes.includes('unknown-setup'))
    assert.ok(codes.includes('unknown-goal'))
    assert.ok(questions.length >= 2)
  })

  it('isLensReadyForProposal is false until blockers are cleared', () => {
    assert.equal(isLensReadyForProposal(emptyLensDraft()), false)
    const ready = {
      setupType: 'gas-insert',
      desiredOutcome: 'more-heat',
      fuelGasPresent: 'yes',
      gasType: 'natural-gas',
      venting: 'masonry-chimney',
    }
    assert.equal(isLensReadyForProposal(ready), true)
  })

  it('flags construction coordination as a warning, not a blocker', () => {
    const { blockers, warnings } = deriveLensWarnings({
      setupType: 'gas-insert',
      desiredOutcome: 'more-heat',
      fuelGasPresent: 'yes',
      gasType: 'natural-gas',
      venting: 'masonry-chimney',
      constructionFlags: ['stone-or-masonry-work'],
    })
    assert.equal(blockers.length, 0)
    assert.ok(warnings.some((w) => w.code === 'construction-coordination'))
  })

  it('electric path flags missing electrical availability as a blocker', () => {
    const { blockers } = deriveLensWarnings({
      setupType: 'electric-fireplace',
      desiredOutcome: 'electric-simplicity',
      fuelElectricPresent: 'unknown',
    })
    assert.ok(blockers.some((b) => b.code === 'unknown-electric'))
  })
})

describe('setupGoalLens — facts for display', () => {
  it('returns one row per primary fact with source and missing flag', () => {
    const facts = lensFactsForDisplay({
      lensSetupType: 'gas-insert',
      lensSetupTypeSource: 'verified',
      lensDesiredOutcome: 'more-heat',
      lensDesiredOutcomeSource: 'said',
    })
    const setup = facts.find((f) => f.key === 'setupType')
    assert.equal(setup.source, 'verified')
    assert.equal(setup.missing, false)
    const goal = facts.find((f) => f.key === 'desiredOutcome')
    assert.equal(goal.source, 'said')
    const venting = facts.find((f) => f.key === 'venting')
    assert.equal(venting.missing, true)
  })
})

describe('setupGoalLens — enum membership', () => {
  it('all required setup and outcome enums are present', () => {
    for (const v of [
      'masonry-fireplace', 'zero-clearance-metal-fireplace',
      'direct-vent-gas-fireplace', 'gas-insert', 'gas-log-set',
      'wood-stove', 'pellet-stove-or-insert', 'electric-fireplace',
      'new-construction-or-framed-chase',
    ]) assert.ok(SETUP_TYPES.includes(v), `missing ${v}`)
    for (const v of [
      'more-heat', 'easier-operation', 'cleaner-look', 'gas-convenience',
      'wood-burning-experience', 'electric-simplicity', 'ambience-design',
      'replace-existing-unit', 'explore-options',
    ]) assert.ok(DESIRED_OUTCOMES.includes(v), `missing ${v}`)
  })
})
