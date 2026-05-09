import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  suggestPageGroups,
  buildPacketGroupDraft,
  normalizeSourceTrail,
  revalidatePacketGroupDraft,
  _buildPacketDraftWarnings,
} from './scannedPacketGroups.js'

// ---- Helpers -----------------------------------------------------------------

let _idCounter = 0
function makePage(overrides = {}) {
  _idCounter++
  return {
    id: `pi-test-${_idCounter}`,
    pageNumber: overrides.pageNumber ?? _idCounter,
    detectedDocType: overrides.detectedDocType ?? 'benson_quote',
    scanDraftFields: overrides.scanDraftFields ?? null,
    status: overrides.status ?? 'ready-to-review',
    extractedText: overrides.extractedText ?? '',
    ...overrides,
  }
}

function fields(overrides = {}) {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    projectAddress: '',
    quoteNumber: '',
    quoteDate: '',
    existingNotes: '',
    ...overrides,
  }
}

// ---- suggestPageGroups -------------------------------------------------------

describe('suggestPageGroups — edge cases', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(suggestPageGroups([]), [])
  })
  it('returns empty array for single page', () => {
    assert.deepEqual(suggestPageGroups([makePage()]), [])
  })
  it('returns empty array for null/non-array', () => {
    assert.deepEqual(suggestPageGroups(null), [])
    assert.deepEqual(suggestPageGroups(undefined), [])
  })
  it('does not mutate input', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-1' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-1' }) }),
    ]
    const snapshot = JSON.stringify(pages)
    suggestPageGroups(pages)
    assert.equal(JSON.stringify(pages), snapshot)
  })
})

describe('suggestPageGroups — same_quote', () => {
  it('suggests same_quote for pages sharing quote number', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-1001', customerName: 'Alice' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ quoteNumber: 'Q-1001' }) }),
    ]
    const result = suggestPageGroups(pages)
    const s = result.find((r) => r.reason === 'same_quote')
    assert.ok(s, 'expected same_quote suggestion')
    assert.ok(s.pageIds.includes(pages[0].id))
    assert.ok(s.pageIds.includes(pages[1].id))
    assert.ok(s.label.includes('Q-1001'))
  })

  it('suggests same_quote for non-adjacent pages', () => {
    const p1 = makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-999' }) })
    const p2 = makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: null })
    const p3 = makePage({ detectedDocType: 'install_job_sheet', scanDraftFields: fields({ quoteNumber: 'Q-999' }) })
    const result = suggestPageGroups([p1, p2, p3])
    const s = result.find((r) => r.reason === 'same_quote')
    assert.ok(s, 'should find same_quote for non-adjacent pages')
    assert.ok(s.pageIds.includes(p1.id))
    assert.ok(s.pageIds.includes(p3.id))
  })

  it('groups 3+ pages with same quote number together', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-77' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ quoteNumber: 'Q-77' }) }),
      makePage({ detectedDocType: 'install_job_sheet', scanDraftFields: fields({ quoteNumber: 'Q-77' }) }),
    ]
    const result = suggestPageGroups(pages)
    const s = result.find((r) => r.reason === 'same_quote')
    assert.ok(s)
    assert.equal(s.pageIds.length, 3)
    assert.equal(s.pageNumbers.length, 3)
  })

  it('does not suggest same_quote for pages with no quote number', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: '' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ quoteNumber: '' }) }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'same_quote').length, 0)
  })
})

describe('suggestPageGroups — same_customer', () => {
  it('suggests same_customer for pages sharing customer name', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Bob Smith' }) }),
      makePage({ detectedDocType: 'install_job_sheet', scanDraftFields: fields({ customerName: 'Bob Smith' }) }),
    ]
    const result = suggestPageGroups(pages)
    const s = result.find((r) => r.reason === 'same_customer')
    assert.ok(s, 'expected same_customer suggestion')
  })

  it('does not suggest same_customer for pages with empty name', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: '' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ customerName: '' }) }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'same_customer').length, 0)
  })

  it('does not suggest same_customer for very short names', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'AB' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ customerName: 'AB' }) }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'same_customer').length, 0)
  })

  it('prefers same_quote over same_customer for identical pages — deduplicated', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-5', customerName: 'Alice' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-5', customerName: 'Alice' }) }),
    ]
    const result = suggestPageGroups(pages)
    // Same pair should appear only once (key dedup)
    const keys = result.map((r) => r.pageIds.slice().sort().join('::'))
    const uniqueKeys = new Set(keys)
    assert.equal(keys.length, uniqueKeys.size, 'duplicate group suggestions found')
  })
})

