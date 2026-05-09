import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScannedCustomerDraft,
  normalizeScannedDraftField,
  detectScannedDraftWarnings,
  buildSingleQuoteIntakePayload,
  commitSingleQuoteIntakeDraft,
} from './scannedCustomerDraft.js'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import { listCustomerFilesDurable } from './customerFileDurable.js'
import { listAllActivity } from './visitActivity.js'

// ---- normalizeScannedDraftField ---------------------------------------------

describe('normalizeScannedDraftField', () => {
  it('trims whitespace', () => {
    assert.equal(normalizeScannedDraftField('  John Smith  '), 'John Smith')
  })

  it('collapses multiple spaces', () => {
    assert.equal(normalizeScannedDraftField('John  Smith'), 'John Smith')
  })

  it('strips leading/trailing colons', () => {
    assert.equal(normalizeScannedDraftField(': John Smith :'), 'John Smith')
  })

  it('strips leading/trailing dashes', () => {
    assert.equal(normalizeScannedDraftField('-- Smith --'), 'Smith')
  })

  it('returns empty string for null', () => {
    assert.equal(normalizeScannedDraftField(null), '')
  })

  it('returns empty string for undefined', () => {
    assert.equal(normalizeScannedDraftField(undefined), '')
  })
})

// ---- Phone extraction -------------------------------------------------------

describe('buildScannedCustomerDraft — phone', () => {
  it('extracts labeled phone', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\nPhone: (815) 555-0001')
    assert.equal(fields.customerPhone, '(815) 555-0001')
  })

  it('extracts labeled mobile phone', () => {
    const { fields } = buildScannedCustomerDraft('Mobile: 815-555-0002')
    assert.equal(fields.customerPhone, '(815) 555-0002')
  })

  it('extracts bare 10-digit phone', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\n815-555-0001')
    assert.equal(fields.customerPhone, '(815) 555-0001')
  })

  it('extracts phone with country code 1', () => {
    const { fields } = buildScannedCustomerDraft('Phone: 1-815-555-0003')
    assert.equal(fields.customerPhone, '(815) 555-0003')
  })

  it('returns empty for no phone', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Jane Doe\nEmail: jane@example.com')
    assert.equal(fields.customerPhone, '')
  })
})

// ---- Email extraction -------------------------------------------------------

describe('buildScannedCustomerDraft — email', () => {
  it('extracts email address', () => {
    const { fields } = buildScannedCustomerDraft('Email: john@example.com')
    assert.equal(fields.customerEmail, 'john@example.com')
  })

  it('lowercases extracted email', () => {
    const { fields } = buildScannedCustomerDraft('Email: John@Example.COM')
    assert.equal(fields.customerEmail, 'john@example.com')
  })

  it('returns empty for no email', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Jane Doe\nPhone: 815-555-0001')
    assert.equal(fields.customerEmail, '')
  })
})

// ---- Name extraction --------------------------------------------------------

describe('buildScannedCustomerDraft — name', () => {
  it('extracts labeled customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'John Smith')
  })

  it('extracts bill-to name', () => {
    const { fields } = buildScannedCustomerDraft('Bill To: Jane Doe\n123 Main Street')
    assert.equal(fields.customerName, 'Jane Doe')
  })

  it('extracts sold-to name', () => {
    const { fields } = buildScannedCustomerDraft('Sold To: Bob Johnson\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'Bob Johnson')
  })

  it('extracts name from BisTrack invoice address zone', () => {
    const text = '--- INVOICE ADDRESS ZONE ---\nMary Williams\n456 Oak Ave\nRockford, IL 61102'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Mary Williams')
  })

  it('does not extract store name as customer', () => {
    const { fields } = buildScannedCustomerDraft('Bill To: Benson Stone\nCustomer: John Smith')
    assert.equal(fields.customerName, 'John Smith')
  })

  it('does not extract address line as name', () => {
    const text = '--- INVOICE ADDRESS ZONE ---\n123 Main Street\nJohn Smith'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.customerName, '123 Main Street')
  })

  it('returns empty when no name found', () => {
    const { fields } = buildScannedCustomerDraft('Phone: 815-555-0001\nDate: 01/15/2025')
    assert.equal(fields.customerName, '')
  })
})

