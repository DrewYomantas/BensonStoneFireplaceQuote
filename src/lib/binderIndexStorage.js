import { summarizePageIndex } from './binderPageIndex.js'
const STORAGE_KEY = 'benson-smart-binder-page-index-v1'
function getStorage(storage = globalThis.localStorage) { return storage || null }
function sanitizePageRecord(record = {}) {
  return {
    id: String(record.id || ''), documentId: String(record.documentId || ''), title: String(record.title || ''), vendor: String(record.vendor || ''), folder: String(record.folder || ''), category: String(record.category || ''), docType: String(record.docType || ''), docTypeLabel: String(record.docTypeLabel || ''), models: String(record.models || ''), pdfFileName: String(record.pdfFileName || ''), pdfUrl: String(record.pdfUrl || ''), sourcePage: String(record.sourcePage || ''), localPath: String(record.localPath || ''), customerSafe: String(record.customerSafe || ''), customerSafeLabel: String(record.customerSafeLabel || ''), pageNumber: Number(record.pageNumber) || 1, text: String(record.text || ''), displayText: String(record.displayText || ''), modelCodes: Array.isArray(record.modelCodes) ? record.modelCodes.map(String) : [], extractionSource: String(record.extractionSource || ''), indexedAt: String(record.indexedAt || ''),
  }
}
export function loadBinderPageIndex(storage) {
  const ref = getStorage(storage)
  if (!ref) return []
  try { const parsed = JSON.parse(ref.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed.map(sanitizePageRecord).filter((record) => record.id && record.text) : [] } catch { return [] }
}
export function saveBinderPageIndex(records = [], storage) {
  const ref = getStorage(storage)
  const clean = records.map(sanitizePageRecord).filter((record) => record.id && record.text)
  if (!ref) return clean
  ref.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}
export function mergeBinderPageIndex(existing = [], incoming = [], storage) {
  const map = new Map()
  for (const record of existing.map(sanitizePageRecord)) map.set(record.id, record)
  for (const record of incoming.map(sanitizePageRecord)) map.set(record.id, record)
  return saveBinderPageIndex([...map.values()], storage)
}
export function clearBinderPageIndex(storage) { const ref = getStorage(storage); if (ref) ref.removeItem(STORAGE_KEY); return [] }
export function getBinderIndexSummary(storage) { return summarizePageIndex(loadBinderPageIndex(storage)) }
