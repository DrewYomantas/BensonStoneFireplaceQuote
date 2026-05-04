import { sanitizeCustomerFacingText } from './customerPacketState.js'
import { deriveQuoteStatus, lifecycleStageOrder } from './quoteStatusEngine.js'
import { planFollowUpTasks } from './followUpPlanner.js'
import { deriveCustomerFileSignals } from './customerFileSignals.js'

const has = (value) => Boolean(String(value || '').trim())
const hasAny = (value) => Array.isArray(value) && value.length > 0

function newestDate(...values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
  return dates[0]?.toISOString() || ''
}

function contactStatus(file = {}) {
  if (has(file.customerEmail) && has(file.customerPhone)) return 'phone and email on file'
  if (has(file.customerEmail)) return 'email on file'
  if (has(file.customerPhone)) return 'phone on file'
  return 'no contact channel'
}

function buildSystemTracking(smartSignals) {
  const important = ['photos', 'measurements', 'modelTag', 'quote', 'packet']
  const visible = important
    .map((key) => smartSignals.signals[key])
    .filter(Boolean)
    .map((signal) => ({
      id: signal.id,
      label: signal.detected ? `${signal.label} detected` : `Missing ${signal.label.toLowerCase()}`,
      tone: signal.detected ? 'done' : 'todo',
    }))

  return visible.slice(0, 4)
}

export function deriveSalesJourney(file = {}, now = new Date()) {
  const quoteStatus = deriveQuoteStatus(file)
  const followUpPlan = planFollowUpTasks(file, now)
  const stages = quoteStatus.lifecycleStage === 'pre-visit'
    ? []
    : lifecycleStageOrder.map((stage) => ({
        ...stage,
        complete: quoteStatus.stageIdx >= lifecycleStageOrder.findIndex((item) => item.id === stage.id),
        active: stage.id === quoteStatus.lifecycleStage,
      }))
  const smartSignals = deriveCustomerFileSignals(file)

  const verification = {
    contact: has(file.customerPhone) || has(file.customerEmail),
    photos: smartSignals.signals.photos.detected,
    measurements: smartSignals.signals.measurements.detected,
    modelTag: smartSignals.signals.modelTag.detected,
    goal: smartSignals.signals.goal.detected,
    likelyPath: smartSignals.signals.path.detected,
    quoteImported: smartSignals.signals.quote.detected,
    packetSent: has(file.packetSentAt),
    handoffActive: smartSignals.signals.handoff.detected,
  }

  const blockers = [
    ...quoteStatus.packetReadiness.reasons,
    ...quoteStatus.handoffReadiness.blockers.map((label) => `Handoff: ${label}`),
  ].filter((value, index, arr) => arr.indexOf(value) === index)

  const attention = []
  if (!verification.contact) attention.push({ id: 'contact', label: 'Capture phone or email', tone: 'blocker' })
  if (!verification.goal) attention.push({ id: 'goal', label: 'Record customer goal in their words', tone: 'blocker' })
  if (!verification.likelyPath) attention.push({ id: 'path', label: 'Save a likely path from Guided Path Finder', tone: 'todo' })
  if (!verification.photos) attention.push({ id: 'photos', label: 'Ask for site/firebox photos only if not already received', tone: 'todo' })
  if (!verification.measurements) attention.push({ id: 'measurements', label: 'Collect rough opening/dimensions or note that home-measure will verify', tone: 'todo' })
  if (quoteStatus.waitingOnCustomerReasons.includes('model tag photo')) attention.push({ id: 'model-tag', label: 'Get model tag photo before compatibility discussion', tone: 'blocker' })
  if (!verification.quoteImported) attention.push({ id: 'quote', label: 'Import the BizTrack quote when it exists', tone: 'todo' })
  if (followUpPlan.tasks.length > 0) attention.push({ id: 'follow-up-plan', label: `${followUpPlan.tasks.length} suggested follow-up task${followUpPlan.tasks.length === 1 ? '' : 's'}`, tone: 'todo' })

  const quickFacts = [
    { label: 'Customer', value: file.customerName || 'Unnamed' },
    { label: 'Contact', value: contactStatus(file) },
    { label: 'Setup', value: [file.existingApplianceType, file.existingFuelType].filter((v) => has(v) && v !== 'unknown').join(' / ') || 'not verified' },
    { label: 'Goal', value: file.customerGoal || 'not recorded' },
    { label: 'Likely path', value: file.likelyPath || 'not selected' },
    { label: 'Photos', value: smartSignals.signals.photos.detected ? smartSignals.signals.photos.evidence || smartSignals.signals.photos.source : 'not detected' },
    { label: 'Measurements', value: smartSignals.signals.measurements.detected ? smartSignals.signals.measurements.evidence || smartSignals.signals.measurements.source : 'not detected' },
    { label: 'Model tag', value: smartSignals.signals.modelTag.detected ? smartSignals.signals.modelTag.evidence || 'received' : 'not detected' },
    { label: 'Packet', value: file.packetSentAt ? `sent ${file.packetSendChannel || ''}`.trim() : file.packetGeneratedAt ? 'generated' : quoteStatus.packetReadiness.ready ? 'ready to generate' : 'not ready' },
    { label: 'Handoff', value: file.handoffState || quoteStatus.handoffReadiness.state || 'not started' },
  ]

  const completedCount = Object.values(verification).filter(Boolean).length
  const totalCount = Object.values(verification).length

  return {
    status: quoteStatus,
    stages,
    verification,
    completion: {
      completed: completedCount,
      total: totalCount,
      percent: Math.round((completedCount / totalCount) * 100),
    },
    nextBestAction: quoteStatus.nextBestAction,
    queueBucket: quoteStatus.queueBucket,
    blockers,
    attention,
    quickFacts,
    smartSignals,
    systemTracking: buildSystemTracking(smartSignals),
    lastMeaningfulTouchAt: newestDate(file.updatedAt, file.packetSentAt, file.handoffSentAt, file.handoffMeasureCompletedAt, ...(file.followUpTasks || []).map((task) => task.createdAt || task.dueAt)),
  }
}

