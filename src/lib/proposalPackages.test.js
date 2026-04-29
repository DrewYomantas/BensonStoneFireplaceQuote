import assert from 'node:assert/strict'
import test from 'node:test'
import { recommendFollowUpCadence } from './followUpCadence.js'
import { recommendProposalPackage } from './proposalPackages.js'

const now = new Date('2026-04-29T12:00:00.000Z')

function baseInput(overrides = {}) {
  return {
    fields: {
      CUSTOMER_NAME: 'Sample Customer',
      CUSTOMER_EMAIL: 'sample@example.com',
      CUSTOMER_PHONE: '815-555-0100',
      QUOTE_DATE: '04/20/2026',
      INSTALLATION_SCOPE: 'Install fireplace with gas venting through existing chimney chase.',
      PROJECT_NOTES: 'Fireplace project with finish selections.',
      QUOTATION_TOTAL: '$6,500.00',
      ...overrides.fields,
    },
    opportunity: {
      id: 'quote-1',
      customerName: 'Sample Customer',
      customerEmail: 'sample@example.com',
      customerPhone: '815-555-0100',
      quoteDate: '04/20/2026',
      status: 'ready-for-proposal',
      temperature: 'warm',
      proposalReadiness: 'ready',
      warnings: [],
      ...overrides.opportunity,
    },
    productIntelligence: {
      needsReviewCount: 0,
      groupedRows: [
        { group: 'Fireplace Unit', rows: [] },
        { group: 'Venting / Chimney', rows: [] },
      ],
      rows: [],
      ...overrides.productIntelligence,
    },
    playbookRecommendation: {
      id: 'warm-showroom-recap',
      warnings: [],
      ...overrides.playbookRecommendation,
    },
    parseContext: {
      documentType: 'quote',
      ...overrides.parseContext,
    },
    currentSetupGuidance: overrides.currentSetupGuidance,
    now,
  }
}

function customerCopy(packageRecommendation) {
  return packageRecommendation.copyScaffold.join(' ')
}

test('recent active quote recommends warm showroom proposal', () => {
  const recommendation = recommendProposalPackage(baseInput())

  assert.equal(recommendation.id, 'warm-showroom-proposal')
  assert.equal(recommendation.exportSafety.status, 'ready')
  assert.ok(recommendation.reasons.some((reason) => /active quote/i.test(reason)))
})

test('reviewed current quote can recommend package from fields without saved opportunity', () => {
  const input = baseInput({ opportunity: {} })
  const recommendation = recommendProposalPackage({
    fields: input.fields,
    productIntelligence: input.productIntelligence,
    playbookRecommendation: input.playbookRecommendation,
    parseContext: input.parseContext,
    now,
  })

  assert.equal(recommendation.id, 'warm-showroom-proposal')
  assert.equal(recommendation.exportSafety.status, 'ready')
})

test('saved ready opportunity can recommend a package without raw project fields', () => {
  const recommendation = recommendProposalPackage({
    opportunity: {
      id: 'quote-2',
      customerName: 'Saved Customer',
      customerEmail: 'saved@example.com',
      customerPhone: '815-555-0101',
      quoteDate: '04/20/2026',
      status: 'ready-for-proposal',
      proposalReadiness: 'ready',
      temperature: 'warm',
      warnings: [],
    },
    playbookRecommendation: { id: 'warm-showroom-recap', warnings: [] },
    now,
  })

  assert.equal(recommendation.id, 'warm-showroom-proposal')
  assert.equal(recommendation.exportSafety.status, 'ready')
})

test('old quote refresh follows soft reactivation cadence', () => {
  const input = baseInput({
    fields: { QUOTE_DATE: '10/01/2025' },
    opportunity: { quoteDate: '10/01/2025', status: 'follow-up-needed', proposalReadiness: 'needs-review' },
    playbookRecommendation: { id: 'old-quote-re-engagement' },
  })
  const cadence = recommendFollowUpCadence({ opportunity: input.opportunity, now })
  const recommendation = recommendProposalPackage({ ...input, cadenceRecommendation: cadence })

  assert.equal(recommendation.id, 'old-quote-refresh')
  assert.equal(recommendation.exportSafety.status, 'review-recommended')
  assert.match(customerCopy(recommendation), /pricing or availability may need to be refreshed/i)
})

test('value playbook recommends value comparison package', () => {
  const recommendation = recommendProposalPackage(baseInput({
    playbookRecommendation: { id: 'value-focused-option-comparison' },
    productIntelligence: {
      groupedRows: [
        { group: 'Fireplace Unit', rows: [] },
        { group: 'Venting / Chimney', rows: [] },
        { group: 'Accessories', rows: [] },
      ],
    },
  }))

  assert.equal(recommendation.id, 'value-comparison')
  assert.ok(recommendation.recommendedSections.includes('Good / better / best paths'))
})

