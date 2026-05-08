// One-shot migration of legacy localStorage Sales OS data into the
// IndexedDB-backed Sales OS storage. Old localStorage keys are NOT deleted —
// the legacy modules continue to read from them until callers are cut over.

import { STORE_NAMES } from './salesOsStorageSchema.js'

export const LEGACY_KEYS = Object.freeze({
  customerFiles: 'benson-stone-customer-file-v1',
  opportunityQueue: 'benson-stone-opportunity-queue-v1',
  opportunityActivities: 'benson-stone-opportunity-activities-v1',
  // Backstage / reference data — not migrated in this pass.
  binderPageIndex: 'benson-smart-binder-page-index-v1',
  showroomDisplay: 'benson-stone-showroom-display-register-v1',
})

export const MIGRATION_META_KEY = 'salesOsMigration:v1'

function readJsonArray(storage, key) {
  if (!storage) return []
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isRecoveryOpportunity(opp = {}) {
  if (opp.recoverySource === 'true') return true
  const source = String(opp.sourceType || '').toLowerCase()
  if (!source) return false
  if (source === 'quote-polish') return false
  return /recovery|bulk|scan|ocr|pdf|image|manual/.test(source)
}

export async function migrateLegacyLocalStorage(storage, {
  localStorageRef = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null),
  now = new Date(),
} = {}) {
  if (!storage) throw new Error('migrateLegacyLocalStorage: storage required')

  const meta = await storage.getMeta(MIGRATION_META_KEY)
  if (meta.ok && meta.data && meta.data.completed) {
    return { ok: true, skipped: true, reason: 'already-migrated', summary: meta.data.summary || {} }
  }

  if (!localStorageRef) {
    return { ok: false, errors: ['localStorage unavailable for migration'] }
  }

  const customerFiles = readJsonArray(localStorageRef, LEGACY_KEYS.customerFiles)
  const opportunities = readJsonArray(localStorageRef, LEGACY_KEYS.opportunityQueue)
  const activities = readJsonArray(localStorageRef, LEGACY_KEYS.opportunityActivities)

  const summary = {
    customerFiles: 0,
    quotePrepRecords: 0,
    recoveryQueue: 0,
    activityTimeline: 0,
    skipped: {
      binderPageIndex: readJsonArray(localStorageRef, LEGACY_KEYS.binderPageIndex).length,
      showroomDisplay: readJsonArray(localStorageRef, LEGACY_KEYS.showroomDisplay).length,
    },
  }

  for (const file of customerFiles) {
    if (!file || !file.id) continue
    const result = await storage.putRecord(STORE_NAMES.customerFiles, { ...file })
    if (!result.ok) return { ok: false, errors: [result.error.message] }
    summary.customerFiles++
  }

  for (const opp of opportunities) {
    if (!opp || !opp.id) continue
    const target = isRecoveryOpportunity(opp) ? STORE_NAMES.recoveryQueue : STORE_NAMES.quotePrepRecords
    const result = await storage.putRecord(target, { ...opp })
    if (!result.ok) return { ok: false, errors: [result.error.message] }
    if (target === STORE_NAMES.quotePrepRecords) summary.quotePrepRecords++
    else summary.recoveryQueue++
  }

  for (const activity of activities) {
    if (!activity || !activity.id) continue
    const result = await storage.putRecord(STORE_NAMES.activityTimeline, { ...activity })
    if (!result.ok) return { ok: false, errors: [result.error.message] }
    summary.activityTimeline++
  }

  const stamp = new Date(now).toISOString()
  await storage.setMeta(MIGRATION_META_KEY, { completed: true, completedAt: stamp, summary })

  return { ok: true, skipped: false, summary, completedAt: stamp }
}
