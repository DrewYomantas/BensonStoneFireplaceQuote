import { useMemo, useState } from 'react'
import './App.css'
import annaSampleNotes from './data/anna-orlinska-notes.txt?raw'
import {
  copyGroups,
  createEmptyFieldState,
  getFieldLabel,
  orderedFields,
  sectionDefinitions,
} from './lib/fieldContract.js'
import {
  buildAudit,
  fieldsToExportLines,
  getFieldStatusClass,
  mergeAssignedValue,
  parseNotes,
} from './lib/parser.js'
import { parseBisTrackText } from './lib/biztrackPdfParser.js'
import { extractOcrFromPdf, extractTextFromPdf } from './lib/pdfTextExtraction.js'
import { buildScannedPacket } from './lib/scannedPacketParser.js'
import CustomerProposal from './components/CustomerProposal.jsx'

const workflowSteps = [
  { number: 1, label: 'Paste Notes', anchor: 'step-1' },
  { number: 2, label: 'Review Warnings', anchor: 'step-2' },
  { number: 3, label: 'Edit Proposal Fields', anchor: 'step-3' },
  { number: 4, label: 'Copy / Export', anchor: 'step-4' },
  { number: 5, label: 'Preview', anchor: 'step-5' },
]

function copyText(text) {
  return navigator.clipboard.writeText(text)
}

