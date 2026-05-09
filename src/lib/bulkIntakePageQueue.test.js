import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAGE_STATUS,
  PAGE_STATUS_LABELS,
  PAGE_STATUS_CLS,
  createPageItem,
  updatePageItem,
  pageItemCountLabel,
  detectPageGroupSuggestions,
} from './bulkIntakePageQueue.js'

describe('PAGE_STATUS', () => {
  it('exports all expected statuses', () => {
    const expected = ['waiting', 'ocr-running', 'needs-cleanup', 'ready-to-review', 'draft-built', 'imported', 'reference-only', 'error']
    for (const s of expected) assert.ok(Object.values(PAGE_STATUS).includes(s))
  })
  it('PAGE_STATUS_LABELS has a label for every status', () => {
    for (const s of Object.values(PAGE_STATUS)) assert.ok(PAGE_STATUS_LABELS[s], `missing label for ${s}`)
  })
  it('PAGE_STATUS_CLS has a class for every status', () => {
    for (const s of Object.values(PAGE_STATUS)) assert.ok(PAGE_STATUS_CLS[s], `missing class for ${s}`)
  })
})

describe('createPageItem', () => {
  it('creates a page item with correct fields', () => {
    const p = createPageItem(3, 10, 'qi-parent')
    assert.equal(p.pageNumber, 3)
    assert.equal(p.pageCount, 10)
    assert.equal(p.parentFileId, 'qi-parent')
    assert.equal(p.pageLabel, 'Page 3')
    assert.equal(p.status, PAGE_STATUS.waiting)
    assert.equal(p.extractedText, '')
    assert.equal(p.detectedDocType, 'unknown')
    assert.equal(p.draftSummary, null)
    assert.equal(p.importedCount, 0)
    assert.equal(p.importedFileId, '')
    assert.equal(p.scanDraftFields, null)
    assert.deepEqual(p.scanDraftWarnings, [])
    assert.ok(p.id.startsWith('pi-'))
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, (_, i) => createPageItem(i + 1, 20, 'parent').id))
    assert.equal(ids.size, 20)
  })

  it('stringifies parentFileId', () => {
    const p = createPageItem(1, 1, 42)
    assert.equal(p.parentFileId, '42')
  })

  it('handles missing parentFileId', () => {
    const p = createPageItem(1, 1)
    assert.equal(p.parentFileId, '')
  })
})

describe('updatePageItem', () => {
  it('updates a matching page item', () => {
    const p = createPageItem(1, 5, 'parent')
    const pages = [p]
    const updated = updatePageItem(pages, p.id, { status: PAGE_STATUS.readyToReview, extractedText: 'hello' })
    assert.equal(updated[0].status, PAGE_STATUS.readyToReview)
    assert.equal(updated[0].extractedText, 'hello')
  })

  it('does not mutate the input array', () => {
    const p = createPageItem(1, 1, 'parent')
    const pages = [p]
    const updated = updatePageItem(pages, p.id, { status: PAGE_STATUS.imported })
    assert.equal(pages[0].status, PAGE_STATUS.waiting)
    assert.equal(updated[0].status, PAGE_STATUS.imported)
  })

  it('leaves non-matching items unchanged', () => {
    const a = createPageItem(1, 2, 'parent')
    const b = createPageItem(2, 2, 'parent')
    const pages = [a, b]
    const updated = updatePageItem(pages, a.id, { status: PAGE_STATUS.imported })
    assert.equal(updated[1].status, PAGE_STATUS.waiting)
  })

  it('handles unknown id gracefully', () => {
    const p = createPageItem(1, 1, 'parent')
    const updated = updatePageItem([p], 'not-a-real-id', { status: PAGE_STATUS.imported })
    assert.equal(updated[0].status, PAGE_STATUS.waiting)
  })
})

