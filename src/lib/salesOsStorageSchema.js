// Sales OS storage schema — versioned constants, store names, scrubs.
// Keep in lock-step with src/lib/salesOsStorage.js and src/lib/salesOsBackup.js.

export const APP_NAME = 'benson-fireplace-sales-os'
export const DB_NAME = 'benson-fireplace-sales-os'
export const SCHEMA_VERSION = 3
export const BACKUP_VERSION = 1

export const STORE_NAMES = Object.freeze({
  customerFiles: 'customerFiles',
  visitSessions: 'visitSessions',
  quotePrepRecords: 'quotePrepRecords',
  followUpRecords: 'followUpRecords',
  activityTimeline: 'activityTimeline',
  recoveryQueue: 'recoveryQueue',
  appMeta: 'appMeta',
  reps: 'reps',
  hearthStudioSessions: 'hearthStudioSessions',
})

export const STORE_LIST = Object.freeze(Object.values(STORE_NAMES))
export const RECORD_STORES = Object.freeze(STORE_LIST.filter((name) => name !== STORE_NAMES.appMeta))

export function keyPathFor(store) {
  return store === STORE_NAMES.appMeta ? 'key' : 'id'
}

// Sensitive shapes never written into Sales OS records or backups.
// Mirrors the spirit of the activity timeline scrubber but applied to KEY names,
// because the storage layer is generic and cannot inspect free-text values cheaply.
export const SENSITIVE_KEY_PATTERN =
  /(^|[^a-z])(average\s*cost|buy\s*price|cost|margin(\s*percent)?|inventory\s*turn|supplier\s*total|supplier\s*history|sales\s*rank|product\s*rank|sales\s*performance|raw\s*ocr|raw\s*pdf|private\s*catalog|bistrack\s*confidence|fuzzy\s*match\s*confidence|ocr\s*confidence)([^a-z]|$)/i

export function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERN.test(String(key || '').replace(/[_-]+/g, ' '))
}

export function scrubSensitiveKeys(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const out = {}
  for (const [k, v] of Object.entries(record)) {
    if (isSensitiveKey(k)) continue
    out[k] = v
  }
  return out
}

export function stampRecord(record = {}, now = new Date()) {
  const ts = new Date(now).toISOString()
  return {
    ...record,
    createdAt: record.createdAt || ts,
    updatedAt: ts,
    schemaVersion: record.schemaVersion || SCHEMA_VERSION,
  }
}