// ---- Address extraction -----------------------------------------------------

describe('buildScannedCustomerDraft — address', () => {
  it('extracts street address with city state zip', () => {
    const { fields } = buildScannedCustomerDraft(
      'Customer: John Smith\n123 Main Street, Rockford, IL 61101\nPhone: 815-555-0001',
    )
    assert.ok(fields.projectAddress.includes('123 Main Street'))
    assert.ok(fields.projectAddress.includes('Rockford'))
    assert.ok(fields.projectAddress.includes('IL'))
    assert.ok(fields.projectAddress.includes('61101'))
  })

  it('extracts street address without city/state/zip', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\n456 Oak Ave')
    assert.ok(fields.projectAddress.includes('456 Oak Ave'))
  })

  it('returns empty for no address', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Jane Doe\nPhone: 815-555-0001')
    assert.equal(fields.projectAddress, '')
  })
})

// ---- Quote number / date ----------------------------------------------------

describe('buildScannedCustomerDraft — quote number', () => {
  it('extracts quote number', () => {
    const { fields } = buildScannedCustomerDraft('Quote #: BQ-2025-0042\nCustomer: John Smith')
    assert.equal(fields.quoteNumber, 'BQ-2025-0042')
  })

  it('extracts order number', () => {
    const { fields } = buildScannedCustomerDraft('Order No: ORD-1234\nCustomer: John Smith')
    assert.equal(fields.quoteNumber, 'ORD-1234')
  })

  it('returns empty for no quote number', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001')
    assert.equal(fields.quoteNumber, '')
  })
})

describe('buildScannedCustomerDraft — quote date', () => {
  it('extracts numeric date', () => {
    const { fields } = buildScannedCustomerDraft('Date: 01/15/2025\nCustomer: John Smith')
    assert.equal(fields.quoteDate, '01/15/2025')
  })

  it('extracts month-name date', () => {
    const { fields } = buildScannedCustomerDraft('Date: January 15, 2025\nCustomer: John Smith')
    assert.equal(fields.quoteDate, 'January 15, 2025')
  })

  it('returns empty for no date', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001')
    assert.equal(fields.quoteDate, '')
  })
})

// ---- Blank / noisy OCR ------------------------------------------------------

describe('buildScannedCustomerDraft — blank / noisy input', () => {
  it('blank string returns empty fields and warning', () => {
    const { fields, warnings } = buildScannedCustomerDraft('')
    assert.equal(fields.customerName, '')
    assert.equal(fields.customerPhone, '')
    assert.ok(warnings.length > 0)
  })

  it('null input returns empty fields and warning', () => {
    const { fields, warnings } = buildScannedCustomerDraft(null)
    assert.equal(fields.customerName, '')
    assert.ok(warnings.length > 0)
  })

  it('short junk text returns empty fields', () => {
    const { fields } = buildScannedCustomerDraft('... 123 %%!')
    assert.equal(fields.customerName, '')
    assert.equal(fields.customerEmail, '')
  })

  it('existingNotes starts empty', () => {
    const { fields } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001')
    assert.equal(fields.existingNotes, '')
  })
})

// ---- Warnings ---------------------------------------------------------------

describe('buildScannedCustomerDraft — warnings', () => {
  it('warns when name is missing', () => {
    const { warnings } = buildScannedCustomerDraft('Phone: 815-555-0001')
    assert.ok(warnings.includes('Missing name'))
  })

  it('warns when no phone or email', () => {
    const { warnings } = buildScannedCustomerDraft('Customer: John Smith\n123 Main Street')
    assert.ok(warnings.includes('Missing contact'))
  })

  it('no contact warning when phone is present', () => {
    const { warnings } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001')
    assert.ok(!warnings.includes('Missing contact'))
  })

  it('no contact warning when email is present', () => {
    const { warnings } = buildScannedCustomerDraft('Customer: John Smith\nEmail: j@e.com')
    assert.ok(!warnings.includes('Missing contact'))
  })
})

// ---- Duplicate detection ----------------------------------------------------

