// Browser-only canvas helpers for OCR preprocessing. No external dependencies.

export function grayscaleCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function boostContrastCanvas(canvas, amount = 40) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const factor = (259 * (amount + 255)) / (255 * (259 - amount))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128))
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128))
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128))
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function thresholdCanvas(canvas, threshold = 180) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] >= threshold ? 255 : 0
    data[i] = val
    data[i + 1] = val
    data[i + 2] = val
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function addWhiteBorder(canvas, pixels = 10) {
  const out = document.createElement('canvas')
  out.width = canvas.width + pixels * 2
  out.height = canvas.height + pixels * 2
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, pixels, pixels)
  return out
}

export function cropCanvasByPercent(canvas, zone) {
  const x = Math.floor(zone.left * canvas.width)
  const y = Math.floor(zone.top * canvas.height)
  const w = Math.floor((zone.right - zone.left) * canvas.width)
  const h = Math.floor((zone.bottom - zone.top) * canvas.height)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h)
  return out
}

// Grayscale + contrast boost + optional threshold. Returns a new canvas with white border.
export function preprocessCanvasForOcr(canvas, options = {}) {
  const { contrast = 40, threshold = null, border = 10 } = options
  grayscaleCanvas(canvas)
  if (contrast) boostContrastCanvas(canvas, contrast)
  if (threshold !== null) thresholdCanvas(canvas, threshold)
  return border ? addWhiteBorder(canvas, border) : canvas
}
