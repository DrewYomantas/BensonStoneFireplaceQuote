// Customer Proposal Preview (Milestone 17) — pure projection.
//
// Builds a frozen, scrubbed customer-facing view model from existing projected
// and safe data. No storage access. No mutations. No AI inference.
//
// Only lines with reviewStatus 'ready_for_bistrack' or 'reviewed_for_prep'
// appear in the Detailed Investment Breakdown. All other lines are excluded.
// Every surfaced string is run through the same banned-phrase / sensitive-term
// scrub used in gate, handoff, and context projections.
//
// Internal fields (internalPrepNote, evidenceNote, sourceBasis, sourceNote,
// reviewFlags, reviewStatus labels, activity, follow-up) are never surfaced.

import { projectCustomerFileForDisplay } from './customerFileView.js'
import {
  quotePrepDraftFromCustomerFile,
  normalizeQuotePrepLine,
  buildQuotePrepEngineInput,
} from './quotePrepDraft.js'
import { evaluateFieldRules } from './fieldRules.js'
import { projectQuotePrepGateStatus, GATE_STATUS } from './quotePrepGate.js'
import { SETUP_TYPE_LABELS, DESIRED_OUTCOME_LABELS } from './setupGoalLens.js'

// ---- Scrub helpers ----------------------------------------------------------

const BANNED_PHRASES = [
  'ready to send',
  'proposal ready',
  'customer ready',
  'approved',
]

const SENSITIVE_TERMS = [
  'cost', 'buy price', 'average cost', 'margin', 'margin %',
  'supplier total', 'supplier history', 'inventory turn',
  'product rank', 'sales rank', 'sales performance',
  'raw ocr', 'raw pdf', 'private catalog', 'private file path',
  'ocr confidence', 'fuzzy confidence', 'bistrack confidence',
  'ocr', 'fuzzy match', 'internal confidence', 'needs review',
]

function safe(value) {
  if (value === undefined || value === null) return ''
  const s = String(value)
  const lower = s.toLowerCase()
  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) return ''
  }
  for (const t of SENSITIVE_TERMS) {
    if (lower.includes(t)) return ''
  }
  return s
}

