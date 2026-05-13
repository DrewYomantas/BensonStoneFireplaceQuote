// Today cockpit — Hearth Studio reopen signal (Milestone 27).
//
// Pure logic. Given a list of Hearth Studio sessions and a list of projected
// Customer Files (list rows or display projections — anything with `id` +
// `customerName`), return a Today-ready list of sessions to reopen.
//
// Rules:
//   - Soft-deleted sessions are excluded.
//   - Sessions whose customer file is missing are skipped (no crash).
//   - Active + paused sessions are prioritized over recent completed ones.
//   - Completed sessions older than COMPLETED_RECENT_DAYS are dropped.
//   - Sort: active/paused first, then newest lastTouchedAt within each bucket.
//   - Only display-safe fields surface — selections.investment and
//     selections.roomContext are already stripped by the display projection.

import {
  SESSION_STATUS,
  CHAPTER_LABELS,
  projectHearthStudioSessionForDisplay,
} from './hearthStudioSessionStorage.js'

export const COMPLETED_RECENT_DAYS = 7
export const TODAY_HS_DEFAULT_LIMIT = 5

const ACTIVE_STATUSES = new Set([SESSION_STATUS.active, SESSION_STATUS.paused])

function safeTime(value) {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

function shortSummary(selections = {}) {
  const setup = typeof selections.setupType === 'string' ? selections.setupType.trim() : ''
  const goal = typeof selections.goal === 'string' ? selections.goal.trim() : ''
  const stone = typeof selections.stoneSeries === 'string' ? selections.stoneSeries.trim() : ''
  return [setup, goal, stone].filter(Boolean).join(' · ')
}

export function deriveTodayHearthSessions({
  sessions = [],
  files = [],
  now = new Date(),
  limit = TODAY_HS_DEFAULT_LIMIT,
} = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) return []
  const fileMap = {}
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f && f.id) fileMap[f.id] = f
    }
  }

  const nowMs = new Date(now).getTime()
  const rows = []

  for (const raw of sessions) {
    const session = projectHearthStudioSessionForDisplay(raw)
    if (!session || !session.id || !session.customerFileId) continue
    if (session.status === SESSION_STATUS.soft_deleted || session.softDeletedAt) continue

    const file = fileMap[session.customerFileId]
    if (!file) continue

    if (session.status === SESSION_STATUS.completed) {
      const completedAt = session.completedAt || session.lastTouchedAt
      const t = safeTime(completedAt)
      if (!t) continue
      if (nowMs - t > COMPLETED_RECENT_DAYS * 86400000) continue
    }

    const isActive = ACTIVE_STATUSES.has(session.status)
    const chapterLabel = CHAPTER_LABELS[session.currentChapter] || `Chapter ${session.currentChapter}`
    const triggered = Array.isArray(session.flags?.fieldRulesTriggered)
      ? session.flags.fieldRulesTriggered.filter((s) => typeof s === 'string' && s.trim())
      : []

    rows.push({
      sessionId: session.id,
      customerFileId: session.customerFileId,
      customerName: file.customerName || 'Unnamed customer',
      status: session.status,
      currentChapter: session.currentChapter,
      chapterLabel,
      chaptersCompletedCount: Array.isArray(session.chaptersCompleted)
        ? session.chaptersCompleted.length
        : 0,
      lastTouchedAt: session.lastTouchedAt || '',
      summary: shortSummary(session.selections || {}),
      fieldRuleLabels: triggered,
      priority: isActive ? 0 : 1,
    })
  }

  rows.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return safeTime(b.lastTouchedAt) - safeTime(a.lastTouchedAt)
  })

  const cap = Math.max(0, Math.floor(Number(limit)) || 0)
  return cap > 0 ? rows.slice(0, cap) : rows
}

