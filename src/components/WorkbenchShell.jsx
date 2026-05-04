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
import { listOpportunities, removeOpportunity, saveOpportunity, updateOpportunity } from '../lib/opportunities.js'
import CustomerProposal from './CustomerProposal.jsx'
import OldQuoteRecovery from './OldQuoteRecovery.jsx'
import IssueResolutionPanel from './IssueResolutionPanel.jsx'
import ShowroomVisitStart from './ShowroomVisitStart.jsx'
import TakeHomeChecklist from './TakeHomeChecklist.jsx'
import GuidedPathFinder from './GuidedPathFinder.jsx'
import CustomerPacketPanel from './CustomerPacketPanel.jsx'
import SchedulerHandoffPanel from './SchedulerHandoffPanel.jsx'
import FollowUpPlanPanel from './FollowUpPlanPanel.jsx'
import SalesJourneyBoard from './SalesJourneyBoard.jsx'
import ReferenceBinder from './ReferenceBinder.jsx'
import {
  customerFileFromOpportunity,
  getCustomerFile,
  getCustomerFileByOpportunity,
  listCustomerFiles,
  mergeCustomerFileWithOpportunity,
  removeCustomerFile,
  saveCustomerFile,
  updateCustomerFile,
} from '../lib/customerFile.js'
import { deriveQuoteStatus, getStatusLabel } from '../lib/quoteStatusEngine.js'
import { listDisplayRecords } from '../lib/showroomDisplayRegister.js'
import { listVendors } from '../lib/vendorPriceBooks.js'
import { opportunityToQuoteFields } from '../lib/opportunityWorkspace.js'
import {
  deriveTodayWorkbench,
  filterWorkbenchRecords,
  findPossibleDuplicates,
  summarizeWorkbenchRecords,
} from '../lib/fileOrganizer.js'

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