describe('pageItemCountLabel', () => {
  it('returns empty for null', () => assert.equal(pageItemCountLabel(null), ''))
  it('returns "imported" when importedCount > 0', () => {
    assert.equal(pageItemCountLabel({ importedCount: 1, status: PAGE_STATUS.imported }), 'imported')
  })
  it('returns "draft built" when status is draftBuilt', () => {
    assert.equal(pageItemCountLabel({ importedCount: 0, status: PAGE_STATUS.draftBuilt }), 'draft built')
  })
  it('returns "reference only" when status is referenceOnly', () => {
    assert.equal(pageItemCountLabel({ importedCount: 0, status: PAGE_STATUS.referenceOnly }), 'reference only')
  })
  it('returns empty for readyToReview', () => {
    assert.equal(pageItemCountLabel({ importedCount: 0, status: PAGE_STATUS.readyToReview }), '')
  })
})

describe('detectPageGroupSuggestions', () => {
  it('returns empty for empty array', () => {
    assert.deepEqual(detectPageGroupSuggestions([]), [])
  })
  it('returns empty for single page', () => {
    const p = createPageItem(1, 1, 'parent')
    assert.deepEqual(detectPageGroupSuggestions([p]), [])
  })
  it('detects same quote number on adjacent pages', () => {
    const a = { ...createPageItem(1, 3, 'parent'), draftSummary: { customerName: 'Alice', quoteNumber: 'Q-100' }, scanDraftFields: { quoteNumber: 'Q-100', customerName: 'Alice' } }
    const b = { ...createPageItem(2, 3, 'parent'), draftSummary: { customerName: 'Bob', quoteNumber: 'Q-100' }, scanDraftFields: { quoteNumber: 'Q-100', customerName: 'Bob' } }
    const suggestions = detectPageGroupSuggestions([a, b])
    assert.equal(suggestions.length, 1)
    assert.equal(suggestions[0].reason, 'same_quote')
    assert.ok(suggestions[0].label.includes('Q-100'))
  })
  it('detects same customer name on adjacent pages', () => {
    const a = { ...createPageItem(1, 2, 'parent'), draftSummary: { customerName: 'Jane Doe', quoteNumber: '' }, scanDraftFields: { quoteNumber: '', customerName: 'Jane Doe' } }
    const b = { ...createPageItem(2, 2, 'parent'), draftSummary: { customerName: 'Jane Doe', quoteNumber: '' }, scanDraftFields: { quoteNumber: '', customerName: 'Jane Doe' } }
    const suggestions = detectPageGroupSuggestions([a, b])
    assert.equal(suggestions.length, 1)
    assert.equal(suggestions[0].reason, 'same_customer')
  })
  it('does not suggest for non-adjacent matching pages', () => {
    const a = { ...createPageItem(1, 3, 'parent'), draftSummary: { customerName: 'Alice', quoteNumber: 'Q-1' }, scanDraftFields: { quoteNumber: 'Q-1', customerName: 'Alice' } }
    const b = { ...createPageItem(2, 3, 'parent'), draftSummary: { customerName: 'Bob', quoteNumber: 'Q-2' }, scanDraftFields: { quoteNumber: 'Q-2', customerName: 'Bob' } }
    const c = { ...createPageItem(3, 3, 'parent'), draftSummary: { customerName: 'Alice', quoteNumber: 'Q-1' }, scanDraftFields: { quoteNumber: 'Q-1', customerName: 'Alice' } }
    assert.equal(detectPageGroupSuggestions([a, b, c]).length, 0)
  })
  it('prefers same_quote over same_customer when both match', () => {
    const a = { ...createPageItem(1, 2, 'parent'), draftSummary: { customerName: 'Alice', quoteNumber: 'Q-5' }, scanDraftFields: { quoteNumber: 'Q-5', customerName: 'Alice' } }
    const b = { ...createPageItem(2, 2, 'parent'), draftSummary: { customerName: 'Alice', quoteNumber: 'Q-5' }, scanDraftFields: { quoteNumber: 'Q-5', customerName: 'Alice' } }
    const suggestions = detectPageGroupSuggestions([a, b])
    assert.equal(suggestions[0].reason, 'same_quote')
  })
})