// Internal-safe summary projection for backstage handoff (Milestone 27).
// Returns a frozen object with display-safe fields only. Sensitive nested
// keys (investment, roomContext) are stripped by projectHearthStudioSessionForDisplay.
// This shape is intended for internal Sales OS surfaces — never customer-facing.
export function projectHearthSessionForInternalHandoff(session) {
  const view = projectHearthStudioSessionForDisplay(session)
  if (!view || !view.id) return null
  const selections = view.selections || {}
  const flags = view.flags || {}
  const triggered = Array.isArray(flags.fieldRulesTriggered)
    ? flags.fieldRulesTriggered.filter((s) => typeof s === 'string' && s.trim())
    : []
  const chapterLabel = CHAPTER_LABELS[view.currentChapter] || `Chapter ${view.currentChapter}`
  return Object.freeze({
    sessionId: view.id,
    customerFileId: view.customerFileId,
    status: view.status,
    chapterProgress: Object.freeze({
      currentChapter: view.currentChapter,
      chapterLabel,
      chaptersCompletedCount: Array.isArray(view.chaptersCompleted)
        ? view.chaptersCompleted.length
        : 0,
      totalChapters: Object.keys(CHAPTER_LABELS).length,
    }),
    guestDirection: shortSummary(selections),
    exploredSelections: Object.freeze({
      setupType: selections.setupType || '',
      goal: selections.goal || '',
      fitGauge: selections.fitGauge || '',
      stoneSeries: selections.stoneSeries || '',
      dimensions: selections.dimensions || null,
      hearthGeometry: selections.hearthGeometry || '',
      tvMantelPlan: selections.tvMantelPlan || '',
      recommendedPath: selections.recommendedPath || '',
    }),
    needsVerification: true,
    fieldRuleLabels: triggered,
    lastTouchedAt: view.lastTouchedAt || '',
    contextLabel: 'Hearth Studio guest design direction — needs verification before BisTrack build.',
  })
}

// Backstage handoff summary (Milestone 28) — display-ready strings layered on
// top of projectHearthSessionForInternalHandoff. Always internal. Never customer-facing.
//
// Shape:
//   {
//     guestDirection: string,
//     exploredSelections: [{ label, value }],
//     verificationChecklist: string[],
//     fieldRuleLabels: string[],
//     salesNote: string,
//   }

const SELECTION_DISPLAY = [
  { key: 'setupType', label: 'Setup' },
  { key: 'goal', label: 'Goal' },
  { key: 'fitGauge', label: 'Fit gauge' },
  { key: 'stoneSeries', label: 'Stone' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'hearthGeometry', label: 'Hearth geometry' },
  { key: 'tvMantelPlan', label: 'TV / mantel plan' },
  { key: 'recommendedPath', label: 'Recommended path' },
]

const BASELINE_CHECKLIST = Object.freeze([
  'Fireplace type',
  'Opening dimensions',
  'Venting path',
  'Gas availability',
])

const SALES_NOTE = 'Use as discovery support only. BisTrack remains quote source of truth.'

function formatDimensions(dim) {
  if (!dim || typeof dim !== 'object') return ''
  const parts = [dim.w, dim.h, dim.d]
    .filter((v) => v !== undefined && v !== null && String(v).trim())
    .map((v) => String(v).trim())
  return parts.length ? parts.join(' x ') : ''
}

