// Tiny observable state machine: idle → saving → saved | error.
// Consumed by the SalesOsStorageStatus component to render "Saved locally · 14:02" etc.
// Pure JS so it can be unit-tested without React.

export const SAVE_STATES = ['idle', 'saving', 'saved', 'error']

function pad(value) { return String(value).padStart(2, '0') }

function timeOfIso(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function humanLabel({ state, lastSavedAt, storageAvailable, errorMessage } = {}) {
  if (storageAvailable === false) {
    return errorMessage ? `Storage unavailable — ${errorMessage}` : 'Storage unavailable'
  }
  if (state === 'error') return errorMessage ? `Save failed — ${errorMessage}` : 'Save failed'
  if (state === 'saving') return 'Saving locally…'
  if (state === 'saved' && lastSavedAt) return `Saved locally · ${timeOfIso(lastSavedAt)}`
  if (state === 'saved') return 'Saved locally'
  return 'Idle'
}

export function createSaveState() {
  const internal = {
    state: 'idle',
    lastSavedAt: null,
    lastBackupAt: null,
    storageAvailable: true,
    errorMessage: '',
  }
  const listeners = new Set()

  function snapshot() {
    return {
      state: internal.state,
      lastSavedAt: internal.lastSavedAt,
      lastBackupAt: internal.lastBackupAt,
      storageAvailable: internal.storageAvailable,
      errorMessage: internal.errorMessage,
      label: humanLabel(internal),
    }
  }

  function emit() {
    const snap = snapshot()
    for (const listener of listeners) listener(snap)
  }

  return {
    snapshot,
    subscribe(fn) {
      listeners.add(fn)
      fn(snapshot())
      return () => listeners.delete(fn)
    },
    markSaving() {
      internal.state = 'saving'
      emit()
    },
    markSaved(at = new Date()) {
      internal.state = 'saved'
      internal.lastSavedAt = new Date(at).toISOString()
      internal.errorMessage = ''
      emit()
    },
    markError(message) {
      internal.state = 'error'
      internal.errorMessage = message ? String(message) : 'Save failed'
      emit()
    },
    markBackup(at = new Date()) {
      internal.lastBackupAt = new Date(at).toISOString()
      emit()
    },
    setAvailability(available, message = '') {
      internal.storageAvailable = Boolean(available)
      if (!available) {
        internal.state = 'error'
        internal.errorMessage = message ? String(message) : 'Local storage unavailable'
      }
      emit()
    },
  }
}
