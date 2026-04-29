import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCustomerFacingPlaybookCopy, proposalPlaybooks, recommendProposalPlaybook } from './proposalPlaybooks.js'

const now = '2026-04-29T12:00:00'

function baseFields(overrides = {}) {
  return {
    CUSTOMER_NAME: 'Sample Customer',
    CUSTOMER_PHONE: '815-555-0100',
    QUOTE_DATE: '04/20/2026',
    QUOTATION_TOTAL: '$6,500.00',
    INSTALLATION_SCOPE: 'Install fireplace with approved venting path.',
    PROJECT_NOTES: 'Gas and electrical details to be confirmed by installer.',
    ...overrides,
  }
}

function productIntel(overrides = {}) {
  return {
    needsReviewCount: 0,
    rows: [
      {
        match: { matchType: 'exact', product: { code: 'FP-100', name: 'Sample Fireplace' } },
        badges: ['Available'],
      },
    ],
    groupedRows: [
      { group: 'Fireplace Unit', rows: [] },
      { group: 'Venting / Chimney', rows: [] },
    ],
    ...overrides,
  }
}

test('recent complete quote recommends Warm Showroom Recap', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'warm-showroom-recap')
  assert.equal(r.confidence, 'high')
  assert.ok(r.reasons.includes('Recent quote'))
})

test('old quote recommends Old Quote Re-Engagement', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields({ QUOTE_DATE: '10/01/2025' }),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'old-quote-re-engagement')
  assert.ok(r.warnings.some((warning) => /quote refresh/i.test(warning)))
})

test('missing contact and install details recommends Missing-Info Clarification', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields({ CUSTOMER_PHONE: '', INSTALLATION_SCOPE: '' }),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'missing-info-clarification')
  assert.ok(r.warnings.some((warning) => /Missing customer email or phone/i.test(warning)))
  assert.ok(r.warnings.some((warning) => /Missing install details/i.test(warning)))
})

test('product matches needing review add warnings', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel({ needsReviewCount: 1 }),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'missing-info-clarification')
  assert.ok(r.warnings.some((warning) => /Product match needs review/i.test(warning)))
})

test('display model match recommends Display Model Follow-Up and warns about confirmation', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel({
      rows: [
        {
          match: { matchType: 'exact', product: { code: 'FP-100', name: 'Sample Fireplace' } },
          badges: ['On Display', 'Available'],
        },
      ],
    }),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'display-model-follow-up')
  assert.ok(r.warnings.some((warning) => /Display-model wording requires/i.test(warning)))
  assert.ok(r.copyScaffold.some((line) => /available to view in our showroom/i.test(line)))
  assert.ok(!r.copyScaffold.some((line) => /you saw/i.test(line)))
})

test('closed paid context creates warning and recommends paid order summary', () => {
  const r = recommendProposalPlaybook({
    fields: baseFields(),
    parseContext: { documentType: 'bill', fullyPaid: true },
    productIntelligence: productIntel(),
    quoteMeta: { now },
  })

  assert.equal(r.id, 'paid-order-summary')
  assert.ok(r.warnings.some((warning) => /paid\/closed\/reference/i.test(warning)))
})

test('sensitive fields are not present in customer-facing playbook copy', () => {
  for (const playbook of proposalPlaybooks) {
    const copy = buildCustomerFacingPlaybookCopy(playbook).join(' ')
    assert.equal(/cost|buy price|average cost|margin|inventory turns|supplier|rank|sales performance|fuzzy match|Needs Review|OCR|BisTrack/i.test(copy), false)
  }
})
