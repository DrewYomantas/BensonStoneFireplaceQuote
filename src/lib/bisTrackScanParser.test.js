import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildScannedBisTrackIssues,
  detectScannedBisTrack,
  normalizeBisTrackMoney,
  parseBisTrackAddressBlocks,
  parseBisTrackHeaderFields,
  parseBisTrackLineItems,
  parseBisTrackScannedQuote,
  parseBisTrackTotals,
  scoreBisTrackScanExtraction,
} from './bisTrackScanParser.js'

// Simulated OCR text from "Receipt - Benson Stone Company - Jun 8, 2024.pdf"
// Matches the known visual truth: Quote 57535, Teresa Geiger, Amboy IL
const KNOWN_SCAN_OCR = `
BENSON STONE CO
Quotation
Quote No 57535
Quote Date 06/08/2024 3:06 PM
Customer ID 22054
Terms PrePaid
PO# INST - Lopi Northfield
Taken By Liam Milanos
Sales Rep Liam Milanos
Invoice Address
Teresa Geiger
1125 A Inlet
Amboy, Illinois, 61310
Delivery Address
1125 A Inlet
Amboy, Illinois, 61310
Line Product Code Description Qty Price Per Discount Total
1 99600086 LOPI Northfield Radiant MV New Iron Painted Gas Stove 1 EA 3036.00 EA 0.00 3036.00
2 46DVA48B D V 4x6 DVP 48 Length Black Chimney 1 EA 196.23 EA 0.00 196.23
3 Installation Fireplace Install Lopi Northfield & Vent Vertically - AMBOY 1 EA 0.00 0.00 1585.00
Note: Gas/Electric NOT Included
Total Amount $6,191.77
Sales Tax $403.09
Quotation Total $6,594.86
Balance Due $6,594.86
`.trim()

const DIGITAL_PDF_TEXT = `
BENSON STONE CO

Invoice Address

John Q Sample 100 Example Drive Rockford, Illinois, 61109

Order No Order Date Customer ID Terms PO# Delivery Taken By Sales Rep

Order 600001 04/25/2026 10:41 AM 99001 PrePaid Sample PO Tag By 04/25/2026 Liam Milanos Liam Milanos

Line Product Code Description Qty Price Per Discount Total

1 BS-FP Sample Product 1 EA 799.00 EA 0.00 799.00

Order Total $799.00
Balance Due $799.00
`.trim()

// --- detectScannedBisTrack ---

describe('detectScannedBisTrack', () => {
  it('flags no embedded text + BisTrack markers as likelyBisTrackScan', () => {
    const result = detectScannedBisTrack('', KNOWN_SCAN_OCR)
    assert.equal(result.isImageOnly, true)
    assert.equal(result.likelyBisTrackScan, true)
    assert.match(result.reason, /No embedded text/)
  })

  it('flags empty embedded text even without OCR text', () => {
    const result = detectScannedBisTrack('   ')
    assert.equal(result.isImageOnly, true)
    assert.equal(result.likelyBisTrackScan, false)
  })

  it('does not flag a digital PDF with embedded text', () => {
    const result = detectScannedBisTrack(DIGITAL_PDF_TEXT)
    assert.equal(result.isImageOnly, false)
    assert.equal(result.likelyBisTrackScan, false)
  })

  it('flags sparse embedded text with enough BisTrack markers', () => {
    const sparse = 'Benson Stone Quotation Quote No 57535 Invoice Address Balance Due'
    const result = detectScannedBisTrack(sparse)
    assert.equal(result.isImageOnly, false)
    assert.equal(result.likelyBisTrackScan, true)
  })
})

// --- normalizeBisTrackMoney ---

describe('normalizeBisTrackMoney', () => {
  it('parses formatted currency string', () => {
    assert.equal(normalizeBisTrackMoney('$6,594.86'), 6594.86)
    assert.equal(normalizeBisTrackMoney('403.09'), 403.09)
    assert.equal(normalizeBisTrackMoney('6,191.77'), 6191.77)
  })

  it('returns null for empty / null / garbage', () => {
    assert.equal(normalizeBisTrackMoney(''), null)
    assert.equal(normalizeBisTrackMoney(null), null)
    assert.equal(normalizeBisTrackMoney('abc'), null)
  })
})

// --- parseBisTrackHeaderFields ---