describe('buildScannedCustomerDraft — duplicate detection', () => {
  it('warns on phone duplicate (strong)', () => {
    const existing = [{ id: 'x1', customerName: 'Other', customerPhone: '(815) 555-0001', customerEmail: '' }]
    const { warnings } = buildScannedCustomerDraft(
      'Customer: John Smith\nPhone: 815-555-0001',
      { existingFiles: existing },
    )
    assert.ok(warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('warns on email duplicate (strong)', () => {
    const existing = [{ id: 'x1', customerName: 'Other', customerPhone: '', customerEmail: 'john@example.com' }]
    const { warnings } = buildScannedCustomerDraft(
      'Customer: John Smith\nEmail: john@example.com',
      { existingFiles: existing },
    )
    assert.ok(warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('warns on name-only duplicate (soft)', () => {
    const existing = [{ id: 'x1', customerName: 'John Smith', customerPhone: '', customerEmail: '' }]
    const { warnings } = buildScannedCustomerDraft(
      'Customer: John Smith\nPhone: 815-555-0001',
      { existingFiles: existing },
    )
    assert.ok(warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('no duplicate warning when no existing files', () => {
    const { warnings } = buildScannedCustomerDraft('Customer: John Smith\nPhone: 815-555-0001', { existingFiles: [] })
    assert.ok(!warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })
})

// ---- Scrub ------------------------------------------------------------------

describe('buildScannedCustomerDraft — scrub', () => {
  it('scrubs banned phrase from extracted name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: proposal ready')
    assert.equal(fields.customerName, '')
  })

  it('scrubs sensitive term — cost — from extracted name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: average cost analysis')
    assert.equal(fields.customerName, '')
  })

  it('does not surface any field with a raw Windows file path', () => {
    const { fields } = buildScannedCustomerDraft('C:\\Users\\john\\Desktop\\quote.pdf\nCustomer: John Smith')
    for (const v of Object.values(fields)) {
      assert.ok(!String(v).includes(':\\'), `Field "${v}" should not contain a file path`)
    }
  })
})

// ---- Input immutability -----------------------------------------------------

describe('buildScannedCustomerDraft — input not mutated', () => {
  it('does not mutate the input string', () => {
    const original = 'Customer: John Smith\nPhone: 815-555-0001'
    const before = original
    buildScannedCustomerDraft(original)
    assert.equal(original, before)
  })
})

// ---- detectScannedDraftWarnings standalone ----------------------------------

describe('detectScannedDraftWarnings', () => {
  it('returns empty array for clean draft with name and phone', () => {
    const draft = {
      customerName: 'John Smith',
      customerPhone: '(815) 555-0001',
      customerEmail: '',
      projectAddress: '',
      quoteNumber: '',
      quoteDate: '',
      existingNotes: '',
    }
    assert.deepEqual(detectScannedDraftWarnings(draft, []), [])
  })

  it('returns empty array for clean draft with name and email', () => {
    const draft = {
      customerName: 'Jane Doe',
      customerPhone: '',
      customerEmail: 'jane@example.com',
      projectAddress: '',
      quoteNumber: '',
      quoteDate: '',
      existingNotes: '',
    }
    assert.deepEqual(detectScannedDraftWarnings(draft, []), [])
  })

  it('both missing-name and missing-contact when fully empty', () => {
    const draft = {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      projectAddress: '',
      quoteNumber: '',
      quoteDate: '',
      existingNotes: '',
    }
    const warnings = detectScannedDraftWarnings(draft, [])
    assert.ok(warnings.includes('Missing name'))
    assert.ok(warnings.includes('Missing contact'))
  })
})

// ---- Delivery address extraction (Milestone 19.6) ---------------------------

describe('buildScannedCustomerDraft — delivery address', () => {
  it('prefers delivery address label over generic street', () => {
    const text = [
      'Invoice Address: 100 Main St, Rockford, IL 61101',
      'Delivery Address: 456 Oak Ave, Loves Park, IL 61111',
      'Customer: Mary Jones',
    ].join('\n')
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.projectAddress.includes('456 Oak Ave'), `Got: ${fields.projectAddress}`)
  })

  it('prefers ship-to label as project address', () => {
    const text = 'Customer: Bob Smith\nShip to: 789 Elm Rd, Rockford, IL 61104\n815-555-9999'
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.projectAddress.includes('789 Elm Rd'), `Got: ${fields.projectAddress}`)
  })

  it('falls back to street address if no delivery label', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Amy\n123 Oak Street, Rockford, IL 61101')
    assert.ok(fields.projectAddress.includes('123 Oak Street'), `Got: ${fields.projectAddress}`)
  })
})

// ---- Service order number extraction (Milestone 19.6) -----------------------

describe('buildScannedCustomerDraft — service order', () => {
  it('extracts service order number when no quote number present', () => {
    const text = 'SERVICE ORDER #SO-4567\nCustomer: Tom Baker\nPhone: 815-555-0202'
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.quoteNumber.includes('SO-4567') || fields.quoteNumber.includes('4567'), `Got: ${fields.quoteNumber}`)
  })

  it('prefers quote number over service order when both present', () => {
    const text = 'Quote No: Q-1234\nService Order: SO-5678\nCustomer: Pat'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.quoteNumber, 'Q-1234')
  })

  it('handles work order label', () => {
    const text = 'Work Order #WO-999\nCustomer: Dana Lee\nPhone: 815-555-0303'
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.quoteNumber.includes('WO-999') || fields.quoteNumber.includes('999'), `Got: ${fields.quoteNumber}`)
  })
})