function selectionDisplayValue(key, value) {
  if (value === undefined || value === null) return ''
  if (key === 'dimensions') return formatDimensions(value)
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function buildGuestDirection(handoff) {
  if (!handoff) return ''
  if (handoff.guestDirection && handoff.guestDirection.trim()) return handoff.guestDirection
  // Fallback to chapter label so the summary never reads blank.
  return `In progress at ${handoff.chapterProgress.chapterLabel}.`
}

function buildVerificationChecklist(handoff) {
  const items = new Set(BASELINE_CHECKLIST)
  const sel = handoff.exploredSelections
  if (!sel.setupType) items.add('Setup type')
  if (!formatDimensions(sel.dimensions)) items.add('Opening dimensions')
  if (!sel.hearthGeometry) items.add('Hearth geometry')
  if (!sel.stoneSeries) items.add('Stone series availability')
  for (const label of handoff.fieldRuleLabels) {
    if (label && typeof label === 'string') items.add(label)
  }
  return Array.from(items)
}

// Pick the best session to resume from a flat session list (Milestone 29).
// Priority: active > paused > null. Completed and soft-deleted are never resumed
// — completed represents a closed customer journey; soft-deleted is excluded.
// Within a tier, newest lastTouchedAt wins.
export function pickHearthSessionToResume(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null
  const candidates = sessions
    .map((s) => projectHearthStudioSessionForDisplay(s))
    .filter(Boolean)
    .filter((s) => s.status !== SESSION_STATUS.soft_deleted && !s.softDeletedAt)
  if (candidates.length === 0) return null
  const active = candidates
    .filter((s) => s.status === SESSION_STATUS.active)
    .sort((a, b) => safeTime(b.lastTouchedAt) - safeTime(a.lastTouchedAt))
  if (active.length > 0) return active[0]
  const paused = candidates
    .filter((s) => s.status === SESSION_STATUS.paused)
    .sort((a, b) => safeTime(b.lastTouchedAt) - safeTime(a.lastTouchedAt))
  if (paused.length > 0) return paused[0]
  return null
}

// Customer File launch action (Milestone 29).
// Returns a display-safe action descriptor:
//   { mode: 'resume' | 'start', sessionId, label, helperText }
// 'resume' carries the session to reopen; 'start' means create a new one.
// helperText is customer-name-aware but never contains banned phrases.
export function deriveCustomerFileLaunchAction({ sessions = [], customerName = '' } = {}) {
  const session = pickHearthSessionToResume(sessions)
  const safeName = typeof customerName === 'string' ? customerName.trim() : ''
  if (session) {
    const chapterLabel = CHAPTER_LABELS[session.currentChapter] || `Chapter ${session.currentChapter}`
    const status = session.status === SESSION_STATUS.paused ? 'paused' : 'in progress'
    return Object.freeze({
      mode: 'resume',
      sessionId: session.id,
      label: 'Resume Hearth Studio',
      helperText: `Pick up ${safeName ? `with ${safeName}` : ''} at ${chapterLabel} — session is ${status}.`.replace(/\s+/g, ' ').trim(),
    })
  }
  return Object.freeze({
    mode: 'start',
    sessionId: null,
    label: 'Begin Guest Design Session',
    helperText: safeName
      ? `Open the Hearth Studio guest surface with ${safeName}.`
      : 'Open the Hearth Studio guest surface.',
  })
}

// Customer-safe projection for the Guest Mode shell (Milestone 29).
// Strips investment, roomContext, and anything else the display projection
// already removes. Returns a frozen view with only the fields needed to
// render a calm customer-facing surface. Never includes backstage labels,
// field-rule labels, sales notes, or quote-prep info.
export function projectHearthSessionForGuestMode(session) {
  const view = projectHearthStudioSessionForDisplay(session)
  if (!view || !view.id) return null
  const chapterLabel = CHAPTER_LABELS[view.currentChapter] || `Chapter ${view.currentChapter}`
  const total = Object.keys(CHAPTER_LABELS).length
  const done = Array.isArray(view.chaptersCompleted) ? view.chaptersCompleted.length : 0
  return Object.freeze({
    sessionId: view.id,
    customerFileId: view.customerFileId,
    status: view.status,
    currentChapter: view.currentChapter,
    chapterLabel,
    chaptersCompletedCount: done,
    totalChapters: total,
    progressLabel: `Chapter ${String(view.currentChapter + 1).padStart(2, '0')} of ${total} — ${chapterLabel}`,
  })
}

export function buildHearthSessionBackstageSummary(session) {
  const handoff = projectHearthSessionForInternalHandoff(session)
  if (!handoff) return null
  const exploredSelections = []
  for (const { key, label } of SELECTION_DISPLAY) {
    const value = selectionDisplayValue(key, handoff.exploredSelections[key])
    if (value) exploredSelections.push({ label, value })
  }
  return Object.freeze({
    sessionId: handoff.sessionId,
    customerFileId: handoff.customerFileId,
    status: handoff.status,
    chapterLabel: handoff.chapterProgress.chapterLabel,
    guestDirection: buildGuestDirection(handoff),
    exploredSelections: Object.freeze(exploredSelections),
    verificationChecklist: Object.freeze(buildVerificationChecklist(handoff)),
    fieldRuleLabels: Object.freeze([...handoff.fieldRuleLabels]),
    salesNote: SALES_NOTE,
  })
}
