// Projection + search for the Customer Files list screen.
//
// Pure logic: takes durable customer-file rows, projects each one through the
// display strip (sensitive keys removed), and returns a compact row shape
// suited to a "file cabinet" list. Sort is most-recently-updated first so
// the file Drew touched last is on top.
//
// Search is intentionally simple: case-insensitive substring across name,
// contact (phone/email), city/address, and the customer's own discussion
// fields (existing notes, customer goal, lens setup type). No fuzzy
// matching, no scoring — just predictable filtering.

import { projectCustomerFileForDisplay } from './customerFileView.js'
import { isSensitiveKey } from './salesOsStorageSchema.js'
import { SETUP_TYPE_LABELS } from './setupGoalLens.js'
import { projectQuotePrepGateStatus, GATE_STATUS } from './quotePrepGate.js'
import { describeFollowUp, isFollowUpDueOrOverdue } from './visitActivity.js'

// Follow-up filter buckets for the Customer Files list (Milestone 15).
// Composes alongside the quote prep filter — different filter group.
export const FOLLOW_UP_FILTER_VALUES = Object.freeze(['all', 'dueOrOverdue'])
export const FOLLOW_UP_FILTER_LABELS = Object.freeze({
  all: 'All',
  dueOrOverdue: 'Follow-up due',
})

// Compact filter buckets for the Customer Files list. "all" is the
// default; "notStarted" matches files with no proposed lines (gate ===
// draft AND total === 0). The rest map 1:1 to gate status.
export const QUOTE_PREP_FILTER_VALUES = Object.freeze([
  'all',
  'notStarted',
  'needsVerification',
  'ready',
])

export const QUOTE_PREP_FILTER_LABELS = Object.freeze({
  all: 'All',
  notStarted: 'Not started / draft',
  needsVerification: 'Needs verification',
  ready: 'Ready to build in BisTrack',
})

const DEFAULT_QUOTE_PREP_FILTER = 'all'

const SAFE_LIST_KEYS = new Set([
  'id',
  'customerName',
  'contact',
  'projectAddress',
  'summary',
  'lensSetupType',
  'lensSetupTypeLabel',
  'updatedAt',
  'createdAt',
  'visitedAt',
  'opportunityId',
  'searchHay',
  'quotePrep',
  'followUp',
])

function pickContact(file) {
  if (file.customerPhone) return file.customerPhone
  if (file.customerEmail) return file.customerEmail
  return ''
}

function pickSummary(file) {
  if (file.lensSalespersonNotes) return file.lensSalespersonNotes
  if (file.existingNotes) return file.existingNotes
  if (file.customerGoal) return file.customerGoal
  if (file.goalNotes) return file.goalNotes
  return ''
}

function bestTimestamp(file) {
  return file.updatedAt || file.lensUpdatedAt || file.visitedAt || file.createdAt || ''
}

