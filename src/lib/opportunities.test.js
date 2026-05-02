import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOpportunityFromCurrentQuote,
  createOpportunityDraftsFromPackets,
  filterQueueOpportunities,
  findOpportunityDuplicate,
  getLineItemAttachmentWarning,
  getOpportunityNextActionLabel,
  getOpportunityReadinessBadge,
  getOpportunitySourceLabel,
  getQueueEmptyState,
  getQueueFilterCounts,
  getLatestActivitySummary,
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

test('queue filters segment active quotes and recovery quotes by source type', () => {
  const active = { id: 'active', sourceType: 'quote-polish', recoverySource: 'true' }
  const manual = { id: 'manual', sourceType: 'manual', recoverySource: 'true' }
  const upload = { id: 'upload', sourceType: 'pdf', recoverySource: 'true' }
  const bulk = { id: 'bulk', sourceType: 'bulk-scan', recoverySource: 'true' }
  const opportunities = [active, manual, upload, bulk]

  assert.deepEqual(filterQueueOpportunities(opportunities, 'active-quotes').map((item) => item.id), ['active'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'recovery-quotes').map((item) => item.id), ['manual', 'upload', 'bulk'])
})

test('queue filters readiness follow-up blocked waiting and temperature lanes', () => {
  const opportunities = [
    { id: 'ready', status: 'ready-for-proposal', proposalReadiness: 'ready', temperature: 'hot', customerName: 'Ready', customerEmail: 'ready@example.com' },
    { id: 'follow', status: 'follow-up-needed', temperature: 'warm', customerName: 'Follow', customerEmail: 'follow@example.com' },
    { id: 'blocked', status: 'needs-review', proposalReadiness: 'blocked', customerName: '', customerEmail: '', customerPhone: '' },
    { id: 'waiting', status: 'waiting-on-customer', temperature: 'warm', customerName: 'Waiting', customerEmail: 'wait@example.com' },
    { id: 'cool', status: 'follow-up-needed', temperature: 'cool', customerName: 'Cool', customerEmail: 'cool@example.com' },
  ]

  assert.deepEqual(filterQueueOpportunities(opportunities, 'ready-for-proposal').map((item) => item.id), ['ready'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'follow-up-needed').map((item) => item.id), ['follow', 'cool'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'blocked-missing-info').map((item) => item.id), ['blocked'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'waiting-on-customer').map((item) => item.id), ['waiting'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'hot').map((item) => item.id), ['ready'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'warm').map((item) => item.id), ['follow', 'waiting'])
  assert.deepEqual(filterQueueOpportunities(opportunities, 'cool').map((item) => item.id), ['cool'])
})

test('queue source labels cover Quote Polish manual upload bulk and scanned intake', () => {
  assert.equal(getOpportunitySourceLabel({ sourceType: 'quote-polish' }), 'Quote Polish / Active BisTrack Quote')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'manual' }), 'Manual Recovery')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'pdf' }), 'Uploaded Old Quote')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'bulk-pdf' }), 'Bulk Uploaded Old Quote')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'bulk-scan' }), 'Bulk Uploaded Old Quote / Scanned Intake')
  assert.equal(getOpportunitySourceLabel({ sourceType: 'scan' }), 'Uploaded Old Quote / Scanned Intake')
})

test('queue badges warnings and next actions are generated from existing fields', () => {
  const missingAttachment = {
    sourceType: 'quote-polish',
    lineItemQuoteAttached: 'false',
    status: 'needs-review',
    proposalReadiness: 'blocked',
    customerName: 'Active Customer',
    customerEmail: 'active@example.com',
  }
  const missingContactRecord = { customerName: '', customerEmail: '', customerPhone: '', status: 'needs-review' }
  const waitingRecord = { status: 'waiting-on-customer', customerName: 'Waiting Customer', customerEmail: 'wait@example.com' }
  const oldFollowUp = { status: 'follow-up-needed', needsRefresh: 'true', customerName: 'Old Customer', customerEmail: 'old@example.com' }
  const readyRecord = { status: 'ready-for-proposal', proposalReadiness: 'ready', customerName: 'Ready Customer', customerEmail: 'ready@example.com' }

  assert.equal(getLineItemAttachmentWarning(missingAttachment), 'Line-item quote attachment not confirmed')
  assert.equal(getOpportunityReadinessBadge(missingAttachment).label, 'Line-Item Quote Needed')
  assert.equal(getOpportunityNextActionLabel(missingAttachment), 'Confirm original BisTrack quote before sending')
  assert.equal(getOpportunityReadinessBadge(missingContactRecord).label, 'Missing Info')
  assert.equal(getOpportunityNextActionLabel(missingContactRecord), 'Review missing contact info')
  assert.equal(getOpportunityReadinessBadge(waitingRecord).label, 'Sent / Waiting')
  assert.equal(getOpportunityNextActionLabel(waitingRecord), 'Waiting on customer')
  assert.equal(getOpportunityNextActionLabel(oldFollowUp), 'Refresh old quote pricing before follow-up')
  assert.equal(getOpportunityReadinessBadge(readyRecord).label, 'Ready for Proposal')
  assert.equal(getOpportunityNextActionLabel(readyRecord), 'Prepare proposal')
})

test('queue helper counts and empty states stay sales-specific', () => {
  const opportunities = [
    { id: 'active', sourceType: 'quote-polish', recoverySource: 'true', status: 'ready-for-proposal', proposalReadiness: 'ready', temperature: 'hot' },
    { id: 'recovery', sourceType: 'manual', recoverySource: 'true', status: 'follow-up-needed', temperature: 'warm' },
  ]
  const counts = getQueueFilterCounts(opportunities)

  assert.equal(counts.all, 2)
  assert.equal(counts['active-quotes'], 1)
  assert.equal(counts['recovery-quotes'], 1)
  assert.match(getQueueEmptyState('active-quotes').body, /Quote Polish/)
  assert.match(getQueueEmptyState('recovery-quotes').body, /Manual Entry, Upload Old Quote, or Bulk Upload/)
  assert.match(getQueueEmptyState('ready-for-proposal').title, /Nothing ready for proposal/)
})

test('latest activity summary prefers activity type and date then waiting state', () => {
  assert.equal(getLatestActivitySummary({
    type: 'phone-call',
    createdAt: '2026-04-29T12:00:00.000Z',
  }), 'Phone Call - Apr 29, 2026')
  assert.equal(getLatestActivitySummary(null, { lastContactedAt: '2026-04-28' }), 'Last contacted 2026-04-28')
  assert.equal(getLatestActivitySummary(null, { status: 'waiting-on-customer' }), 'Waiting on customer')
})
