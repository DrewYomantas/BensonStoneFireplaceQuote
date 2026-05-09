import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

function joinTextItems(items) {
  if (!items.length) return ''
  const lines = []
  let currentY = null
  let currentLine = []
  const yTolerance = 3

  for (const item of items) {
    const transform = item.transform || []
    const y = transform[5] ?? 0
    if (currentY === null || Math.abs(y - currentY) <= yTolerance) {
      currentLine.push({ x: transform[4] ?? 0, str: item.str })
      currentY = currentY ?? y
    } else {
      currentLine.sort((a, b) => a.x - b.x)
      lines.push({ y: currentY, text: currentLine.map((p) => p.str).join(' ') })
      currentLine = [{ x: transform[4] ?? 0, str: item.str }]
      currentY = y
    }
  }
  if (currentLine.length) {
    currentLine.sort((a, b) => a.x - b.x)
    lines.push({ y: currentY, text: currentLine.map((p) => p.str).join(' ') })
  }
  lines.sort((a, b) => b.y - a.y)
  return lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

async function loadPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  return pdfjs.getDocument({ data: arrayBuffer }).promise
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException('OCR canceled', 'AbortError')
  }
}

export async function extractTextFromPdf(file) {
  const pdf = await loadPdf(file)
  const pages = []
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    pages.push(joinTextItems(content.items))
  }
  const rawText = pages.join('\n\n')
  const embeddedTextLikelyMissing = rawText.replace(/\s+/g, '').length < 50 * pdf.numPages
  return { pages, rawText, embeddedTextLikelyMissing, pageCount: pdf.numPages }
}

export async function renderPdfPagesToImages(file, options = {}) {
  const { scale = 2.25, maxPages = Infinity, imageType = 'image/png', onProgress, signal } = options
  throwIfAborted(signal)
  const pdf = await loadPdf(file)
  const pageLimit = Math.min(pdf.numPages, maxPages)
  const images = []

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    throwIfAborted(signal)
    onProgress?.({ stage: 'rendering', pageNumber, pageCount: pageLimit })
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvasContext: context, viewport }).promise
    throwIfAborted(signal)
    images.push({
      pageNumber,
      pageCount: pageLimit,
      dataUrl: canvas.toDataURL(imageType),
      width: canvas.width,
      height: canvas.height,
    })
  }

  return images
}

export async function extractOcrFromPdf(file, options = {}) {
  const { maxPages = Infinity, onProgress, signal } = options
  throwIfAborted(signal)
  const images = await renderPdfPagesToImages(file, { maxPages, onProgress, signal })
  throwIfAborted(signal)
  onProgress?.({ stage: 'loading-engine' })
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  const pages = []

  try {
    for (const image of images) {
      throwIfAborted(signal)
      onProgress?.({ stage: 'ocr', pageNumber: image.pageNumber, pageCount: image.pageCount })
      const result = await worker.recognize(image.dataUrl)
      throwIfAborted(signal)
      pages.push({
        pageNumber: image.pageNumber,
        text: result.data?.text || '',
        confidence: Math.round(result.data?.confidence || 0),
        imageDataUrl: image.dataUrl,
      })
    }
  } finally {
    await worker.terminate()
  }

  return {
    pages,
    rawText: pages.map((page) => page.text).join('\n\n'),
    pageCount: pages.length,
    extractionSource: 'ocr',
  }
}

// Portrait BisTrack quote zones as fractions of page dimensions.
const BISTRACK_PORTRAIT_ZONES = {
  metadata: { left: 0.60, top: 0.05, right: 0.98, bottom: 0.26 },
  invoiceAddress: { left: 0.04, top: 0.13, right: 0.34, bottom: 0.29 },
  deliveryAddress: { left: 0.34, top: 0.13, right: 0.62, bottom: 0.29 },
  table: { left: 0.02, top: 0.34, right: 0.98, bottom: 0.79 },
  totals: { left: 0.67, top: 0.79, right: 0.98, bottom: 0.96 },
}

