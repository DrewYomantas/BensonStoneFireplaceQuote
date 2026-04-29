export const activityTypes = [
  'note',
  'follow-up-draft',
  'follow-up-sent',
  'phone-call',
  'voicemail',
  'showroom-visit',
  'proposal-created',
  'proposal-sent',
  'status-change',
  'next-action-updated',
]

export const activityChannels = ['email', 'phone', 'voicemail', 'in-person', 'nextdoor', 'facebook', 'manual', 'unknown']

const STORAGE_KEY = 'benson-stone-opportunity-activities-v1'
const sensitivePattern = /average\s*cost|buy\s*price|\bcost\b|\bmargin\b|inventory\s*turn|supplier|product\s*rank|sales\s*rank|sales\s*performance|raw\s*ocr|private\s*catalog/i

function makeId(now = new Date()) {
  return `activity-${now.toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
}

function scrubText(value) {
  const text = String(value || '')
  return sensitivePattern.test(text) ? text.replace(sensitivePattern, '[internal detail removed]') : text
}

function sanitizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => !sensitivePattern.test(key) && typeof value !== 'object')
      .map(([key, value]) => [key, scrubText(value)])
  )
}

export function sanitizeActivity(activity = {}) {
  const now = new Date()
  const type = activityTypes.includes(activity.type) ? activity.type : 'note'
  const channel = activityChannels.includes(activity.channel) ? activity.channel : 'manual'
  return {
    id: activity.id || makeId(now),
    opportunityId: activity.opportunityId || '',
    type,
    title: scrubText(activity.title || ''),
    body: scrubText(activity.body || ''),
    createdAt: activity.createdAt || now.toISOString(),
    createdBy: scrubText(activity.createdBy || 'local user'),
    channel,
    metadata: sanitizeMetadata(activity.metadata),
  }
}

function getStorage(storage = globalThis.localStorage) {
  return storage || null
}

function listAllActivities(storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  try {
    const parsed = JSON.parse(localStorageRef.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizeActivity) : []
  } catch {
    return []
  }
}

function writeAllActivities(activities, storage) {
  const localStorageRef = getStorage(storage)
  if (!localStorageRef) return []
  const clean = activities.map(sanitizeActivity)
  localStorageRef.setItem(STORAGE_KEY, JSON.stringify(clean))
  return clean
}

export function listOpportunityActivities(opportunityId, storage) {
  return listAllActivities(storage)
    .filter((activity) => activity.opportunityId === opportunityId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export function addOpportunityActivity(opportunityId, activity, storage) {
  const clean = sanitizeActivity({ ...activity, opportunityId })
  writeAllActivities([clean, ...listAllActivities(storage)], storage)
  return clean
}

export function updateOpportunityActivity(activityId, patch, storage) {
  const updated = listAllActivities(storage).map((activity) =>
    activity.id === activityId ? sanitizeActivity({ ...activity, ...patch, id: activity.id }) : activity
  )
  writeAllActivities(updated, storage)
  return updated.find((activity) => activity.id === activityId) || null
}

export function removeOpportunityActivity(activityId, storage) {
  const remaining = listAllActivities(storage).filter((activity) => activity.id !== activityId)
  writeAllActivities(remaining, storage)
  return remaining
}

export function getLastActivity(opportunityId, storage) {
  return listOpportunityActivities(opportunityId, storage)[0] || null
}

export function buildSentOpportunityPatch(opportunity, now = new Date()) {
  if (['reference-only', 'closed-won', 'closed-lost', 'archived'].includes(opportunity.status)) {
    return {
      lastContactedAt: now.toISOString().slice(0, 10),
      nextAction: opportunity.nextAction || 'Keep as reference',
    }
  }
  return {
    lastContactedAt: now.toISOString().slice(0, 10),
    status: 'waiting-on-customer',
    nextAction: 'Check back with customer',
  }
}
