// Derive lifecycle status and packet/workflow readiness from a customer file.
// All outputs are derived from real data on the file — no flags, no clicks-to-advance.

import { evaluateIssues, blockingIssues, unresolvedIssues } from './issueDefinitions.js'
import { deriveCustomerFileSignals, isSignalDetected } from './customerFileSignals.js'

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
const isTrue = (v) => String(v || '').toLowerCase() === 'true'

export function deriveLifecycleStage(file = {}) {
  const stages = {
    'visit-started':     has(file.id) && (has(file.customerName) || has(file.visitedAt)),
    'goal-discovered':   has(file.customerGoal) || has(file.likelyPath),
    'showroom-walked':   isSignalDetected(file, 'showroom'),
    'quote-imported':    has(file.opportunityId),
    'packet-generated':  has(file.packetGeneratedAt),
    'packet-sent':       has(file.packetSentAt),
    'handoff-scheduled': ['created', 'sent_to_scheduler', 'waiting_for_measure', 'measure_completed'].includes(file.handoffState) || (has(file.handoffType) && file.handoffType !== 'none'),
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

export function deriveWaitingStates(file = {}) {
  const waitingOnCustomerReasons = []
  if (!has(file.customerPhone) && !has(file.customerEmail)) waitingOnCustomerReasons.push('customer contact channel')
  const signals = deriveCustomerFileSignals(file)
  if (!signals.signals.photos.detected) waitingOnCustomerReasons.push('site photos')
  if (!signals.signals.measurements.detected) waitingOnCustomerReasons.push('rough measurements')
  if (!signals.signals.modelTag.detected) {
    const hay = `${file.existingNotes || ''} ${file.existingVentingNotes || ''} ${file.customerGoal || ''} ${file.likelyPath || ''}`.toLowerCase()
    if (/prefab|pre-fab|zero.?clearance|\bzc\b|factory.?built/.test(hay)) waitingOnCustomerReasons.push('model tag photo')
  }
  const waitingOnScheduler = ['sent_to_scheduler', 'waiting_for_measure'].includes(file.handoffState)
  return {
    waitingOnCustomer: waitingOnCustomerReasons.length > 0 || (has(file.packetSentAt) && !hasAny(file.followUpTasks)),
    waitingOnCustomerReasons,
    waitingOnScheduler,
    waitingOnSchedulerReason: waitingOnScheduler
      ? file.handoffState === 'waiting_for_measure'
        ? 'home-measure results'
        : 'scheduler confirmation'
      : '',
  }
}

export function deriveHandoffReadiness(file = {}) {
  if (file.handoffState === 'not_needed') {
    return { ready: true, state: 'not_needed', blockers: [], nextRecommendedAction: 'No scheduler/home-measure handoff needed' }
  }
  const blockers = []
  if (!has(file.customerName)) blockers.push('Customer name missing')
  if (!has(file.customerPhone) && !has(file.customerEmail)) blockers.push('No phone or email on file')
  if (!has(file.customerGoal)) blockers.push('Desired outcome not recorded')
  if (!has(file.existingApplianceType) || file.existingApplianceType === 'unknown') blockers.push('Existing setup not verified')
  const signals = deriveCustomerFileSignals(file)
  if (!signals.signals.photos.detected) blockers.push('Photos missing')
  if (!signals.signals.measurements.detected) blockers.push('Measurements missing')

  const existingState = file.handoffState || ''
  if (['created', 'sent_to_scheduler', 'waiting_for_measure', 'measure_completed'].includes(existingState)) {
    return {
      ready: blockers.length === 0,
      state: existingState,
      blockers,
      nextRecommendedAction: existingState === 'created'
        ? 'Send handoff to scheduler'
        : existingState === 'sent_to_scheduler'
          ? 'Waiting on scheduler confirmation'
          : existingState === 'waiting_for_measure'
            ? 'Waiting for home-measure results'
            : 'Refresh quote from completed measure',
    }
  }

  return {
    ready: blockers.length === 0,
    state: blockers.length ? 'needed_not_ready' : 'ready_to_create',
    blockers,
    nextRecommendedAction: blockers[0] || 'Create scheduler/home-measure handoff',
  }
}

// Packet readiness is derived strictly from data on the file plus issue resolution.
export function derivePacketReadiness(file = {}) {
  const reasons = []
  if (!has(file.customerName)) reasons.push('Customer name missing')
  if (!has(file.customerPhone) && !has(file.customerEmail)) reasons.push('No phone or email on file')
  if (!has(file.customerGoal)) reasons.push('Customer goal not recorded')
  if (!has(file.opportunityId)) reasons.push('BizTrack quote not imported yet')
  if (has(file.opportunityId) && !isTrue(file.lineItemQuoteIncluded) && !has(file.lineItemQuoteExcludedReason)) {
    reasons.push('Original BizTrack quote include/exclude decision missing')
  }
  if (file.detailedInvestmentBreakdownIncluded === 'false') reasons.push('Detailed Investment Breakdown must be included')
  if (file.scopeResponsibilityNotesIncluded === 'false') reasons.push('Scope/responsibility notes should remain included')

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

export function deriveFollowUpRequirement(file = {}) {
  const openTasks = (file.followUpTasks || []).filter((t) => !t.doneAt)
  if (openTasks.length > 0) {
    return { required: true, reason: 'Open follow-up task exists', nextTask: openTasks[0] }
  }
  if (has(file.packetSentAt)) {
    return { required: true, reason: 'Packet sent; customer follow-up cadence should be queued', nextTask: null }
  }
  if (has(file.opportunityId) && !has(file.packetSentAt)) {
    return { required: true, reason: 'Quote imported but packet has not been sent', nextTask: null }
  }
  return { required: false, reason: '', nextTask: null }
}

export function deriveQueueBucket(file = {}) {
  const packet = derivePacketReadiness(file)
  const handoff = deriveHandoffReadiness(file)
  const waiting = deriveWaitingStates(file)
  if (handoff.state === 'measure_completed') return 'measure-complete-refresh-quote'
  if (waiting.waitingOnScheduler) return 'waiting-on-scheduler-home-measure'
  if (handoff.state === 'created') return 'handoff-ready-to-send'
  if (has(file.packetSentAt)) return 'waiting-on-customer-follow-up'
  if (has(file.packetGeneratedAt)) return 'packet-ready-to-send'
  if (packet.ready) return 'ready-to-generate-packet'
  if (waiting.waitingOnCustomerReasons.length > 0) return 'waiting-on-customer-info'
  if (has(file.opportunityId)) return 'needs-resolution'
  if (has(file.customerGoal)) return 'showroom-discovery'
  return 'new-intake'
}

export function deriveNextBestAction(file = {}) {
  const packet = derivePacketReadiness(file)
  const handoff = deriveHandoffReadiness(file)
  const followUp = deriveFollowUpRequirement(file)
  if (!has(file.customerName)) return 'Capture customer name'
  if (!has(file.customerPhone) && !has(file.customerEmail)) return 'Capture phone or email'
  if (!has(file.customerGoal)) return 'Capture customer goal'
  if (!has(file.likelyPath)) return 'Use Guided Path Finder to save likely path and next question'
  if (!has(file.opportunityId)) return 'Import BizTrack quote when ready'
  if (!packet.ready) return packet.reasons[0]
  if (!has(file.packetGeneratedAt)) return 'Generate customer packet'
  if (!has(file.packetSentAt)) return 'Print or email customer packet and log send channel'
  if (handoff.state === 'ready_to_create') return 'Create scheduler/home-measure handoff'
  if (handoff.state === 'created') return 'Send handoff to scheduler'
  if (handoff.state === 'sent_to_scheduler') return 'Wait for scheduler confirmation'
  if (handoff.state === 'waiting_for_measure') return 'Wait for home-measure results'
  if (handoff.state === 'measure_completed') return 'Refresh quote from measure results'
  if (followUp.required) return followUp.nextTask?.label || followUp.reason
  return 'Review customer file and choose the next real step'
}

// Status summary used by the ticket UI — replaces the old status-string-based logic.
export function deriveQuoteStatus(file = {}) {
  const stages = deriveLifecycleStage(file)
  const issues = evaluateIssues(file)
  const unresolved = issues.filter((i) => !i.resolved)
  const packetReadiness = derivePacketReadiness(file)
  const handoffReadiness = deriveHandoffReadiness(file)
  const followUpRequirement = deriveFollowUpRequirement(file)
  const waiting = deriveWaitingStates(file)
  const stageIdx = getCurrentStageIndex(file)
  const nextStage = getNextStage(file)
  const queueBucket = deriveQueueBucket(file)
  const nextBestAction = deriveNextBestAction(file)

  let status
  if (handoffReadiness.state === 'measure_completed') status = 'measure-completed'
  else if (waiting.waitingOnScheduler) status = 'waiting-on-scheduler'
  else if (stages['handoff-scheduled']) status = 'handoff-scheduled'
  else if (stages['packet-sent']) status = 'waiting-on-customer'
  else if (stages['packet-generated']) status = 'packet-ready-to-send'
  else if (packetReadiness.ready) status = 'ready-to-generate-packet'
  else if (stages['quote-imported']) status = 'needs-resolution'
  else if (stages['showroom-walked']) status = 'awaiting-quote-import'
  else if (stages['visit-started']) status = 'in-discovery'
  else status = 'new'

  return {
    status,
    lifecycleStage: stageIdx >= 0 ? lifecycleStageOrder[stageIdx].id : 'pre-visit',
    stage: stageIdx >= 0 ? lifecycleStageOrder[stageIdx].id : 'pre-visit',
    stageIdx,
    nextStage,
    readiness: packetReadiness,
    packetReadiness,
    handoffReadiness,
    followUpRequirement,
    waitingOnCustomer: waiting.waitingOnCustomer,
    waitingOnCustomerReasons: waiting.waitingOnCustomerReasons,
    waitingOnScheduler: waiting.waitingOnScheduler,
    waitingOnSchedulerReason: waiting.waitingOnSchedulerReason,
    queueBucket,
    nextBestAction,
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
  'waiting-on-scheduler':      'Waiting on Scheduler / Home-Measure',
  'measure-completed':         'Measure Completed',
}

export function getStatusLabel(status) {
  return statusLabels[status] || status
}

export { unresolvedIssues, blockingIssues }
