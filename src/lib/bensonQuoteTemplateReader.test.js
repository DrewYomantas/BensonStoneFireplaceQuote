import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBensonInvoiceAddressZone,
  parseBensonDeliveryAddressZone,
  parseBensonMetadataZone,
  buildBensonQuoteDraftFromZones,
} from './bensonQuoteTemplateReader.js'

describe('parseBensonInvoiceAddressZone', () => {
  const ZONE = 'Invoice Address\nTom Schlemer\nW6302 N Walworth Rd\nWalworth, WI 53184\n262-903-1109'

  it('extracts customer name', () => {
    assert.equal(parseBensonInvoiceAddressZone(ZONE).customerName, 'Tom Schlemer')
  })
  it('extracts customer phone', () => {
    assert.equal(parseBensonInvoiceAddressZone(ZONE).customerPhone, '(262) 903-1109')
  })
  it('rejects Benson Stone company phone 815-227-2000', () => {
    const text = 'Invoice Address\nTom Schlemer\n815-227-2000'
    assert.equal(parseBensonInvoiceAddressZone(text).customerPhone, '')
  })
  it('ignores Invoice Address label line — does not become name', () => {
    const text = 'Invoice Address\nJane Doe\n555-123-4567'
    assert.equal(parseBensonInvoiceAddressZone(text).customerName, 'Jane Doe')
  })
  it('ignores Customer ID label — skips to next candidate', () => {
    const text = 'Customer ID: 12345\nTom Schlemer\n262-903-1109'
    assert.equal(parseBensonInvoiceAddressZone(text).customerName, 'Tom Schlemer')
  })
  it('does not extract address token W6302 as name', () => {
    const text = 'W6302 N Walworth Rd\nTom Schlemer\n262-903-1109'
    assert.equal(parseBensonInvoiceAddressZone(text).customerName, 'Tom Schlemer')
  })
  it('returns empty for blank zone', () => {
    const r = parseBensonInvoiceAddressZone('')
    assert.equal(r.customerName, '')
    assert.equal(r.customerPhone, '')
  })
  it('returns empty for null/undefined', () => {
    const r = parseBensonInvoiceAddressZone(null)
    assert.equal(r.customerName, '')
  })
})

describe('parseBensonDeliveryAddressZone', () => {
  it('extracts delivery address', () => {
    const text = 'Delivery Address\nW6302 N Walworth Rd\nWalworth, WI 53184'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, 'W6302 N Walworth Rd')
  })
  it('ignores Delivery Address label line', () => {
    const text = 'Delivery Address\nW6302 N Walworth Rd'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, 'W6302 N Walworth Rd')
  })
  it('ignores Terms PrePaid line', () => {
    const text = 'Delivery Address\nTerms PrePaid\nW6302 N Walworth Rd'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, 'W6302 N Walworth Rd')
  })
  it('ignores Benson store address 1100 Eleventh St', () => {
    const text = '1100 Eleventh St\nRockford, IL 61104'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, '')
  })
  it('ignores Customer ID line', () => {
    const text = 'Delivery Address\nCustomer ID: 12345\nW6302 N Walworth Rd'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, 'W6302 N Walworth Rd')
  })
  it('returns empty for blank zone', () => {
    assert.equal(parseBensonDeliveryAddressZone('').deliveryAddress, '')
  })
})

describe('parseBensonMetadataZone', () => {
  const ZONE = 'Quote No: 70655\nQuote Date: 11/10/2025\nTerms: PrePaid\nCustomer ID: 12345'

  it('extracts quote number 70655', () => {
    assert.equal(parseBensonMetadataZone(ZONE).quoteNumber, '70655')
  })
  it('extracts quote date 11/10/2025', () => {
    assert.equal(parseBensonMetadataZone(ZONE).quoteDate, '11/10/2025')
  })
  it('does not extract Customer ID value as quote number', () => {
    const text = 'Customer ID: 12345\nQuote No: 70655'
    assert.equal(parseBensonMetadataZone(text).quoteNumber, '70655')
  })
  it('ignores Quotation label as quote number', () => {
    const text = 'Quotation\nQuote No: 70655\nQuote Date: 11/10/2025'
    assert.equal(parseBensonMetadataZone(text).quoteNumber, '70655')
  })
  it('returns empty for blank zone', () => {
    const r = parseBensonMetadataZone('')
    assert.equal(r.quoteNumber, '')
    assert.equal(r.quoteDate, '')
  })
})