test('premium playbook recommends premium design package', () => {
  const recommendation = recommendProposalPackage(baseInput({
    fields: { QUOTATION_TOTAL: '$12,500.00' },
    playbookRecommendation: { id: 'premium-design-proposal' },
  }))

  assert.equal(recommendation.id, 'premium-design')
  assert.ok(recommendation.recommendedSections.includes('Design direction'))
})

test('missing install or venting detail recommends pre-proposal and blocks export', () => {
  const recommendation = recommendProposalPackage(baseInput({
    fields: { INSTALLATION_SCOPE: '', PROJECT_NOTES: '' },
    productIntelligence: { groupedRows: [{ group: 'Fireplace Unit', rows: [] }] },
    opportunity: { proposalReadiness: 'blocked' },
  }))

  assert.equal(recommendation.id, 'missing-info-preproposal')
  assert.equal(recommendation.exportSafety.status, 'blocked')
  assert.ok(recommendation.warnings.some((warning) => /install/i.test(warning)))
})

test('current setup blockers push package toward missing-info pre-proposal', () => {
  const recommendation = recommendProposalPackage(baseInput({
    currentSetupGuidance: {
      blockers: ['Customer says insert, but the existing fireplace type is unclear.'],
      reviewWarnings: ['Current setup blockers should be clarified before final proposal/export.'],
      internalChecklist: ['Confirm what is currently in the fireplace opening.'],
      proposalPackageImpact: {
        recommendedPackageId: 'missing-info-preproposal',
        exportSafety: 'blocked',
        reason: 'Clarify current setup and goals before final package/export.',
      },
    },
  }))

  assert.equal(recommendation.id, 'missing-info-preproposal')
  assert.equal(recommendation.exportSafety.status, 'blocked')
  assert.ok(recommendation.reasons.some((reason) => /Current setup/i.test(reason)))
  assert.ok(recommendation.internalChecklist.includes('Confirm what is currently in the fireplace opening.'))
})

test('display model package uses guarded showroom wording', () => {
  const recommendation = recommendProposalPackage(baseInput({
    productIntelligence: {
      rows: [{ match: { matchType: 'exact' }, badges: ['On Display'] }],
    },
    playbookRecommendation: { id: 'display-model-follow-up' },
  }))

  assert.equal(recommendation.id, 'display-model-followup')
  assert.match(customerCopy(recommendation), /may be available to view in our showroom/i)
  assert.equal(/you saw|exact model/i.test(customerCopy(recommendation)), false)
  assert.equal(recommendation.exportSafety.status, 'blocked')
})

test('reference-only and closed records use guardrail package', () => {
  const reference = recommendProposalPackage(baseInput({
    opportunity: { status: 'reference-only' },
    playbookRecommendation: { id: 'paid-order-summary' },
  }))
  const closed = recommendProposalPackage(baseInput({
    opportunity: { status: 'closed-lost' },
  }))

  assert.equal(reference.id, 'reference-only-guardrail')
  assert.equal(reference.exportSafety.status, 'blocked')
  assert.equal(closed.id, 'reference-only-guardrail')
})

test('product match uncertainty becomes internal warning and blocks package export', () => {
  const recommendation = recommendProposalPackage(baseInput({
    productIntelligence: { needsReviewCount: 1 },
    playbookRecommendation: { warnings: ['Product match needs review before presenting selections as confirmed.'] },
  }))

  assert.equal(recommendation.id, 'missing-info-preproposal')
  assert.equal(recommendation.exportSafety.status, 'blocked')
  assert.ok(recommendation.warnings.some((warning) => /Product match/i.test(warning)))
  assert.equal(/Product match|needs review/i.test(customerCopy(recommendation)), false)
})

test('customer-facing copy scaffolds exclude sensitive language', () => {
  const inputs = [
    baseInput(),
    baseInput({ fields: { QUOTE_DATE: '10/01/2025' }, opportunity: { quoteDate: '10/01/2025', status: 'follow-up-needed' } }),
    baseInput({ playbookRecommendation: { id: 'value-focused-option-comparison' } }),
    baseInput({ playbookRecommendation: { id: 'premium-design-proposal' }, fields: { QUOTATION_TOTAL: '$12,500.00' } }),
    baseInput({ fields: { INSTALLATION_SCOPE: '' }, opportunity: { proposalReadiness: 'blocked' } }),
    baseInput({ productIntelligence: { rows: [{ match: { matchType: 'exact' }, badges: ['On Display'] }] }, playbookRecommendation: { id: 'display-model-follow-up' } }),
  ]

  for (const input of inputs) {
    const copy = customerCopy(recommendProposalPackage(input))
    assert.equal(/buy price|average cost|\bcost\b|margin|supplier|product rank|sales rank|ocr|fuzzy match|needs review|bistrack/i.test(copy), false)
  }
})
