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
