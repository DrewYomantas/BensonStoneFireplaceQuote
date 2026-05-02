import assert from 'node:assert/strict'
import test from 'node:test'
import { recoveryIntakeFromParsedQuote, summarizeRecoveryUploadDrafts } from './recoveryUploadIntake.js'

function parsed(overrides = {}) {
  return {
    fields: {
      CUSTOMER_NAME: 'Upload Customer',
      CUSTOMER_EMAIL: 'upload@example.com',
      CUSTOMER_PHONE: '815-555-0200',
      QUOTE_NO: 'Q-2222',
      QUOTE_DATE: '03/20/2025',
      TOTAL_AMOUNT: '$4,500.00',
      QUOTATION_TOTAL: '$4,850.00',
      PROJECT_TITLE: 'Fireplace Refresh',
      PROJECT_SCOPE_SUMMARY: 'Customer wants to revisit the fireplace update.',
      INSTALLATION_SCOPE: 'Existing masonry fireplace.',
      PROJECT_NOTES: 'Napoleon insert and liner package.',
      ...overrides.fields,
    },
    context: { documentType: 'quote', outputLabel: 'Fireplace Project Proposal', itemMix: 'fireplace', ...overrides.context },
    lineItems: overrides.lineItems || [{ description: 'Napoleon insert' }],
    extractionConfidence: overrides.extractionConfidence || 'medium',
    documentType: overrides.documentType || 'quote',
  }
}

test('uploaded OCR recovery draft maps to safe opportunity intake fields', () => {
  const intake = recoveryIntakeFromParsedQuote({
    fileName: 'old-quote.pdf',
    fileType: 'application/pdf',
    parsed: parsed(),
    ocrConfidence: 82,
    usedOcr: true,
  })

  assert.equal(intake.customerName, 'Upload Customer')
  assert.equal(intake.quoteNumber, 'Q-2222')
  assert.equal(intake.originalQuoteAmount, '$4,500.00')
  assert.equal(intake.quotationTotal, '$4,850.00')
  assert.equal(intake.sourceType, 'scan')
  assert.equal(intake.reviewedForFollowUp, false)
  assert.match(intake.sourceTrailNote, /old-quote\.pdf/)
})

test('raw OCR text is not mapped into recovery intake metadata', () => {
  const intake = recoveryIntakeFromParsedQuote({
    fileName: 'scan.png',
    fileType: 'image/png',
    parsed: parsed({ context: { rawText: 'RAW OCR TEXT SHOULD NOT PERSIST' } }),
    ocrConfidence: 61,
    usedOcr: true,
  })

  const serialized = JSON.stringify(intake)
  assert.equal(/RAW OCR TEXT SHOULD NOT PERSIST/i.test(serialized), false)
  assert.equal(intake.sourceType, 'image')
})

test('missing contact and low confidence produce internal source warnings', () => {
  const intake = recoveryIntakeFromParsedQuote({
    fileName: 'low-confidence.pdf',
    fileType: 'application/pdf',
    parsed: parsed({ fields: { CUSTOMER_NAME: '', CUSTOMER_EMAIL: '', CUSTOMER_PHONE: '' }, lineItems: [] }),
    ocrConfidence: 42,
    usedOcr: true,
  })

  assert.ok(intake.sourceWarnings.some((warning) => /low OCR confidence/i.test(warning)))
  assert.ok(intake.sourceWarnings.some((warning) => /Missing contact info/i.test(warning)))
  assert.equal(intake.recoveryClassification, 'missing-contact')
})

test('paid or closed uploaded records classify as paid closed', () => {
  const intake = recoveryIntakeFromParsedQuote({
    fileName: 'paid-order.pdf',
    fileType: 'application/pdf',
    parsed: parsed({
      fields: { BALANCE_DUE: '$0.00' },
      context: { documentType: 'order', fullyPaid: true },
      documentType: 'order',
    }),
    usedOcr: false,
  })

  assert.equal(intake.recoveryClassification, 'paid-closed')
})

test('bulk recovery upload summary counts review states without raw text', () => {
  const reviewed = recoveryIntakeFromParsedQuote({ fileName: 'reviewed.pdf', parsed: parsed() })
  reviewed.reviewedForFollowUp = true
  const missing = recoveryIntakeFromParsedQuote({
    fileName: 'missing.pdf',
    parsed: parsed({ fields: { CUSTOMER_NAME: '', CUSTOMER_EMAIL: '', CUSTOMER_PHONE: '' } }),
  })
  const summary = summarizeRecoveryUploadDrafts([
    { id: '1', status: 'ready-for-review', intake: reviewed },
    { id: '2', status: 'ready-for-review', intake: missing },
    { id: '3', status: 'error', intake: recoveryIntakeFromParsedQuote({ fileName: 'bad.pdf' }), error: 'Unreadable' },
  ])

  assert.equal(summary.draftCount, 3)
  assert.equal(summary.readyForReview, 2)
  assert.equal(summary.reviewed, 1)
  assert.equal(summary.missingContact, 2)
  assert.equal(summary.errors, 1)
})