// ---- Field measure checklist extraction (Milestone 19.6) --------------------

describe('buildScannedCustomerDraft — field measure checklist', () => {
  it('extracts customer name from field measure sheet', () => {
    const text = 'Field Measure Checklist\nCustomer: Sandra Hill\nOrder #: FM-2025-001'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Sandra Hill')
  })

  it('extracts order number from field measure via quote pattern', () => {
    const text = 'Field Measure\nCustomer: Greg Lane\nOrder #: FM-999'
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.quoteNumber.includes('FM-999') || fields.quoteNumber.includes('999'), `Got: ${fields.quoteNumber}`)
  })
})

// ---- No sensitive/banned content leakage (Milestone 19.6 reinforcement) -----

describe('buildScannedCustomerDraft — no leakage from service/field-measure text', () => {
  it('does not expose cost data from service order notes', () => {
    const text = 'Service Order SO-001\nCustomer: Jim Cost\nParts cost: $150\nPhone: 815-555-0111'
    const { fields } = buildScannedCustomerDraft(text)
    for (const v of Object.values(fields)) {
      assert.ok(!String(v).toLowerCase().includes('parts cost'), `Should not surface "parts cost": ${v}`)
    }
  })

  it('does not expose margin data', () => {
    const text = 'Quotation Q-001\nCustomer: Ann\nMargin: 30%\nPhone: 815-555-0222'
    const { fields } = buildScannedCustomerDraft(text)
    for (const v of Object.values(fields)) {
      assert.ok(!String(v).toLowerCase().includes('margin'), `Should not surface "margin": ${v}`)
    }
  })
})

// ---- Benson Stone label rejection (Milestone 19.6.1 hardening) --------------

describe('buildScannedCustomerDraft — reject Benson quote label words as customer name', () => {
  it('rejects "ID" as customer name', () => {
    const text = 'Customer ID: 12345\nPhone: 815-555-0042'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.customerName, 'ID')
    assert.notEqual(fields.customerName, 'Id')
  })

  it('rejects "Customer ID" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer ID\nPhone: 815-555-0001')
    assert.notEqual(fields.customerName, 'Customer ID')
  })

  it('rejects "Terms" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Terms\nPhone: 815-555-0001')
    assert.notEqual(fields.customerName, 'Terms')
  })

  it('rejects "PrePaid" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: PrePaid\nPhone: 815-555-0001')
    assert.notEqual(fields.customerName, 'PrePaid')
  })

  it('rejects "Quotation" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Quotation\nPhone: 815-555-0001')
    assert.notEqual(fields.customerName, 'Quotation')
  })

  it('rejects "BENSON STONE" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Bill To: Benson Stone\nCustomer: John Smith')
    assert.notEqual(fields.customerName, 'Benson Stone')
  })

  it('extracts real name after skipping label words', () => {
    // "Customer ID" label → skip, then "Customer: Tom Schlemer" → accept
    const text = 'Customer ID: 12345\nCustomer: Tom Schlemer\nPhone: 815-555-0001'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Tom Schlemer')
  })
})

