import { useEffect, useState } from 'react'
import { DOC_TYPE_LABELS } from '../lib/scanDocTypeDetector.js'
import CustomerFileHeader from '../components/file/CustomerFileHeader.jsx'
import FactRow from '../components/file/FactRow.jsx'
import FieldRulesCard from '../components/file/FieldRulesCard.jsx'
import FollowUpComposer from '../components/FollowUpComposer.jsx'
import FollowUpPlanPanel from '../components/FollowUpPlanPanel.jsx'
import SmartContextPanel from '../components/SmartContextPanel.jsx'
import ManagerReviewReasons from '../components/file/ManagerReviewReasons.jsx'
import ProductsDiscussedCard from '../components/file/ProductsDiscussedCard.jsx'
import HearthStudioSessionsCard from '../components/file/HearthStudioSessionsCard.jsx'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { composeFollowUpDraft } from '../lib/followUpComposer.js'
import { customerFileToOpportunity } from '../lib/customerFileFollowUpAdapter.js'
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
import {
  ACTIVITY_KIND_LABELS,
  appendActivityForFile,
  listActivityForFile,
  getFollowUpForFile,
  saveFollowUpForFile,
  clearFollowUpForFile,
  describeFollowUp,
} from '../lib/visitActivity.js'
import { listSessions, createSession } from '../lib/hearthStudioSessionStorage.js'
import useLoggedInRep from '../lib/useLoggedInRep.js'

