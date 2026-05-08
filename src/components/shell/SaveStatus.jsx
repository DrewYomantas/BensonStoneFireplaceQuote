import { useEffect, useState } from 'react'
import { getSalesOsSaveState, ensureSalesOsBoot } from '../../lib/salesOsStorageBoot.js'
import { describeSaveStatus } from '../../lib/saveStatusView.js'

export default function SaveStatus() {
  const saveState = getSalesOsSaveState()
  const [snapshot, setSnapshot] = useState(saveState.snapshot())

  useEffect(() => {
    ensureSalesOsBoot()
    const unsubscribe = saveState.subscribe(setSnapshot)
    return unsubscribe
  }, [saveState])

  const view = describeSaveStatus(snapshot)
  return (
    <span className={view.className} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      {view.label}
    </span>
  )
}