describe('suggestPageGroups — adjacent_reference', () => {
  it('suggests adjacent_reference for photo page next to a quote page', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice' }) }),
      makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: null }),
    ]
    const result = suggestPageGroups(pages)
    const s = result.find((r) => r.reason === 'adjacent_reference')
    assert.ok(s, 'expected adjacent_reference suggestion')
    assert.ok(s.pageIds.includes(pages[0].id))
    assert.ok(s.pageIds.includes(pages[1].id))
  })

  it('suggests adjacent_reference for unknown page next to a quote page', () => {
    const pages = [
      makePage({ detectedDocType: 'unknown', scanDraftFields: null }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ customerName: 'Bob' }) }),
    ]
    const result = suggestPageGroups(pages)
    const s = result.find((r) => r.reason === 'adjacent_reference')
    assert.ok(s, 'expected adjacent_reference suggestion')
  })

  it('does not suggest adjacent_reference for two reference pages', () => {
    const pages = [
      makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: null }),
      makePage({ detectedDocType: 'unknown', scanDraftFields: null }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'adjacent_reference').length, 0)
  })

  it('does not suggest adjacent_reference for two real pages', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ customerName: 'Bob' }) }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'adjacent_reference').length, 0)
  })

  it('blank/photo/sketch pages do not produce same_quote or same_customer suggestions', () => {
    const pages = [
      makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: null }),
      makePage({ detectedDocType: 'unknown', scanDraftFields: null }),
    ]
    const result = suggestPageGroups(pages)
    assert.equal(result.filter((r) => r.reason === 'same_quote' || r.reason === 'same_customer').length, 0)
  })
})

// ---- buildPacketGroupDraft ---------------------------------------------------

describe('buildPacketGroupDraft — edge cases', () => {
  it('returns null for empty array', () => {
    assert.equal(buildPacketGroupDraft([]), null)
  })
  it('returns null for null', () => {
    assert.equal(buildPacketGroupDraft(null), null)
  })
  it('does not mutate input', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice' }) }),
    ]
    const snapshot = JSON.stringify(pages)
    buildPacketGroupDraft(pages)
    assert.equal(JSON.stringify(pages), snapshot)
  })
})

describe('buildPacketGroupDraft — field merging', () => {
  it('merges customer fields from selected pages (first non-empty wins)', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice', customerPhone: '(815) 555-0001', projectAddress: '123 Main St' }) }),
      makePage({ detectedDocType: 'service_order', scanDraftFields: fields({ customerName: 'Alice', customerEmail: 'alice@example.com' }) }),
    ]
    const draft = buildPacketGroupDraft(pages, { sourceFileName: 'scan.pdf' })
    assert.equal(draft.customerName, 'Alice')
    assert.equal(draft.phone, '(815) 555-0001')
    assert.equal(draft.email, 'alice@example.com')
    assert.equal(draft.address, '123 Main St')
    assert.equal(draft.sourceFileName, 'scan.pdf')
    assert.deepEqual(draft.pageNumbers, pages.map((p) => p.pageNumber).sort((a, b) => a - b))
  })

  it('does not pull identity fields from reference/photo pages', () => {
    const pages = [
      makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: fields({ customerName: 'FAKE NAME', customerPhone: '(999) 999-9999' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Real Person' }) }),
    ]
    const draft = buildPacketGroupDraft(pages)
    assert.equal(draft.customerName, 'Real Person')
    assert.equal(draft.phone, '')
  })

  it('collects unique quote numbers from non-reference pages', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-1001' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-1001' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-2002' }) }),
    ]
    const draft = buildPacketGroupDraft(pages)
    assert.ok(draft.quoteNumbers.includes('Q-1001'))
    assert.ok(draft.quoteNumbers.includes('Q-2002'))
    assert.equal(draft.quoteNumbers.length, 2)
  })

  it('does not include quote numbers from reference pages', () => {
    const pages = [
      makePage({ detectedDocType: 'photo_or_sketch', scanDraftFields: fields({ quoteNumber: 'Q-FAKE' }) }),
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ quoteNumber: 'Q-REAL' }) }),
    ]
    const draft = buildPacketGroupDraft(pages)
    assert.ok(draft.quoteNumbers.includes('Q-REAL'))
    assert.ok(!draft.quoteNumbers.includes('Q-FAKE'))
  })

  it('sorts page numbers', () => {
    const pages = [
      makePage({ pageNumber: 5, detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'A' }) }),
      makePage({ pageNumber: 2, detectedDocType: 'service_order', scanDraftFields: fields({ customerName: 'A' }) }),
      makePage({ pageNumber: 8, detectedDocType: 'install_job_sheet', scanDraftFields: fields({ customerName: 'A' }) }),
    ]
    const draft = buildPacketGroupDraft(pages)
    assert.deepEqual(draft.pageNumbers, [2, 5, 8])
  })

  it('strips banned phrases from customer fields', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'approved customer' }) }),
    ]
    const draft = buildPacketGroupDraft(pages)
    assert.equal(draft.customerName, '')
  })

  it('has id, sourceFileName, and notes fields', () => {
    const pages = [makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice' }) })]
    const draft = buildPacketGroupDraft(pages, { sourceFileName: 'batch.pdf' })
    assert.ok(draft.id.startsWith('pkg-'))
    assert.equal(draft.sourceFileName, 'batch.pdf')
    assert.equal(draft.notes, '')
    assert.ok(Array.isArray(draft.orderNumbers))
    assert.ok(Array.isArray(draft.warnings))
  })
})

