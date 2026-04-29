import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCurrentSetup } from './currentSetup.js'

const now = new Date('2026-04-29T12:00:00.000Z')

function setup(fields = {}, extra = {}) {
  return evaluateCurrentSetup({
    fields: {
      QUOTE_DATE: '04/20/2026',
      ...fields,
    },
    now,
    ...extra,
  })
}

function questionText(result) {
  return result.clarificationQuestions.join(' ')
}

test('unknown current setup surfaces blockers and missing-info package impact', () => {
  const result = setup()

  assert.equal(result.currentSetupType, 'unknown')
  assert.equal(result.confidence, 'low')
  assert.ok(result.blockers.some((blocker) => /appliance type is unknown/i.test(blocker)))
  assert.equal(result.proposalPackageImpact.recommendedPackageId, 'missing-info-preproposal')
})

test('masonry fireplace path is recognized from reviewed project language', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Existing masonry brick fireplace with clay chimney.',
    INSTALLATION_SCOPE: 'Review gas insert path with vent liner.',
    PROJECT_NOTES: 'Customer wants more heat and modernize look. Natural gas is available.',
  })

  assert.equal(result.currentSetupType, 'masonry-fireplace')
  assert.ok(result.customerGoalTags.includes('heat-and-ambiance') || result.customerGoalTags.includes('more-heat'))
  assert.ok(result.suggestedSolutionPaths.some((path) => /Gas path/i.test(path)))
})

test('zero-clearance setup creates review warning', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Existing zero clearance metal fireplace in framed chase.',
    INSTALLATION_SCOPE: 'Review replacement fireplace and direct vent path.',
    PROJECT_NOTES: 'Customer wants easier operation with natural gas.',
  })

  assert.equal(result.currentSetupType, 'zero-clearance-metal-fireplace')
  assert.ok(result.reviewWarnings.some((warning) => /Zero-clearance/i.test(warning)))
})

test('customer says insert but setup is unknown', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Customer asked about an insert.',
    PROJECT_NOTES: 'Wants more heat.',
  })

  assert.ok(result.blockers.some((blocker) => /says insert/i.test(blocker)))
  assert.ok(questionText(result).includes('masonry brick/block or a metal fireplace box'))
})

test('electric request with depth and framing uncertainty blocks final proposal', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Electric fireplace requested.',
    PROJECT_NOTES: 'Customer wants heat and ambiance.',
  })

  assert.equal(result.currentSetupType, 'electric-fireplace')
  assert.ok(result.blockers.some((blocker) => /depth\/framing/i.test(blocker)))
  assert.ok(result.blockers.some((blocker) => /Electric heat expectations/i.test(blocker)))
})

test('exterior construction coordination creates blocker', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Existing framed chase with exterior siding work planned.',
    INSTALLATION_SCOPE: 'Coordinate venting, framing, drywall, and chase work.',
  })

  assert.equal(result.currentSetupType, 'existing-framed-chase')
  assert.ok(result.blockers.some((blocker) => /Exterior chase/i.test(blocker)))
})

test('heat goal with ambiance-first path creates warning', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Gas log set for open fireplace.',
    PROJECT_NOTES: 'Customer wants more heat and less draft.',
    INSTALLATION_SCOPE: 'Gas logs with chimney review. Natural gas available.',
  })

  assert.equal(result.currentSetupType, 'gas-log-set')
  assert.ok(result.blockers.some((blocker) => /ambiance-first/i.test(blocker)))
  assert.ok(result.blockers.some((blocker) => /draft\/cold-air/i.test(blocker)))
})

test('gas and electrical availability missing are surfaced', () => {
  const gas = setup({
    PROJECT_OVERVIEW: 'Gas fireplace option.',
    INSTALLATION_SCOPE: 'Fireplace vent path to be reviewed.',
  })
  const electric = setup({
    PROJECT_OVERVIEW: 'Electric fireplace in new wall.',
    INSTALLATION_SCOPE: 'Frame wall opening and confirm depth.',
  })

  assert.ok(gas.blockers.some((blocker) => /Natural gas vs propane/i.test(blocker)))
  assert.ok(electric.blockers.some((blocker) => /Electrical availability/i.test(blocker)))
})

test('wood insert requires masonry confirmation', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Wood insert requested.',
    PROJECT_NOTES: 'Customer wants wood burning experience.',
  })

  assert.equal(result.currentSetupType, 'wood-insert')
  assert.ok(result.blockers.some((blocker) => /masonry fireplace confirmation/i.test(blocker)))
})

test('high-efficiency wood conversion needs review before assuming gas conversion', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'High efficiency wood fireplace conversion to gas.',
    PROJECT_NOTES: 'Customer wants gas convenience.',
  })

  assert.equal(result.currentSetupType, 'other-review-needed')
  assert.ok(result.blockers.some((blocker) => /reviewed before assuming a gas conversion/i.test(blocker)))
})

test('clarification questions contain no sensitive internal language', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Customer asked about insert and electric option.',
  })

  assert.equal(/average cost|buy price|\bcost\b|margin|supplier|product rank|sales rank|ocr|fuzzy match|needs review|bistrack/i.test(questionText(result)), false)
})

test('closed reference guardrail remains respected', () => {
  const result = setup({
    PROJECT_OVERVIEW: 'Existing masonry fireplace.',
  }, {
    opportunity: { status: 'reference-only' },
  })

  assert.equal(result.proposalPackageImpact.exportSafety, 'blocked')
  assert.ok(result.blockers.some((blocker) => /Closed\/reference/i.test(blocker)))
})
