import { useEffect, useMemo, useRef, useState } from 'react'
import { vendorWebReferenceManifest } from '../data/vendorWebReferenceManifest.js'
import { extractTextFromPdf } from '../lib/pdfTextExtraction.js'
import { buildDocumentPageIndex, matchFileToManifestItem, normalizeManifest, parseManifestCsv, parseManifestJson, summarizePageIndex } from '../lib/binderPageIndex.js'
import { clearBinderPageIndex, loadBinderPageIndex, mergeBinderPageIndex } from '../lib/binderIndexStorage.js'

const C = { mid: '#2d4a36', copper: '#b9743a', rust: '#8a3a1e', ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)' }
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const mono = { fontFamily: '"Courier New",Courier,monospace' }

function ManifestStats({ manifestItems, indexRecords }) {
  const summary = summarizePageIndex(indexRecords)
  const directPdfCount = manifestItems.filter((item) => item.pdfUrl).length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
      {[["Refs", manifestItems.length], ["PDF URLs", directPdfCount], ["Indexed docs", summary.documents], ["Pages", summary.pages]].map(([label, value]) => (
        <div key={label} style={{ background: '#fff', border: `1px solid ${C.border}`, padding: '7px 8px' }}>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 7 }}>{label}</div>
          <div style={{ ...mono, color: C.ink, fontSize: 14, fontWeight: 800, marginTop: 1 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
export default function BinderIndexPanel({ compact = false, onIndexChange }) {
  const folderInputRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [manifestItems, setManifestItems] = useState(() => normalizeManifest(vendorWebReferenceManifest))
  const [indexRecords, setIndexRecords] = useState(() => loadBinderPageIndex())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [lastReport, setLastReport] = useState('')
  const [errors, setErrors] = useState([])
  useEffect(() => { onIndexChange?.(indexRecords) }, [indexRecords, onIndexChange])
  useEffect(() => { if (folderInputRef.current) { folderInputRef.current.setAttribute('webkitdirectory', ''); folderInputRef.current.setAttribute('directory', '') } }, [])
  const summary = useMemo(() => summarizePageIndex(indexRecords), [indexRecords])
  const hasIndex = summary.pages > 0
  async function handleManifestUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await readTextFile(file)
      const parsed = file.name.toLowerCase().endsWith('.csv') ? parseManifestCsv(text) : parseManifestJson(text)
      if (!parsed.length) throw new Error('No manifest rows found.')
      setManifestItems(parsed); setLastReport(`Loaded ${parsed.length} manifest records from ${file.name}`); setErrors([])
    } catch (error) { setErrors([`Manifest import failed: ${error.message || error}`]) }
  }
  async function handlePdfFiles(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith('.pdf'))
    event.target.value = ''
    if (!files.length) return
    setBusy(true); setProgress('Preparing binder import…'); setErrors([])
    const incoming = []; const failed = []; let matched = 0
    for (const [index, file] of files.entries()) {
      try {
        const manifestItem = matchFileToManifestItem(file, manifestItems)
        if (!manifestItem) { failed.push(`${file.name}: no matching manifest record found`); continue }
        matched += 1; setProgress(`Indexing ${index + 1}/${files.length}: ${file.name}`)
        const extracted = await extractTextFromPdf(file)
        const records = buildDocumentPageIndex({ manifestItem, file, pages: extracted.pages, extractionSource: extracted.embeddedTextLikelyMissing ? 'embedded-text-low-confidence' : 'embedded-text' })
        if (!records.length) failed.push(`${file.name}: no embedded text found`); else incoming.push(...records)
      } catch (error) { failed.push(`${file.name}: ${error.message || error}`) }
    }
    const merged = mergeBinderPageIndex(indexRecords, incoming)
    setIndexRecords(merged); setProgress('')
    setLastReport(`Indexed ${incoming.length} pages from ${matched} matched PDFs. ${failed.length ? `${failed.length} file(s) need attention.` : 'No import errors.'}`)
    setErrors(failed.slice(0, 8)); setBusy(false)
  }
  function handleClearIndex() { const cleared = clearBinderPageIndex(); setIndexRecords(cleared); setLastReport('Cleared local Smart Binder page index.'); setErrors([]) }
  return (
    <div style={{ marginTop: 10, padding: compact ? 8 : 10, background: 'rgba(255,255,255,0.62)', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eyebrow, color: C.mid, fontSize: 7.5 }}>Binder Page Index</div>
          <div style={{ fontSize: compact ? 10.5 : 11.5, color: C.inkMid, marginTop: 2 }}>{hasIndex ? `${summary.documents} docs · ${summary.pages} pages searchable` : 'Import downloaded PDFs to search exact pages.'}</div>
        </div>
        <button type="button" className="wb-btn" onClick={() => setExpanded(!expanded)} style={{ fontSize: 10 }}>{expanded ? 'Hide' : 'Import / manage'}</button>
      </div>
      {expanded && (
        <div style={{ marginTop: 9, display: 'grid', gap: 9 }}>
          <ManifestStats manifestItems={manifestItems} indexRecords={indexRecords} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label className="wb-btn wb-btn--primary" style={{ fontSize: 10, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>Import PDF folder<input ref={folderInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={handlePdfFiles} disabled={busy} hidden /></label>
            <label className="wb-btn" style={{ fontSize: 10, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>Replace manifest<input type="file" accept="application/json,.json,text/csv,.csv" onChange={handleManifestUpload} disabled={busy} hidden /></label>
            <button type="button" className="wb-btn" onClick={handleClearIndex} disabled={busy || !hasIndex} style={{ fontSize: 10, opacity: busy || !hasIndex ? 0.45 : 1 }}>Clear index</button>
          </div>
          <div style={{ fontSize: 10.5, color: C.inkMid, lineHeight: 1.45 }}>Select the whole downloaded vendor-reference folder. Chrome/Edge will pass the PDFs to the app; the importer matches filenames to the manifest, extracts embedded text, and stores a compact page index in this browser.</div>
          {busy && <div style={{ fontSize: 10.5, color: C.copper, fontWeight: 700 }}>{progress}</div>}
          {lastReport && <div style={{ fontSize: 10.5, color: C.mid, fontWeight: 700 }}>{lastReport}</div>}
          {errors.length > 0 && <div style={{ padding: '7px 9px', background: 'rgba(138,58,30,0.08)', border: `1px solid rgba(138,58,30,0.2)`, color: C.rust, fontSize: 10.5, lineHeight: 1.45 }}><strong>Needs attention:</strong><ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        </div>
      )}
    </div>
  )
}
