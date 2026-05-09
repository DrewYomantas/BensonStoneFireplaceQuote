import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectDocType, DOC_TYPES, DOC_TYPE_LABELS } from './scanDocTypeDetector.js'

describe('DOC_TYPES', () => {
  it('exports all seven types', () => {
    const expected = ['benson_quote', 'service_order', 'firebuilder_quote', 'install_job_sheet', 'field_measure_checklist', 'photo_or_sketch', 'unknown']
    for (const t of expected) assert.ok(Object.values(DOC_TYPES).includes(t))
  })
  it('DOC_TYPE_LABELS has a label for every type', () => {
    for (const t of Object.values(DOC_TYPES)) assert.ok(DOC_TYPE_LABELS[t], `missing label for ${t}`)
  })
})

describe('detectDocType', () => {
  it('returns unknown for null', () => assert.equal(detectDocType(null), DOC_TYPES.unknown))
  it('returns unknown for empty string', () => assert.equal(detectDocType(''), DOC_TYPES.unknown))
  it('returns unknown for non-string', () => assert.equal(detectDocType(42), DOC_TYPES.unknown))

  it('returns photo_or_sketch when text is very short', () => {
    assert.equal(detectDocType('abc'), DOC_TYPES.photo_or_sketch)
    assert.equal(detectDocType('   '), DOC_TYPES.photo_or_sketch)
    assert.equal(detectDocType('Page1ofSomeDoc'), DOC_TYPES.photo_or_sketch)
  })

  it('detects benson_quote by "Quotation"', () => {
    assert.equal(detectDocType('Quotation No: Q-2025-001\nCustomer: Jane Smith'), DOC_TYPES.benson_quote)
  })
  it('detects benson_quote by "Quote No."', () => {
    assert.equal(detectDocType('Quote No. 12345\nDate: Jan 15, 2025'), DOC_TYPES.benson_quote)
  })
  it('detects benson_quote by "Quote Date"', () => {
    assert.equal(detectDocType('Quote Date: 01/15/2025\nSold to: John'), DOC_TYPES.benson_quote)
  })
  it('detects benson_quote by "Benson Stone"', () => {
    assert.equal(detectDocType('Benson Stone Co Rockford IL\nFireplace Sales'), DOC_TYPES.benson_quote)
  })
  it('detects benson_quote by "Benson Fireplace" (case-insensitive)', () => {
    assert.equal(detectDocType('benson fireplace department'), DOC_TYPES.benson_quote)
  })

  it('detects service_order by "Service Order"', () => {
    assert.equal(detectDocType('SERVICE ORDER #SO-1234\nTech: Mike'), DOC_TYPES.service_order)
  })
  it('detects service_order by "Work Order"', () => {
    assert.equal(detectDocType('Work Order\nCustomer name: Bob\nProblem: pilot light'), DOC_TYPES.service_order)
  })
  it('detects service_order by "Service Call"', () => {
    assert.equal(detectDocType('Service Call\nDate scheduled: 3/5/2025'), DOC_TYPES.service_order)
  })

  it('detects firebuilder_quote by "Firebuilder"', () => {
    assert.equal(detectDocType('Firebuilder Quote Form\nCustomer name:'), DOC_TYPES.firebuilder_quote)
  })
  it('detects firebuilder_quote by "Fire Builder"', () => {
    assert.equal(detectDocType('Fire Builder system quote\nDate:'), DOC_TYPES.firebuilder_quote)
  })

  it('detects install_job_sheet by "Installation Job Sheet"', () => {
    assert.equal(detectDocType('Installation Job Sheet\nJob number: 001'), DOC_TYPES.install_job_sheet)
  })
  it('detects install_job_sheet by "Job Sheet"', () => {
    assert.equal(detectDocType('Job Sheet\nInstaller: Dave\nDate:'), DOC_TYPES.install_job_sheet)
  })
  it('detects install_job_sheet by "Installation Checklist"', () => {
    assert.equal(detectDocType('Installation Checklist\n[ ] Check clearances'), DOC_TYPES.install_job_sheet)
  })

  it('detects field_measure_checklist by "Field Measure"', () => {
    assert.equal(
      detectDocType('Field Measure\nRoom width: 14ft\nFireplace opening depth: 18in\nCustomer: Pat'),
      DOC_TYPES.field_measure_checklist,
    )
  })
  it('detects field_measure_checklist by "Field Measurement"', () => {
    assert.equal(
      detectDocType('Field Measurement Sheet\nCustomer name:\nAddress:\nRoom dimensions:'),
      DOC_TYPES.field_measure_checklist,
    )
  })
  it('detects field_measure_checklist by "Measure Checklist"', () => {
    assert.equal(
      detectDocType('Measure Checklist\nOpening width:\nOpening height:\nHearth depth:'),
      DOC_TYPES.field_measure_checklist,
    )
  })

  it('field_measure_checklist takes priority over benson_quote when both match', () => {
    assert.equal(
      detectDocType('Field Measure Checklist\nBenson Stone Company Rockford IL\nQuote No: Q-1234\nCustomer name:'),
      DOC_TYPES.field_measure_checklist,
    )
  })

  it('returns unknown for generic unrecognized text', () => {
    assert.equal(
      detectDocType('This is a long block of text with no recognizable document type keywords at all and it is many chars'),
      DOC_TYPES.unknown,
    )
  })

  it('does not mutate input', () => {
    const text = 'Quotation\nCustomer: Jane'
    const copy = text.slice()
    detectDocType(text)
    assert.equal(text, copy)
  })
})
