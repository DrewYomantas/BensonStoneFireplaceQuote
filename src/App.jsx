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
import { evaluateCurrentSetup } from './lib/currentSetup.js'
import { extractOcrFromPdf, extractTextFromPdf } from './lib/pdfTextExtraction.js'
import { extractScannedBisTrackFields } from './lib/scannedPacketParser.js'
import {
  detectDetailedBreakdownRecommended,
  getEstimateBasisSummary,
  hasUnclassifiedLineItems,
} from './lib/proposalDetail.js'
import {
  buildQuotePolishQueueDraft,
  mergeQuotePolishOpportunity,
} from './lib/quotePolishOpportunity.js'
import {
  listOpportunities,
  saveOpportunity,
  updateOpportunity,
} from './lib/opportunities.js'
import CustomerProposal from './components/CustomerProposal.jsx'
import OldQuoteRecovery from './components/OldQuoteRecovery.jsx'
import QuoteSetupLens from './components/QuoteSetupLens.jsx'
import ShowroomDisplayPanel from './components/ShowroomDisplayPanel.jsx'
import ShowroomDisplayRegister from './components/ShowroomDisplayRegister.jsx'
import VendorPriceBooks from './components/VendorPriceBooks.jsx'
import { deriveShowroomDisplayContext, listDisplayRecords } from './lib/showroomDisplayRegister.js'
import { listVendors, matchVendorToQuote } from './lib/vendorPriceBooks.js'

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

function quoteAgeDays(value, now = new Date()) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