describe('buildPacketGroupDraft — duplicate detection', () => {
  it('warns when phone matches existing file', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice', customerPhone: '(815) 555-0001' }) }),
    ]
    const existingFiles = [{ id: 'cf-existing', customerName: 'Alice', customerPhone: '(815) 555-0001', customerEmail: '' }]
    const draft = buildPacketGroupDraft(pages, { existingFiles })
    assert.ok(draft.warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('warns when email matches existing file', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice', customerEmail: 'alice@x.com' }) }),
    ]
    const existingFiles = [{ id: 'cf-existing', customerName: 'Alice', customerPhone: '', customerEmail: 'alice@x.com' }]
    const draft = buildPacketGroupDraft(pages, { existingFiles })
    assert.ok(draft.warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('warns when name matches existing file', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Bob Jones' }) }),
    ]
    const existingFiles = [{ id: 'cf-existing', customerName: 'Bob Jones', customerPhone: '', customerEmail: '' }]
    const draft = buildPacketGroupDraft(pages, { existingFiles })
    assert.ok(draft.warnings.some((w) => w.toLowerCase().includes('duplicate')))
  })

  it('no duplicate warning when existing files list is empty', () => {
    const pages = [
      makePage({ detectedDocType: 'benson_quote', scanDraftFields: fields({ customerName: 'Alice', customerPhone: '(815) 555-0001' }) }),
    ]
    const draft = buildPacketGroupDraft(pages, { existingFiles: [] })
    assert.equal(draft.warnings.filter((w) => w.toLowerCase().includes('duplicate')).length, 0)
  })
})

// ---- _buildPacketDraftWarnings -----------------------------------------------

describe('_buildPacketDraftWarnings', () => {
  it('warns for missing name', () => {
    const draft = { customerName: '', phone: '', email: '', pageNumbers: [1] }
    assert.ok(_buildPacketDraftWarnings(draft).some((w) => w.toLowerCase().includes('name')))
  })
  it('warns for missing contact', () => {
    const draft = { customerName: 'Alice', phone: '', email: '', pageNumbers: [1] }
    assert.ok(_buildPacketDraftWarnings(draft).some((w) => w.toLowerCase().includes('contact')))
  })
  it('no warnings for complete valid draft', () => {
    const draft = { customerName: 'Alice', phone: '(815) 555-0001', email: '', pageNumbers: [1] }
    assert.equal(_buildPacketDraftWarnings(draft, []).length, 0)
  })
})

// ---- revalidatePacketGroupDraft ----------------------------------------------

