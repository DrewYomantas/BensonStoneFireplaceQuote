import { useEffect, useRef, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import {
  buildBulkIntakeReview,
  commitBulkIntakeDrafts,
  STATUS_LABELS,
} from '../lib/customerBulkIntake.js'

// ---- Status badge ----------------------------------------------------------

const STATUS_CLS = {
  ready: 'source source-verified',
  'missing-name': 'source source-said',
  'missing-contact': 'source source-said',
  duplicate: 'source source-manual',
  'duplicate-soft': 'source source-manual',
  'needs-review': 'source source-manual',
}

function StatusBadge({ status }) {
  const cls = STATUS_CLS[status] || 'source source-manual'
  const label = STATUS_LABELS[status] || 'Needs review'
  return <span className={cls}>{label.toUpperCase()}</span>
}

// ---- Review table row ------------------------------------------------------

function ReviewRow({ row, checked, disabled, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--stone-150)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(row._id)}
        style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--brass)', width: 18, height: 18 }}
        aria-label={`Select ${row.customerName || 'row ' + row._row} for import`}
      />
      <div style={{ flex: 1 }}>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {row.customerName || <span style={{ color: 'var(--slate-soft)' }}>(no name)</span>}
          </span>
          <StatusBadge status={row.status} />
        </div>
        {(row.customerPhone || row.customerEmail) && (
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
            {[row.customerPhone, row.customerEmail].filter(Boolean).join(' · ')}
          </p>
        )}
        {row.projectAddress && (
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
            {row.projectAddress}
          </p>
        )}
        {row.existingNotes && (
          <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 2 }}>
            {row.existingNotes}
          </p>
        )}
        {row.duplicateInfo && (
          <p className="body-sm" style={{ color: 'var(--ember-dark)', marginTop: 2 }}>
            {row.duplicateInfo.kind === 'phone' && 'Existing file has same phone number.'}
            {row.duplicateInfo.kind === 'email' && 'Existing file has same email address.'}
            {row.duplicateInfo.kind === 'name' && 'Existing file has the same name — check before importing.'}
          </p>
        )}
        {row.status === 'missing-name' && (
          <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 2 }}>
            Cannot import without a customer name.
          </p>
        )}
      </div>
    </div>
  )
}

// ---- Default selection logic -----------------------------------------------

function defaultSelected(rows) {
  const s = new Set()
  for (const row of rows) {
    if (row.status === 'missing-name') continue       // disabled
    if (row.status === 'duplicate') continue          // skip by default
    s.add(row._id)
  }
  return s
}

// ---- Screen ----------------------------------------------------------------