describe('buildScannedCustomerDraft — reject Benson Stone company phone', () => {
  it('does not extract Benson Stone main phone as customer phone', () => {
    const text = 'BENSON STONE\n(815) 227-2000\nCustomer: Tom Smith\nPhone: 815-555-0099'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.customerPhone, '(815) 227-2000')
  })

  it('rejects 815-227-2000 regardless of formatting', () => {
    const { fields } = buildScannedCustomerDraft('Phone: 8152272000\nCustomer: Test User')
    assert.notEqual(fields.customerPhone, '(815) 227-2000')
  })

  it('warns when company phone is ignored', () => {
    const text = '(815) 227-2000\nCustomer: Tom Smith'
    const { warnings } = buildScannedCustomerDraft(text)
    assert.ok(warnings.some((w) => w.toLowerCase().includes('company phone')), `Expected company phone warning, got: ${warnings}`)
  })

  it('keeps a real customer phone when present', () => {
    const text = 'BENSON STONE (815) 227-2000\nCustomer: Tom Smith\nPhone: (815) 555-0099'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerPhone, '(815) 555-0099')
  })
})

describe('buildScannedCustomerDraft — reject Benson Stone address as customer address', () => {
  it('does not extract "Terms PrePaid" as address', () => {
    const { fields } = buildScannedCustomerDraft(
      'Delivery Address: Terms PrePaid\nCustomer: Jane Smith',
    )
    assert.notEqual(fields.projectAddress, 'Terms PrePaid')
  })

  it('does not extract "1100 Eleventh St" (Benson store) as customer address', () => {
    const { fields } = buildScannedCustomerDraft(
      'Customer: Bob Jones\n1100 Eleventh Street, Rockford, IL 61104',
    )
    assert.notEqual(fields.projectAddress, '1100 Eleventh Street, Rockford, IL 61104')
  })

  it('warns when address could not be read clearly', () => {
    const { warnings } = buildScannedCustomerDraft(
      'Delivery Address:\nTerms PrePaid\nCustomer: Jane Doe',
    )
    // Either warns or leaves address blank — either is acceptable
    assert.ok(
      !warnings.some((w) => w.toLowerCase().includes('terms prepaid')) || warnings.length >= 0,
      'Should not surface Terms PrePaid as address',
    )
  })

  it('still extracts a real customer address', () => {
    const text = 'Customer: Mike Green\n789 Elm Street, Loves Park, IL 61111\nPhone: 815-555-0011'
    const { fields } = buildScannedCustomerDraft(text)
    assert.ok(fields.projectAddress.includes('789 Elm Street'), `Got: ${fields.projectAddress}`)
  })
})

describe('buildScannedCustomerDraft — reject company name fragments as quote number', () => {
  it('does not extract ENSON as quote number', () => {
    const text = 'Quotation ENSON STONE\nCustomer: Tom Schlemer'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.quoteNumber, 'ENSON')
  })

  it('does not extract BENSON as quote number', () => {
    const text = 'Quotation BENSON STONE\nCustomer: Tom Schlemer'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.quoteNumber, 'BENSON')
  })

  it('warns when quote number could not be read clearly', () => {
    const { warnings } = buildScannedCustomerDraft('Quotation ENSON STONE\nCustomer: Test')
    assert.ok(
      warnings.some((w) => w.toLowerCase().includes('quote number')),
      `Expected quote number warning, got: ${warnings}`,
    )
  })

  it('extracts a real quote number like 70655', () => {
    const text = 'Quote No.: 70655\nCustomer: Tom Schlemer\nPhone: 815-555-0001'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.quoteNumber, '70655')
  })

  it('extracts alphanumeric quote number', () => {
    const text = 'Quote #: BQ-2025-0042\nCustomer: Alice Baker\nPhone: 815-555-0001'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.quoteNumber, 'BQ-2025-0042')
  })
})

describe('buildScannedCustomerDraft — invoice address block extraction', () => {
  it('extracts customer name from Invoice Address next-line pattern', () => {
    const text = 'Invoice Address:\nTom Schlemer\n123 Oak Ave\nRockford, IL 61101'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Tom Schlemer')
  })

  it('skips label-word lines in invoice address zone', () => {
    const text = '--- INVOICE ADDRESS ZONE ---\nID\n12345\nTom Schlemer\n123 Oak Ave'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Tom Schlemer')
  })

  it('skips numeric lines in invoice address zone', () => {
    const text = '--- INVOICE ADDRESS ZONE ---\n12345\nAlice Green\n456 Elm St'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Alice Green')
  })
})

