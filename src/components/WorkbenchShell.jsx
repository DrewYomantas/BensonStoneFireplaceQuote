import { useCallback, useMemo, useRef, useState } from 'react'
import {
  createEmptyFieldState,
  defaultFieldValues,
  getFieldLabel,
  multilineFields,
} from '../lib/fieldContract.js'
import { parseBisTrackText } from '../lib/biztrackPdfParser.js'
import { evaluateCurrentSetup } from '../lib/currentSetup.js'
import { extractOcrFromPdf, extractTextFromPdf } from '../lib/pdfTextExtraction.js'
import { extractScannedBisTrackFields } from '../lib/scannedPacketParser.js'
import { getEstimateBasisSummary, hasUnclassifiedLineItems } from '../lib/proposalDetail.js'
import { buildQuotePolishQueueDraft, mergeQuotePolishOpportunity } from '../lib/quotePolishOpportunity.js'
import { listOpportunities, saveOpportunity, updateOpportunity } from '../lib/opportunities.js'
import CustomerProposal from './CustomerProposal.jsx'
import OldQuoteRecovery from './OldQuoteRecovery.jsx'
import { deriveShowroomDisplayContext, listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import { listVendors, matchVendorToQuote } from '../lib/vendorPriceBooks.js'
import { opportunityToQuoteFields } from '../lib/opportunityWorkspace.js'

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  forest: '#1f3527',
  mid: '#2d4a36',
  parchment: '#f3ead6',
  dark: '#ece1c5',
  paper: '#faf6ec',
  copper: '#b9743a',
  gold: '#c9a24c',
  rust: '#8a3a1e',
  ink: '#2a221a',
  inkMid: '#5a4f3f',
  inkLight: '#8a7c64',
  wood: '#3d2e1d',
  border: 'rgba(50,38,22,0.18)',
}
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const mono = { fontFamily: '"Courier New",Courier,monospace' }
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }

// ─── Logic helpers ────────────────────────────────────────────────
const emptyContext = {
  unmatchedLines: [],
  deliveryDateMentioned: false,
  documentType: 'quote',
  outputLabel: 'Fireplace Project Proposal',
}

function applyDefaults(fields) {
  const next = { ...fields }
  for (const [k, v] of Object.entries(defaultFieldValues)) {
    if (!next[k]) next[k] = v
  }
  return next
}

function buildSendReadinessWarnings({ fields, lineItems, proposalMode, setupGuidance }) {
  if (proposalMode !== 'detailed') return []
  const w = []
  if (hasUnclassifiedLineItems(lineItems)) w.push('Some line items need category review before sending.')
  if (getEstimateBasisSummary(lineItems, fields).fallbackUsed) w.push('Estimate basis is using the attached line-item quote fallback.')
  if (setupGuidance?.blockers?.length) w.push('Current setup or goal details need internal review before sending.')
  const age = fields.QUOTE_DATE
    ? Math.floor((Date.now() - new Date(fields.QUOTE_DATE).getTime()) / 86400000)
    : null
  if (age !== null && !Number.isNaN(age) && age > 90)
    w.push('Quote date is older than 90 days. Confirm pricing before sending.')
  return w
}

function uploadStageIndex(busy, rawText, reviewState, warnings) {
  if (busy) return 0
  if (!rawText) return -1
  if (reviewState === 'reviewed') return 4
  if (reviewState === 'follow-up') return 3
  if (warnings.length > 0) return 2
  return 1
}

function ticketStageIndex(status) {
  const map = {
    'new-intake': 0,
    'needs-review': 2,
    'blocked-missing-info': 2,
    'follow-up-needed': 3,
    'ready-for-proposal': 4,
    'proposal-sent': 4,
    'waiting-on-customer': 4,
  }
  return map[status] ?? 1
}

// ─── Atoms ────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ lineHeight: 1.1 }}>
      <div style={{ ...serif, fontSize: 9, letterSpacing: '0.28em', color: C.parchment, fontWeight: 600, textTransform: 'uppercase' }}>Benson Stone</div>
      <div style={{ ...serif, fontSize: 14, letterSpacing: '0.04em', color: C.parchment, fontWeight: 600, marginTop: 3 }}>Fireplace Dept.</div>
    </div>
  )
}

function ConfidenceMeter({ value }) {
  const ticks = 12
  const filled = Math.round(((value ?? 0) / 100) * ticks)
  const barColor = value > 75 ? C.mid : value > 50 ? C.gold : C.copper
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <div key={i} style={{ width: 5, height: 12, borderRadius: 1, background: i < filled ? barColor : 'rgba(50,38,22,0.12)' }} />
      ))}
      {value != null && (
        <span style={{ ...mono, marginLeft: 5, fontSize: 10, color: C.inkMid }}>{value}%</span>
      )}
    </div>
  )
}

const STATUS_STYLE = {
  'ready-for-proposal': { bg: C.mid, fg: C.parchment, label: 'Ready for Proposal' },
  'new-intake':         { bg: C.copper, fg: '#fff', label: 'New Intake' },
  'needs-review':       { bg: 'rgba(138,58,30,0.14)', fg: C.rust, label: 'Needs Review' },
  'blocked-missing-info': { bg: 'rgba(138,58,30,0.14)', fg: C.rust, label: 'Blocked / Missing Info' },
  'follow-up-needed':   { bg: 'rgba(201,162,76,0.22)', fg: '#6b541c', label: 'Follow-Up Needed' },
  'waiting-on-customer':{ bg: 'rgba(201,162,76,0.22)', fg: '#6b541c', label: 'Waiting on Customer' },
  'proposal-sent':      { bg: 'rgba(45,74,54,0.12)', fg: C.mid, label: 'Proposal Sent' },
  warm:                 { bg: 'rgba(45,74,54,0.12)', fg: C.mid, label: 'Warm Lead' },
}

function StatusChip({ status, label }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.warm
  return (
    <span style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, padding: '3px 8px', borderRadius: 2, background: s.bg, color: s.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {label || s.label}
    </span>
  )
}

const STAGES = ['Setup', 'OCR Cleanup', 'Missing Info', 'Follow-Up', 'Polish & Send']

