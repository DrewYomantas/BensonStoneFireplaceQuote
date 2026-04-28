import assert from 'node:assert/strict'
import test from 'node:test'
import { getOutputLabel, parseBisTrackText } from './biztrackPdfParser.js'

// Sanitized fixtures based on real Epicor BisTrack pdfjs output.
// Names, customer IDs, addresses, and phone numbers are fabricated;
// the line/label structure mirrors what pdfjs returns from real BisTrack PDFs.

const REAL_ORDER_FIXTURE = `
BENSON STONE CO

Invoice Address

EST. 1930

John Q Sample 100 Example Drive Rockford, Illinois, 61109

Tel.1-815-555-0100 John Tel.2 815-555-0101 Jane

1100 Eleventh Street Rockford, Illinois 61104

815-227-2000 www.bensonstone.com

100 Example Drive Rockford, Illinois, 61109

Order No Order Date Customer ID Terms PO# Delivery Taken By Sales Rep

Order 600001 04/25/2026 10:41 AM 99001 PrePaid Sample PO Tag By 04/25/2026 Liam Milanos Liam Milanos This is a reprint

(Printed 4/25/2026 10:48:59AM)

Special Instructions ORDER Notes

Page 1 of 1

Line Product Code Description Qty Price Per Discount Total

1 BS-FP

Sample Grill Model A

1 EA

799.00 EA

0.00

799.00

2 SAMPLE-COVER

Sample Grill Cover

1 EA

78.99 EA

0.00

78.99

3 SAMPLE-TRAY

Sample Drip Trays pack of 5

1 EA

5.99 EA

0.00

5.99

Total Amount

Sales Tax

$883.98

$70.83

Order Total

$954.81

Amount Pald

$954.81

Balance Due

$0.00
`.trim()

const REAL_QUOTE_FIXTURE = `
BENSON STONE CO

EST. 1930

1100 Eleventh Street Rockford, Illinois 61104

815-227-2000 www.bensonstone.com

Invoice Address

Sample Customer

200 Sample Road Rural Town, Illinois, 61015 Tel.1-779-555-0200

Delivery Address

200 Sample Road Rural Town, Illinois, 61015 Tel.1-779-555-0200

Quote No Quote Date Customer ID Terms PO# Delivery Taken By Sales Rep

Quotation 700001 10/15/2025 1:26 PM 99002 PrePaid INST Sample Stove By 10/30/2025 Liam Milanos Liam Milanos

Special Instructions Notes

Page 1 of 1

Line Product Code Description Qty Price Per Discount Total

1 STOVE-A

Sample Wood Stove Model A

1 EA

3,728.00 EA

745.60

2,982.40

2 ADAPT-1

Sample Stove Adaptor

1 EA

95.57 EA

0.00

95.57

3 CHIM-24

Sample Chimney Length 24"

1 EA

177.49 EA

0.00

177.49

Total Amount

Sales Tax

$10,718.72

$693.76

Quotation Total

$11,412.48

Amount Pald

Balance Due

$11,412.48
`.trim()

test('real BisTrack order header parses doc type, number, date, customer ID, terms, PO, delivery, names', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.documentType, 'order')
  assert.equal(r.fields.QUOTE_NO, '600001')
  assert.equal(r.fields.QUOTE_DATE, '04/25/2026 10:41 AM')
  assert.equal(r.fields.CUSTOMER_ID, '99001')
  assert.equal(r.fields.PAYMENT_TERMS, 'PrePaid')
  assert.equal(r.fields.PO_NUMBER, 'Sample PO Tag')
  assert.equal(r.fields.TAKEN_BY, 'Liam Milanos')
  assert.equal(r.fields.SALES_REP, 'Liam Milanos')
  assert.equal(r.context.deliveryDateMentioned, true)
  assert.equal(r.context.deliveryDate, '04/25/2026')
})

test('real BisTrack address block extracts customer name, address, city/state/zip, phone', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.fields.CUSTOMER_NAME, 'John Q Sample')
  assert.equal(r.fields.INVOICE_ADDRESS_LINE_1, '100 Example Drive')
  assert.equal(r.fields.INVOICE_CITY_STATE_ZIP, 'Rockford, Illinois, 61109')
  assert.ok(/815-?555-?0100/.test(r.fields.CUSTOMER_PHONE))
})

test('real BisTrack project address falls back to second customer address line when no Delivery Address label', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.fields.PROJECT_ADDRESS_LINE_1, '100 Example Drive')
  assert.equal(r.fields.PROJECT_CITY_STATE_ZIP, 'Rockford, Illinois, 61109')
})

test('real BisTrack quote uses Delivery Address label and applies quote defaults', () => {
  const r = parseBisTrackText(REAL_QUOTE_FIXTURE)
  assert.equal(r.documentType, 'quote')
  assert.equal(r.fields.QUOTE_NO, '700001')
  assert.equal(r.fields.PROJECT_ADDRESS_LINE_1, '200 Sample Road')
  assert.equal(r.fields.PROJECT_CITY_STATE_ZIP, 'Rural Town, Illinois, 61015')
  assert.equal(r.fields.QUOTE_GOOD_FOR, '30 days')
  assert.equal(r.fields.DEPOSIT_TERMS, '50% down at time of signing')
  assert.equal(r.context.outputLabel, 'Fireplace Project Proposal')
})

