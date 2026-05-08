import { useEffect, useState } from 'react'
import CustomerFileHeader from '../components/file/CustomerFileHeader.jsx'
import FactRow from '../components/file/FactRow.jsx'
import ManagerReviewReasons from '../components/file/ManagerReviewReasons.jsx'
import ProductsDiscussedCard from '../components/file/ProductsDiscussedCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getCustomerFileDurable } from '../lib/customerFileDurable.js'
import { projectCustomerFileForDisplay, deriveFileWarnings } from '../lib/customerFileView.js'

function FactsCard({ file }) {
  const goal = file.customerGoal
  return (
    <section className="card" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ember">SETUP &amp; GOAL</span>
      <div style={{ marginTop: 10 }}>
        <FactRow label="Phone"          value={file.customerPhone}  source={file.customerPhone ? 'manual' : null} />
        <FactRow label="Email"          value={file.customerEmail}  source={file.customerEmail ? 'manual' : null} />
        <FactRow label="Project address" value={file.projectAddress} source={file.projectAddress ? 'manual' : null} />
        <FactRow label="Existing setup"  value={file.existingNotes}  source={file.existingNotes ? 'said' : null}
                 sub="Verify on next visit." warn={!file.existingNotes} />
        <FactRow label="Customer goal"   value={goal} source={goal ? 'said' : null} />
      </div>
    </section>
  )
}

function PlaceholderCard({ title, body }) {
  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">{title}</span>
      <p className="body-sm" style={{ marginTop: 8 }}>{body}</p>
    </section>
  )
}

export default function CustomerFileScreen({ fileId, onBack }) {
  const [file, setFile] = useState(null)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    setFile(null); setMissing(false); setErrorMsg('')
    if (!fileId || fileId.startsWith('sample-')) {
      setMissing(true)
      return () => {}
    }
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (!ready.ok) {
          if (!cancelled) setErrorMsg(ready.error || 'Storage unavailable')
          return
        }
        const storage = getSalesOsStorage()
        const row = await getCustomerFileDurable(storage, fileId)
        if (cancelled) return
        if (!row) setMissing(true)
        else setFile(projectCustomerFileForDisplay(row))
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message || String(err))
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  const display = file
  const warnings = display ? deriveFileWarnings(display) : []
  const status = display && warnings.length === 0
    ? { kind: 'safe', label: 'Active' }
    : { kind: 'review', label: 'In review' }

  const nextBar = (
    <NextActionBar
      action={display ? 'Open Setup + Goal Lens to verify what was captured.' : 'Pick a Customer File from Today or Start Visit.'}
      why="Setup + Goal Lens is where assumed facts become verified ones."
      blocking={warnings.length ? warnings[0].message : null}
      dontForget="The original BisTrack PDF is the canonical pricing document."
      primary={
        <button type="button" className="btn btn-primary" disabled>
          Setup + Goal Lens (next pass)
        </button>
      }
      secondary={
        onBack ? (
          <button type="button" className="btn btn-quiet" onClick={onBack}>← Back to Today</button>
        ) : null
      }
    />
  )

  let body
  if (missing || !fileId) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <h2 className="serif-h h2">Customer File.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          {fileId && fileId.startsWith('sample-')
            ? 'This is a sample card from Today. Real Customer Files appear here once you finish a Start Visit.'
            : 'Pick a file from Today or finish a Start Visit to open one here.'}
        </p>
      </div>
    )
  } else if (errorMsg) {
    body = (
      <div style={{ padding: '24px 28px 28px', maxWidth: 920, margin: '0 auto' }}>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--ember)' }}>
          <span className="eyebrow eyebrow-ember">Storage error</span>
          <p className="body-sm" style={{ marginTop: 4 }}>{errorMsg}</p>
        </div>
      </div>
    )
  } else if (!display) {
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <p className="body-sm">Loading file…</p>
      </div>
    )
  } else {
    body = (
      <div style={{ padding: '24px 28px 28px' }}>
        <CustomerFileHeader file={display} status={status} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <FactsCard file={display} />
          <ProductsDiscussedCard products={[]} />
        </div>
        <div style={{ marginTop: 18 }}>
          <ManagerReviewReasons />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 18 }}>
          <PlaceholderCard
            title="QUOTE / PROPOSAL"
            body="Attach a BisTrack quote in Quote / Prep (next pass). The original BisTrack PDF stays as the canonical evidence document."
          />
          <PlaceholderCard
            title="ACTIVITY"
            body={`Created ${new Date(display.createdAt).toLocaleDateString()}. Visit timeline lands in PR 2.`}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="shell-content">{body}</div>
      {nextBar}
    </>
  )
}
