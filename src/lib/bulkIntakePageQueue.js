// Page-level queue model for multi-page scanned PDF packets (Milestone 19.6).
// Pure helpers — no storage, no DOM, no File objects, no image bytes.
// Page items live inside the parent queue item (item.pageItems).

export const PAGE_STATUS = Object.freeze({
  waiting: 'waiting',
  ocrRunning: 'ocr-running',
  needsCleanup: 'needs-cleanup',
  readyToReview: 'ready-to-review',
  draftBuilt: 'draft-built',
  imported: 'imported',
  referenceOnly: 'reference-only',
  error: 'error',
})

export const PAGE_STATUS_LABELS = Object.freeze({
  'waiting': 'Waiting',
  'ocr-running': 'Scanning',
  'needs-cleanup': 'Needs cleanup',
  'ready-to-review': 'Ready',
  'draft-built': 'Draft built',
  'imported': 'Imported',
  'reference-only': 'Reference only',
  'error': 'Error',
})

export const PAGE_STATUS_CLS = Object.freeze({
  'waiting': 'source source-manual',
  'ocr-running': 'source source-manual',
  'needs-cleanup': 'source source-said',
  'ready-to-review': 'source source-verified',
  'draft-built': 'source source-verified',
  'imported': 'source source-verified',
  'reference-only': 'source source-manual',
  'error': 'source source-said',
})

function generatePageId() {
  return `pi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function createPageItem(pageNumber, pageCount, parentFileId) {
  return {
    id: generatePageId(),
    parentFileId: String(parentFileId || ''),
    pageNumber,
    pageCount,
    pageLabel: `Page ${pageNumber}`,
    status: PAGE_STATUS.waiting,
    extractedText: '',
    progressLabel: '',
    detectedDocType: 'unknown',
    draftSummary: null,
    importedCount: 0,
    importedFileId: '',
    errorMessage: '',
    scanDraftFields: null,
    scanDraftWarnings: [],
  }
}

export function updatePageItem(pages, id, updates) {
  return pages.map((p) => (p.id === id ? { ...p, ...updates } : p))
}

export function pageItemCountLabel(page) {
  if (!page) return ''
  if (page.importedCount > 0) return 'imported'
  if (page.status === PAGE_STATUS.draftBuilt) return 'draft built'
  if (page.status === PAGE_STATUS.referenceOnly) return 'reference only'
  return ''
}

// Suggest adjacent pages that may belong to the same packet (same quote number
// or same customer name). Returns an array of { pageIds, reason, label }.
// Never auto-merges — caller shows these as soft warnings only.
export function detectPageGroupSuggestions(pages) {
  if (!Array.isArray(pages) || pages.length < 2) return []
  const suggestions = []

  for (let i = 0; i < pages.length - 1; i++) {
    const a = pages[i]
    const b = pages[i + 1]
    if (!a.scanDraftFields && !b.scanDraftFields) continue

    const aNum = String((a.scanDraftFields || {}).quoteNumber || '').trim().toLowerCase()
    const bNum = String((b.scanDraftFields || {}).quoteNumber || '').trim().toLowerCase()
    if (aNum && bNum && aNum === bNum) {
      suggestions.push({
        pageIds: [a.id, b.id],
        pageNumbers: [a.pageNumber, b.pageNumber],
        reason: 'same_quote',
        label: `Possible same packet — pages ${a.pageNumber} and ${b.pageNumber} share quote #${a.scanDraftFields.quoteNumber}`,
      })
      continue
    }

    const aName = String((a.scanDraftFields || {}).customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const bName = String((b.scanDraftFields || {}).customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (aName && bName && aName === bName) {
      suggestions.push({
        pageIds: [a.id, b.id],
        pageNumbers: [a.pageNumber, b.pageNumber],
        reason: 'same_customer',
        label: `Possible same packet — pages ${a.pageNumber} and ${b.pageNumber} share customer name`,
      })
    }
  }

  return suggestions
}