describe('buildBensonQuoteDraftFromZones', () => {
  const ZONES = {
    invoiceAddress: 'Invoice Address\nTom Schlemer\nW6302 N Walworth Rd\nWalworth, WI 53184\n262-903-1109',
    deliveryAddress: 'Delivery Address\nW6302 N Walworth Rd\nWalworth, WI 53184',
    metadata: 'Quote No: 70655\nQuote Date: 11/10/2025\nTerms: PrePaid',
  }

  it('assembles name from invoice zone', () => {
    assert.equal(buildBensonQuoteDraftFromZones(ZONES).fields.customerName, 'Tom Schlemer')
  })
  it('assembles phone from invoice zone', () => {
    assert.equal(buildBensonQuoteDraftFromZones(ZONES).fields.customerPhone, '(262) 903-1109')
  })
  it('assembles project address from delivery zone', () => {
    assert.equal(buildBensonQuoteDraftFromZones(ZONES).fields.projectAddress, 'W6302 N Walworth Rd')
  })
  it('assembles quote number from metadata zone', () => {
    assert.equal(buildBensonQuoteDraftFromZones(ZONES).fields.quoteNumber, '70655')
  })
  it('assembles quote date from metadata zone', () => {
    assert.equal(buildBensonQuoteDraftFromZones(ZONES).fields.quoteDate, '11/10/2025')
  })
  it('templateHint mentions Invoice Address and Quote No when name found', () => {
    const { templateHint } = buildBensonQuoteDraftFromZones(ZONES)
    assert.ok(templateHint.includes('Invoice Address'), `missing "Invoice Address" in: ${templateHint}`)
    assert.ok(templateHint.includes('Quote No'), `missing "Quote No" in: ${templateHint}`)
  })
  it('templateHint mentions needs-review when name is missing', () => {
    const { templateHint } = buildBensonQuoteDraftFromZones({
      invoiceAddress: '',
      deliveryAddress: '',
      metadata: 'Quote No: 70655\nQuote Date: 11/10/2025',
    })
    assert.ok(templateHint.toLowerCase().includes('review'), `expected "review" in: ${templateHint}`)
  })
  it('ignores Benson phone 815-227-2000 from invoice zone', () => {
    const { fields } = buildBensonQuoteDraftFromZones({
      ...ZONES,
      invoiceAddress: 'Invoice Address\nTom Schlemer\n815-227-2000',
    })
    assert.equal(fields.customerPhone, '')
  })
  it('ignores 1100 Eleventh from delivery zone', () => {
    const { fields } = buildBensonQuoteDraftFromZones({
      ...ZONES,
      deliveryAddress: '1100 Eleventh St\nRockford, IL 61104',
    })
    assert.notEqual(fields.projectAddress, '1100 Eleventh St')
  })
  it('falls back to whole-page text when all zones blank — fields are strings', () => {
    const { fields } = buildBensonQuoteDraftFromZones({
      invoiceAddress: '',
      deliveryAddress: '',
      metadata: '',
    })
    assert.equal(typeof fields.customerName, 'string')
    assert.equal(typeof fields.quoteNumber, 'string')
  })
})

describe('looksLikeName — zip code rejection', () => {
  it('does not extract "Walworth, Wisconsin 53184" as a name', () => {
    const text = 'Invoice Address\nWalworth, Wisconsin 53184\nTom Schlemer\n262-903-1109'
    assert.equal(parseBensonInvoiceAddressZone(text).customerName, 'Tom Schlemer')
  })
  it('does not extract a line ending with a 5-digit zip as a name', () => {
    const text = 'Invoice Address\nSome City 60601\nJane Doe\n555-000-1234'
    assert.equal(parseBensonInvoiceAddressZone(text).customerName, 'Jane Doe')
  })
})

describe('parseBensonMetadataZone — OCR noise', () => {
  it('extracts quote number when "Q" is misread as "O" (Ouote No)', () => {
    const text = 'Ouote No: 70655\nQuote Date: 11/10/2025'
    assert.equal(parseBensonMetadataZone(text).quoteNumber, '70655')
  })
})

describe('parseBensonDeliveryAddressZone — same as invoice address', () => {
  it('extracts the street line even when delivery matches invoice address', () => {
    const text = 'Delivery Address\nW6302 N Walworth Rd\nWalworth, WI 53184'
    assert.equal(parseBensonDeliveryAddressZone(text).deliveryAddress, 'W6302 N Walworth Rd')
  })
})
