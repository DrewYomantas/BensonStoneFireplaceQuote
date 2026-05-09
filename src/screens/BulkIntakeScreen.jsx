import { useEffect, useMemo, useRef, useState } from 'react'
import NextActionBar from '../components/shell/NextActionBar.jsx'
import { ensureSalesOsBoot, getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { listCustomerFilesDurable } from '../lib/customerFileDurable.js'
import {
  buildBulkIntakeReview,
  commitBulkIntakeDrafts,
  STATUS_LABELS,
} from '../lib/customerBulkIntake.js'
import { isOcrTextWeak, ocrPageWarning, ocrProgressLabel, scanBatchLabel, OCR_PAGE_LIMIT } from '../lib/bulkIntakeOcr.js'
import {
  buildScannedCustomerDraft,
  detectScannedDraftWarnings,
  commitScannedDraft,
} from '../lib/scannedCustomerDraft.js'
import {
  QUEUE_STATUS,
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_CLS,
  createQueueItem,
  updateQueueItem,
  queueItemCountLabel,
} from '../lib/bulkIntakeQueue.js'
import {
  PAGE_STATUS,
  PAGE_STATUS_LABELS,
  PAGE_STATUS_CLS,
  createPageItem,
  updatePageItem as updatePageItemFn,
  pageItemCountLabel,
} from '../lib/bulkIntakePageQueue.js'
import { detectDocType, DOC_TYPE_LABELS } from '../lib/scanDocTypeDetector.js'
import {
  extractBensonQuoteZoneTexts,
  buildBensonQuoteDraftFromZones,
} from '../lib/bensonQuoteTemplateReader.js'
import {
  suggestPageGroups,
  buildPacketGroupDraft,
  commitPacketGroupDraft,
  revalidatePacketGroupDraft,
} from '../lib/scannedPacketGroups.js'

// Doc types that typically carry a BisTrack quote number.
const BENSON_QUOTE_DOC_TYPES = new Set(['benson_quote'])

// ---- Row-level status badge (for review rows) --------------------------------

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

// ---- Compact ready row -------------------------------------------------------

function ReadyRow({ row, checked, onToggle }) {
  const contact = [row.customerPhone, row.customerEmail].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--stone-150)' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(row._id)}
        style={{ flexShrink: 0, accentColor: 'var(--brass)', width: 16, height: 16 }}
        aria-label={`Select ${row.customerName} for import`}
      />
      <span className="body-sm" style={{ fontWeight: 600, color: 'var(--ink)', flex: '0 0 200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.customerName}
      </span>
      <span className="body-sm" style={{ color: 'var(--slate)', flex: 1, minWidth: 0 }}>{contact}</span>
    </div>
  )
}

// ---- Issue row (needs a decision) -------------------------------------------

function IssueRow({ row, checked, disabled, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--stone-150)', opacity: disabled ? 0.5 : 1 }}>
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

// ---- Queue sidebar row -------------------------------------------------------

function QueueRow({ item, isActive, onActivate, onRemove }) {
  const countLabel = queueItemCountLabel(item)
  const busy = item.status === QUEUE_STATUS.extracting || item.status === QUEUE_STATUS.ocrRunning
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate(item.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(item.id) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer',
        background: isActive ? 'var(--stone-100)' : 'transparent', borderRadius: 6,
        borderLeft: isActive ? '3px solid var(--brass)' : '3px solid transparent', minWidth: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.fileName || 'Pasted text'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          <span className={QUEUE_STATUS_CLS[item.status]} style={{ fontSize: 10, padding: '1px 5px' }}>
            {QUEUE_STATUS_LABELS[item.status]}
          </span>
          {countLabel && <span style={{ fontSize: 11, color: 'var(--slate)' }}>{countLabel}</span>}
        </div>
        {busy && item.progressLabel && (
          <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>{item.progressLabel}</div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
        disabled={busy}
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer',
          color: 'var(--slate-soft)', fontSize: 16, padding: '2px 4px', lineHeight: 1,
          opacity: busy ? 0.4 : 1,
        }}
        aria-label={`Remove ${item.fileName || 'file'} from queue`}
      >
        ×
      </button>
    </div>
  )
}

// ---- Page list row (multi-page scanned PDF) ---------------------------------

function PageRow({ page, isActive, onActivate, isSelected, onToggleSelect }) {
  const docLabel = DOC_TYPE_LABELS[page.detectedDocType] || 'Unknown'
  const countLabel = pageItemCountLabel(page)
  const draftName = page.scanDraftFields?.customerName || ''
  const autoName = page.autoExtract?.customerName || ''
  const displayName = draftName || autoName
  const draftQuote = page.scanDraftFields?.quoteNumber || ''
  const autoQuote = page.autoExtract?.quoteNumber || ''
  const displayQuote = draftQuote || autoQuote
  const isDone = page.status !== PAGE_STATUS.waiting && page.status !== PAGE_STATUS.ocrRunning
  const showQuoteRow = isDone && BENSON_QUOTE_DOC_TYPES.has(page.detectedDocType)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
        borderRadius: 6, marginBottom: 3,
        background: isActive ? 'var(--stone-100)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--brass)' : '3px solid transparent',
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(page.id) }}
        onClick={(e) => e.stopPropagation()}
        style={{ flexShrink: 0, accentColor: 'var(--brass)', width: 14, height: 14, cursor: 'pointer', marginTop: 1 }}
        aria-label={`Select page ${page.pageNumber} for packet`}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => onActivate(page.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(page.id) }}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Page {page.pageNumber}</span>
          <span className={PAGE_STATUS_CLS[page.status]} style={{ fontSize: 10, padding: '1px 5px' }}>
            {PAGE_STATUS_LABELS[page.status]}
          </span>
          {countLabel && <span style={{ fontSize: 11, color: 'var(--brass)' }}>{countLabel}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 1 }}>{docLabel}</div>
        {isDone && (
          <div style={{ fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName
              ? <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Customer: {displayName}</span>
              : <span style={{ color: 'var(--slate-soft)' }}>Name needs review</span>
            }
          </div>
        )}
        {showQuoteRow && (
          <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 1 }}>
            {displayQuote ? `Quote #${displayQuote}` : 'Quote # not found'}
          </div>
        )}
        {page.status === PAGE_STATUS.ocrRunning && page.progressLabel && (
          <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 1 }}>{page.progressLabel}</div>
        )}
      </div>
    </div>
  )
}

// ---- Default selection logic ------------------------------------------------

function defaultSelected(rows) {
  const s = new Set()
  for (const row of rows) {
    if (row.status === 'missing-name') continue
    if (row.status === 'duplicate') continue
    s.add(row._id)
  }
  return s
}

// ---- Screen -----------------------------------------------------------------

