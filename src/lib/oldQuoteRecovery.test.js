import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOldQuoteOpportunity,
  deriveRecoveryRecommendation,
  getRecoveryFollowUpDraft,
  isSafeActivityForStatus,
} from './oldQuoteRecovery.js'

const now = '2026-04-29T12:00:00.000Z'

function intake(overrides = {}) {
  return {
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '815-555-0100',
    quoteNumber: 'Q-1001',
    quoteDate: '06/15/2025',
    originalQuoteAmount: '$5,200.00',
    projectType: 'Fireplace Project',
    existingSetup: '',
    desiredOutcome: '',
    productsNotes: '',
    sourceFileNote: 'Old folder - Q1001.pdf',
    sourceConfidence: 'estimated',
    internalNotes: 'Called last spring, was interested but timing was off.',
    recoveryClassification: 'warm',
    ...overrides,
  }
}

test('manual intake creates opportunity with recovery metadata', () => {
  const opportunity = createOldQuoteOpportunity(intake(), now)

  assert.equal(opportunity.recoverySource, 'true')
  assert.equal(opportunity.recoveryClassification, 'warm')
  assert.equal(opportunity.needsRefresh, 'true')
  assert.ok(opportunity.id, 'should have an id')
  assert.equal(opportunity.customerName, 'Test Customer')
  assert.equal(opportunity.sourceType, 'old-quote-recovery')
})

test('paid-closed classification becomes reference-only status', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'paid-closed' }), now)

  assert.equal(opportunity.status, 'reference-only')
  assert.ok(
    opportunity.warnings.some((w) => /paid\/closed\/reference/i.test(w)),
    'should warn about paid/closed status',
  )
})

test('reference-only classification also becomes reference-only status', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'reference-only' }), now)

  assert.equal(opportunity.status, 'reference-only')
})

test('missing-contact classification triggers needs-review status', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    recoveryClassification: 'missing-contact',
    customerEmail: '',
    customerPhone: '',
  }), now)

  assert.equal(opportunity.status, 'needs-review')
})

test('missing customer contact name produces blocked recommendation', () => {
  const opportunity = createOldQuoteOpportunity(intake({ customerName: '', customerEmail: '', customerPhone: '' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'needs-contact-info')
  assert.equal(rec.safe, false)
  assert.equal(rec.path, 'missing-info-preproposal')
})

test('missing customer phone and email produces blocked recommendation', () => {
  const opportunity = createOldQuoteOpportunity(intake({ customerEmail: '', customerPhone: '' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'needs-contact-info')
  assert.equal(rec.safe, false)
})

test('all intake opportunities get needsRefresh flag', () => {
  const hot = createOldQuoteOpportunity(intake({ recoveryClassification: 'hot' }), now)
  const cool = createOldQuoteOpportunity(intake({ recoveryClassification: 'cool' }), now)
  const unknown = createOldQuoteOpportunity(intake({ recoveryClassification: 'unknown' }), now)

  assert.equal(hot.needsRefresh, 'true')
  assert.equal(cool.needsRefresh, 'true')
  assert.equal(unknown.needsRefresh, 'true')
})

test('setup text with insert but no masonry generates setup blocker warnings', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    existingSetup: 'old insert needs to be replaced',
  }), now)

  const hasBlocker = opportunity.warnings.some((w) =>
    /insert|appliance type|setup|unknown/i.test(w),
  )
  assert.ok(hasBlocker, 'should have setup blocker in warnings')
})

test('setup blockers route to clarification path via recommendation', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    existingSetup: 'old insert needs to be replaced',
  }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'needs-setup-clarification')
  assert.equal(rec.path, 'missing-info-preproposal')
  assert.equal(rec.safe, false)
})

test('paid-closed opportunity recommendation is archive path', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'paid-closed' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'paid-closed-archive')
  assert.equal(rec.path, 'reference-only-guardrail')
  assert.equal(rec.safe, false)
})

test('reference-only recommendation blocks contact', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'reference-only' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'reference-only')
  assert.equal(rec.safe, false)
})

test('contact-complete warm opportunity recommends email follow-up', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'warm' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'draft-follow-up-email')
  assert.equal(rec.safe, true)
})

