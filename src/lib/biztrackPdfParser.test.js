import assert from 'node:assert/strict'
import test from 'node:test'
import { getOutputLabel, parseBisTrackText } from './biztrackPdfParser.js'

const QUOTE_FIXTURE = `
BENSON STONE COMPANY
Quote No: Q-12345
Date: 04/25/2026

Bill To:
JOHN DOE
123 Main St
Rockford, IL 61104
815-555-1234

Ship To:
456 Project Rd
Rockford, IL 61104

Customer ID: DOE001
Terms: Net 30
PO Number: PO-99
Sales Rep: Jane Smith
Taken By: Bob

Line  Item Code   Description                 Qty  Unit  Unit Price  Total
1     INSERT-A    Fireplace Insert 36"        1    EA    $1,200.00   $1,200.00
2     LINER-K     Stainless Liner Kit         1    EA    $450.00     $450.00

Total Amount: $1,650.00
Tax: $132.00
Quotation Total: $1,782.00
Amount Paid: $0.00
Balance Due: $1,782.00
`.trim()

const ORDER_FIXTURE = `
BENSON STONE COMPANY
Order No: O-998
Date: 04/25/2026
Delivery Date: 05/02/2026

Bill To:
JANE SMITH
77 Elm St
Rockford, IL 61108

Customer ID: SMI002
Terms: Paid in full
Sales Rep: Carl

Line  Item Code  Description           Qty  Unit  Unit Price  Total
1     GRILL-1    Big Green Egg Large   1    EA    $1,000.00   $1,000.00

Total Amount: $1,000.00
Tax: $80.00
Order Total: $1,080.00
Amount Paid: $1,080.00
Balance Due: $0.00
`.trim()

test('quote fixture parses fields, doc type, and applies quote defaults', () => {
  const r = parseBisTrackText(QUOTE_FIXTURE)
  assert.equal(r.documentType, 'quote')
  assert.equal(r.fields.QUOTE_NO, 'Q-12345')
  assert.equal(r.fields.CUSTOMER_NAME, 'JOHN DOE')
  assert.equal(r.fields.CUSTOMER_ID, 'DOE001')
  assert.equal(r.fields.INVOICE_CITY_STATE_ZIP, 'Rockford, IL 61104')
  assert.equal(r.fields.PROJECT_ADDRESS_LINE_1, '456 Project Rd')
  assert.equal(r.fields.PROJECT_CITY_STATE_ZIP, 'Rockford, IL 61104')
  assert.equal(r.fields.PO_NUMBER, 'PO-99')
  assert.equal(r.fields.TOTAL_AMOUNT, '$1,650.00')
  assert.equal(r.fields.IR_TAX, '$132.00')
  assert.equal(r.fields.QUOTATION_TOTAL, '$1,782.00')
  assert.equal(r.fields.QUOTE_GOOD_FOR, '30 days')
  assert.equal(r.fields.PAYMENT_TERMS, 'Net 30')
  assert.equal(r.fields.DEPOSIT_TERMS, '50% down at time of signing')
  assert.equal(r.lineItems.length, 2)
  assert.equal(r.fields.DETAIL_1_QTY_1, '1')
  assert.equal(r.fields.DETAIL_1_TOTAL_1, '$1,200.00')
  assert.equal(r.context.outputLabel, 'Fireplace Project Proposal')
})

test('order fixture flags non-quote document and skips quote defaults', () => {
  const r = parseBisTrackText(ORDER_FIXTURE)
  assert.equal(r.documentType, 'order')
  assert.notEqual(r.context.outputLabel, 'Fireplace Project Proposal')
  assert.equal(r.fields.QUOTE_GOOD_FOR, '')
  assert.equal(r.fields.DEPOSIT_TERMS, '')
  assert.ok(r.warnings.some((w) => /ORDER document/i.test(w)))
})

test('delivery date is detected but not written to customer-facing fields', () => {
  const r = parseBisTrackText(ORDER_FIXTURE)
  assert.equal(r.context.deliveryDateMentioned, true)
  assert.equal(r.context.deliveryDate, '05/02/2026')
  const allValues = Object.values(r.fields).join(' ')
  assert.ok(!/05\/02\/2026/.test(allValues), 'delivery date must not appear in customer-facing fields')
})

test('fully paid order surfaces info and sets context.fullyPaid', () => {
  const r = parseBisTrackText(ORDER_FIXTURE)
  assert.equal(r.fields.AMOUNT_PAID, '$1,080.00')
  assert.equal(r.fields.BALANCE_DUE, '$0.00')
  assert.equal(r.context.fullyPaid, true)
  assert.ok(r.infos.some((i) => /fully paid/i.test(i)))
})

test('line items round-trip into DETAIL fields', () => {
  const r = parseBisTrackText(QUOTE_FIXTURE)
  assert.equal(r.fields.DETAIL_1_ITEM_1.includes('Fireplace Insert'), true)
  assert.equal(r.fields.DETAIL_1_UNIT_PRICE_1, '$1,200.00')
  assert.equal(r.fields.DETAIL_1_ITEM_2.includes('Liner'), true)
  assert.equal(r.fields.DETAIL_1_TOTAL_2, '$450.00')
})

test('empty/sparse text raises scanned-PDF warning', () => {
  const r = parseBisTrackText('')
  assert.ok(r.warnings.some((w) => /scanned or image-based/i.test(w)))
  assert.equal(r.extractionConfidence, 'low')
  assert.equal(r.context.embeddedTextLikelyMissing, true)
})

test('total mismatch raises a warning', () => {
  const fixture = `
BENSON STONE COMPANY
Quote No: Q-1
Date: 04/25/2026
Customer: A B
Total Amount: $1,000.00
Tax: $80.00
Quotation Total: $2,000.00
Amount Paid: $0.00
Balance Due: $2,000.00
`.trim()
  const r = parseBisTrackText(fixture)
  assert.ok(r.warnings.some((w) => /does not match/i.test(w)))
})

test('grill keywords change output label', () => {
  const orderResult = parseBisTrackText(ORDER_FIXTURE)
  assert.equal(orderResult.context.itemMix, 'outdoor')
  assert.equal(orderResult.context.outputLabel, 'Order Summary')

  const quoteWithGrill = QUOTE_FIXTURE
    .replace('Fireplace Insert 36"', 'Big Green Egg XL Grill')
    .replace('Stainless Liner Kit', 'Outdoor Kitchen Cart')
  const r = parseBisTrackText(quoteWithGrill)
  assert.equal(r.context.itemMix, 'outdoor')
  assert.equal(r.context.outputLabel, 'Outdoor Living Proposal')
})

test('getOutputLabel covers each document type', () => {
  assert.equal(getOutputLabel('quote', 'fireplace'), 'Fireplace Project Proposal')
  assert.equal(getOutputLabel('order', 'fireplace'), 'Project Confirmation')
  assert.equal(getOutputLabel('invoice', 'fireplace'), 'Order Summary')
  assert.equal(getOutputLabel('receipt', 'fireplace'), 'Order Summary')
  assert.equal(getOutputLabel('unknown', 'fireplace'), 'Project Summary')
  assert.equal(getOutputLabel('quote', 'outdoor'), 'Outdoor Living Proposal')
})
