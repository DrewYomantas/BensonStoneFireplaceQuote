import { useEffect, useState } from 'react'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getSession } from '../lib/hearthStudioSessionStorage.js'
import { getCustomerFileDurable } from '../lib/customerFileDurable.js'
import { projectCustomerFileForDisplay } from '../lib/customerFileView.js'
import { projectHearthSessionForGuestMode } from '../lib/todayHearthSessions.js'

// Guest Mode shell — customer-facing.
// Renders WITHOUT AppShell so internal rail/backstage actions are not visible.
// Shows only customer-safe content: greeting, chapter progress, calm guidance,
// and a Return to Backstage action for the rep.

export default function HearthStudioGuestScreen({ sessionId, onExit }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState(null)
  const [customerName, setCustomerName] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(''); setView(null); setCustomerName('')
      if (!sessionId) {
        if (!cancelled) { setError('No session.'); setLoading(false) }
        return
      }
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setError('Storage unavailable.')
          setLoading(false)
          return
        }
        const storage = getSalesOsStorage()
        const s = await getSession(storage, sessionId)
        if (cancelled) return
        if (!s) { setError('Session not found.'); setLoading(false); return }
        const projected = projectHearthSessionForGuestMode(s)
        setView(projected)
        if (projected && projected.customerFileId) {
          const file = await getCustomerFileDurable(storage, projected.customerFileId)
          if (!cancelled && file) {
            const safe = projectCustomerFileForDisplay(file)
            setCustomerName(safe.customerName || '')
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const greeting = customerName ? `Welcome, ${customerName}.` : 'Welcome.'

  return (
    <div className="guest-mode" style={{
      minHeight: '100vh',
      background: 'var(--paper)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <header style={{
        padding: '14px 22px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span className="eyebrow eyebrow-ember" style={{ fontSize: 11 }}>HEARTH STUDIO · GUEST MODE</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-quiet" onClick={onExit} aria-label="Return to Customer File">
          ← Return to Customer File
        </button>
      </header>

      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 22px',
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          {loading && <p className="body" style={{ color: 'var(--slate)' }}>Loading session…</p>}
          {error && (
            <p className="body" style={{ color: 'var(--ember)' }}>
              {error} <button type="button" className="btn btn-quiet" onClick={onExit}>Return to Customer File</button>
            </p>
          )}
          {!loading && !error && view && (
            <>
              <h1 className="serif-h h1" style={{ marginBottom: 8 }}>{greeting}</h1>
              <p className="lede" style={{ marginBottom: 24, color: 'var(--slate)' }}>
                We&apos;ll use this to explore design direction together.
              </p>

              <section className="card-flat" style={{ padding: 22 }}>
                <span className="eyebrow eyebrow-ember">CURRENT CHAPTER</span>
                <h2 className="serif-h h3" style={{ marginTop: 6 }}>{view.chapterLabel}</h2>
                <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                  {view.progressLabel}
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button type="button" className="btn btn-primary" disabled>
                    Continue chapter (coming soon)
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={onExit}>
                    Return to Customer File
                  </button>
                </div>
                <p className="body-sm" style={{ marginTop: 16, color: 'var(--slate)' }}>
                  Your rep is guiding this design conversation. Nothing here is a final quote — the official Benson Stone quote process follows once direction is set.
                </p>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
