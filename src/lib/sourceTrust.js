// Pure logic for SourceTrustBadge. Component-free so tests run under node --test.

export const SOURCE_KINDS = Object.freeze([
  'verified',
  'said',
  'assumed',
  'bistrack',
  'ocr',
  'manual',
])

const LABELS = Object.freeze({
  verified: 'VERIFIED',
  said: 'SAID',
  assumed: 'ASSUMED',
  bistrack: 'BISTRACK',
  ocr: 'OCR',
  manual: 'MANUAL',
})

export function normalizeSourceKind(kind) {
  const v = String(kind || '').toLowerCase()
  return SOURCE_KINDS.includes(v) ? v : 'manual'
}

export function sourceLabel(kind, override) {
  if (override) return String(override)
  return LABELS[normalizeSourceKind(kind)]
}

export function sourceClassName(kind) {
  return `source source-${normalizeSourceKind(kind)}`
}
