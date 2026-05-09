import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildScannedCustomerDraft,
  normalizeScannedDraftField,
  detectScannedDraftWarnings,
} from './scannedCustomerDraft.js'

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
