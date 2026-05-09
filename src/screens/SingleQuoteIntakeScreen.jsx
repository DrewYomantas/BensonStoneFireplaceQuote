import { useEffect, useRef, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import {
  buildScannedCustomerDraft,
  detectScannedDraftWarnings,
  commitSingleQuoteIntakeDraft,
} from '../lib/scannedCustomerDraft.js'
import { detectDocType, DOC_TYPE_LABELS } from '../lib/scanDocTypeDetector.js'

const PHASE = Object.freeze({
  idle: 'idle',
  reading: 'reading',
  ready: 'ready',
  saving: 'saving',
  error: 'error',
})

const EMPTY_FIELDS = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  projectAddress: '',
  quoteNumber: '',
  quoteDate: '',
  notes: '',
}

function FieldRow({ label, value, onChange, placeholder, type = 'text', autoComplete = 'off' }) {
  const id = `sqi-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <label htmlFor={id} style={{ display: 'block', marginTop: 12 }}>
      <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>{label.toUpperCase()}</span>
      <input
        id={id}
        type={type}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ''}
        autoComplete={autoComplete}
        style={{ marginTop: 6, width: '100%' }}
      />
    </label>
  )
}

function NotesRow({ value, onChange }) {
  return (
    <label htmlFor="sqi-notes" style={{ display: 'block', marginTop: 12 }}>
      <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>NOTES</span>
      <textarea
        id="sqi-notes"
        className="field"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Anything you want on the file. Internal."
        style={{ marginTop: 6, width: '100%' }}
      />
    </label>
  )
}

export default function SingleQuoteIntakeScreen({
  onCustomerFileCreated,
  onOpenBatchCleanup,
  onBack,
}) {
  const fileInputRef = useRef(null)
  const [phase, setPhase] = useState(PHASE.idle)
  const [progressLabel, setProgressLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [previewDataUrl, setPreviewDataUrl] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [detectedDocType, setDetectedDocType] = useState('')
  const [sourceFileName, setSourceFileName] = useState('')
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [warnings, setWarnings] = useState([])
  const [templateHint, setTemplateHint] = useState('')

  // Cleanup preview blob URL on unmount or replacement.
  useEffect(() => () => { setPreviewDataUrl('') }, [])

  function resetAll() {
    setPhase(PHASE.idle)
    setProgressLabel('')
    setErrorMsg('')
    setPreviewDataUrl('')
    setPageCount(0)
    setDetectedDocType('')
    setSourceFileName('')
    setFields(EMPTY_FIELDS)
    setWarnings([])
    setTemplateHint('')
  }

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleFile(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setPhase(PHASE.error)
      setErrorMsg('Only PDF quotes are supported here. For images or messy packets, use Old Quote Batch Cleanup.')
      return
    }
    setSourceFileName(file.name)
    setPhase(PHASE.reading)
    setProgressLabel('Reading PDF…')
    setErrorMsg('')
    setPreviewDataUrl('')
    setPageCount(0)
    setDetectedDocType('')
    setFields(EMPTY_FIELDS)
    setWarnings([])
    setTemplateHint('')

    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) throw new Error(ready.error || 'Storage unavailable')
      const storage = getSalesOsStorage()
      const existingFiles = await listCustomerFilesDurable(storage)

      const {
        extractTextFromPdf,
        extractOcrFromPdf,
        renderSinglePdfPage,
      } = await import('../lib/pdfTextExtraction.js')

      // Always render page 1 preview first so the user sees something fast.
      setProgressLabel('Rendering page 1…')
      const dataUrl = await renderSinglePdfPage(file, 1, { scale: 1.5 })
      setPreviewDataUrl(dataUrl)

      setProgressLabel('Looking for embedded text…')
      const { rawText, embeddedTextLikelyMissing, pageCount: pages } =
        await extractTextFromPdf(file)
      setPageCount(pages)

      let text = rawText
      if (embeddedTextLikelyMissing) {
        setProgressLabel('Scanned PDF — running OCR on page 1…')
        const ocrResult = await extractOcrFromPdf(file, { maxPages: 1 })
        text = ocrResult.rawText || ''
      }

      const docType = detectDocType(text)
      setDetectedDocType(docType)

      // Benson quote layout → use zone reader for cleaner field extraction.
      let draftFields = null
      let draftWarnings = []
      let hint = ''
      if (docType === 'benson_quote' && embeddedTextLikelyMissing) {
        try {
          setProgressLabel('Reading quote zones…')
          const { extractBensonQuoteZoneTexts, buildBensonQuoteDraftFromZones } =
            await import('../lib/bensonQuoteTemplateReader.js')
          const { createWorker } = await import('tesseract.js')
          const worker = await createWorker('eng')
          try {
            const zoneTexts = await extractBensonQuoteZoneTexts(dataUrl, worker)
            const zoneResult = buildBensonQuoteDraftFromZones(zoneTexts, { existingFiles })
            draftFields = zoneResult.fields
            draftWarnings = zoneResult.warnings
            hint = zoneResult.templateHint || ''
          } finally {
            await worker.terminate()
          }
        } catch {
          // Fall through to whole-text extraction below.
        }
      }

      if (!draftFields) {
        const built = buildScannedCustomerDraft(text, { existingFiles })
        draftFields = built.fields
        draftWarnings = built.warnings
      }

      setFields({
        customerName: draftFields.customerName || '',
        customerPhone: draftFields.customerPhone || '',
        customerEmail: draftFields.customerEmail || '',
        projectAddress: draftFields.projectAddress || '',
        quoteNumber: draftFields.quoteNumber || '',
        quoteDate: draftFields.quoteDate || '',
        notes: '',
      })
      setWarnings(draftWarnings)
      setTemplateHint(hint)
      setProgressLabel('')
      setPhase(PHASE.ready)
    } catch (err) {
      setPhase(PHASE.error)
      setErrorMsg(err && err.message ? err.message : 'Could not read this PDF.')
      setProgressLabel('')
    }
  }

  function onPickFile(e) {
    const f = e.target.files && e.target.files[0]
    if (f) handleFile(f)
    // Allow re-picking the same filename
    if (e.target) e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function onDragOver(e) {
    e.preventDefault()
  }

  async function handleCreate() {
    if (!fields.customerName.trim()) {
      setErrorMsg('Add a customer name before creating the file.')
      return
    }
    setPhase(PHASE.saving)
    setErrorMsg('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) throw new Error(ready.error || 'Storage unavailable')
      const storage = getSalesOsStorage()
      const file = await commitSingleQuoteIntakeDraft({
        fields,
        sourceFileName,
        detectedDocType,
        pageCount,
        storage,
      })
      if (onCustomerFileCreated) onCustomerFileCreated(file)
    } catch (err) {
      setPhase(PHASE.ready)
      setErrorMsg(err && err.message ? err.message : 'Could not create the file.')
    }
  }

  const liveWarnings = (() => {
    if (phase !== PHASE.ready) return warnings
    return detectScannedDraftWarnings(fields, [])
  })()

  const docTypeLabel = detectedDocType ? (DOC_TYPE_LABELS[detectedDocType] || '') : ''

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px', maxWidth: 980, margin: '0 auto' }}>
          <h2 className="serif-h h2">Add Quote PDF.</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            Drop in one quote PDF. Review what we found, then create a Customer File.
          </p>
          <hr className="rule-brass" style={{ margin: '20px 0' }} />

          {phase === PHASE.idle && (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              className="card-flat"
              style={{
                padding: 28, textAlign: 'center',
                border: '2px dashed var(--rule)', borderRadius: 8,
              }}
            >
              <p className="body-lg" style={{ marginBottom: 12 }}>
                Drop a quote PDF here, or pick one from this tablet.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={onPickFile}
                style={{ display: 'none' }}
                id="sqi-file-input"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                Choose a PDF
              </button>
              <p className="body-sm" style={{ marginTop: 12, color: 'var(--slate)' }}>
                One quote, one customer. For older packets with many quotes mixed together,
                use <em>Old Quote Batch Cleanup</em>.
              </p>
            </div>
          )}

          {phase === PHASE.reading && (
            <div className="card" style={{ padding: 18 }}>
              <span className="eyebrow eyebrow-ember">READING</span>
              <p className="body" style={{ marginTop: 8 }}>{progressLabel || 'Working…'}</p>
              <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                The PDF stays on this tablet. Nothing is uploaded.
              </p>
            </div>
          )}

          {phase === PHASE.error && (
            <div className="card" style={{ padding: 18, borderLeft: '3px solid var(--ember)' }}>
              <span className="eyebrow eyebrow-ember">COULD NOT READ</span>
              <p className="body" style={{ marginTop: 8 }}>{errorMsg}</p>
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-quiet" onClick={resetAll}>
                  Start over
                </button>
                {onOpenBatchCleanup && (
                  <button type="button" className="btn btn-quiet" onClick={onOpenBatchCleanup}>
                    Open Old Quote Batch Cleanup
                  </button>
                )}
              </div>
            </div>
          )}

          {(phase === PHASE.ready || phase === PHASE.saving) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
              <section className="card" style={{ padding: 14 }}>
                <span className="eyebrow eyebrow-ink">QUOTE PREVIEW</span>
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt={`Page 1 preview of ${sourceFileName || 'uploaded quote'}`}
                    style={{ marginTop: 10, width: '100%', height: 'auto', display: 'block', border: '1px solid var(--rule)' }}
                  />
                ) : (
                  <p className="body-sm" style={{ marginTop: 10, color: 'var(--slate)' }}>
                    Page preview not available.
                  </p>
                )}
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sourceFileName && (
                    <span className="body-sm" style={{ color: 'var(--slate)' }}>{sourceFileName}</span>
                  )}
                  {pageCount > 0 && (
                    <span className="body-sm" style={{ color: 'var(--slate)' }}>
                      {pageCount} page{pageCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {docTypeLabel && (
                    <span className="source source-manual">{docTypeLabel.toUpperCase()}</span>
                  )}
                </div>
                {pageCount > 1 && (
                  <p className="body-sm" style={{ marginTop: 10, color: 'var(--slate)' }}>
                    This PDF has additional pages. They can be reviewed later in
                    Old Quote Batch Cleanup.
                  </p>
                )}
                {templateHint && (
                  <p className="body-sm" style={{ marginTop: 8, color: 'var(--slate)' }}>{templateHint}</p>
                )}
              </section>

              <section className="card" style={{ padding: 18 }}>
                <span className="eyebrow eyebrow-ember">WE FOUND THIS ON THE QUOTE</span>
                <p className="body-sm" style={{ marginTop: 6, color: 'var(--slate)' }}>
                  Review before creating the file. Anything blank or wrong can be edited here.
                </p>

                <FieldRow
                  label="Name"
                  value={fields.customerName}
                  onChange={(v) => setField('customerName', v)}
                  placeholder="Customer name"
                  autoComplete="name"
                />
                <FieldRow
                  label="Phone"
                  value={fields.customerPhone}
                  onChange={(v) => setField('customerPhone', v)}
                  placeholder="(555) 555-5555"
                  type="tel"
                  autoComplete="tel"
                />
                <FieldRow
                  label="Email"
                  value={fields.customerEmail}
                  onChange={(v) => setField('customerEmail', v)}
                  placeholder="customer@example.com"
                  type="email"
                  autoComplete="email"
                />
                <FieldRow
                  label="Address"
                  value={fields.projectAddress}
                  onChange={(v) => setField('projectAddress', v)}
                  placeholder="Project address"
                  autoComplete="street-address"
                />
                <FieldRow
                  label="Quote number"
                  value={fields.quoteNumber}
                  onChange={(v) => setField('quoteNumber', v)}
                  placeholder="e.g. 12345"
                />
                <FieldRow
                  label="Quote date"
                  value={fields.quoteDate}
                  onChange={(v) => setField('quoteDate', v)}
                  placeholder="MM/DD/YYYY"
                />
                <NotesRow value={fields.notes} onChange={(v) => setField('notes', v)} />

                {liveWarnings.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="eyebrow eyebrow-ember">NEEDS REVIEW</span>
                    <ul className="body-sm" style={{ marginTop: 6, paddingLeft: 18 }}>
                      {liveWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {errorMsg && phase !== PHASE.error && (
                  <p className="body-sm" style={{ marginTop: 10, color: 'var(--ember)' }}>{errorMsg}</p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
      <NextActionBar
        action={
          phase === PHASE.idle
            ? 'Drop in one quote PDF to start a Customer File.'
            : phase === PHASE.reading
              ? 'Reading the PDF — this stays local.'
              : phase === PHASE.ready
                ? 'Review the fields, then create the Customer File.'
                : phase === PHASE.saving
                  ? 'Creating the Customer File…'
                  : 'Try a different PDF, or use Old Quote Batch Cleanup.'
        }
        why="One PDF, one customer. Keeps daily intake fast."
        dontForget="The original BisTrack PDF is still the canonical pricing document."
        primary={
          phase === PHASE.ready || phase === PHASE.saving ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={phase === PHASE.saving || !fields.customerName.trim()}
            >
              {phase === PHASE.saving ? 'Creating…' : 'Create Customer File'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={phase === PHASE.reading}
            >
              Choose a PDF
            </button>
          )
        }
        secondary={
          <>
            {phase !== PHASE.idle && phase !== PHASE.reading && (
              <button type="button" className="btn btn-quiet" onClick={resetAll}>
                Start over
              </button>
            )}
            {onOpenBatchCleanup && (
              <button type="button" className="btn btn-quiet" onClick={onOpenBatchCleanup}>
                Open Batch Cleanup instead
              </button>
            )}
            {onBack && (
              <button type="button" className="btn btn-quiet" onClick={onBack}>
                ← Back
              </button>
            )}
          </>
        }
      />
    </>
  )
}
