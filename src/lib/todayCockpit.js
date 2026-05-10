// Today Cockpit enrichment — pure logic, no storage access.
//
// Takes projected list rows (already enriched with followUp + quotePrep)
// and returns the four sections TodayScreen renders:
//   followUpsToday  — overdue/today follow-ups, sorted overdue-first
//   quoteActionsNeeded — quote prep needs attention, not already in followUpsToday
//   recentRows      — top RECENT_LIMIT, excluding promoted IDs
//   oneThing        — the single highest-priority action for the NextActionBar
//
// Calls recommendFollowUpCadence for follow-up rows. Because Today list rows
// carry a combined `contact` field (not separate email/phone), we detect
// email by `@` presence. This is sufficient for cadence channel hints; the
// cadence lib only needs to know whether email or phone is available.

import { recommendFollowUpCadence } from './followUpCadence.js'
import { GATE_STATUS } from './quotePrepGate.js'

export const COCKPIT_RECENT_LIMIT = 4

const BANNED_PHRASES = ['ready to send', 'proposal ready', 'customer ready', 'approved']

export function isBannedCopy(text) {
  const lower = String(text || '').toLowerCase()
  return BANNED_PHRASES.some((phrase) => lower.includes(phrase))
}

// Thin bridge: list row → opportunity shape for recommendFollowUpCadence.
// List rows have `contact` (combined phone/email); we infer channel by @.
function listRowToOpportunity(row, followUp) {
  const contactStr = String(row.contact || '')
  const isEmail = contactStr.includes('@')
  const overdue = followUp ? Boolean(
    followUp.signal && (followUp.signal.kind === 'overdue' || followUp.signal.kind === 'today')
  ) : false
  return {
    customerName: row.customerName || '',
    customerEmail: isEmail ? contactStr : '',
    customerPhone: isEmail ? '' : contactStr,
    projectType: row.summary || 'fireplace project',
    status: overdue ? 'waiting-on-customer' : '',
    warnings: [],
    proposalReadiness: '',
    temperature: '',
    nextAction: '',
    quoteDate: '',
    lastContactedAt: '',
  }
}

function isFollowUpDueOrOverdueFromSignal(followUp) {
  if (!followUp || !followUp.signal) return false
  return followUp.signal.kind === 'overdue' || followUp.signal.kind === 'today'
}

// Plain-English action copy from cadence result, safe for internal display.
function safeCadenceCopy(cadence) {
  const copy = cadence.nextActionCopy || cadence.label || ''
  return isBannedCopy(copy) ? '' : copy
}

// Determine gate action label from quotePrep row data.
export function quoteActionLabel(quotePrep) {
  if (!quotePrep) return ''
  const { status, counts } = quotePrep
  if (status === GATE_STATUS.needsVerification) {
    if (counts && counts.doNotUseYet > 0) return 'Review line items marked do-not-use'
    if (counts && counts.needsReview > 0) return 'Verify line items'
    if (!quotePrep.hasLines) return 'Add quote lines'
    return 'Finish Pre-BisTrack gate'
  }
  if (status === GATE_STATUS.draft) {
    if (!quotePrep.hasLines) return 'Add quote lines to Quote / Prep'
  }
  return ''
}

// Main cockpit derivation. Rows must already be enriched with followUp and quotePrep.
export function deriveTodayCockpit(rows = [], now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { followUpsToday: [], quoteActionsNeeded: [], recentRows: [], oneThing: null }
  }

  // Section 1 — follow-ups overdue/today
  const followUpRows = rows.filter((r) => isFollowUpDueOrOverdueFromSignal(r.followUp))
  // Sort: overdue first, then today
  const followUpsToday = followUpRows.map((row) => {
    const opp = listRowToOpportunity(row, row.followUp)
    const cadence = recommendFollowUpCadence({ opportunity: opp, activities: [], now })
    return { row, cadence }
  }).sort((a, b) => {
    const aKind = a.row.followUp?.signal?.kind || ''
    const bKind = b.row.followUp?.signal?.kind || ''
    if (aKind === 'overdue' && bKind !== 'overdue') return -1
    if (bKind === 'overdue' && aKind !== 'overdue') return 1
    return 0
  })

  const followUpTodayIds = new Set(followUpsToday.map(({ row }) => row.id))

  // Section 2 — quote actions needed (not already in section 1)
  const quoteActionsNeeded = rows
    .filter((r) => {
      if (followUpTodayIds.has(r.id)) return false
      if (!r.quotePrep) return false
      return r.quotePrep.status === GATE_STATUS.needsVerification
    })
    .map((row) => ({
      row,
      reason: quoteActionLabel(row.quotePrep),
    }))

  const quoteActionIds = new Set(quoteActionsNeeded.map(({ row }) => row.id))

  // Section 3 — recent (exclude promoted IDs)
  const recentRows = rows
    .filter((r) => !followUpTodayIds.has(r.id) && !quoteActionIds.has(r.id))
    .slice(0, COCKPIT_RECENT_LIMIT)

  // One Thing — single highest-priority action
  const oneThing = deriveOneThing({ followUpsToday, quoteActionsNeeded, recentRows })

  return { followUpsToday, quoteActionsNeeded, recentRows, oneThing }
}

export function deriveOneThing({ followUpsToday = [], quoteActionsNeeded = [], recentRows = [] } = {}) {
  // Priority 1: overdue follow-up
  const overdueEntry = followUpsToday.find(({ row }) => row.followUp?.signal?.kind === 'overdue')
  if (overdueEntry) {
    const name = overdueEntry.row.customerName || 'a customer'
    const copy = safeCadenceCopy(overdueEntry.cadence)
    return {
      text: copy ? `Follow up with ${name} — ${copy.toLowerCase()}.` : `Follow up with ${name}.`,
      targetFileId: overdueEntry.row.id,
      targetScreen: 'files',
      kind: 'follow-up',
    }
  }

  // Priority 2: today follow-up
  const todayEntry = followUpsToday.find(({ row }) => row.followUp?.signal?.kind === 'today')
  if (todayEntry) {
    const name = todayEntry.row.customerName || 'a customer'
    return {
      text: `Follow up with ${name} today.`,
      targetFileId: todayEntry.row.id,
      targetScreen: 'files',
      kind: 'follow-up',
    }
  }

  // Priority 3: quote action
  if (quoteActionsNeeded.length > 0) {
    const first = quoteActionsNeeded[0]
    const name = first.row.customerName || 'a customer'
    const rawAction = first.reason || ''
    const action = rawAction && !isBannedCopy(rawAction) ? rawAction : 'finish quote review'
    return {
      text: `${action.charAt(0).toUpperCase() + action.slice(1)} for ${name}.`,
      targetFileId: first.row.id,
      targetScreen: 'quotePrep',
      kind: 'quote-action',
    }
  }

  // Priority 4: most recent file
  if (recentRows.length > 0) {
    const name = recentRows[0].customerName || 'a customer'
    return {
      text: `Open ${name}'s file and pick up where you left off.`,
      targetFileId: recentRows[0].id,
      targetScreen: 'files',
      kind: 'recent-file',
    }
  }

  // Priority 5: empty state
  return null
}