// Renders the first page at 2.75× with canvas preprocessing, OCRs five fixed
// zones separately, and also OCRs the full page as fallback. Returns zone texts
// as structured objects so callers can route each zone to the right parser.
export async function extractOcrFromPdfForBisTrackScan(file, options = {}) {
  const { onProgress, signal } = options
  throwIfAborted(signal)

  const SCALE = 2.75
  const pdf = await loadPdf(file)
  throwIfAborted(signal)
  onProgress?.({ stage: 'rendering', pageNumber: 1, pageCount: pdf.numPages })

  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: SCALE })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  throwIfAborted(signal)

  const { addWhiteBorder, boostContrastCanvas, cropCanvasByPercent, grayscaleCanvas } = await import('./ocrImagePreprocess.js')

  // Preprocess the full canvas in-place; zone crops inherit the preprocessing.
  grayscaleCanvas(canvas)
  boostContrastCanvas(canvas, 40)
  const fullWithBorder = addWhiteBorder(canvas, 10)
  const fullDataUrl = fullWithBorder.toDataURL('image/png')

  // Crop each zone from the preprocessed canvas.
  const zoneDataUrls = {}
  for (const [name, zone] of Object.entries(BISTRACK_PORTRAIT_ZONES)) {
    const crop = cropCanvasByPercent(canvas, zone)
    zoneDataUrls[name] = addWhiteBorder(crop, 8).toDataURL('image/png')
  }

  onProgress?.({ stage: 'ocr', pageNumber: 1, pageCount: 1 })
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  const zones = {}
  const zoneText = {}

  // Per-zone Tesseract hints. Whitelist on totals helps the dollar column.
  // Address/metadata zones use sparse-text PSM (11) when supported. We swallow
  // any setParameters errors so an older tesseract.js still works.
  const ZONE_TESSERACT_PARAMS = {
    metadata: { preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' },
    invoiceAddress: { preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' },
    deliveryAddress: { preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' },
    table: { preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' },
    totals: {
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '$0123456789,.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /:',
    },
  }

  async function safeSetParams(params) {
    try {
      await worker.setParameters(params)
    } catch {
      // Older tesseract.js builds may not accept some keys. Try them one at a time.
      for (const [k, v] of Object.entries(params)) {
        try { await worker.setParameters({ [k]: v }) } catch { /* ignore */ }
      }
    }
  }

  try {
    // OCR each zone with its own parameter set.
    for (const [name, dataUrl] of Object.entries(zoneDataUrls)) {
      throwIfAborted(signal)
      try {
        await safeSetParams(ZONE_TESSERACT_PARAMS[name] || { preserve_interword_spaces: '1' })
        const result = await worker.recognize(dataUrl)
        const text = result.data?.text || ''
        const confidence = Math.round(result.data?.confidence || 0)
        zones[name] = { text, confidence }
        zoneText[name] = text
      } catch {
        zones[name] = { text: '', confidence: 0 }
        zoneText[name] = ''
      }
    }

    // Full-page OCR as fallback / cross-check. Reset whitelist first so the
    // full-page pass can read every character.
    throwIfAborted(signal)
    await safeSetParams({ preserve_interword_spaces: '1', tessedit_char_whitelist: '' })
    const fullResult = await worker.recognize(fullDataUrl)
    const fullText = fullResult.data?.text || ''
    const fullConfidence = Math.round(fullResult.data?.confidence || 0)
    zones.fullPage = { text: fullText, confidence: fullConfidence }
    zoneText.full = fullText

    // Build combined text with section headers for parsers that accept raw text.
    const combined = [
      zones.metadata?.text ? `--- METADATA ZONE ---\n${zones.metadata.text}` : '',
      zones.invoiceAddress?.text ? `--- INVOICE ADDRESS ZONE ---\n${zones.invoiceAddress.text}` : '',
      zones.deliveryAddress?.text ? `--- DELIVERY ADDRESS ZONE ---\n${zones.deliveryAddress.text}` : '',
      zones.table?.text ? `--- TABLE ZONE ---\n${zones.table.text}` : '',
      zones.totals?.text ? `--- TOTALS ZONE ---\n${zones.totals.text}` : '',
      fullText ? `--- FULL PAGE FALLBACK ---\n${fullText}` : '',
    ].filter(Boolean).join('\n\n')

    return {
      pages: [{ pageNumber: 1, text: combined, confidence: fullConfidence, imageDataUrl: fullDataUrl }],
      rawText: combined,
      fullPageText: fullText,
      fullPageConfidence: fullConfidence,
      pageCount: 1,
      extractionSource: 'bistrack-zone-ocr',
      zones,
      zoneText,
    }
  } finally {
    await worker.terminate()
  }
}

export async function extractOcrFromImage(file, options = {}) {
  const { onProgress, signal } = options
  throwIfAborted(signal)
  onProgress?.({ stage: 'ocr', pageNumber: 1, pageCount: 1 })
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  const objectUrl = URL.createObjectURL(file)

  try {
    throwIfAborted(signal)
    const result = await worker.recognize(objectUrl)
    throwIfAborted(signal)
    const confidence = Math.round(result.data?.confidence || 0)
    const rawText = result.data?.text || ''
    return {
      pages: [{ pageNumber: 1, text: rawText, confidence }],
      rawText,
      pageCount: 1,
      confidence,
      extractionSource: 'ocr',
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
    await worker.terminate()
  }
}
