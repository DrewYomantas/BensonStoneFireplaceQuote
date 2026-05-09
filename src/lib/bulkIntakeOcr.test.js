import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isOcrTextWeak,
  ocrPageWarning,
  ocrProgressLabel,
  OCR_PAGE_LIMIT,
} from './bulkIntakeOcr.js'

describe('isOcrTextWeak', () => {
  it('true for empty string', () => {
    assert.equal(isOcrTextWeak(''), true)
  })
  it('true for whitespace-only', () => {
    assert.equal(isOcrTextWeak('   \n\t  '), true)
  })
  it('true for short noisy output', () => {
    assert.equal(isOcrTextWeak('abc 123 xyz'), true)
  })
  it('false for a plausible customer list extract', () => {
    const text = [
      'name,phone,email',
      'John Smith,815-555-0001,john@example.com',
      'Jane Doe,815-555-0002,jane@example.com',
      'Bob Johnson,815-555-0003,bob@example.com',
    ].join('\n')
    assert.equal(isOcrTextWeak(text), false)
  })
  it('false for text exactly at the threshold (80 non-whitespace chars)', () => {
    const text = 'a'.repeat(80)
    assert.equal(isOcrTextWeak(text), false)
  })
  it('true for text one char below the threshold', () => {
    const text = 'a'.repeat(79)
    assert.equal(isOcrTextWeak(text), true)
  })
})

describe('ocrPageWarning', () => {
  it('null for 1 page', () => {
    assert.equal(ocrPageWarning(1), null)
  })
  it('null for exactly OCR_PAGE_LIMIT', () => {
    assert.equal(ocrPageWarning(OCR_PAGE_LIMIT), null)
  })
  it('returns a string for OCR_PAGE_LIMIT + 1', () => {
    const warn = ocrPageWarning(OCR_PAGE_LIMIT + 1)
    assert.ok(typeof warn === 'string', 'should be a string')
    assert.ok(warn.includes(String(OCR_PAGE_LIMIT)), 'should mention the page limit')
  })
  it('mentions the actual page count', () => {
    const warn = ocrPageWarning(20)
    assert.ok(warn.includes('20'), 'should mention 20 pages')
  })
  it('includes timing guidance so the user knows to wait', () => {
    const warn = ocrPageWarning(OCR_PAGE_LIMIT + 1)
    const lower = warn.toLowerCase()
    assert.ok(lower.includes('minute') || lower.includes('few'), 'should set time expectations')
  })
  it('mentions large packet', () => {
    const warn = ocrPageWarning(15)
    assert.ok(warn.toLowerCase().includes('large') || warn.toLowerCase().includes('packet'), 'should say large packet')
  })
})

describe('ocrProgressLabel', () => {
  it('null progress returns default', () => {
    assert.equal(ocrProgressLabel(null), 'Extracting text…')
  })
  it('loading-engine stage returns OCR engine message', () => {
    const label = ocrProgressLabel({ stage: 'loading-engine' })
    const lower = label.toLowerCase()
    assert.ok(lower.includes('ocr') || lower.includes('engine'), 'should mention OCR engine')
  })
  it('loading-engine message does not include page numbers', () => {
    const label = ocrProgressLabel({ stage: 'loading-engine' })
    assert.ok(!label.includes('page 0') && !label.includes('page 1'), 'should not reference a page')
  })
  it('rendering stage shows page numbers', () => {
    const label = ocrProgressLabel({ stage: 'rendering', pageNumber: 2, pageCount: 5 })
    assert.ok(label.includes('2'), 'should include pageNumber')
    assert.ok(label.includes('5'), 'should include pageCount')
  })
  it('ocr stage with pageNumber > 0 shows scanning', () => {
    const label = ocrProgressLabel({ stage: 'ocr', pageNumber: 3, pageCount: 5 })
    assert.ok(label.toLowerCase().includes('scan'), 'should say scanning')
    assert.ok(label.includes('3'))
    assert.ok(label.includes('5'))
  })
  it('ocr stage with pageNumber 0 shows preparing', () => {
    const label = ocrProgressLabel({ stage: 'ocr', pageNumber: 0, pageCount: 4 })
    assert.ok(label.toLowerCase().includes('preparing'))
  })
})