function clampString(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

// ---- Line grouping ----------------------------------------------------------

const BREAKDOWN_GROUPS = Object.freeze([
  { id: 'fireplace-appliance',   label: 'Fireplace / Appliance' },
  { id: 'venting-chimney',       label: 'Venting / Chimney / Liner' },
  { id: 'trim-surround',         label: 'Trim / Face / Surround' },
  { id: 'controls-electrical',   label: 'Controls / Remotes / Electrical' },
  { id: 'accessories',           label: 'Accessories' },
  { id: 'install-labor',         label: 'Install / Labor / Service / Delivery' },
  { id: 'tax-permit',            label: 'Tax / Permit / Other' },
  { id: 'uncategorized',         label: 'Reviewed Items' },
])

export { BREAKDOWN_GROUPS }

// Priority-ordered — first match wins.
function classifyLine(line) {
  const hay = [line.category, line.name, line.description]
    .map((s) => clampString(s).toLowerCase())
    .join(' ')

  if (/\btax\b|\bpermit\b|\binspection[\s-]fee\b|\bcompliance\b/.test(hay)) return 'tax-permit'
  if (/\bdeliver(y|ing)?\b|\bfreight\b|\bshipping\b|\bhandling\b|\bmisc(ellaneous)?\b/.test(hay)) return 'install-labor'
  if (/\binstall\b|\blabor\b|\bservice\b/.test(hay)) return 'install-labor'
  if (/\bvent(ing)?\b|\bchimney\b|\bliner\b|\bflue\b|\bpipe\b|\btermination\b|\belbow\b|\btee\b|\bcoupler\b/.test(hay)) return 'venting-chimney'
  if (/\bremote\b|\bcontrol\b|\bthermostat\b|\belectrical\b|\bwall[\s-]?switch\b|\btv[\s-]?kit\b/.test(hay)) return 'controls-electrical'
  if (/\bmantel\b|\bsurround\b|\btrim\b|\bfacade\b|\bhearth\b|\bstone\b|\bveneer\b|\bmarble\b|\blimestone\b|\bslate\b|\bgranite\b/.test(hay)) return 'trim-surround'
  if (/\bblower\b|\bgrate\b|\bglass\b|\bember\b|\blog[\s-]?set\b|\bpilot\b|\bignition\b|\bscreen\b|\bflex\b|\bkomfort\b|\bplenum\b|\bheat[\s-]?management\b/.test(hay)) return 'accessories'
  if (/\binsert\b|\bfireplace\b|\bstove\b|\bunit\b/.test(hay)) return 'fireplace-appliance'
  return 'uncategorized'
}

// ---- Section builders -------------------------------------------------------

// Only lines with a "reviewed" status appear in the customer preview.
const REVIEWED_STATUSES = new Set(['ready_for_bistrack', 'reviewed_for_prep'])

function buildBreakdownGroups(lines) {
  const reviewed = lines
    .filter((l) => REVIEWED_STATUSES.has(l.reviewStatus))
    .map((raw) => {
      const line = normalizeQuotePrepLine(raw)
      const name = safe(line.name)
      if (!name) return null
      return Object.freeze({
        id: line.id,
        name,
        brand: safe(line.brand),
        partNumber: safe(line.partNumber),
        quantity: safe(line.quantity),
        customerSafeNotes: safe(line.customerSafeNotes),
        groupId: classifyLine(line),
      })
    })
    .filter(Boolean)

  return Object.freeze(
    BREAKDOWN_GROUPS
      .map((g) => {
        const groupLines = reviewed.filter((l) => l.groupId === g.id)
        if (!groupLines.length) return null
        return Object.freeze({
          id: g.id,
          label: g.label,
          lines: Object.freeze(groupLines.map((l) => Object.freeze({
            id: l.id,
            name: l.name,
            brand: l.brand,
            partNumber: l.partNumber,
            quantity: l.quantity,
            customerSafeNotes: l.customerSafeNotes,
          }))),
        })
      })
      .filter(Boolean),
  )
}

function buildGateStatus(file, draft, fieldRulesResult) {
  const status = projectQuotePrepGateStatus(file, { fieldRulesResult, reasonLimit: 6 })
  return Object.freeze({
    status: status.status,
    isReady: status.status === GATE_STATUS.ready,
    hasLines: status.hasLines,
    counts: status.counts,
    reasons: Object.freeze(
      (status.reasons || [])
        .map((r) => {
          const message = typeof r === 'string' ? safe(r) : safe(r && r.message)
          return message || null
        })
        .filter(Boolean),
    ),
  })
}

function buildWarmRecap(file) {
  const setupKey = clampString(file.lensSetupType)
  const setupLabel = safe(SETUP_TYPE_LABELS[setupKey])
  const projectType = setupLabel || 'fireplace project'
  return `Thank you for visiting Benson Stone. Based on our conversation, here is an overview of the proposed items for your ${projectType}.`
}

function buildGoalSummary(file) {
  return (
    safe(file.customerGoal) ||
    safe(file.goalNotes) ||
    safe(DESIRED_OUTCOME_LABELS[clampString(file.lensDesiredOutcome)]) ||
    ''
  )
}

function buildSetupSummary(file) {
  const setupKey = clampString(file.lensSetupType)
  const setupLabel = safe(SETUP_TYPE_LABELS[setupKey])
  const existingNotes = safe(file.existingNotes)
  const parts = []
  if (setupLabel) parts.push(setupLabel)
  if (existingNotes) parts.push(existingNotes)
  return parts.join('. ')
}

// ---- Public API -------------------------------------------------------------

export function buildCustomerProposalPreview(rawFile, options = {}) {
  const file = projectCustomerFileForDisplay(rawFile || {})
  const draft = quotePrepDraftFromCustomerFile(rawFile || {})

  const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
  const fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })

  const lines = Array.isArray(draft.lines) ? draft.lines : []
  const breakdownGroups = buildBreakdownGroups(lines)
  const gateStatus = buildGateStatus(file, draft, fieldRulesResult)

  const now = options.now instanceof Date ? options.now : new Date()
  const dateLabel = now.toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const reviewedLineCount = lines.filter((l) => l && REVIEWED_STATUSES.has(l.reviewStatus)).length

  return Object.freeze({
    title: 'Fireplace Project Proposal',
    customerName: safe(file.customerName) || '',
    projectLabel: safe(file.projectAddress) || '',
    dateLabel,
    warmRecap: buildWarmRecap(file),
    goalSummary: buildGoalSummary(file),
    setupSummary: buildSetupSummary(file),
    breakdownGroups,
    assumptions: safe(file.quotePrepUnverifiedItems) || '',
    nextStep: safe(file.quotePrepNextStep) || '',
    gateStatus,
    isEmpty: breakdownGroups.length === 0,
    reviewedLineCount,
    disclaimers: Object.freeze([
      'This overview is based on our initial consultation. Final pricing and specifications are confirmed in the official BisTrack quote.',
      'Benson Stone · Rockford, IL',
    ]),
  })
}
