// Pure money parsing for OCR'd or messy currency strings.
// Originally distilled from CreativeEstimateStudio's moneyNormalizer; renamed
// and lightly extended here so BSFQ scanned-quote totals can recover values
// like "$7.542.00" (European-separator OCR artifact) without inventing money.

const MONEY_CANDIDATE_RE = /\$\s*[\d,.]+|\b\d{1,3}(?:[,.]\d{3})+(?:\.\d{2})?\b|\b\d+\.\d{2}\b/g

function sanitizeCandidate(value) {
  return String(value ?? '').replace(/[^0-9,.]/g, '').trim()
}

function parseSanitized(cleaned) {
  if (!cleaned) return null
  const separators = cleaned.replace(/[0-9]/g, '')
  if (!separators) {
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  const lastSep = Math.max(lastDot, lastComma)
  if (lastSep >= 0) {
    const decimalPart = cleaned.slice(lastSep + 1)
    if (decimalPart.length === 2) {
      const integerPart = cleaned.slice(0, lastSep).replace(/[.,]/g, '')
      const normalized = `${integerPart || '0'}.${decimalPart}`
      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? parsed : null
    }
  }
  if (cleaned.includes('.') || cleaned.includes(',')) {
    const collapsed = cleaned.replace(/[.,]/g, '')
    const parsed = Number(collapsed)
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function extractMoneyCandidates(text) {
  return [...String(text ?? '').matchAll(MONEY_CANDIDATE_RE)].map((match) => match[0])
}

export function normalizeMoneyCandidate(candidate) {
  return parseSanitized(sanitizeCandidate(candidate))
}

export function normalizeMoneyValue(text) {
  const candidates = extractMoneyCandidates(text)
  if (candidates.length === 0) return null
  return normalizeMoneyCandidate(candidates[candidates.length - 1])
}

function isWellFormedMoney(candidate) {
  return /^\$?\s*\d{1,3}(,\d{3})*\.\d{2}$/.test(String(candidate || '').trim())
}

export function normalizeMoneyDetailed(text) {
  const original = String(text ?? '')
  const candidates = extractMoneyCandidates(original)
  if (candidates.length === 0) {
    return { value: null, candidate: null, original, didChange: false }
  }
  const candidate = candidates[candidates.length - 1]
  const value = normalizeMoneyCandidate(candidate)
  const didChange = value !== null && !isWellFormedMoney(candidate)
  return { value, candidate, original, didChange }
}

export function formatMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  return `$${Number(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}