export function buildSalesJourneyQuickPatch(action, now = new Date()) {
  const ts = new Date(now).toISOString()
  switch (action) {
    case 'log-photos-received':
      return {
        photos: (file) => [
          ...(file.photos || []),
          { id: `photo-${Date.now()}`, label: 'Customer photos received', source: 'salesperson', capturedAt: ts },
        ],
      }
    case 'log-rough-measurements':
      return {
        measurements: (file) => [
          ...(file.measurements || []),
          { id: `measurement-${Date.now()}`, label: 'Rough measurements received', value: 'customer-provided', capturedAt: ts },
        ],
      }
    case 'mark-model-tag-received':
      return { modelTagReceived: 'true' }
    case 'mark-pricing-confirmed':
      return { pricingConfirmedAt: ts }
    case 'mark-showroom-walked':
      return {
        displaysShown: (file) => [
          ...(file.displaysShown || []),
          { id: `display-${Date.now()}`, label: 'Showroom path discussed', shownAt: ts },
        ],
      }
    case 'clear-photos-received':
      return { photos: [] }
    case 'clear-rough-measurements':
      return { measurements: [] }
    case 'clear-model-tag-received':
      return { modelTagReceived: '', taggedModel: '' }
    case 'clear-pricing-confirmed':
      return { pricingConfirmedAt: '' }
    case 'clear-showroom-walked':
      return { displaysShown: [] }
    default:
      return {}
  }
}

export function applySalesJourneyQuickPatch(file = {}, patch = {}) {
  const next = { ...file }
  for (const [key, value] of Object.entries(patch)) {
    next[key] = typeof value === 'function' ? value(next) : value
  }
  return next
}

export function buildCustomerSafeSalesRecap(file = {}) {
  const lines = [
    file.customerGoal ? `Project goal: ${file.customerGoal}` : '',
    file.likelyPath ? `Current direction: ${file.likelyPath}` : '',
    file.nextBestQuestion ? `Next question to confirm: ${file.nextBestQuestion}` : '',
    hasAny(file.photos) ? 'Photos have been received for review.' : '',
    hasAny(file.measurements) ? 'Rough measurements have been received for review.' : '',
    file.guidedPathCustomerSummary || '',
  ]
  return sanitizeCustomerFacingText(lines.filter(Boolean).join('\n'))
}

export function buildInternalSalesDigest(file = {}, now = new Date()) {
  const journey = deriveSalesJourney(file, now)
  return [
    `Status: ${journey.status.status}`,
    `Queue bucket: ${journey.queueBucket}`,
    `Next best action: ${journey.nextBestAction}`,
    `Customer: ${file.customerName || 'Unnamed'}`,
    `Contact: ${contactStatus(file)}`,
    `Goal: ${file.customerGoal || 'not recorded'}`,
    `Likely path: ${file.likelyPath || 'not selected'}`,
    `Open blockers: ${journey.blockers.length ? journey.blockers.join('; ') : 'none'}`,
  ].join('\n')
}