test('totals queue handles 2-labels-then-2-values block (Total Amount + Sales Tax)', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.fields.TOTAL_AMOUNT, '$883.98')
  assert.equal(r.fields.IR_TAX, '$70.83')
  assert.equal(r.fields.QUOTATION_TOTAL, '$954.81')
  assert.equal(r.fields.AMOUNT_PAID, '$954.81')
  assert.equal(r.fields.BALANCE_DUE, '$0.00')
})

test('totals queue assigns lone trailing value to Balance Due when Amount Paid is blank', () => {
  const r = parseBisTrackText(REAL_QUOTE_FIXTURE)
  assert.equal(r.fields.QUOTATION_TOTAL, '$11,412.48')
  assert.equal(r.fields.AMOUNT_PAID, '')
  assert.equal(r.fields.BALANCE_DUE, '$11,412.48')
})

test('multi-line line items extract code, description, qty, unit price, total', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.lineItems.length, 3)
  assert.equal(r.lineItems[0].code, 'BS-FP')
  assert.ok(r.lineItems[0].description.includes('Sample Grill Model A'))
  assert.equal(r.lineItems[0].qty, '1')
  assert.equal(r.lineItems[0].unitPrice, '$799.00')
  assert.equal(r.lineItems[0].total, '$799.00')
  assert.equal(r.fields.DETAIL_1_QTY_1, '1')
  assert.equal(r.fields.DETAIL_1_TOTAL_1, '$799.00')
})

test('quote line items map into DETAIL fields with discounts handled', () => {
  const r = parseBisTrackText(REAL_QUOTE_FIXTURE)
  assert.equal(r.lineItems.length, 3)
  assert.equal(r.lineItems[0].unitPrice, '$3,728.00')
  assert.equal(r.lineItems[0].total, '$2,982.40')
  assert.equal(r.fields.DETAIL_1_UNIT_PRICE_1, '$3,728.00')
  assert.equal(r.fields.DETAIL_1_TOTAL_1, '$2,982.40')
})

test('delivery date is captured but not written to customer-facing fields', () => {
  const r = parseBisTrackText(REAL_QUOTE_FIXTURE)
  assert.equal(r.context.deliveryDateMentioned, true)
  assert.equal(r.context.deliveryDate, '10/30/2025')
  const allValues = Object.values(r.fields).join(' ')
  assert.ok(!/10\/30\/2025/.test(allValues), 'delivery date must not appear in customer-facing fields')
})

test('fully paid order surfaces info and sets context.fullyPaid', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.context.fullyPaid, true)
  assert.ok(r.infos.some((i) => /fully paid/i.test(i)))
})

test('order document surfaces non-quote warning', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.ok(r.warnings.some((w) => /ORDER document/i.test(w)))
  assert.equal(r.fields.QUOTE_GOOD_FOR, '')
})

test('grill item mix produces outdoor output label for orders', () => {
  const r = parseBisTrackText(REAL_ORDER_FIXTURE)
  assert.equal(r.context.itemMix, 'outdoor')
  assert.equal(r.context.outputLabel, 'Order Summary')
})

test('empty/sparse text raises scanned-PDF warning', () => {
  const r = parseBisTrackText('')
  assert.ok(r.warnings.some((w) => /scanned or image-based/i.test(w)))
  assert.equal(r.extractionConfidence, 'low')
  assert.equal(r.context.embeddedTextLikelyMissing, true)
})

test('total mismatch raises a warning', () => {
  const fixture = `
BENSON STONE CO

Invoice Address

Test Customer 1 Test St Rockford, Illinois, 61104

Quote No Quote Date Customer ID Terms PO# Delivery Taken By Sales Rep

Quotation 700099 04/25/2026 99099 Cash Test PO By 05/01/2026 Sales Rep

Line Product Code Description Qty Price Per Discount Total

1 X

Item

1 EA

1,000.00 EA

0.00

1,000.00

Total Amount
Sales Tax
$1,000.00
$80.00
Quotation Total
$2,000.00
Amount Pald
Balance Due
$2,000.00
`.trim()
  const r = parseBisTrackText(fixture)
  assert.ok(r.warnings.some((w) => /does not match/i.test(w)))
})

test('getOutputLabel covers each document type', () => {
  assert.equal(getOutputLabel('quote', 'fireplace'), 'Fireplace Project Proposal')
  assert.equal(getOutputLabel('order', 'fireplace'), 'Project Confirmation')
  assert.equal(getOutputLabel('invoice', 'fireplace'), 'Order Summary')
  assert.equal(getOutputLabel('receipt', 'fireplace'), 'Order Summary')
  assert.equal(getOutputLabel('unknown', 'fireplace'), 'Project Summary')
  assert.equal(getOutputLabel('quote', 'outdoor'), 'Outdoor Living Proposal')
})