describe('parseBisTrackHeaderFields', () => {
  it('extracts all header fields from known scan OCR', () => {
    const h = parseBisTrackHeaderFields(KNOWN_SCAN_OCR)
    assert.equal(h.quoteNo, '57535')
    assert.equal(h.quoteDate, '06/08/2024 3:06 PM')
    assert.equal(h.customerId, '22054')
    assert.equal(h.terms, 'PrePaid')
    assert.equal(h.salesRep, 'Liam Milanos')
  })

  it('extracts PO# with INST prefix', () => {
    const h = parseBisTrackHeaderFields(KNOWN_SCAN_OCR)
    assert.match(h.poNumber, /INST.*Lopi Northfield/i)
  })

  it('returns empty strings for missing fields', () => {
    const h = parseBisTrackHeaderFields('Some unrelated text')
    assert.equal(h.quoteNo, '')
    assert.equal(h.customerId, '')
  })
})

// --- parseBisTrackAddressBlocks ---

describe('parseBisTrackAddressBlocks', () => {
  it('extracts invoice address fields', () => {
    const { invoice } = parseBisTrackAddressBlocks(KNOWN_SCAN_OCR)
    assert.equal(invoice.name, 'Teresa Geiger')
    assert.equal(invoice.addressLine1, '1125 A Inlet')
    assert.match(invoice.cityStateZip, /Amboy.*Illinois.*61310/i)
  })

  it('extracts delivery address when present', () => {
    const { delivery } = parseBisTrackAddressBlocks(KNOWN_SCAN_OCR)
    assert.equal(delivery.addressLine1, '1125 A Inlet')
    assert.match(delivery.cityStateZip, /61310/)
  })

  it('returns empty strings when anchors are absent', () => {
    const { invoice } = parseBisTrackAddressBlocks('Some text without address blocks')
    assert.equal(invoice.name, '')
    assert.equal(invoice.addressLine1, '')
  })
})

// --- parseBisTrackTotals ---

describe('parseBisTrackTotals', () => {
  it('extracts all money fields from known scan', () => {
    const t = parseBisTrackTotals(KNOWN_SCAN_OCR)
    assert.equal(t.totalAmount, 6191.77)
    assert.equal(t.salesTax, 403.09)
    assert.equal(t.quotationTotal, 6594.86)
    assert.equal(t.balanceDue, 6594.86)
    assert.equal(t.amountPaid, null)
  })

  it('returns null for missing fields', () => {
    const t = parseBisTrackTotals('No money here')
    assert.equal(t.totalAmount, null)
    assert.equal(t.quotationTotal, null)
  })
})

// --- parseBisTrackLineItems ---

describe('parseBisTrackLineItems', () => {
  it('parses LOPI Northfield product row', () => {
    const items = parseBisTrackLineItems(KNOWN_SCAN_OCR)
    const lopi = items.find((i) => i.code === '99600086')
    assert.ok(lopi, 'LOPI Northfield row not found')
    assert.match(lopi.description, /LOPI Northfield/i)
    assert.equal(lopi.qty, '1')
    assert.equal(lopi.total, '$3,036.00')
    assert.equal(lopi.isNote, false)
  })

  it('parses 46DVA48B chimney row', () => {
    const items = parseBisTrackLineItems(KNOWN_SCAN_OCR)
    const chimney = items.find((i) => i.code === '46DVA48B')
    assert.ok(chimney, '46DVA48B chimney row not found')
    assert.match(chimney.description, /DVP.*Chimney/i)
    assert.equal(chimney.total, '$196.23')
  })

  it('parses Installation Fireplace row', () => {
    const items = parseBisTrackLineItems(KNOWN_SCAN_OCR)
    const install = items.find((i) => i.code === 'Installation Fireplace')
    assert.ok(install, 'Installation Fireplace row not found')
    assert.match(install.description, /AMBOY/i)
    assert.equal(install.total, '$1,585.00')
  })

  it('parses Gas/Electric NOT Included note line', () => {
    const items = parseBisTrackLineItems(KNOWN_SCAN_OCR)
    const note = items.find((i) => i.isNote)
    assert.ok(note, 'Note line not found')
    assert.match(note.description, /Gas\/Electric NOT Included/i)
    assert.equal(note.code, 'NOTE')
  })

  it('returns empty array when no line header found', () => {
    const items = parseBisTrackLineItems('No table here')
    assert.equal(items.length, 0)
  })
})

// --- scoreBisTrackScanExtraction ---