export default function BulkIntakeScreen({ onBack, onOpenFilesList }) {
  const [queue, setQueue] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [globalError, setGlobalError] = useState('')
  const [existingFiles, setExistingFiles] = useState([])
  const [importing, setImporting] = useState(false)
  const [showScanOcrText, setShowScanOcrText] = useState(false)
  const [showPageOcrText, setShowPageOcrText] = useState(false)
  const [activePagePreview, setActivePagePreview] = useState(null)
  const fileInputRef = useRef(null)
  const addMoreRef = useRef(null)
  // File objects held here (not in queue items) so "Process next batch" can re-read them.
  const fileRegistryRef = useRef(new Map())
  // Cached page preview data URLs — memory only, never persisted.
  const pagePreviewsRef = useRef(new Map())
  // AbortController for in-flight preview renders.
  const previewAbortRef = useRef(null)

  const activeItem = useMemo(
    () => queue.find((item) => item.id === activeId) || null,
    [queue, activeId],
  )
  const activeSelectedSet = useMemo(
    () => new Set(activeItem?.selectedIds || []),
    [activeItem?.selectedIds],
  )
  const activeSelectedCount = useMemo(
    () => (activeItem?.draftRows || []).filter((r) => activeSelectedSet.has(r._id)).length,
    [activeItem?.draftRows, activeSelectedSet],
  )

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

  useEffect(() => {
    if (previewAbortRef.current) { previewAbortRef.current.abort(); previewAbortRef.current = null }
    setActivePagePreview(null)
    setGlobalError('')
    setShowScanOcrText(false)
  }, [activeId])

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result || '')
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  async function processOneFile(file, itemId) {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      setQueue((prev) =>
        updateQueueItem(prev, itemId, {
          status: QUEUE_STATUS.error,
          errorMessage: 'Excel files cannot be read directly. In Excel: File → Save As → CSV (.csv), then upload the CSV.',
        }),
      )
      return
    }

    if (ext === 'pdf') {
      setQueue((prev) =>
        updateQueueItem(prev, itemId, { status: QUEUE_STATUS.extracting, progressLabel: 'Reading PDF…' }),
      )
      try {
        const { extractTextFromPdf, extractOcrFromPdf, extractOcrPageByPage } = await import('../lib/pdfTextExtraction.js')
        const { rawText, embeddedTextLikelyMissing, pageCount } = await extractTextFromPdf(file, {
          onProgress: (prog) => {
            if (prog.stage === 'pdf-loaded') {
              setQueue((prev) =>
                updateQueueItem(prev, itemId, {
                  progressLabel: `Found ${prog.pageCount} page${prog.pageCount === 1 ? '' : 's'}…`,
                }),
              )
            }
          },
        })

        if (embeddedTextLikelyMissing && pageCount > 1) {
          // Multi-page scanned packet → page-by-page OCR mode
          const pageLimit = Math.min(pageCount, OCR_PAGE_LIMIT)
          const pageWarn = ocrPageWarning(pageCount)
          const initialPageItems = Array.from({ length: pageLimit }, (_, i) =>
            createPageItem(i + 1, pageLimit, itemId),
          )
          const pageIdMap = {}
          for (const p of initialPageItems) pageIdMap[p.pageNumber] = p.id
          setQueue((prev) =>
            updateQueueItem(prev, itemId, {
              status: QUEUE_STATUS.ocrRunning,
              isMultiPage: true,
              phase: 'pages',
              pageItems: initialPageItems,
              totalPageCount: pageCount,
              progressLabel: 'Preparing pages…',
              errorMessage: pageWarn || '',
            }),
          )
          await extractOcrPageByPage(file, {
            maxPages: pageLimit,
            onProgress: (prog) => {
              if (prog.stage === 'loading-pdf') {
                setQueue((prev) =>
                  updateQueueItem(prev, itemId, { progressLabel: 'Loading PDF for scanning…' }),
                )
                return
              }
              if (prog.stage === 'loading-engine') {
                setQueue((prev) =>
                  updateQueueItem(prev, itemId, { progressLabel: ocrProgressLabel(prog) }),
                )
                return
              }
              if (prog.stage === 'rendering' || prog.stage === 'ocr') {
                const label = ocrProgressLabel(prog)
                setQueue((prev) => {
                  const it = prev.find((q) => q.id === itemId)
                  if (!it) return prev
                  return updateQueueItem(prev, itemId, {
                    progressLabel: label,
                    pageItems: updatePageItemFn(it.pageItems, pageIdMap[prog.pageNumber], {
                      status: PAGE_STATUS.ocrRunning,
                      progressLabel: label,
                    }),
                  })
                })
              }
            },
            onPageComplete: async ({ pageNumber, text, dataUrl, worker }) => {
              const pageId = pageIdMap[pageNumber]
              const docType = detectDocType(text)
              const weak = isOcrTextWeak(text)
              // Auto-extract fields for page list preview (non-intrusive — not the draft form).
              const { fields: autoExtract } = buildScannedCustomerDraft(text)
              setQueue((prev) => {
                const it = prev.find((q) => q.id === itemId)
                if (!it) return prev
                return updateQueueItem(prev, itemId, {
                  pageItems: updatePageItemFn(it.pageItems, pageId, {
                    extractedText: text,
                    detectedDocType: docType,
                    autoExtract,
                    status: weak ? PAGE_STATUS.needsCleanup : PAGE_STATUS.readyToReview,
                    progressLabel: '',
                  }),
                })
              })
              if (BENSON_QUOTE_DOC_TYPES.has(docType) && dataUrl && worker) {
                try {
                  const zoneTexts = await extractBensonQuoteZoneTexts(dataUrl, worker)
                  const zoneResult = buildBensonQuoteDraftFromZones(zoneTexts)
                  setQueue((prev) => {
                    const it = prev.find((q) => q.id === itemId)
                    if (!it) return prev
                    return updateQueueItem(prev, itemId, {
                      pageItems: updatePageItemFn(it.pageItems, pageId, { zoneResult }),
                    })
                  })
                } catch {
                  // Zone OCR failed — autoExtract (whole-page) is still set.
                }
              }
            },
          })
          setQueue((prev) =>
            updateQueueItem(prev, itemId, { status: QUEUE_STATUS.parsed, progressLabel: '' }),
          )
          return
        }

        if (embeddedTextLikelyMissing) {
          // Single-page scanned PDF → existing single-blob OCR
          const pageWarn = ocrPageWarning(pageCount)
          const maxPages = Math.min(pageCount, OCR_PAGE_LIMIT)
          setQueue((prev) =>
            updateQueueItem(prev, itemId, {
              status: QUEUE_STATUS.ocrRunning,
              progressLabel: ocrProgressLabel({ stage: 'ocr', pageNumber: 0, pageCount: maxPages }),
              errorMessage: pageWarn || '',
            }),
          )
          const ocrResult = await extractOcrFromPdf(file, {
            maxPages,
            onProgress: (p) =>
              setQueue((prev) => updateQueueItem(prev, itemId, { progressLabel: ocrProgressLabel(p) })),
          })
          const text = ocrResult.rawText
          setQueue((prev) =>
            updateQueueItem(prev, itemId, {
              extractedText: text,
              status: isOcrTextWeak(text) ? QUEUE_STATUS.needsCleanup : QUEUE_STATUS.readyToParse,
              progressLabel: '',
            }),
          )
        } else {
          setQueue((prev) =>
            updateQueueItem(prev, itemId, {
              extractedText: rawText,
              status: QUEUE_STATUS.readyToParse,
              progressLabel: '',
            }),
          )
        }
      } catch (err) {
        setQueue((prev) =>
          updateQueueItem(prev, itemId, {
            status: QUEUE_STATUS.error,
            errorMessage: 'Could not read PDF: ' + (err.message || 'Unknown error'),
            progressLabel: '',
          }),
        )
      }
      return
    }

    // CSV / TSV / TXT
    setQueue((prev) =>
      updateQueueItem(prev, itemId, { status: QUEUE_STATUS.extracting, progressLabel: 'Reading…' }),
    )
    try {
      const text = await readFileAsText(file)
      setQueue((prev) =>
        updateQueueItem(prev, itemId, {
          extractedText: text,
          status: QUEUE_STATUS.readyToParse,
          progressLabel: '',
        }),
      )
    } catch (err) {
      setQueue((prev) =>
        updateQueueItem(prev, itemId, {
          status: QUEUE_STATUS.error,
          errorMessage: 'Could not read file: ' + (err.message || 'Unknown error'),
          progressLabel: '',
        }),
      )
    }
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    const newItems = files.map((f) => createQueueItem(f.name))
    const wasEmpty = queue.length === 0
    setQueue((prev) => [...prev, ...newItems])
    if (wasEmpty) setActiveId(newItems[0].id)
    for (let i = 0; i < files.length; i++) {
      fileRegistryRef.current.set(newItems[i].id, files[i])
      await processOneFile(files[i], newItems[i].id)
    }
  }

  function handleFileInputChange(e) {
    // Array.from copies the FileList before clearing — input.value = '' destroys
    // the live FileList reference, so processFiles must receive a real array.
    const files = Array.from(e.target.files)
    if (!files.length) return
    e.target.value = ''
    setGlobalError('')
    processFiles(files)
  }

  function handlePasteQueue() {
    const text = pasteText.trim()
    if (!text) { setGlobalError('Paste text before parsing.'); return }
    const rows = buildBulkIntakeReview(text, existingFiles)
    if (!rows.length) {
      setGlobalError('No data rows found. Check that your text has a header row and at least one data row.')
      return
    }
    const defaultSel = defaultSelected(rows)
    const base = createQueueItem('Pasted text')
    const item = {
      ...base,
      fileType: 'paste',
      extractedText: text,
      phase: 'review',
      status: QUEUE_STATUS.parsed,
      draftRows: rows,
      selectedIds: Array.from(defaultSel),
      parsedRowCount: rows.length,
    }
    setQueue([item])
    setActiveId(item.id)
    setPasteText('')
    setGlobalError('')
  }

  function handleParseActive() {
    if (!activeItem) return
    const text = activeItem.extractedText.trim()
    if (!text) { setGlobalError('No text to parse — edit the extracted text.'); return }
    const rows = buildBulkIntakeReview(text, existingFiles)
    if (!rows.length) {
      setGlobalError('No data rows found. Check that your text has a header row and at least one data row.')
      return
    }
    const defaultSel = defaultSelected(rows)
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        phase: 'review',
        status: QUEUE_STATUS.parsed,
        draftRows: rows,
        selectedIds: Array.from(defaultSel),
        parsedRowCount: rows.length,
      }),
    )
    setGlobalError('')
  }

  function handleToggleRow(rowId) {
    if (!activeItem) return
    const has = activeItem.selectedIds.includes(rowId)
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        selectedIds: has
          ? activeItem.selectedIds.filter((id) => id !== rowId)
          : [...activeItem.selectedIds, rowId],
      }),
    )
  }

  function handleSelectAll() {
    if (!activeItem) return
    const eligible = (activeItem.draftRows || [])
      .filter((r) => r.status !== 'missing-name')
      .map((r) => r._id)
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { selectedIds: eligible }))
  }

  function handleDeselectAll() {
    if (!activeItem) return
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { selectedIds: [] }))
  }

  async function handleImportActive() {
    if (!activeItem || importing) return
    const toImport = (activeItem.draftRows || []).filter((r) => activeSelectedSet.has(r._id))
    if (!toImport.length) { setGlobalError('No rows selected.'); return }
    setImporting(true)
    setGlobalError('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) { setGlobalError(ready.error || 'Storage unavailable'); return }
      const storage = getSalesOsStorage()
      const result = await commitBulkIntakeDrafts(toImport, storage)
      const freshFiles = await listCustomerFilesDurable(storage)
      setExistingFiles(freshFiles)
      setQueue((prev) =>
        updateQueueItem(prev, activeItem.id, {
          phase: 'result',
          status: QUEUE_STATUS.imported,
          importedCount: result.imported.length,
          importResult: result,
        }),
      )
    } catch (err) {
      setGlobalError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleBuildScanDraft() {
    if (!activeItem) return
    const { fields, warnings } = buildScannedCustomerDraft(
      activeItem.extractedText,
      { existingFiles },
    )
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        phase: 'scan-draft',
        status: QUEUE_STATUS.parsed,
        scanDraftFields: fields,
        scanDraftWarnings: warnings,
      }),
    )
    setGlobalError('')
  }

  function handleUpdateScanDraftField(key, value) {
    if (!activeItem) return
    const updated = { ...(activeItem.scanDraftFields || {}), [key]: value }
    const warnings = detectScannedDraftWarnings(updated, existingFiles)
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        scanDraftFields: updated,
        scanDraftWarnings: warnings,
      }),
    )
  }

  async function handleImportScanDraft() {
    if (!activeItem || importing) return
    const fields = activeItem.scanDraftFields || {}
    if (!fields.customerName) { setGlobalError('Name is required before importing.'); return }
    setImporting(true)
    setGlobalError('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) { setGlobalError(ready.error || 'Storage unavailable'); return }
      const storage = getSalesOsStorage()
      const file = await commitScannedDraft(fields, storage)
      const freshFiles = await listCustomerFilesDurable(storage)
      setExistingFiles(freshFiles)
      setQueue((prev) =>
        updateQueueItem(prev, activeItem.id, {
          phase: 'result',
          status: QUEUE_STATUS.imported,
          importedCount: 1,
          importResult: { imported: [file], errors: [] },
        }),
      )
    } catch (err) {
      setGlobalError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  // ---- Page-level handlers ---------------------------------------------------

  async function handleActivatePage(pageId) {
    if (!activeItem) return
    setShowPageOcrText(false)
    setGlobalError('')

    // Cancel any in-flight preview render from a previous page.
    if (previewAbortRef.current) { previewAbortRef.current.abort(); previewAbortRef.current = null }
    setActivePagePreview(null)

    const page = (activeItem.pageItems || []).find((p) => p.id === pageId)
    const shouldAutoBuild = page
      && !page.scanDraftFields
      && page.status !== PAGE_STATUS.waiting
      && page.status !== PAGE_STATUS.ocrRunning
      && page.status !== PAGE_STATUS.imported
      && page.status !== PAGE_STATUS.referenceOnly

    let autoDraft = null
    if (shouldAutoBuild) {
      if (page.zoneResult) {
        autoDraft = {
          fields: page.zoneResult.fields,
          warnings: detectScannedDraftWarnings(page.zoneResult.fields, existingFiles),
          templateHint: page.zoneResult.templateHint,
        }
      } else {
        autoDraft = buildScannedCustomerDraft(page.extractedText, { existingFiles })
      }
    }

    setQueue((prev) => {
      const it = prev.find((q) => q.id === activeItem.id)
      if (!it) return prev
      let pageItems = it.pageItems
      if (autoDraft) {
        pageItems = updatePageItemFn(pageItems, pageId, {
          status: PAGE_STATUS.draftBuilt,
          scanDraftFields: autoDraft.fields,
          scanDraftWarnings: autoDraft.warnings,
          scanDraftTemplateHint: autoDraft.templateHint || null,
        })
      }
      return updateQueueItem(prev, activeItem.id, { activePageId: pageId, pageItems })
    })

    // Render page preview from the original file (async, cancellable).
    const file = fileRegistryRef.current.get(activeItem.id)
    if (file && page) {
      const cacheKey = `${activeItem.id}:${page.pageNumber}`
      if (pagePreviewsRef.current.has(cacheKey)) {
        setActivePagePreview(pagePreviewsRef.current.get(cacheKey))
      } else {
        const controller = new AbortController()
        previewAbortRef.current = controller
        try {
          const { renderSinglePdfPage } = await import('../lib/pdfTextExtraction.js')
          const dataUrl = await renderSinglePdfPage(file, page.pageNumber, { scale: 1.5, imageType: 'image/jpeg', signal: controller.signal })
          if (!controller.signal.aborted) {
            pagePreviewsRef.current.set(cacheKey, dataUrl)
            setActivePagePreview(dataUrl)
          }
        } catch {
          // Preview unavailable or aborted — not critical.
        }
      }
    }
  }

  function handleDeactivatePage() {
    if (!activeItem) return
    if (previewAbortRef.current) { previewAbortRef.current.abort(); previewAbortRef.current = null }
    setActivePagePreview(null)
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { activePageId: null }))
    setShowPageOcrText(false)
    setGlobalError('')
  }

  function handleMarkPageReferenceOnly(pageId) {
    if (!activeItem) return
    setQueue((prev) => {
      const it = prev.find((q) => q.id === activeItem.id)
      if (!it) return prev
      return updateQueueItem(prev, activeItem.id, {
        pageItems: updatePageItemFn(it.pageItems, pageId, { status: PAGE_STATUS.referenceOnly }),
        activePageId: null,
      })
    })
    setGlobalError('')
  }

  function handleUpdatePageText(pageId, text) {
    if (!activeItem) return
    setQueue((prev) => {
      const it = prev.find((q) => q.id === activeItem.id)
      if (!it) return prev
      return updateQueueItem(prev, activeItem.id, {
        pageItems: updatePageItemFn(it.pageItems, pageId, { extractedText: text }),
      })
    })
  }

  function handleUpdatePageDraftField(pageId, key, value) {
    if (!activeItem) return
    setQueue((prev) => {
      const it = prev.find((q) => q.id === activeItem.id)
      if (!it) return prev
      const pg = it.pageItems.find((p) => p.id === pageId)
      if (!pg) return prev
      const updated = { ...(pg.scanDraftFields || {}), [key]: value }
      const warnings = detectScannedDraftWarnings(updated, existingFiles)
      return updateQueueItem(prev, activeItem.id, {
        pageItems: updatePageItemFn(it.pageItems, pageId, {
          scanDraftFields: updated,
          scanDraftWarnings: warnings,
        }),
      })
    })
  }

  async function handleImportPageDraft(page) {
    if (!activeItem || !page || importing) return
    const fields = page.scanDraftFields || {}
    if (!fields.customerName) { setGlobalError('Name is required before importing.'); return }
    setImporting(true)
    setGlobalError('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) { setGlobalError(ready.error || 'Storage unavailable'); return }
      const storage = getSalesOsStorage()
      const imported = await commitScannedDraft(fields, storage)
      const freshFiles = await listCustomerFilesDurable(storage)
      setExistingFiles(freshFiles)
      setQueue((prev) => {
        const it = prev.find((q) => q.id === activeItem.id)
        if (!it) return prev
        return updateQueueItem(prev, activeItem.id, {
          pageItems: updatePageItemFn(it.pageItems, page.id, {
            status: PAGE_STATUS.imported,
            importedCount: 1,
            importedFileId: imported.id,
          }),
          activePageId: null,
        })
      })
    } catch (err) {
      setGlobalError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  // ---- Packet group handlers -------------------------------------------------

  function handleTogglePageSelect(pageId) {
    if (!activeItem) return
    const current = activeItem.selectedPageIds || []
    const has = current.includes(pageId)
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        selectedPageIds: has ? current.filter((id) => id !== pageId) : [...current, pageId],
      }),
    )
  }

  function handleBuildPacketGroupDraft() {
    if (!activeItem) return
    const selectedPages = (activeItem.pageItems || []).filter((p) =>
      (activeItem.selectedPageIds || []).includes(p.id),
    )
    if (!selectedPages.length) return
    const draft = buildPacketGroupDraft(selectedPages, {
      sourceFileName: activeItem.fileName,
      existingFiles,
    })
    setQueue((prev) =>
      updateQueueItem(prev, activeItem.id, {
        packetGroupDraft: draft,
        activePageId: null,
      }),
    )
    setGlobalError('')
  }

  function handleUpdatePacketDraftField(key, value) {
    if (!activeItem || !activeItem.packetGroupDraft) return
    const updated = revalidatePacketGroupDraft(
      { ...activeItem.packetGroupDraft, [key]: value },
      existingFiles,
    )
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { packetGroupDraft: updated }))
  }

  function handleClearPacketGroupDraft() {
    if (!activeItem) return
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { packetGroupDraft: null }))
    setGlobalError('')
  }

  async function handleImportPacketGroupDraft() {
    if (!activeItem || !activeItem.packetGroupDraft || importing) return
    const draft = activeItem.packetGroupDraft
    if (!draft.customerName) { setGlobalError('Customer name is required before importing.'); return }
    setImporting(true)
    setGlobalError('')
    try {
      const ready = await ensureSalesOsBoot()
      if (!ready.ok) { setGlobalError(ready.error || 'Storage unavailable'); return }
      const storage = getSalesOsStorage()
      const imported = await commitPacketGroupDraft(draft, storage)
      const freshFiles = await listCustomerFilesDurable(storage)
      setExistingFiles(freshFiles)
      setQueue((prev) => {
        const it = prev.find((q) => q.id === activeItem.id)
        if (!it) return prev
        const selectedIds = it.selectedPageIds || []
        const updatedPageItems = (it.pageItems || []).map((p) =>
          selectedIds.includes(p.id)
            ? { ...p, status: PAGE_STATUS.imported, importedCount: 1, importedFileId: imported.id }
            : p,
        )
        return updateQueueItem(prev, activeItem.id, {
          packetGroupDraft: null,
          selectedPageIds: [],
          pageItems: updatedPageItems,
        })
      })
    } catch (err) {
      setGlobalError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleUpdateActiveText(text) {
    if (!activeItem) return
    setQueue((prev) => updateQueueItem(prev, activeItem.id, { extractedText: text }))
  }

  function handleRemoveFromQueue(id) {
    fileRegistryRef.current.delete(id)
    // Clear preview cache for all pages of this item.
    for (const key of [...pagePreviewsRef.current.keys()]) {
      if (key.startsWith(`${id}:`)) pagePreviewsRef.current.delete(key)
    }
    const remaining = queue.filter((item) => item.id !== id)
    setQueue(remaining)
    if (id === activeId) setActiveId(remaining.length > 0 ? remaining[0].id : null)
  }

  function handleStartOver() {
    if (previewAbortRef.current) { previewAbortRef.current.abort(); previewAbortRef.current = null }
    fileRegistryRef.current.clear()
    pagePreviewsRef.current.clear()
    setActivePagePreview(null)
    setQueue([])
    setActiveId(null)
    setPasteText('')
    setGlobalError('')
  }

  async function handleProcessNextBatch(itemId) {
    const file = fileRegistryRef.current.get(itemId)
    if (!file) return
    const item = queue.find((q) => q.id === itemId)
    if (!item) return
    const alreadyProcessed = item.pageItems.length
    const total = item.totalPageCount || alreadyProcessed
    if (alreadyProcessed >= total) return
    const nextStart = alreadyProcessed + 1
    const nextLimit = Math.min(total, alreadyProcessed + OCR_PAGE_LIMIT)
    const newPageItems = Array.from(
      { length: nextLimit - alreadyProcessed },
      (_, i) => createPageItem(nextStart + i, total, itemId),
    )
    const pageIdMap = {}
    for (const p of newPageItems) pageIdMap[p.pageNumber] = p.id
    setQueue((prev) => {
      const it = prev.find((q) => q.id === itemId)
      if (!it) return prev
      return updateQueueItem(prev, itemId, {
        status: QUEUE_STATUS.ocrRunning,
        pageItems: [...it.pageItems, ...newPageItems],
        progressLabel: `Loading pages ${nextStart}–${nextLimit}…`,
      })
    })
    const { extractOcrPageByPage } = await import('../lib/pdfTextExtraction.js')
    await extractOcrPageByPage(file, {
      startPage: nextStart,
      maxPages: OCR_PAGE_LIMIT,
      onProgress: (prog) => {
        if (prog.stage === 'loading-pdf' || prog.stage === 'loading-engine') {
          setQueue((prev) =>
            updateQueueItem(prev, itemId, { progressLabel: ocrProgressLabel(prog) }),
          )
          return
        }
        if (prog.stage === 'rendering' || prog.stage === 'ocr') {
          const label = ocrProgressLabel(prog)
          setQueue((prev) => {
            const it = prev.find((q) => q.id === itemId)
            if (!it) return prev
            return updateQueueItem(prev, itemId, {
              progressLabel: label,
              pageItems: updatePageItemFn(it.pageItems, pageIdMap[prog.pageNumber], {
                status: PAGE_STATUS.ocrRunning,
                progressLabel: label,
              }),
            })
          })
        }
      },
      onPageComplete: async ({ pageNumber, text, dataUrl, worker }) => {
        const pageId = pageIdMap[pageNumber]
        const docType = detectDocType(text)
        const weak = isOcrTextWeak(text)
        const { fields: autoExtract } = buildScannedCustomerDraft(text)
        setQueue((prev) => {
          const it = prev.find((q) => q.id === itemId)
          if (!it) return prev
          return updateQueueItem(prev, itemId, {
            pageItems: updatePageItemFn(it.pageItems, pageId, {
              extractedText: text,
              detectedDocType: docType,
              autoExtract,
              status: weak ? PAGE_STATUS.needsCleanup : PAGE_STATUS.readyToReview,
              progressLabel: '',
            }),
          })
        })
        if (BENSON_QUOTE_DOC_TYPES.has(docType) && dataUrl && worker) {
          try {
            const zoneTexts = await extractBensonQuoteZoneTexts(dataUrl, worker)
            const zoneResult = buildBensonQuoteDraftFromZones(zoneTexts)
            setQueue((prev) => {
              const it = prev.find((q) => q.id === itemId)
              if (!it) return prev
              return updateQueueItem(prev, itemId, {
                pageItems: updatePageItemFn(it.pageItems, pageId, { zoneResult }),
              })
            })
          } catch {
            // Zone OCR failed — autoExtract (whole-page) is still set.
          }
        }
      },
    })
    setQueue((prev) =>
      updateQueueItem(prev, itemId, { status: QUEUE_STATUS.parsed, progressLabel: '' }),
    )
  }

  function downloadTemplate() {
    const csv = 'name,phone,email,address,notes,goal\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---- Packet group draft panel ----------------------------------------------

  function renderPacketGroupDraftPanel() {
    const draft = activeItem && activeItem.packetGroupDraft
    if (!draft) return null
    const canImport = Boolean(draft.customerName)
    const hasDupWarning = draft.warnings.some((w) => w.toLowerCase().includes('duplicate'))
    const LS = { fontSize: 10 }
    const FS = { marginTop: 4, width: '100%' }
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="eyebrow eyebrow-ink">SUGGESTED PACKET</span>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 11 }} onClick={handleClearPacketGroupDraft}>
            Cancel
          </button>
        </div>

        <div className="card-flat" style={{ padding: '8px 12px', marginBottom: 10 }}>
          <p className="body-sm" style={{ color: 'var(--slate)' }}>
            Pages: {draft.pageNumbers.join(', ')}
          </p>
          {draft.detectedDocTypes.length > 0 && (
            <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
              Types: {draft.detectedDocTypes.map((t) => DOC_TYPE_LABELS[t] || t).join(', ')}
            </p>
          )}
          {draft.quoteNumbers.length > 0 && (
            <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 2 }}>
              Quote #: {draft.quoteNumbers.join(', ')}
            </p>
          )}
        </div>

        {draft.warnings.length > 0 && (
          <div className="card" style={{ padding: 8, marginBottom: 10, borderLeft: `3px solid ${hasDupWarning ? 'var(--ember-dark)' : 'var(--ember)'}` }}>
            {draft.warnings.map((w, i) => (
              <p key={i} className="body-sm" style={{ color: 'var(--ember-dark)', margin: i > 0 ? '4px 0 0' : 0 }}>{w}</p>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 10 }}>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>NAME</label>
            <input className="field" value={draft.customerName} onChange={(e) => handleUpdatePacketDraftField('customerName', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>PHONE</label>
            <input className="field" value={draft.phone} onChange={(e) => handleUpdatePacketDraftField('phone', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>EMAIL</label>
            <input className="field" value={draft.email} onChange={(e) => handleUpdatePacketDraftField('email', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>ADDRESS</label>
            <input className="field" value={draft.address} onChange={(e) => handleUpdatePacketDraftField('address', e.target.value)} style={FS} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="eyebrow eyebrow-ink" style={LS}>NOTES</label>
          <textarea
            className="field"
            value={draft.notes}
            onChange={(e) => handleUpdatePacketDraftField('notes', e.target.value)}
            rows={2}
            style={{ marginTop: 4, width: '100%', resize: 'vertical' }}
          />
        </div>

        {globalError && (
          <div className="card" style={{ padding: 8, marginBottom: 8, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            onClick={handleImportPacketGroupDraft}
            disabled={importing || !canImport}
          >
            {importing ? 'Importing…' : 'Import packet →'}
          </button>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={handleClearPacketGroupDraft}>
            Clear draft
          </button>
        </div>
      </div>
    )
  }

  // ---- Pages phase (multi-page scanned PDF) ----------------------------------

  function renderPageDraftEditor(page) {
    const fields = page.scanDraftFields || {
      customerName: '', customerPhone: '', customerEmail: '',
      projectAddress: '', quoteNumber: '', quoteDate: '', existingNotes: '',
    }
    const warnings = page.scanDraftWarnings || []
    const canImport = Boolean(fields.customerName)
    const isWeak = page.status === PAGE_STATUS.needsCleanup
    const FS = { marginTop: 4, width: '100%' }
    const LS = { fontSize: 10 }
    return (
      <div>
        {/* Page preview image */}
        {activePagePreview && (
          <div style={{ marginBottom: 12, border: '1px solid var(--stone-150)', borderRadius: 6, overflow: 'hidden', lineHeight: 0, background: 'var(--stone-50)' }}>
            <img
              src={activePagePreview}
              alt={`Page ${page.pageNumber} preview`}
              style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }}
            />
          </div>
        )}

        {/* Weak OCR banner */}
        {isWeak && (
          <div className="card" style={{ padding: '8px 12px', marginBottom: 10, borderLeft: '3px solid var(--stone-200)' }}>
            <p className="body-sm" style={{ color: 'var(--slate)' }}>
              OCR returned little text — this may be a photo or blank page. Fields may be incomplete. You can still enter details manually.
            </p>
          </div>
        )}

        {/* Benson quote template hint */}
        {page.scanDraftTemplateHint && (
          <div className="card" style={{ padding: '6px 12px', marginBottom: 10, borderLeft: '3px solid var(--stone-200)' }}>
            <p className="body-sm" style={{ color: 'var(--slate)', margin: 0 }}>{page.scanDraftTemplateHint}</p>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="card" style={{ padding: 8, marginBottom: 10, borderLeft: '3px solid var(--ember-dark)' }}>
            {warnings.map((w, i) => (
              <p key={i} className="body-sm" style={{ color: 'var(--ember-dark)', margin: i > 0 ? '4px 0 0' : 0 }}>{w}</p>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 10 }}>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>NAME</label>
            <input className="field" value={fields.customerName} onChange={(e) => handleUpdatePageDraftField(page.id, 'customerName', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>PHONE</label>
            <input className="field" value={fields.customerPhone} onChange={(e) => handleUpdatePageDraftField(page.id, 'customerPhone', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>EMAIL</label>
            <input className="field" value={fields.customerEmail} onChange={(e) => handleUpdatePageDraftField(page.id, 'customerEmail', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>ADDRESS</label>
            <input className="field" value={fields.projectAddress} onChange={(e) => handleUpdatePageDraftField(page.id, 'projectAddress', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>QUOTE / ORDER #</label>
            <input className="field" value={fields.quoteNumber} onChange={(e) => handleUpdatePageDraftField(page.id, 'quoteNumber', e.target.value)} style={FS} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LS}>DATE</label>
            <input className="field" value={fields.quoteDate} onChange={(e) => handleUpdatePageDraftField(page.id, 'quoteDate', e.target.value)} style={FS} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="eyebrow eyebrow-ink" style={LS}>NOTES</label>
          <textarea
            className="field"
            value={fields.existingNotes}
            onChange={(e) => handleUpdatePageDraftField(page.id, 'existingNotes', e.target.value)}
            rows={2}
            style={{ marginTop: 4, width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn btn-quiet"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setShowPageOcrText((s) => !s)}
          >
            {showPageOcrText ? '▲ Hide OCR text' : '▼ Show OCR text'}
          </button>
          {showPageOcrText && (
            <textarea
              className="field"
              value={page.extractedText}
              onChange={(e) => handleUpdatePageText(page.id, e.target.value)}
              rows={6}
              style={{ marginTop: 6, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
            />
          )}
        </div>
        {globalError && (
          <div className="card" style={{ padding: 8, marginBottom: 8, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => handleImportPageDraft(page)} disabled={importing || !canImport}>
            {importing ? 'Importing…' : 'Import customer file →'}
          </button>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => handleMarkPageReferenceOnly(page.id)}>
            Mark reference only
          </button>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={handleDeactivatePage}>
            ← All pages
          </button>
        </div>
      </div>
    )
  }

  function renderPageDetail(page) {
    if (page.status === PAGE_STATUS.imported) {
      return (
        <div>
          <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--brass)', margin: 0 }}>Imported</p>
            {page.scanDraftFields?.customerName && (
              <p className="body-sm" style={{ color: 'var(--ink)', marginTop: 4 }}>{page.scanDraftFields.customerName}</p>
            )}
          </div>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={handleDeactivatePage}>
            ← All pages
          </button>
        </div>
      )
    }
    if (page.status === PAGE_STATUS.referenceOnly) {
      return (
        <div>
          {activePagePreview && (
            <div style={{ marginBottom: 10, border: '1px solid var(--stone-150)', borderRadius: 6, overflow: 'hidden', lineHeight: 0, background: 'var(--stone-50)' }}>
              <img src={activePagePreview} alt={`Page ${page.pageNumber} preview`} style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} />
            </div>
          )}
          <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 10 }}>
            Marked as reference only — no customer file will be created from this page.
          </p>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={handleDeactivatePage}>
            ← All pages
          </button>
        </div>
      )
    }
    if (page.status === PAGE_STATUS.waiting || page.status === PAGE_STATUS.ocrRunning) {
      return (
        <div>
          <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 6 }}>
            {page.progressLabel || (page.status === PAGE_STATUS.waiting ? 'Waiting for scan…' : 'Scanning…')}
          </p>
          <p className="body-sm" style={{ color: 'var(--slate-soft)' }}>
            This page will be ready to review when scanning completes.
          </p>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12, marginTop: 12 }} onClick={handleDeactivatePage}>
            ← All pages
          </button>
        </div>
      )
    }
    // For all other states (draftBuilt, needsCleanup, readyToReview), show the draft editor.
    // handleActivatePage auto-builds the draft on activation, so scanDraftFields should be set.
    return renderPageDraftEditor(page)
  }

  function renderPagesPhase() {
    const pages = activeItem.pageItems || []
    const activePage = pages.find((p) => p.id === activeItem.activePageId) || null
    const selectedPageIds = activeItem.selectedPageIds || []
    const selectedCount = selectedPageIds.length
    const suggestions = suggestPageGroups(pages)
    const importedCount = pages.filter((p) => p.status === PAGE_STATUS.imported).length
    const hasPacketDraft = Boolean(activeItem.packetGroupDraft)

    const totalPageCount = activeItem.totalPageCount || pages.length
    const isTruncated = totalPageCount > pages.length
    const isOcrActive = activeItem.status === QUEUE_STATUS.ocrRunning

    return (
      <div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="body-sm" style={{ color: 'var(--slate)', fontWeight: 600 }}>
              {scanBatchLabel(pages.length, totalPageCount, OCR_PAGE_LIMIT)}
            </span>
            {isOcrActive && (
              <span className="body-sm" style={{ color: 'var(--slate)' }}>{activeItem.progressLabel}</span>
            )}
            {importedCount > 0 && (
              <span className="body-sm" style={{ color: 'var(--brass)' }}>{importedCount} imported</span>
            )}
            {selectedCount > 0 && !hasPacketDraft && (
              <span className="body-sm" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {selectedCount} selected
              </span>
            )}
          </div>
          <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 3 }}>
            OCR may suggest fields. Review each page before importing. Nothing is sent. BisTrack is not touched.
          </p>
        </div>

        {isTruncated && !isOcrActive && (
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: 12 }}
              onClick={() => handleProcessNextBatch(activeItem.id)}
            >
              Process next {Math.min(OCR_PAGE_LIMIT, totalPageCount - pages.length)} pages →
            </button>
            <span className="body-sm" style={{ color: 'var(--slate-soft)' }}>
              {totalPageCount - pages.length} more page{totalPageCount - pages.length === 1 ? '' : 's'} not yet scanned
            </span>
          </div>
        )}

        {suggestions.length > 0 && !hasPacketDraft && (
          <div className="card" style={{ padding: '8px 12px', marginBottom: 10, borderLeft: '3px solid var(--brass)' }}>
            {suggestions.map((s, i) => (
              <p key={i} className="body-sm" style={{ color: 'var(--slate)', margin: i > 0 ? '4px 0 0' : 0 }}>
                {s.label}
              </p>
            ))}
          </div>
        )}

        {selectedCount > 0 && !hasPacketDraft && (
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              onClick={handleBuildPacketGroupDraft}
            >
              Create packet draft from {selectedCount} page{selectedCount === 1 ? '' : 's'} →
            </button>
          </div>
        )}

        {activeItem.errorMessage && (
          <div className="card" style={{ padding: '6px 12px', marginBottom: 10, borderLeft: '3px solid var(--stone-200)' }}>
            <p className="body-sm" style={{ color: 'var(--slate)' }}>{activeItem.errorMessage}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ width: 220, flexShrink: 0, maxHeight: '65vh', overflowY: 'auto' }}>
            {pages.map((page) => (
              <PageRow
                key={page.id}
                page={page}
                isActive={!hasPacketDraft && page.id === activeItem.activePageId}
                onActivate={hasPacketDraft ? () => {} : handleActivatePage}
                isSelected={selectedPageIds.includes(page.id)}
                onToggleSelect={handleTogglePageSelect}
              />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {hasPacketDraft
              ? renderPacketGroupDraftPanel()
              : activePage
                ? renderPageDetail(activePage)
                : (
                  <p className="body-sm" style={{ color: 'var(--slate)', paddingTop: 8 }}>
                    Click a page to review it. OCR-suggested fields will open for editing. Import when the name looks right.
                  </p>
                )
            }
          </div>
        </div>

        {importedCount > 0 && onOpenFilesList && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 16, fontSize: 12 }}
            onClick={onOpenFilesList}
          >
            View Customer Files →
          </button>
        )}
      </div>
    )
  }

  // ---- Scan draft phase ------------------------------------------------------

  function renderScanDraftPhase() {
    const fields = activeItem.scanDraftFields || {
      customerName: '', customerPhone: '', customerEmail: '',
      projectAddress: '', quoteNumber: '', quoteDate: '', existingNotes: '',
    }
    const warnings = activeItem.scanDraftWarnings || []
    const canImport = Boolean(fields.customerName)
    const FIELD_STYLE = { marginTop: 4, width: '100%' }
    const LABEL_STYLE = { fontSize: 10 }
    return (
      <div>
        <p className="body-sm" style={{ color: 'var(--slate)', marginBottom: 12 }}>
          OCR finished. Review before importing.
        </p>
        {warnings.length > 0 && (
          <div className="card" style={{ padding: 10, marginBottom: 14, borderLeft: '3px solid var(--ember-dark)' }}>
            {warnings.map((w, i) => (
              <p key={i} className="body-sm" style={{ color: 'var(--ember-dark)', margin: i > 0 ? '4px 0 0' : 0 }}>{w}</p>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 14 }}>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>NAME</label>
            <input className="field" value={fields.customerName} onChange={(e) => handleUpdateScanDraftField('customerName', e.target.value)} style={FIELD_STYLE} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>PHONE</label>
            <input className="field" value={fields.customerPhone} onChange={(e) => handleUpdateScanDraftField('customerPhone', e.target.value)} style={FIELD_STYLE} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>EMAIL</label>
            <input className="field" value={fields.customerEmail} onChange={(e) => handleUpdateScanDraftField('customerEmail', e.target.value)} style={FIELD_STYLE} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>ADDRESS</label>
            <input className="field" value={fields.projectAddress} onChange={(e) => handleUpdateScanDraftField('projectAddress', e.target.value)} style={FIELD_STYLE} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>QUOTE NUMBER</label>
            <input className="field" value={fields.quoteNumber} onChange={(e) => handleUpdateScanDraftField('quoteNumber', e.target.value)} style={FIELD_STYLE} />
          </div>
          <div>
            <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>QUOTE DATE</label>
            <input className="field" value={fields.quoteDate} onChange={(e) => handleUpdateScanDraftField('quoteDate', e.target.value)} style={FIELD_STYLE} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="eyebrow eyebrow-ink" style={LABEL_STYLE}>NOTES</label>
          <textarea
            className="field"
            value={fields.existingNotes}
            onChange={(e) => handleUpdateScanDraftField('existingNotes', e.target.value)}
            rows={3}
            style={{ marginTop: 4, width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="btn btn-quiet"
            style={{ fontSize: 12, padding: '3px 10px' }}
            onClick={() => setShowScanOcrText((s) => !s)}
          >
            {showScanOcrText ? '▲ Hide extracted text' : '▼ Show extracted text / Edit OCR text'}
          </button>
          {showScanOcrText && (
            <textarea
              className="field"
              value={activeItem.extractedText}
              onChange={(e) => handleUpdateActiveText(e.target.value)}
              rows={8}
              style={{ marginTop: 8, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
            />
          )}
        </div>
        {globalError && (
          <div className="card" style={{ padding: 10, marginBottom: 10, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImportScanDraft}
            disabled={importing || !canImport}
          >
            {importing ? 'Importing…' : 'Import this draft →'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={handleParseActive}
          >
            Parse as table instead
          </button>
        </div>
      </div>
    )
  }

  // ---- Active panel content --------------------------------------------------

  function renderActiveContent() {
    if (!activeItem) {
      return (
        <p className="body-sm" style={{ color: 'var(--slate)', paddingTop: 32 }}>
          Select a file from the queue to review it.
        </p>
      )
    }

    const { status, phase, errorMessage } = activeItem

    // Page-split mode takes precedence over status checks so the page list
    // renders even while OCR is still running on later pages.
    if (phase === 'pages') {
      return renderPagesPhase()
    }

    if (status === QUEUE_STATUS.waiting) {
      return (
        <p className="body-sm" style={{ color: 'var(--slate)', paddingTop: 32 }}>In queue…</p>
      )
    }

    if (status === QUEUE_STATUS.extracting || status === QUEUE_STATUS.ocrRunning) {
      const isPdfReading = activeItem.fileType === 'pdf' && activeItem.progressLabel === 'Reading PDF…'
      return (
        <div style={{ paddingTop: 24 }}>
          <p className="body-sm" style={{ color: 'var(--slate)' }}>
            {activeItem.progressLabel || 'Processing…'}
          </p>
          {isPdfReading && (
            <p className="body-sm" style={{ color: 'var(--slate-soft)', marginTop: 6 }}>
              Large files may take a moment to load.
            </p>
          )}
          {errorMessage && (
            <p className="body-sm" style={{ color: 'var(--ember-dark)', marginTop: 8 }}>{errorMessage}</p>
          )}
        </div>
      )
    }

    if (status === QUEUE_STATUS.error) {
      return (
        <div style={{ paddingTop: 8 }}>
          <div className="card" style={{ padding: 12, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{errorMessage || 'An error occurred.'}</p>
          </div>
          <button
            type="button"
            className="btn btn-quiet"
            style={{ marginTop: 12 }}
            onClick={() => handleRemoveFromQueue(activeItem.id)}
          >
            Remove from queue
          </button>
        </div>
      )
    }

    if (phase === 'input') {
      const isWeak = status === QUEUE_STATUS.needsCleanup
      const canParse = activeItem.extractedText.trim().length > 0
      return (
        <div>
          {errorMessage && (
            <div className="card" style={{ padding: 10, marginBottom: 12, borderLeft: '3px solid var(--ember)' }}>
              <p className="body-sm" style={{ color: 'var(--ink)' }}>{errorMessage}</p>
            </div>
          )}
          {isWeak && (
            <div className="card" style={{ padding: 10, marginBottom: 12, borderLeft: '3px solid var(--ember-dark)' }}>
              <p className="body-sm" style={{ color: 'var(--ember-dark)' }}>
                OCR finished, but the result may need cleanup before parsing. Edit the text below if needed.
              </p>
            </div>
          )}
          <label htmlFor={`text-${activeItem.id}`} className="eyebrow eyebrow-ink">
            EXTRACTED TEXT
          </label>
          <textarea
            id={`text-${activeItem.id}`}
            className="field"
            value={activeItem.extractedText}
            onChange={(e) => handleUpdateActiveText(e.target.value)}
            rows={10}
            style={{ marginTop: 8, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
          />
          {globalError && (
            <div className="card" style={{ padding: 10, margin: '10px 0', borderLeft: '3px solid var(--ember)' }}>
              <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleParseActive}
              disabled={!canParse}
            >
              Parse as table / list →
            </button>
            {activeItem.fileType === 'pdf' && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={handleBuildScanDraft}
                disabled={!canParse}
              >
                Build customer draft from this scan
              </button>
            )}
          </div>
        </div>
      )
    }

    if (phase === 'scan-draft') {
      return renderScanDraftPhase()
    }

    if (phase === 'review') {
      const issueRows = (activeItem.draftRows || []).filter((r) => r.status !== 'ready')
      const readyRows = (activeItem.draftRows || []).filter((r) => r.status === 'ready')
      return (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <span className="body-sm" style={{ color: 'var(--slate)' }}>
              {(activeItem.draftRows || []).length} rows parsed
            </span>
            {readyRows.length > 0 && (
              <span className="body-sm" style={{ color: 'var(--brass)' }}>· {readyRows.length} ready</span>
            )}
            {issueRows.length > 0 && (
              <span className="body-sm" style={{ color: 'var(--ember-dark)' }}>
                · {issueRows.length} {issueRows.length === 1 ? 'needs a decision' : 'need a decision'}
              </span>
            )}
            <span className="body-sm" style={{ color: 'var(--slate)' }}>· {activeSelectedCount} selected</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" className="btn btn-quiet" style={{ padding: '4px 10px' }} onClick={handleSelectAll}>
              Select all importable
            </button>
            <button type="button" className="btn btn-quiet" style={{ padding: '4px 10px' }} onClick={handleDeselectAll}>
              Deselect all
            </button>
          </div>

          {globalError && (
            <div className="card" style={{ padding: 10, marginBottom: 12, borderLeft: '3px solid var(--ember)' }}>
              <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
            </div>
          )}

          {issueRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <span className="eyebrow eyebrow-ember">NEEDS A DECISION ({issueRows.length})</span>
              <div style={{ marginTop: 6 }}>
                {issueRows.map((row) => (
                  <IssueRow
                    key={row._id}
                    row={row}
                    checked={activeSelectedSet.has(row._id)}
                    disabled={row.status === 'missing-name'}
                    onToggle={handleToggleRow}
                  />
                ))}
              </div>
            </div>
          )}

          {readyRows.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <span className="eyebrow eyebrow-ink">READY TO IMPORT ({readyRows.length})</span>
              <div style={{ marginTop: 6 }}>
                {readyRows.map((row) => (
                  <ReadyRow
                    key={row._id}
                    row={row}
                    checked={activeSelectedSet.has(row._id)}
                    onToggle={handleToggleRow}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImportActive}
              disabled={importing || activeSelectedCount === 0}
            >
              {importing ? 'Importing…' : `Import ${activeSelectedCount} selected`}
            </button>
          </div>
        </div>
      )
    }

    if (phase === 'result') {
      const { imported = [], errors = [] } = activeItem.importResult || {}
      return (
        <div style={{ maxWidth: 480 }}>
          <div className="card-flat" style={{ padding: '20px 22px', marginBottom: 16 }}>
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
            <div style={{ marginBottom: 16 }}>
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
          {onOpenFilesList && (
            <button type="button" className="btn btn-primary" onClick={onOpenFilesList}>
              View Customer Files →
            </button>
          )}
        </div>
      )
    }

    return null
  }

  // ---- Empty state -----------------------------------------------------------

  function renderEmptyState() {
    return (
      <div style={{ maxWidth: 720 }}>
        <h2 className="serif-h h2">Bulk Import.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Upload one or more files, or paste a customer list. Review every row before importing.
        </p>
        <hr className="rule-brass" style={{ margin: '20px 0' }} />

        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow eyebrow-ink">UPLOAD FILES</span>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
              id="bulk-file-picker"
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
            >
              Choose files…
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={downloadTemplate}
              style={{ fontSize: 12, padding: '3px 10px' }}
            >
              ↓ CSV template
            </button>
          </div>
          <p className="body-sm" style={{ color: 'var(--slate)', marginTop: 8 }}>
            CSV, TSV, TXT, or PDF. Recognized columns: name, phone, email, address, notes, goal.
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
            onChange={(e) => { setPasteText(e.target.value); setGlobalError('') }}
            placeholder={'name,phone,email,address,notes\nSmith, John,815-555-0001,john@example.com,"123 Main St, Rockford"'}
            rows={6}
            style={{ marginTop: 8, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
          />
        </div>

        {globalError && (
          <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '3px solid var(--ember)' }}>
            <p className="body-sm" style={{ color: 'var(--ink)' }}>{globalError}</p>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={handlePasteQueue}
          disabled={!pasteText.trim()}
        >
          Parse and review →
        </button>
      </div>
    )
  }

  // ---- Queue mode layout -----------------------------------------------------

  function renderQueueMode() {
    const allDone = queue.every(
      (item) => item.status === QUEUE_STATUS.imported || item.status === QUEUE_STATUS.error,
    )
    return (
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1100 }}>
        {/* Sidebar */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="eyebrow eyebrow-ink" style={{ fontSize: 11 }}>FILES ({queue.length})</span>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => addMoreRef.current && addMoreRef.current.click()}
            >
              + Add more
            </button>
            <input
              ref={addMoreRef}
              type="file"
              multiple
              accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto', marginBottom: 12 }}>
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                isActive={item.id === activeId}
                onActivate={setActiveId}
                onRemove={handleRemoveFromQueue}
              />
            ))}
          </div>

          <button
            type="button"
            className="btn btn-quiet"
            style={{ width: '100%', fontSize: 12 }}
            onClick={handleStartOver}
          >
            Start over
          </button>

          {allDone && onOpenFilesList && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, fontSize: 12 }}
              onClick={onOpenFilesList}
            >
              View Customer Files →
            </button>
          )}
        </div>

        {/* Active panel */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 780 }}>
          {activeItem && (
            activeItem.phase === 'pages'
              ? (
                <div style={{ marginBottom: 14 }}>
                  <h3 className="serif-h h3" style={{ margin: '0 0 2px' }}>Scan Packet Review</h3>
                  <p className="body-sm" style={{ color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeItem.fileName}
                  </p>
                </div>
              )
              : (
                <h3
                  className="serif-h h3"
                  style={{ margin: '0 0 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {activeItem.fileName || 'Pasted text'}
                </h3>
              )
          )}
          {renderActiveContent()}
        </div>
      </div>
    )
  }

  // ---- Render ----------------------------------------------------------------

  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 40px' }}>
          {queue.length === 0 ? renderEmptyState() : renderQueueMode()}
        </div>
      </div>
      <NextActionBar
        action={
          queue.length === 0
            ? 'Upload a CSV or scanned PDF packet to get started.'
            : activeItem?.phase === 'pages'
              ? 'Click a page, review the suggested fields, and import. OCR assists — you decide.'
              : 'Click a file in the queue to review and import it.'
        }
        why="Imported files appear in Customer Files and Today. Nothing is sent. BisTrack is not touched."
        dontForget="Start a Visit for a walk-in customer — bulk import is for batching contacts from a packet."
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
