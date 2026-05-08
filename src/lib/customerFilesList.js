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

export function searchCustomerFilesList(rows = [], query = '') {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => r.searchHay && r.searchHay.includes(q))
}
