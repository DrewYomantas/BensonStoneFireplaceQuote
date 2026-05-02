import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWorkspaceSourceSummary,
  getWorkspaceReadinessWarnings,
  getWorkspaceProposalPanel,
  getWorkspaceVendorRef,
  opportunityToQuoteFields,
} from './opportunityWorkspace.js'

// ── opportunityToQuoteFields ─────────────────────────────────────

describe('opportunityToQuoteFields', () => {
  it('maps opportunity text fields to BisTrack-style keys', () => {
    const opp = {
      projectTitle: 'Gas Insert',
      productsNotes: 'Kingsman ZRB46',
      existingSetup: 'Wood burning',
      desiredOutcome: 'Convert to gas',
    }
    const fields = opportunityToQuoteFields(opp)
    assert.equal(fields.PROJECT_TITLE, 'Gas Insert')
    assert.equal(fields.PROJECT_SCOPE_SUMMARY, 'Kingsman ZRB46')
    assert.equal(fields.INSTALLATION_SCOPE, 'Wood burning')
    assert.equal(fields.PROJECT_NOTES, 'Convert to gas')
  })

  it('returns empty strings for missing fields', () => {
    const fields = opportunityToQuoteFields({})
    assert.equal(fields.PROJECT_TITLE, '')
    assert.equal(fields.PROJECT_SCOPE_SUMMARY, '')
    assert.equal(fields.INSTALLATION_SCOPE, '')
    assert.equal(fields.PROJECT_NOTES, '')
  })
})

// ── getWorkspaceSourceSummary ────────────────────────────────────

describe('getWorkspaceSourceSummary', () => {
  it('labels active quote polish records correctly', () => {
    const result = getWorkspaceSourceSummary({ sourceType: 'quote-polish', createdAt: '2024-01-01' })
    assert.equal(result.sourceTypeLabel, 'Active BisTrack Quote')
    assert.equal(result.isActive, true)
    assert.equal(result.isRecovery, false)
  })

  it('labels manual recovery records correctly', () => {
    const result = getWorkspaceSourceSummary({ sourceType: 'manual', recoverySource: 'true' })
    assert.equal(result.sourceTypeLabel, 'Manual Recovery Entry')
    assert.equal(result.isManual, true)
    assert.equal(result.isActive, false)
  })

  it('labels bulk upload records correctly', () => {
    const result = getWorkspaceSourceSummary({ sourceType: 'bulk-upload', recoverySource: 'true' })
    assert.equal(result.sourceTypeLabel, 'Bulk Uploaded Old Quote')
    assert.equal(result.isBulk, true)
  })

  it('labels uploaded old quote records', () => {
    const result = getWorkspaceSourceSummary({ sourceType: 'single-upload', recoverySource: 'true' })
    assert.equal(result.sourceTypeLabel, 'Uploaded Old Quote')
    assert.equal(result.isUploaded, true)
  })

  it('strips unsafe path separators from safeFileName', () => {
    const result = getWorkspaceSourceSummary({ sourceFileName: 'C:\\Users\\Drew\\old-quote.pdf' })
    assert.ok(!result.safeFileName.includes('\\'))
    assert.ok(!result.safeFileName.includes('/'))
  })

  it('does not expose raw file paths with drive letters', () => {
    const result = getWorkspaceSourceSummary({ sourceFileName: 'C:/private/Fireplace Department/price.pdf' })
    assert.ok(!result.safeFileName.startsWith('C:'))
  })
})

// ── getWorkspaceReadinessWarnings ────────────────────────────────

describe('getWorkspaceReadinessWarnings', () => {
  it('returns empty array for a fully ready record', () => {
    const opp = {
      customerEmail: 'a@b.com',
      lineItemQuoteAttached: 'true',
      needsRefresh: 'false',
      reviewedForFollowUp: 'true',
      status: 'ready-for-proposal',
      warnings: [],
    }
    assert.deepEqual(getWorkspaceReadinessWarnings(opp), [])
  })

  it('warns when contact info is missing', () => {
    const warnings = getWorkspaceReadinessWarnings({ warnings: [] })
    assert.ok(warnings.some((w) => /contact/i.test(w)))
  })

  it('warns when line item quote is not confirmed', () => {
    const warnings = getWorkspaceReadinessWarnings({ lineItemQuoteAttached: 'false', warnings: [] })
    assert.ok(warnings.some((w) => /line-item/i.test(w)))
  })

  it('warns when quote needs refresh', () => {
    const warnings = getWorkspaceReadinessWarnings({ needsRefresh: 'true', warnings: [] })
    assert.ok(warnings.some((w) => /refresh/i.test(w)))
  })

  it('warns for paid-closed classification', () => {
    const warnings = getWorkspaceReadinessWarnings({ recoveryClassification: 'paid-closed', warnings: [] })
    assert.ok(warnings.some((w) => /reference or closed/i.test(w)))
  })

  it('warns when status is needs-review', () => {
    const warnings = getWorkspaceReadinessWarnings({ status: 'needs-review', warnings: [] })
    assert.ok(warnings.some((w) => /needs review/i.test(w)))
  })

  it('does not include Sensitive BisTrack fields in warnings', () => {
    const warnings = getWorkspaceReadinessWarnings({
      warnings: ['Sensitive BisTrack fields — do not expose to customer.'],
    })
    assert.ok(!warnings.some((w) => /Sensitive BisTrack/i.test(w)))
  })
})