describe('revalidatePacketGroupDraft', () => {
  it('returns null for null input', () => {
    assert.equal(revalidatePacketGroupDraft(null), null)
  })
  it('returns new warnings without mutating the original', () => {
    const draft = { customerName: '', phone: '', email: '', pageNumbers: [1], warnings: [] }
    const result = revalidatePacketGroupDraft(draft, [])
    assert.ok(result.warnings.length > 0)
    assert.equal(draft.warnings.length, 0, 'original should not be mutated')
  })
  it('clears warnings after field is filled', () => {
    const draft = { customerName: 'Alice', phone: '', email: '', pageNumbers: [1], warnings: ['Missing contact info'] }
    const result = revalidatePacketGroupDraft({ ...draft, phone: '(815) 555-0001' }, [])
    assert.equal(result.warnings.length, 0)
  })
})

// ---- normalizeSourceTrail ---------------------------------------------------

describe('normalizeSourceTrail', () => {
  it('returns null for non-object input', () => {
    assert.equal(normalizeSourceTrail(null), null)
    assert.equal(normalizeSourceTrail('string'), null)
    assert.equal(normalizeSourceTrail([]), null)
    assert.equal(normalizeSourceTrail(42), null)
  })

  it('keeps safe string keys', () => {
    const trail = { sourceFileName: 'scan.pdf', importedAt: '2026-05-08T12:00:00Z' }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.sourceFileName, 'scan.pdf')
    assert.equal(result.importedAt, '2026-05-08T12:00:00Z')
  })

  it('keeps safe array keys as string arrays', () => {
    const trail = {
      pageNumbers: [1, 2, 3],
      quoteNumbers: ['Q-1001'],
      orderNumbers: [],
      detectedDocTypes: ['benson_quote', 'service_order'],
    }
    const result = normalizeSourceTrail(trail)
    assert.deepEqual(result.pageNumbers, ['1', '2', '3'])
    assert.deepEqual(result.quoteNumbers, ['Q-1001'])
    assert.deepEqual(result.orderNumbers, [])
    assert.deepEqual(result.detectedDocTypes, ['benson_quote', 'service_order'])
  })

  it('strips rawOcr, rawPdf', () => {
    const trail = { sourceFileName: 'scan.pdf', rawOcr: 'secret ocr', rawPdf: 'bytes', pageNumbers: [] }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.rawOcr, undefined)
    assert.equal(result.rawPdf, undefined)
  })

  it('strips filePath and localPath', () => {
    const trail = { sourceFileName: 'scan.pdf', filePath: '/private/path', localPath: 'C:\\secret', pageNumbers: [] }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.filePath, undefined)
    assert.equal(result.localPath, undefined)
  })

  it('strips cost, margin, buyPrice, supplierTotal, salesRank, productRank', () => {
    const trail = {
      sourceFileName: 'scan.pdf',
      cost: '1000',
      margin: '0.3',
      buyPrice: '500',
      supplierTotal: '800',
      salesRank: '1',
      productRank: '2',
      pageNumbers: [],
    }
    const result = normalizeSourceTrail(trail)
    for (const k of ['cost', 'margin', 'buyPrice', 'supplierTotal', 'salesRank', 'productRank']) {
      assert.equal(result[k], undefined, `expected ${k} to be stripped`)
    }
  })

  it('strips bistrackConfidence, ocrConfidence, fuzzyMatchConfidence', () => {
    const trail = {
      bistrackConfidence: '0.9',
      ocrConfidence: '0.8',
      fuzzyMatchConfidence: '0.7',
      pageNumbers: [],
    }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.bistrackConfidence, undefined)
    assert.equal(result.ocrConfidence, undefined)
    assert.equal(result.fuzzyMatchConfidence, undefined)
  })

  it('drops unknown keys (forward-compatible)', () => {
    const trail = { sourceFileName: 'scan.pdf', unknownFutureKey: 'value', pageNumbers: [] }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.unknownFutureKey, undefined)
  })

  it('strips banned phrases from source file name', () => {
    const trail = { sourceFileName: 'approved-scan.pdf', pageNumbers: [] }
    const result = normalizeSourceTrail(trail)
    assert.equal(result.sourceFileName, '')
  })

  it('filters empty strings out of array fields', () => {
    const trail = { pageNumbers: [1, '', null, 2], quoteNumbers: ['', 'Q-1'] }
    const result = normalizeSourceTrail(trail)
    assert.deepEqual(result.pageNumbers, ['1', '2'])
    assert.deepEqual(result.quoteNumbers, ['Q-1'])
  })
})
