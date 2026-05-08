// Process-wide Sales OS storage singleton.
// Lifted out of SalesOsStorageStatus.jsx so the new shell, screens, and
// the legacy floating widget can all consume the same storage + saveState.

import { createIndexedDbEngine, createSalesOsStorage } from './salesOsStorage.js'
import { createSaveState } from './salesOsSaveState.js'
import { migrateLegacyLocalStorage } from './salesOsMigration.js'
import { setCustomerFileDurableMirror } from './customerFile.js'

const saveState = createSaveState()
const storage = createSalesOsStorage({ engine: createIndexedDbEngine() })
let initPromise = null

export function getSalesOsStorage() {
  return storage
}

export function getSalesOsSaveState() {
  return saveState
}

export function ensureSalesOsBoot() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    saveState.markSaving()
    const opened = await storage.open()
    if (!opened.ok) {
      saveState.setAvailability(false, opened.error.message)
      return { ok: false, error: opened.error.message }
    }
    setCustomerFileDurableMirror(storage)
    saveState.markSaved()
    const migration = await migrateLegacyLocalStorage(storage)
    if (!migration.ok) {
      const message = (migration.errors || []).join('; ') || 'Migration failed'
      saveState.markError(message)
      return { ok: false, error: message }
    }
    if (!migration.skipped) saveState.markSaved()
    return { ok: true }
  })()
  return initPromise
}
