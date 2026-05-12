import { useEffect, useMemo, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import {
  projectCustomerFilesList,
  searchCustomerFilesList,
  filterCustomerFilesListByQuotePrep,
  enrichCustomerFilesListWithFollowUps,
  filterCustomerFilesListByFollowUp,
  enrichCustomerFilesListWithHsSessions,
  filterCustomerFilesListByHs,
  QUOTE_PREP_FILTER_VALUES,
  QUOTE_PREP_FILTER_LABELS,
  FOLLOW_UP_FILTER_VALUES,
  FOLLOW_UP_FILTER_LABELS,
  HS_FILTER_VALUES,
  HS_FILTER_LABELS,
} from '../lib/customerFilesList.js'
import { GATE_STATUS } from '../lib/quotePrepGate.js'
import { listAllFollowUps } from '../lib/visitActivity.js'
import { listSessions } from '../lib/hearthStudioSessionStorage.js'

function quotePrepPill(status, hasLines) {
  if (!hasLines) return { label: 'NOT STARTED', cls: 'source source-manual' }
  if (status === GATE_STATUS.ready) return { label: 'READY FOR BISTRACK', cls: 'source source-verified' }
  if (status === GATE_STATUS.needsVerification) return { label: 'NEEDS VERIFICATION', cls: 'source source-said' }
  return { label: 'DRAFT', cls: 'source source-manual' }
}

function followUpToneColor(tone) {
  if (tone === 'ember') return 'var(--ember)'
  if (tone === 'brass') return 'var(--brass)'
  return 'var(--slate)'
}

function formatStamp(iso) {
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

function FileRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className="card customer-file-row"
      onClick={() => onOpen && onOpen(row.id)}
      aria-label={`Open Customer File for ${row.customerName || 'unnamed customer'}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: 16, marginTop: 12, cursor: 'pointer',
        background: 'var(--paper)', border: '1px solid var(--rule)',
        borderLeft: '3px solid var(--brass)',
      }}
    >
      <div className="hstack">
        <span className="eyebrow eyebrow-ink">{row.customerName || 'Unnamed customer'}</span>
        <span className="spacer" />
        {row.updatedAt && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>
            {formatStamp(row.updatedAt)}
          </span>
        )}
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {row.contact && (
          <span className="body-sm" style={{ color: 'var(--ink)' }}>{row.contact}</span>
        )}
        {row.projectAddress && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{row.projectAddress}</span>
        )}
        {row.lensSetupTypeLabel && (
          <span className="source source-manual">{row.lensSetupTypeLabel.toUpperCase()}</span>
        )}
        {row.quotePrep && (() => {
          const pill = quotePrepPill(row.quotePrep.status, row.quotePrep.hasLines)
          return <span className={pill.cls}>{pill.label}</span>
        })()}
        {row.quotePrep && row.quotePrep.hasLines && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>
            {row.quotePrep.counts.total} line{row.quotePrep.counts.total === 1 ? '' : 's'}
            {row.quotePrep.counts.needsVerification > 0 ? ` · ${row.quotePrep.counts.needsVerification} needs verification` : ''}
            {row.quotePrep.counts.readyForBistrack > 0 ? ` · ${row.quotePrep.counts.readyForBistrack} ready for BisTrack` : ''}
            {row.quotePrep.counts.doNotUseYet > 0 ? ` · ${row.quotePrep.counts.doNotUseYet} do not use yet` : ''}
          </span>
        )}
      </div>
      {row.summary && (
        <p className="body-sm" style={{ marginTop: 8 }}>{row.summary}</p>
      )}
      {row.followUp && row.followUp.signal && row.followUp.signal.kind !== 'none' && (
        <p className="body-sm" style={{ marginTop: 4, color: followUpToneColor(row.followUp.signal.tone) }}>
          {row.followUp.signal.text}
        </p>
      )}
    </button>
  )
}

export default function CustomerFilesListScreen({ onOpenFile, onOpenStartVisit, onOpenAddQuote }) {
  const [rows, setRows] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [query, setQuery] = useState('')
  const [quotePrepFilter, setQuotePrepFilter] = useState('all')
  const [followUpFilter, setFollowUpFilter] = useState('all')
  const [hsFilter, setHsFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (cancelled) return
        if (!ready.ok) {
          setErrorMsg(ready.error || 'Storage unavailable')
          setRows([])
          return
        }
        const storage = getSalesOsStorage()
        const [raw, followUps, allSessions] = await Promise.all([
          listCustomerFilesDurable(storage),
          listAllFollowUps(storage),
          listSessions(storage),
        ])
        if (cancelled) return
        const projected = projectCustomerFilesList(raw)
        const withFollowUps = enrichCustomerFilesListWithFollowUps(projected, followUps, new Date())
        setRows(enrichCustomerFilesListWithHsSessions(withFollowUps, allSessions))
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || String(err))
          setRows([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const searched = searchCustomerFilesList(rows || [], query)
    const byQuote = filterCustomerFilesListByQuotePrep(searched, quotePrepFilter)
    const byFollowUp = filterCustomerFilesListByFollowUp(byQuote, followUpFilter, new Date())
    return filterCustomerFilesListByHs(byFollowUp, hsFilter)
  }, [rows, query, quotePrepFilter, followUpFilter, hsFilter])

  const loading = rows === null && !errorMsg
  const isEmpty = !loading && !errorMsg && (rows || []).length === 0

  let body
  if (loading) {
    body = <p className="body-sm">Loading customer files…</p>
  } else if (errorMsg) {
    body = (
      <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--ember)' }}>
        <span className="eyebrow eyebrow-ember">Storage error</span>
        <p className="body-sm" style={{ marginTop: 4 }}>{errorMsg}</p>
        <p className="body-sm" style={{ marginTop: 4, color: 'var(--slate)' }}>
          Try reloading. Your files are stored locally on this tablet.
        </p>
      </div>
    )
  } else if (isEmpty) {
    body = (
      <div className="card-flat" style={{ padding: 18 }}>
        <span className="eyebrow eyebrow-ink">No Customer Files yet</span>
        <p className="body-sm" style={{ marginTop: 8 }}>
          Files appear here after a Start Visit is created. They stay on this
          tablet — nothing syncs anywhere.
        </p>
      </div>
    )
  } else {
    body = (
      <>
        <div style={{ marginTop: 4 }}>
          <label htmlFor="customer-files-search" className="eyebrow eyebrow-ink">
            Search
          </label>
          <input
            id="customer-files-search"
            type="search"
            className="field"
            placeholder="Name, phone, email, address, or project text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            style={{ marginTop: 6, width: '100%' }}
          />
          <div style={{ marginTop: 10 }}>
            <span className="eyebrow eyebrow-ink">QUOTE PREP STATUS</span>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUOTE_PREP_FILTER_VALUES.map((v) => {
                const active = v === quotePrepFilter
                return (
                  <button
                    key={v}
                    type="button"
                    className={active ? 'btn btn-primary' : 'btn btn-quiet'}
                    style={{ padding: '4px 10px' }}
                    onClick={() => setQuotePrepFilter(v)}
                    aria-pressed={active}
                  >
                    {QUOTE_PREP_FILTER_LABELS[v]}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <span className="eyebrow eyebrow-ink">FOLLOW-UP</span>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FOLLOW_UP_FILTER_VALUES.map((v) => {
                const active = v === followUpFilter
                return (
                  <button
                    key={v}
                    type="button"
                    className={active ? 'btn btn-primary' : 'btn btn-quiet'}
                    style={{ padding: '4px 10px' }}
                    onClick={() => setFollowUpFilter(v)}
                    aria-pressed={active}
                  >
                    {FOLLOW_UP_FILTER_LABELS[v]}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <span className="eyebrow eyebrow-ink">HEARTH STUDIO</span>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HS_FILTER_VALUES.map((v) => {
                const active = v === hsFilter
                return (
                  <button
                    key={v}
                    type="button"
                    className={active ? 'btn btn-primary' : 'btn btn-quiet'}
                    style={{ padding: '4px 10px' }}
                    onClick={() => setHsFilter(v)}
                    aria-pressed={active}
                  >
                    {HS_FILTER_LABELS[v]}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>
            {filtered.length} of {rows.length} {rows.length === 1 ? 'file' : 'files'}
            {query.trim() ? ` · "${query.trim()}"` : ''}
            {quotePrepFilter !== 'all' ? ` · ${QUOTE_PREP_FILTER_LABELS[quotePrepFilter]}` : ''}
          </p>
        </div>
        {filtered.length === 0 ? (
          <p className="body-sm" style={{ marginTop: 12 }}>
            No files match that search. Try a shorter term.
          </p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {filtered.map((row) => (
              <FileRow key={row.id} row={row} onOpen={onOpenFile} />
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px', maxWidth: 1080, margin: '0 auto' }}>
          <h2 className="serif-h h2">Customer files.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            Reopen a saved file. Search by name, phone, email, address, or
            anything you noted during the visit.
          </p>
          <hr className="rule-brass" style={{ margin: '20px 0' }} />
          {body}
        </div>
      </div>
      <NextActionBar
        action={isEmpty ? 'Add a quote PDF or start a visit to create the first Customer File.' : 'Open a file, add a new quote PDF, or start a visit.'}
        why="Customer Files are the central object — every visit, lens, and follow-up lives on one."
        primary={
          onOpenAddQuote ? (
            <button type="button" className="btn btn-primary" onClick={onOpenAddQuote}>
              Add Quote PDF
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>
              Start a visit
            </button>
          )
        }
        secondary={
          <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>
            Start a visit
          </button>
        }
      />
    </>
  )
}
