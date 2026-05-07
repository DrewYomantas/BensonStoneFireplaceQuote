import { useMemo, useRef, useState } from 'react'
import {
  buildImportSummary,
  createOpportunityDraftsFromPipelineCsv,
} from '../lib/customerPipelineCsv.js'
import {
  listOpportunities,
  saveOpportunity,
  updateOpportunity,
} from '../lib/opportunities.js'

function statusLabel(status) {
  return String(status || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function CustomerPipelineImport({ onSave, onCancel }) {
  const fileRef = useRef(null)
  const [drafts, setDrafts] = useState([])
  const [parseResult, setParseResult] = useState(null)
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('Pick the old Benson Stone Customer Pipeline CSV. You\'ll review every row before anything gets added.')
  const [error, setError] = useState('')
  const [skipped, setSkipped] = useState(new Set())
  const [addedCount, setAddedCount] = useState(0)
  const [updatedCount, setUpdatedCount] = useState(0)

  const summaryLine = useMemo(() => parseResult ? buildImportSummary(parseResult, fileName) : '', [parseResult, fileName])

  const visibleDrafts = useMemo(() => drafts.filter((d) => !skipped.has(d.id)), [drafts, skipped])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setAddedCount(0)
    setUpdatedCount(0)
    setSkipped(new Set())
    try {
      const text = await file.text()
      if (!text.trim()) {
        setError('That CSV file is empty. Pick another file.')
        setStatus('Empty file. No changes were made.')
        setDrafts([])
        setParseResult(null)
        return
      }
      const result = createOpportunityDraftsFromPipelineCsv(text, {
        existingOpportunities: listOpportunities(),
      })
      if (result.error) {
        setError(result.error)
        setStatus('Couldn\'t parse the CSV. Existing queue is unchanged.')
        setDrafts([])
        setParseResult(result)
        setFileName(file.name)
        return
      }
      setFileName(file.name)
      setParseResult(result)
      setDrafts(result.drafts)
      setStatus(buildImportSummary(result, file.name))
    } catch (err) {
      setError(err.message || String(err))
      setStatus('Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function addDraft(draft) {
    saveOpportunity(draft.opportunity)
    setSkipped((current) => {
      const next = new Set(current)
      next.add(draft.id)
      return next
    })
    setAddedCount((c) => c + 1)
  }

  function updateExisting(draft) {
    if (!draft.duplicate.duplicateId) return
    updateOpportunity(draft.duplicate.duplicateId, {
      ...draft.opportunity,
      id: draft.duplicate.duplicateId,
      updatedAt: new Date().toISOString(),
    })
    setSkipped((current) => {
      const next = new Set(current)
      next.add(draft.id)
      return next
    })
    setUpdatedCount((c) => c + 1)
  }

  function skipDraft(id) {
    setSkipped((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  function addAllReady() {
    visibleDrafts.forEach((draft) => {
      if (draft.action === 'add') addDraft(draft)
    })
  }

  const readyCount = visibleDrafts.filter((d) => d.action === 'add').length

  return (
    <div className="bs-intake bs-upload-intake">
      <div className="bs-upload-intake__head">
        <div>
          <p className="bs-lens__eyebrow">Customer Pipeline Import</p>
          <h2>Import Customer Pipeline CSV</h2>
          <p>Use this for the old Benson Stone Customer Pipeline export. You&rsquo;ll review everything before adding it to the queue.</p>
        </div>
        <label className="bs-button bs-button--primary">
          {drafts.length ? 'Pick a different CSV' : 'Select CSV'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            hidden
          />
        </label>
      </div>

      <p className="bs-status" role="status">{status}</p>
      {summaryLine && summaryLine !== status ? (
        <p className="bs-status" style={{ marginTop: 0 }}>{summaryLine}</p>
      ) : null}

      {(addedCount > 0 || updatedCount > 0 || drafts.length > 0) && (
        <div className="bs-triage-summary">
          {addedCount > 0 && <span className="bs-badge bs-badge--status">✓ {addedCount} added to queue</span>}
          {updatedCount > 0 && <span className="bs-badge bs-badge--status">✓ {updatedCount} updated</span>}
          {drafts.length > 0 && <span className="bs-badge bs-badge--status">{readyCount} ready</span>}
          {drafts.length > 0 && parseResult?.summary?.rowsWithWarnings ? (
            <span className="bs-badge bs-badge--warning">{parseResult.summary.rowsWithWarnings} need review</span>
          ) : null}
          {drafts.length > 0 && parseResult?.summary?.duplicates ? (
            <span className="bs-badge bs-badge--warm">{parseResult.summary.duplicates} possible duplicate{parseResult.summary.duplicates === 1 ? '' : 's'}</span>
          ) : null}
        </div>
      )}

      {visibleDrafts.length > 0 && (
        <div className="bs-triage-bucket">
          <div className="bs-triage-bucket__header">
            <div>
              <strong>Drafts to review</strong>
              <span className="bs-badge bs-badge--status">{visibleDrafts.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {readyCount > 0 && (
                <button
                  type="button"
                  className="bs-button bs-button--primary"
                  onClick={addAllReady}
                  style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd', fontSize: 13, padding: '7px 14px' }}
                >
                  Add All Ready ({readyCount})
                </button>
              )}
            </div>
          </div>

          <div className="bs-triage-cards">
            {visibleDrafts.map((draft) => {
              const opp = draft.opportunity
              const reasons = draft.duplicate.isDuplicate ? draft.duplicate.reasons : []
              return (
                <article key={draft.id} className="bs-triage-card">
                  <div className="bs-triage-card__head">
                    <div>
                      <strong>{opp.customerName}</strong>
                      <span>
                        {opp.customerPhone || '(no phone)'}
                        {opp.customerEmail ? ` · ${opp.customerEmail}` : ''}
                        {opp.quoteDate ? ` · ${opp.quoteDate}` : ''}
                        {opp.originalQuoteAmount ? ` · ${opp.originalQuoteAmount}` : ''}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b5a47' }}>
                        Stage: {draft.stage || '(none)'} → {statusLabel(opp.status)} · Source: {opp.sourceLabel || 'Customer Pipeline CSV'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {draft.action === 'review-first' && (
                        <span className="bs-badge bs-badge--warning">Review first</span>
                      )}
                      {draft.action === 'update-existing' && (
                        <span className="bs-badge bs-badge--warm">Update existing</span>
                      )}
                      {draft.action === 'add' && (
                        <span className="bs-badge bs-badge--status">Ready</span>
                      )}
                    </div>
                  </div>

                  {reasons.length > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a6d4c' }}>
                      Possible duplicate ({draft.duplicate.confidence}): {reasons.join(', ')}
                    </p>
                  )}

                  {opp.warnings && opp.warnings.length > 0 && (
                    <ul className="notice-list notice-list--warning" style={{ margin: '6px 0 0' }}>
                      {opp.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  )}

                  {opp.internalNotes ? (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#5a4a37' }}>
                      <em>Notes:</em> {opp.internalNotes}
                    </p>
                  ) : null}

                  <div className="bs-triage-card__actions">
                    {draft.action === 'update-existing' ? (
                      <button
                        type="button"
                        className="bs-button bs-button--primary"
                        onClick={() => updateExisting(draft)}
                        style={{ fontSize: 12, padding: '6px 12px', background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
                      >
                        Update Existing
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bs-button bs-button--primary"
                        onClick={() => addDraft(draft)}
                        style={{ fontSize: 12, padding: '6px 12px', background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
                      >
                        Add to Queue
                      </button>
                    )}
                    <button type="button" className="bs-lens__copy" onClick={() => skipDraft(draft.id)}>Skip</button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {error ? <p style={{ margin: 0, fontSize: 13, color: '#8a2a0d', fontWeight: 600 }}>{error}</p> : null}

      {(addedCount > 0 || updatedCount > 0) && visibleDrafts.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: '#173321', fontWeight: 600 }}>
          ✓ All handled. {addedCount} added, {updatedCount} updated.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(addedCount > 0 || updatedCount > 0) && (
          <button
            type="button"
            className="bs-button bs-button--primary"
            onClick={onSave}
            style={{ background: '#173321', borderColor: '#173321', color: '#f6eddd' }}
          >
            Done — View Queue
          </button>
        )}
        <button
          type="button"
          className="bs-button bs-button--ghost"
          onClick={onCancel}
          style={{ color: '#2d2217', borderColor: 'rgba(94,73,51,0.3)' }}
        >
          {addedCount > 0 || updatedCount > 0 ? 'Cancel Remaining' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
