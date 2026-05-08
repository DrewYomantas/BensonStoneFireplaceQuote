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

// ---- Compact ready row (one line) ------------------------------------------

function ReadyRow({ row, checked, onToggle }) {
  const contact = [row.customerPhone, row.customerEmail].filter(Boolean).join(' · ')
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 0',
        borderBottom: '1px solid var(--stone-150)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(row._id)}
        style={{ flexShrink: 0, accentColor: 'var(--brass)', width: 16, height: 16 }}
        aria-label={`Select ${row.customerName} for import`}
      />
      <span
        className="body-sm"
        style={{
          fontWeight: 600, color: 'var(--ink)',
          flex: '0 0 200px', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {row.customerName}
      </span>
      <span className="body-sm" style={{ color: 'var(--slate)', flex: 1, minWidth: 0 }}>
        {contact}
      </span>
    </div>
  )
}

// ---- Issue row (needs a decision) ------------------------------------------

function IssueRow({ row, checked, disabled, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--stone-150)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(row._id)}
        style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--brass)', width: 16, height: 16 }}
        aria-label={`Select ${row.customerName || 'row ' + row._row} for import`}
      />
      <div style={{ flex: 1 }}>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {row.customerName || <span style={{ color: 'var(--slate-soft)' }}>(no name — row {row._row})</span>}
          </span>
          <StatusBadge status={row.status} />
        </div>
        {(row.customerPhone || row.customerEmail) && (
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
            {[row.customerPhone, row.customerEmail].filter(Boolean).join(' · ')}
          </p>
        )}
        {row.duplicateInfo && (
          <p className="body-sm" style={{ color: 'var(--ember-dark)', marginTop: 2 }}>
            {row.duplicateInfo.kind === 'phone' && 'Existing file has the same phone — skip or import deliberately.'}
            {row.duplicateInfo.kind === 'email' && 'Existing file has the same email — skip or import deliberately.'}
            {row.duplicateInfo.kind === 'name' && 'Same name already exists — may be the same person.'}
          </p>
        )}
        {row.status === 'missing-name' && (
          <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 2 }}>Cannot import without a name.</p>
        )}
        {row.status === 'missing-contact' && (
          <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 2 }}>No phone or email — will be harder to follow up.</p>
        )}
      </div>
    </div>
  )
}

// ---- Default selection logic -----------------------------------------------

