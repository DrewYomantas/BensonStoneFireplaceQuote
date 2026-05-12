// Sales OS backup / export / restore.
// JSON-based, schema-versioned. Drops sensitive keys before writing the payload.

import {
  APP_NAME,
  BACKUP_VERSION,
  SCHEMA_VERSION,
  STORE_LIST,
  STORE_NAMES,
  isSensitiveKey,
  scrubSensitiveKeys,
} from './salesOsStorageSchema.js'
import { scrubSessionRecord } from './hearthStudioSessionStorage.js'

// Oldest schema version whose backups we still accept (v2 = first backup-capable release).
const MIN_BACKUP_SCHEMA_VERSION = 2

function scrubStoreRow(store, row) {
  const base = scrubSensitiveKeys(row)
  if (store === STORE_NAMES.hearthStudioSessions) return scrubSessionRecord(base)
  return base
}

export async function exportSalesOsBackup(storage, { now = new Date() } = {}) {
  if (!storage) throw new Error('exportSalesOsBackup: storage required')
  const stores = {}
  for (const store of STORE_LIST) {
    const result = await storage.getAll(store)
    if (!result.ok) {
      throw new Error(`Failed to read ${store}: ${result.error.message}`)
    }
    stores[store] = (result.data || []).map((row) => scrubStoreRow(store, row))
  }
  return {
    appName: APP_NAME,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    stores,
  }
}

export function validateSalesOsBackup(payload) {
  const errors = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Backup payload must be an object'] }
  }
  if (payload.appName !== APP_NAME) errors.push(`Unexpected appName: ${payload.appName}`)
  if (payload.backupVersion !== BACKUP_VERSION) errors.push(`Unsupported backupVersion: ${payload.backupVersion}`)
  const sv = payload.schemaVersion
  if (!Number.isInteger(sv) || sv < MIN_BACKUP_SCHEMA_VERSION || sv > SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion: ${sv}`)
  }
  if (typeof payload.exportedAt !== 'string' || !payload.exportedAt) errors.push('Missing exportedAt')
  if (!payload.stores || typeof payload.stores !== 'object' || Array.isArray(payload.stores)) {
    errors.push('Missing stores object')
    return { valid: false, errors }
  }
  for (const [store, rows] of Object.entries(payload.stores)) {
    if (!STORE_LIST.includes(store)) { errors.push(`Unknown store: ${store}`); continue }
    if (!Array.isArray(rows)) { errors.push(`Store ${store} must be an array`); continue }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        errors.push(`Store ${store} contains a non-object row`)
        break
      }
      const sensitive = Object.keys(row).find(isSensitiveKey)
      if (sensitive) {
        errors.push(`Store ${store} row contains sensitive field: ${sensitive}`)
        break
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export async function importSalesOsBackup(storage, payload, { mode = 'replace' } = {}) {
  if (!storage) throw new Error('importSalesOsBackup: storage required')
  if (mode !== 'replace' && mode !== 'merge') {
    return { ok: false, errors: [`Unsupported mode: ${mode}`] }
  }
  const validation = validateSalesOsBackup(payload)
  if (!validation.valid) return { ok: false, errors: validation.errors }

  const summary = {}
  for (const store of STORE_LIST) {
    const rows = (payload.stores[store] || []).map((row) => scrubStoreRow(store, row))
    if (mode === 'replace') {
      const cleared = await storage.clearStore(store)
      if (!cleared.ok) return { ok: false, errors: [cleared.error.message] }
    }
    let imported = 0
    for (const row of rows) {
      const result = store === STORE_NAMES.appMeta
        ? await storage.setMeta(row.key, row.value)
        : await storage.putRecord(store, row)
      if (!result.ok) return { ok: false, errors: [result.error.message] }
      imported++
    }
    summary[store] = imported
  }

  return {
    ok: true,
    mode,
    summary,
    importedAt: new Date().toISOString(),
  }
}

export function summarizeBackup(payload) {
  const validation = validateSalesOsBackup(payload)
  const counts = {}
  if (payload && payload.stores && typeof payload.stores === 'object') {
    for (const [store, rows] of Object.entries(payload.stores)) {
      counts[store] = Array.isArray(rows) ? rows.length : 0
    }
  }
  return {
    valid: validation.valid,
    errors: validation.errors,
    exportedAt: payload && typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    schemaVersion: payload && Number.isInteger(payload.schemaVersion) ? payload.schemaVersion : null,
    backupVersion: payload && Number.isInteger(payload.backupVersion) ? payload.backupVersion : null,
    counts,
  }
}
