export const OCR_PAGE_LIMIT = 8

// True when OCR produced too little text to be useful — likely a bad scan or
// a PDF with no recognizable characters after rendering.
export function isOcrTextWeak(rawText) {
  return rawText.replace(/\s+/g, '').length < 80
}

// Returns a warning string when a PDF exceeds OCR_PAGE_LIMIT, null otherwise.
export function ocrPageWarning(pageCount) {
  if (pageCount > OCR_PAGE_LIMIT) {
    return `Large packet detected — ${pageCount} pages. Scanning the first ${OCR_PAGE_LIMIT}. This may take a few minutes. You can keep this screen open while pages scan.`
  }
  return null
}

// Human-readable status label for an in-progress OCR tick.
export function ocrProgressLabel(progress) {
  if (!progress) return 'Extracting text…'
  if (progress.stage === 'loading-engine') return 'Loading OCR engine — first run may take a moment…'
  if (progress.stage === 'rendering') {
    return `Preparing page ${progress.pageNumber} of ${progress.pageCount}…`
  }
  if (progress.pageNumber > 0) {
    return `Scanning page ${progress.pageNumber} of ${progress.pageCount}…`
  }
  return 'Preparing OCR…'
}