function StageStrip({ activeIndex }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginTop: 12 }}>
      {STAGES.map((label, i) => {
        const done = i < activeIndex
        const here = i === activeIndex
        return (
          <div key={label} style={{ background: here ? 'rgba(185,116,58,0.12)' : done ? 'rgba(45,74,54,0.08)' : C.dark, border: `1px solid ${here ? C.copper : done ? 'rgba(45,74,54,0.2)' : C.border}`, padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0, background: done ? C.mid : here ? C.copper : 'transparent', border: !done && !here ? `1px solid rgba(50,38,22,0.3)` : 'none', color: C.parchment, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {done ? '✓' : i + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...eyebrow, fontSize: 7.5, color: here ? C.copper : C.inkLight, marginBottom: 1 }}>
                {done ? 'DONE' : here ? 'NOW' : `STAGE ${i + 1}`}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Placeholder toast ────────────────────────────────────────────
function PlaceholderToast({ msg, onDismiss }) {
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', bottom: 80, right: 24, zIndex: 1000, background: C.ink, color: C.parchment, padding: '10px 16px', fontSize: 12, borderRadius: 3, boxShadow: '0 6px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 380 }}>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(243,234,214,0.6)', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
    </div>
  )
}

// ─── Reference Drawer ─────────────────────────────────────────────
function ReferenceDrawer({ item, onClose }) {
  if (!item) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 400, height: '100%', background: C.wood, borderLeft: `3px solid ${C.copper}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}
      >
        <div style={{ background: C.forest, color: C.parchment, padding: '14px 16px', borderBottom: `2px solid ${C.copper}`, flexShrink: 0 }}>
          <div style={{ ...eyebrow, color: C.gold, fontSize: 8.5 }}>Reference Viewer</div>
          <div style={{ ...serif, fontSize: 16, fontWeight: 600, marginTop: 3 }}>{item.title}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(243,234,214,0.65)', marginTop: 2 }}>{item.sub}</div>
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {item.badge && (
            <div style={{ display: 'inline-flex' }}>
              <span className={`wb-pill wb-pill--${item.badge === 'Current' || item.badge === 'Live' ? 'gold' : 'green'}`}>{item.badge}</span>
            </div>
          )}

          {item.danger && (
            <div style={{ padding: '10px 12px', background: 'rgba(138,58,30,0.18)', border: `1px solid rgba(138,58,30,0.3)`, borderLeft: `3px solid ${C.rust}`, fontSize: 11, color: C.parchment, lineHeight: 1.55 }}>
              Internal only — this price book contains dealer cost. Never share with customers.
            </div>
          )}

          <div style={{ padding: '14px 14px', background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.mid}`, fontSize: 12, color: C.inkMid, lineHeight: 1.65 }}>
            Reference viewer will open this document in-app once the local reference service is connected.
            The document is already indexed and will be instantly available when the viewer launches.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: C.parchment, opacity: 0.85 }}>
            {item.category && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Category</div>
                <div style={{ marginTop: 3 }}>{item.category}</div>
              </div>
            )}
            {item.vendor && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Vendor</div>
                <div style={{ marginTop: 3 }}>{item.vendor}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid rgba(255,255,255,0.08)`, flexShrink: 0 }}>
          <button className="wb-btn" onClick={onClose} style={{ width: '100%', justifyContent: 'center', background: 'rgba(243,234,214,0.08)', color: C.parchment, borderColor: 'rgba(243,234,214,0.2)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Proposal Modal (fullscreen preview) ─────────────────────────
function ProposalModal({ fields, parseContext, lineItems, proposalMode, lineItemQuoteAttached, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(20,14,8,0.85)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ background: C.forest, color: C.parchment, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2px solid ${C.copper}`, flexShrink: 0 }}>
        <div style={{ ...serif, fontSize: 14, fontWeight: 600, flex: 1 }}>Proposal Preview</div>
        <button className="wb-btn" style={{ fontSize: 10, padding: '4px 10px', background: 'transparent', color: C.parchment, borderColor: 'rgba(243,234,214,0.3)' }} onClick={() => window.print()}>
          Print / Save PDF
        </button>
        <button className="wb-btn" style={{ fontSize: 10, padding: '4px 10px', background: C.rust, color: '#fff', borderColor: C.rust }} onClick={onClose}>
          Close ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 820 }}>
          <CustomerProposal
            fields={fields}
            parseContext={parseContext}
            lineItems={lineItems}
            proposalMode={proposalMode}
            lineItemQuoteAttached={lineItemQuoteAttached}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Scaled Proposal Preview ──────────────────────────────────────
// Renders proposal at natural page width then scales to fit the narrow column.
const PROPOSAL_NATURAL_W = 820
const PROPOSAL_SCALE = 0.45

