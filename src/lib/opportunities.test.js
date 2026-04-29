import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOpportunityFromCurrentQuote,
  createOpportunityDraftsFromPackets,
  findOpportunityDuplicate,
  getSafeBulkAddDrafts,
  listOpportunities,
  removeOpportunity,
  saveOpportunity,
  updateOpportunity,
} from './opportunities.js'

const now = '2026-04-29T12:00:00.000Z'

function storageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

function fields(overrides = {}) {
  return {
    CUSTOMER_NAME: 'Sample Customer',
    CUSTOMER_PHONE: '815-555-0100',
    QUOTE_NO: '700001',
    QUOTE_DATE: '04/20/2026',
    INSTALLATION_SCOPE: 'Install fireplace with approved venting path.',
    QUOTATION_TOTAL: '$6,500.00',
    ...overrides,
  }
}

function productIntel(overrides = {}) {
  return {
    needsReviewCount: 0,
    groupedRows: [{ group: 'Fireplace Unit', rows: [] }, { group: 'Venting / Chimney', rows: [] }],
    ...overrides,
  }
}

function recommendation(overrides = {}) {
  return {
    id: 'warm-showroom-recap',
    warnings: ['Sensitive BisTrack fields excluded from customer export.'],
    ...overrides,
  }
}

test('complete active quote becomes ready-for-proposal', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields(),
    parseContext: { documentType: 'quote', itemMix: 'fireplace' },
    productIntelligence: productIntel(),
    playbookRecommendation: recommendation(),
    now,
  })

  assert.equal(opportunity.status, 'ready-for-proposal')
  assert.equal(opportunity.proposalReadiness, 'ready')
  assert.equal(opportunity.temperature, 'hot')
})

test('old open quote becomes follow-up-needed', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields({ QUOTE_DATE: '10/01/2025' }),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    playbookRecommendation: recommendation({ id: 'old-quote-re-engagement', warnings: ['Customer-facing proposal may need quote refresh before sending.'] }),
    now,
  })

  assert.equal(opportunity.status, 'follow-up-needed')
  assert.equal(opportunity.temperature, 'cool')
})

test('missing customer contact becomes needs-review', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields({ CUSTOMER_PHONE: '' }),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    playbookRecommendation: recommendation({ warnings: ['Missing customer email or phone. Confirm preferred contact before sending.'] }),
    now,
  })

  assert.equal(opportunity.status, 'needs-review')
  assert.equal(opportunity.proposalReadiness, 'blocked')
})

test('paid closed context becomes reference-only', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields({ BALANCE_DUE: '$0.00', AMOUNT_PAID: '$6,500.00' }),
    parseContext: { documentType: 'bill', fullyPaid: true },
    productIntelligence: productIntel(),
    playbookRecommendation: recommendation({ id: 'paid-order-summary', warnings: ['Quote appears paid/closed/reference. Do not treat it as an active proposal without confirmation.'] }),
    now,
  })

  assert.equal(opportunity.status, 'reference-only')
  assert.ok(opportunity.warnings.some((warning) => /paid\/closed\/reference/i.test(warning)))
})

test('product match review warning prevents ready classification', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel({ needsReviewCount: 1 }),
    playbookRecommendation: recommendation({ warnings: ['Product match needs review before presenting selections as confirmed.'] }),
    now,
  })

  assert.equal(opportunity.status, 'needs-review')
  assert.notEqual(opportunity.proposalReadiness, 'ready')
})

test('opportunity object does not store sensitive product metrics', () => {
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: {
      needsReviewCount: 0,
      rows: [{ averageCostWithAdd: 100, standardBuy: 80, estimatedMarginPctAtStandardSell: 0.4, productRankSnapshot: 1 }],
      groupedRows: [{ group: 'Fireplace Unit', rows: [] }],
    },
    playbookRecommendation: recommendation(),
    now,
  })

  const serialized = JSON.stringify(opportunity)
  assert.equal(/averageCost|standardBuy|estimatedMargin|productRank|inventoryTurns|supplier/i.test(serialized), false)
})

test('local persistence helpers save list update and remove opportunities', () => {
  const storage = storageMock()
  const opportunity = createOpportunityFromCurrentQuote({
    fields: fields(),
    parseContext: { documentType: 'quote' },
    productIntelligence: productIntel(),
    playbookRecommendation: recommendation(),
    now,
  })

  saveOpportunity(opportunity, storage)
  assert.equal(listOpportunities(storage).length, 1)
  const updated = updateOpportunity(opportunity.id, { status: 'waiting-on-customer', nextAction: 'Call customer' }, storage)
  assert.equal(updated.status, 'waiting-on-customer')
  assert.equal(listOpportunities(storage)[0].nextAction, 'Call customer')
  removeOpportunity(opportunity.id, storage)
  assert.equal(listOpportunities(storage).length, 0)
})

test('bulk intake creates draft opportunities from multiple packet candidates', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '800001', lastQuoteDate: '01/10/2026', customerName: 'A Customer', customerPhone: '815-555-0101', quoteTotal: '$4,000.00' },
          { pageNumber: 2, quoteNo: '800002', lastQuoteDate: '01/11/2026', customerName: 'B Customer', customerPhone: '815-555-0102', quoteTotal: '$5,000.00' },
        ],
      },
    ],
    existingOpportunities: [],
    now,
  })

  assert.equal(result.importedPacketCount, 1)
  assert.equal(result.drafts.length, 2)
  assert.equal(result.summary.draftCount, 2)
})

