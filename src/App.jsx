import { useMemo, useRef, useState } from 'react'
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
import {
  buildProductIntelligence,
  createProductCatalog,
  extractLineItemsFromFields,
} from './lib/productCatalog.js'
import { buildScannedPacket } from './lib/scannedPacketParser.js'
import { proposalPlaybooks, recommendProposalPlaybook } from './lib/proposalPlaybooks.js'
import { recommendProposalPackage } from './lib/proposalPackages.js'
import { evaluateCurrentSetup } from './lib/currentSetup.js'
import {
  createOpportunityFromCurrentQuote,
  createOpportunityDraftsFromPackets,
  getSafeBulkAddDrafts,
  listOpportunities,
  removeOpportunity,
  saveOpportunity,
  updateOpportunity,
} from './lib/opportunities.js'
import AppShell from './components/AppShell.jsx'
import CommandCenter from './components/CommandCenter.jsx'
import CustomerProposal from './components/CustomerProposal.jsx'
import ExportPrep from './components/ExportPrep.jsx'
import IntakePanel from './components/IntakePanel.jsx'
import OpportunityQueue from './components/OpportunityQueue.jsx'
import ProposalBuilder from './components/ProposalBuilder.jsx'
import ProposalPlaybooks from './components/ProposalPlaybooks.jsx'
import ReviewStation from './components/ReviewStation.jsx'
import ScannedPacketWorkspace from './components/ScannedPacketWorkspace.jsx'