export default function BulkIntakeScreen({ onBack, onOpenFilesList }) {
  const [pasteText, setPasteText] = useState('')
  const [phase, setPhase] = useState('input')    // 'input' | 'review' | 'result'
  const [draftRows, setDraftRows] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [existingFiles, setExistingFiles] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      try {
        const ready = await ensureSalesOsBoot()
        if (!ready.ok) return
        const storage = getSalesOsStorage()
        const raw = await listCustomerFilesDurable(storage)
        setExistingFiles(raw)
      } catch {
        // best-effort: duplicate detection just gets no existing files
      }
    })()
  }, [])

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPasteText(ev.target.result || '')
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleParse() {
    setErrorMsg('')
    const text = pasteText.trim()
    if (!text) { setErrorMsg('Paste or upload text to parse.'); return }
    const rows = buildBulkIntakeReview(text, existingFiles)
    if (!rows.length) { setErrorMsg('No data rows found. Check that your text has a header row and at least one data row.'); return }
    setDraftRows(rows)
    setSelected(defaultSelected(rows))
    setPhase('review')
  }

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    const eligible = draftRows.filter((r) => r.status !== 'missing-name').map((r) => r._id)
    setSelected(new Set(eligible))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleImport() {
    if (importing) return
    const toImport = draftRows.filter((r) => selected.has(r._id))
    if (!toImport.length) { setErrorMsg('No rows selected. Check the boxes next to the rows you want to import.'); return }
    setImporting(true)
    setErrorMsg('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) { setErrorMsg(ready.error || 'Storage unavailable'); return }
      const storage = getSalesOsStorage()
      const result = await commitBulkIntakeDrafts(toImport, storage)
      setImportResult(result)
      setPhase('result')
    } catch (err) {
      setErrorMsg(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleReset() {
    setPasteText('')
    setDraftRows([])
    setSelected(new Set())
    setImportResult(null)
    setErrorMsg('')
    setPhase('input')
  }

  const selectedCount = draftRows.filter((r) => selected.has(r._id)).length
  const readyCount = draftRows.filter((r) => r.status === 'ready').length
  const issueCount = draftRows.length - readyCount

  // ---- Render ----

  let body

  if (phase === 'input') {
    body = (
      <div style={{ maxWidth: 720 }}>
        <h2 className="serif-h h2">Bulk Import.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Paste a customer list or upload a CSV. Review every row before importing.
        </p>
        <hr className="rule-brass" style={{ margin: '20px 0' }} />

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="bulk-paste-area" className="eyebrow eyebrow-ink">
            PASTE CSV OR TAB-SEPARATED TEXT
          </label>
          <textarea
            id="bulk-paste-area"
            className="field"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'name,phone,email,address,notes\nSmith, John,815-555-0001,john@example.com,"123 Main St, Rockford"'}
            rows={8}
            style={{ marginTop: 8, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
          />
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 6 }}>
            Supports CSV and tab-separated (copy-paste from Excel or Sheets).
            Recognized columns: name, phone, email, address, notes, goal.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow eyebrow-ink">OR UPLOAD A CSV FILE</span>
          <div style={{ marginTop: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="bulk-file-picker"
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              Choose file…
            </button>
            {pasteText && (
              <span className="body-sm" style={{ marginLeft: 12, color: 'var(--slate)' }}>
                {pasteText.split('\n').filter((l) => l.trim()).length - 1} data rows loaded
              </span>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{errorMsg}</p>
          </div>
        )}

        <button type="button" className="btn btn-primary" onClick={handleParse} disabled={!pasteText.trim()}>
          Parse and review →
        </button>
      </div>
    )
  } else if (phase === 'review') {
    body = (
      <div style={{ maxWidth: 800 }}>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2 className="serif-h h2" style={{ margin: 0 }}>Review rows.</h2>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet" onClick={handleReset}>
            ← Start over
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span className="body-sm" style={{ color: 'var(--slate)' }}>
            {draftRows.length} rows parsed
          </span>
          {readyCount < draftRows.length && (
            <span className="body-sm" style={{ color: 'var(--ember-dark)' }}>
              · {issueCount} with issues
            </span>
          )}
          <span className="body-sm" style={{ color: 'var(--slate)' }}>
            · {selectedCount} selected
          </span>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-quiet" style={{ padding: '4px 10px' }} onClick={selectAll}>
            Select all importable
          </button>
          <button type="button" className="btn btn-quiet" style={{ padding: '4px 10px' }} onClick={deselectAll}>
            Deselect all
          </button>
        </div>

        {errorMsg && (
          <div className="card" style={{ padding: 12, margin: '12px 0', borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{errorMsg}</p>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          {draftRows.map((row) => {
            const disabled = row.status === 'missing-name'
            return (
              <ReviewRow
                key={row._id}
                row={row}
                checked={selected.has(row._id)}
                disabled={disabled}
                onToggle={toggleRow}
              />
            )
          })}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
          >
            {importing ? 'Importing…' : `Import ${selectedCount} selected`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={handleReset}>
            Start over
          </button>
        </div>
      </div>
    )
  } else {
    // result phase
    const { imported = [], errors = [] } = importResult || {}
    body = (
      <div style={{ maxWidth: 720 }}>
        <h2 className="serif-h h2">Import complete.</h2>
        <hr className="rule-brass" style={{ margin: '20px 0' }} />

        <div className="card-flat" style={{ padding: 18 }}>
          <p className="body-sm" style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {imported.length} Customer {imported.length === 1 ? 'File' : 'Files'} imported.
          </p>
          {errors.length > 0 && (
            <p className="body-sm" style={{ color: 'var(--ember-dark)', marginTop: 6 }}>
              {errors.length} row{errors.length === 1 ? '' : 's'} could not be imported.
            </p>
          )}
        </div>

        {imported.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {imported.map((file) => (
              <div
                key={file.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--stone-150)',
                  display: 'flex', gap: 10, alignItems: 'center',
                }}
              >
                <span className="source source-verified">IMPORTED</span>
                <span className="body-sm" style={{ color: 'var(--ink)' }}>
                  {file.customerName || 'Unnamed'}
                </span>
                {(file.customerPhone || file.customerEmail) && (
                  <span className="body-sm" style={{ color: 'var(--slate)' }}>
                    {[file.customerPhone, file.customerEmail].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="eyebrow eyebrow-ember" style={{ marginBottom: 6 }}>ERRORS</p>
            {errors.map((e, i) => (
              <p key={i} className="body-sm" style={{ color: 'var(--ember-dark)' }}>
                {e.draft && e.draft.customerName ? e.draft.customerName : `Row`}: {e.error}
              </p>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onOpenFilesList && (
            <button type="button" className="btn btn-primary" onClick={onOpenFilesList}>
              View Customer Files
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={handleReset}>
            Import more
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 40px', maxWidth: 1080, margin: '0 auto' }}>
          {body}
        </div>
      </div>
      <NextActionBar
        action={
          phase === 'result'
            ? 'Open a Customer File to add setup details or start Quote / Prep.'
            : 'Review every row before importing. Duplicates are flagged — skip or import deliberately.'
        }
        why="Imported files appear in Customer Files and Today. Nothing is sent. BisTrack is not touched."
        dontForget="Start a Visit for a walk-in customer — bulk import is for batching known contacts."
        primary={
          onBack ? (
            <button type="button" className="btn btn-quiet" onClick={onBack}>
              ← Back
            </button>
          ) : null
        }
      />
    </>
  )
}
