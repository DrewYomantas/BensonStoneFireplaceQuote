// Bulk intake file queue — pure helpers for the multi-file queue model.
// Nothing here touches storage, File objects, or the DOM.
// The queue lives in BulkIntakeScreen component state (session-only).
// Queue items never store File objects, raw bytes, OCR images, or file paths.

export const QUEUE_STATUS = Object.freeze({
  waiting: 'waiting',
  extracting: 'extracting',
  ocrRunning: 'ocr-running',
  needsCleanup: 'needs-cleanup',
  readyToParse: 'ready-to-parse',
  parsed: 'parsed',
  imported: 'imported',
  error: 'error',
})

export const QUEUE_STATUS_LABELS = Object.freeze({
  'waiting': 'Waiting',
  'extracting': 'Reading',
  'ocr-running': 'Scanning',
  'needs-cleanup': 'Needs cleanup',
  'ready-to-parse': 'Ready',
  'parsed': 'Reviewed',
  'imported': 'Imported',
  'error': 'Error',
})

export const QUEUE_STATUS_CLS = Object.freeze({
  'waiting': 'source source-manual',
  'extracting': 'source source-manual',
  'ocr-running': 'source source-manual',
  'needs-cleanup': 'source source-said',
  'ready-to-parse': 'source source-verified',
  'parsed': 'source source-verified',
  'imported': 'source source-verified',
  'error': 'source source-said',
})

function generateId() {
  return `qi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function fileExtFromName(fileName) {
  const s = String(fileName || '')
  const dot = s.lastIndexOf('.')
  return dot >= 0 ? s.slice(dot + 1).toLowerCase() : ''
}

// Create a new queue item. Never stores the File object — caller must hold it
// separately for the duration of extraction.
export function createQueueItem(fileName) {
  const ext = fileExtFromName(String(fileName || ''))
  return {
    id: generateId(),
    fileName: String(fileName || ''),
    fileType: ext || 'unknown',
    status: QUEUE_STATUS.waiting,
    progressLabel: '',
    extractedText: '',
    errorMessage: '',
    parsedRowCount: 0,
    importedCount: 0,
    phase: 'input',       // 'input' | 'review' | 'scan-draft' | 'result'
    draftRows: [],
    selectedIds: [],      // array of selected row _ids (converted to Set in screen)
    importResult: null,
    scanDraftFields: null,    // populated when phase === 'scan-draft'
    scanDraftWarnings: [],
    // Page-split mode (multi-page scanned PDFs):
    isMultiPage: false,       // true when OCR'd page-by-page
    pageItems: [],            // array of page item objects
    activePageId: null,       // which page is currently open in the detail panel
  }
}

// Returns a new queue array with the target item merged with `updates`.
// Does not mutate the input array or item.
export function updateQueueItem(queue, id, updates) {
  return queue.map((item) => item.id === id ? { ...item, ...updates } : item)
}

// Human-readable count label shown next to status badge in the queue row.
export function queueItemCountLabel(item) {
  if (!item) return ''
  if (item.importedCount > 0) return `${item.importedCount} imported`
  if (item.parsedRowCount > 0) return `${item.parsedRowCount} row${item.parsedRowCount === 1 ? '' : 's'}`
  return ''
}

// True when the queue has any items that are not yet in a terminal state.
export function hasUnfinishedItems(queue) {
  if (!Array.isArray(queue)) return false
  return queue.some(
    (item) => item.status !== QUEUE_STATUS.imported && item.status !== QUEUE_STATUS.error,
  )
}
