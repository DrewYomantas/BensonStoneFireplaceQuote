import { useEffect, useMemo, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import {
  projectCustomerFilesList,
  searchCustomerFilesList,
} from '../lib/customerFilesList.js'

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
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {row.contact && (
          <span className="body-sm" style={{ color: 'var(--ink)' }}>{row.contact}</span>
        )}
        {row.projectAddress && (
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{row.projectAddress}</span>
        )}
        {row.lensSetupTypeLabel && (
          <span className="source source-manual">{row.lensSetupTypeLabel.toUpperCase()}</span>
        )}
      </div>
      {row.summary && (
        <p className="body-sm" style={{ marginTop: 8 }}>{row.summary}</p>
      )}
    </button>
  )
}

export default function CustomerFilesListScreen({ onOpenFile, onOpenStartVisit }) {
  const [rows, setRows] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [query, setQuery] = useState('')

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
        const raw = await listCustomerFilesDurable(storage)
        if (cancelled) return
        setRows(projectCustomerFilesList(raw))
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || String(err))
          setRows([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(
    () => searchCustomerFilesList(rows || [], query),
    [rows, query],
  )

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
          <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
            {filtered.length} of {rows.length} {rows.length === 1 ? 'file' : 'files'}
            {query.trim() ? ` · "${query.trim()}"` : ''}
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
        action={isEmpty ? 'Start a visit to create the first Customer File.' : 'Open a file or start a new visit.'}
        why="Customer Files are the central object — every visit, lens, and follow-up lives on one."
        primary={
          <button type="button" className="btn btn-primary" onClick={onOpenStartVisit}>
            Start a visit
          </button>
        }
      />
    </>
  )
}