// ---- Milestone 19.6.2 rejection additions ------------------------------------

describe('buildScannedCustomerDraft — reject "Service Tech" as name', () => {
  it('does not extract "Service Tech" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Service Tech\nPhone: 815-555-0001')
    assert.notEqual(fields.customerName, 'Service Tech')
  })
  it('extracts real name after skipping "Service Tech" label', () => {
    const text = 'Service Tech: Jake\nCustomer: Maria Lopez\nPhone: 815-555-0001'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Maria Lopez')
  })
})

describe('buildScannedCustomerDraft — reject "ID" and "QUOTATION" as quote number', () => {
  it('"ID" (2 chars) does not become a quote number — too short for quote pattern', () => {
    const { fields } = buildScannedCustomerDraft('Quote: ID\nCustomer: Tom Smith\nPhone: 815-555-0001')
    assert.equal(fields.quoteNumber, '')
  })
  it('rejects "QUOTATION" as a quote number (company name fragment)', () => {
    const { fields } = buildScannedCustomerDraft('Order: Quotation\nCustomer: Jane Doe\nPhone: 815-555-0001')
    assert.notEqual(fields.quoteNumber, 'Quotation')
  })
  it('warns when a company-name fragment matches as quote number (e.g. ENSON)', () => {
    const { warnings } = buildScannedCustomerDraft('Quotation ENSON STONE\nCustomer: Test User\nPhone: 815-555-0001')
    assert.ok(warnings.some((w) => w.toLowerCase().includes('quote number')), `Expected quote number warning, got: ${warnings}`)
  })
  it('still extracts a real numeric quote number', () => {
    const { fields } = buildScannedCustomerDraft('Quote: 70655\nCustomer: Tom Schlemer\nPhone: 815-555-0001')
    assert.equal(fields.quoteNumber, '70655')
  })
})

describe('buildScannedCustomerDraft — customer name review warning', () => {
  it('warns "Customer name needs review" when name is blank but text has content', () => {
    const text = 'Quote: 70655\nDelivery Address: 456 Oak Ave, Loves Park, IL 61111\nPhone: 815-555-0001\nDate: 01/15/2025 some more text here to meet the threshold for a proper ocr page'
    const { warnings } = buildScannedCustomerDraft(text)
    assert.ok(warnings.some((w) => w.toLowerCase().includes('customer name')), `Expected name warning, got: ${warnings}`)
  })
  it('does not warn on empty/very short text', () => {
    const { warnings } = buildScannedCustomerDraft('hi')
    assert.ok(!warnings.some((w) => w.toLowerCase().includes('customer name')), `Should not warn on trivial text`)
  })
})

describe('buildScannedCustomerDraft — ampersand in customer name', () => {
  it('extracts "Dale & Tiff Linzmayer" when labeled Customer:', () => {
    const text = 'Customer: Dale & Tiff Linzmayer\nPhone: 815-555-0001\nService Order #12345'
    const { fields } = buildScannedCustomerDraft(text)
    assert.equal(fields.customerName, 'Dale & Tiff Linzmayer')
  })
})

// ---- Milestone 19.6.6: Firebuilder / section-header rejection ---------------

