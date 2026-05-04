const has = (v) => Boolean(String(v || '').trim())
const isTrue = (v) => String(v || '').toLowerCase() === 'true'

function addDays(now, days) {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function text(...parts) {
  return parts.map((p) => String(p || '').toLowerCase()).join(' ')
}

function hasTask(file = {}, id) {
  return (file.followUpTasks || []).some((task) => task.planId === id || task.id === id)
}

function task(id, label, dueAt, reason, channel = 'email') {
  return { planId: id, label, dueAt, reason, channel }
}

export function planFollowUpTasks(file = {}, now = new Date()) {
  const tasks = []
  const hay = text(file.existingNotes, file.existingVentingNotes, file.customerGoal, file.goalNotes, file.customerPainPoints, file.likelyPath)
  const modelTagNeeded = /prefab|pre-fab|zero.?clearance|\bzc\b|factory.?built/.test(hay) && !isTrue(file.modelTagReceived) && !has(file.taggedModel)
  const gasLikely = /gas log|gas insert|gas fireplace|direct vent gas|propane|natural gas/.test(hay)
  const gasUnknown = gasLikely && file.existingFuelType !== 'gas' && !/natural gas|propane|\blp\b/.test(hay)

  if (modelTagNeeded && !hasTask(file, 'ask-model-tag-photo')) {
    tasks.push(task('ask-model-tag-photo', 'Ask customer for model tag photo', addDays(now, 0), 'Prefab/ZC path needs model verification before compatibility discussion.'))
  }
  if (gasUnknown && !hasTask(file, 'confirm-gas-type')) {
    tasks.push(task('confirm-gas-type', 'Ask customer to confirm gas type or gas availability', addDays(now, 0), 'Gas path is likely, but natural gas vs propane / line availability is not confirmed.'))
  }
  if (has(file.opportunityId) && !has(file.packetSentAt) && !hasTask(file, 'send-quote-packet')) {
    tasks.push(task('send-quote-packet', 'Send quote packet same day', addDays(now, 0), 'BizTrack quote is linked; packet should be printed or emailed once blockers are resolved.'))
  }
  if (has(file.packetSentAt) && !hasTask(file, 'check-in-2-3-days')) {
    tasks.push(task('check-in-2-3-days', 'Check in 2 to 3 days after quote packet', addDays(file.packetSentAt, 3), 'Packet was sent; confirm customer received it and answer questions.'))
  }
  if (has(file.packetSentAt) && !hasTask(file, 'follow-up-7-days')) {
    tasks.push(task('follow-up-7-days', 'Follow up around 7 days if no response', addDays(file.packetSentAt, 7), 'No response follow-up cadence after packet send.'))
  }
  if (['sent_to_scheduler', 'waiting_for_measure'].includes(file.handoffState) && !hasTask(file, 'follow-up-14-days-scheduler')) {
    const base = file.handoffSentAt || file.packetSentAt || now
    tasks.push(task('follow-up-14-days-scheduler', 'Follow up around 14 days tied to scheduler/home-measure expectation', addDays(base, 14), 'Keep customer aligned while home-measure or scheduler step is pending.'))
  }
  const quoteAgeDays = file.pricingConfirmedAt ? Math.floor((new Date(now) - new Date(file.pricingConfirmedAt)) / 86400000) : null
  const oldQuote = /old quote|recovery|refresh|reactivation/.test(hay) || (quoteAgeDays !== null && quoteAgeDays > 30)
  if (has(file.opportunityId) && oldQuote && !hasTask(file, 'pricing-refresh-before-recovery')) {
    tasks.push(task('pricing-refresh-before-recovery', 'Pricing refresh before old quote recovery outreach', addDays(now, 0), 'Old quote or stale pricing should be verified before customer outreach.', 'internal'))
  }

  const openExisting = (file.followUpTasks || []).filter((t) => !t.doneAt)
  return {
    required: tasks.length > 0,
    tasks,
    openExisting,
    nextTask: tasks[0] || openExisting[0] || null,
    nextAction: tasks[0]?.label || openExisting[0]?.label || 'No follow-up task required right now.',
  }
}

export function buildFollowUpTask(taskDraft = {}, now = new Date()) {
  const label = String(taskDraft.label || '').trim()
  if (!label) return null
  return {
    id: taskDraft.id || `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    planId: taskDraft.planId || '',
    label,
    dueAt: taskDraft.dueAt || new Date(now).toISOString(),
    channel: taskDraft.channel || 'email',
    reason: taskDraft.reason || '',
    createdAt: new Date(now).toISOString(),
  }
}

export function buildSnoozePatch(task = {}, days = 1, now = new Date()) {
  if (!task.id) return null
  return {
    ...task,
    dueAt: addDays(now, days),
    snoozedAt: new Date(now).toISOString(),
  }
}

export function upsertFollowUpTask(file = {}, taskDraft = {}, now = new Date()) {
  const built = buildFollowUpTask(taskDraft, now)
  if (!built) return file.followUpTasks || []
  const existing = file.followUpTasks || []
  const idx = existing.findIndex((task) => (built.planId && task.planId === built.planId) || task.id === built.id)
  if (idx === -1) return [...existing, built]
  return existing.map((task, i) => i === idx ? { ...task, ...built, id: task.id || built.id, createdAt: task.createdAt || built.createdAt } : task)
}