test('phone-only opportunity recommends call first', () => {
  const opportunity = createOldQuoteOpportunity(intake({ customerEmail: '' }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(rec.nextAction, 'call-first')
  assert.equal(rec.safe, true)
})

test('recovery follow-up draft excludes sensitive internal language', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'warm' }), now)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'reactivation', channel: 'email' })
  const combined = `${draft.subject} ${draft.body}`

  assert.equal(
    /average cost|buy price|\bcost\b|margin|supplier|product rank|sales rank|fuzzy match|ocr|bistrack/i.test(combined),
    false,
    'draft should not contain sensitive internal terms',
  )
})

test('recovery follow-up draft includes refresh language for old quotes', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    recoveryClassification: 'warm',
    quoteDate: '01/01/2025',
  }), now)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'reactivation', channel: 'email' })

  assert.match(draft.body, /wanted to follow up|project|revisit/i)
})

test('reference-only draft is marked unsafe to send', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'reference-only' }), now)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'warm', channel: 'email' })

  assert.equal(draft.unsafeToSend, true)
})

test('isSafeActivityForStatus blocks active follow-up actions on closed records', () => {
  assert.equal(isSafeActivityForStatus('follow-up-sent', 'reference-only'), false)
  assert.equal(isSafeActivityForStatus('proposal-sent', 'closed-won'), false)
  assert.equal(isSafeActivityForStatus('phone-call', 'reference-only'), false)
  assert.equal(isSafeActivityForStatus('phone-call', 'closed-lost'), false)
})

test('isSafeActivityForStatus allows notes on closed records', () => {
  assert.equal(isSafeActivityForStatus('note', 'reference-only'), true)
  assert.equal(isSafeActivityForStatus('follow-up-draft', 'reference-only'), true)
  assert.equal(isSafeActivityForStatus('note', 'closed-won'), true)
})

test('isSafeActivityForStatus allows all activity types on open records', () => {
  assert.equal(isSafeActivityForStatus('follow-up-sent', 'follow-up-needed'), true)
  assert.equal(isSafeActivityForStatus('phone-call', 'needs-review'), true)
  assert.equal(isSafeActivityForStatus('proposal-sent', 'ready-for-proposal'), true)
})

test('intake opportunity does not expose sensitive internal fields', () => {
  const opportunity = createOldQuoteOpportunity(intake(), now)
  const serialized = JSON.stringify(opportunity)

  assert.equal(
    /averageCost|standardBuy|estimatedMargin|productRank|inventoryTurns|salesRank|fuzzyMatch/i.test(serialized),
    false,
    'serialized opportunity should not contain sensitive internal fields',
  )
})

test('internalNotes stored on opportunity but not in customer-facing fields', () => {
  const opportunity = createOldQuoteOpportunity(intake({ internalNotes: 'Do not call before 10am' }), now)

  assert.equal(opportunity.internalNotes, 'Do not call before 10am')
  assert.ok(!Object.prototype.hasOwnProperty.call(opportunity, 'PROJECT_NOTES'), 'raw field keys should not be stored')
})

test('hot classification maps to hot temperature', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'hot' }), now)
  assert.equal(opportunity.temperature, 'hot')
})

test('cool classification maps to cool temperature on old quote', () => {
  const opportunity = createOldQuoteOpportunity(intake({ recoveryClassification: 'cool' }), now)
  assert.equal(opportunity.temperature, 'cool')
})

test('source metadata is stored safely without raw OCR text', () => {
  const opportunity = createOldQuoteOpportunity(intake({ sourceFileNote: 'Scanned 2025 folder/Q1001.pdf' }), now)

  assert.equal(opportunity.sourceType, 'old-quote-recovery')
  assert.ok(opportunity.sourceFileName || opportunity.sourceLabel, 'source reference should be stored')
  const serialized = JSON.stringify(opportunity)
  assert.equal(/RAW OCR|rawOcr/i.test(serialized), false)
})