function qsForBadge(file) {
  if (!file) return ''
  const qs = deriveQuoteStatus(file)
  if (qs.unresolvedCount > 0) return `${qs.unresolvedCount}`
  if (qs.readiness?.ready) return 'ready'
  return ''
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



function WorkspaceTabs({ tabs, defaultTab = 'overview' }) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  const visibleTabs = tabs.filter((tab) => !tab.hidden)
  const selected = visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0]
  if (!selected) return null

  return (
    <section className="wb-workspace-tabs" aria-label="Customer file workspace">
      <div className="wb-workspace-tabs__bar" role="tablist" aria-label="Customer file sections">
        {visibleTabs.map((tab) => {
          const isSelected = tab.id === selected.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`wb-tabpanel-${tab.id}`}
              id={`wb-tab-${tab.id}`}
              className={`wb-workspace-tabs__tab${isSelected ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="wb-workspace-tabs__label">{tab.label}</span>
              {tab.badge && <span className="wb-workspace-tabs__badge">{tab.badge}</span>}
            </button>
          )
        })}
      </div>
      <div
        id={`wb-tabpanel-${selected.id}`}
        role="tabpanel"
        aria-labelledby={`wb-tab-${selected.id}`}
        className="wb-workspace-tabs__panel"
      >
        {selected.children}
      </div>
    </section>
  )
}

function PanelStack({ children }) {
  return <div className="wb-panel-stack">{children}</div>
}

function WorkspaceHint({ title, children }) {
  return (
    <div className="wb-workspace-hint">
      <div className="wb-workspace-hint__title">{title}</div>
      <div className="wb-workspace-hint__copy">{children}</div>
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
  const ref = item.reference || item
  const safety = ref.safety || {}
  const details = ref.details || []
  const talkingPoints = ref.talkingPoints || []
  const path = ref.path || ''
  const pdfUrl = ref.pdfUrl || ''
  const sourcePage = ref.sourcePage || ''
  const pageNumber = ref.pageNumber || ''

  function copyPath() {
    if (!path || !navigator?.clipboard) return
    navigator.clipboard.writeText(path)
  }

  function openOfficialPdf() {
    if (!pdfUrl) return
    const pageSuffix = pageNumber ? `#page=${pageNumber}` : ''
    window.open(`${pdfUrl}${pageSuffix}`, '_blank', 'noopener,noreferrer')
  }

  function openSourcePage() {
    if (!sourcePage) return
    window.open(sourcePage, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 430, height: '100%', background: C.wood, borderLeft: `3px solid ${safety.tone === 'danger' ? C.rust : C.copper}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}
      >
        <div style={{ background: C.forest, color: C.parchment, padding: '14px 16px', borderBottom: `2px solid ${C.copper}`, flexShrink: 0 }}>
          <div style={{ ...eyebrow, color: C.gold, fontSize: 8.5 }}>Smart Binder Reference</div>
          <div style={{ ...serif, fontSize: 16, fontWeight: 600, marginTop: 3 }}>{item.title}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(243,234,214,0.65)', marginTop: 2 }}>{item.sub || ref.sourceLabel}</div>
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {safety.label && <span className={`wb-pill wb-pill--${safety.tone === 'danger' ? 'rust' : safety.tone === 'ready' ? 'green' : 'gold'}`}>{safety.label}</span>}
            {ref.categoryLabel && <span className="wb-pill wb-pill--green">{ref.categoryLabel}</span>}
          </div>

          {safety.warning && (
            <div style={{ padding: '10px 12px', background: safety.tone === 'danger' ? 'rgba(138,58,30,0.18)' : 'rgba(201,162,76,0.16)', border: `1px solid ${safety.tone === 'danger' ? 'rgba(138,58,30,0.3)' : 'rgba(201,162,76,0.28)'}`, borderLeft: `3px solid ${safety.tone === 'danger' ? C.rust : C.gold}`, fontSize: 11, color: C.parchment, lineHeight: 1.55 }}>
              {safety.warning}
            </div>
          )}

          {path && (
            <div style={{ padding: '12px 12px', background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.mid}`, fontSize: 11.5, color: C.inkMid, lineHeight: 1.55 }}>
              <div style={{ ...eyebrow, color: C.copper, fontSize: 7.5, marginBottom: 5 }}>Local binder path</div>
              <div style={{ fontFamily: '"Courier New",monospace', fontSize: 10.5, wordBreak: 'break-word' }}>{path}</div>
              <button type="button" className="wb-btn" onClick={copyPath} style={{ marginTop: 8, fontSize: 10 }}>Copy path</button>
            </div>
          )}

          {(pdfUrl || sourcePage) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pdfUrl && <button type="button" className="wb-btn wb-btn--primary" onClick={openOfficialPdf} style={{ fontSize: 10 }}>{pageNumber ? `Open official PDF p. ${pageNumber}` : 'Open official PDF'}</button>}
              {sourcePage && <button type="button" className="wb-btn" onClick={openSourcePage} style={{ fontSize: 10 }}>Open source page</button>}
            </div>
          )}

          <div style={{ display: 'grid', gap: 9, fontSize: 12, color: C.parchment, opacity: 0.9 }}>
            {ref.sourceLabel && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Source</div>
                <div style={{ marginTop: 3 }}>{ref.sourceLabel}</div>
              </div>
            )}
            {ref.vendor && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Vendor / Brand</div>
                <div style={{ marginTop: 3 }}>{ref.vendor}</div>
              </div>
            )}
            {ref.location && (
              <div>
                <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Showroom Location</div>
                <div style={{ marginTop: 3 }}>{ref.location}</div>
              </div>
            )}
          </div>

          {talkingPoints.length > 0 && (
            <div style={{ padding: '12px 12px', background: 'rgba(243,234,214,0.08)', border: '1px solid rgba(243,234,214,0.14)', color: C.parchment }}>
              <div style={{ ...eyebrow, color: C.gold, fontSize: 8, marginBottom: 7 }}>Showroom talking points</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.55 }}>
                {talkingPoints.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          )}

          {details.length > 0 && (
            <div style={{ padding: '12px 12px', background: C.paper, border: `1px solid ${C.border}`, color: C.inkMid }}>
              <div style={{ ...eyebrow, color: C.copper, fontSize: 8, marginBottom: 7 }}>Reference detail</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.55 }}>
                {details.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            </div>
          )}

          <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.16)', color: 'rgba(243,234,214,0.75)', fontSize: 10.5, lineHeight: 1.5 }}>
            Smart Binder can point you to the likely binder/display/guardrail, but it does not replace BizTrack pricing, manufacturer installation instructions, or field verification.
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
function WbModeSwitch({ activeMode, hasCustomerFile, onChange }) {
  const modes = [
    { id: 'today', label: "Today's Work" },
    { id: 'customer-file', label: 'Customer File', disabled: !hasCustomerFile },
    { id: 'file-room', label: 'File Room' },
  ]

  return (
    <div className="wb-mode-switch" role="tablist" aria-label="Workbench modes">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={activeMode === mode.id}
          disabled={mode.disabled}
          className={`wb-mode-switch__tab${activeMode === mode.id ? ' is-active' : ''}`}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function WbHeader({
  busy,
  activeMode,
  hasCustomerFile,
  onModeChange,
  onUpload,
  onRecovery,
  onStartVisit,
  onToggleContext,
  contextOpen,
  fileInputRef,
  searchQuery,
  onSearchChange,
}) {
  return (
    <header className="wb-header">
      <Logo />
      <div className="wb-header__divider" />
      <div className="wb-header__intro">
        <div style={{ ...eyebrow, color: C.gold, fontSize: 9 }}>Sales Desk</div>
        <div className="wb-header__subcopy">Calmer daily triage, one focused customer file, separate cleanup room.</div>
      </div>
      <WbModeSwitch activeMode={activeMode} hasCustomerFile={hasCustomerFile} onChange={onModeChange} />
      <div style={{ flex: 1 }} />
      <input
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search jobs, quote #, vendor…"
        className="wb-header__search"
      />
      <label className={`wb-btn ${busy ? 'wb-btn--disabled' : ''}`} style={{ border: '1px solid rgba(243,234,214,0.3)', background: 'transparent', color: C.parchment, cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
        {busy ? 'Reading…' : '↑ Drop BisTrack PDF'}
        <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={busy} hidden />
      </label>
      <button className="wb-btn" onClick={onStartVisit} style={{ flexShrink: 0, border: '1px solid rgba(243,234,214,0.3)', background: 'transparent', color: C.parchment }}>+ Start Visit</button>
      <button className="wb-btn wb-btn--copper" onClick={onRecovery} style={{ flexShrink: 0 }}>+ Recover Old Quote</button>
      <button className={`wb-btn ${contextOpen ? 'wb-btn--primary' : ''}`} onClick={onToggleContext} style={{ flexShrink: 0, border: '1px solid rgba(243,234,214,0.3)', background: contextOpen ? C.copper : 'transparent', color: C.parchment }}>
        {contextOpen ? 'Hide Context' : 'Smart Context'}
      </button>
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

function CustomerFileCard({ file, selected, onClick, tabColor }) {
  const status = deriveQuoteStatus(file)
  const contact = [file.customerPhone, file.customerEmail].filter(Boolean).join(' · ')
  return (
    <div className="wb-ticket" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="wb-ticket__tab" style={{ background: tabColor }} />
      <div className={`wb-ticket__card ${selected ? 'is-selected' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ ...serif, fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.customerName || 'Unnamed Visit'}</div>
          <div style={{ ...mono, fontSize: 9, color: C.inkLight }}>VISIT</div>
        </div>
        <div style={{ fontSize: 10.5, color: C.inkMid, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.likelyPath || file.customerGoal || contact || 'No path saved yet'}
        </div>
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusChip status={status.status} label={getStatusLabel(status.status)} />
          <div style={{ flex: 1 }} />
          {status.unresolvedCount > 0 && <span className="wb-pill wb-pill--rust">{status.unresolvedCount}</span>}
        </div>
        {status.nextBestAction && (
          <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px dashed ${C.border}`, fontSize: 10, color: C.rust, fontWeight: 600, lineHeight: 1.4 }}>
            → {status.nextBestAction}
          </div>
        )}
      </div>
    </div>
  )
}

function WbLeftRail({ opportunities, customerFiles, activeId, activeCustomerFileId, onSelect, onSelectCustomerFile, activeUpload, searchQuery }) {
  const openVisitFiles = (customerFiles || []).filter((file) => !file.opportunityId && !file.archivedAt)
  const filters = [
    { label: `All ${opportunities.length + openVisitFiles.length}`, value: 'all' },
    { label: `Visits ${openVisitFiles.length}`, value: 'visits' },
    { label: 'Ready', value: 'ready-for-proposal' },
    { label: 'Follow-up', value: 'follow-up-needed' },
    { label: 'Recovery', value: 'new-intake' },
  ]
  const [filter, setFilter] = useState('all')

  const filteredTickets = filter === 'all' || filter === 'visits'
    ? filter === 'visits' ? [] : opportunities.filter(o => o.status !== 'archived')
    : opportunities.filter(o => o.status === filter && o.status !== 'archived')
  const filteredVisits = filter === 'all' || filter === 'visits' ? openVisitFiles : []

  const q = searchQuery.toLowerCase()
  const shownTickets = searchQuery
    ? filteredTickets.filter(o => (
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.quoteNumber || '').toLowerCase().includes(q) ||
        (o.projectType || '').toLowerCase().includes(q) ||
        (o.sourceLabel || '').toLowerCase().includes(q)
      ))
    : filteredTickets
  const shownVisits = searchQuery
    ? filteredVisits.filter(file => (
        (file.customerName || '').toLowerCase().includes(q) ||
        (file.customerPhone || '').toLowerCase().includes(q) ||
        (file.customerEmail || '').toLowerCase().includes(q) ||
        (file.customerGoal || '').toLowerCase().includes(q) ||
        (file.likelyPath || '').toLowerCase().includes(q)
      ))
    : filteredVisits

  const hasResults = shownTickets.length > 0 || shownVisits.length > 0 || activeUpload

  return (
    <aside className="wb-left" style={{ background: C.dark, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 16px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8 }}>Sales Inbox</div>
        <div style={{ ...serif, fontSize: 17, fontWeight: 600, marginTop: 2, color: C.ink }}>Job Tickets & Visits</div>
        <div style={{ display: 'flex', gap: 4, marginTop: 9, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{ fontSize: 9.5, padding: '3px 8px', background: filter === f.value ? C.mid : 'rgba(255,255,255,0.5)', color: filter === f.value ? C.parchment : C.inkMid, border: `1px solid ${filter === f.value ? C.forest : C.border}`, cursor: 'pointer', borderRadius: 2, fontWeight: 600, fontFamily: 'inherit' }}>{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 16px' }}>
        {activeUpload && (
          <ActiveUploadCard
            customerName={activeUpload.customerName}
            fileName={activeUpload.fileName}
            stageIdx={activeUpload.stageIdx}
          />
        )}

        {shownVisits.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5, margin: '6px 4px' }}>Open visit files</div>
            {shownVisits.map((file, i) => (
              <CustomerFileCard
                key={file.id}
                file={file}
                selected={file.id === activeCustomerFileId}
                onClick={() => onSelectCustomerFile(file.id)}
                tabColor={TAB_COLORS[(i + 2) % TAB_COLORS.length]}
              />
            ))}
          </div>
        )}

        {shownTickets.length > 0 && (
          <div style={{ marginTop: shownVisits.length ? 12 : 0 }}>
            {shownVisits.length > 0 && <div style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5, margin: '6px 4px' }}>Imported quote tickets</div>}
            {shownTickets.map((opp, i) => (
              <TicketCard
                key={opp.id}
                opp={opp}
                selected={opp.id === activeId}
                onClick={() => onSelect(opp.id)}
                tabColor={TAB_COLORS[i % TAB_COLORS.length]}
              />
            ))}
          </div>
        )}

        {!hasResults && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: C.inkLight, fontSize: 12 }}>
            {searchQuery ? `No files match "${searchQuery}".` : 'No files in this filter.'}
          </div>
        )}

        {opportunities.length === 0 && openVisitFiles.length === 0 && !activeUpload && (
          <div style={{ marginTop: 16, padding: 12, background: C.paper, border: `1px dashed ${C.border}`, fontSize: 11, color: C.inkMid, lineHeight: 1.5 }}>
            No saved quotes or visits yet. Start a visit or upload a BisTrack PDF in the header.
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Right Rail ───────────────────────────────────────────────────
function WbRightRail({ activeFile, fields, lineItems, vendors, displayRecords, hasActiveFile, onOpenRef, onCustomerFileChange }) {
  return (
    <aside className="wb-right" style={{ background: C.wood, backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '5px 5px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: C.forest, color: C.parchment, padding: '11px 13px', borderBottom: `3px solid ${C.copper}`, flexShrink: 0 }}>
        <div style={{ ...eyebrow, color: C.gold, fontSize: 8.5 }}>Smart Context</div>
        <div style={{ ...serif, fontSize: 15, fontWeight: 600, marginTop: 2 }}>
          {hasActiveFile ? 'Smart Context' : 'No file open'}
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(243,234,214,0.65)', marginTop: 3 }}>
          {hasActiveFile ? 'Top matches only. Use the Smart Binder tab for full search.' : 'Open a visit or quote ticket to load references.'}
        </div>
      </div>

      <div style={{ flex: 1, padding: 11, overflowY: 'auto' }}>
        {!hasActiveFile ? (
          <div style={{ flex: 1, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(243,234,214,0.4)', fontSize: 11.5, textAlign: 'center', padding: 20, lineHeight: 1.5 }}>
            Smart Binder suggestions appear after you open a showroom visit or quote file.
          </div>
        ) : (
          <ReferenceBinder
            file={activeFile}
            fields={fields}
            lineItems={lineItems}
            vendors={vendors}
            displayRecords={displayRecords}
            onOpenReference={onOpenRef}
            onCustomerFileChange={onCustomerFileChange}
            compact
          />
        )}
      </div>
    </aside>
  )
}


// ─── File Organizer ────────────────────────────────────────────────
function TodayRecordCard({ eyebrowLabel, title, meta, actionLabel, onOpen, status, note }) {
  return (
    <button type="button" className="wb-today-card" onClick={onOpen}>
      <div className="wb-today-card__top">
        <div>
          <div className="wb-today-card__eyebrow">{eyebrowLabel}</div>
          <div className="wb-today-card__title">{title}</div>
        </div>
        {status}
      </div>
      {meta && <div className="wb-today-card__meta">{meta}</div>}
      {note && <div className="wb-today-card__note">{note}</div>}
      <div className="wb-today-card__action">{actionLabel}</div>
    </button>
  )
}

function TodaySection({ title, count, empty, children }) {
  return (
    <section className="wb-today-section">
      <div className="wb-today-section__head">
        <div className="wb-today-section__label">{title}</div>
        <div className="wb-today-section__count">{count} {count === 1 ? 'item' : 'items'}</div>
      </div>
      {count === 0 ? <div className="wb-today-section__empty">{empty}</div> : <div className="wb-today-section__list">{children}</div>}
    </section>
  )
}

function TodayWorkspace({ opportunities, customerFiles, activeUpload, onOpenTicket, onOpenCustomerFile }) {
  const today = useMemo(() => deriveTodayWorkbench({ opportunities, customerFiles }), [opportunities, customerFiles])

  return (
    <div className="wb-today">
      <section className="wb-today-hero">
        <div>
          <div className="wb-today-hero__eyebrow">Today&apos;s Work</div>
          <h1>What needs attention right now.</h1>
          <p>Start with the few things that actually need movement today. Old archive cleanup stays out of the way until you open File Room.</p>
        </div>
        <div className="wb-today-hero__stats">
          <div><strong>{today.importsNeedingReview.length + (activeUpload ? 1 : 0)}</strong><span>Imports to review</span></div>
          <div><strong>{today.activeCustomerWork.length}</strong><span>Customer files</span></div>
          <div><strong>{today.followUpItems.length}</strong><span>Follow-up</span></div>
          <div><strong>{today.readyItems.length}</strong><span>Ready to send</span></div>
        </div>
      </section>

      <div className="wb-today-grid">
        <TodaySection title="Quote imports needing review" count={today.importsNeedingReview.length + (activeUpload ? 1 : 0)} empty="No quote imports are waiting on review.">
          {activeUpload && (
            <div className="wb-today-card wb-today-card--upload">
              <div className="wb-today-card__eyebrow">Active import</div>
              <div className="wb-today-card__title">{activeUpload.customerName || activeUpload.fileName || 'Reading imported file'}</div>
              <div className="wb-today-card__meta">{activeUpload.fileName || 'BisTrack import in progress'}</div>
              <div className="wb-today-card__action">Finish review in the current import workspace</div>
            </div>
          )}
          {today.importsNeedingReview.map((item) => (
            <TodayRecordCard
              key={item.id}
              eyebrowLabel="Imported quote"
              title={item.customerName || 'Unnamed quote'}
              meta={[item.quoteNumber ? `#${item.quoteNumber}` : '', item.projectType, item.quoteDate].filter(Boolean).join(' · ')}
              note={item.nextAction}
              actionLabel="Open customer file"
              status={<StatusChip status={item.status} />}
              onOpen={() => onOpenTicket(item.id)}
            />
          ))}
        </TodaySection>

        <TodaySection title="Active visits and customer files" count={today.activeCustomerWork.length} empty="No active customer files yet. Start a visit or import a BisTrack quote.">
          {today.activeCustomerWork.map((file) => {
            const status = deriveQuoteStatus(file)
            return (
              <TodayRecordCard
                key={file.id}
                eyebrowLabel="Customer file"
                title={file.customerName || 'Unnamed visit'}
                meta={[file.customerGoal, file.likelyPath, file.customerPhone || file.customerEmail].filter(Boolean).join(' · ') || 'Showroom visit in motion'}
                note={status.nextBestAction}
                actionLabel="Open customer file"
                status={<span className="wb-pill wb-pill--green">{getStatusLabel(status.status)}</span>}
                onOpen={() => onOpenCustomerFile(file.id)}
              />
            )
          })}
        </TodaySection>

        <TodaySection title="Follow-up needed" count={today.followUpItems.length} empty="Nothing is waiting on follow-up right now.">
          {today.followUpItems.map((item) => {
            const record = item.record
            const isFile = item.kind === 'customer-file'
            return (
              <TodayRecordCard
                key={`${item.kind}-${item.id}`}
                eyebrowLabel={isFile ? 'Customer file' : 'Imported quote'}
                title={record.customerName || 'Unnamed follow-up'}
                meta={isFile ? [record.customerPhone || record.customerEmail, record.customerGoal].filter(Boolean).join(' · ') : [record.quoteNumber ? `#${record.quoteNumber}` : '', record.projectType].filter(Boolean).join(' · ')}
                note={isFile ? deriveQuoteStatus(record).nextBestAction : record.nextAction || 'Follow up with the customer.'}
                actionLabel={isFile ? 'Open follow-up plan' : 'Open customer file'}
                status={<span className="wb-pill wb-pill--gold">Follow-up</span>}
                onOpen={() => (isFile ? onOpenCustomerFile(record.id) : onOpenTicket(record.id))}
              />
            )
          })}
        </TodaySection>

        <TodaySection title="Ready to send or save" count={today.readyItems.length} empty="Nothing is queued as ready to send right now.">
          {today.readyItems.map((item) => {
            const record = item.record
            const isFile = item.kind === 'customer-file'
            return (
              <TodayRecordCard
                key={`${item.kind}-${item.id}`}
                eyebrowLabel={isFile ? 'Customer file' : 'Imported quote'}
                title={record.customerName || 'Ready item'}
                meta={isFile ? [record.packetGeneratedAt ? 'Packet generated' : '', record.packetSendChannel].filter(Boolean).join(' · ') : [record.quoteNumber ? `#${record.quoteNumber}` : '', record.originalQuoteAmount || record.quotationTotal].filter(Boolean).join(' · ')}
                note={isFile ? deriveQuoteStatus(record).nextBestAction : record.nextAction || 'Proposal is ready for polish.'}
                actionLabel={isFile ? 'Open proposal / packet' : 'Open customer file'}
                status={<span className="wb-pill wb-pill--green">Ready</span>}
                onOpen={() => (isFile ? onOpenCustomerFile(record.id) : onOpenTicket(record.id))}
              />
            )
          })}
        </TodaySection>
      </div>

      <TodaySection title="Recent activity" count={today.recentItems.length} empty="No recent work yet.">
        {today.recentItems.map((item) => {
          const record = item.record
          const isFile = item.kind === 'customer-file'
          return (
            <TodayRecordCard
              key={`recent-${item.kind}-${item.id}`}
              eyebrowLabel={isFile ? 'Customer file' : 'Imported quote'}
              title={record.customerName || 'Recent work'}
              meta={[record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '', isFile ? record.customerGoal : record.projectType].filter(Boolean).join(' · ')}
              actionLabel="Open"
              onOpen={() => (isFile ? onOpenCustomerFile(record.id) : onOpenTicket(record.id))}
            />
          )
        })}
      </TodaySection>
    </div>
  )
}

function FileOrganizer({ opportunities, customerFiles, onOpenTicket, onOpenCustomerFile, onArchiveTicket, onRestoreTicket, onDeleteTicket, onArchiveCustomerFile, onRestoreCustomerFile, onDeleteCustomerFile }) {
  const [view, setView] = useState('active')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(null)
  const summary = summarizeWorkbenchRecords({ opportunities, customerFiles })
  const records = filterWorkbenchRecords({ opportunities, customerFiles }, { view, query })
  const duplicates = useMemo(() => findPossibleDuplicates({ opportunities, customerFiles }), [opportunities, customerFiles])
  const views = [
    { id: 'active', label: `Active ${summary.active}` },
    { id: 'review', label: `Needs work ${summary.needsReview}` },
    { id: 'followup', label: `Follow-up ${summary.followUp}` },
    { id: 'quotes', label: `Quotes ${summary.quotes}` },
    { id: 'visits', label: `Visits ${summary.visits}` },
    { id: 'archive', label: `Archive ${summary.archived}` },
  ]

  function deleteWithConfirm(type, id, handler) {
    const key = `${type}:${id}`
    if (confirming === key) {
      handler(id)
      setConfirming(null)
      return
    }
    setConfirming(key)
    window.setTimeout(() => setConfirming((current) => current === key ? null : current), 4500)
  }

  return (
    <div className="wb-organizer">
      <div className="wb-organizer__hero">
        <div>
          <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>File room</div>
          <h1>Organize quotes, visits, and old invoices without crowding the sales desk.</h1>
          <p>Archive records you may need later. Delete only duplicates, bad imports, or true mistakes. Active selling work stays on the left rail.</p>
        </div>
        <div className="wb-organizer__stats" aria-label="Record summary">
          <div><strong>{summary.active}</strong><span>Active</span></div>
          <div><strong>{summary.ready}</strong><span>Ready</span></div>
          <div><strong>{summary.followUp}</strong><span>Follow-up</span></div>
          <div><strong>{summary.archived}</strong><span>Archived</span></div>
        </div>
      </div>

      <div className="wb-organizer__toolbar">
        <div className="wb-organizer__views" role="tablist" aria-label="Organizer views">
          {views.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? 'is-active' : ''} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, quote #, phone, file…" aria-label="Search organizer" />
      </div>

      <div className="wb-organizer__body">
        <section>
          <div className="wb-organizer__section-title">
            <span>Quote / invoice imports</span>
            <small>{records.opportunities.length} shown</small>
          </div>
          {records.opportunities.length === 0 ? (
            <div className="wb-organizer__empty">No quote records in this view.</div>
          ) : records.opportunities.map((opp) => {
            const archived = opp.status === 'archived'
            const deleteKey = `ticket:${opp.id}`
            return (
              <article className={`wb-organizer-card${archived ? ' is-archived' : ''}`} key={opp.id}>
                <div>
                  <div className="wb-organizer-card__title">{opp.customerName || 'Unnamed quote'}</div>
                  <div className="wb-organizer-card__meta">
                    {[opp.quoteNumber ? `#${opp.quoteNumber}` : '', opp.projectType, opp.quoteDate, opp.originalQuoteAmount || opp.quotationTotal].filter(Boolean).join(' · ') || 'Quote record'}
                  </div>
                  <div className="wb-organizer-card__status"><StatusChip status={opp.status} /></div>
                </div>
                <div className="wb-organizer-card__actions">
                  {!archived && <button className="wb-btn" onClick={() => onOpenTicket(opp.id)}>Open</button>}
                  {archived
                    ? <button className="wb-btn" onClick={() => onRestoreTicket(opp.id)}>Restore</button>
                    : <button className="wb-btn" onClick={() => onArchiveTicket(opp.id)}>Archive</button>}
                  <button className="wb-btn wb-btn--ghost" onClick={() => deleteWithConfirm('ticket', opp.id, onDeleteTicket)}>
                    {confirming === deleteKey ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        <section>
          <div className="wb-organizer__section-title">
            <span>Visit / customer files</span>
            <small>{records.customerFiles.length} shown</small>
          </div>
          {records.customerFiles.length === 0 ? (
            <div className="wb-organizer__empty">No visit files in this view.</div>
          ) : records.customerFiles.map((file) => {
            const archived = Boolean(file.archivedAt)
            const deleteKey = `file:${file.id}`
            return (
              <article className={`wb-organizer-card${archived ? ' is-archived' : ''}`} key={file.id}>
                <div>
                  <div className="wb-organizer-card__title">{file.customerName || 'Unnamed visit'}</div>
                  <div className="wb-organizer-card__meta">
                    {[file.customerGoal, file.likelyPath, file.customerPhone || file.customerEmail].filter(Boolean).join(' · ') || 'Showroom visit file'}
                  </div>
                  {archived ? <span className="wb-pill wb-pill--gold">Archived visit</span> : <span className="wb-pill wb-pill--green">Active visit</span>}
                </div>
                <div className="wb-organizer-card__actions">
                  {!archived && <button className="wb-btn" onClick={() => onOpenCustomerFile(file.id)}>Open</button>}
                  {archived
                    ? <button className="wb-btn" onClick={() => onRestoreCustomerFile(file.id)}>Restore</button>
                    : <button className="wb-btn" onClick={() => onArchiveCustomerFile(file.id)}>Archive</button>}
                  <button className="wb-btn wb-btn--ghost" onClick={() => deleteWithConfirm('file', file.id, onDeleteCustomerFile)}>
                    {confirming === deleteKey ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </article>
            )
          })}
        </section>

        <section>
          <div className="wb-organizer__section-title">
            <span>Deleted / trash</span>
            <small>Permanent local delete only</small>
          </div>
          <div className="wb-organizer__empty">
            This local storage model does not keep a soft-delete trash bin yet. Delete removes the record immediately after confirmation.
          </div>
        </section>

        <section>
          <div className="wb-organizer__section-title">
            <span>Possible duplicates</span>
            <small>{duplicates.length} groups</small>
          </div>
          {duplicates.length === 0 ? (
            <div className="wb-organizer__empty">No likely duplicates were detected from quote numbers, linked quotes, or repeated customer contact info.</div>
          ) : duplicates.map((group, index) => (
            <div className="wb-organizer__duplicate" key={`${group.reason}-${index}`}>
              <div className="wb-organizer__duplicate-reason">{group.reason}</div>
              <div className="wb-organizer__duplicate-list">
                {group.items.map((item) => (
                  <div key={`${item.kind}-${item.record.id}`} className="wb-organizer__duplicate-item">
                    <div>
                      <strong>{item.record.customerName || 'Unnamed record'}</strong>
                      <span>{item.kind === 'opportunity'
                        ? [item.record.quoteNumber ? `#${item.record.quoteNumber}` : '', item.record.projectType].filter(Boolean).join(' · ') || 'Imported quote'
                        : [item.record.customerPhone || item.record.customerEmail, item.record.likelyPath].filter(Boolean).join(' · ') || 'Customer file'}</span>
                    </div>
                    <button className="wb-btn" onClick={() => (item.kind === 'opportunity' ? onOpenTicket(item.record.id) : onOpenCustomerFile(item.record.id))}>Open</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
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
          Every job ticket can pin vendor price books, manuals, showroom display context, and follow-up history. Smart Binder can now open current vendor references, import downloaded PDFs, and build a searchable page index for manuals and brochures.
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

function MissingInfoCard({ warning, index, resolved, resolveOptions }) {
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
      {resolveOptions && resolveOptions.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {resolveOptions.map(opt => (
            <button key={opt.label} className={`wb-btn ${opt.primary ? 'wb-btn--primary' : ''}`} style={{ padding: '4px 9px', fontSize: 10 }} onClick={opt.action}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function buildResolveOptions(warning, { onResolveWarning, onLineItemAttachChange }) {
  const w = warning.toLowerCase()
  if (w.includes('line items need category')) {
    return [
      { label: 'Confirm categories OK', primary: true, action: () => onResolveWarning(warning) },
    ]
  }
  if (w.includes('estimate basis') && w.includes('fallback')) {
    return [
      { label: 'Confirm line-item quote attached', primary: true, action: () => { onLineItemAttachChange(true); onResolveWarning(warning) } },
    ]
  }
  if (w.includes('current setup') || w.includes('goal details')) {
    return [
      { label: 'Confirmed internally', primary: true, action: () => onResolveWarning(warning) },
    ]
  }
  if (w.includes('older than 90 days') || w.includes('confirm pricing')) {
    return [
      { label: 'Pricing confirmed current', primary: true, action: () => onResolveWarning(warning) },
    ]
  }
  return [
    { label: 'Mark resolved', primary: true, action: () => onResolveWarning(warning) },
  ]
}

function UploadWorkspace({
  fields, lineItems, parseContext, proposalMode, reviewState, lineItemQuoteAttached,
  saveStatus, pendingDuplicate, status, stageIdx, warnings, resolvedWarnings,
  onFieldChange, onReviewChange, onLineItemAttachChange,
  onSave, onSaveDraft, onResolveWarning, onUpdateDuplicate, onSaveSeparate, onCancelDuplicate,
}) {
  const [showProposalModal, setShowProposalModal] = useState(false)
  const customerName = fields.CUSTOMER_NAME || '—'
  const quoteNo = fields.QUOTE_NO
  const conf = parseContext?.sourceConfidence

  const unresolvedWarnings = warnings.filter(w => !resolvedWarnings.has(w))
  const resolvedList = warnings.filter(w => resolvedWarnings.has(w))
  const [showPreview, setShowPreview] = useState(() => unresolvedWarnings.length === 0)

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
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showPreview ? '1fr 390px' : '1fr', minHeight: 0 }}>
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
                    resolveOptions={buildResolveOptions(w, { onResolveWarning, onLineItemAttachChange })}
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
              <div style={{ background: 'rgba(45,74,54,0.08)', border: `1px solid rgba(45,74,54,0.2)`, padding: '6px 11px', fontSize: 11, fontWeight: 600, color: C.mid }}>✓ Detailed Investment Breakdown</div>
              <div style={{ fontSize: 10.5, color: C.inkLight }}>Warm Summary is page 3 supporting content only</div>
            </div>
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

          {/* Preview toggle */}
          <div>
            <button className="wb-btn" onClick={() => setShowPreview(p => !p)} style={{ fontSize: 11 }}>
              {showPreview ? 'Hide proposal preview' : 'Show proposal preview'}
            </button>
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
        {showPreview && (
          <ScaledProposalPreview
            fields={fields}
            parseContext={parseContext}
            lineItems={lineItems}
            proposalMode={proposalMode}
            lineItemQuoteAttached={lineItemQuoteAttached}
            onExpand={() => setShowProposalModal(true)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Ticket Workspace (center for saved opportunity) ──────────────
function TicketWorkspace({ ticket, customerFile, onSaveDraft, onCustomerFileChange, onOpenReference }) {
  const [showProposalPreview, setShowProposalPreview] = useState(false)
  const [showProposalModal, setShowProposalModal] = useState(false)

  const fields = useMemo(() => {
    const base = opportunityToQuoteFields(ticket)
    return applyDefaults({ ...createEmptyFieldState(), ...base })
  }, [ticket])

  const stageIdx = ticketStageIndex(ticket.status)
  const conf = ticket.sourceConfidence

  const statusContent = {
    'follow-up-needed': {
      title: 'Queue follow-up to customer',
      sub: 'Copy follow-up text, send externally, then mark waiting on customer.',
    },
    'ready-for-proposal': {
      title: 'Ready to polish the proposal',
      sub: 'Print or save PDF, attach BisTrack line-item quote, then send.',
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

          {/* Lifecycle status + readiness — derived from customer file data */}
          {customerFile && (() => {
            const qs = deriveQuoteStatus(customerFile)
            return (
              <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${qs.readiness.ready ? C.mid : C.copper}`, padding: '11px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Customer File Status</div>
                  <div style={{ ...serif, fontSize: 14, fontWeight: 700, color: C.ink }}>{getStatusLabel(qs.status)}</div>
                  {qs.unresolvedCount > 0 && <span className="wb-pill wb-pill--rust">{qs.unresolvedCount} to resolve</span>}
                  {qs.readiness.ready && <span className="wb-pill wb-pill--green">Ready</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.inkMid, marginTop: 4 }}>
                  Next: {qs.readiness.nextRecommendedAction}
                </div>
              </div>
            )
          })()}

          {customerFile && (
            <WorkspaceTabs
              tabs={[
                {
                  id: 'overview',
                  label: 'Overview',
                  badge: qsForBadge(customerFile),
                  children: (
                    <PanelStack>
                      <SalesJourneyBoard file={customerFile} onChange={onCustomerFileChange} compact />
                      <WorkspaceHint title="Keep this screen calm">
                        Use the tabs above for deeper binder search, path planning, packet work, and follow-up. The right rail stays available for quick Smart Binder suggestions.
                      </WorkspaceHint>
                    </PanelStack>
                  ),
                },
                {
                  id: 'path',
                  label: 'Sales Path',
                  children: (
                    <PanelStack>
                      <GuidedPathFinder file={customerFile} onChange={onCustomerFileChange} />
                      <WorkspaceHint title="System is tracking">
                        Quiet signals keep watching photos, measurements, quote import, packet state, and handoff readiness. Use manual corrections only if the file missed something real.
                      </WorkspaceHint>
                      <IssueResolutionPanel file={customerFile} onChange={onCustomerFileChange} title="Review details if needed" />
                      <TakeHomeChecklist file={customerFile} onChange={onCustomerFileChange} />
                    </PanelStack>
                  ),
                },
                {
                  id: 'packet',
                  label: 'Proposal / Packet',
                  children: (
                    <PanelStack>
                      <CustomerPacketPanel file={customerFile} onChange={onCustomerFileChange} onPrint={() => window.print()} />
                      <SchedulerHandoffPanel file={customerFile} onChange={onCustomerFileChange} />
                    </PanelStack>
                  ),
                },
                {
                  id: 'followup',
                  label: 'Follow-up',
                  children: (
                    <PanelStack>
                      <FollowUpPlanPanel file={customerFile} onChange={onCustomerFileChange} />
                    </PanelStack>
                  ),
                },
                {
                  id: 'binder',
                  label: 'Smart Binder',
                  children: (
                    <PanelStack>
                      <ReferenceBinder file={customerFile} fields={fields} onOpenReference={onOpenReference} onCustomerFileChange={onCustomerFileChange} />
                    </PanelStack>
                  ),
                },
              ]}
            />
          )}

          {/* Legacy warnings still shown if present and no customer file (back-compat) */}
          {!customerFile && warnings.length > 0 && (
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

          {!customerFile && ticket.status === 'ready-for-proposal' && (
            <div style={{ background: C.paper, border: `1px solid ${C.border}`, padding: 14, fontSize: 11.5, color: C.inkMid }}>
              Customer Packet controls appear after a customer file is linked. Save/import the ticket to create the file, then use the packet panel.
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
  empty:             { copy: "Review today's work, then open the customer file that needs the next real move.", cta: null },
  recovery:          { copy: 'Review OCR results — queue high-confidence rows, fix low-confidence ones.', cta: null },
  organize:          { copy: 'Use File Room to archive old work, restore what belongs back on the desk, and delete only confirmed mistakes.', cta: null },
  upload_unresolved: { copy: 'Resolve all warnings above, then mark the quote as reviewed before saving.', cta: null },
  upload_follow_up:  { copy: 'Mark this quote as Follow-Up Needed and save it to the queue.', cta: 'Mark as Follow-Up ✓' },
  upload_reviewed:   { copy: 'All clear. Save to the opportunity queue.', cta: 'Save to Queue →' },
  ticket_ready:      { copy: 'Use the packet panel to generate, print, email, and log the customer packet.', cta: null },
  ticket_followup:   { copy: 'Use the Follow-Up Plan panel to create real dated tasks before contacting the customer.', cta: null },
  ticket_review:     { copy: 'Resolve missing info items in the ticket panel before sending.', cta: null },
  ticket_other:      { copy: 'Review the ticket and determine the next step for this job.', cta: null },
}

function NextBestAction({ mode, reviewState, ticketStatus, derivedNextAction, onSave, onCta }) {
  let key = 'empty'
  if (mode === 'recovery') key = 'recovery'
  else if (mode === 'organize') key = 'organize'
  else if (mode === 'upload') key = `upload_${reviewState}`
  else if (mode === 'ticket') {
    if (ticketStatus === 'ready-for-proposal') key = 'ticket_ready'
    else if (ticketStatus === 'follow-up-needed') key = 'ticket_followup'
    else if (ticketStatus === 'needs-review' || ticketStatus === 'blocked-missing-info') key = 'ticket_review'
    else key = 'ticket_other'
  }
  const base = NBA_MAP[key] || NBA_MAP.empty
  const v = (mode === 'ticket' || mode === 'customer-file') && derivedNextAction ? { copy: derivedNextAction, cta: null } : base

  function handleCta() {
    if (key === 'upload_reviewed') { onSave(); return }
    if (key === 'upload_follow_up') { onCta('upload_follow_up'); return }
  }

  return (
    <div className="wb-nba">
      <div style={{ width: 36, height: 36, background: C.copper, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.forest, fontWeight: 800, fontSize: 17, flexShrink: 0 }}>→</div>
      <div style={{ flex: 1 }}>
        <div style={{ ...eyebrow, color: C.gold, fontSize: 8 }}>Next Best Action</div>
        <div style={{ ...serif, fontSize: 14, fontWeight: 600, marginTop: 2 }}>{v.copy}</div>
      </div>
      {v.cta && (
        <button className="wb-btn wb-btn--copper" onClick={handleCta} style={{ flexShrink: 0 }}>{v.cta}</button>
      )}
    </div>
  )
}

// ─── Customer File Workspace (visit started, no quote imported yet) ─
function CustomerFileWorkspace({ file, onCustomerFileChange, onUploadClick, onBack, onOpenReference }) {
  const qs = deriveQuoteStatus(file)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: C.parchment }}>
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, padding: '13px 24px 15px', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: -10, left: 24, padding: '3px 12px', background: C.copper, color: '#fff', ...eyebrow, fontSize: 9 }}>
          CUSTOMER FILE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, padding: '3px 8px', borderRadius: 2, background: C.mid, color: C.parchment }}>
            {getStatusLabel(qs.status)}
          </span>
          {qs.unresolvedCount > 0 && <span className="wb-pill wb-pill--rust">{qs.unresolvedCount} to resolve</span>}
          {qs.readiness.ready && <span className="wb-pill wb-pill--green">Packet ready</span>}
          <div style={{ flex: 1 }} />
          <button className="wb-btn" onClick={onBack} style={{ fontSize: 11 }}>← Back</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
          <div>
            <div style={{ ...serif, fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: C.ink }}>{file.customerName || 'Unnamed Visit'}</div>
            <div style={{ fontSize: 11, color: C.inkMid, marginTop: 3 }}>
              {[file.customerPhone, file.customerEmail].filter(Boolean).join(' · ') || 'No contact channel yet'}
            </div>
          </div>
          <button className="wb-btn wb-btn--copper" onClick={onUploadClick} style={{ fontSize: 12 }}>
            ↑ Import BizTrack quote
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${qs.readiness.ready ? C.mid : C.copper}`, padding: '11px 14px' }}>
          <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Right now</div>
          <div style={{ ...serif, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 3 }}>
            {qs.nextBestAction}
          </div>
          {file.customerGoal && (
            <div style={{ fontSize: 12, color: C.inkMid, marginTop: 6, lineHeight: 1.5 }}>
              <strong>Goal:</strong> {file.customerGoal}
            </div>
          )}
        </div>

        <WorkspaceTabs
          tabs={[
            {
              id: 'overview',
              label: 'Overview',
              badge: qsForBadge(file),
              children: (
                <PanelStack>
                  <SalesJourneyBoard file={file} onChange={onCustomerFileChange} compact />
                  <WorkspaceHint title="Showroom mode">
                    Start with the overview and sales path while the customer is with you. Move to Smart Binder only when you need a manual, brochure, display, or guardrail.
                  </WorkspaceHint>
                </PanelStack>
              ),
            },
            {
              id: 'path',
              label: 'Sales Path',
              children: (
                <PanelStack>
                  <GuidedPathFinder file={file} onChange={onCustomerFileChange} />
                  <WorkspaceHint title="System is tracking">
                    Quiet signals keep watching photos, measurements, model tags, quote import, and packet readiness. Manual corrections stay available only when the file needs help.
                  </WorkspaceHint>
                  <IssueResolutionPanel file={file} onChange={onCustomerFileChange} title="Review details if needed" />
                  <TakeHomeChecklist file={file} onChange={onCustomerFileChange} />
                </PanelStack>
              ),
            },
            {
              id: 'packet',
              label: 'Proposal / Packet',
              children: (
                <PanelStack>
                  <CustomerPacketPanel file={file} onChange={onCustomerFileChange} onPrint={() => window.print()} />
                  <SchedulerHandoffPanel file={file} onChange={onCustomerFileChange} />
                </PanelStack>
              ),
            },
            {
              id: 'followup',
              label: 'Follow-up',
              children: (
                <PanelStack>
                  <FollowUpPlanPanel file={file} onChange={onCustomerFileChange} />
                </PanelStack>
              ),
            },
            {
              id: 'binder',
              label: 'Smart Binder',
              children: (
                <PanelStack>
                  <ReferenceBinder file={file} onOpenReference={onOpenReference} onCustomerFileChange={onCustomerFileChange} />
                </PanelStack>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

// ─── Main Shell ───────────────────────────────────────────────────
export default function WorkbenchShell() {
  const emptyFields = useMemo(() => applyDefaults(createEmptyFieldState()), [])

  // Workbench mode
  const [mode, setMode] = useState('today')
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [oppList, setOppList] = useState(() => listOpportunities())
  const [customerFiles, setCustomerFiles] = useState(() => listCustomerFiles())
  const [activeCustomerFileId, setActiveCustomerFileId] = useState(null)

  // Upload / quote polish state
  const [fields, setFields] = useState(emptyFields)
  const [parseContext, setParseContext] = useState(emptyContext)
  const [lineItems, setLineItems] = useState([])
  const proposalMode = 'detailed'
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

  // Reference drawer and right-side context
  const [refDrawerItem, setRefDrawerItem] = useState(null)
  const [smartContextOpen, setSmartContextOpen] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Placeholder toast for unconnected actions
  const [placeholderMsg, setPlaceholderMsg] = useState('')

  function showPlaceholder(msg) {
    setPlaceholderMsg(msg)
    setTimeout(() => setPlaceholderMsg(''), 5000)
  }

  const activeTicket = useMemo(() => oppList.find(o => o.id === activeTicketId) || null, [oppList, activeTicketId])

  // Active customer file: explicit visit-mode selection OR auto-hydrated from active ticket.
  const activeCustomerFile = useMemo(() => {
    if (activeCustomerFileId) {
      return customerFiles.find(f => f.id === activeCustomerFileId) || null
    }
    if (activeTicket) {
      const linked = customerFiles.find(f => f.opportunityId === activeTicket.id)
      if (linked) return linked
    }
    return null
  }, [activeCustomerFileId, customerFiles, activeTicket])

  const activeWorkbenchMode = useMemo(() => {
    if (mode === 'organize') return 'file-room'
    if (mode === 'customer-file' || mode === 'ticket' || mode === 'visit') return 'customer-file'
    return 'today'
  }, [mode])

  function refreshCustomerFiles() {
    setCustomerFiles(listCustomerFiles())
  }

  function handleCustomerFileChange(updated) {
    if (updated) {
      setCustomerFiles(listCustomerFiles())
    }
  }

  function handleStartVisit() {
    setMode('visit')
    setActiveTicketId(null)
    setActiveCustomerFileId(null)
  }

  function handleVisitCreated(file) {
    refreshCustomerFiles()
    setActiveCustomerFileId(file.id)
    setMode('customer-file')
  }

  function ensureCustomerFileForTicket(ticketId) {
    const ticket = listOpportunities().find(o => o.id === ticketId)
    if (!ticket) return null
    const existing = getCustomerFileByOpportunity(ticketId)
    if (existing) return existing
    const file = customerFileFromOpportunity(ticket)
    saveCustomerFile(file)
    refreshCustomerFiles()
    return file
  }

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

  const referenceVendors = useMemo(() => listVendors(), [])
  const referenceDisplayRecords = useMemo(() => listDisplayRecords(), [])

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

  function linkOpportunityToCustomerFile(opportunity) {
    const activeFile = activeCustomerFileId ? getCustomerFile(activeCustomerFileId) : null
    if (activeFile) {
      saveCustomerFile(mergeCustomerFileWithOpportunity(activeFile, opportunity))
      setActiveCustomerFileId(activeFile.id)
      refreshCustomerFiles()
      return
    }
    const linked = getCustomerFileByOpportunity(opportunity.id)
    if (!linked) {
      saveCustomerFile(customerFileFromOpportunity(opportunity))
      refreshCustomerFiles()
    }
  }

  function handleSaveToQueue() {
    if (reviewState === 'unresolved') { setSaveStatus('Mark this quote as reviewed above before saving.'); return }
    const allOpps = listOpportunities()
    const draft = buildQuotePolishQueueDraft({ fields, parseContext, lineItems, proposalMode, proposalReviewState: reviewState, lineItemQuoteAttached, setupGuidance, sendReadinessWarnings: warnings }, allOpps)
    if (draft.duplicate.isDuplicate) { setPendingDuplicate(draft); setSaveStatus('Possible duplicate found. Choose how to handle it.'); return }
    saveOpportunity(draft.opportunity)
    setPendingDuplicate(null)
    setSaveStatus(activeCustomerFileId ? 'Saved quote and linked it to the active customer file.' : 'Saved to the opportunity queue.')
    setOppList(listOpportunities())
    linkOpportunityToCustomerFile(draft.opportunity)
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
        linkOpportunityToCustomerFile(merged)
        setSaveStatus('Draft saved — updated existing record.')
        setOppList(listOpportunities())
        return
      }
    }
    saveOpportunity(draft.opportunity)
    linkOpportunityToCustomerFile(draft.opportunity)
    setSaveStatus(activeCustomerFileId ? 'Draft saved and linked to the active customer file.' : 'Draft saved.')
    setOppList(listOpportunities())
  }

  function handleUpdateDuplicate() {
    if (!pendingDuplicate) return
    const existing = listOpportunities().find(o => o.id === pendingDuplicate.duplicate.duplicateId)
    const merged = mergeQuotePolishOpportunity(existing, pendingDuplicate.opportunity)
    updateOpportunity(merged.id, merged)
    linkOpportunityToCustomerFile(merged)
    setPendingDuplicate(null)
    setSaveStatus(activeCustomerFileId ? 'Updated existing queue opportunity and linked the active customer file.' : 'Updated existing queue opportunity.')
    setOppList(listOpportunities())
  }

  function handleSaveSeparate() {
    if (!pendingDuplicate) return
    const separate = { ...pendingDuplicate.opportunity, id: `${pendingDuplicate.opportunity.id}-${Date.now()}`, warnings: [...pendingDuplicate.opportunity.warnings, 'Saved as separate after duplicate review.'] }
    saveOpportunity(separate)
    linkOpportunityToCustomerFile(separate)
    setPendingDuplicate(null)
    setSaveStatus(activeCustomerFileId ? 'Saved separate opportunity and linked the active customer file.' : 'Saved as a separate opportunity.')
    setOppList(listOpportunities())
  }

  function handleSelectTicket(id) {
    const file = ensureCustomerFileForTicket(id)
    setActiveTicketId(id)
    setActiveCustomerFileId(file?.id || null)
    setMode('customer-file')
  }

  function handleSelectCustomerFile(id) {
    setActiveCustomerFileId(id)
    const linkedFile = customerFiles.find((file) => file.id === id)
    setActiveTicketId(linkedFile?.opportunityId || null)
    setMode('customer-file')
  }

  function handleWorkbenchModeChange(nextMode) {
    if (nextMode === 'today') {
      setMode('today')
      return
    }
    if (nextMode === 'file-room') {
      setMode('organize')
      setActiveTicketId(null)
      return
    }
    if (nextMode === 'customer-file' && activeCustomerFile) {
      setMode('customer-file')
    }
  }

  function handleArchiveTicket(id) {
    updateOpportunity(id, { status: 'archived', updatedAt: new Date().toISOString(), nextAction: 'Archived for reference.' })
    if (activeTicketId === id) {
      setActiveTicketId(null)
      setMode('organize')
    }
    setOppList(listOpportunities())
  }

  function handleRestoreTicket(id) {
    updateOpportunity(id, { status: 'needs-review', updatedAt: new Date().toISOString(), nextAction: 'Review restored quote before sending.' })
    setOppList(listOpportunities())
  }

  function handleDeleteTicket(id) {
    removeOpportunity(id)
    if (activeTicketId === id) {
      setActiveTicketId(null)
      setMode('organize')
    }
    setOppList(listOpportunities())
  }

  function handleArchiveCustomerFile(id) {
    updateCustomerFile(id, { archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    if (activeCustomerFileId === id) {
      setActiveCustomerFileId(null)
      setMode('organize')
    }
    refreshCustomerFiles()
  }

  function handleRestoreCustomerFile(id) {
    updateCustomerFile(id, { archivedAt: '', updatedAt: new Date().toISOString() })
    refreshCustomerFiles()
  }

  function handleDeleteCustomerFile(id) {
    removeCustomerFile(id)
    if (activeCustomerFileId === id) {
      setActiveCustomerFileId(null)
      setMode('organize')
    }
    refreshCustomerFiles()
  }

  function handleResolveWarning(w) {
    setResolvedWarnings(prev => {
      const next = new Set(prev)
      next.add(w)
      return next
    })
  }


  const handleNbaCta = useCallback((key) => {
    if (key === 'upload_follow_up') {
      setReviewState('follow-up')
    }
  }, [])

  const hasActiveFileForReferences = mode === 'upload' || mode === 'ticket' || mode === 'customer-file'
  const derivedNextAction = activeCustomerFile ? deriveQuoteStatus(activeCustomerFile).nextBestAction : ''

  return (
    <div className="wb-shell">
      <ReferenceDrawer item={refDrawerItem} onClose={() => setRefDrawerItem(null)} />
      <PlaceholderToast msg={placeholderMsg} onDismiss={() => setPlaceholderMsg('')} />

      <WbHeader
        busy={busy}
        activeMode={activeWorkbenchMode}
        hasCustomerFile={Boolean(activeCustomerFile)}
        onModeChange={handleWorkbenchModeChange}
        onUpload={handleFile}
        onRecovery={() => setMode('recovery')}
        onStartVisit={handleStartVisit}
        onToggleContext={() => setSmartContextOpen((open) => !open)}
        contextOpen={smartContextOpen}
        fileInputRef={fileInputRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className={`wb-body ${smartContextOpen ? 'wb-body--context-open' : 'wb-body--context-closed'}`}>
        <WbLeftRail
          opportunities={oppList}
          customerFiles={customerFiles}
          activeId={activeTicketId}
          activeCustomerFileId={activeCustomerFileId}
          onSelect={handleSelectTicket}
          onSelectCustomerFile={handleSelectCustomerFile}
          activeUpload={activeUploadCard}
          searchQuery={searchQuery}
        />

        <div className="wb-center">
          {mode === 'today' && (
            oppList.length === 0 && customerFiles.length === 0 && !activeUploadCard ? (
              <EmptyHero onUpload={handleFile} onRecovery={() => setMode('recovery')} fileInputRef={heroFileInputRef} />
            ) : (
              <TodayWorkspace
                opportunities={oppList}
                customerFiles={customerFiles}
                activeUpload={activeUploadCard}
                onOpenTicket={handleSelectTicket}
                onOpenCustomerFile={handleSelectCustomerFile}
              />
            )
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
              customerFile={activeCustomerFile}
              onSaveDraft={handleSaveDraft}
              onCustomerFileChange={handleCustomerFileChange}
              onOpenReference={setRefDrawerItem}
            />
          )}
          {mode === 'visit' && (
            <ShowroomVisitStart
              onCreated={handleVisitCreated}
              onCancel={() => setMode('today')}
            />
          )}
          {mode === 'customer-file' && activeCustomerFile && (
            <CustomerFileWorkspace
              file={activeCustomerFile}
              onCustomerFileChange={handleCustomerFileChange}
              onUploadClick={() => fileInputRef.current?.click()}
              onBack={() => { setMode('today'); setActiveCustomerFileId(null); setActiveTicketId(null) }}
              onOpenReference={setRefDrawerItem}
            />
          )}
          {mode === 'organize' && (
            <FileOrganizer
              opportunities={oppList}
              customerFiles={customerFiles}
              onOpenTicket={handleSelectTicket}
              onOpenCustomerFile={handleSelectCustomerFile}
              onArchiveTicket={handleArchiveTicket}
              onRestoreTicket={handleRestoreTicket}
              onDeleteTicket={handleDeleteTicket}
              onArchiveCustomerFile={handleArchiveCustomerFile}
              onRestoreCustomerFile={handleRestoreCustomerFile}
              onDeleteCustomerFile={handleDeleteCustomerFile}
            />
          )}
          {mode === 'recovery' && <OldQuoteRecovery />}
        </div>

        {smartContextOpen && <WbRightRail
          activeFile={activeCustomerFile || {}}
          fields={activeFields}
          lineItems={activeLineItems}
          vendors={referenceVendors}
          displayRecords={referenceDisplayRecords}
          hasActiveFile={hasActiveFileForReferences}
          onOpenRef={setRefDrawerItem}
          onCustomerFileChange={handleCustomerFileChange}
        />}
      </div>

      <NextBestAction
        mode={mode}
        reviewState={reviewState}
        ticketStatus={activeTicket?.status}
        onSave={handleSaveToQueue}
        onCta={handleNbaCta}
        derivedNextAction={derivedNextAction}
      />
    </div>
  )
}