function SourceTrailCard({ file }) {
  const trail = Array.isArray(file.sourceTrail) && file.sourceTrail.length > 0
    ? file.sourceTrail[0]
    : null
  if (!file.sourceLabel && !trail) return null
  return (
    <section className="card-flat" style={{ padding: '12px 16px' }}>
      <span className="eyebrow eyebrow-ink">SOURCE TRAIL</span>
      <div style={{ marginTop: 8 }}>
        {file.sourceLabel && (
          <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 4 }}>
            {file.sourceLabel}
          </p>
        )}
        {trail && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
            {trail.sourceFileName && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                File: {trail.sourceFileName}
              </span>
            )}
            {Array.isArray(trail.pageNumbers) && trail.pageNumbers.length > 0 && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                Pages: {trail.pageNumbers.join(', ')}
              </span>
            )}
            {Array.isArray(trail.detectedDocTypes) && trail.detectedDocTypes.length > 0 && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                Types: {trail.detectedDocTypes.map((t) => DOC_TYPE_LABELS[t] || t).join(', ')}
              </span>
            )}
            {Array.isArray(trail.quoteNumbers) && trail.quoteNumbers.length > 0 && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                Quote #: {trail.quoteNumbers.join(', ')}
              </span>
            )}
            {trail.importedAt && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                Imported: {(() => {
                  try { return new Date(trail.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
                  catch { return trail.importedAt }
                })()}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

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

function gateBadge(status) {
  if (status === GATE_STATUS.ready) return { label: 'READY FOR BISTRACK', cls: 'source source-verified' }
  if (status === GATE_STATUS.needsVerification) return { label: 'NEEDS VERIFICATION', cls: 'source source-said' }
  return { label: 'DRAFT', cls: 'source source-manual' }
}

function QuotePrepStatusCard({ file, fieldRulesResult, fileId, onOpenQuotePrep, onOpenHandoff, onOpenProposalPreview }) {
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
          {status.reasons.map((r, idx) => (
            <li key={idx}>{typeof r === 'string' ? r : r && r.message}</li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!fileId || !onOpenQuotePrep}
          onClick={() => onOpenQuotePrep && onOpenQuotePrep(fileId)}
        >
          Open Quote / Prep
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!fileId || !onOpenProposalPreview}
          onClick={() => onOpenProposalPreview && onOpenProposalPreview(fileId)}
        >
          Preview Proposal
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!fileId || !onOpenHandoff}
          onClick={() => onOpenHandoff && onOpenHandoff(fileId)}
        >
          Open BisTrack Handoff
        </button>
      </div>
    </section>
  )
}

function formatActivityStamp(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function followUpToneColor(tone) {
  if (tone === 'ember') return 'var(--ember)'
  if (tone === 'brass') return 'var(--brass)'
  return 'var(--slate)'
}

function ActivityCard({ events, onSaveNote, disabled }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function submitNote(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!note.trim() || saving) return
    setSaving(true); setSaveError('')
    try {
      const ok = await onSaveNote(note.trim())
      if (ok) setNote('')
      else setSaveError('Note could not be saved — try again.')
    } catch (err) {
      setSaveError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card-flat" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ink">VISIT ACTIVITY</span>
      {events.length === 0 ? (
        <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
          No activity yet. Visits, lens saves, quote prep changes, and handoff copies will appear here.
        </p>
      ) : (
        <ul className="body-sm" style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
          {events.map((ev) => (
            <li key={ev.id} style={{ marginBottom: 8 }}>
              <div className="hstack">
                <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>
                  {(ACTIVITY_KIND_LABELS[ev.kind] || ev.kind).toUpperCase()}
                </span>
                <span className="spacer" />
                <span className="body-sm" style={{ color: 'var(--slate)' }}>
                  {formatActivityStamp(ev.at)}
                </span>
              </div>
              {ev.summary && (
                <p className="body-sm" style={{ marginTop: 2 }}>{ev.summary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submitNote} style={{ marginTop: 12 }}>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>ADD A NOTE</span>
          <textarea
            className="field"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal note. Not customer-facing."
            disabled={disabled || saving}
            style={{ marginTop: 6, width: '100%' }}
          />
        </label>
        {saveError && (
          <p className="body-sm" style={{ marginTop: 6, color: 'var(--ember)' }}>{saveError}</p>
        )}
        <div style={{ marginTop: 8 }}>
          <button
            type="submit"
            className="btn btn-quiet"
            disabled={disabled || saving || !note.trim()}
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </form>
    </section>
  )
}

function FollowUpCard({ followUp, onSave, onClear, disabled }) {
  // Seed local state from the durable follow-up. Parent passes a `key`
  // tied to the follow-up identity so this component remounts when the
  // saved value changes — no setState-in-effect dance required.
  const [dueAt, setDueAt] = useState(followUp ? followUp.dueAt : '')
  const [note, setNote] = useState(followUp ? followUp.note : '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const signal = describeFollowUp(followUp)

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!dueAt || saving) return
    setSaving(true); setSaveError('')
    try {
      const ok = await onSave({ dueAt, note: note.trim() })
      if (!ok) setSaveError('Follow-up could not be saved — try again.')
    } catch (err) {
      setSaveError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    if (saving) return
    setSaving(true); setSaveError('')
    try {
      await onClear()
      setDueAt(''); setNote('')
    } catch (err) {
      setSaveError(err.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" style={{ padding: 18 }}>
      <span className="eyebrow eyebrow-ember">FOLLOW-UP</span>
      {signal.kind !== 'none' && (
        <p className="body-sm" style={{ marginTop: 6, color: followUpToneColor(signal.tone) }}>
          {signal.text}
        </p>
      )}
      <form onSubmit={submit} style={{ marginTop: 8 }}>
        <label>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>FOLLOW UP BY</span>
          <input
            type="date"
            className="field"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={disabled || saving}
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ display: 'block', marginTop: 10 }}>
          <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>SHORT NOTE</span>
          <input
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why following up — internal only."
            disabled={disabled || saving}
            style={{ marginTop: 6, width: '100%' }}
          />
        </label>
        {saveError && (
          <p className="body-sm" style={{ marginTop: 6, color: 'var(--ember)' }}>{saveError}</p>
        )}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="btn btn-quiet" disabled={disabled || saving || !dueAt}>
            {saving ? 'Saving…' : 'Save follow-up'}
          </button>
          {followUp && (
            <button type="button" className="btn btn-quiet" onClick={clear} disabled={disabled || saving}>
              Clear follow-up
            </button>
          )}
        </div>
      </form>
      <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
        Internal reminder only — nothing is sent.
      </p>
    </section>
  )
}

export default function CustomerFileScreen({ fileId, onBack, onOpenLens, onOpenQuotePrep, onOpenHandoff, onOpenProposalPreview, onOpenHearthSession }) {
  const { rep } = useLoggedInRep()
  const [file, setFile] = useState(null)
  const [missing, setMissing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [activity, setActivity] = useState([])
  const [followUp, setFollowUp] = useState(null)
  const [hsSessions, setHsSessions] = useState([])
  const [composerOpen, setComposerOpen] = useState(false)
  const [showSmartContext, setShowSmartContext] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState('email')
  const [selectedTone, setSelectedTone] = useState('warm')

  async function reloadActivityAndFollowUp(storage, id) {
    try {
      const [acts, fu, allSessions] = await Promise.all([
        listActivityForFile(storage, id, { limit: 8 }),
        getFollowUpForFile(storage, id),
        listSessions(storage),
      ])
      setActivity(acts)
      setFollowUp(fu)
      setHsSessions(allSessions.filter((s) => s.customerFileId === id))
    } catch {
      // Activity is best-effort — don't block the file view if storage hiccups.
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      setFile(null); setMissing(false); setErrorMsg('')
      setActivity([]); setFollowUp(null)
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
        if (!row) { setMissing(true); return }
        setFile(projectCustomerFileForDisplay(row))
        await reloadActivityAndFollowUp(storage, fileId)
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message || String(err))
      }
    })()
    return () => { cancelled = true }
  }, [fileId])

  async function handleSaveNote(text) {
    if (!fileId) return false
    try {
      const storage = getSalesOsStorage()
      const ev = await appendActivityForFile(storage, fileId, {
        kind: 'manual_note',
        summary: text,
      })
      await reloadActivityAndFollowUp(storage, fileId)
      return Boolean(ev)
    } catch {
      return false
    }
  }

  async function handleSaveFollowUp({ dueAt, note }) {
    if (!fileId) return false
    try {
      const storage = getSalesOsStorage()
      await saveFollowUpForFile(storage, fileId, { dueAt, note })
      await appendActivityForFile(storage, fileId, {
        kind: 'follow_up_set',
        summary: note ? `Follow up by ${dueAt}: ${note}` : `Follow up by ${dueAt}.`,
      })
      await reloadActivityAndFollowUp(storage, fileId)
      return true
    } catch {
      return false
    }
  }

  async function handleClearFollowUp() {
    if (!fileId) return false
    try {
      const storage = getSalesOsStorage()
      await clearFollowUpForFile(storage, fileId)
      await reloadActivityAndFollowUp(storage, fileId)
      return true
    } catch {
      return false
    }
  }

  function handlePlanChange(updated) {
    if (updated) setFile(projectCustomerFileForDisplay(updated))
  }

  async function handleLogSent() {
    if (!fileId || !display) return
    try {
      const storage = getSalesOsStorage()
      await appendActivityForFile(storage, fileId, {
        kind: 'manual_note',
        summary: 'Follow-up draft logged as sent.',
      })
      await reloadActivityAndFollowUp(storage, fileId)
    } catch {
      // best-effort
    }
  }

  async function handleOpenHearthSession(sessionId) {
    if (!fileId) return
    try {
      const storage = getSalesOsStorage()
      const repId = rep ? rep.id : null
      if (sessionId) {
        onOpenHearthSession && onOpenHearthSession(sessionId)
      } else {
        const newSession = await createSession(storage, fileId, repId)
        await reloadActivityAndFollowUp(storage, fileId)
        onOpenHearthSession && onOpenHearthSession(newSession.id)
      }
    } catch {
      // creation failure is non-fatal for the file view
    }
  }

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
            onOpenHandoff={onOpenHandoff}
            onOpenProposalPreview={onOpenProposalPreview}
          />
          <FollowUpCard
            key={`fu-${followUp ? followUp.dueAt : 'none'}-${followUp ? followUp.setAt : ''}`}
            followUp={followUp}
            onSave={handleSaveFollowUp}
            onClear={handleClearFollowUp}
            disabled={!fileId}
          />
        </div>
        <div style={{ marginTop: 18 }}>
          <HearthStudioSessionsCard
            sessions={hsSessions}
            onOpenHearthSession={handleOpenHearthSession}
            disabled={!fileId}
          />
        </div>
        <div style={{ marginTop: 18 }}>
          <FollowUpPlanPanel file={display} onChange={handlePlanChange} />
          {display && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setComposerOpen((v) => !v)}
              >
                {composerOpen ? 'Hide follow-up composer' : 'Draft follow-up message'}
              </button>
              {composerOpen && (() => {
                const opportunity = customerFileToOpportunity(display, followUp, warnings)
                const draft = composeFollowUpDraft({ opportunity, tone: selectedTone, channel: selectedChannel })
                return (
                  <FollowUpComposer
                    draft={draft}
                    opportunity={opportunity}
                    selectedChannel={selectedChannel}
                    selectedTone={selectedTone}
                    onChannelChange={setSelectedChannel}
                    onToneChange={setSelectedTone}
                    onLogSent={handleLogSent}
                  />
                )
              })()}
            </div>
          )}
        </div>
        {display && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setShowSmartContext((v) => !v)}
            >
              {showSmartContext ? 'Hide Smart Context' : 'Show Smart Context'}
            </button>
            {showSmartContext && (
              <div style={{ marginTop: 8 }}>
                <SmartContextPanel
                  file={display}
                  quotePrepLines={display.quotePrepLines || []}
                  onOpenHearthSession={handleOpenHearthSession}
                />
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 18 }}>
          <ActivityCard
            events={activity}
            onSaveNote={handleSaveNote}
            disabled={!fileId}
          />
        </div>
        {(display.sourceLabel || (Array.isArray(display.sourceTrail) && display.sourceTrail.length > 0)) && (
          <div style={{ marginTop: 18 }}>
            <SourceTrailCard file={display} />
          </div>
        )}
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
