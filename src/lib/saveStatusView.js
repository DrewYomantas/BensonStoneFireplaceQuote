// Pure logic for the SaveStatus component. Maps a saveState snapshot to a
// calm label + className per V1.1 storage-states pattern.

import { humanLabel } from './salesOsSaveState.js'

export const SAVE_STATUS_VIEW_CLASSES = Object.freeze({
  saved: 'save-status is-saved',
  saving: 'save-status is-saving',
  error: 'save-status is-error',
  unavailable: 'save-status is-unavailable',
  backup: 'save-status is-backup',
  idle: 'save-status',
})

const DAY_MS = 24 * 60 * 60 * 1000
export const BACKUP_RECOMMENDED_AFTER_DAYS = 5

export function shouldRecommendBackup(snapshot, now = new Date()) {
  if (!snapshot || !snapshot.lastBackupAt) return false
  const ts = new Date(snapshot.lastBackupAt).getTime()
  if (Number.isNaN(ts)) return false
  return now.getTime() - ts > BACKUP_RECOMMENDED_AFTER_DAYS * DAY_MS
}

export function describeSaveStatus(snapshot, now = new Date()) {
  const safe = snapshot || { state: 'idle', storageAvailable: true }
  if (safe.storageAvailable === false) {
    return {
      key: 'unavailable',
      label: humanLabel(safe),
      className: SAVE_STATUS_VIEW_CLASSES.unavailable,
    }
  }
  if (safe.state === 'error') {
    return { key: 'error', label: humanLabel(safe), className: SAVE_STATUS_VIEW_CLASSES.error }
  }
  if (safe.state === 'saving') {
    return { key: 'saving', label: humanLabel(safe), className: SAVE_STATUS_VIEW_CLASSES.saving }
  }
  if (safe.state === 'saved') {
    if (shouldRecommendBackup(safe, now)) {
      return {
        key: 'backup',
        label: 'Backup recommended',
        className: SAVE_STATUS_VIEW_CLASSES.backup,
      }
    }
    return { key: 'saved', label: humanLabel(safe), className: SAVE_STATUS_VIEW_CLASSES.saved }
  }
  return { key: 'idle', label: humanLabel(safe), className: SAVE_STATUS_VIEW_CLASSES.idle }
}