function ScaledProposalPreview({ fields, parseContext, lineItems, proposalMode, lineItemQuoteAttached, onExpand }) {
  return (
    <div style={{ background: C.wood, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(0,0,0,0.35)', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ ...eyebrow, color: C.gold, fontSize: 7.5, flex: 1 }}>Proposal Preview</span>
        <button className="wb-btn" style={{ fontSize: 9, padding: '3px 8px', background: 'transparent', color: C.parchment, borderColor: 'rgba(243,234,214,0.25)' }} onClick={onExpand}>
          Expand ↗
        </button>
        <button className="wb-btn" style={{ fontSize: 9, padding: '3px 8px', background: 'transparent', color: C.parchment, borderColor: 'rgba(243,234,214,0.25)' }} onClick={() => window.print()}>
          Print
        </button>
      </div>
      {/* Scaled content — overflow hidden clips horizontal; vertical scroll at natural height */}
      <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', padding: '12px 8px' }}>
        <div
          style={{
            width: PROPOSAL_NATURAL_W,
            transformOrigin: 'top left',
            transform: `scale(${PROPOSAL_SCALE})`,
            // Collapse the layout height to match visual height so scroll stays proportional
            marginBottom: `calc(${(PROPOSAL_SCALE - 1) * 100}% * ${PROPOSAL_NATURAL_W / 100})`,
          }}
        >
          <CustomerProposal
            fields={fields}
            parseContext={parseContext}
            lineItems={lineItems}
            proposalMode={proposalMode}
            lineItemQuoteAttached={lineItemQuoteAttached}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────
function WbHeader({ busy, onUpload, onRecovery, fileInputRef, searchQuery, onSearchChange }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '13px 24px', background: C.forest, color: C.parchment, borderBottom: `3px solid ${C.copper}`, flexShrink: 0 }}>
      <Logo />
      <div style={{ width: 1, height: 26, background: 'rgba(243,234,214,0.18)', marginLeft: 4 }} />
      <div style={{ ...eyebrow, color: C.gold, fontSize: 9 }}>Sales Desk</div>
      <div style={{ flex: 1 }} />
      <input
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search jobs, quote #, vendor…"
        style={{ width: 240, padding: '7px 11px', background: 'rgba(243,234,214,0.08)', color: C.parchment, border: '1px solid rgba(243,234,214,0.14)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
      />
      <label className={`wb-btn ${busy ? 'wb-btn--disabled' : ''}`} style={{ border: '1px solid rgba(243,234,214,0.3)', background: 'transparent', color: C.parchment, cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
        {busy ? 'Reading…' : '↑ Drop BisTrack PDF'}
        <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={busy} hidden />
      </label>
      <button className="wb-btn wb-btn--copper" onClick={onRecovery} style={{ flexShrink: 0 }}>+ Recover Old Quote</button>
      <div style={{ width: 30, height: 30, borderRadius: 15, background: C.copper, color: C.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>LM</div>
    </header>
  )
}

// ─── Left Rail ────────────────────────────────────────────────────
const TAB_COLORS = ['#b9743a', '#c9a24c', '#6b7a4c', '#8a3a1e', '#82684a']

function ActiveUploadCard({ customerName, fileName, stageIdx }) {
  const stageName = ['Processing…', 'Loaded', 'Missing Info', 'Follow-Up', 'Ready'][stageIdx] || 'Uploading…'
  return (
    <div style={{ margin: '8px 0 0', position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14, width: 72, height: 10, borderRadius: '3px 3px 0 0', background: C.copper }} />
      <div style={{ background: C.paper, border: `2px solid ${C.copper}`, padding: '11px 12px 10px', boxShadow: `0 0 0 1px ${C.copper}` }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 7.5, marginBottom: 4 }}>Active Upload</div>
        <div style={{ ...serif, fontSize: 13, fontWeight: 700, color: C.ink }}>{customerName || 'Reading file…'}</div>
        {fileName && <div style={{ fontSize: 9.5, color: C.inkMid, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>}
        <div style={{ marginTop: 6 }}>
          <StatusChip status={stageIdx >= 4 ? 'ready-for-proposal' : stageIdx >= 2 ? 'needs-review' : 'new-intake'} label={stageName} />
        </div>
      </div>
    </div>
  )
}

function TicketCard({ opp, selected, onClick, tabColor }) {
  const total = opp.originalQuoteAmount || opp.quotationTotal
  const conf = opp.sourceConfidence
  return (
    <div className="wb-ticket" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="wb-ticket__tab" style={{ background: tabColor }} />
      <div className={`wb-ticket__card ${selected ? 'is-selected' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ ...serif, fontSize: 13, fontWeight: 700, color: C.ink }}>{opp.customerName || 'Unnamed'}</div>
          {opp.quoteNumber && <div style={{ ...mono, fontSize: 9, color: C.inkLight }}>#{opp.quoteNumber}</div>}
        </div>
        <div style={{ fontSize: 10.5, color: C.inkMid, marginTop: 2 }}>
          {opp.projectType || opp.sourceLabel || 'Quote'}{opp.quoteDate ? ` · ${opp.quoteDate}` : ''}
        </div>
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusChip status={opp.status} />
          <div style={{ flex: 1 }} />
          {total && <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: C.mid }}>{total}</div>}
        </div>
        {conf != null && (
          <div style={{ marginTop: 5 }}>
            <ConfidenceMeter value={conf} />
          </div>
        )}
        {opp.nextAction && (
          <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px dashed ${C.border}`, fontSize: 10, color: C.rust, fontWeight: 600, lineHeight: 1.4 }}>
            → {opp.nextAction}
          </div>
        )}
      </div>
    </div>
  )
}

function WbLeftRail({ opportunities, activeId, onSelect, activeUpload, searchQuery }) {
  const filters = [
    { label: `All ${opportunities.length}`, value: 'all' },
    { label: 'Ready', value: 'ready-for-proposal' },
    { label: 'Follow-up', value: 'follow-up-needed' },
    { label: 'Recovery', value: 'new-intake' },
  ]
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? opportunities : opportunities.filter(o => o.status === filter)
  const shown = searchQuery
    ? filtered.filter(o => {
        const q = searchQuery.toLowerCase()
        return (
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.quoteNumber || '').toLowerCase().includes(q) ||
          (o.projectType || '').toLowerCase().includes(q) ||
          (o.sourceLabel || '').toLowerCase().includes(q)
        )
      })
    : filtered

  return (
    <aside className="wb-left" style={{ background: C.dark, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 16px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8 }}>Quote Inbox</div>
        <div style={{ ...serif, fontSize: 17, fontWeight: 600, marginTop: 2, color: C.ink }}>Job Tickets</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 9, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{ fontSize: 9.5, padding: '3px 8px', background: filter === f.value ? C.mid : 'rgba(255,255,255,0.5)', color: filter === f.value ? C.parchment : C.inkMid, border: `1px solid ${filter === f.value ? C.forest : C.border}`, cursor: 'pointer', borderRadius: 2, fontWeight: 600, fontFamily: 'inherit' }}>{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 16px' }}>
        {/* Active upload always shown at top when present */}
        {activeUpload && (
          <ActiveUploadCard
            customerName={activeUpload.customerName}
            fileName={activeUpload.fileName}
            stageIdx={activeUpload.stageIdx}
          />
        )}

        {shown.length === 0 && !activeUpload ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: C.inkLight, fontSize: 12 }}>
            {searchQuery ? `No tickets match "${searchQuery}".` : 'No tickets in this filter.'}
          </div>
        ) : (
          shown.map((opp, i) => (
            <TicketCard
              key={opp.id}
              opp={opp}
              selected={opp.id === activeId}
              onClick={() => onSelect(opp.id)}
              tabColor={TAB_COLORS[i % TAB_COLORS.length]}
            />
          ))
        )}

        {opportunities.length === 0 && !activeUpload && (
          <div style={{ marginTop: 16, padding: 12, background: C.paper, border: `1px dashed ${C.border}`, fontSize: 11, color: C.inkMid, lineHeight: 1.5 }}>
            No saved quotes yet. Upload a BisTrack PDF in the header to start a new job ticket.
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Right Rail ───────────────────────────────────────────────────
function RefRow({ icon, title, sub, badge, danger, onOpen }) {
  return (
    <div className={`wb-ref-row ${danger ? 'wb-ref-row--danger' : ''}`}>
      <div style={{ position: 'absolute', top: -4, left: 8, width: 8, height: 8, borderRadius: 4, background: 'radial-gradient(circle at 30% 30%, #f0d27a, #8a6822)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)', flexShrink: 0 }} />
      <div style={{ fontSize: 14, paddingLeft: 4 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: danger ? C.rust : C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 9.5, color: C.inkMid, marginTop: 1 }}>{sub}</div>
      </div>
      {badge && <span className={`wb-pill wb-pill--${badge === 'Current' || badge === 'Live' ? 'gold' : 'green'}`}>{badge}</span>}
      <button className="wb-btn wb-btn--primary" style={{ fontSize: 10, padding: '4px 9px', flexShrink: 0 }} onClick={onOpen}>Open in App</button>
    </div>
  )
}

function WbRightRail({ matchedVendors, displayContext, hasActiveQuote, onOpenRef }) {
  const matchedDisplay = displayContext?.strongestMatch

  return (
    <aside className="wb-right" style={{ background: C.wood, backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '5px 5px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: C.forest, color: C.parchment, padding: '11px 13px', borderBottom: `3px solid ${C.copper}`, flexShrink: 0 }}>
        <div style={{ ...eyebrow, color: C.gold, fontSize: 8.5 }}>Smart Context</div>
        <div style={{ ...serif, fontSize: 15, fontWeight: 600, marginTop: 2 }}>
          {hasActiveQuote ? 'Pinned to active file' : 'No file open'}
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(243,234,214,0.65)', marginTop: 3 }}>
          {hasActiveQuote ? 'Auto-matched from line items' : 'Open a job ticket to load references.'}
        </div>
      </div>

      <div style={{ flex: 1, padding: 11, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {!hasActiveQuote ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(243,234,214,0.4)', fontSize: 11.5, textAlign: 'center', padding: 20, lineHeight: 1.5 }}>
            References for the open ticket will pin here automatically.
          </div>
        ) : (
          <>
            {matchedVendors.length > 0 && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8.5, marginBottom: 5 }}>Vendor Price Books</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {matchedVendors.slice(0, 4).map(v => (
                    <RefRow
                      key={v.id}
                      icon="📕"
                      title={`${v.name} — ${v.priceListDate}`}
                      sub={v.dealerCostOnly ? 'Internal only · never customer-facing' : v.category}
                      badge={v.dealerCostOnly ? undefined : 'Current'}
                      danger={v.dealerCostOnly}
                      onOpen={() => onOpenRef({
                        title: v.name,
                        sub: v.priceListDate ? `Price list dated ${v.priceListDate}` : v.category,
                        category: v.category,
                        vendor: v.name,
                        badge: v.dealerCostOnly ? undefined : 'Current',
                        danger: v.dealerCostOnly,
                      })}
                    />
                  ))}
                </div>
              </div>
            )}

            {matchedDisplay && (
              <div>
                <div style={{ ...eyebrow, color: '#d28a45', fontSize: 8.5, marginBottom: 5 }}>Showroom Display</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <RefRow
                    icon="🪵"
                    title={`${matchedDisplay.modelName || matchedDisplay.productCode} · ${matchedDisplay.locationZone || 'Unknown location'}`}
                    sub={`${matchedDisplay.displayStatus === 'on-display' ? 'On Display' : 'Needs Verification'} · ${matchedDisplay.vendor || ''}`}
                    badge={matchedDisplay.displayStatus === 'on-display' ? 'Live' : undefined}
                    onOpen={() => onOpenRef({
                      title: matchedDisplay.modelName || matchedDisplay.productCode || 'Showroom Display',
                      sub: matchedDisplay.locationZone || 'Unknown location',
                      category: 'Showroom Display',
                      vendor: matchedDisplay.vendor || '',
                      badge: matchedDisplay.displayStatus === 'on-display' ? 'Live' : undefined,
                    })}
                  />
                </div>
              </div>
            )}

            <div>
              <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5, marginBottom: 5 }}>Internal Notes</div>
              <div style={{ padding: '10px 11px', background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.mid}`, fontSize: 11, color: C.inkMid, lineHeight: 1.55 }}>
                All references open in-app — no file paths copied to customer output.
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

// ─── Empty Hero ───────────────────────────────────────────────────
function EmptyHero({ onUpload, onRecovery, fileInputRef }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, background: C.parchment }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div style={{ width: 76, height: 76, margin: '0 auto', border: `2px dashed rgba(45,74,54,0.35)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: C.mid }}>📂</div>
        <div style={{ ...eyebrow, color: C.copper, marginTop: 20, fontSize: 9 }}>Open a job ticket</div>
        <div style={{ ...serif, fontSize: 28, fontWeight: 600, marginTop: 6, lineHeight: 1.15, color: C.ink }}>Pick a ticket on the left, or drop a BisTrack PDF.</div>
        <div style={{ fontSize: 13, color: C.inkMid, marginTop: 12, lineHeight: 1.65 }}>
          Every job ticket pulls in its own vendor price book, manuals, showroom display, and follow-up history. References open in-app — nothing to copy.
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <label className="wb-btn wb-btn--primary" style={{ cursor: 'pointer' }}>
            ↑ Upload BisTrack PDF
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={onUpload} hidden />
          </label>
          <button className="wb-btn" onClick={onRecovery}>+ New quote recovery</button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload Workspace (center for active PDF upload) ─────────────
const PRIORITY_FIELDS = [
  'CUSTOMER_NAME', 'CUSTOMER_PHONE', 'INVOICE_ADDRESS_LINE_1', 'INVOICE_CITY_STATE_ZIP',
  'QUOTE_NO', 'QUOTE_DATE', 'PROJECT_TITLE', 'PROJECT_SCOPE_SUMMARY', 'TOTAL_AMOUNT',
]

function FieldInput({ field, value, onChange }) {
  const isMulti = multilineFields.has(field)
  const label = getFieldLabel(field)
  return (
    <label style={{ display: 'grid', gap: 4, gridColumn: isMulti ? '1 / -1' : undefined }}>
      <span style={{ ...eyebrow, color: C.inkLight, fontSize: 8 }}>{label}</span>
      {isMulti ? (
        <textarea rows={3} value={value} onChange={e => onChange(field, e.target.value)} style={{ padding: '6px 9px', border: `1px solid ${C.border}`, background: C.paper, fontSize: 12, fontFamily: 'inherit', color: C.ink, resize: 'vertical' }} />
      ) : (
        <input value={value} onChange={e => onChange(field, e.target.value)} style={{ padding: '6px 9px', border: `1px solid ${C.border}`, background: C.paper, fontSize: 12, fontFamily: 'inherit', color: C.ink }} />
      )}
    </label>
  )
}

function MissingInfoCard({ warning, index, resolved, onResolve }) {
  if (resolved) {
    return (
      <div style={{ background: 'rgba(45,74,54,0.06)', padding: '8px 12px', border: `1px solid rgba(45,74,54,0.18)`, borderLeft: `3px solid ${C.mid}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: C.mid, color: C.parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>✓</div>
        <div style={{ fontSize: 11, color: C.inkMid, flex: 1 }}>{warning}</div>
        <span style={{ ...mono, fontSize: 9, color: C.mid }}>Resolved</span>
      </div>
    )
  }
  const variantColor = warning.toLowerCase().includes('older') ? C.gold : C.rust
  return (
    <div style={{ background: C.paper, padding: '10px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${variantColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, flex: 1 }}>{warning}</div>
        <span style={{ ...mono, fontSize: 9, color: C.inkLight, flexShrink: 0 }}>#{index + 1}</span>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button className="wb-btn wb-btn--primary" style={{ padding: '4px 9px', fontSize: 10 }} onClick={onResolve}>
          Resolve →
        </button>
      </div>
    </div>
  )
}

function UploadWorkspace({
  fields, lineItems, parseContext, proposalMode, reviewState, lineItemQuoteAttached,
  saveStatus, pendingDuplicate, status, stageIdx, warnings, resolvedWarnings,
  onFieldChange, onReviewChange, onProposalModeChange, onLineItemAttachChange,
  onSave, onSaveDraft, onResolveWarning, onUpdateDuplicate, onSaveSeparate, onCancelDuplicate,
}) {
  const [showProposalModal, setShowProposalModal] = useState(false)
  const customerName = fields.CUSTOMER_NAME || '—'
  const quoteNo = fields.QUOTE_NO
  const conf = parseContext?.sourceConfidence

  const unresolvedWarnings = warnings.filter(w => !resolvedWarnings.has(w))
  const resolvedList = warnings.filter(w => resolvedWarnings.has(w))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: C.parchment }}>
      {showProposalModal && (
        <ProposalModal
          fields={fields}
          parseContext={parseContext}
          lineItems={lineItems}
          proposalMode={proposalMode}
          lineItemQuoteAttached={lineItemQuoteAttached}
          onClose={() => setShowProposalModal(false)}
        />
      )}

      {/* File banner */}
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, padding: '13px 24px 15px', position: 'relative', flexShrink: 0 }}>
        {quoteNo && (
          <div style={{ position: 'absolute', top: -10, left: 24, padding: '3px 12px', background: C.copper, color: '#fff', ...eyebrow, fontSize: 9 }}>
            OPEN FILE · #{quoteNo}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <StatusChip status={reviewState === 'reviewed' ? 'ready-for-proposal' : reviewState === 'follow-up' ? 'follow-up-needed' : 'needs-review'} />
          {conf != null && <span className="wb-pill wb-pill--gold">OCR {conf}%</span>}
          {unresolvedWarnings.length > 0 && <span className="wb-pill wb-pill--rust">{unresolvedWarnings.length} item{unresolvedWarnings.length > 1 ? 's' : ''} to resolve</span>}
          {resolvedList.length > 0 && <span className="wb-pill wb-pill--green">{resolvedList.length} resolved</span>}
          {reviewState === 'reviewed' && <span className="wb-pill wb-pill--green">OK to send</span>}
          <div style={{ flex: 1 }} />
          {conf != null && <ConfidenceMeter value={conf} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
          <div>
            <div style={{ ...serif, fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: C.ink }}>{customerName}</div>
            {parseContext?.sourceFileName && (
              <div style={{ fontSize: 11, color: C.inkMid, marginTop: 3 }}>
                {parseContext.sourceFileName}{parseContext.documentType ? ` · ${parseContext.documentType}` : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="wb-btn" onClick={onSaveDraft}>Save Draft</button>
          </div>
        </div>
        <StageStrip activeIndex={stageIdx} />
      </div>

      {/* Body: working surface + proposal preview */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 390px', minHeight: 0 }}>
        {/* Working surface */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {status && (
            <div style={{ padding: '8px 12px', background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.mid}`, fontSize: 11.5, color: C.inkMid }}>
              {status}
            </div>
          )}

          {/* Key fields */}
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ ...eyebrow, color: C.copper, marginBottom: 10, fontSize: 8.5 }}>Key fields</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {PRIORITY_FIELDS.map(f => (
                <FieldInput key={f} field={f} value={fields[f]} onChange={onFieldChange} />
              ))}
            </div>
          </div>

          {/* Missing info / warnings */}
          {warnings.length > 0 && (
            <div>
              <div style={{ ...eyebrow, color: C.copper, marginBottom: 8, fontSize: 8.5 }}>
                Items to resolve ({unresolvedWarnings.length} unresolved{resolvedList.length > 0 ? `, ${resolvedList.length} done` : ''})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {warnings.map((w, i) => (
                  <MissingInfoCard
                    key={i}
                    warning={w}
                    index={i}
                    resolved={resolvedWarnings.has(w)}
                    onResolve={() => onResolveWarning(w)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Readiness review */}
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ ...eyebrow, color: C.copper, marginBottom: 8, fontSize: 8.5 }}>Review state</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {[
                { value: 'unresolved', label: 'Unresolved' },
                { value: 'follow-up', label: 'Follow-Up Needed' },
                { value: 'reviewed', label: 'Okay to Send' },
              ].map(opt => (
                <button key={opt.value} onClick={() => onReviewChange(opt.value)} className={`wb-btn ${reviewState === opt.value ? 'wb-btn--primary' : ''}`} style={{ fontSize: 11 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Proposal format */}
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ ...eyebrow, color: C.copper, marginBottom: 8, fontSize: 8.5 }}>Proposal format</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className={`wb-btn ${proposalMode === 'detailed' ? 'wb-btn--primary' : ''}`} onClick={() => onProposalModeChange('detailed')} style={{ fontSize: 11 }}>Detailed Investment Breakdown</button>
              <button className={`wb-btn ${proposalMode === 'summary' ? 'wb-btn--primary' : ''}`} onClick={() => onProposalModeChange('summary')} style={{ fontSize: 11 }}>Warm Summary</button>
            </div>
            {proposalMode === 'summary' && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: C.inkMid, fontStyle: 'italic' }}>Warm Summary is for Page 3 supporting content only. Detailed Breakdown is the default main format.</div>
            )}
          </div>

          {/* Customer packet */}
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ ...eyebrow, color: C.copper, marginBottom: 8, fontSize: 8.5 }}>Customer packet</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Clean customer proposal', true],
                [proposalMode === 'detailed' ? 'Detailed Investment Breakdown' : 'Warm Summary', true],
                ['Scope / responsibility notes', true],
              ].map(([label, checked]) => (
                <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: checked ? C.mid : C.border, color: C.parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>{checked ? '✓' : ''}</div>
                  {label}
                </li>
              ))}
              <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <input type="checkbox" checked={lineItemQuoteAttached} onChange={e => onLineItemAttachChange(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <label>Original BisTrack line-item quote attached</label>
              </li>
            </ul>
          </div>

          {/* Save */}
          {reviewState !== 'unresolved' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingDuplicate ? (
                <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Possible duplicate found. How should we handle it?</div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button className="wb-btn wb-btn--primary" onClick={onUpdateDuplicate}>Update Existing</button>
                    <button className="wb-btn" onClick={onSaveSeparate}>Save Separate</button>
                    <button className="wb-btn wb-btn--ghost" onClick={onCancelDuplicate}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="wb-btn wb-btn--copper" onClick={onSave} style={{ fontSize: 13, padding: '10px 18px' }}>
                  Save Reviewed Quote to Queue →
                </button>
              )}
              {saveStatus && <div style={{ fontSize: 11.5, color: C.inkMid, padding: '6px 10px', background: C.paper, border: `1px solid ${C.border}` }}>{saveStatus}</div>}
            </div>
          )}
        </div>

        {/* Proposal preview */}
        <ScaledProposalPreview
          fields={fields}
          parseContext={parseContext}
          lineItems={lineItems}
          proposalMode={proposalMode}
          lineItemQuoteAttached={lineItemQuoteAttached}
          onExpand={() => setShowProposalModal(true)}
        />
      </div>
    </div>
  )
}

// ─── Ticket Workspace (center for saved opportunity) ──────────────
function TicketWorkspace({ ticket, onSaveDraft }) {
  const [showProposalPreview, setShowProposalPreview] = useState(true)
  const [showProposalModal, setShowProposalModal] = useState(false)
  const [ticketMsg, setTicketMsg] = useState('')

  const fields = useMemo(() => {
    const base = opportunityToQuoteFields(ticket)
    return applyDefaults({ ...createEmptyFieldState(), ...base })
  }, [ticket])

  const stageIdx = ticketStageIndex(ticket.status)
  const conf = ticket.sourceConfidence

  const statusContent = {
    'follow-up-needed': {
      title: 'Queue follow-up to customer',
      sub: 'Send questions before polishing the proposal.',
    },
    'ready-for-proposal': {
      title: 'Ready to polish the proposal',
      sub: 'All clear. Detailed Investment Breakdown is loaded. Save to queue or send.',
    },
    'needs-review': {
      title: 'Resolve missing info before sending',
      sub: 'Review items still need confirmation before the proposal goes out.',
    },
    'blocked-missing-info': {
      title: 'Resolve missing info before sending',
      sub: 'Review items still need confirmation before the proposal goes out.',
    },
    'new-intake': {
      title: 'New intake — assign and setup',
      sub: 'Confirm the quote source, assign a rep, and set the initial context.',
    },
  }
  const content = statusContent[ticket.status] || { title: 'Active ticket', sub: '' }
  const warnings = ticket.warnings?.filter(w => !/Sensitive BisTrack|quote refresh/i.test(w)) || []

  function showMsg(msg) {
    setTicketMsg(msg)
    setTimeout(() => setTicketMsg(''), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: C.parchment }}>
      {showProposalModal && (
        <ProposalModal
          fields={fields}
          parseContext={emptyContext}
          lineItems={[]}
          proposalMode="detailed"
          lineItemQuoteAttached={false}
          onClose={() => setShowProposalModal(false)}
        />
      )}

      {/* File banner */}
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, padding: '13px 24px 15px', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: -10, left: 24, padding: '3px 12px', background: C.copper, color: '#fff', ...eyebrow, fontSize: 9 }}>
          OPEN FILE{ticket.quoteNumber ? ` · #${ticket.quoteNumber}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <StatusChip status={ticket.status} />
          {conf != null && <span className="wb-pill wb-pill--gold">OCR {conf}%</span>}
          {ticket.temperature === 'hot' && <span className="wb-pill wb-pill--rust">Hot</span>}
          {ticket.temperature === 'warm' && <span className="wb-pill wb-pill--gold">Warm</span>}
          {warnings.length > 0 && <span className="wb-pill wb-pill--rust">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
          <div style={{ flex: 1 }} />
          {conf != null && <ConfidenceMeter value={conf} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
          <div>
            <div style={{ ...serif, fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: C.ink }}>{ticket.customerName || 'Unnamed'}</div>
            <div style={{ fontSize: 11, color: C.inkMid, marginTop: 3 }}>
              {[ticket.projectType, ticket.sourceLabel, ticket.quoteDate].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="wb-btn" onClick={() => onSaveDraft(ticket)}>Save Draft</button>
            <button
              className="wb-btn wb-btn--ghost"
              disabled
              title="Open in BisTrack requires direct BisTrack access — connect BisTrack integration to enable"
              style={{ opacity: 0.45, cursor: 'not-allowed' }}
            >
              Open in BisTrack ↗
            </button>
          </div>
        </div>
        <StageStrip activeIndex={stageIdx} />
      </div>

      {/* Inline ticket message */}
      {ticketMsg && (
        <div style={{ padding: '8px 24px', background: 'rgba(45,74,54,0.08)', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.mid, fontWeight: 600, flexShrink: 0 }}>
          {ticketMsg}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showProposalPreview ? '1fr 390px' : '1fr', minHeight: 0 }}>
        {/* Working surface */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Right now</div>
            <div style={{ ...serif, fontSize: 19, fontWeight: 700, marginTop: 3, color: C.ink }}>{content.title}</div>
            {content.sub && <div style={{ fontSize: 12, color: C.inkMid, marginTop: 4 }}>{content.sub}</div>}
          </div>

          {/* Ticket summary */}
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ ...eyebrow, color: C.copper, marginBottom: 10, fontSize: 8.5 }}>Job summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              {[
                ['Customer', ticket.customerName],
                ['Quote #', ticket.quoteNumber],
                ['Date', ticket.quoteDate],
                ['Total', ticket.originalQuoteAmount || ticket.quotationTotal],
                ['Project', ticket.projectType || ticket.projectTitle],
                ['Rep', ticket.sourceLabel],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5, marginBottom: 2 }}>{k}</div>
                  <div style={{ color: C.ink, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <div style={{ ...eyebrow, color: C.copper, marginBottom: 8, fontSize: 8.5 }}>Items to review ({warnings.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ background: C.paper, padding: '9px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.rust}`, fontSize: 11.5, color: C.ink }}>
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status-specific actions */}
          {ticket.status === 'ready-for-proposal' && (
            <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ ...eyebrow, color: C.copper, marginBottom: 10, fontSize: 8.5 }}>Pre-send checklist</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {['Detailed Investment Breakdown selected', 'BisTrack line-item quote on file', 'No outstanding missing info', 'Ready to send'].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: C.mid, color: C.parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>✓</div>
                    {item}
                  </div>
                ))}
              </div>
              <button
                className="wb-btn wb-btn--copper"
                style={{ marginTop: 12, fontSize: 12 }}
                onClick={() => showMsg('Email integration not yet connected — print / save as PDF and send manually.')}
              >
                Save & email proposal →
              </button>
            </div>
          )}

          {ticket.status === 'follow-up-needed' && ticket.nextAction && (
            <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ ...eyebrow, color: C.copper, marginBottom: 6, fontSize: 8.5 }}>Next action</div>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{ticket.nextAction}</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 7 }}>
                <button
                  className="wb-btn wb-btn--primary"
                  onClick={() => showMsg('Email / follow-up integration not yet connected. Draft your follow-up externally and log it here when sent.')}
                >
                  Send follow-up →
                </button>
                <button
                  className="wb-btn wb-btn--ghost"
                  onClick={() => showMsg('Snoozed — this ticket will stay in Follow-Up Needed until you mark it sent or resolved.')}
                >
                  Snooze 1 day
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="wb-btn"
              onClick={() => setShowProposalPreview(p => !p)}
              style={{ alignSelf: 'flex-start', fontSize: 11 }}
            >
              {showProposalPreview ? 'Hide preview' : 'Show proposal preview'}
            </button>
            {showProposalPreview && (
              <button
                className="wb-btn"
                onClick={() => setShowProposalModal(true)}
                style={{ alignSelf: 'flex-start', fontSize: 11 }}
              >
                Full page preview ↗
              </button>
            )}
          </div>
        </div>

        {/* Proposal preview */}
        {showProposalPreview && (
          <ScaledProposalPreview
            fields={fields}
            parseContext={emptyContext}
            lineItems={[]}
            proposalMode="detailed"
            lineItemQuoteAttached={false}
            onExpand={() => setShowProposalModal(true)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Next Best Action bar ─────────────────────────────────────────
const NBA_MAP = {
  empty:    { copy: 'Pick a ticket on the left, or drop a BisTrack PDF to start a new one.', cta: 'Open today\'s top ticket →' },
  recovery: { copy: 'Review OCR results — queue high-confidence rows, fix low-confidence ones.', cta: 'Queue selected →' },
  upload_unresolved: { copy: 'Resolve warnings above, then mark the quote as reviewed.', cta: 'Scroll to warnings ↑' },
  upload_follow_up:  { copy: 'Send follow-up questions — ticket auto-advances when the customer replies.', cta: 'Mark as Follow-Up ✓' },
  upload_reviewed:   { copy: 'All clear. Save the proposal to the queue and email the customer.', cta: 'Save & email proposal →' },
  ticket_ready:      { copy: 'All clear. Attach the BisTrack line-item, then send the proposal.', cta: 'Save & email proposal →' },
  ticket_followup:   { copy: 'Send follow-up questions to the customer before polishing the proposal.', cta: 'Send follow-up →' },
  ticket_review:     { copy: 'Resolve missing info or open the right-rail reference for context.', cta: 'Resolve items →' },
  ticket_other:      { copy: 'Review the ticket and determine the next step for this job.', cta: 'Update ticket →' },
}

function NextBestAction({ mode, reviewState, ticketStatus, onSave, onSnooze, onCta }) {
  let key = 'empty'
  if (mode === 'recovery') key = 'recovery'
  else if (mode === 'upload') key = `upload_${reviewState}`
  else if (mode === 'ticket') {
    if (ticketStatus === 'ready-for-proposal') key = 'ticket_ready'
    else if (ticketStatus === 'follow-up-needed') key = 'ticket_followup'
    else if (ticketStatus === 'needs-review' || ticketStatus === 'blocked-missing-info') key = 'ticket_review'
    else key = 'ticket_other'
  }
  const v = NBA_MAP[key] || NBA_MAP.empty

  function handleCta() {
    if (mode === 'upload' && reviewState === 'reviewed') { onSave(); return }
    if (onCta) onCta(key)
  }

  return (
    <div className="wb-nba">
      <div style={{ width: 36, height: 36, background: C.copper, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.forest, fontWeight: 800, fontSize: 17, flexShrink: 0 }}>→</div>
      <div style={{ flex: 1 }}>
        <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Next Best Action</div>
        <div style={{ ...serif, fontSize: 14, fontWeight: 600, marginTop: 2 }}>{v.copy}</div>
      </div>
      <button className="wb-btn" style={{ background: 'transparent', color: C.parchment, borderColor: 'rgba(243,234,214,0.3)', flexShrink: 0 }} onClick={onSnooze}>
        Snooze
      </button>
      <button className="wb-btn wb-btn--copper" onClick={handleCta} style={{ flexShrink: 0 }}>{v.cta}</button>
    </div>
  )
}

// ─── Main Shell ───────────────────────────────────────────────────
export default function WorkbenchShell() {
  const emptyFields = useMemo(() => applyDefaults(createEmptyFieldState()), [])

  // Workbench mode
  const [mode, setMode] = useState('empty')
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [oppList, setOppList] = useState(() => listOpportunities())

  // Upload / quote polish state
  const [fields, setFields] = useState(emptyFields)
  const [parseContext, setParseContext] = useState(emptyContext)
  const [lineItems, setLineItems] = useState([])
  const [proposalMode, setProposalMode] = useState('detailed')
  const [reviewState, setReviewState] = useState('unresolved')
  const [lineItemQuoteAttached, setLineItemQuoteAttached] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [pendingDuplicate, setPendingDuplicate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [rawText, setRawText] = useState('')
  const fileInputRef = useRef(null)
  const heroFileInputRef = useRef(null)

  // Resolved warnings (local state per upload session)
  const [resolvedWarnings, setResolvedWarnings] = useState(() => new Set())

  // Reference drawer
  const [refDrawerItem, setRefDrawerItem] = useState(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Placeholder toast for unconnected actions
  const [placeholderMsg, setPlaceholderMsg] = useState('')

  function showPlaceholder(msg) {
    setPlaceholderMsg(msg)
    setTimeout(() => setPlaceholderMsg(''), 5000)
  }

  const activeTicket = useMemo(() => oppList.find(o => o.id === activeTicketId) || null, [oppList, activeTicketId])
  const setupGuidance = useMemo(() => evaluateCurrentSetup({ fields, parseContext }), [fields, parseContext])
  const warnings = useMemo(
    () => mode === 'upload' ? buildSendReadinessWarnings({ fields, lineItems, proposalMode, setupGuidance }) : [],
    [fields, lineItems, proposalMode, setupGuidance, mode],
  )
  const uploadStage = useMemo(() => uploadStageIndex(busy, rawText, reviewState, warnings), [busy, rawText, reviewState, warnings])

  // Active upload card data for left rail
  const activeUploadCard = useMemo(() => {
    if (mode !== 'upload') return null
    return {
      customerName: fields.CUSTOMER_NAME || '',
      fileName: parseContext?.sourceFileName || '',
      stageIdx: uploadStage,
    }
  }, [mode, fields.CUSTOMER_NAME, parseContext, uploadStage])

  // Derive vendor/display matches for right rail
  const activeFields = useMemo(() => {
    if (mode === 'upload') return fields
    if (mode === 'ticket' && activeTicket) return opportunityToQuoteFields(activeTicket)
    return {}
  }, [mode, fields, activeTicket])

  const activeLineItems = useMemo(() => (mode === 'upload' ? lineItems : []), [mode, lineItems])

  const matchedVendors = useMemo(
    () => matchVendorToQuote(listVendors(), { fields: activeFields, lineItems: activeLineItems }),
    [activeFields, activeLineItems],
  )
  const displayContext = useMemo(
    () => deriveShowroomDisplayContext({ displayRecords: listDisplayRecords(), fields: activeFields, lineItems: activeLineItems }),
    [activeFields, activeLineItems],
  )

  function setField(field, value) {
    setFields(cur => ({ ...cur, [field]: value }))
    setSaveStatus('')
    setPendingDuplicate(null)
  }

  function loadParsed(parsed) {
    setFields(applyDefaults({ ...createEmptyFieldState(), ...parsed.fields }))
    setParseContext({ ...emptyContext, ...parsed.context })
    setLineItems(parsed.lineItems || [])
    setReviewState('unresolved')
    setLineItemQuoteAttached(false)
    setSaveStatus('')
    setPendingDuplicate(null)
    setResolvedWarnings(new Set())
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMode('upload')
    setActiveTicketId(null)
    try {
      setStatus(`Reading ${file.name}…`)
      const extracted = await extractTextFromPdf(file)
      if (!extracted.embeddedTextLikelyMissing) {
        const parsed = parseBisTrackText(extracted.rawText)
        loadParsed({ ...parsed, context: { ...parsed.context, sourceFileName: file.name, sourceImportedAt: new Date().toISOString() } })
        setRawText(extracted.rawText)
        const lineCount = parsed.lineItems?.length || 0
        setStatus(`Loaded ${file.name} — ${parsed.documentType?.toUpperCase() || 'QUOTE'}${parsed.fields.QUOTE_NO ? ` #${parsed.fields.QUOTE_NO}` : ''} (${lineCount} line item${lineCount === 1 ? '' : 's'}). Review and fill any blanks below.`)
      } else {
        setStatus(`Scanned PDF detected. Running OCR on ${extracted.pageCount} page${extracted.pageCount === 1 ? '' : 's'}…`)
        const ocr = await extractOcrFromPdf(file, {
          onProgress: p => {
            const action = p.stage === 'rendering' ? 'Rendering' : 'Reading'
            setStatus(`${action} page ${p.pageNumber} of ${p.pageCount}…`)
          },
        })
        const combinedText = ocr.pages.map(p => p.text).join('\n\n')
        const parsed = extractScannedBisTrackFields(combinedText)
        const avgConf = Math.round(ocr.pages.reduce((s, p) => s + (p.confidence || 0), 0) / Math.max(ocr.pages.length, 1))
        loadParsed({ ...parsed, context: { ...parsed.context, extractionSource: 'ocr', sourceFileName: file.name, sourceImportedAt: new Date().toISOString(), sourceConfidence: avgConf } })
        setRawText(combinedText)
        setStatus(`OCR complete (avg confidence ${avgConf}%). Review every field — scanned text often needs cleanup.`)
      }
    } catch (err) {
      setStatus(`Could not read PDF: ${err.message || err}`)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (heroFileInputRef.current) heroFileInputRef.current.value = ''
    }
  }

  function handleSaveToQueue() {
    if (reviewState === 'unresolved') { setSaveStatus('Mark this quote as reviewed above before saving.'); return }
    const allOpps = listOpportunities()
    const draft = buildQuotePolishQueueDraft({ fields, parseContext, lineItems, proposalMode, proposalReviewState: reviewState, lineItemQuoteAttached, setupGuidance, sendReadinessWarnings: warnings }, allOpps)
    if (draft.duplicate.isDuplicate) { setPendingDuplicate(draft); setSaveStatus('Possible duplicate found. Choose how to handle it.'); return }
    saveOpportunity(draft.opportunity)
    setPendingDuplicate(null)
    setSaveStatus('Saved to the opportunity queue.')
    setOppList(listOpportunities())
  }

  function handleSaveDraft(ticketOrUndefined) {
    // Called from both UploadWorkspace (no arg) and TicketWorkspace (ticket arg)
    if (ticketOrUndefined && ticketOrUndefined.id) {
      // Ticket draft — persist any minor updates back (status unchanged)
      updateOpportunity(ticketOrUndefined.id, { updatedAt: new Date().toISOString() })
      setOppList(listOpportunities())
      showPlaceholder('Draft saved — ticket updated.')
      return
    }
    // Upload draft — save with current state regardless of review state
    const allOpps = listOpportunities()
    const draft = buildQuotePolishQueueDraft({ fields, parseContext, lineItems, proposalMode, proposalReviewState: reviewState === 'unresolved' ? 'unresolved' : reviewState, lineItemQuoteAttached, setupGuidance, sendReadinessWarnings: warnings }, allOpps)
    if (draft.duplicate.isDuplicate && draft.duplicate.confidence === 'high') {
      const existing = listOpportunities().find(o => o.id === draft.duplicate.duplicateId)
      if (existing) {
        const merged = mergeQuotePolishOpportunity(existing, draft.opportunity)
        updateOpportunity(merged.id, merged)
        setSaveStatus('Draft saved — updated existing record.')
        setOppList(listOpportunities())
        return
      }
    }
    saveOpportunity(draft.opportunity)
    setSaveStatus('Draft saved.')
    setOppList(listOpportunities())
  }

  function handleUpdateDuplicate() {
    if (!pendingDuplicate) return
    const existing = listOpportunities().find(o => o.id === pendingDuplicate.duplicate.duplicateId)
    const merged = mergeQuotePolishOpportunity(existing, pendingDuplicate.opportunity)
    updateOpportunity(merged.id, merged)
    setPendingDuplicate(null)
    setSaveStatus('Updated existing queue opportunity.')
    setOppList(listOpportunities())
  }

  function handleSaveSeparate() {
    if (!pendingDuplicate) return
    saveOpportunity({ ...pendingDuplicate.opportunity, id: `${pendingDuplicate.opportunity.id}-${Date.now()}`, warnings: [...pendingDuplicate.opportunity.warnings, 'Saved as separate after duplicate review.'] })
    setPendingDuplicate(null)
    setSaveStatus('Saved as a separate opportunity.')
    setOppList(listOpportunities())
  }

  function handleSelectTicket(id) {
    setActiveTicketId(id)
    setMode('ticket')
  }

  function handleResolveWarning(w) {
    setResolvedWarnings(prev => {
      const next = new Set(prev)
      next.add(w)
      return next
    })
  }

  const handleNbaCta = useCallback((key) => {
    if (key === 'upload_unresolved') {
      // Scroll to warnings — since we can't scroll programmatically easily, show a toast
      showPlaceholder('Scroll up to the "Items to resolve" section and click Resolve on each warning.')
    } else if (key === 'upload_follow_up') {
      setReviewState('follow-up')
      showPlaceholder('Review state set to Follow-Up Needed.')
    } else if (key === 'ticket_followup' || key === 'ticket_review' || key === 'ticket_other') {
      showPlaceholder('Open the ticket in the center panel and address the items listed there.')
    } else if (key === 'ticket_ready') {
      showPlaceholder('Email integration not yet connected — print / save as PDF and send manually.')
    } else if (key === 'recovery') {
      showPlaceholder('Select rows in the recovery panel and click Queue Selected to add them.')
    } else {
      showPlaceholder('Select a ticket in the left rail to get started.')
    }
  }, [])

  const hasActiveQuote = mode === 'upload' || mode === 'ticket'

  return (
    <div className="wb-shell">
      <ReferenceDrawer item={refDrawerItem} onClose={() => setRefDrawerItem(null)} />
      <PlaceholderToast msg={placeholderMsg} onDismiss={() => setPlaceholderMsg('')} />

      <WbHeader
        busy={busy}
        onUpload={handleFile}
        onRecovery={() => setMode('recovery')}
        fileInputRef={fileInputRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="wb-body">
        <WbLeftRail
          opportunities={oppList}
          activeId={activeTicketId}
          onSelect={handleSelectTicket}
          activeUpload={activeUploadCard}
          searchQuery={searchQuery}
        />

        <div className="wb-center">
          {mode === 'empty' && (
            <EmptyHero onUpload={handleFile} onRecovery={() => setMode('recovery')} fileInputRef={heroFileInputRef} />
          )}
          {mode === 'upload' && (
            <UploadWorkspace
              fields={fields}
              lineItems={lineItems}
              parseContext={parseContext}
              proposalMode={proposalMode}
              reviewState={reviewState}
              lineItemQuoteAttached={lineItemQuoteAttached}
              saveStatus={saveStatus}
              pendingDuplicate={pendingDuplicate}
              status={status}
              busy={busy}
              stageIdx={uploadStage}
              warnings={warnings}
              resolvedWarnings={resolvedWarnings}
              onFieldChange={setField}
              onReviewChange={v => { setReviewState(v); setSaveStatus(''); setPendingDuplicate(null) }}
              onProposalModeChange={setProposalMode}
              onLineItemAttachChange={v => { setLineItemQuoteAttached(v); setSaveStatus('') }}
              onSave={handleSaveToQueue}
              onSaveDraft={handleSaveDraft}
              onResolveWarning={handleResolveWarning}
              onUpdateDuplicate={handleUpdateDuplicate}
              onSaveSeparate={handleSaveSeparate}
              onCancelDuplicate={() => { setPendingDuplicate(null); setSaveStatus('') }}
            />
          )}
          {mode === 'ticket' && activeTicket && (
            <TicketWorkspace
              ticket={activeTicket}
              onSaveDraft={handleSaveDraft}
              onPlaceholder={showPlaceholder}
            />
          )}
          {mode === 'ticket' && !activeTicket && (
            <EmptyHero onUpload={handleFile} onRecovery={() => setMode('recovery')} fileInputRef={heroFileInputRef} />
          )}
          {mode === 'recovery' && <OldQuoteRecovery />}
        </div>

        <WbRightRail
          matchedVendors={matchedVendors}
          displayContext={displayContext}
          hasActiveQuote={hasActiveQuote}
          onOpenRef={setRefDrawerItem}
        />
      </div>

      <NextBestAction
        mode={mode}
        reviewState={reviewState}
        ticketStatus={activeTicket?.status}
        onSave={handleSaveToQueue}
        onSnooze={() => showPlaceholder('Snoozed — this ticket stays in the queue. Come back to it when ready.')}
        onCta={handleNbaCta}
      />
    </div>
  )
}