function ProposalReadinessReview({ reviewState, warnings, onChange }) {
  const hasWarnings = warnings.length > 0
  return (
    <section className="bs-readiness no-print" aria-label="Proposal readiness review">
      <div className="bs-readiness__head">
        <div>
          <p className="bs-lens__eyebrow">Proposal Readiness Review</p>
          <h2>Missing Info Review</h2>
        </div>
        <span className={`bs-readiness__status bs-readiness__status--${reviewState}`}>
          {reviewState === 'reviewed' ? 'Okay to Send' : reviewState === 'follow-up' ? 'Follow-Up Needed' : 'Unresolved'}
        </span>
      </div>
      {hasWarnings ? (
        <ul className="bs-readiness__warnings">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : (
        <p className="bs-readiness__clear">No detailed-mode send-readiness warnings detected.</p>
      )}
      <div className="bs-readiness__actions" aria-label="Internal review state">
        <button type="button" className={reviewState === 'unresolved' ? 'is-active' : ''} onClick={() => onChange('unresolved')}>
          Unresolved
        </button>
        <button type="button" className={reviewState === 'follow-up' ? 'is-active' : ''} onClick={() => onChange('follow-up')}>
          Follow-Up Questions, if needed
        </button>
        <button type="button" className={reviewState === 'reviewed' ? 'is-active' : ''} onClick={() => onChange('reviewed')}>
          Mark Reviewed / Okay to Send
        </button>
      </div>
    </section>
  )
}

function QuotePolishSavePanel({
  hasQuote,
  reviewState,
  proposalMode,
  lineItemQuoteAttached,
  onAttachmentChange,
  saveStatus,
  pendingDuplicate,
  onSave,
  onUpdateDuplicate,
  onSaveSeparate,
  onCancelDuplicate,
}) {
  if (!hasQuote) return null
  const reviewReady = reviewState !== 'unresolved'
  const readinessLabel = reviewState === 'reviewed'
    ? 'Proposal Ready'
    : reviewState === 'follow-up'
      ? 'Follow-Up Needed'
      : 'Review Before Follow-Up'

  return (
    <section className="bs-save-queue no-print" aria-label="Save reviewed quote to queue">
      <div className="bs-save-queue__head">
        <div>
          <p className="bs-lens__eyebrow">Quote Opportunity</p>
          <h2>Save Reviewed Quote</h2>
        </div>
        <span className={`bs-save-queue__pill ${reviewReady ? 'is-ready' : ''}`}>{readinessLabel}</span>
      </div>

      <div className="bs-save-queue__meta">
        <span>Proposal mode: {proposalMode === 'detailed' ? 'Detailed Investment Breakdown' : 'Warm Summary'}</span>
        <span>Source: Quote Polish / BisTrack PDF</span>
      </div>

      <label className="bs-save-queue__check">
        <input
          type="checkbox"
          checked={lineItemQuoteAttached}
          onChange={(event) => onAttachmentChange(event.target.checked)}
        />
        <span>Original BisTrack line-item quote will be attached.</span>
      </label>

      {!reviewReady ? (
        <p className="bs-save-queue__warning">Mark this quote as reviewed or follow-up needed before saving it to the queue.</p>
      ) : null}
      {!lineItemQuoteAttached ? (
        <p className="bs-save-queue__warning">Queue record will warn until the attached line-item quote is confirmed.</p>
      ) : null}

      {pendingDuplicate ? (
        <div className="bs-save-queue__duplicate">
          <p><strong>Possible duplicate found.</strong> {pendingDuplicate.duplicate.reasons.join(', ') || 'Existing queue record may match.'}</p>
          <div className="bs-save-queue__actions">
            <button type="button" className="bs-lens__copy" onClick={onUpdateDuplicate}>Update Existing</button>
            <button type="button" className="bs-lens__copy" onClick={onSaveSeparate}>Save Separate</button>
            <button type="button" className="bs-lens__copy bs-lens__copy--ghost" onClick={onCancelDuplicate}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="bs-button bs-button--primary bs-save-queue__button"
          onClick={onSave}
          disabled={!reviewReady}
        >
          Save Reviewed Quote to Queue
        </button>
      )}

      {saveStatus ? <p className="bs-save-queue__status" role="status">{saveStatus}</p> : null}
    </section>
  )
}

function buildSendReadinessWarnings({ fields, lineItems, proposalMode, setupGuidance }) {
  if (proposalMode !== 'detailed') return []
  const warnings = []
  if (hasUnclassifiedLineItems(lineItems)) warnings.push('Some line items need category review before sending.')
  if (getEstimateBasisSummary(lineItems, fields).fallbackUsed) warnings.push('Estimate basis is using the attached line-item quote fallback.')
  if (setupGuidance?.blockers?.length) warnings.push('Current setup or goal details need internal review before sending.')
  const age = quoteAgeDays(fields.QUOTE_DATE)
  if (age !== null && age > 90) warnings.push('Quote date is older than expected. Confirm pricing/source review before sending.')
  return warnings
}

export default function App() {
  const emptyFields = useMemo(() => applyDefaults(createEmptyFieldState()), [])
  const [mode, setMode] = useState('polish')
  const [fields, setFields] = useState(emptyFields)
  const [parseContext, setParseContext] = useState(emptyContext)
  const [status, setStatus] = useState('Upload a BisTrack quote PDF to start. Scanned PDFs will be OCRed automatically.')
  const [busy, setBusy] = useState(false)
  const [rawText, setRawText] = useState('')
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(sectionDefinitions.map((section) => [section.key, true])),
  )
  const [lineItems, setLineItems] = useState([])
  const [proposalMode, setProposalMode] = useState('summary')
  const [proposalReviewState, setProposalReviewState] = useState('unresolved')
  const [lineItemQuoteAttached, setLineItemQuoteAttached] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [pendingDuplicate, setPendingDuplicate] = useState(null)
  const setupGuidance = useMemo(() => evaluateCurrentSetup({ fields, parseContext }), [fields, parseContext])
  const detailedRecommended = useMemo(() => detectDetailedBreakdownRecommended(lineItems), [lineItems])
  const displayContext = deriveShowroomDisplayContext({
    displayRecords: listDisplayRecords(),
    fields,
    lineItems,
  })
  const matchedVendors = useMemo(
    () => matchVendorToQuote(listVendors(), { fields, lineItems }),
    [fields, lineItems],
  )
  const sendReadinessWarnings = useMemo(
    () => buildSendReadinessWarnings({ fields, lineItems, proposalMode, setupGuidance }),
    [fields, lineItems, proposalMode, setupGuidance],
  )
  const fileInputRef = useRef(null)

  function setField(field, value) {
    setFields((current) => ({ ...current, [field]: value }))
    setSaveStatus('')
    setPendingDuplicate(null)
  }

  function loadParsed(parsed) {
    setFields(applyDefaults({ ...createEmptyFieldState(), ...parsed.fields }))
    setParseContext({ ...emptyContext, ...parsed.context })
    setLineItems(parsed.lineItems || [])
    setProposalReviewState('unresolved')
    setLineItemQuoteAttached(false)
    setSaveStatus('')
    setPendingDuplicate(null)
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
        loadParsed({
          ...parsed,
          context: {
            ...parsed.context,
            sourceFileName: file.name,
            sourceImportedAt: new Date().toISOString(),
          },
        })
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
        loadParsed({
          ...parsed,
          context: {
            ...parsed.context,
            extractionSource: 'ocr',
            sourceFileName: file.name,
            sourceImportedAt: new Date().toISOString(),
          },
        })
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
    setLineItems([])
    setProposalReviewState('unresolved')
    setLineItemQuoteAttached(false)
    setSaveStatus('')
    setPendingDuplicate(null)
    setStatus('Cleared. Upload a PDF or fill the fields manually.')
  }

  function buildQueueDraft() {
    return buildQuotePolishQueueDraft({
      fields,
      parseContext,
      lineItems,
      proposalMode,
      proposalReviewState,
      lineItemQuoteAttached,
      setupGuidance,
      sendReadinessWarnings,
    }, listOpportunities())
  }

  function handleSaveToQueue() {
    if (proposalReviewState === 'unresolved') {
      setSaveStatus('Review this quote before saving it to the queue.')
      return
    }
    const draft = buildQueueDraft()
    if (draft.duplicate.isDuplicate) {
      setPendingDuplicate(draft)
      setSaveStatus('Possible duplicate found. Choose how to handle it before saving.')
      return
    }
    saveOpportunity(draft.opportunity)
    setPendingDuplicate(null)
    setSaveStatus('Saved to the opportunity queue.')
  }

  function handleUpdateDuplicate() {
    if (!pendingDuplicate) return
    const existing = listOpportunities().find((item) => item.id === pendingDuplicate.duplicate.duplicateId)
    const merged = mergeQuotePolishOpportunity(existing, pendingDuplicate.opportunity)
    updateOpportunity(merged.id, merged)
    setPendingDuplicate(null)
    setSaveStatus('Updated existing queue opportunity.')
  }

  function handleSaveSeparate() {
    if (!pendingDuplicate) return
    saveOpportunity({
      ...pendingDuplicate.opportunity,
      id: `${pendingDuplicate.opportunity.id}-queue-${Date.now()}`,
      warnings: [...pendingDuplicate.opportunity.warnings, 'Saved as separate opportunity after duplicate review.'],
    })
    setPendingDuplicate(null)
    setSaveStatus('Saved as a separate queue opportunity.')
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
          <strong>Fireplace Department</strong>
        </div>

        <nav className="bs-tabs no-print" aria-label="App mode">
          <button
            type="button"
            className={`bs-tab ${mode === 'polish' ? 'is-active' : ''}`}
            onClick={() => setMode('polish')}
          >
            Quote Polish
          </button>
          <button
            type="button"
            className={`bs-tab ${mode === 'recovery' ? 'is-active' : ''}`}
            onClick={() => setMode('recovery')}
          >
            Quote Recovery
          </button>
          <button
            type="button"
            className={`bs-tab ${mode === 'display' ? 'is-active' : ''}`}
            onClick={() => setMode('display')}
          >
            Display Register
          </button>
          <button
            type="button"
            className={`bs-tab ${mode === 'vendors' ? 'is-active' : ''}`}
            onClick={() => setMode('vendors')}
          >
            Vendors &amp; Price Books
          </button>
        </nav>

        {mode === 'polish' && (
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
        )}
      </header>

      {mode === 'polish' ? (
        <>
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

              <QuoteSetupLens guidance={setupGuidance} />
              <ShowroomDisplayPanel context={displayContext} title="Showroom Display Match" />
              {matchedVendors.length > 0 ? (
                <div className="bs-vb-quote-chip no-print">
                  <p className="bs-lens__eyebrow">Vendor price books</p>
                  <div className="bs-vb-quote-chip__list">
                    {matchedVendors.map((vendor) => (
                      <span key={vendor.id} className="bs-vb-quote-chip__item">
                        {vendor.name} — {vendor.priceListDate}
                      </span>
                    ))}
                  </div>
                  <p className="bs-vb-quote-chip__hint">See Vendors &amp; Price Books tab for file paths. Internal reference only.</p>
                </div>
              ) : null}

              <ProposalReadinessReview
                reviewState={proposalReviewState}
                warnings={sendReadinessWarnings}
                onChange={(value) => {
                  setProposalReviewState(value)
                  setSaveStatus('')
                  setPendingDuplicate(null)
                }}
              />

              <div className="bs-form__group no-print">
                <div className="bs-mode-selector">
                  <div className="bs-mode-selector__head">
                    <h2>Proposal format</h2>
                    {detailedRecommended && proposalMode !== 'detailed' ? (
                      <span className="bs-mode-recommend">Detailed breakdown recommended</span>
                    ) : null}
                  </div>
                  <div className="bs-mode-selector__buttons">
                    <button
                      type="button"
                      className={`bs-mode-btn ${proposalMode === 'summary' ? 'is-active' : ''}`}
                      onClick={() => setProposalMode('summary')}
                    >
                      Warm Summary
                    </button>
                    <button
                      type="button"
                      className={`bs-mode-btn ${proposalMode === 'detailed' ? 'is-active' : ''}`}
                      onClick={() => setProposalMode('detailed')}
                    >
                      Detailed Investment Breakdown
                    </button>
                  </div>
                </div>
              </div>

              <QuotePolishSavePanel
                hasQuote={Boolean(rawText || fields.QUOTE_NO || fields.CUSTOMER_NAME || lineItems.length)}
                reviewState={proposalReviewState}
                proposalMode={proposalMode}
                lineItemQuoteAttached={lineItemQuoteAttached}
                onAttachmentChange={(checked) => {
                  setLineItemQuoteAttached(checked)
                  setSaveStatus('')
                  setPendingDuplicate(null)
                }}
                saveStatus={saveStatus}
                pendingDuplicate={pendingDuplicate}
                onSave={handleSaveToQueue}
                onUpdateDuplicate={handleUpdateDuplicate}
                onSaveSeparate={handleSaveSeparate}
                onCancelDuplicate={() => {
                  setPendingDuplicate(null)
                  setSaveStatus('')
                }}
              />

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
              <CustomerProposal
                fields={fields}
                parseContext={parseContext}
                lineItems={lineItems}
                proposalMode={proposalMode}
                lineItemQuoteAttached={lineItemQuoteAttached}
              />
            </section>
          </main>
        </>
      ) : (
        mode === 'recovery'
          ? <OldQuoteRecovery />
          : mode === 'display'
            ? <ShowroomDisplayRegister />
            : <VendorPriceBooks />
      )}
    </div>
  )
}
