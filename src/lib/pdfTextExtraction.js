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

export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
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
