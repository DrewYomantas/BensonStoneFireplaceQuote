import { useEffect, useState } from 'react'
import CustomerFileHeader from '../components/file/CustomerFileHeader.jsx'
import FactRow from '../components/file/FactRow.jsx'
import FieldRulesCard from '../components/file/FieldRulesCard.jsx'
import ManagerReviewReasons from '../components/file/ManagerReviewReasons.jsx'
import ProductsDiscussedCard from '../components/file/ProductsDiscussedCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getCustomerFileDurable } from '../lib/customerFileDurable.js'
import { projectCustomerFileForDisplay, deriveFileWarnings } from '../lib/customerFileView.js'
import { lensFactsForDisplay } from '../lib/setupGoalLens.js'
import { evaluateFieldRules } from '../lib/fieldRules.js'
import { acknowledgeZcGasInsertOnFile } from '../lib/zcGasInsertAck.js'
import {
  projectQuotePrepGateStatus,
  GATE_STATUS,
} from '../lib/quotePrepGate.js'

function FactsCard({ file }) {
  const lensFacts = lensFactsForDisplay(file)
  const lensSaved = Boolean(file.lensUpdatedAt)
  return (
    <section className="card" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ember">SETUP &amp; GOAL</span>
      <div style={{ marginTop: 10 }}>
        <FactRow label="Phone"          value={file.customerPhone}  source={file.customerPhone ? 'manual' : null} />
        <FactRow label="Email"          value={file.customerEmail}  source={file.customerEmail ? 'manual' : null} />
        <FactRow label="Project address" value={file.projectAddress} source={file.projectAddress ? 'manual' : null} />
        {lensFacts.map((fact) => (
          <FactRow
            key={fact.key}
            label={fact.label}
            value={fact.missing ? '' : fact.value}
            source={fact.missing ? null : fact.source}
            sub={fact.missing ? (lensSaved ? 'Still needs to be verified.' : 'Open Setup + Goal Lens to capture this.') : null}
            warn={fact.missing}
          />
        ))}
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

function gateBadge(status) {
  if (status === GATE_STATUS.ready) return { label: 'READY FOR BISTRACK', cls: 'source source-verified' }
  if (status === GATE_STATUS.needsVerification) return { label: 'NEEDS VERIFICATION', cls: 'source source-said' }
  return { label: 'DRAFT', cls: 'source source-manual' }
}

function QuotePrepStatusCard({ file, fieldRulesResult, fileId, onOpenQuotePrep }) {
  const status = projectQuotePrepGateStatus(file, { fieldRulesResult })
  const badge = gateBadge(status.status)
  const headline = status.hasLines ? status.label : 'Quote Prep not started'
  const counts = status.counts
  const countLine = status.hasLines
    ? [
        `${counts.total} proposed line${counts.total === 1 ? '' : 's'}`,
        counts.needsVerification > 0 ? `${counts.needsVerification} needs verification` : null,
        counts.readyForBistrack > 0 ? `${counts.readyForBistrack} ready for BisTrack` : null,
        counts.doNotUseYet > 0 ? `${counts.doNotUseYet} do not use yet` : null,
      ].filter(Boolean).join(' · ')
    : ''
  return (
    <section className="card" style={{ padding: 18 }}>
      <div className="hstack">
        <span className="eyebrow eyebrow-ember">QUOTE / PREP</span>
        <span className={badge.cls} style={{ marginLeft: 8 }}>{badge.label}</span>
      </div>
      <p className="body-sm" style={{ marginTop: 8 }}>
        {headline}
        {status.hasLines ? '.' : '.'}
      </p>
      {countLine && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{countLine}</p>
      )}
      {status.helper && (
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>{status.helper}</p>
      )}
      {status.reasons && status.reasons.length > 0 && (
        <ul className="body-sm" style={{ marginTop: 8, paddingLeft: 18 }}>
          {status.reasons.map((r, idx) => <li key={idx}>{r}</li>)}
        </ul>
      )}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!fileId || !onOpenQuotePrep}
          onClick={() => onOpenQuotePrep && onOpenQuotePrep(fileId)}
        >
          Open Quote / Prep
        </button>
      </div>
    </section>
  )
}

export default function CustomerFileScreen({ fileId, onBack, onOpenLens, onOpenQuotePrep }) {
  const [file, setFile] = useState(null)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setFile(null); setMissing(false); setErrorMsg('')
      if (!fileId || fileId.startsWith('sample-')) {
        setMissing(true)
        return
      }
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setErrorMsg(ready.error || 'Storage unavailable')
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
  const fieldRulesResult = display ? evaluateFieldRules(display) : null
  const fieldRulesBlocker = fieldRulesResult
    ? fieldRulesResult.findings.find(
        (f) => f.severity === 'blocker' && f.status === 'triggered'
      )
    : null
  const status = display && warnings.length === 0 && !fieldRulesBlocker
    ? { kind: 'safe', label: 'Active' }
    : { kind: 'review', label: 'In review' }

  async function acknowledgeZcGasInsert() {
    if (!fileId || !display) return
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) return
      const storage = getSalesOsStorage()
      const updated = await acknowledgeZcGasInsertOnFile({
        storage,
        fileId,
        actor: display.customerName || '',
      })
      if (updated) setFile(projectCustomerFileForDisplay(updated))
    } catch {
      // Acknowledgement is internal-only — no customer-facing surface to notify.
    }
  }

  const canOpenLens = Boolean(display && fileId && onOpenLens)
  const nextBar = (
    <NextActionBar
      action={display ? 'Open Setup + Goal Lens to verify what was captured.' : 'Pick a Customer File from Today or Start Visit.'}
      why="Setup + Goal Lens is where assumed facts become verified ones."
      blocking={
        fieldRulesBlocker
          ? `${fieldRulesBlocker.label} — ${fieldRulesBlocker.action || 'review needed'}.`
          : warnings.length ? warnings[0].message : null
      }
      dontForget="The original BisTrack PDF is the canonical pricing document."
      primary={
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canOpenLens}
          onClick={() => canOpenLens && onOpenLens(fileId)}
        >
          Open Setup + Goal Lens
        </button>
      }
      secondary={
        onBack ? (
          <button type="button" className="btn btn-quiet" onClick={onBack}>← Back to Customer files</button>
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
          <FieldRulesCard
            result={fieldRulesResult}
            onAcknowledgeZcAck={acknowledgeZcGasInsert}
            canAcknowledge={Boolean(fileId)}
          />
        </div>
        <div style={{ marginTop: 18 }}>
          <ManagerReviewReasons />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginTop: 18 }}>
          <QuotePrepStatusCard
            file={display}
            fieldRulesResult={fieldRulesResult}
            fileId={fileId}
            onOpenQuotePrep={onOpenQuotePrep}
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
