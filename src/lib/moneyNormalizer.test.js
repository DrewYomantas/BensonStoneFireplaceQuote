import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMoneyCandidates,
  formatMoney,
  normalizeMoneyCandidate,
  normalizeMoneyDetailed,
  normalizeMoneyValue,
} from './moneyNormalizer.js'

describe('normalizeMoneyValue — well-formed inputs', () => {
  it('parses dollar-sign comma-thousands totals', () => {
    assert.equal(normalizeMoneyValue('$21,067.54'), 21067.54)
    assert.equal(normalizeMoneyValue('$6,594.86'), 6594.86)
  })

  it('parses bare numeric totals', () => {
    assert.equal(normalizeMoneyValue('21067.54'), 21067.54)
    assert.equal(normalizeMoneyValue('403.09'), 403.09)
  })

  it('parses comma-only thousands separators', () => {
    assert.equal(normalizeMoneyValue('7,542.00'), 7542)
    assert.equal(normalizeMoneyValue('1,234,567.89'), 1234567.89)
  })

  it('parses standalone small decimals', () => {
    assert.equal(normalizeMoneyValue('$6.80'), 6.8)
  })
})

describe('normalizeMoneyValue — OCR artifacts', () => {
  it('recovers European-separator artifacts where dot is used as thousands', () => {
    assert.equal(normalizeMoneyValue('$7.542.00'), 7542)
    assert.equal(normalizeMoneyValue('$6.802.00'), 6802)
    assert.equal(normalizeMoneyValue('$21.067.54'), 21067.54)
  })

  it('recovers totals with trailing label noise', () => {
    assert.equal(normalizeMoneyValue('Quotation Total $6.802.00 USD'), 6802)
  })

  it('picks the last money-like candidate when multiple appear', () => {
    assert.equal(normalizeMoneyValue('Subtotal $6.802.00 plus tax — total $7.205.14'), 7205.14)
  })
})

describe('normalizeMoneyValue — invalid input', () => {
  it('returns null for empty and non-numeric input', () => {
    assert.equal(normalizeMoneyValue(''), null)
    assert.equal(normalizeMoneyValue(null), null)
    assert.equal(normalizeMoneyValue(undefined), null)
    assert.equal(normalizeMoneyValue('abc'), null)
    assert.equal(normalizeMoneyValue('No money here.'), null)
  })

  it('does not invent money values from unrelated digits', () => {
    assert.equal(normalizeMoneyValue('Quote #74465'), null)
    assert.equal(normalizeMoneyValue('Phone 815-555-0100'), null)
  })
})

describe('normalizeMoneyCandidate', () => {
  it('parses an individual candidate string directly', () => {
    assert.equal(normalizeMoneyCandidate('$6,594.86'), 6594.86)
    assert.equal(normalizeMoneyCandidate('7.542.00'), 7542)
  })

  it('handles candidates without thousands separators or decimals', () => {
    assert.equal(normalizeMoneyCandidate('500'), 500)
  })
})

describe('extractMoneyCandidates', () => {
  it('finds every money-like candidate in a string', () => {
    const candidates = extractMoneyCandidates('Subtotal $6,191.77 Tax $403.09 Quotation Total $6,594.86')
    assert.deepEqual(candidates, ['$6,191.77', '$403.09', '$6,594.86'])
  })

  it('returns empty array when nothing matches', () => {
    assert.deepEqual(extractMoneyCandidates('No money here'), [])
  })
})

describe('normalizeMoneyDetailed', () => {
  it('flags didChange=false on well-formed candidates', () => {
    const result = normalizeMoneyDetailed('$6,594.86')
    assert.equal(result.value, 6594.86)
    assert.equal(result.didChange, false)
    assert.equal(result.original, '$6,594.86')
    assert.equal(result.candidate, '$6,594.86')
  })

  it('flags didChange=true on recovered OCR artifact', () => {
    const result = normalizeMoneyDetailed('Quotation Total $7.542.00')
    assert.equal(result.value, 7542)
    assert.equal(result.didChange, true)
  })

  it('returns null value when no candidate is found', () => {
    const result = normalizeMoneyDetailed('No money here')
    assert.equal(result.value, null)
    assert.equal(result.didChange, false)
    assert.equal(result.candidate, null)
  })
})

describe('formatMoney', () => {
  it('formats numeric values as $X,XXX.XX', () => {
    assert.equal(formatMoney(6594.86), '$6,594.86')
    assert.equal(formatMoney(0), '$0.00')
    assert.equal(formatMoney(1234567.8), '$1,234,567.80')
  })

  it('returns empty string for null/invalid', () => {
    assert.equal(formatMoney(null), '')
    assert.equal(formatMoney(undefined), '')
    assert.equal(formatMoney('abc'), '')
  })
})
