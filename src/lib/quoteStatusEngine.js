// Derive lifecycle status and packet readiness from a customer file.
// All outputs are derived from real data on the file — no flags, no clicks-to-advance.

import { evaluateIssues, blockingIssues, unresolvedIssues } from './issueDefinitions.js'

export const lifecycleStageOrder = [
  { id: 'visit-started',     label: 'Visit Started' },
  { id: 'goal-discovered',   label: 'Goal Discovered' },
  { id: 'showroom-walked',   label: 'Showroom Walked' },
  { id: 'quote-imported',    label: 'BizTrack Quote Imported' },
  { id: 'packet-generated',  label: 'Customer Packet Generated' },
  { id: 'packet-sent',       label: 'Packet Sent' },
  { id: 'handoff-scheduled', label: 'Handoff Scheduled' },
  { id: 'follow-up',         label: 'Follow-Up' },
]

const has = (v) => Boolean(String(v || '').trim())
const hasAny = (arr) => Array.isArray(arr) && arr.length > 0

export function deriveLifecycleStage(file = {}) {
  const stages = {
    'visit-started':     has(file.id) && (has(file.customerName) || has(file.visitedAt)),
    'goal-discovered':   has(file.customerGoal),
    'showroom-walked':   hasAny(file.displaysShown) || hasAny(file.brochuresGiven) || hasAny(file.samplesGiven),
    'quote-imported':    has(file.opportunityId),
    'packet-generated':  has(file.packetGeneratedAt),
    'packet-sent':       has(file.packetSentAt),
    'handoff-scheduled': has(file.handoffType) && file.handoffType !== 'none',
    'follow-up':         hasAny(file.followUpTasks),
  }
  return Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Boolean(v)]))
}

export function getCurrentStageIndex(file = {}) {
  const stages = deriveLifecycleStage(file)
  let lastDone = -1
  lifecycleStageOrder.forEach((s, i) => {
    if (stages[s.id]) lastDone = i
  })
  return lastDone
}

export function getNextStage(file = {}) {
  const idx = getCurrentStageIndex(file)
  if (idx >= lifecycleStageOrder.length - 1) return null
  return lifecycleStageOrder[idx + 1]
}

// Packet readiness is derived strictly from data on the file plus issue resolution.
// The packet is ready to generate when:
//   - customer name + at least one contact channel are present,
//   - customer goal is recorded,
//   - the BizTrack quote has been imported,
//   - no blocking issues remain.
export function derivePacketReadiness(file = {}) {
  const reasons = []
  if (!has(file.customerName)) reasons.push('Customer name missing')
  if (!has(file.customerPhone) && !has(file.customerEmail)) reasons.push('No phone or email on file')
  if (!has(file.customerGoal)) reasons.push('Customer goal not recorded')
  if (!has(file.opportunityId)) reasons.push('BizTrack quote not imported yet')
  const blocks = blockingIssues(file)
  for (const b of blocks) if (!reasons.includes(b.label)) reasons.push(b.label)

  const ready = reasons.length === 0
  return {
    ready,
    reasons,
    nextRecommendedAction: ready
      ? has(file.packetGeneratedAt)
        ? has(file.packetSentAt)
          ? 'Schedule handoff or queue follow-up'
          : 'Mark packet sent (email or print)'
        : 'Generate customer packet from preview'
      : reasons[0],
  }
}

// Status summary used by the ticket UI — replaces the old status-string-based logic.
export function deriveQuoteStatus(file = {}) {
  const stages = deriveLifecycleStage(file)
  const issues = evaluateIssues(file)
  const unresolved = issues.filter((i) => !i.resolved)
  const readiness = derivePacketReadiness(file)
  const stageIdx = getCurrentStageIndex(file)
  const nextStage = getNextStage(file)

  let status
  if (stages['handoff-scheduled']) status = 'handoff-scheduled'
  else if (stages['packet-sent']) status = 'waiting-on-customer'
  else if (stages['packet-generated']) status = 'packet-ready-to-send'
  else if (readiness.ready) status = 'ready-to-generate-packet'
  else if (stages['quote-imported']) status = 'needs-resolution'
  else if (stages['showroom-walked']) status = 'awaiting-quote-import'
  else if (stages['visit-started']) status = 'in-discovery'
  else status = 'new'

  return {
    status,
    stage: stageIdx >= 0 ? lifecycleStageOrder[stageIdx].id : 'pre-visit',
    stageIdx,
    nextStage,
    readiness,
    unresolvedCount: unresolved.length,
    blockingCount: unresolved.filter((i) => i.severity === 'block').length,
    issues,
  }
}

export const statusLabels = {
  'new':                       'New File',
  'in-discovery':              'In Discovery',
  'awaiting-quote-import':     'Awaiting BizTrack Quote',
  'needs-resolution':          'Needs Resolution',
  'ready-to-generate-packet':  'Ready to Generate Packet',
  'packet-ready-to-send':      'Packet Ready to Send',
  'waiting-on-customer':       'Waiting on Customer',
  'handoff-scheduled':         'Handoff Scheduled',
}

export function getStatusLabel(status) {
  return statusLabels[status] || status
}

export { unresolvedIssues, blockingIssues }
