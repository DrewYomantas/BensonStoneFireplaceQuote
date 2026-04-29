import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScannedPacket, classifyScannedPage, extractScannedBisTrackFields } from './scannedPacketParser.js'

const OCR_QUOTE = `
BENSON STONE CO
Quotation
Quote No 70655
Quote Date 11/10/2025 6:37 PM
Customer ID 1787
Terms PrePaid
PO# INST - Heat-N-Glo DV
Delivery By 11/25/2025
Taken By Liam Milanos
Sales Rep Liam Milanos
Invoice Address
Tom Schloemer
W6302 N Walworth Rd.
Walworth, Wisconsin, 53184
Tel.1 - 262-903-1109
Delivery Address
W6302 N Walworth Rd.
Walworth, Wisconsin, 53184
Tel.1 - 262-903-1109
Line Product Code Description Qty Price Per Discount Total
Total Amount $6,814.70
Sales Tax $459.79
Quotation Total $7,274.49
Amount Paid
Balance Due $7,274.49
`

const SERVICE_ORDER = `
BENSON STONE CO
Service Order
Name Jesse Tiffany Linzmaier
Order 623610
Problem Needs new gas valve
Work Performed Needs new 13-14 b-8 valve
`

const FIELD_MEASURE = `
Field Measure Checklist
Customer: Karen Mohr
Order#: 621695
Number of Stories #: 1
Chase Height above Roof: 5'
Fireplace Type: wood insert
`

const PAID_ORDER = `
BENSON STONE CO
Order
Order No 656460
Order Date 2/18/2026
Customer ID 9912
Invoice Address
Sample Customer
123 Main St.
Rockford, IL 61107
Order Total $954.81
Amount Paid $954.81
Balance Due $0.00
`

test('classifies OCR text page types', () => {
  assert.equal(classifyScannedPage(OCR_QUOTE).type, 'bistrack_quote')
  assert.equal(classifyScannedPage(SERVICE_ORDER).type, 'service_order')
  assert.equal(classifyScannedPage(FIELD_MEASURE).type, 'field_measure')
  assert.equal(classifyScannedPage(PAID_ORDER).type, 'paid_closed_order')
  assert.equal(classifyScannedPage('').type, 'site_photo')
})

test('extracts scanned BisTrack quote fields from OCR-like text', () => {
  const result = extractScannedBisTrackFields(OCR_QUOTE)
  assert.equal(result.documentType, 'quote')
  assert.equal(result.fields.QUOTE_NO, '70655')
  assert.equal(result.fields.CUSTOMER_NAME, 'Tom Schloemer')
  assert.equal(result.fields.TOTAL_AMOUNT, '$6,814.70')
  assert.equal(result.fields.IR_TAX, '$459.79')
  assert.equal(result.fields.QUOTATION_TOTAL, '$7,274.49')
  assert.equal(result.fields.BALANCE_DUE, '$7,274.49')
  assert.equal(result.fields.QUOTE_GOOD_FOR, '30 days')
  assert.ok(result.warnings.some((warning) => /OCR extraction used/i.test(warning)))
})

test('builds scanned packet page table and follow-up queue items', () => {
  const packet = buildScannedPacket([
    { pageNumber: 1, text: OCR_QUOTE, confidence: 72 },
    { pageNumber: 2, text: SERVICE_ORDER, confidence: 67 },
  ])
  assert.equal(packet.pages.length, 2)
  assert.equal(packet.pages[0].classification.type, 'bistrack_quote')
  assert.equal(packet.pages[1].status, 'Support')
  assert.equal(packet.pages[1].recommendation, 'Field measure / install support')
  assert.equal(packet.pages[0].recommendation, 'Follow-up candidate')
  assert.equal(packet.followUpItems.length, 1)
  assert.equal(packet.followUpItems[0].quoteNo, '70655')
  assert.equal(packet.followUpItems[0].followUpStage, 'Old quote follow-up')
})

test('paid closed orders are not follow-up candidates', () => {
  const packet = buildScannedPacket([
    { pageNumber: 1, text: PAID_ORDER, confidence: 74 },
    { pageNumber: 2, text: OCR_QUOTE, confidence: 72 },
  ])

  assert.equal(packet.pages[0].classification.type, 'paid_closed_order')
  assert.equal(packet.pages[0].recommendation, 'Paid / closed')
  assert.equal(packet.pages[0].status, 'Paid / Closed')
  assert.equal(packet.pages[0].parsed.context.fullyPaid, true)
  assert.equal(packet.followUpItems.length, 1)
  assert.equal(packet.followUpItems[0].quoteNo, '70655')
})