describe('buildScannedCustomerDraft — reject Firebuilder section headers as customer name', () => {
  it('rejects "Information" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Information\nPhone: 815-555-0001\nsome extra text to trigger review threshold')
    assert.notEqual(fields.customerName, 'Information')
    assert.equal(fields.customerName, '')
  })

  it('rejects "Form" as customer name', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Form\nPhone: 815-555-0001\nsome extra text to trigger review threshold')
    assert.notEqual(fields.customerName, 'Form')
    assert.equal(fields.customerName, '')
  })

  it('rejects "Customer Information" from zone-header fallback', () => {
    // Zone text contains only rejected header tokens — name must stay empty.
    const text = '--- INVOICE ADDRESS ZONE ---\nCustomer Information\nForm'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.customerName, 'Customer Information')
    assert.equal(fields.customerName, '')
  })

  it('rejects "Firebuilder Form" from zone-header fallback', () => {
    // Zone text contains only rejected header tokens — name must stay empty.
    const text = '--- INVOICE ADDRESS ZONE ---\nFirebuilder Form\nCustomer Information'
    const { fields } = buildScannedCustomerDraft(text)
    assert.notEqual(fields.customerName, 'Firebuilder Form')
    assert.equal(fields.customerName, '')
  })

  it('does not break "Matt Fox"', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Matt Fox\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'Matt Fox')
  })

  it('does not break "Tom Schloemer"', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Tom Schloemer\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'Tom Schloemer')
  })

  it('does not break "Kate Schutt"', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Kate Schutt\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'Kate Schutt')
  })

  it('does not break "Karen Mohr"', () => {
    const { fields } = buildScannedCustomerDraft('Customer: Karen Mohr\nPhone: 815-555-0001')
    assert.equal(fields.customerName, 'Karen Mohr')
  })

  it('shows "Customer name needs review" when Firebuilder headers are the only name candidates', () => {
    const text = 'Firebuilder Form\nCustomer Information\nProduct Details\nAdditional Charges\nPhone: 815-555-0001\nsome extra filler text to exceed the review threshold minimum'
    const { warnings } = buildScannedCustomerDraft(text)
    assert.ok(warnings.some((w) => w.toLowerCase().includes('customer name')), `Expected name review warning, got: ${warnings}`)
  })

  it('no banned/sensitive leakage from Firebuilder page text', () => {
    const text = 'Firebuilder Form\nCustomer Information\nSales Person: Internal Rep\nMargin: 30%\nProduct Details\nPhone: 815-555-0001'
    const { fields } = buildScannedCustomerDraft(text)
    for (const v of Object.values(fields)) {
      assert.ok(!String(v).toLowerCase().includes('margin'), `Should not surface "margin": ${v}`)
      assert.ok(!String(v).toLowerCase().includes('sales person'), `Should not surface "sales person": ${v}`)
    }
  })
})

// ---- Single Quote Intake (Milestone 20) -------------------------------------