function tooLong(value, n = 140) {
  const s = String(value || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// Project one durable row into a list row. Returns null if the input has no
// id (defensive — shouldn't happen with sanitized records).
export function projectCustomerFileForList(rawFile = {}) {
  const display = projectCustomerFileForDisplay(rawFile || {})
  if (!display.id) return null
  const setupKey = display.lensSetupType || ''
  const lensSetupTypeLabel = SETUP_TYPE_LABELS[setupKey] || ''
  const contact = pickContact(display)
  const summary = tooLong(pickSummary(display))
  const searchHay = [
    display.customerName,
    display.customerEmail,
    display.customerPhone,
    display.projectAddress,
    display.existingNotes,
    display.customerGoal,
    display.goalNotes,
    display.lensSalespersonNotes,
    lensSetupTypeLabel,
    display.opportunityId,
  ].filter(Boolean).join(' \n ').toLowerCase()

  // Quote Prep status — reuse the existing display projection. Counts +
  // status flow from evaluateQuotePrepGate, so the list and the file
  // detail card never disagree.
  const gateStatus = projectQuotePrepGateStatus(rawFile, { reasonLimit: 0 })
  const quotePrep = Object.freeze({
    status: gateStatus.status,
    label: gateStatus.label,
    hasLines: gateStatus.hasLines,
    counts: gateStatus.counts,
  })

  const row = {
    id: display.id,
    customerName: display.customerName || '',
    contact,
    projectAddress: display.projectAddress || '',
    summary,
    lensSetupType: setupKey,
    lensSetupTypeLabel,
    updatedAt: bestTimestamp(display),
    createdAt: display.createdAt || '',
    visitedAt: display.visitedAt || '',
    opportunityId: display.opportunityId || '',
    searchHay,
    quotePrep,
  }

  // Final defensive sweep — never expose a sensitive key.
  for (const k of Object.keys(row)) {
    if (isSensitiveKey(k) || !SAFE_LIST_KEYS.has(k)) delete row[k]
  }
  return row
}

// Project + sort a list of durable rows.
export function projectCustomerFilesList(rawFiles = []) {
  if (!Array.isArray(rawFiles)) return []
  const rows = []
  for (const f of rawFiles) {
    const row = projectCustomerFileForList(f)
    if (row) rows.push(row)
  }
  rows.sort((a, b) => {
    if (a.updatedAt && b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
    if (b.updatedAt) return 1
    if (a.updatedAt) return -1
    return 0
  })
  return rows
}

// Today's "Recent Customer Files" projection — same row shape as the full
// list, capped to the top N most-recently-updated files. Default 4 fits the
// Today landing surface without crowding the sample/training cards below.
export function recentCustomerFiles(rawFiles = [], limit = 4) {
  const num = Number(limit)
  if (!Number.isFinite(num) || num <= 0) return []
  const safe = Math.floor(num)
  return projectCustomerFilesList(rawFiles).slice(0, safe)
}

export function searchCustomerFilesList(rows = [], query = '') {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => r.searchHay && r.searchHay.includes(q))
}

// Attach follow-up records to projected list rows. Each row gets
// row.followUp = { dueAt, note, signal: { kind, text, tone } } or null.
// Uses the same describeFollowUp() the Today signal + Customer File card use.
export function enrichCustomerFilesListWithFollowUps(rows = [], followUpsByFileId = {}, now = new Date()) {
  if (!Array.isArray(rows)) return []
  const map = followUpsByFileId && typeof followUpsByFileId === 'object' ? followUpsByFileId : {}
  return rows.map((row) => {
    if (!row || !row.id) return row
    const fu = map[row.id]
    if (!fu) {
      const next = { ...row, followUp: null }
      return Object.freeze(next)
    }
    const signal = describeFollowUp(fu, now)
    const next = {
      ...row,
      followUp: Object.freeze({
        dueAt: fu.dueAt,
        note: fu.note || '',
        signal,
      }),
    }
    return Object.freeze(next)
  })
}

// Filter rows by follow-up bucket. Default "all" returns the full list.
// "dueOrOverdue" keeps only rows whose follow-up is overdue or due today.
export function filterCustomerFilesListByFollowUp(rows, filter = 'all', now = new Date()) {
  const list = Array.isArray(rows) ? rows : []
  const key = FOLLOW_UP_FILTER_VALUES.includes(filter) ? filter : 'all'
  if (key === 'all') return list
  return list.filter((r) => {
    if (!r || !r.followUp) return false
    return isFollowUpDueOrOverdue({ dueAt: r.followUp.dueAt }, now)
  })
}

// Filter rows by quote prep status bucket. Unknown buckets fall back to
// "all" so the screen never displays an empty list because of a bad value.
export function filterCustomerFilesListByQuotePrep(rows = [], filter = DEFAULT_QUOTE_PREP_FILTER) {
  const key = QUOTE_PREP_FILTER_VALUES.includes(filter) ? filter : DEFAULT_QUOTE_PREP_FILTER
  if (key === 'all') return rows
  return rows.filter((r) => {
    const qp = r && r.quotePrep
    if (!qp) return false
    if (key === 'notStarted') {
      return qp.status === GATE_STATUS.draft || (qp.counts && qp.counts.total === 0)
    }
    if (key === 'needsVerification') return qp.status === GATE_STATUS.needsVerification
    if (key === 'ready') return qp.status === GATE_STATUS.ready
    return true
  })
}
