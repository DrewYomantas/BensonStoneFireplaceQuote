import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildQuotePolishQueueDraft,
  createQuotePolishOpportunity,
  mergeQuotePolishOpportunity,
} from './quotePolishOpportunity.js'
import {
  getLineItemAttachmentWarning,
  getOpportunityReadinessBadge,
  getOpportunitySourceLabel,
} from './opportunities.js'

const now = '2026-04-29T12:00:00.000Z'

function fields(overrides = {}) {
  return {
    CUSTOMER_NAME: 'Active Quote Customer',
    CUSTOMER_PHONE: '815-555-0123',
    CUSTOMER_EMAIL: 'active@example.com',
    QUOTE_NO: 'AQ-1001',
    QUOTE_DATE: '04/20/2026',
    PROJECT_TITLE: 'Living room fireplace',
    PROJECT_OVERVIEW: 'Replace the fireplace and finish the surround.',
    PROJECT_SCOPE_SUMMARY: 'Fireplace unit, venting, stone finish, and installation.',
    INSTALLATION_SCOPE: 'Install selected fireplace and approved venting.',
    TOTAL_AMOUNT: '$6,200.00',
    QUOTATION_TOTAL: '$6,510.00',
    ...overrides,
  }
}

function context(overrides = {}) {
  return {
    documentType: 'quote',
    outputLabel: 'Fireplace Project Proposal',
    sourceFileName: 'C:\\private\\customers\\active-quote.pdf',
    rawOcrText: 'RAW OCR SHOULD NOT STORE',
    privateFilePath: 'C:\\private\\customers\\active-quote.pdf',
    sourceConfidence: 'internal confidence 45',
    ...overrides,
  }
}

test('reviewed Quote Polish data maps to safe queue opportunity fields', () => {
  const opportunity = createQuotePolishOpportunity({
    fields: fields(),
    parseContext: context(),
    lineItems: [{ description: 'Fireplace unit', total: '$4,000.00' }],
    proposalMode: 'detailed',
    proposalReviewState: 'reviewed',
    lineItemQuoteAttached: true,
    setupGuidance: { blockers: [] },
    now,
  })

  assert.equal(opportunity.sourceType, 'quote-polish')
  assert.equal(opportunity.recoverySource, 'true')
  assert.equal(opportunity.status, 'ready-for-proposal')
  assert.equal(opportunity.proposalReadiness, 'ready')
  assert.equal(opportunity.proposalMode, 'detailed')
  assert.equal(opportunity.proposalReviewState, 'reviewed')
  assert.equal(opportunity.lineItemQuoteAttached, 'true')
  assert.equal(opportunity.sourceFileName, 'active-quote.pdf')
})

test('Quote Polish opportunity does not persist raw OCR text file bytes private paths or internal confidence', () => {
  const opportunity = createQuotePolishOpportunity({
    fields: fields({
      PROJECT_SCOPE_SUMMARY: 'Supplier total and cost margin should not persist.',
      PROJECT_NOTES: 'Customer wants stone.\nInternal confidence says fuzzy match.',
    }),
    parseContext: context({ fileBytes: '<binary>' }),
    lineItems: [
      { description: 'Fireplace unit', total: '$4,000.00' },
      { description: 'supplier cost margin line', total: '$0.00' },
    ],
    proposalReviewState: 'reviewed',
    lineItemQuoteAttached: true,
    now,
  })

  const serialized = JSON.stringify(opportunity)
  assert.equal(/RAW OCR|fileBytes|private\\customers|privateFilePath|internal confidence|fuzzy match|supplier total|cost margin/i.test(serialized), false)
  assert.match(opportunity.sourceTrailNote, /active-quote\.pdf/)
})

test('unresolved Quote Polish review is blocked before follow-up', () => {
  const opportunity = createQuotePolishOpportunity({
    fields: fields(),
    parseContext: context(),
    proposalReviewState: 'unresolved',
    lineItemQuoteAttached: true,
    now,
  })

  assert.equal(opportunity.status, 'needs-review')
  assert.equal(opportunity.proposalReadiness, 'blocked')
  assert.equal(opportunity.reviewedForFollowUp, 'false')
  assert.ok(opportunity.warnings.some((warning) => /readiness unresolved/i.test(warning)))
})

test('line-item attachment confirmation changes readiness and queue warnings', () => {
  const opportunity = createQuotePolishOpportunity({
    fields: fields(),
    parseContext: context(),
    proposalReviewState: 'reviewed',
    lineItemQuoteAttached: false,
    now,
  })

  assert.equal(opportunity.lineItemQuoteAttached, 'false')
  assert.equal(opportunity.proposalReadiness, 'blocked')
  assert.equal(opportunity.nextAction, 'Confirm attached line-item quote')
  assert.ok(opportunity.warnings.some((warning) => /attachment is not confirmed/i.test(warning)))
  assert.equal(getOpportunitySourceLabel(opportunity), 'Quote Polish / Active BisTrack Quote')
  assert.equal(getOpportunityReadinessBadge(opportunity).label, 'Line-Item Quote Needed')
  assert.equal(getLineItemAttachmentWarning(opportunity), 'Line-item quote attachment not confirmed')
})

test('duplicate quote number does not silently create a queue record', () => {
  const draft = buildQuotePolishQueueDraft({
    fields: fields(),
    parseContext: context(),
    proposalReviewState: 'reviewed',
    lineItemQuoteAttached: true,
    now,
  }, [
    { id: 'existing', quoteNumber: 'AQ-1001', customerName: 'Active Quote Customer' },
  ])

  assert.equal(draft.duplicate.isDuplicate, true)
  assert.equal(draft.duplicate.duplicateId, 'existing')
  assert.equal(draft.duplicate.confidence, 'high')
})

test('duplicate update merge preserves existing contact when incoming contact is blank', () => {
  const incoming = createQuotePolishOpportunity({
    fields: fields({ CUSTOMER_PHONE: '', CUSTOMER_EMAIL: '' }),
    parseContext: context(),
    proposalReviewState: 'follow-up',
    lineItemQuoteAttached: true,
    now,
  })
  const merged = mergeQuotePolishOpportunity({
    id: 'existing',
    customerName: 'Active Quote Customer',
    customerEmail: 'saved@example.com',
    customerPhone: '815-555-0999',
    createdAt: '2026-04-01T12:00:00.000Z',
  }, incoming, now)

  assert.equal(merged.id, 'existing')
  assert.equal(merged.customerEmail, 'saved@example.com')
  assert.equal(merged.customerPhone, '815-555-0999')
  assert.equal(merged.createdAt, '2026-04-01T12:00:00.000Z')
})