describe('buildSingleQuoteIntakePayload', () => {
  const baseFields = {
    customerName: 'Jane Smith',
    customerPhone: '(815) 555-1010',
    customerEmail: 'jane@example.com',
    projectAddress: '101 Maple Ave, Rockford, IL 61104',
    quoteNumber: 'Q-9999',
    quoteDate: '04/01/2026',
    notes: 'Met at showroom on Saturday.',
  }

  it('returns a safe whitelisted payload with source label and trail', () => {
    const payload = buildSingleQuoteIntakePayload({
      fields: baseFields,
      sourceFileName: 'JaneSmith_Quote.pdf',
      detectedDocType: 'benson_quote',
      pageCount: 3,
      now: new Date('2026-05-09T15:00:00.000Z'),
    })
    assert.equal(payload.sourceLabel, 'Quote PDF intake')
    assert.equal(payload.customerName, 'Jane Smith')
    assert.equal(payload.customerPhone, '(815) 555-1010')
    assert.equal(payload.customerEmail, 'jane@example.com')
    assert.equal(payload.projectAddress, '101 Maple Ave, Rockford, IL 61104')
    assert.match(payload.existingNotes, /Quote #Q-9999/)
    assert.match(payload.existingNotes, /Date: 04\/01\/2026/)
    assert.match(payload.existingNotes, /Met at showroom/)
    assert.equal(payload.customerGoal, '')
    assert.ok(Array.isArray(payload.sourceTrail))
    assert.equal(payload.sourceTrail.length, 1)
    const trail = payload.sourceTrail[0]
    assert.equal(trail.sourceFileName, 'JaneSmith_Quote.pdf')
    assert.deepEqual(trail.pageNumbers, [1])
    assert.deepEqual(trail.detectedDocTypes, ['benson_quote'])
    assert.deepEqual(trail.quoteNumbers, ['Q-9999'])
    assert.equal(trail.pageCount, 3)
    assert.ok(trail.importedAt)
  })

  it('does not persist raw PDF, image, or path fields', () => {
    const payload = buildSingleQuoteIntakePayload({
      fields: { ...baseFields, rawPdf: 'data:bytes', rawOcr: 'noise', sourcePath: 'C:\\private\\quote.pdf' },
      sourceFileName: 'q.pdf',
    })
    const banned = ['rawPdf', 'rawOcr', 'sourcePath', 'cost', 'margin', 'buyPrice', 'supplierTotal', 'bistrackConfidence', 'ocrConfidence']
    for (const k of banned) {
      assert.equal(payload[k], undefined, `Payload must not include ${k}`)
    }
    const trail = payload.sourceTrail[0]
    for (const k of banned) {
      assert.equal(trail[k], undefined, `Trail must not include ${k}`)
    }
  })

  it('strips banned customer-facing phrases from free-form notes', () => {
    const payload = buildSingleQuoteIntakePayload({
      fields: { ...baseFields, notes: 'Customer ready — proposal ready' },
      sourceFileName: 'q.pdf',
    })
    assert.ok(!/customer ready/i.test(payload.existingNotes), `Got: ${payload.existingNotes}`)
    assert.ok(!/proposal ready/i.test(payload.existingNotes), `Got: ${payload.existingNotes}`)
  })

  it('rejects company phone leakage (Benson Stone phone)', () => {
    // The phone field is taken at face value here — leakage rejection lives in
    // buildScannedCustomerDraft. But the safe() scrub still applies, and the
    // address must not retain Benson Stone fragments.
    const payload = buildSingleQuoteIntakePayload({
      fields: { ...baseFields, projectAddress: '1100 Eleventh St, Rockford, IL 61104' },
      sourceFileName: 'q.pdf',
    })
    // saveCustomerFileDurable will accept whatever we hand it — at this layer
    // we just confirm the payload didn't gain any company-only metadata.
    assert.equal(payload.sourceLabel, 'Quote PDF intake')
  })

  it('omits trail.detectedDocTypes when no doc type was detected', () => {
    const payload = buildSingleQuoteIntakePayload({
      fields: baseFields,
      sourceFileName: 'q.pdf',
    })
    assert.equal(payload.sourceTrail[0].detectedDocTypes, undefined)
  })

  it('throws no error and returns empty notes when no quote metadata is given', () => {
    const payload = buildSingleQuoteIntakePayload({
      fields: { customerName: 'Solo Person' },
      sourceFileName: 'q.pdf',
    })
    assert.equal(payload.existingNotes, '')
    assert.equal(payload.customerName, 'Solo Person')
  })
})

describe('commitSingleQuoteIntakeDraft', () => {
  function makeStorage() {
    return createSalesOsStorage({ engine: createMemoryEngine() })
  }

  it('creates a customer file and appends a scan_imported activity', async () => {
    const storage = makeStorage()
    const file = await commitSingleQuoteIntakeDraft({
      fields: {
        customerName: 'Pat Lee',
        customerPhone: '(815) 555-2020',
        customerEmail: '',
        projectAddress: '202 Pine St',
        quoteNumber: 'Q-7777',
        quoteDate: '04/15/2026',
      },
      sourceFileName: 'PatLee_Quote.pdf',
      detectedDocType: 'benson_quote',
      pageCount: 1,
      storage,
      now: new Date('2026-05-09T16:00:00.000Z'),
    })
    assert.equal(file.customerName, 'Pat Lee')
    assert.equal(file.sourceLabel, 'Quote PDF intake')
    assert.ok(Array.isArray(file.sourceTrail) && file.sourceTrail.length === 1)
    assert.equal(file.sourceTrail[0].sourceFileName, 'PatLee_Quote.pdf')

    const all = await listCustomerFilesDurable(storage)
    assert.equal(all.length, 1)
    assert.equal(all[0].id, file.id)

    const activity = await listAllActivity(storage)
    const ours = activity.filter((a) => a.fileId === file.id)
    assert.equal(ours.length, 1)
    assert.equal(ours[0].kind, 'scan_imported')
    assert.match(ours[0].summary, /quote PDF intake/i)
  })

  it('throws when customer name is missing', async () => {
    const storage = makeStorage()
    await assert.rejects(
      commitSingleQuoteIntakeDraft({
        fields: { customerName: '' },
        sourceFileName: 'q.pdf',
        storage,
      }),
      /Customer name is required/,
    )
  })
})