function downloadJson(fields) {
  const blob = new Blob([JSON.stringify(fields, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'benson-stone-quote-fields.json'
  link.click()
  URL.revokeObjectURL(url)
}

function getWarningCount(parseResult) {
  return (parseResult.warnings?.length || 0) + (parseResult.context?.unmatchedLines?.length || 0)
}

function getBatchStatus(parseResult, auditResult, embeddedTextLikelyMissing) {
  if (!parseResult) return 'Failed'
  if (embeddedTextLikelyMissing || parseResult.extractionConfidence === 'low') return 'Needs Review'
  if (parseResult.documentType === 'unknown') return 'Needs Review'
  if (getWarningCount(parseResult) > 0) return 'Needs Review'
  if (auditResult?.blockingFields?.length) return 'Needs Review'
  return 'Ready'
}

function buildBatchSummary(parseResult, auditResult, embeddedTextLikelyMissing) {
  return {
    fileName: '',
    status: getBatchStatus(parseResult, auditResult, embeddedTextLikelyMissing),
    documentType: parseResult.documentType || 'unknown',
    customerName: parseResult.fields.CUSTOMER_NAME || '',
    documentNumber: parseResult.fields.QUOTE_NO || '',
    documentDate: parseResult.fields.QUOTE_DATE || '',
    total: parseResult.fields.QUOTATION_TOTAL || parseResult.fields.TOTAL_AMOUNT || '',
    balanceDue: parseResult.fields.BALANCE_DUE || '',
    confidence: parseResult.extractionConfidence || 'low',
    warningCount: getWarningCount(parseResult) + (auditResult?.blockingFields?.length || 0),
  }
}

function getStatusClass(status) {
  return status.toLowerCase().replace(/\s+/g, '-')
}


function packageRows(packageNumber) {
  return Array.from({ length: 4 }, (_, index) => index + 1).map((number) => ({
    item: `PACKAGE_${packageNumber}_ITEM_${number}`,
    price: `PACKAGE_${packageNumber}_PRICE_${number}`,
  }))
}

function detailRows(detailNumber) {
  return Array.from({ length: 9 }, (_, index) => index + 1).map((number) => ({
    item: `DETAIL_${detailNumber}_ITEM_${number}`,
    qty: `DETAIL_${detailNumber}_QTY_${number}`,
    unit: `DETAIL_${detailNumber}_UNIT_PRICE_${number}`,
    total: `DETAIL_${detailNumber}_TOTAL_${number}`,
  }))
}

function scrollToStep(anchor, stepNumber, setCurrentStep) {
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  setCurrentStep(stepNumber)
}

function renderTextBlock(value, emptyText) {
  if (!value) {
    return <p className="preview-placeholder">{emptyText}</p>
  }

  return value.split('\n').map((line) => (
    <p key={`${emptyText}-${line}`}>{line}</p>
  ))
}

function getSectionFieldLayout(sectionKey) {
  if (sectionKey === 'customer' || sectionKey === 'quote_meta') {
    return 'basic-grid'
  }
  if (sectionKey === 'project_copy' || sectionKey === 'investment_and_acceptance') {
    return 'mixed-grid'
  }
  if (sectionKey === 'package_1' || sectionKey === 'package_2') {
    return 'package'
  }
  return 'detail'
}

function Field({ field, fields, sources, onChange }) {
  return (
    <label className={`field ${getFieldStatusClass(sources[field])}`}>
      <span>{getFieldLabel(field)}</span>
      <input value={fields[field]} onChange={(event) => onChange(field, event.target.value)} />
    </label>
  )
}

function MultiLineField({ field, fields, sources, onChange, rows = 4 }) {
  return (
    <label className={`field field--wide ${getFieldStatusClass(sources[field])}`}>
      <span>{getFieldLabel(field)}</span>
      <textarea
        rows={rows}
        value={fields[field]}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  )
}

function App() {
  const emptyFields = useMemo(() => createEmptyFieldState(), [])
  const emptySources = useMemo(
    () => Object.fromEntries(orderedFields.map((field) => [field, 'blank'])),
    [],
  )

  const [rawNotes, setRawNotes] = useState('')
  const [fields, setFields] = useState(emptyFields)
  const [sources, setSources] = useState(emptySources)
  const [parseContext, setParseContext] = useState({
    unmatchedLines: [],
    deliveryDateMentioned: false,
    documentType: 'notes',
    outputLabel: 'Fireplace Project Proposal',
  })
  const [inputMode, setInputMode] = useState('notes')
  const [pdfFileName, setPdfFileName] = useState('')
  const [pdfStatus, setPdfStatus] = useState('')
  const [pdfRawText, setPdfRawText] = useState('')
  const [pdfLineItems, setPdfLineItems] = useState([])
  const [pdfExtractionConfidence, setPdfExtractionConfidence] = useState('')
  const [batchFiles, setBatchFiles] = useState([])
  const [bulkStatus, setBulkStatus] = useState('')
  const [customerPdfSnapshot, setCustomerPdfSnapshot] = useState(null)
  const [showCustomerPdf, setShowCustomerPdf] = useState(false)
  const [includeDeliveryDate, setIncludeDeliveryDate] = useState(false)
  const [audit, setAudit] = useState(buildAudit(emptyFields, emptySources, parseContext))
  const [copyState, setCopyState] = useState('')
  const [parsedOnce, setParsedOnce] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [sectionOverrides, setSectionOverrides] = useState({})
  const [assignmentTargets, setAssignmentTargets] = useState({})
  const [scannedPages, setScannedPages] = useState([])
  const [scannedStatus, setScannedStatus] = useState('')
  const [scannedFile, setScannedFile] = useState(null)
  const [scannedReady, setScannedReady] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(null)
  const [ocrDetailsPage, setOcrDetailsPage] = useState(null)
  const [ocrReviewConfirmed, setOcrReviewConfirmed] = useState(false)

  const exportJson = JSON.stringify(fields, null, 2)
  const exportLines = fieldsToExportLines(fields)

  const sectionStatus = useMemo(() => {
    return Object.fromEntries(
      sectionDefinitions.map((section) => {
        const missingCount = section.fields.filter((field) => fields[field] === '').length
        const warningCount = audit.sectionWarnings[section.key]?.length || 0
        return [
          section.key,
          {
            missingCount,
            warningCount,
            complete: missingCount === 0 && warningCount === 0,
          },
        ]
      }),
    )
  }, [audit.sectionWarnings, fields])

  const assignmentOptions = useMemo(() => {
    const blanks = orderedFields.filter((field) => fields[field] === '')
    const filled = orderedFields.filter((field) => fields[field] !== '')
    return [...blanks, ...filled]
  }, [fields])

  function syncState(nextFields, nextSources, nextContext, nextStep = currentStep) {
    const nextAudit = buildAudit(nextFields, nextSources, nextContext)
    setFields(nextFields)
    setSources(nextSources)
    setParseContext(nextContext)
    setAudit(nextAudit)
    setCurrentStep(nextStep)
  }

  async function parsePdfFile(file) {
    const extracted = await extractTextFromPdf(file)
    const parsed = parseBisTrackText(extracted.rawText)
    if (extracted.embeddedTextLikelyMissing && !parsed.warnings.some((w) => /scanned/i.test(w))) {
      parsed.warnings.unshift('This Epicor BisTrack PDF looks scanned or image-based. Embedded text is missing or very sparse — review extracted fields carefully.')
    }
    const parsedAudit = buildAudit(parsed.fields, parsed.sources, parsed.context)
    const summary = buildBatchSummary(parsed, parsedAudit, extracted.embeddedTextLikelyMissing)
    return {
      id: `${file.name}-${file.lastModified}-${file.size}`,
      fileName: file.name,
      parsed,
      audit: parsedAudit,
      rawText: extracted.rawText,
      lineItems: parsed.lineItems,
      embeddedTextLikelyMissing: extracted.embeddedTextLikelyMissing,
      pageCount: extracted.pageCount,
      ...summary,
      fileName: file.name,
    }
  }

  function loadParsedPdfResult(item, message = 'BisTrack PDF loaded into review fields') {
    setPdfFileName(item.fileName)
    setPdfRawText(item.rawText || item.parsed?.context?.rawText || '')
    setPdfLineItems(item.lineItems || item.parsed?.lineItems || [])
    setPdfExtractionConfidence(item.confidence || item.parsed?.extractionConfidence || '')
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    setPdfStatus(`Loaded — ${item.documentType === 'unknown' ? 'unknown type' : item.documentType.toUpperCase()}${item.documentNumber ? ` ${item.documentNumber}` : ''} (${(item.lineItems || []).length} line item${(item.lineItems || []).length === 1 ? '' : 's'})`)
    syncState(item.parsed.fields, item.parsed.sources, item.parsed.context, 2)
    setCopyState(message)
  }

  function openCustomerPdf(snapshotFields = fields, snapshotContext = parseContext) {
    if (snapshotContext.extractionSource === 'ocr' && !ocrReviewConfirmed) {
      setCopyState('OCR source — confirm review in Step 2 before generating a customer-facing PDF')
      return
    }
    setCustomerPdfSnapshot({ fields: snapshotFields, parseContext: snapshotContext })
    setShowCustomerPdf(true)
    setCopyState('Opened customer-facing preview')
    setCurrentStep(4)
  }

  function handleParse() {
    const result = parseNotes(rawNotes)
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(result.fields, result.sources, result.context, 2)
    setCopyState('Notes parsed into review fields')
  }

  function handleFieldChange(field, value) {
    const nextFields = { ...fields, [field]: value }
    const nextSources = {
      ...sources,
      [field]: value ? (sources[field] === 'default' && value === fields[field] ? sources[field] : 'manual') : 'blank',
    }
    syncState(nextFields, nextSources, parseContext, 3)
  }

  function handleClearAll() {
    const nextContext = {
      unmatchedLines: [],
      deliveryDateMentioned: false,
      documentType: 'notes',
      outputLabel: 'Fireplace Project Proposal',
    }
    setParsedOnce(false)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(emptyFields, emptySources, nextContext, 1)
    setRawNotes('')
    setPdfFileName('')
    setPdfStatus('')
    setPdfRawText('')
    setPdfLineItems([])
    setPdfExtractionConfidence('')
    setBatchFiles([])
    setBulkStatus('')
    setScannedPages([])
    setScannedStatus('')
    setScannedFile(null)
    setScannedReady(false)
    setOcrProgress(null)
    setOcrReviewConfirmed(false)
    setCustomerPdfSnapshot(null)
    setCopyState('Cleared')
  }

  async function handlePdfUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPdfFileName(file.name)
    setPdfStatus('Extracting text from Epicor BisTrack PDF…')
    setCopyState('')
    try {
      const item = await parsePdfFile(file)
      setPdfLineItems(item.lineItems)
      setPdfRawText(item.rawText)
      setPdfExtractionConfidence(item.confidence)
      const docLabel = item.documentType === 'unknown' ? 'unknown type' : item.documentType.toUpperCase()
      setPdfStatus(`Parsed — ${docLabel}${item.documentNumber ? ` ${item.documentNumber}` : ''} (${item.lineItems.length} line item${item.lineItems.length === 1 ? '' : 's'})`)
      setParsedOnce(true)
      setSectionOverrides({})
      setAssignmentTargets({})
      syncState(item.parsed.fields, item.parsed.sources, item.parsed.context, 2)
      setCopyState('BisTrack PDF parsed into review fields')
    } catch (err) {
      setPdfStatus(`Could not extract PDF text: ${err.message || err}`)
    }
  }

  async function handleBulkUpload(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (!files.length) return

    setInputMode('bulk')
    setBulkStatus(`Parsing ${files.length} BisTrack PDF${files.length === 1 ? '' : 's'}…`)
    setCopyState('')
    const placeholders = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      fileName: file.name,
      status: 'Parsing',
      documentType: 'pending',
      customerName: '',
      documentNumber: '',
      documentDate: '',
      total: '',
      balanceDue: '',
      confidence: '',
      warningCount: 0,
    }))
    setBatchFiles(placeholders)

    const parsedItems = []
    for (const file of files) {
      try {
        const item = await parsePdfFile(file)
        parsedItems.push(item)
      } catch (err) {
        parsedItems.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          fileName: file.name,
          status: 'Failed',
          documentType: 'unknown',
          customerName: '',
          documentNumber: '',
          documentDate: '',
          total: '',
          balanceDue: '',
          confidence: 'low',
          warningCount: 1,
          error: err.message || String(err),
        })
      }
      setBatchFiles([...parsedItems, ...placeholders.slice(parsedItems.length)])
    }

    const readyCount = parsedItems.filter((item) => item.status === 'Ready').length
    const reviewCount = parsedItems.filter((item) => item.status === 'Needs Review').length
    const failedCount = parsedItems.filter((item) => item.status === 'Failed').length
    setBatchFiles(parsedItems)
    setBulkStatus(`Batch parsed — ${readyCount} ready, ${reviewCount} need review, ${failedCount} failed`)
  }

  function handleReviewBatchItem(item) {
    if (!item.parsed) return
    loadParsedPdfResult(item, `Loaded ${item.fileName} into review fields`)
  }

  function handleGenerateBatchItem(item) {
    if (!item.parsed) return
    setPdfFileName(item.fileName)
    setPdfStatus(`Generating customer preview from ${item.fileName}`)
    openCustomerPdf(item.parsed.fields, item.parsed.context)
  }

  function handleRemoveBatchItem(itemId) {
    setBatchFiles((current) => current.filter((item) => item.id !== itemId))
    setCopyState('Removed file from batch')
  }

  async function handleScannedPacketUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setInputMode('scanned')
    setScannedPages([])
    setScannedReady(false)
    setOcrProgress(null)
    setOcrReviewConfirmed(false)
    setScannedStatus('Checking for embedded text…')
    setScannedFile(file)
    const extracted = await extractTextFromPdf(file)
    if (!extracted.embeddedTextLikelyMissing) {
      setScannedStatus('This PDF has selectable embedded text — use the BisTrack PDF upload tab instead.')
      setScannedFile(null)
      return
    }
    setScannedReady(true)
    setScannedStatus(`Scanned PDF detected (${extracted.pageCount} page${extracted.pageCount === 1 ? '' : 's'}, no embedded text). Click Run OCR to classify pages.`)
  }

  async function handleRunOcr() {
    if (!scannedFile) return
    setScannedReady(false)
    setOcrProgress({ stage: 'rendering', pageNumber: 0, pageCount: 0 })
    setScannedStatus('Starting OCR…')
    try {
      const ocrResult = await extractOcrFromPdf(scannedFile, {
        onProgress: (p) => {
          setOcrProgress(p)
          const action = p.stage === 'rendering' ? 'Rendering' : 'OCR'
          setScannedStatus(`${action} page ${p.pageNumber} of ${p.pageCount}…`)
        },
      })
      const packet = buildScannedPacket(ocrResult.pages)
      setScannedPages(packet.pages.map((page) => ({ ...page, reviewed: false })))
      setOcrProgress(null)
      const reviewCount = packet.pages.filter((p) => p.status === 'Needs Review').length
      setScannedStatus(`OCR complete — ${packet.pages.length} pages classified, ${reviewCount} need review.`)
    } catch (err) {
      setOcrProgress(null)
      setScannedStatus(`OCR failed: ${err.message || String(err)}`)
    }
  }

  function handleMarkScannedReviewed(pageNumber) {
    setScannedPages((current) =>
      current.map((page) => page.pageNumber === pageNumber ? { ...page, reviewed: true, status: 'Reviewed' } : page)
    )
  }

  function handleMarkScannedReference(pageNumber) {
    setScannedPages((current) =>
      current.map((page) => page.pageNumber === pageNumber ? { ...page, status: 'Reference' } : page)
    )
  }

  function handleLoadScannedItem(page) {
    const parsed = page.parsed
    if (!parsed) return
    setOcrReviewConfirmed(false)
    setPdfFileName(scannedFile?.name || 'scanned-packet.pdf')
    setPdfRawText(page.text || '')
    setPdfLineItems(parsed.lineItems || [])
    setPdfExtractionConfidence(parsed.extractionConfidence || 'low')
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    setPdfStatus(`Loaded OCR page ${page.pageNumber} — ${page.classification.label}${page.documentNumber ? ` ${page.documentNumber}` : ''}`)
    syncState(parsed.fields, parsed.sources, parsed.context, 2)
    setCopyState(`OCR page ${page.pageNumber} loaded — review fields carefully before generating a customer PDF`)
  }

  function handleRemoveScannedPage(pageNumber) {
    setScannedPages((current) => current.filter((page) => page.pageNumber !== pageNumber))
  }

  function handleLoadSample() {
    setRawNotes(annaSampleNotes)
    setCurrentStep(1)
    setCopyState('Anna sample loaded for testing')
  }

  function handleCopyGroup(group) {
    copyText(fieldsToExportLines(fields, group.fields))
    setCopyState(`${group.label.replace('Copy ', '')} copied`)
    setCurrentStep(4)
  }

  function handleClearSection(section) {
    const nextFields = { ...fields }
    const nextSources = { ...sources }

    section.fields.forEach((field) => {
      nextFields[field] = ''
      nextSources[field] = 'blank'
    })

    syncState(nextFields, nextSources, parseContext, 3)
    setCopyState(`${section.label} cleared`)
  }

  function handleAssignLine(line, index) {
    const targetField = assignmentTargets[index]
    if (!targetField) {
      return
    }

    const nextFields = {
      ...fields,
      [targetField]: mergeAssignedValue(fields[targetField], line, targetField),
    }
    const nextSources = { ...sources, [targetField]: 'manual' }
    const nextContext = {
      ...parseContext,
      unmatchedLines: parseContext.unmatchedLines.filter((_, lineIndex) => lineIndex !== index),
    }

    const nextAssignments = { ...assignmentTargets }
    delete nextAssignments[index]

    setAssignmentTargets(nextAssignments)
    syncState(nextFields, nextSources, nextContext, 2)
    setCopyState(`Assigned review line to ${getFieldLabel(targetField)}`)
  }

  function isSectionOpen(sectionKey) {
    const status = sectionStatus[sectionKey]
    if (!parsedOnce) {
      return true
    }
    if (!status.complete) {
      return true
    }
    return sectionOverrides[sectionKey] ?? false
  }

  function toggleSection(sectionKey) {
    const status = sectionStatus[sectionKey]
    if (!status.complete) {
      return
    }
    setSectionOverrides((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? false),
    }))
  }

  const visiblePreviewPackages = [1, 2]
    .map((packageNumber) => ({
      packageNumber,
      title: fields[`PACKAGE_${packageNumber}_TITLE`],
      items: packageRows(packageNumber)
        .map((row) => ({
          item: fields[row.item],
          price: fields[row.price],
        }))
        .filter((row) => row.item || row.price),
      liner: {
        name: fields[`PACKAGE_${packageNumber}_LINER_KIT_NAME`],
        subtotal: fields[`PACKAGE_${packageNumber}_LINER_KIT_SUBTOTAL`],
      },
      install: {
        note: fields[`PACKAGE_${packageNumber}_INSTALL_NOTE`],
        price: fields[`PACKAGE_${packageNumber}_INSTALL_PRICE`],
      },
    }))
    .filter((pkg) => pkg.title || pkg.items.length || pkg.liner.name || pkg.install.note)

  return (
    <div className="app-shell">
      <header className="hero-band">
        <div>
          <p className="eyebrow">Benson Stone internal tool</p>
          <h1>Fireplace quote proposal field organizer</h1>
          <p className="hero-copy">
            Paste quote notes, review warnings, clean up the structured fields, then copy the exact placeholder payload
            into the approved template workflow.
          </p>
        </div>

        <div className="hero-summary">
          <dl className="hero-stats">
            <div>
              <dt>Total Fields</dt>
              <dd>{audit.fieldCount}</dd>
            </div>
            <div>
              <dt>Ready Fields</dt>
              <dd>{audit.readyFieldCount}</dd>
            </div>
            <div>
              <dt>Needs Review</dt>
              <dd>{audit.needsReviewCount}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{audit.warnings.length}</dd>
            </div>
          </dl>

          <div className={`export-status ${audit.exportReady ? 'is-ready' : 'is-blocked'}`}>
            <strong>Ready to export?</strong>
            <span>{audit.exportStatus}</span>
            {audit.blockingFieldLabels.length ? (
              <p>Blocking fields: {audit.blockingFieldLabels.join(', ')}</p>
            ) : (
              <p>No required template fields are blocking export.</p>
            )}
          </div>
        </div>
      </header>

      <nav className="step-progress">
        {workflowSteps.map((step) => (
          <button
            key={step.number}
            type="button"
            className={`step-chip ${currentStep === step.number ? 'is-current' : ''}`}
            onClick={() => scrollToStep(step.anchor, step.number, setCurrentStep)}
          >
            <span>{`Step ${step.number}`}</span>
            <strong>{step.label}</strong>
          </button>
        ))}
      </nav>

      <main className="workspace">
        <section className="panel step-panel" id="step-1">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 1</p>
              <h2>Start from BisTrack</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-2', 2, setCurrentStep)}>
              Go to review
            </button>
          </div>

          <div className="step-intro">
            <p>
              Benson Stone creates the official quote/order in Epicor BisTrack. This tool is a presentation
              layer — paste the working notes or upload the BisTrack PDF, review the extracted fields,
              then export a polished customer-facing version.
            </p>
            <div className="sample-box">
              <strong>Sample / testing only</strong>
              <span>Use Anna Orlinska to test the notes parser. This is not part of the normal department workflow.</span>
              <button type="button" className="ghost-button ghost-button--subtle" onClick={handleLoadSample}>
                Load Anna sample
              </button>
            </div>
          </div>

          <div className="input-tabs">
            <button
              type="button"
              className={`input-tab ${inputMode === 'notes' ? 'is-active' : ''}`}
              onClick={() => setInputMode('notes')}
            >
              Paste Notes
            </button>
            <button
              type="button"
              className={`input-tab ${inputMode === 'pdf' ? 'is-active' : ''}`}
              onClick={() => setInputMode('pdf')}
            >
              Upload BisTrack PDF
            </button>
            <button
              type="button"
              className={`input-tab ${inputMode === 'bulk' ? 'is-active' : ''}`}
              onClick={() => setInputMode('bulk')}
            >
              Bulk Upload PDFs
            </button>
            <button
              type="button"
              className={`input-tab ${inputMode === 'scanned' ? 'is-active' : ''}`}
              onClick={() => setInputMode('scanned')}
            >
              Scanned Packet
            </button>
          </div>

          {inputMode === 'notes' ? (
            <>
              <textarea
                className="notes-input"
                rows={20}
                placeholder="Paste fireplace quote notes here..."
                value={rawNotes}
                onChange={(event) => setRawNotes(event.target.value)}
              />
              <div className="action-row">
                <button type="button" className="primary-button" onClick={handleParse}>
                  Parse / organize
                </button>
                <button type="button" className="ghost-button" onClick={handleClearAll}>
                  Clear all
                </button>
              </div>
            </>
          ) : null}

          {inputMode === 'pdf' ? (
            <div className="pdf-upload">
              <p className="pdf-upload__intro">
                Upload one Epicor BisTrack PDF (Quote, Order, Bill, Invoice, or Receipt). The official BisTrack
                document remains the source of truth — values are extracted as-is, never invented.
              </p>
              <label className="pdf-upload__input">
                <span>Choose BisTrack PDF</span>
                <input type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} />
              </label>
              {pdfFileName ? <p className="pdf-upload__file">{pdfFileName}</p> : null}
              {pdfStatus ? <p className="pdf-upload__status">{pdfStatus}</p> : null}
              {pdfExtractionConfidence ? (
                <p className={`pdf-upload__confidence is-${pdfExtractionConfidence}`}>
                  Extraction confidence: {pdfExtractionConfidence}
                </p>
              ) : null}
              {pdfLineItems.length ? (
                <div className="pdf-line-items">
                  <h4>Parsed line items</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Code</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pdfLineItems.map((item) => (
                        <tr key={`${item.lineNumber}-${item.code}`}>
                          <td>{item.lineNumber}</td>
                          <td>{item.code}</td>
                          <td>{item.description}</td>
                          <td>{item.qty}</td>
                          <td>{item.unitPrice}</td>
                          <td>{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {pdfRawText ? (
                <details className="pdf-raw-text">
                  <summary>Show raw extracted text (debug)</summary>
                  <pre>{pdfRawText}</pre>
                </details>
              ) : null}
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={handleClearAll}>
                  Clear all
                </button>
              </div>
            </div>
          ) : null}

          {inputMode === 'bulk' ? (
            <div className="pdf-upload bulk-upload">
              <p className="pdf-upload__intro">
                Upload a batch of Epicor BisTrack PDFs after you finish several quotes/orders. The app parses each file,
                shows a queue, and lets you review or generate customer previews one at a time.
              </p>
              <label className="pdf-upload__input">
                <span>Choose multiple BisTrack PDFs</span>
                <input type="file" accept="application/pdf,.pdf" multiple onChange={handleBulkUpload} />
              </label>
              {bulkStatus ? <p className="pdf-upload__status">{bulkStatus}</p> : null}

              {batchFiles.length ? (
                <div className="batch-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>File</th>
                        <th>Type</th>
                        <th>Customer</th>
                        <th>#</th>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Balance</th>
                        <th>Confidence</th>
                        <th>Warnings</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchFiles.map((item) => (
                        <tr key={item.id} className={`batch-row is-${getStatusClass(item.status)}`}>
                          <td><span className={`batch-status is-${getStatusClass(item.status)}`}>{item.status}</span></td>
                          <td>{item.fileName}</td>
                          <td>{item.documentType}</td>
                          <td>{item.customerName || '—'}</td>
                          <td>{item.documentNumber || '—'}</td>
                          <td>{item.documentDate || '—'}</td>
                          <td>{item.total || '—'}</td>
                          <td>{item.balanceDue || '—'}</td>
                          <td>{item.confidence || '—'}</td>
                          <td>{item.warningCount || 0}</td>
                          <td>
                            <div className="batch-actions">
                              <button
                                type="button"
                                className="ghost-button ghost-button--subtle"
                                disabled={!item.parsed}
                                onClick={() => handleReviewBatchItem(item)}
                              >
                                Review
                              </button>
                              <button
                                type="button"
                                className="ghost-button ghost-button--subtle"
                                disabled={!item.parsed || item.status === 'Failed'}
                                onClick={() => handleGenerateBatchItem(item)}
                              >
                                Generate
                              </button>
                              <button
                                type="button"
                                className="ghost-button ghost-button--subtle"
                                onClick={() => handleRemoveBatchItem(item.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-copy">No batch files uploaded yet.</p>
              )}

              <div className="action-row">
                <button type="button" className="ghost-button" onClick={handleClearAll}>
                  Clear all
                </button>
              </div>
            </div>
          ) : null}

          {inputMode === 'scanned' ? (
            <div className="pdf-upload scanned-upload">
              <p className="pdf-upload__intro">
                Upload a scanned follow-up packet PDF. The app detects missing embedded text, then lets you run OCR
                page by page. Customer-facing PDFs are blocked until you confirm each page has been reviewed.
              </p>
              <label className="pdf-upload__input">
                <span>Choose scanned packet PDF</span>
                <input type="file" accept="application/pdf,.pdf" onChange={handleScannedPacketUpload} />
              </label>
              {scannedStatus ? <p className="pdf-upload__status">{scannedStatus}</p> : null}
              {scannedReady && !ocrProgress ? (
                <button type="button" className="primary-button" onClick={handleRunOcr}>
                  Run OCR
                </button>
              ) : null}
              {ocrProgress ? (
                <div className="ocr-progress">
                  <div className="ocr-progress__bar">
                    <div
                      className="ocr-progress__fill"
                      style={{ width: ocrProgress.pageCount > 0 ? `${Math.round((ocrProgress.pageNumber / ocrProgress.pageCount) * 100)}%` : '5%' }}
                    />
                  </div>
                  <span>{ocrProgress.stage === 'rendering' ? 'Rendering' : 'OCR'} page {ocrProgress.pageNumber} of {ocrProgress.pageCount}</span>
                </div>
              ) : null}
              {scannedPages.length ? (
                <>
                  {scannedPages.some((p) => p.status !== 'Reference' && !p.reviewed) ? (
                    <div className="ocr-banner">
                      OCR Review Required — customer-facing PDFs are blocked until all active pages are marked Reviewed.
                    </div>
                  ) : null}
                  <div className="batch-table scanned-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th>Type</th>
                          <th>Confidence</th>
                          <th>Customer</th>
                          <th>Doc #</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannedPages.map((page) => (
                          <tr key={page.pageNumber} className={`batch-row is-${getStatusClass(page.status)}`}>
                            <td>{page.pageNumber}</td>
                            <td>{page.classification.label}</td>
                            <td>
                              <span className={`confidence-badge is-${page.ocrConfidence >= 60 ? 'ok' : 'low'}`}>
                                {page.ocrConfidence >= 60 ? `${page.ocrConfidence}%` : `⚠ ${page.ocrConfidence}%`}
                              </span>
                            </td>
                            <td>{page.customerName || '—'}</td>
                            <td>{page.documentNumber || '—'}</td>
                            <td>{page.documentDate || '—'}</td>
                            <td>{page.total || '—'}</td>
                            <td><span className={`batch-status is-${getStatusClass(page.status)}`}>{page.status}</span></td>
                            <td>
                              <div className="batch-actions">
                                <button
                                  type="button"
                                  className="ghost-button ghost-button--subtle"
                                  onClick={() => setOcrDetailsPage(page)}
                                >
                                  OCR Details
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button ghost-button--subtle"
                                  onClick={() => handleLoadScannedItem(page)}
                                >
                                  Load
                                </button>
                                {page.status !== 'Reviewed' && page.status !== 'Reference' ? (
                                  <button
                                    type="button"
                                    className="ghost-button ghost-button--subtle"
                                    onClick={() => handleMarkScannedReviewed(page.pageNumber)}
                                  >
                                    Mark Reviewed
                                  </button>
                                ) : null}
                                {page.status !== 'Reference' ? (
                                  <button
                                    type="button"
                                    className="ghost-button ghost-button--subtle"
                                    onClick={() => handleMarkScannedReference(page.pageNumber)}
                                  >
                                    Reference
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="ghost-button ghost-button--subtle"
                                  onClick={() => handleRemoveScannedPage(page.pageNumber)}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <div className="action-row">
                <button type="button" className="ghost-button" onClick={handleClearAll}>
                  Clear all
                </button>
              </div>
            </div>
          ) : null}

          <ul className="rule-list">
            <li>Epicor BisTrack is the source of truth. This app never invents customers, prices, tax, totals, or terms.</li>
            <li>Quote good for and deposit terms defaults only apply when the document is a Quote/Quotation.</li>
            <li>Delivery date stays out of the customer-facing proposal unless explicitly toggled on.</li>
            <li>If totals look inconsistent or a PDF appears scanned, the app warns rather than silently failing.</li>
          </ul>

          {copyState ? <p className="quiet-status">{copyState}</p> : null}
        </section>

        <section className="panel step-panel" id="step-2">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 2</p>
              <h2>Review Warnings</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-3', 3, setCurrentStep)}>
              Go to fields
            </button>
          </div>

          <div className={`document-type-banner is-${parseContext.documentType || 'notes'}`}>
            <div>
              <span className="kicker">Source document</span>
              <strong>
                {parseContext.documentType === 'notes'
                  ? 'Pasted notes (no BisTrack PDF)'
                  : `Epicor BisTrack — ${(parseContext.documentType || 'unknown').toUpperCase()}`}
              </strong>
              <p>Customer-facing label: {parseContext.outputLabel || 'Fireplace Project Proposal'}</p>
            </div>
            {parseContext.documentType && parseContext.documentType !== 'quote' && parseContext.documentType !== 'notes' ? (
              <p className="document-type-banner__warning">
                This is a {parseContext.documentType} document — quote-only language (30-day window, deposit terms)
                will not be applied automatically. Verify before sending to a customer.
              </p>
            ) : null}
          </div>

          {parseContext.extractionSource === 'ocr' && !ocrReviewConfirmed ? (
            <div className="ocr-source-callout">
              <strong>OCR source — fields extracted from a scanned image.</strong>
              <p>Compare every field against the original scanned page before using this data. Customer-facing PDF generation is blocked until you confirm review.</p>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOcrReviewConfirmed(true)}
              >
                I have reviewed the OCR output against the scan
              </button>
            </div>
          ) : null}
          {parseContext.extractionSource === 'ocr' && ocrReviewConfirmed ? (
            <div className="ocr-source-callout ocr-source-callout--confirmed">
              OCR review confirmed — customer-facing PDF generation unlocked.
            </div>
          ) : null}

          <div className="review-grid">
            <div className="review-card">
              <h3>Warnings</h3>
              {audit.warnings.length ? (
                <ul className="notice-list notice-list--warning">
                  {audit.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No warnings right now.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Defaults used</h3>
              {audit.infos.length ? (
                <ul className="notice-list">
                  {audit.infos.map((info) => (
                    <li key={info}>{info}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No defaults applied.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Export blockers</h3>
              {audit.blockingFieldLabels.length ? (
                <ul className="notice-list notice-list--warning">
                  {audit.blockingFieldLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No required fields are blocking export.</p>
              )}
            </div>

            <div className="review-card">
              <h3>Section blanks</h3>
              <div className="missing-summary">
                {audit.missingBySection.map((group) => (
                  <div key={group.key}>
                    <strong>{group.label}</strong>
                    <span>{group.fields.length} blank</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="needs-review-box">
            <div className="panel-heading">
              <div>
                <h3>Needs Review</h3>
                <p className="section-caption">Unmatched lines stay here until you assign them or decide they do not belong in the proposal.</p>
              </div>
            </div>

            {parseContext.unmatchedLines.length ? (
              <div className="review-line-list">
                {parseContext.unmatchedLines.map((line, index) => (
                  <div className="review-line" key={`${index}-${line}`}>
                    <p>{line}</p>
                    <div className="review-line__controls">
                      <select
                        value={assignmentTargets[index] || ''}
                        onChange={(event) =>
                          setAssignmentTargets((current) => ({ ...current, [index]: event.target.value }))
                        }
                      >
                        <option value="">Assign to field...</option>
                        {assignmentOptions.map((field) => (
                          <option key={field} value={field}>
                            {getFieldLabel(field)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="ghost-button" onClick={() => handleAssignLine(line, index)}>
                        Assign line
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No unmatched lines waiting for review.</p>
            )}
          </div>
        </section>

        <section className="panel step-panel" id="step-3">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 3</p>
              <h2>Edit Proposal Fields</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-4', 4, setCurrentStep)}>
              Go to copy/export
            </button>
          </div>

          <div className="section-stack">
            {sectionDefinitions.map((section) => {
              const layout = getSectionFieldLayout(section.key)
              const isOpen = isSectionOpen(section.key)
              const status = sectionStatus[section.key]
              const sectionCopyText = fieldsToExportLines(fields, section.fields)

              return (
                <section className="editor-section" key={section.key}>
                  <div className="editor-section__header">
                    <div>
                      <button
                        type="button"
                        className={`section-toggle ${status.complete ? '' : 'is-locked-open'}`}
                        onClick={() => toggleSection(section.key)}
                      >
                        <strong>{section.label}</strong>
                        <span>
                          {status.complete
                            ? isOpen
                              ? 'Hide section'
                              : 'Show section'
                            : `${status.missingCount} blank${status.warningCount ? ` • ${status.warningCount} warning` : ''}`}
                        </span>
                      </button>
                    </div>
                    <div className="button-stack">
                      <button
                        type="button"
                        className="ghost-button ghost-button--subtle"
                        onClick={() => {
                          copyText(sectionCopyText)
                          setCopyState(`${section.label} fields copied`)
                          setCurrentStep(4)
                        }}
                      >
                        Copy section fields
                      </button>
                      <button
                        type="button"
                        className="ghost-button ghost-button--subtle"
                        onClick={() => handleClearSection(section)}
                      >
                        Clear section
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="editor-section__body">
                      {layout === 'basic-grid' ? (
                        <div className="field-grid field-grid--three">
                          {section.fields.map((field) => (
                            <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                          ))}
                        </div>
                      ) : null}

                      {layout === 'mixed-grid' ? (
                        <div className="field-grid field-grid--three">
                          {section.fields.map((field) =>
                            field === 'PROJECT_OVERVIEW' || field === 'INSTALLATION_SCOPE' || field === 'PROJECT_NOTES' || field === 'LEGAL_TERMS' ? (
                              <MultiLineField
                                key={field}
                                field={field}
                                fields={fields}
                                sources={sources}
                                onChange={handleFieldChange}
                                rows={field === 'LEGAL_TERMS' ? 5 : 4}
                              />
                            ) : (
                              <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                            ),
                          )}
                        </div>
                      ) : null}

                      {layout === 'package' ? (
                        <>
                          <div className="field-grid field-grid--three">
                            {section.fields
                              .filter((field) => !field.includes('_ITEM_') && !field.includes('_PRICE_'))
                              .map((field) => (
                                <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />
                              ))}
                          </div>
                          <div className="line-item-grid">
                            {packageRows(section.key === 'package_1' ? 1 : 2).map((row) => (
                              <div className="line-item-row" key={row.item}>
                                <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.price} fields={fields} sources={sources} onChange={handleFieldChange} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}

                      {layout === 'detail' ? (
                        <>
                          <div className="field-grid field-grid--two">
                            <Field
                              field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_TITLE' : 'DETAIL_SECTION_2_TITLE'}
                              fields={fields}
                              sources={sources}
                              onChange={handleFieldChange}
                            />
                            <Field
                              field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_SUBTOTAL' : 'DETAIL_SECTION_2_SUBTOTAL'}
                              fields={fields}
                              sources={sources}
                              onChange={handleFieldChange}
                            />
                          </div>
                          <div className="detail-table">
                            <div className="detail-table__header">
                              <span>Item</span>
                              <span>Qty</span>
                              <span>Unit</span>
                              <span>Total</span>
                            </div>
                            {detailRows(section.key === 'detail_section_1' ? 1 : 2).map((row) => (
                              <div className="detail-table__row" key={row.item}>
                                <Field field={row.item} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.qty} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.unit} fields={fields} sources={sources} onChange={handleFieldChange} />
                                <Field field={row.total} fields={fields} sources={sources} onChange={handleFieldChange} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </section>

        <section className="panel step-panel" id="step-4">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 4</p>
              <h2>Copy / Export</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => scrollToStep('step-5', 5, setCurrentStep)}>
              Go to preview
            </button>
          </div>

          <div className="copy-groups">
            {copyGroups.map((group) => (
              <button key={group.key} type="button" className="ghost-button" onClick={() => handleCopyGroup(group)}>
                {group.label}
              </button>
            ))}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                copyText(exportJson)
                setCopyState('JSON copied')
                setCurrentStep(4)
              }}
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                downloadJson(fields)
                setCopyState('JSON exported')
                setCurrentStep(4)
              }}
            >
              Export JSON
            </button>
            <button type="button" className="primary-button" onClick={() => openCustomerPdf()}>
              Generate Customer PDF
            </button>
          </div>

          <p className="quiet-status">
            Review fields before generating. Epicor BisTrack remains the official source of truth.
            Customer-facing label: "{parseContext.outputLabel || 'Fireplace Project Proposal'}".
          </p>

          <div className="output-grid">
            <label className="field field--wide">
              <span>Flat placeholder output</span>
              <textarea rows={16} value={exportLines} readOnly />
            </label>
            <label className="field field--wide">
              <span>JSON output</span>
              <textarea rows={16} value={exportJson} readOnly />
            </label>
          </div>
        </section>

        <section className="panel step-panel" id="step-5">
          <div className="panel-heading">
            <div>
              <p className="kicker">Step 5</p>
              <h2>Simple internal preview</h2>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                window.print()
                setCurrentStep(5)
              }}
            >
              Print / PDF
            </button>
          </div>

          <div className="preview-warning">
            This is not the final designed customer proposal. Use the Canva template or future PDF export for the customer-facing version.
          </div>

          <section className="print-preview">
            <div className="print-page">
              <div className="print-header">
                <div>
                  <p>Benson Stone Co.</p>
                  <strong>{parseContext.outputLabel || 'Fireplace Project Proposal'}</strong>
                </div>
                <div className="preview-meta">
                  <span>{fields.QUOTE_NO || 'Quote # pending'}</span>
                  <span>{fields.QUOTE_DATE || 'Date pending'}</span>
                </div>
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Customer</h3>
                  {renderTextBlock(fields.CUSTOMER_NAME, 'Customer name pending')}
                  {renderTextBlock(fields.INVOICE_ADDRESS_LINE_1, 'Invoice address pending')}
                  {renderTextBlock(fields.INVOICE_CITY_STATE_ZIP, 'Invoice city/state/zip pending')}
                  {renderTextBlock(fields.CUSTOMER_PHONE, 'Customer phone pending')}
                </div>
                <div>
                  <h3>Project</h3>
                  {renderTextBlock(fields.PROJECT_TITLE, 'Project title pending')}
                  {renderTextBlock(fields.PROJECT_CITY_STATE, 'Project city/state pending')}
                  {renderTextBlock(fields.PROJECT_ADDRESS_LINE_1, 'Project address pending')}
                  {renderTextBlock(fields.PROJECT_CITY_STATE_ZIP, 'Project city/state/zip pending')}
                </div>
              </div>

              <div className="preview-section">
                <h3>Project overview</h3>
                {renderTextBlock(fields.PROJECT_OVERVIEW, 'Project overview pending')}
              </div>

              <div className="preview-package-grid">
                {visiblePreviewPackages.length ? (
                  visiblePreviewPackages.map((pkg) => (
                    <div className="preview-package" key={pkg.packageNumber}>
                      <h3>{pkg.title || `Package ${pkg.packageNumber}`}</h3>
                      {pkg.items.length ? (
                        <ul className="preview-list">
                          {pkg.items.map((item) => (
                            <li key={`${pkg.packageNumber}-${item.item}`}>
                              <span>{item.item}</span>
                              <strong>{item.price}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="preview-placeholder">No package items yet.</p>
                      )}
                      {pkg.liner.name ? (
                        <p className="preview-inline">
                          <span>{pkg.liner.name}</span>
                          <strong>{pkg.liner.subtotal}</strong>
                        </p>
                      ) : null}
                      {pkg.install.note ? (
                        <p className="preview-inline">
                          <span>{pkg.install.note}</span>
                          <strong>{pkg.install.price}</strong>
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="preview-placeholder">No package content ready yet.</p>
                )}
              </div>

              <div className="preview-section">
                <h3>Installation scope</h3>
                {renderTextBlock(fields.INSTALLATION_SCOPE, 'Installation scope pending')}
              </div>
            </div>

            <div className="print-page">
              <div className="print-header">
                <div>
                  <p>Detailed scope and investment</p>
                  <strong>{fields.CUSTOMER_NAME || 'Customer pending'}</strong>
                </div>
                <div className="preview-meta">
                  <span>{fields.QUOTE_GOOD_FOR ? `Good for ${fields.QUOTE_GOOD_FOR}` : 'Good-for window pending'}</span>
                  <span>{fields.PAYMENT_TERMS || 'Payment terms pending'}</span>
                </div>
              </div>

              <div className="preview-columns">
                {[1, 2].map((detailNumber) => (
                  <div key={detailNumber}>
                    <h3>{fields[`DETAIL_SECTION_${detailNumber}_TITLE`] || `Detail Section ${detailNumber}`}</h3>
                    <p className="preview-subtotal">{fields[`DETAIL_SECTION_${detailNumber}_SUBTOTAL`] || 'Subtotal pending'}</p>
                    <ul className="preview-list">
                      {detailRows(detailNumber)
                        .map((row) => ({
                          item: fields[row.item],
                          qty: fields[row.qty],
                          unit: fields[row.unit],
                          total: fields[row.total],
                        }))
                        .filter((row) => row.item || row.total)
                        .map((row, index) => (
                          <li key={`${detailNumber}-${index}`}>
                            <span>{`${row.item}${row.qty ? ` (${row.qty})` : ''}`}</span>
                            <strong>{row.total || row.unit}</strong>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Project notes</h3>
                  {renderTextBlock(fields.PROJECT_NOTES, 'No project notes added yet.')}
                </div>
                <div>
                  <h3>Investment summary</h3>
                  <ul className="preview-list">
                    <li><span>Total Amount</span><strong>{fields.TOTAL_AMOUNT || 'Pending'}</strong></li>
                    <li><span>IR Tax</span><strong>{fields.IR_TAX || 'Pending'}</strong></li>
                    <li><span>Quotation Total</span><strong>{fields.QUOTATION_TOTAL || 'Pending'}</strong></li>
                    <li><span>Amount Paid</span><strong>{fields.AMOUNT_PAID || 'Pending'}</strong></li>
                    <li><span>Balance Due</span><strong>{fields.BALANCE_DUE || 'Pending'}</strong></li>
                  </ul>
                </div>
              </div>

              <div className="preview-columns">
                <div>
                  <h3>Deposit terms</h3>
                  {parseContext.fullyPaid ? (
                    <p className="preview-placeholder">Order is fully paid — deposit terms hidden.</p>
                  ) : (
                    renderTextBlock(fields.DEPOSIT_TERMS, 'Deposit terms pending')
                  )}
                </div>
                <div>
                  <h3>Legal terms</h3>
                  {renderTextBlock(fields.LEGAL_TERMS, 'Legal terms pending')}
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>

      {showCustomerPdf ? (
        <div
          className="customer-pdf-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Customer-facing proposal preview"
        >
          <div className="customer-pdf-modal__controls">
            <div>
              <strong>Customer-facing preview</strong>
              <span>Review fields before generating. Epicor BisTrack remains the official source of truth.</span>
            </div>
            <label className="customer-pdf-modal__toggle">
              <input
                type="checkbox"
                checked={includeDeliveryDate}
                onChange={(event) => setIncludeDeliveryDate(event.target.checked)}
              />
              Include delivery date
            </label>
            <div className="customer-pdf-modal__actions">
              <button type="button" className="primary-button" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
              <button type="button" className="ghost-button" onClick={() => setShowCustomerPdf(false)}>
                Close
              </button>
            </div>
          </div>
          <div className="customer-pdf-modal__stage">
            <CustomerProposal
              fields={customerPdfSnapshot?.fields || fields}
              parseContext={customerPdfSnapshot?.parseContext || parseContext}
              includeDeliveryDate={includeDeliveryDate}
            />
          </div>
        </div>
      ) : null}

      {ocrDetailsPage ? (
        <div
          className="customer-pdf-modal ocr-details-modal"
          role="dialog"
          aria-modal="true"
          aria-label="OCR Details"
        >
          <div className="customer-pdf-modal__controls">
            <div>
              <strong>OCR Details — Page {ocrDetailsPage.pageNumber}</strong>
              <p>{ocrDetailsPage.classification.label} · Confidence {ocrDetailsPage.ocrConfidence}%</p>
            </div>
            <div className="customer-pdf-modal__actions">
              <button type="button" className="ghost-button" onClick={() => setOcrDetailsPage(null)}>
                Close
              </button>
            </div>
          </div>
          <div className="customer-pdf-modal__stage ocr-details-stage">
            <div className="ocr-details-section">
              <h4>Extracted Fields</h4>
              <dl className="ocr-fields-list">
                {Object.entries(ocrDetailsPage.parsed?.fields || {})
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
            <div className="ocr-details-section">
              <h4>Raw OCR Text</h4>
              <pre className="ocr-raw-text">{ocrDetailsPage.text || '(no text)'}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
