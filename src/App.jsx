import { useMemo, useRef, useState } from 'react'
import './App.css'
import {
  createEmptyFieldState,
  defaultFieldValues,
  getFieldLabel,
  multilineFields,
  sectionDefinitions,
} from './lib/fieldContract.js'
import { parseBisTrackText } from './lib/biztrackPdfParser.js'
import { extractOcrFromPdf, extractTextFromPdf } from './lib/pdfTextExtraction.js'
import { extractScannedBisTrackFields } from './lib/scannedPacketParser.js'
import CustomerProposal from './components/CustomerProposal.jsx'

const emptyContext = {
  unmatchedLines: [],
  deliveryDateMentioned: false,
  documentType: 'quote',
  outputLabel: 'Fireplace Project Proposal',
}

const PRIORITY_FIELDS = [
  'CUSTOMER_NAME',
  'CUSTOMER_PHONE',
  'INVOICE_ADDRESS_LINE_1',
  'INVOICE_CITY_STATE_ZIP',
  'PROJECT_ADDRESS_LINE_1',
  'PROJECT_CITY_STATE_ZIP',
  'QUOTE_NO',
  'QUOTE_DATE',
  'PROJECT_TITLE',
  'PROJECT_SCOPE_SUMMARY',
  'TOTAL_AMOUNT',
  'QUOTATION_TOTAL',
]

function applyDefaults(fields) {
  const next = { ...fields }
  for (const [key, value] of Object.entries(defaultFieldValues)) {
    if (!next[key]) next[key] = value
  }
  return next
}

function FieldInput({ field, value, onChange }) {
  const isMulti = multilineFields.has(field)
  const label = getFieldLabel(field)
  return (
    <label className={`bs-field ${isMulti ? 'bs-field--wide' : ''}`}>
      <span>{label}</span>
      {isMulti ? (
        <textarea rows={4} value={value} onChange={(event) => onChange(field, event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(field, event.target.value)} />
      )}
    </label>
  )
}

export default function App() {
  const emptyFields = useMemo(() => applyDefaults(createEmptyFieldState()), [])
  const [fields, setFields] = useState(emptyFields)
  const [parseContext, setParseContext] = useState(emptyContext)
  const [status, setStatus] = useState('Upload a BisTrack quote PDF to start. Scanned PDFs will be OCRed automatically.')
  const [busy, setBusy] = useState(false)
  const [rawText, setRawText] = useState('')
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(sectionDefinitions.map((section) => [section.key, true])),
  )
  const fileInputRef = useRef(null)

  function setField(field, value) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  function loadParsed(parsed) {
    setFields(applyDefaults({ ...createEmptyFieldState(), ...parsed.fields }))
    setParseContext({ ...emptyContext, ...parsed.context })
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      setStatus(`Reading ${file.name}…`)
      const extracted = await extractTextFromPdf(file)

      if (!extracted.embeddedTextLikelyMissing) {
        const parsed = parseBisTrackText(extracted.rawText)
        loadParsed(parsed)
        setRawText(extracted.rawText)
        const lineCount = parsed.lineItems?.length || 0
        setStatus(`Loaded ${file.name} — ${parsed.documentType?.toUpperCase() || 'QUOTE'}${parsed.fields.QUOTE_NO ? ` #${parsed.fields.QUOTE_NO}` : ''} (${lineCount} line item${lineCount === 1 ? '' : 's'}). Review and fill any blanks on the left.`)
      } else {
        setStatus(`Scanned PDF detected. Running OCR on ${extracted.pageCount} page${extracted.pageCount === 1 ? '' : 's'}… (this can take a minute)`)
        const ocr = await extractOcrFromPdf(file, {
          onProgress: (p) => {
            const action = p.stage === 'rendering' ? 'Rendering' : 'Reading'
            setStatus(`${action} page ${p.pageNumber} of ${p.pageCount}…`)
          },
        })
        const combinedText = ocr.pages.map((page) => page.text).join('\n\n')
        const parsed = extractScannedBisTrackFields(combinedText)
        loadParsed(parsed)
        setRawText(combinedText)
        const avgConfidence = Math.round(
          ocr.pages.reduce((sum, page) => sum + (page.confidence || 0), 0) / Math.max(ocr.pages.length, 1),
        )
        const populated = Object.values(parsed.fields).filter(Boolean).length
        setStatus(`OCR complete (avg confidence ${avgConfidence}%, ${populated} fields populated). Review every field on the left — scanned text often needs cleanup.`)
      }
    } catch (err) {
      setStatus(`Could not read PDF: ${err.message || err}`)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleClear() {
    setFields(emptyFields)
    setParseContext(emptyContext)
    setRawText('')
    setStatus('Cleared. Upload a PDF or fill the fields manually.')
  }

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }))
  }

  function sectionFillCount(section) {
    const filled = section.fields.filter((field) => fields[field]).length
    return `${filled}/${section.fields.length}`
  }

  return (
    <div className="bs-app">
      <header className="bs-header no-print">
        <div className="bs-header__brand">
          <span className="bs-header__eyebrow">Benson Stone</span>
          <strong>Fireplace Quote Polish</strong>
        </div>
        <div className="bs-header__actions">
          <label className={`bs-button bs-button--primary ${busy ? 'is-disabled' : ''}`}>
            {busy ? 'Working…' : 'Upload BisTrack PDF'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFile}
              disabled={busy}
              hidden
            />
          </label>
          <button type="button" className="bs-button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          <button type="button" className="bs-button bs-button--ghost" onClick={handleClear} disabled={busy}>
            Clear
          </button>
        </div>
      </header>

      <p className="bs-status no-print" role="status">{status}</p>

      <main className="bs-layout">
        <section className="bs-form no-print" aria-label="Quote fields">
          <div className="bs-form__group">
            <h2>Key fields</h2>
            <div className="bs-grid">
              {PRIORITY_FIELDS.map((field) => (
                <FieldInput key={field} field={field} value={fields[field]} onChange={setField} />
              ))}
            </div>
          </div>

          {rawText ? (
            <details className="bs-raw">
              <summary>Raw extracted text (use to spot-check or copy missing fields)</summary>
              <pre>{rawText}</pre>
            </details>
          ) : null}

          {sectionDefinitions.map((section) => (
            <div className="bs-form__group" key={section.key}>
              <button
                type="button"
                className="bs-section-toggle"
                onClick={() => toggleSection(section.key)}
                aria-expanded={openSections[section.key]}
              >
                <span>{section.label}</span>
                <span className="bs-section-meta">{sectionFillCount(section)} filled · {openSections[section.key] ? 'hide' : 'show'}</span>
              </button>
              {openSections[section.key] ? (
                <div className="bs-grid">
                  {section.fields.map((field) => (
                    <FieldInput key={field} field={field} value={fields[field]} onChange={setField} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </section>

        <section className="bs-preview" aria-label="Customer proposal preview">
          <CustomerProposal fields={fields} parseContext={parseContext} />
        </section>
      </main>
    </div>
  )
}