test('exact quote number duplicate is high-confidence duplicate', () => {
  const duplicate = findOpportunityDuplicate(
    { quoteNumber: '700001', customerName: 'Sample Customer' },
    [{ id: 'existing', quoteNumber: '700001', customerName: 'Sample Customer' }],
  )

  assert.equal(duplicate.isDuplicate, true)
  assert.equal(duplicate.confidence, 'high')
  assert.equal(duplicate.duplicateId, 'existing')
})

test('same customer contact duplicate is detected', () => {
  const duplicate = findOpportunityDuplicate(
    { customerPhone: '815.555.0100', customerName: 'Other Name' },
    [{ id: 'existing', customerPhone: '(815) 555-0100', customerName: 'Sample Customer' }],
  )

  assert.equal(duplicate.isDuplicate, true)
  assert.equal(duplicate.confidence, 'high')
})

test('uncertain duplicate becomes needs review', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '700001', lastQuoteDate: '01/10/2026', customerName: 'Different Customer', customerPhone: '', quoteTotal: '$4,000.00' },
        ],
      },
    ],
    existingOpportunities: [{ id: 'existing', quoteNumber: '700001', customerName: 'Sample Customer' }],
    now,
  })

  assert.equal(result.drafts[0].duplicate.confidence, 'medium')
  assert.equal(result.drafts[0].opportunity.status, 'needs-review')
  assert.ok(result.drafts[0].opportunity.warnings.some((warning) => /duplicate requires review/i.test(warning)))
})

test('high-confidence duplicate does not silently merge unsafe fields', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '700001', lastQuoteDate: '01/10/2026', customerName: 'Different Customer', customerPhone: '815-555-9999', quoteTotal: '$4,000.00' },
        ],
      },
    ],
    existingOpportunities: [{ id: 'existing', quoteNumber: '700001', customerName: 'Sample Customer' }],
    now,
  })

  assert.equal(result.drafts[0].duplicate.isDuplicate, true)
  assert.equal(result.drafts[0].opportunity.customerName, 'Different Customer')
  assert.equal(result.drafts[0].duplicate.duplicateId, 'existing')
})

test('add-all-safe excludes duplicates needing review', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '800001', lastQuoteDate: '01/10/2026', customerName: 'A Customer', customerPhone: '815-555-0101', quoteTotal: '$4,000.00' },
          { pageNumber: 2, quoteNo: '700001', lastQuoteDate: '01/10/2026', customerName: 'Different Customer', customerPhone: '', quoteTotal: '$4,000.00' },
        ],
      },
    ],
    existingOpportunities: [{ id: 'existing', quoteNumber: '700001', customerName: 'Sample Customer' }],
    now,
  })

  const safe = getSafeBulkAddDrafts(result.drafts)
  assert.equal(safe.length, 1)
  assert.equal(safe[0].opportunity.quoteNumber, '800001')
})

test('source metadata is stored safely', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '800001', lastQuoteDate: '01/10/2026', customerName: 'A Customer', customerPhone: '815-555-0101', quoteTotal: '$4,000.00' },
        ],
      },
    ],
    existingOpportunities: [],
    now,
  })

  const opportunity = result.drafts[0].opportunity
  assert.equal(opportunity.sourceType, 'ocr-packet')
  assert.equal(opportunity.sourceFileName, 'packet-a.pdf')
  assert.ok(opportunity.sourceLabel.includes('Page 1'))
})

test('raw OCR text PDF data and private product metrics are not stored in bulk opportunities', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        pages: [
          {
            pageNumber: 1,
            text: 'RAW OCR SHOULD NOT STORE',
            recommendation: 'Follow-up candidate',
            documentNumber: '800001',
            documentDate: '01/10/2026',
            customerName: 'A Customer',
            ocrConfidence: 88,
            parsed: {
              fields: { CUSTOMER_PHONE: '815-555-0101', QUOTATION_TOTAL: '$4,000.00' },
              warnings: ['Short safe warning'],
            },
            classification: { label: 'Quote' },
          },
        ],
      },
    ],
    existingOpportunities: [],
    now,
  })

  const serialized = JSON.stringify(result.drafts[0].opportunity)
  assert.equal(/RAW OCR|averageCost|standardBuy|estimatedMargin|productRank|supplier|\.pdf bytes/i.test(serialized), false)
})

test('reference-only packets are classified conservatively', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        pages: [
          {
            pageNumber: 1,
            recommendation: 'Paid / closed',
            status: 'Paid / Closed',
            documentNumber: '800001',
            documentDate: '01/10/2026',
            customerName: 'A Customer',
            parsed: { fields: { CUSTOMER_PHONE: '815-555-0101', BALANCE_DUE: '$0.00', AMOUNT_PAID: '$4,000.00' }, warnings: [] },
            classification: { label: 'Paid order' },
          },
        ],
      },
    ],
    existingOpportunities: [],
    now,
  })

  assert.equal(result.drafts[0].opportunity.status, 'reference-only')
})

test('missing customer identity or contact prevents ready classification in bulk intake', () => {
  const result = createOpportunityDraftsFromPackets({
    packets: [
      {
        fileName: 'packet-a.pdf',
        followUpItems: [
          { pageNumber: 1, quoteNo: '800001', lastQuoteDate: '01/10/2026', customerName: '', customerPhone: '', quoteTotal: '$4,000.00' },
        ],
      },
    ],
    existingOpportunities: [],
    now,
  })

  assert.equal(result.drafts[0].opportunity.status, 'needs-review')
  assert.notEqual(result.drafts[0].opportunity.proposalReadiness, 'ready')
})
