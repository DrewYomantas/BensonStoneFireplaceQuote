const has = (v) => Boolean(String(v || '').trim())
const hasAny = (arr) => Array.isArray(arr) && arr.length > 0
const isTrue = (v) => String(v || '').toLowerCase() === 'true'
const nowIso = (now = new Date()) => new Date(now).toISOString()

export const handoffStates = [
  'not_needed',
  'needed_not_ready',
  'ready_to_create',
  'created',
  'sent_to_scheduler',
  'waiting_for_measure',
  'measure_completed',
]

function statusLabel(value, yes = 'received', no = 'missing') {
  return value ? yes : no
}

export function deriveHandoffReadiness(file = {}) {
  const needsHandoff = file.handoffType && file.handoffType !== 'none'
    ? true
    : has(file.opportunityId) || has(file.packetSentAt) || has(file.likelyPath)

  if (!needsHandoff && file.handoffState === 'not_needed') {
    return { state: 'not_needed', ready: true, blockers: [], nextAction: 'No scheduler or home-measure handoff needed.' }
  }

  const blockers = []
  if (!has(file.customerName)) blockers.push('Customer name missing')
  if (!has(file.customerPhone) && !has(file.customerEmail)) blockers.push('No phone or email on file')
  if (!has(file.customerGoal)) blockers.push('Desired outcome not recorded')
  if (!has(file.existingApplianceType) || file.existingApplianceType === 'unknown') blockers.push('Existing setup not verified')
  if (!hasAny(file.photos)) blockers.push('Photos missing')
  if (!hasAny(file.measurements)) blockers.push('Measurements missing')

  const existing = file.handoffState || ''
  if (['created', 'sent_to_scheduler', 'waiting_for_measure', 'measure_completed', 'not_needed'].includes(existing)) {
    return {
      state: existing,
      ready: blockers.length === 0 || existing !== 'created',
      blockers,
      nextAction: existing === 'created'
        ? 'Send handoff to scheduler when ready.'
        : existing === 'sent_to_scheduler'
          ? 'Waiting for scheduler to set or confirm the home-measure step.'
          : existing === 'waiting_for_measure'
            ? 'Waiting for home-measure results.'
            : existing === 'measure_completed'
              ? 'Measurement completed. Refresh quote scope and pricing from field results.'
              : 'No scheduler or home-measure handoff needed.',
    }
  }

  return {
    state: blockers.length ? 'needed_not_ready' : 'ready_to_create',
    ready: blockers.length === 0,
    blockers,
    nextAction: blockers.length ? blockers[0] : 'Create scheduler/home-measure handoff.',
  }
}

function listLabels(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'none logged'
  return items.map((item) => item.label || item.modelName || item.displayId || item.value || item.id).filter(Boolean).join('; ') || 'logged'
}

export function createSchedulerHandoff(file = {}, now = new Date()) {
  const readiness = deriveHandoffReadiness(file)
  const handoff = {
    customerProject: [file.customerName, file.projectAddress].filter(Boolean).join(' · ') || file.customerName || 'Unnamed customer',
    existingSetup: [file.existingApplianceType, file.existingFuelType, file.existingVentingNotes || file.existingNotes].filter(Boolean).join(' · ') || 'not recorded',
    desiredOutcome: file.customerGoal || 'not recorded',
    likelyPath: file.likelyPath || 'not selected',
    photosStatus: statusLabel(Array.isArray(file.photos) && file.photos.length > 0),
    measurementsStatus: statusLabel(Array.isArray(file.measurements) && file.measurements.length > 0),
    modelTagStatus: statusLabel(isTrue(file.modelTagReceived) || has(file.taggedModel), 'received', 'missing / not applicable'),
    missingVerification: file.handoffMissingVerification || readiness.blockers.join('; '),
    gasElectricalChimneyVentingConcerns: file.handoffConcerns || file.existingVentingNotes || '',
    displaysShown: listLabels(file.displaysShown),
    brochuresSamplesGiven: listLabels([...(file.brochuresGiven || []), ...(file.samplesGiven || [])]),
    quoteNumber: file.opportunityId || '',
    originalBizTrackQuoteIncluded: isTrue(file.lineItemQuoteIncluded) ? 'included' : has(file.lineItemQuoteExcludedReason) ? `excluded: ${file.lineItemQuoteExcludedReason}` : 'undecided',
    schedulerHomeMeasureExpectation: file.handoffSchedulerExpectation || file.handoffScheduledFor || 'scheduler to contact customer after packet review / internal approval',
    internalNotes: file.handoffNotes || '',
    createdAt: nowIso(now),
  }
  return {
    readiness,
    handoff,
    summary: [
      `Customer/project: ${handoff.customerProject}`,
      `Existing setup: ${handoff.existingSetup}`,
      `Desired outcome: ${handoff.desiredOutcome}`,
      `Likely path: ${handoff.likelyPath}`,
      `Photos: ${handoff.photosStatus}`,
      `Measurements: ${handoff.measurementsStatus}`,
      `Model tag: ${handoff.modelTagStatus}`,
      `Missing verification: ${handoff.missingVerification || 'none noted'}`,
      `Gas/electrical/chimney/venting concerns: ${handoff.gasElectricalChimneyVentingConcerns || 'none noted'}`,
      `Displays shown: ${handoff.displaysShown}`,
      `Brochures/samples: ${handoff.brochuresSamplesGiven}`,
      `Quote/source: ${handoff.quoteNumber || 'no BizTrack quote linked yet'}`,
      `Original BizTrack quote: ${handoff.originalBizTrackQuoteIncluded}`,
      `Scheduler/home-measure expectation: ${handoff.schedulerHomeMeasureExpectation}`,
      `Internal notes: ${handoff.internalNotes || 'none'}`,
    ].join('\n'),
  }
}

export function buildHandoffPatch(action, value, now = new Date()) {
  const ts = nowIso(now)
  switch (action) {
    case 'not-needed': return { handoffState: 'not_needed', handoffType: 'none' }
    case 'need-home-measure': return { handoffType: 'home-measure', handoffState: 'needed_not_ready' }
    case 'set-missing-verification': return { handoffMissingVerification: String(value || '') }
    case 'set-concerns': return { handoffConcerns: String(value || '') }
    case 'set-expectation': return { handoffSchedulerExpectation: String(value || '') }
    case 'set-notes': return { handoffNotes: String(value || '') }
    case 'created': return { handoffState: 'created', handoffCreatedAt: ts, handoffSummary: String(value || '') }
    case 'sent': return { handoffState: 'sent_to_scheduler', handoffSentAt: ts, handoffSummary: String(value || '') }
    case 'waiting-for-measure': return { handoffState: 'waiting_for_measure' }
    case 'measure-completed': return { handoffState: 'measure_completed', handoffMeasureCompletedAt: ts }
    default: return {}
  }
}
