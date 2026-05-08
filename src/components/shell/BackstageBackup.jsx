// Calm, user-triggered local backup. Lives in the shell top bar so Drew can
// export his Sales OS data without hunting for it. Uses the boot singleton
// storage and the existing salesOsBackup helpers — nothing new to maintain.

import { useState } from 'react'
import {
  ensureSalesOsBoot,
  getSalesOsStorage,
  getSalesOsSaveState,
} from '../../lib/salesOsStorageBoot.js'
import { exportSalesOsBackup, summarizeBackup } from '../../lib/salesOsBackup.js'

export default function BackstageBackup() {
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleBackup() {
    if (busy) return
    setBusy(true); setErrorMsg('')
    const saveState = getSalesOsSaveState()
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) {
        setErrorMsg(ready.error || 'Storage unavailable')
        return
      }
      const storage = getSalesOsStorage()
      saveState.markSaving()
      const payload = await exportSalesOsBackup(storage)
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
      // Console summary for parity with the legacy floating widget. No UI noise.

      console.info('[Sales OS backup]', summarizeBackup(payload).counts)
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      saveState.markError(message)
      setErrorMsg(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={handleBackup}
        disabled={busy}
        title="Download a JSON backup of all local Sales OS data."
      >
        {busy ? 'Exporting…' : 'Backup'}
      </button>
      {errorMsg && (
        <span className="body-sm" style={{ color: 'var(--ember)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {errorMsg}
        </span>
      )}
    </div>
  )
}