describe('scoreBisTrackScanExtraction', () => {
  it('scores high when quote no + total + address + 3+ items are present', () => {
    const header = { quoteNo: '57535', quoteDate: '06/08/2024', customerId: '22054', terms: 'PrePaid', poNumber: 'INST - Lopi', salesRep: 'Liam Milanos' }
    const addresses = { invoice: { name: 'Teresa Geiger', addressLine1: '1125 A Inlet', cityStateZip: 'Amboy, Illinois, 61310' }, delivery: {} }
    const totals = { totalAmount: 6191.77, salesTax: 403.09, quotationTotal: 6594.86, balanceDue: 6594.86, amountPaid: null }
    const lineItems = [
      { isNote: false, total: '$3,036.00' },
      { isNote: false, total: '$196.23' },
      { isNote: false, total: '$1,585.00' },
      { isNote: true, total: '' },
    ]
    const score = scoreBisTrackScanExtraction({ header, addresses, totals, lineItems })
    assert.equal(score.overall, 'high')
    assert.equal(score.lineItems.count, 3)
    assert.equal(score.lineItems.notes, 1)
    assert.equal(score.lineItems.needsReview, 0)
  })

  it('scores low when only quote no is present', () => {
    const score = scoreBisTrackScanExtraction({
      header: { quoteNo: '57535', quoteDate: '', customerId: '', terms: '', poNumber: '', salesRep: '' },
      addresses: { invoice: { name: '', addressLine1: '', cityStateZip: '' } },
      totals: { totalAmount: null, salesTax: null, quotationTotal: null, balanceDue: null, amountPaid: null },
      lineItems: [],
    })
    assert.equal(score.overall, 'low')
    assert.equal(score.lineItems.count, 0)
  })
})

// --- buildScannedBisTrackIssues ---

describe('buildScannedBisTrackIssues', () => {
  it('always includes customer-confirm and totals-confirm issues', () => {
    const score = { lineItems: { count: 3, notes: 1, needsReview: 0 } }
    const totals = { quotationTotal: 6594.86, salesTax: 403.09 }
    const addresses = { invoice: { name: 'Teresa Geiger', addressLine1: '1125 A Inlet', cityStateZip: 'Amboy, Illinois, 61310' } }
    const issues = buildScannedBisTrackIssues(score, {}, addresses, totals)
    const ids = issues.map((i) => i.id)
    assert.ok(ids.includes('scanned-customer-confirm'))
    assert.ok(ids.includes('scanned-totals-confirm'))
    assert.ok(ids.includes('scanned-line-items-confirm'))
    assert.ok(ids.includes('scanned-note-lines'))
    assert.ok(ids.includes('scanned-original-attached'))
  })

  it('emits scanned-line-items-missing when no items extracted', () => {
    const score = { lineItems: { count: 0, notes: 0, needsReview: 0 } }
    const issues = buildScannedBisTrackIssues(score, {}, { invoice: {} }, { quotationTotal: null, salesTax: null })
    const ids = issues.map((i) => i.id)
    assert.ok(ids.includes('scanned-line-items-missing'))
    assert.ok(!ids.includes('scanned-line-items-confirm'))
  })
})

// --- parseBisTrackScannedQuote (orchestrator) ---

describe('parseBisTrackScannedQuote', () => {
  it('returns expected key fields from known scan OCR', () => {
    const result = parseBisTrackScannedQuote(KNOWN_SCAN_OCR)
    assert.equal(result.isScannedBisTrack, true)
    assert.equal(result.header.quoteNo, '57535')
    assert.equal(result.header.quoteDate, '06/08/2024 3:06 PM')
    assert.equal(result.addresses.invoice.name, 'Teresa Geiger')
    assert.equal(result.addresses.invoice.addressLine1, '1125 A Inlet')
    assert.match(result.addresses.invoice.cityStateZip, /Amboy.*61310/i)
    assert.equal(result.totals.totalAmount, 6191.77)
    assert.equal(result.totals.salesTax, 403.09)
    assert.equal(result.totals.quotationTotal, 6594.86)
    assert.equal(result.totals.balanceDue, 6594.86)
    assert.equal(result.lineItems.filter((i) => !i.isNote).length, 3)
    assert.equal(result.lineItems.filter((i) => i.isNote).length, 1)
    assert.equal(result.score.overall, 'high')
    assert.ok(result.issues.length > 0)
  })

  it('extracts customer ID and terms', () => {
    const result = parseBisTrackScannedQuote(KNOWN_SCAN_OCR)
    assert.equal(result.header.customerId, '22054')
    assert.equal(result.header.terms, 'PrePaid')
  })

  it('has extractionSource set to bistrack-scan', () => {
    const result = parseBisTrackScannedQuote(KNOWN_SCAN_OCR)
    assert.equal(result.extractionSource, 'bistrack-scan')
  })
})
