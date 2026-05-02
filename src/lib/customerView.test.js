import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCustomerView, collectDetailItems, collectPackages } from './customerView.js'

const baseFields = {
  CUSTOMER_NAME: 'John Sample',
  QUOTE_NO: 'Q-1',
  QUOTE_DATE: '04/27/2026',
  TOTAL_AMOUNT: '$1,000.00',
  IR_TAX: '$80.00',
  QUOTATION_TOTAL: '$1,080.00',
  AMOUNT_PAID: '',
  BALANCE_DUE: '$1,080.00',
  QUOTE_GOOD_FOR: '30 days',
  PAYMENT_TERMS: '50% down at time of signing',
  DEPOSIT_TERMS: '50% down at time of signing',
}

test('quote shows proposal label, deposit language, and quote-good-for', () => {
  const v = buildCustomerView(baseFields, { documentType: 'quote', itemMix: 'fireplace', outputLabel: 'Fireplace Project Proposal' })
  assert.equal(v.outputLabel, 'Fireplace Project Proposal')
  assert.equal(v.isQuote, true)
  assert.equal(v.showDepositLanguage, true)
  assert.equal(v.showQuoteGoodFor, true)
  assert.equal(v.showSignature, true)
  assert.equal(v.fullyPaid, false)
  assert.match(v.balanceCallout, /1,080\.00/)
})

test('outdoor item mix on quote yields Outdoor Living Proposal label', () => {
  const v = buildCustomerView(baseFields, { documentType: 'quote', itemMix: 'outdoor' })
  assert.equal(v.outputLabel, 'Outdoor Living Proposal')
})

test('order with balance due hides deposit/quote-good-for and uses Project Confirmation', () => {
  const v = buildCustomerView(baseFields, { documentType: 'order', itemMix: 'fireplace' })
  assert.equal(v.outputLabel, 'Project Confirmation')
  assert.equal(v.isQuote, false)
  assert.equal(v.showDepositLanguage, false)
  assert.equal(v.showQuoteGoodFor, false)
  assert.equal(v.showSignature, false)
})

test('fully paid order hides deposit language and shows paid-in-full callout', () => {
  const fields = { ...baseFields, AMOUNT_PAID: '$1,080.00', BALANCE_DUE: '$0.00' }
  const v = buildCustomerView(fields, { documentType: 'order', itemMix: 'outdoor', fullyPaid: true })
  assert.equal(v.fullyPaid, true)
  assert.equal(v.showDepositLanguage, false)
  assert.match(v.balanceCallout, /paid in full/i)
  assert.equal(v.outputLabel, 'Order Summary')
})

test('invoice/receipt becomes Order Summary', () => {
  assert.equal(buildCustomerView(baseFields, { documentType: 'invoice' }).outputLabel, 'Order Summary')
  assert.equal(buildCustomerView(baseFields, { documentType: 'receipt' }).outputLabel, 'Order Summary')
})

test('delivery date stays hidden unless includeDeliveryDate option is true', () => {
  const ctx = { documentType: 'order', deliveryDate: '05/01/2026' }
  const off = buildCustomerView(baseFields, ctx)
  assert.equal(off.showDeliveryDate, false)
  assert.equal(off.deliveryDate, '')
  const on = buildCustomerView(baseFields, ctx, { includeDeliveryDate: true })
  assert.equal(on.showDeliveryDate, true)
  assert.equal(on.deliveryDate, '05/01/2026')
})

test('notes documentType defaults to Fireplace Project Proposal and quote behavior', () => {
  const v = buildCustomerView(baseFields, { documentType: 'notes' })
  assert.equal(v.outputLabel, 'Fireplace Project Proposal')
  assert.equal(v.isQuote, true)
  assert.equal(v.showQuoteGoodFor, true)
})

test('parseContext.outputLabel takes precedence when present', () => {
  const v = buildCustomerView(baseFields, { documentType: 'order', outputLabel: 'Custom Label' })
  assert.equal(v.outputLabel, 'Custom Label')
})

test('collectPackages skips empty packages and keeps populated rows', () => {
  const fields = {
    PACKAGE_1_TITLE: 'Basic',
    PACKAGE_1_ITEM_1: 'Insert', PACKAGE_1_PRICE_1: '$1,000',
    PACKAGE_1_LINER_KIT_NAME: 'Liner', PACKAGE_1_LINER_KIT_SUBTOTAL: '$100',
    PACKAGE_2_TITLE: '',
  }
  const packages = collectPackages(fields)
  assert.equal(packages.length, 1)
  assert.equal(packages[0].title, 'Basic')
  assert.equal(packages[0].items.length, 1)
})

test('collectDetailItems skips empty detail sections', () => {
  const fields = {
    DETAIL_SECTION_1_TITLE: 'Materials',
    DETAIL_1_ITEM_1: 'Stove', DETAIL_1_QTY_1: '1', DETAIL_1_UNIT_PRICE_1: '$500', DETAIL_1_TOTAL_1: '$500',
  }
  const sections = collectDetailItems(fields)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].rows.length, 1)
  assert.equal(sections[0].rows[0].item, 'Stove')
})

test('customer proposal copy does not expose internal BisTrack wording', () => {
  const source = readFileSync(new URL('../components/CustomerProposal.jsx', import.meta.url), 'utf8')

  assert.equal(/BisTrack/i.test(source), false)
})

test('customer proposal copy uses send-ready tax and title labels', () => {
  const source = readFileSync(new URL('../components/CustomerProposal.jsx', import.meta.url), 'utf8')

  assert.equal(/IR Tax|&amp;|Other \/ Needs Review|Needs Review/i.test(source), false)
  assert.equal(/Sales Tax/.test(source), true)
  assert.equal(/Terms & Conditions/.test(source), true)
})
