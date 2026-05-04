import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendCustomerFileItem,
  createEmptyCustomerFile,
  customerFileFromOpportunity,
  getCustomerFile,
  getCustomerFileByOpportunity,
  listCustomerFiles,
  makeCustomerFileId,
  mergeCustomerFileWithOpportunity,
  saveCustomerFile,
  updateCustomerFile,
  removeCustomerFile,
  sanitizeCustomerFile,
} from './customerFile.js'

function memStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

describe('customerFile model', () => {
  let storage
  beforeEach(() => { storage = memStorage() })

  it('makes id from opportunity, name, or timestamp', () => {
    assert.equal(makeCustomerFileId({ opportunityId: 'quote-123' }), 'cf-quote-123')
    assert.equal(makeCustomerFileId({ customerName: 'Anna Orlinska', customerPhone: '(207) 555-0100' }), 'cf-anna-orlinska-207-555-0100')
    assert.match(makeCustomerFileId({}), /^cf-/)
  })

  it('createEmptyCustomerFile fills required strings and arrays', () => {
    const file = createEmptyCustomerFile({ customerName: 'Test' })
    assert.equal(file.customerName, 'Test')
    assert.equal(typeof file.id, 'string')
    assert.ok(Array.isArray(file.photos))
    assert.equal(file.photos.length, 0)
  })

  it('saves, lists, gets, and updates files', () => {
    const file = createEmptyCustomerFile({ customerName: 'Drew' }, new Date())
    saveCustomerFile(file, storage)
    assert.equal(listCustomerFiles(storage).length, 1)
    assert.equal(getCustomerFile(file.id, storage).customerName, 'Drew')

    updateCustomerFile(file.id, { customerEmail: 'd@example.com' }, storage)
    assert.equal(getCustomerFile(file.id, storage).customerEmail, 'd@example.com')
  })

  it('appends array items with stable ids', () => {
    const file = createEmptyCustomerFile({ customerName: 'Linda' })
    saveCustomerFile(file, storage)
    appendCustomerFileItem(file.id, 'photos', { label: 'mantel west wall', source: 'in-person' }, storage)
    appendCustomerFileItem(file.id, 'photos', { label: 'firebox' }, storage)
    const after = getCustomerFile(file.id, storage)
    assert.equal(after.photos.length, 2)
    assert.equal(after.photos[0].label, 'mantel west wall')
    assert.ok(after.photos[0].id)
  })

  it('rejects appends to non-array fields', () => {
    const file = createEmptyCustomerFile({ customerName: 'X' })
    saveCustomerFile(file, storage)
    assert.throws(() => appendCustomerFileItem(file.id, 'customerName', { label: 'oops' }, storage))
  })

  it('removes a file', () => {
    const a = createEmptyCustomerFile({ customerName: 'A' })
    const b = createEmptyCustomerFile({ customerName: 'B' })
    saveCustomerFile(a, storage)
    saveCustomerFile(b, storage)
    removeCustomerFile(a.id, storage)
    assert.equal(listCustomerFiles(storage).length, 1)
  })

  it('finds files by opportunity id', () => {
    const file = createEmptyCustomerFile({ customerName: 'Y', opportunityId: 'quote-99' })
    saveCustomerFile(file, storage)
    assert.equal(getCustomerFileByOpportunity('quote-99', storage)?.id, file.id)
    assert.equal(getCustomerFileByOpportunity('missing', storage), null)
  })

  it('hydrates file from opportunity', () => {
    const file = customerFileFromOpportunity({
      id: 'quote-1',
      customerName: 'Owen',
      customerPhone: '5551212',
      desiredOutcome: 'Convert insert to gas',
      lineItemQuoteAttached: 'true',
    })
    assert.equal(file.opportunityId, 'quote-1')
    assert.equal(file.customerGoal, 'Convert insert to gas')
    assert.equal(file.lineItemQuoteIncluded, 'true')
  })

  it('sanitize drops unknown keys and coerces arrays', () => {
    const dirty = sanitizeCustomerFile({ customerName: 'Z', photos: 'not-array', randomKey: 'no' })
    assert.equal(dirty.customerName, 'Z')
    assert.deepEqual(dirty.photos, [])
    assert.equal(dirty.randomKey, undefined)
  })

  it('merges a saved showroom visit with a newly imported quote without erasing visit context', () => {
    const visit = createEmptyCustomerFile({
      customerName: 'Showroom Customer',
      customerPhone: '555-0000',
      customerGoal: 'Wants less mess from existing fireplace',
      likelyPath: 'Gas logs or gas insert discussion',
      photos: [{ id: 'p1', label: 'Phone photo' }],
    })
    const merged = mergeCustomerFileWithOpportunity(visit, {
      id: 'quote-77',
      customerName: 'Different Parsed Name',
      customerEmail: 'parsed@example.com',
      customerPhone: '',
      desiredOutcome: 'Parsed goal should not replace visit notes',
      lineItemQuoteAttached: 'true',
    }, new Date('2026-05-03T12:00:00.000Z'))

    assert.equal(merged.id, visit.id)
    assert.equal(merged.opportunityId, 'quote-77')
    assert.equal(merged.customerName, 'Showroom Customer')
    assert.equal(merged.customerPhone, '555-0000')
    assert.equal(merged.customerEmail, 'parsed@example.com')
    assert.equal(merged.customerGoal, 'Wants less mess from existing fireplace')
    assert.equal(merged.likelyPath, 'Gas logs or gas insert discussion')
    assert.equal(merged.photos.length, 1)
    assert.equal(merged.lineItemQuoteIncluded, 'true')
  })

})