const localBistrackSeeds = import.meta.glob('./data/bistrack-snapshot/*', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function getLocalBistrackSeed(fileName) {
  return localBistrackSeeds[`./data/bistrack-snapshot/${fileName}`] || ''
}

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

const scannedTriageGroups = [
  { key: 'follow-up', label: 'Likely Follow-Up Quotes', matches: (page) => page.recommendation === 'Follow-up candidate', open: true },
  { key: 'manual-review', label: 'Needs Manual Review', matches: (page) => page.recommendation === 'Needs manual review', open: true },
  { key: 'paid-closed', label: 'Paid / Closed Orders', matches: (page) => page.recommendation === 'Paid / closed', open: false },
  { key: 'support', label: 'Field Measure / Install Support', matches: (page) => page.recommendation === 'Field measure / install support', open: false },
  { key: 'photos', label: 'Site Photos / Reference Pages', matches: (page) => page.recommendation === 'Site photo', open: false },
  { key: 'unknown', label: 'Unknown / Reference', matches: (page) => page.recommendation === 'Reference only' || page.status === 'Reference', open: false },
]

function makeRunId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function summarizePacketPages(pages) {
  return {
    followUp: pages.filter((page) => page.recommendation === 'Follow-up candidate').length,
    paidClosed: pages.filter((page) => page.recommendation === 'Paid / closed').length,
    needsReview: pages.filter((page) => page.recommendation === 'Needs manual review').length,
    support: pages.filter((page) => page.recommendation === 'Field measure / install support').length,
    reference: pages.filter((page) => page.recommendation === 'Site photo' || page.recommendation === 'Reference only' || page.status === 'Reference').length,
    unknown: pages.filter((page) => page.classification.type === 'unknown').length,
  }
}

function getPacketOcrStatus(packet) {
  if (packet.status === 'OCR complete') {
    const summary = summarizePacketPages(packet.pages)
    return `${packet.status} - ${summary.followUp} follow-up, ${summary.needsReview} need review`
  }
  return packet.status
}

function getStatusFromRecommendation(recommendation) {
  if (recommendation === 'Follow-up candidate' || recommendation === 'Needs manual review') return 'Needs Review'
  if (recommendation === 'Paid / closed') return 'Paid / Closed'
  if (recommendation === 'Field measure / install support') return 'Support'
  return 'Reference'
}

function getOcrWarnings(page) {
  const warnings = [...(page.parsed?.warnings || [])]
  if ((page.ocrConfidence || 0) < 60) warnings.unshift('Low OCR confidence. Compare this page carefully against the scan.')
  if (!page.customerName && page.recommendation !== 'Site photo') warnings.unshift('No customer name was extracted.')
  if (page.recommendation === 'Paid / closed') warnings.unshift('Paid or closed order. Do not treat this as a follow-up quote by default.')
  return [...new Set(warnings)]
}

function getCurrentSourceLabel(parseContext, pdfFileName, loadedOcrItem, inputMode) {
  if (parseContext.extractionSource === 'ocr') return loadedOcrItem ? 'OCR scanned source' : 'OCR scanned source'
  if (inputMode === 'bulk') return 'Bulk BisTrack import'
  if (pdfFileName) return 'BisTrack PDF'
  if (parseContext.documentType === 'notes') return 'Pasted notes'
  return 'Internal/reference source'
}

function isPaidClosedContext(parseContext, fields) {
  if (parseContext.fullyPaid) return true
  const balanceDue = Number(String(fields.BALANCE_DUE || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(balanceDue) && balanceDue === 0
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
  const productCatalog = useMemo(() => createProductCatalog({
    fireplaceCatalogCsv: getLocalBistrackSeed('fireplace_catalog_internal_seed.csv'),
    manualLineTypesCsv: getLocalBistrackSeed('fireplace_manual_order_line_types_seed.csv'),
    manifestJson: getLocalBistrackSeed('bistrack_import_manifest.json'),
  }), [])
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
  const [activeView, setActiveView] = useState('command')
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('')
  const [opportunities, setOpportunities] = useState(() => listOpportunities())
  const [opportunityFilter, setOpportunityFilter] = useState('needs-review')
  const [opportunitySaveState, setOpportunitySaveState] = useState('')
  const [skippedOpportunityDraftIds, setSkippedOpportunityDraftIds] = useState([])
  const [sectionOverrides, setSectionOverrides] = useState({})
  const [assignmentTargets, setAssignmentTargets] = useState({})
  const [scannedPackets, setScannedPackets] = useState([])
  const [scannedStatus, setScannedStatus] = useState('')
  const [scannedFile, setScannedFile] = useState(null)
  const [scannedFileMeta, setScannedFileMeta] = useState(null)
  const [scannedReady, setScannedReady] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(null)
  const [ocrDetailsPage, setOcrDetailsPage] = useState(null)
  const [ocrReviewConfirmed, setOcrReviewConfirmed] = useState(false)
  const [loadedOcrItem, setLoadedOcrItem] = useState(null)
  const scannedInputRef = useRef(null)
  const activeOcrRunRef = useRef(null)
  const activeOcrAbortRef = useRef(null)
  const ocrIsRunning = Boolean(ocrProgress)

  const exportJson = JSON.stringify(fields, null, 2)
  const exportLines = fieldsToExportLines(fields)
  const productIntelligence = useMemo(() => {
    const sourceLineItems = pdfLineItems.length ? pdfLineItems : extractLineItemsFromFields(fields)
    return buildProductIntelligence(sourceLineItems, productCatalog)
  }, [fields, pdfLineItems, productCatalog])
  const playbookRecommendation = useMemo(() => recommendProposalPlaybook({
    fields,
    parseContext,
    productIntelligence,
    quoteMeta: {
      selectedPlaybookId,
      currentSourceLabel: getCurrentSourceLabel(parseContext, pdfFileName, loadedOcrItem, inputMode),
      ocrReviewConfirmed,
    },
  }), [fields, inputMode, loadedOcrItem, ocrReviewConfirmed, parseContext, pdfFileName, productIntelligence, selectedPlaybookId])
  const currentSetupGuidance = useMemo(() => evaluateCurrentSetup({
    fields,
    parseContext,
  }), [fields, parseContext])
  const packageRecommendation = useMemo(() => recommendProposalPackage({
    currentSetupGuidance,
    fields,
    parseContext,
    productIntelligence,
    playbookRecommendation: {
      ...playbookRecommendation,
      id: selectedPlaybookId || playbookRecommendation.id,
    },
  }), [currentSetupGuidance, fields, parseContext, playbookRecommendation, productIntelligence, selectedPlaybookId])
  const bulkOpportunityDraftState = useMemo(() => createOpportunityDraftsFromPackets({
    packets: scannedPackets,
    existingOpportunities: opportunities,
  }), [opportunities, scannedPackets])

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

  function syncState(nextFields, nextSources, nextContext) {
    const nextAudit = buildAudit(nextFields, nextSources, nextContext)
    setFields(nextFields)
    setSources(nextSources)
    setParseContext(nextContext)
    setAudit(nextAudit)
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
    syncState(item.parsed.fields, item.parsed.sources, item.parsed.context)
    setCopyState(message)
    setActiveView('review')
  }

  function openCustomerPdf(snapshotFields = fields, snapshotContext = parseContext) {
    if (snapshotContext.extractionSource === 'ocr' && !ocrReviewConfirmed) {
      setCopyState('OCR source — confirm review in Step 2 before generating a customer-facing PDF')
      setActiveView('review')
      return
    }
    if (isPaidClosedContext(snapshotContext, snapshotFields) && selectedPlaybookId !== 'paid-order-summary') {
      setCopyState('Paid/closed source — use Paid Order Summary or keep it out of normal proposal flow')
      setActiveView('playbooks')
      return
    }
    setCustomerPdfSnapshot({ fields: snapshotFields, parseContext: snapshotContext })
    setShowCustomerPdf(true)
    setCopyState('Opened customer-facing preview')
  }

  function handleParse() {
    const result = parseNotes(rawNotes)
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(result.fields, result.sources, result.context)
    setCopyState('Notes parsed into review fields')
    setActiveView('review')
  }

  function handleFieldChange(field, value) {
    const nextFields = { ...fields, [field]: value }
    const nextSources = {
      ...sources,
      [field]: value ? (sources[field] === 'default' && value === fields[field] ? sources[field] : 'manual') : 'blank',
    }
    syncState(nextFields, nextSources, parseContext)
  }

  function invalidateActiveOcr(message = '') {
    activeOcrRunRef.current = null
    activeOcrAbortRef.current?.abort()
    activeOcrAbortRef.current = null
    setOcrProgress(null)
    if (message) setScannedStatus(message)
  }

  function clearScannedFileInput() {
    if (scannedInputRef.current) {
      scannedInputRef.current.value = ''
    }
  }

  function handleClearAll() {
    invalidateActiveOcr()
    const nextContext = {
      unmatchedLines: [],
      deliveryDateMentioned: false,
      documentType: 'notes',
      outputLabel: 'Fireplace Project Proposal',
    }
    setParsedOnce(false)
    setSectionOverrides({})
    setAssignmentTargets({})
    syncState(emptyFields, emptySources, nextContext)
    setRawNotes('')
    setPdfFileName('')
    setPdfStatus('')
    setPdfRawText('')
    setPdfLineItems([])
    setPdfExtractionConfidence('')
    setBatchFiles([])
    setBulkStatus('')
    setScannedPackets([])
    setSkippedOpportunityDraftIds([])
    setScannedStatus('')
    setScannedFile(null)
    setScannedFileMeta(null)
    setScannedReady(false)
    setOcrReviewConfirmed(false)
    setLoadedOcrItem(null)
    setOcrDetailsPage(null)
    clearScannedFileInput()
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
      syncState(item.parsed.fields, item.parsed.sources, item.parsed.context)
      setCopyState('BisTrack PDF parsed into review fields')
      setActiveView('review')
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
    setActiveView('intake')
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
    if (activeOcrRunRef.current) {
      setScannedStatus('Cancel the active OCR run before choosing another scanned packet.')
      clearScannedFileInput()
      return
    }
    const runId = makeRunId()
    activeOcrRunRef.current = runId
    setInputMode('scanned')
    setScannedReady(false)
    setOcrProgress(null)
    setLoadedOcrItem(null)
    setOcrReviewConfirmed(false)
    setScannedStatus('Checking for embedded text…')
    setScannedFile(file)
    setScannedFileMeta({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      fileName: file.name,
      pageCount: 0,
    })
    let extracted
    try {
      extracted = await extractTextFromPdf(file)
    } catch (err) {
      if (activeOcrRunRef.current !== runId) return
      activeOcrRunRef.current = null
      setScannedStatus(`Could not inspect scanned packet: ${err.message || String(err)}`)
      setScannedFile(null)
      setScannedFileMeta(null)
      clearScannedFileInput()
      return
    }
    if (activeOcrRunRef.current !== runId) return
    activeOcrRunRef.current = null
    if (!extracted.embeddedTextLikelyMissing) {
      setScannedStatus('This PDF has selectable embedded text — use the BisTrack PDF upload tab instead.')
      setScannedFile(null)
      setScannedFileMeta(null)
      clearScannedFileInput()
      return
    }
    setScannedFileMeta({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      fileName: file.name,
      pageCount: extracted.pageCount,
    })
    setScannedReady(true)
    setScannedStatus(`Scanned PDF detected (${extracted.pageCount} page${extracted.pageCount === 1 ? '' : 's'}, no embedded text). Click Run OCR to classify pages.`)
  }

  async function handleRunOcr() {
    if (!scannedFile) return
    const packetMeta = scannedFileMeta || {
      id: `${scannedFile.name}-${scannedFile.lastModified}-${scannedFile.size}`,
      fileName: scannedFile.name,
      pageCount: 0,
    }
    const runId = makeRunId()
    const controller = new AbortController()
    activeOcrRunRef.current = runId
    activeOcrAbortRef.current = controller
    setScannedReady(false)
    setOcrProgress({ stage: 'rendering', pageNumber: 0, pageCount: 0 })
    setScannedStatus('Starting OCR…')
    try {
      const ocrResult = await extractOcrFromPdf(scannedFile, {
        signal: controller.signal,
        onProgress: (p) => {
          if (activeOcrRunRef.current !== runId) return
          setOcrProgress(p)
          const action = p.stage === 'rendering' ? 'Rendering' : 'OCR'
          setScannedStatus(`${action} page ${p.pageNumber} of ${p.pageCount}…`)
        },
      })
      if (activeOcrRunRef.current !== runId) return
      const packet = buildScannedPacket(ocrResult.pages)
      const pages = packet.pages.map((page) => ({
        ...page,
        reviewed: false,
        packetId: packetMeta.id,
        packetFileName: packetMeta.fileName,
      }))
      setScannedPackets((current) => [
        ...current.filter((item) => item.id !== packetMeta.id),
        {
          id: packetMeta.id,
          fileName: packetMeta.fileName,
          pageCount: packetMeta.pageCount || ocrResult.pageCount || pages.length,
          status: 'OCR complete',
          pages,
        },
      ])
      setOcrProgress(null)
      activeOcrRunRef.current = null
      activeOcrAbortRef.current = null
      const reviewCount = pages.filter((p) => p.status === 'Needs Review').length
      setScannedStatus(`OCR complete - ${pages.length} pages classified, ${reviewCount} need review.`)
      setActiveView('triage')
      setScannedFile(null)
      setScannedFileMeta(null)
      clearScannedFileInput()
    } catch (err) {
      if (activeOcrRunRef.current !== runId) return
      setOcrProgress(null)
      activeOcrRunRef.current = null
      activeOcrAbortRef.current = null
      if (err.name === 'AbortError') {
        setScannedStatus('OCR canceled. Old results will be ignored.')
      } else {
        setScannedStatus(`OCR failed: ${err.message || String(err)}`)
      }
    }
  }

  function handleCancelOcr() {
    invalidateActiveOcr('OCR canceled. Old results will be ignored.')
    setScannedReady(Boolean(scannedFile))
  }

  function updateScannedPage(packetId, pageNumber, updater) {
    setScannedPackets((current) =>
      current.map((packet) => packet.id === packetId
        ? {
            ...packet,
            pages: packet.pages.map((page) => page.pageNumber === pageNumber ? updater(page) : page),
          }
        : packet)
    )
  }

  function handleMarkScannedReviewed(packetId, pageNumber) {
    updateScannedPage(packetId, pageNumber, (page) => ({ ...page, reviewed: true, status: 'Reviewed' }))
    if (loadedOcrItem?.packetId === packetId && loadedOcrItem?.pageNumber === pageNumber) {
      setOcrReviewConfirmed(true)
      setLoadedOcrItem({ packetId, pageNumber, reviewed: true })
    }
  }

  function handleMarkScannedReference(packetId, pageNumber) {
    updateScannedPage(packetId, pageNumber, (page) => ({ ...page, status: 'Reference', recommendation: 'Reference only' }))
  }

  function handleUndoScannedReference(packetId, pageNumber) {
    updateScannedPage(packetId, pageNumber, (page) => ({
      ...page,
      status: page.reviewed ? 'Reviewed' : getStatusFromRecommendation(page.originalRecommendation),
      recommendation: page.originalRecommendation,
    }))
  }

  function handleLoadScannedItem(page) {
    const parsed = page.parsed
    if (!parsed) return
    setOcrReviewConfirmed(Boolean(page.reviewed))
    setLoadedOcrItem({ packetId: page.packetId, pageNumber: page.pageNumber, reviewed: Boolean(page.reviewed) })
    setPdfFileName(page.packetFileName || scannedFileMeta?.fileName || scannedFile?.name || 'scanned-packet.pdf')
    setPdfRawText(page.text || '')
    setPdfLineItems(parsed.lineItems || [])
    setPdfExtractionConfidence(parsed.extractionConfidence || 'low')
    setParsedOnce(true)
    setSectionOverrides({})
    setAssignmentTargets({})
    setPdfStatus(`Loaded OCR page ${page.pageNumber} — ${page.classification.label}${page.documentNumber ? ` ${page.documentNumber}` : ''}`)
    syncState(parsed.fields, parsed.sources, parsed.context)
    setCopyState(`OCR page ${page.pageNumber} loaded — review fields carefully before generating a customer PDF`)
    setActiveView('review')
  }

  function handleRemoveScannedPage(packetId, pageNumber) {
    setScannedPackets((current) =>
      current
        .map((packet) => packet.id === packetId
          ? { ...packet, pages: packet.pages.filter((page) => page.pageNumber !== pageNumber) }
          : packet)
        .filter((packet) => packet.pages.length)
    )
  }

  function handleClearScannedPacket(packetId) {
    setScannedPackets((current) => current.filter((packet) => packet.id !== packetId))
    if (loadedOcrItem?.packetId === packetId) {
      setLoadedOcrItem(null)
      setOcrReviewConfirmed(false)
    }
    setCopyState('Removed scanned packet')
  }

  function handleLoadSample() {
    setRawNotes(annaSampleNotes)
    setActiveView('intake')
    setCopyState('Anna sample loaded for testing')
  }

  function handleCopyGroup(group) {
    copyText(fieldsToExportLines(fields, group.fields))
    setCopyState(`${group.label.replace('Copy ', '')} copied`)
    setActiveView('export')
  }

  function handleClearSection(section) {
    const nextFields = { ...fields }
    const nextSources = { ...sources }

    section.fields.forEach((field) => {
      nextFields[field] = ''
      nextSources[field] = 'blank'
    })

    syncState(nextFields, nextSources, parseContext)
    setCopyState(`${section.label} cleared`)
  }

  function handleSaveOpportunity() {
    const nextOpportunity = createOpportunityFromCurrentQuote({
      fields,
      parseContext,
      productIntelligence,
      playbookRecommendation: {
        ...playbookRecommendation,
        warnings: [
          ...(playbookRecommendation.warnings || []),
          ...currentSetupGuidance.blockers,
          ...currentSetupGuidance.reviewWarnings,
        ],
      },
    })
    const saved = saveOpportunity({
      ...nextOpportunity,
      selectedPlaybookId: selectedPlaybookId || nextOpportunity.selectedPlaybookId,
    })
    setOpportunities(listOpportunities())
    setOpportunitySaveState(`${saved.customerName || 'Quote'} saved to Opportunity Queue as ${saved.status.replace(/-/g, ' ')}`)
    setCopyState('Saved to Opportunity Queue')
  }

  function saveDraftOpportunity(draft, patch = {}) {
    const saved = saveOpportunity({ ...draft.opportunity, ...patch })
    setOpportunities(listOpportunities())
    setOpportunitySaveState(`${saved.customerName || 'Draft'} saved from bulk intake`)
    return saved
  }

  function handleAddOpportunityDraft(draft) {
    saveDraftOpportunity(draft)
  }

  function handleAddAllSafeOpportunityDrafts() {
    const safeDrafts = getSafeBulkAddDrafts(bulkOpportunityDraftState.drafts).filter((draft) => !skippedOpportunityDraftIds.includes(draft.id))
    safeDrafts.forEach((draft) => saveOpportunity(draft.opportunity))
    setOpportunities(listOpportunities())
    setOpportunitySaveState(`${safeDrafts.length} safe draft opportunit${safeDrafts.length === 1 ? 'y' : 'ies'} added to queue`)
  }

  function handleUpdateExistingOpportunityDraft(draft) {
    const existing = opportunities.find((item) => item.id === draft.duplicate.duplicateId)
    if (!existing) return
    updateOpportunity(existing.id, {
      warnings: [...new Set([...(existing.warnings || []), ...(draft.opportunity.warnings || []), 'Updated from high-confidence bulk duplicate.'])],
      sourceType: draft.opportunity.sourceType,
      sourceLabel: draft.opportunity.sourceLabel,
      sourceFileName: draft.opportunity.sourceFileName,
      sourceImportedAt: draft.opportunity.sourceImportedAt,
      sourceConfidence: draft.opportunity.sourceConfidence,
      sourceWarnings: draft.opportunity.sourceWarnings,
      recommendedPlaybookId: draft.opportunity.recommendedPlaybookId || existing.recommendedPlaybookId,
      nextAction: existing.nextAction || draft.opportunity.nextAction,
      nextActionDue: existing.nextActionDue || draft.opportunity.nextActionDue,
    })
    setOpportunities(listOpportunities())
    setOpportunitySaveState(`${existing.customerName || 'Existing opportunity'} updated from bulk intake`)
  }

  function handleReviewOpportunityDraft(draft) {
    saveDraftOpportunity(draft, {
      status: 'needs-review',
      proposalReadiness: 'blocked',
      warnings: [...new Set([...(draft.opportunity.warnings || []), 'Bulk draft marked for review before follow-up.'])],
    })
    setOpportunityFilter('needs-review')
    setActiveView('opportunities')
  }

  function handleSkipOpportunityDraft(draftId) {
    setSkippedOpportunityDraftIds((current) => current.includes(draftId) ? current : [...current, draftId])
    setOpportunitySaveState('Skipped bulk draft')
  }

  function handleUpdateOpportunity(id, patch) {
    updateOpportunity(id, patch)
    setOpportunities(listOpportunities())
  }

  function handleRemoveOpportunity(id) {
    removeOpportunity(id)
    setOpportunities(listOpportunities())
    setOpportunitySaveState('Removed opportunity from queue')
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
    syncState(nextFields, nextSources, nextContext)
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

  const selectedPlaybook = proposalPlaybooks.find((playbook) => playbook.id === selectedPlaybookId) || null
  const currentSourceLabel = getCurrentSourceLabel(parseContext, pdfFileName, loadedOcrItem, inputMode)
  const scannedPages = scannedPackets.flatMap((packet) => packet.pages)
  const stats = {
    activePackets: scannedPackets.length,
    needsReview: scannedPages.filter((page) => page.status === 'Needs Review' || !page.reviewed).length + audit.needsReviewCount,
    followUp: scannedPages.filter((page) => page.recommendation === 'Follow-up candidate').length,
    paidClosed: scannedPages.filter((page) => page.recommendation === 'Paid / closed').length + (isPaidClosedContext(parseContext, fields) ? 1 : 0),
    readyFields: audit.readyFieldCount,
    safetyBlockers: audit.blockingFieldLabels.length + (parseContext.extractionSource === 'ocr' && !ocrReviewConfirmed ? 1 : 0) + (isPaidClosedContext(parseContext, fields) && selectedPlaybookId !== 'paid-order-summary' ? 1 : 0),
    opportunities: opportunities.length,
  }

  const fieldEditor = (
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
                    setActiveView('export')
                  }}
                >
                  Copy section fields
                </button>
                <button type="button" className="ghost-button ghost-button--subtle" onClick={() => handleClearSection(section)}>
                  Clear section
                </button>
              </div>
            </div>

            {isOpen ? (
              <div className="editor-section__body">
                {layout === 'basic-grid' ? (
                  <div className="field-grid field-grid--three">
                    {section.fields.map((field) => <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />)}
                  </div>
                ) : null}

                {layout === 'mixed-grid' ? (
                  <div className="field-grid field-grid--three">
                    {section.fields.map((field) =>
                      field === 'PROJECT_OVERVIEW' || field === 'INSTALLATION_SCOPE' || field === 'PROJECT_NOTES' || field === 'LEGAL_TERMS' ? (
                        <MultiLineField key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} rows={field === 'LEGAL_TERMS' ? 5 : 4} />
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
                        .map((field) => <Field key={field} field={field} fields={fields} sources={sources} onChange={handleFieldChange} />)}
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
                      <Field field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_TITLE' : 'DETAIL_SECTION_2_TITLE'} fields={fields} sources={sources} onChange={handleFieldChange} />
                      <Field field={section.key === 'detail_section_1' ? 'DETAIL_SECTION_1_SUBTOTAL' : 'DETAIL_SECTION_2_SUBTOTAL'} fields={fields} sources={sources} onChange={handleFieldChange} />
                    </div>
                    <div className="detail-table">
                      <div className="detail-table__header"><span>Item</span><span>Qty</span><span>Unit</span><span>Total</span></div>
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
  )

  const proposalPreview = (
    <section className="print-preview print-preview--compact">
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
            {renderTextBlock(fields.CUSTOMER_PHONE, 'Customer phone pending')}
          </div>
          <div>
            <h3>Project</h3>
            {renderTextBlock(fields.PROJECT_TITLE, 'Project title pending')}
            {renderTextBlock(fields.PROJECT_ADDRESS_LINE_1, 'Project address pending')}
            {renderTextBlock(fields.PROJECT_CITY_STATE_ZIP, 'Project city/state/zip pending')}
          </div>
        </div>
        <div className="preview-section">
          <h3>Project overview</h3>
          {renderTextBlock(fields.PROJECT_OVERVIEW, 'Project overview pending')}
        </div>
        <div className="preview-section">
          <h3>Investment summary</h3>
          <ul className="preview-list">
            <li><span>Total Amount</span><strong>{fields.TOTAL_AMOUNT || 'Pending'}</strong></li>
            <li><span>Tax</span><strong>{fields.IR_TAX || 'Pending'}</strong></li>
            <li><span>Document Total</span><strong>{fields.QUOTATION_TOTAL || 'Pending'}</strong></li>
            <li><span>Balance Due</span><strong>{fields.BALANCE_DUE || 'Pending'}</strong></li>
          </ul>
        </div>
      </div>
    </section>
  )

  let activeContent = null
  if (activeView === 'command') {
    activeContent = <CommandCenter currentSourceLabel={currentSourceLabel} onNavigate={setActiveView} selectedPlaybook={selectedPlaybook} stats={stats} />
  } else if (activeView === 'intake') {
    activeContent = (
      <IntakePanel
        batchFiles={batchFiles}
        bulkStatus={bulkStatus}
        getStatusClass={getStatusClass}
        handleBulkUpload={handleBulkUpload}
        handleCancelOcr={handleCancelOcr}
        handleClearAll={handleClearAll}
        handleLoadSample={handleLoadSample}
        handleParse={handleParse}
        handlePdfUpload={handlePdfUpload}
        handleRemoveBatchItem={handleRemoveBatchItem}
        handleReviewBatchItem={handleReviewBatchItem}
        handleGenerateBatchItem={handleGenerateBatchItem}
        handleRunOcr={handleRunOcr}
        handleScannedPacketUpload={handleScannedPacketUpload}
        inputMode={inputMode}
        ocrIsRunning={ocrIsRunning}
        ocrProgress={ocrProgress}
        pdfExtractionConfidence={pdfExtractionConfidence}
        pdfFileName={pdfFileName}
        pdfLineItems={pdfLineItems}
        pdfRawText={pdfRawText}
        pdfStatus={pdfStatus}
        rawNotes={rawNotes}
        scannedFileMeta={scannedFileMeta}
        scannedInputRef={scannedInputRef}
        scannedReady={scannedReady}
        scannedStatus={scannedStatus}
        setInputMode={setInputMode}
        setRawNotes={setRawNotes}
      />
    )
  } else if (activeView === 'triage') {
    activeContent = (
      <ScannedPacketWorkspace
        bulkOpportunityDraftState={bulkOpportunityDraftState}
        getPacketOcrStatus={getPacketOcrStatus}
        getStatusClass={getStatusClass}
        onAddAllSafeOpportunityDrafts={handleAddAllSafeOpportunityDrafts}
        onAddOpportunityDraft={handleAddOpportunityDraft}
        onClearPacket={handleClearScannedPacket}
        onLoadPage={handleLoadScannedItem}
        onMarkChecked={handleMarkScannedReviewed}
        onMarkReference={handleMarkScannedReference}
        onRemovePage={handleRemoveScannedPage}
        onReviewOpportunityDraft={handleReviewOpportunityDraft}
        onSkipOpportunityDraft={handleSkipOpportunityDraft}
        onUpdateExistingOpportunityDraft={handleUpdateExistingOpportunityDraft}
        onUndoReference={handleUndoScannedReference}
        onViewOcr={setOcrDetailsPage}
        scannedPackets={scannedPackets}
        skippedOpportunityDraftIds={skippedOpportunityDraftIds}
        scannedTriageGroups={scannedTriageGroups}
        summarizePacketPages={summarizePacketPages}
      />
    )
  } else if (activeView === 'review') {
    activeContent = (
      <ReviewStation
        assignmentOptions={assignmentOptions}
        assignmentTargets={assignmentTargets}
        audit={audit}
        currentSourceLabel={currentSourceLabel}
        currentSetupGuidance={currentSetupGuidance}
        handleAssignLine={handleAssignLine}
        loadedOcrItem={loadedOcrItem}
        ocrReviewConfirmed={ocrReviewConfirmed}
        onMarkLoadedOcrChecked={() => handleMarkScannedReviewed(loadedOcrItem.packetId, loadedOcrItem.pageNumber)}
        parseContext={parseContext}
        productIntelligence={productIntelligence}
        setAssignmentTargets={setAssignmentTargets}
        setOcrReviewConfirmed={setOcrReviewConfirmed}
      >
        {fieldEditor}
      </ReviewStation>
    )
  } else if (activeView === 'playbooks') {
    activeContent = (
      <ProposalPlaybooks
        packageRecommendation={packageRecommendation}
        playbooks={proposalPlaybooks}
        recommendation={playbookRecommendation}
        selectedPlaybookId={selectedPlaybookId}
        onSelectPlaybook={setSelectedPlaybookId}
      />
    )
  } else if (activeView === 'proposal') {
    activeContent = (
      <ProposalBuilder
        editor={fieldEditor}
        onSaveOpportunity={handleSaveOpportunity}
        currentSetupGuidance={currentSetupGuidance}
        preview={proposalPreview}
        productIntelligence={productIntelligence}
        packageRecommendation={packageRecommendation}
        recommendation={playbookRecommendation}
      />
    )
  } else if (activeView === 'opportunities') {
    activeContent = (
      <OpportunityQueue
        filter={opportunityFilter}
        onFilterChange={setOpportunityFilter}
        onRemoveOpportunity={handleRemoveOpportunity}
        onSaveCurrent={handleSaveOpportunity}
        onUpdateOpportunity={handleUpdateOpportunity}
        opportunities={opportunities}
        playbooks={proposalPlaybooks}
        saveState={opportunitySaveState}
      />
    )
  } else if (activeView === 'export') {
    activeContent = (
      <ExportPrep
        audit={audit}
        copyGroups={copyGroups}
        copyState={copyState}
        currentSourceLabel={currentSourceLabel}
        exportJson={exportJson}
        exportLines={exportLines}
        fields={fields}
        fieldsToExportLines={fieldsToExportLines}
        onCopyGroup={handleCopyGroup}
        onCopyJson={() => {
          copyText(exportJson)
          setCopyState('JSON copied')
        }}
        onExportJson={() => {
          downloadJson(fields)
          setCopyState('JSON exported')
        }}
        onGenerateCustomerPdf={() => openCustomerPdf()}
        onSaveOpportunity={handleSaveOpportunity}
        parseContext={parseContext}
        packageRecommendation={packageRecommendation}
        recommendation={playbookRecommendation}
        selectedPlaybook={selectedPlaybook}
      />
    )
  }

  return (
    <AppShell
      activeView={activeView}
      audit={audit}
      currentSourceLabel={currentSourceLabel}
      onNavigate={setActiveView}
      selectedPlaybook={selectedPlaybook}
      stats={stats}
    >
      {activeContent}

      {showCustomerPdf ? (
        <div className="customer-pdf-modal" role="dialog" aria-modal="true" aria-label="Customer-facing proposal preview">
          <div className="customer-pdf-modal__controls">
            <div>
              <strong>Customer-facing preview</strong>
              <span>Review fields before generating. Epicor BisTrack remains the official source of truth.</span>
            </div>
            <label className="customer-pdf-modal__toggle">
              <input type="checkbox" checked={includeDeliveryDate} onChange={(event) => setIncludeDeliveryDate(event.target.checked)} />
              Include delivery date
            </label>
            <div className="customer-pdf-modal__actions">
              <button type="button" className="primary-button" onClick={() => window.print()}>Print / Save as PDF</button>
              <button type="button" className="ghost-button" onClick={() => setShowCustomerPdf(false)}>Close</button>
            </div>
          </div>
          <div className="customer-pdf-modal__stage">
            <CustomerProposal fields={customerPdfSnapshot?.fields || fields} parseContext={customerPdfSnapshot?.parseContext || parseContext} includeDeliveryDate={includeDeliveryDate} />
          </div>
        </div>
      ) : null}

      {ocrDetailsPage ? (
        <div className="customer-pdf-modal ocr-details-modal" role="dialog" aria-modal="true" aria-label="OCR Details">
          <div className="customer-pdf-modal__controls">
            <div>
              <strong>View scan/OCR - Page {ocrDetailsPage.pageNumber}</strong>
              <p>{ocrDetailsPage.classification.label} · {ocrDetailsPage.recommendation} · Confidence {ocrDetailsPage.ocrConfidence}%</p>
            </div>
            <div className="customer-pdf-modal__actions">
              <button type="button" className="ghost-button" onClick={() => setOcrDetailsPage(null)}>Close</button>
            </div>
          </div>
          <div className="customer-pdf-modal__stage ocr-details-stage">
            {ocrDetailsPage.imageDataUrl ? (
              <div className="ocr-details-section ocr-preview-section">
                <h4>Page Preview</h4>
                <img src={ocrDetailsPage.imageDataUrl} alt={`Scanned page ${ocrDetailsPage.pageNumber}`} />
              </div>
            ) : null}
            <div className="ocr-details-section">
              <h4>Extracted Fields</h4>
              <dl className="ocr-fields-list">
                {Object.entries(ocrDetailsPage.parsed?.fields || {}).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
            <div className="ocr-details-section">
              <h4>Warnings</h4>
              {getOcrWarnings(ocrDetailsPage).length ? (
                <ul className="notice-list notice-list--warning">{getOcrWarnings(ocrDetailsPage).map((warning) => <li key={warning}>{warning}</li>)}</ul>
              ) : <p className="empty-copy">No extra OCR warnings.</p>}
              <details className="ocr-raw-details">
                <summary>Advanced / Raw OCR</summary>
                <pre className="ocr-raw-text">{ocrDetailsPage.text || '(no text)'}</pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}

export default App