// ── getWorkspaceProposalPanel ────────────────────────────────────

describe('getWorkspaceProposalPanel', () => {
  it('returns inactive panel for non-quote-polish records', () => {
    const panel = getWorkspaceProposalPanel({ sourceType: 'manual' })
    assert.equal(panel.isActive, false)
    assert.ok(panel.nextStep)
  })

  it('returns ready state for reviewed quote-polish record with line items', () => {
    const panel = getWorkspaceProposalPanel({
      sourceType: 'quote-polish',
      proposalReviewState: 'reviewed',
      lineItemQuoteAttached: 'true',
      proposalMode: 'detailed',
    })
    assert.equal(panel.isActive, true)
    assert.equal(panel.readinessTone, 'ready')
    assert.ok(panel.nextStep.toLowerCase().includes('ready'))
  })

  it('returns blocked state for unresolved review', () => {
    const panel = getWorkspaceProposalPanel({
      sourceType: 'quote-polish',
      proposalReviewState: 'unresolved',
    })
    assert.equal(panel.readinessTone, 'blocked')
  })

  it('maps proposalMode to human-readable label', () => {
    const panel = getWorkspaceProposalPanel({
      sourceType: 'quote-polish',
      proposalReviewState: 'reviewed',
      proposalMode: 'summary',
    })
    assert.ok(panel.modeLabel.toLowerCase().includes('warm'))
  })
})

// ── getWorkspaceVendorRef ────────────────────────────────────────

describe('getWorkspaceVendorRef', () => {
  it('returns hasVendors false for empty array', () => {
    assert.equal(getWorkspaceVendorRef([]).hasVendors, false)
  })

  it('returns hasVendors false for null', () => {
    assert.equal(getWorkspaceVendorRef(null).hasVendors, false)
  })

  it('maps vendor to safe fields only', () => {
    const vendors = [{ id: 'v1', name: 'TestCo', category: 'Gas Inserts', priceListDate: '2024-01', dealerCost: 9999, filePath: '/private/path' }]
    const ref = getWorkspaceVendorRef(vendors)
    assert.equal(ref.hasVendors, true)
    assert.equal(ref.vendors.length, 1)
    assert.equal(ref.vendors[0].name, 'TestCo')
    // Internal-only fields must not be passed through
    assert.equal(ref.vendors[0].dealerCost, undefined)
    assert.equal(ref.vendors[0].filePath, undefined)
  })

  it('handles multiple vendors', () => {
    const vendors = [
      { id: 'v1', name: 'A', category: 'Gas Inserts', priceListDate: '' },
      { id: 'v2', name: 'B', category: 'Wood Stoves', priceListDate: '2024-06' },
    ]
    const ref = getWorkspaceVendorRef(vendors)
    assert.equal(ref.vendors.length, 2)
  })
})

// ── Customer-facing safety: workspace language must not leak ─────

describe('workspace safety — customer-facing leakage', () => {
  it('getWorkspaceSourceSummary output contains no internal pricing/cost terms', () => {
    const result = getWorkspaceSourceSummary({
      sourceType: 'quote-polish',
      sourceLabel: 'BisTrack Quote',
      sourceFileName: 'quote.pdf',
    })
    const serialized = JSON.stringify(result).toLowerCase()
    for (const term of ['dealer cost', 'margin', 'ocr']) {
      assert.ok(!serialized.includes(term), `Should not contain "${term}"`)
    }
  })

  it('getWorkspaceReadinessWarnings output contains no pricing leak terms', () => {
    const warnings = getWorkspaceReadinessWarnings({ warnings: [] })
    const text = warnings.join(' ').toLowerCase()
    for (const term of ['dealer cost', 'margin', 'supplier']) {
      assert.ok(!text.includes(term), `Warning should not contain "${term}"`)
    }
  })

  it('getWorkspaceVendorRef strips pricing and path fields', () => {
    const vendors = [{ id: 'v1', name: 'X', category: 'Gas', dealerCost: 500, priceBookPath: '/secret/path', filePath: '/secret', costFile: 'costs.xlsx' }]
    const ref = getWorkspaceVendorRef(vendors)
    const serialized = JSON.stringify(ref).toLowerCase()
    assert.ok(!serialized.includes('dealercost'))
    assert.ok(!serialized.includes('pricebookpath'))
    assert.ok(!serialized.includes('filepath'))
    assert.ok(!serialized.includes('costfile'))
  })
})