function defaultSelected(rows) {
  const s = new Set()
  for (const row of rows) {
    if (row.status === 'missing-name') continue
    if (row.status === 'duplicate') continue
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
  const [extracting, setExtracting] = useState(false)
  const [fileName, setFileName] = useState('')
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
        // best-effort: duplicate detection gets no existing files
      }
    })()
  }, [])

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    e.target.value = ''
    setErrorMsg('')

    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      setErrorMsg('Excel files cannot be read directly. In Excel: File → Save As → CSV (.csv), then upload the CSV.')
      return
    }

    if (ext === 'pdf') {
      setFileName(file.name)
      setExtracting(true)
      try {
        const { extractTextFromPdf } = await import('../lib/pdfTextExtraction.js')
        const { rawText, embeddedTextLikelyMissing } = await extractTextFromPdf(file)
        if (embeddedTextLikelyMissing) {
          setErrorMsg('This PDF appears to be an image scan with no readable text. Export your list as CSV instead.')
          setFileName('')
        } else {
          setPasteText(rawText)
        }
      } catch (err) {
        setErrorMsg('Could not read PDF: ' + (err.message || 'Unknown error'))
        setFileName('')
      } finally {
        setExtracting(false)
      }
      return
    }

    // CSV / TSV / TXT
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => setPasteText(ev.target.result || '')
    reader.readAsText(file)
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
      if (result.imported.length > 0) {
        setExistingFiles((prev) => [...prev, ...result.imported])
      }
      setPhase('result')
    } catch (err) {
      setErrorMsg(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleReset() {
    setPasteText('')
    setFileName('')
    setDraftRows([])
    setSelected(new Set())
    setImportResult(null)
    setErrorMsg('')
    setPhase('input')
  }

  const selectedCount = draftRows.filter((r) => selected.has(r._id)).length

  // ---- Render ----

  let body

  if (phase === 'input') {
    const rowsLoaded = pasteText.trim()
      ? pasteText.split('\n').filter((l) => l.trim()).length - 1
      : 0

    body = (
      <div style={{ maxWidth: 720 }}>
        <h2 className="serif-h h2">Bulk Import.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Paste a customer list, upload a CSV, or upload a PDF. Review every row before importing.
        </p>
        <hr className="rule-brass" style={{ margin: '20px 0' }} />

        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow eyebrow-ink">UPLOAD A FILE</span>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="bulk-file-picker"
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={extracting}
            >
              {extracting ? 'Reading PDF…' : 'Choose file…'}
            </button>
            {extracting && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>Extracting text — this may take a moment…</span>
            )}
            {!extracting && fileName && (
              <span className="body-sm" style={{ color: 'var(--brass)' }}>{fileName}</span>
            )}
            {!extracting && !fileName && rowsLoaded > 0 && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>
                {rowsLoaded} data row{rowsLoaded === 1 ? '' : 's'} loaded
              </span>
            )}
          </div>
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 6 }}>
            CSV, TSV, TXT, or PDF (text-based). Recognized columns: name, phone, email, address, notes, goal.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="bulk-paste-area" className="eyebrow eyebrow-ink">
            OR PASTE CSV / TAB-SEPARATED TEXT
          </label>
          <textarea
            id="bulk-paste-area"
            className="field"
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setFileName('') }}
            placeholder={'name,phone,email,address,notes\nSmith, John,815-555-0001,john@example.com,"123 Main St, Rockford"'}
            rows={6}
            style={{ marginTop: 8, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
          />
        </div>

        {errorMsg && (
          <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{errorMsg}</p>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleParse}
          disabled={!pasteText.trim() || extracting}
        >
          Parse and review →
        </button>
      </div>
    )
  } else if (phase === 'review') {
    const issueRows = draftRows.filter((r) => r.status !== 'ready')
    const readyRows = draftRows.filter((r) => r.status === 'ready')

    body = (
      <div style={{ maxWidth: 800 }}>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2 className="serif-h h2" style={{ margin: 0 }}>Review rows.</h2>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet" onClick={handleReset}>
            ← Start over
          </button>
        </div>

        {/* Summary + selection controls */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span className="body-sm" style={{ color: 'var(--slate)' }}>{draftRows.length} rows parsed</span>
          {readyRows.length > 0 && (
            <span className="body-sm" style={{ color: 'var(--brass)' }}>
              · {readyRows.length} ready
            </span>
          )}
          {issueRows.length > 0 && (
            <span className="body-sm" style={{ color: 'var(--ember-dark)' }}>
              · {issueRows.length} {issueRows.length === 1 ? 'needs a decision' : 'need a decision'}
            </span>
          )}
          <span className="body-sm" style={{ color: 'var(--slate)' }}>· {selectedCount} selected</span>
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

        {/* Issues — grouped at top for quick decisions */}
        {issueRows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <span className="eyebrow eyebrow-ember">
              NEEDS A DECISION ({issueRows.length})
            </span>
            <div style={{ marginTop: 6 }}>
              {issueRows.map((row) => (
                <IssueRow
                  key={row._id}
                  row={row}
                  checked={selected.has(row._id)}
                  disabled={row.status === 'missing-name'}
                  onToggle={toggleRow}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ready rows — compact, one line each */}
        {readyRows.length > 0 && (
          <div style={{ marginTop: issueRows.length > 0 ? 20 : 16 }}>
            <span className="eyebrow eyebrow-ink">READY TO IMPORT ({readyRows.length})</span>
            <div style={{ marginTop: 6 }}>
              {readyRows.map((row) => (
                <ReadyRow
                  key={row._id}
                  row={row}
                  checked={selected.has(row._id)}
                  onToggle={toggleRow}
                />
              ))}
            </div>
          </div>
        )}

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
    // result phase — summary only, no row sprawl
    const { imported = [], errors = [] } = importResult || {}
    body = (
      <div style={{ maxWidth: 560 }}>
        <h2 className="serif-h h2">Import complete.</h2>
        <hr className="rule-brass" style={{ margin: '16px 0' }} />

        <div className="card-flat" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--brass)', lineHeight: 1.1, margin: 0 }}>
            {imported.length}
          </p>
          <p className="body-sm" style={{ color: 'var(--ink)', marginTop: 6, fontWeight: 600 }}>
            Customer {imported.length === 1 ? 'File' : 'Files'} imported
          </p>
          {errors.length > 0 && (
            <p className="body-sm" style={{ color: 'var(--ember-dark)', marginTop: 8 }}>
              {errors.length} row{errors.length === 1 ? '' : 's'} could not be imported
            </p>
          )}
        </div>

        {errors.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <span className="eyebrow eyebrow-ember">ERRORS</span>
            <div style={{ marginTop: 6 }}>
              {errors.map((e, i) => (
                <p key={i} className="body-sm" style={{ color: 'var(--ember-dark)', padding: '3px 0' }}>
                  {e.draft?.customerName || `Row ${i + 1}`}: {e.error}
                </p>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onOpenFilesList && (
            <button type="button" className="btn btn-primary" onClick={onOpenFilesList}>
              View Customer Files →
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
            ? 'Open Customer Files to start a visit or add setup details.'
            : 'Issues are grouped at the top. Decide on each, then import the rest.'
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
