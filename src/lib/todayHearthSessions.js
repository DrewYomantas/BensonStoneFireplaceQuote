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
