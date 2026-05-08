import { useEffect, useRef, useState } from 'react'
import { createIndexedDbEngine, createSalesOsStorage } from '../lib/salesOsStorage.js'
import { exportSalesOsBackup, importSalesOsBackup, summarizeBackup } from '../lib/salesOsBackup.js'
import { createSaveState } from '../lib/salesOsSaveState.js'
import { migrateLegacyLocalStorage } from '../lib/salesOsMigration.js'
import { setCustomerFileDurableMirror } from '../lib/customerFile.js'

const saveState = createSaveState()
const storage = createSalesOsStorage({ engine: createIndexedDbEngine() })
let initPromise = null

function ensureInit() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    saveState.markSaving()
    const opened = await storage.open()
    if (!opened.ok) {
      saveState.setAvailability(false, opened.error.message)
      return { ok: false }
    }
    setCustomerFileDurableMirror(storage)
    saveState.markSaved()
    const migration = await migrateLegacyLocalStorage(storage)
    if (!migration.ok) {
      saveState.markError((migration.errors || []).join('; ') || 'Migration failed')
      return { ok: false }
    }
    if (!migration.skipped) saveState.markSaved()
    return { ok: true }
  })()
  return initPromise
}

const wrapStyle = {
  position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'rgba(31,53,39,0.94)', color: '#f3ead6',
  padding: '8px 12px', borderRadius: 8,
  fontSize: 12, fontFamily: 'system-ui, -apple-system, sans-serif',
  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
  minHeight: 36,
}
const btnStyle = {
  background: 'transparent', color: '#f3ead6',
  border: '1px solid rgba(243,234,214,0.35)', borderRadius: 4,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
  minHeight: 28,
}

export default function SalesOsStorageStatus() {
  const [status, setStatus] = useState(saveState.snapshot())
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    const unsubscribe = saveState.subscribe(setStatus)
    ensureInit()
    return unsubscribe
  }, [])

  async function handleBackup() {
    setErrorMsg('')
    saveState.markSaving()
    try {
      const payload = await exportSalesOsBackup(storage)
      const summary = summarizeBackup(payload)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const link = document.createElement('a')
      link.href = url
      link.download = `benson-fireplace-sales-os-backup-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      saveState.markBackup()
      saveState.markSaved()
      // Console-only summary; no UI redesign here.

      console.info('[Sales OS backup]', summary.counts)
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      saveState.markError(message)
      setErrorMsg(message)
    }
  }

  async function handleRestore(file) {
    setErrorMsg('')
    saveState.markSaving()
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const result = await importSalesOsBackup(storage, payload, { mode: 'replace' })
      if (!result.ok) {
        const joined = (result.errors || []).join('; ')
        saveState.markError(joined)
        setErrorMsg(joined)
        return
      }
      saveState.markSaved()
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      saveState.markError(message)
      setErrorMsg(message)
    }
  }

  const labelColor = status.state === 'error' || !status.storageAvailable ? '#ffb892' : '#f3ead6'

  return (
    <div style={wrapStyle} role="status" aria-live="polite">
      <span style={{ fontWeight: 600, color: labelColor }}>{status.label}</span>
      <button type="button" onClick={handleBackup} style={btnStyle} disabled={!status.storageAvailable}>
        Backup
      </button>
      <label style={{ ...btnStyle, cursor: status.storageAvailable ? 'pointer' : 'not-allowed', opacity: status.storageAvailable ? 1 : 0.5 }}>
        Restore
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          disabled={!status.storageAvailable}
          onChange={(event) => {
            const file = event.target.files && event.target.files[0]
            if (file) handleRestore(file)
            event.target.value = ''
          }}
        />
      </label>
      {errorMsg && (
        <span style={{ color: '#ffb892', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {errorMsg}
        </span>
      )}
    </div>
  )
}