test('uploaded opportunity stores source trail and reviewed flag internally', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    sourceType: 'scan',
    sourceFileNote: 'old-scan.pdf',
    sourceTrailNote: 'Source file: old-scan.pdf | Intake type: scan',
    sourceWarnings: ['Review extracted text before follow-up.'],
    reviewedForFollowUp: false,
  }), now)

  assert.equal(opportunity.sourceType, 'scan')
  assert.equal(opportunity.sourceFileName, 'old-scan.pdf')
  assert.equal(opportunity.reviewedForFollowUp, 'false')
  assert.match(opportunity.sourceTrailNote, /old-scan\.pdf/)
  assert.ok(opportunity.warnings.some((warning) => /review extracted text/i.test(warning)))
})

test('reviewedForFollowUp gates uploaded draft generation', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    sourceType: 'scan',
    sourceFileNote: 'old-scan.pdf',
    reviewedForFollowUp: false,
  }), now)
  const rec = deriveRecoveryRecommendation(opportunity)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'reactivation', channel: 'email' })

  assert.equal(rec.nextAction, 'review-uploaded-source')
  assert.equal(rec.safe, false)
  assert.equal(draft.unsafeToSend, true)
  assert.equal(draft.body, '')
})

test('reviewed uploaded opportunity can use existing recovery recommendation path', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    sourceType: 'pdf',
    sourceFileNote: 'old-quote.pdf',
    reviewedForFollowUp: true,
  }), now)
  const rec = deriveRecoveryRecommendation(opportunity)

  assert.equal(opportunity.reviewedForFollowUp, 'true')
  assert.equal(rec.nextAction, 'draft-follow-up-email')
  assert.equal(rec.safe, true)
})

test('uploaded opportunity appears in same recovery queue model as manual opportunity', () => {
  const manual = createOldQuoteOpportunity(intake({ quoteNumber: 'M-1' }), now)
  const uploaded = createOldQuoteOpportunity(intake({
    quoteNumber: 'U-1',
    sourceType: 'image',
    sourceFileNote: 'photo.jpg',
    reviewedForFollowUp: true,
  }), now)

  assert.equal(manual.recoverySource, 'true')
  assert.equal(uploaded.recoverySource, 'true')
  assert.ok([manual, uploaded].every((item) => item.id && item.status))
})

test('source trail is internal and does not alter customer-facing draft copy', () => {
  const opportunity = createOldQuoteOpportunity(intake({
    sourceType: 'scan',
    sourceTrailNote: 'Source file: private-folder/old.pdf | Intake type: scan',
    reviewedForFollowUp: true,
  }), now)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'reactivation', channel: 'email' })
  const combined = `${draft.subject} ${draft.body}`

  assert.equal(/private-folder|source file|intake type/i.test(combined), false)
})

test('Quote Polish opportunities block follow-up until reviewed', () => {
  const opportunity = {
    sourceType: 'quote-polish',
    reviewedForFollowUp: 'false',
    customerName: 'Active Customer',
    customerEmail: 'active@example.com',
    customerPhone: '815-555-0100',
    lineItemQuoteAttached: 'true',
    proposalReadiness: 'ready',
    warnings: [],
  }
  const rec = deriveRecoveryRecommendation(opportunity)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'warm', channel: 'email' })

  assert.equal(rec.nextAction, 'review-uploaded-source')
  assert.equal(rec.safe, false)
  assert.equal(draft.unsafeToSend, true)
  assert.equal(draft.body, '')
})

test('Quote Polish opportunities block follow-up until line-item quote attachment is confirmed', () => {
  const opportunity = {
    sourceType: 'quote-polish',
    reviewedForFollowUp: 'true',
    customerName: 'Active Customer',
    customerEmail: 'active@example.com',
    customerPhone: '815-555-0100',
    lineItemQuoteAttached: 'false',
    proposalReadiness: 'ready',
    warnings: [],
  }
  const rec = deriveRecoveryRecommendation(opportunity)
  const draft = getRecoveryFollowUpDraft(opportunity, { tone: 'warm', channel: 'email' })

  assert.equal(rec.nextAction, 'confirm-line-item-quote')
  assert.equal(rec.safe, false)
  assert.equal(draft.unsafeToSend, true)
  assert.equal(draft.body, '')
})
