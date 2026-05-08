import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectCustomerFileForDisplay, deriveFileWarnings } from './customerFileView.js'

const SENSITIVE = [
  'cost', 'averageCost', 'buyPrice', 'margin', 'marginPercent',
  'supplierTotal', 'supplierHistory', 'rawOcr', 'rawPdf',
  'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
  'salesRank', 'productRank',
]

describe('customerFileView', () => {
  it('strips sensitive keys from display projection', () => {
    const raw = { id: 'cf-x', customerName: 'Audit' }
    for (const k of SENSITIVE) raw[k] = 'leak'
    const out = projectCustomerFileForDisplay(raw)
    assert.equal(out.customerName, 'Audit')
    for (const k of SENSITIVE) {
      assert.equal(k in out, false, `${k} must not reach the display layer`)
    }
  })

  it('keeps the safe customer-file keys', () => {
    const out = projectCustomerFileForDisplay({
      id: 'cf-1',
      customerName: 'Anna',
      customerPhone: '1',
      customerGoal: 'more-heat',
      existingNotes: 'wood insert',
      projectAddress: '123 Maple',
    })
    assert.equal(out.id, 'cf-1')
    assert.equal(out.customerName, 'Anna')
    assert.equal(out.customerPhone, '1')
    assert.equal(out.customerGoal, 'more-heat')
    assert.equal(out.existingNotes, 'wood insert')
    assert.equal(out.projectAddress, '123 Maple')
  })

  it('deriveFileWarnings flags missing essentials', () => {
    const codes = deriveFileWarnings({}).map((w) => w.code)
    assert.ok(codes.includes('missing-customer-name'))
    assert.ok(codes.includes('missing-contact'))
    assert.ok(codes.includes('missing-current-setup'))
    assert.ok(codes.includes('unclear-goal'))
  })

  it('deriveFileWarnings is empty for a complete file', () => {
    const w = deriveFileWarnings({
      customerName: 'A', customerPhone: '1', existingNotes: 'X', customerGoal: 'more-heat',
    })
    assert.deepEqual(w, [])
  })
})
