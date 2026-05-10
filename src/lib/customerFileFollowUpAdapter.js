import { isFollowUpDueOrOverdue } from './visitActivity.js'

const SENSITIVE_PATTERN = /\bcost\b|\bmargin\b|buy\s*price|supplier|product\s*rank|sales\s*rank|\bocr\b|bistrack\s*confidence|fuzzy\s*match/i

function safeProp(value) {
  const s = String(value || '').trim()
  return SENSITIVE_PATTERN.test(s) ? '' : s
}

// Translate a Sales OS Customer File (display projection) into the minimal
// "opportunity" shape that composeFollowUpDraft expects. No sensitive keys
// or banned phrases may appear in the output.
export function customerFileToOpportunity(file = {}, followUp = null, warnings = []) {
  const overdue = followUp ? isFollowUpDueOrOverdue(followUp) : false
  const safeWarnings = warnings
    .map((w) => (w && typeof w === 'object' ? String(w.message || '') : String(w || '')))
    .filter(Boolean)
    .filter((w) => !SENSITIVE_PATTERN.test(w))

  return {
    customerName: safeProp(file.customerName),
    customerEmail: safeProp(file.customerEmail),
    customerPhone: safeProp(file.customerPhone),
    projectType: safeProp(file.customerGoal || 'fireplace project'),
    status: overdue ? 'waiting-on-customer' : '',
    warnings: safeWarnings,
    proposalReadiness: '',
    temperature: '',
    nextAction: '',
  }
}
