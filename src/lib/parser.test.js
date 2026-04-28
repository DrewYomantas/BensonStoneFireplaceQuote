import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parseNotes } from './parser.js'

const annaNotesPath = new URL('../data/anna-orlinska-notes.txt', import.meta.url)
const annaOutputPath = new URL('../../examples/anna-orlinska-output.json', import.meta.url)

test('Anna sample matches the example output', () => {
  const notes = fs.readFileSync(annaNotesPath, 'utf8')
  const expected = JSON.parse(fs.readFileSync(annaOutputPath, 'utf8'))

  const result = parseNotes(notes)

  assert.deepEqual(result.fields, expected)
})

test('two-package quote parses both package titles and line items', () => {
  const notes = `
Customer: Test Customer
Invoice Address: 100 Main St
Invoice City/State/Zip: Rockford, IL 61104
Project Address: 100 Main St
Project City/State/Zip: Rockford, IL 61104
Quote No: TQ-100
Quote Date: 04/27/2026
Project Title: Fireplace Refresh
Project Overview:
- Replace fireplace
Installation Scope:
- Install and vent

Package 1: Basic Insert
- Unit A - $4,200.00
- Black liner - $300.00
- Vent liner kit - $900.00
- Install package 1 - $1,500.00

Package 2: Premium Insert
- Unit B - $5,900.00
- Brick liner - $450.00
- Vent liner kit - $900.00
- Install package 2 - $1,850.00

Total Amount: $7,800.00
Quotation Total: $7,800.00
Amount Paid: $0.00
Balance Due: $7,800.00
Legal Terms:
- Final measurement required
`.trim()

  const result = parseNotes(notes)

  assert.equal(result.fields.PACKAGE_1_TITLE, 'Basic Insert')
  assert.equal(result.fields.PACKAGE_1_ITEM_1, 'Unit A')
  assert.equal(result.fields.PACKAGE_2_TITLE, 'Premium Insert')
  assert.equal(result.fields.PACKAGE_2_ITEM_1, 'Unit B')
  assert.equal(result.fields.PACKAGE_2_INSTALL_PRICE, '$1,850.00')
})

test('delivery date mention creates a warning and stays out of field mapping', () => {
  const notes = `
Customer: Delivery Test
Invoice Address: 100 Main St
Invoice City/State/Zip: Rockford, IL 61104
Project Address: 100 Main St
Project City/State/Zip: Rockford, IL 61104
Quote No: DQ-100
Quote Date: 04/27/2026
Project Title: Delivery Date Review
Project Overview:
- Replace fireplace
Project Notes:
- Delivery date requested for late May
Installation Scope:
- Install and vent
Total Amount: $5,000.00
Quotation Total: $5,000.00
Amount Paid: $0.00
Balance Due: $5,000.00
Legal Terms:
- Subject to field verification
`.trim()

  const result = parseNotes(notes)

  assert.equal(result.audit.deliveryDateMentioned, true)
  assert.ok(
    result.audit.warnings.some((warning) => warning.includes('Delivery date was mentioned')),
  )
})

test('missing PO number stays blank', () => {
  const notes = `
Customer: No PO Customer
Invoice Address: 100 Main St
Invoice City/State/Zip: Rockford, IL 61104
Project Address: 100 Main St
Project City/State/Zip: Rockford, IL 61104
Quote No: PO-100
Quote Date: 04/27/2026
Project Title: No PO Quote
Project Overview:
- Replace fireplace
Installation Scope:
- Install and vent
Total Amount: $4,000.00
Quotation Total: $4,000.00
Amount Paid: $0.00
Balance Due: $4,000.00
Legal Terms:
- Subject to field verification
`.trim()

  const result = parseNotes(notes)

  assert.equal(result.fields.PO_NUMBER, '')
})

test('total mismatch creates a warning', () => {
  const notes = `
Customer: Mismatch Customer
Invoice Address: 100 Main St
Invoice City/State/Zip: Rockford, IL 61104
Project Address: 100 Main St
Project City/State/Zip: Rockford, IL 61104
Quote No: MM-100
Quote Date: 04/27/2026
Project Title: Mismatch Quote
Project Overview:
- Replace fireplace
Installation Scope:
- Install and vent
Total Amount: $4,000.00
IR Tax: $250.00
Quotation Total: $4,100.00
Amount Paid: $100.00
Balance Due: $3,900.00
Legal Terms:
- Subject to field verification
`.trim()

  const result = parseNotes(notes)

  assert.ok(
    result.audit.warnings.some((warning) => warning.includes('Total Amount plus IR Tax does not match Quotation Total.')),
  )
})
