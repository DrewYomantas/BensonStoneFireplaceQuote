const closedStatuses = ['reference-only', 'closed-won', 'closed-lost', 'archived']

function parseDate(value) {
  if (!value) return null
  const text = String(value).trim()
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, month, day, year] = slash
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year)
    const date = new Date(fullYear, Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysSince(value, now) {
  const date = parseDate(value)
  if (!date) return null
  return Math.floor((new Date(now).getTime() - date.getTime()) / 86400000)
}

function latestContactActivity(activities = []) {
  return activities.find((activity) => ['follow-up-sent', 'phone-call', 'voicemail', 'proposal-sent'].includes(activity.type)) || null
}

function hasWarning(opportunity, pattern) {
  return (opportunity.warnings || []).some((warning) => pattern.test(warning))
}

function contactFlags(opportunity = {}) {
  return {
    hasEmail: Boolean(opportunity.customerEmail),
    hasPhone: Boolean(opportunity.customerPhone),
    hasName: Boolean(opportunity.customerName),
  }
}

export function getChannelHints(opportunity = {}) {
  const flags = contactFlags(opportunity)
  return [
    flags.hasEmail ? 'Email available' : 'Email missing',
    flags.hasPhone ? 'Phone available' : 'Phone missing',
    flags.hasPhone ? 'Text possible' : 'Text blocked',
  ]
}

function suggestedChannel(opportunity) {
  if (opportunity.customerEmail) return 'email'
  if (opportunity.customerPhone) return 'phone'
  return 'manual'
}

function lastContactDate(opportunity, activities) {
  const activity = latestContactActivity(activities)
  return activity?.createdAt || opportunity.lastContactedAt || ''
}

function warningFlags(opportunity, contacts) {
  const flags = []
  if (!contacts.hasName) flags.push('missing-name')
  if (!contacts.hasEmail && !contacts.hasPhone) flags.push('missing-contact')
  if (hasWarning(opportunity, /product match/i)) flags.push('product-review')
  if (hasWarning(opportunity, /install/i)) flags.push('install-details')
  if (hasWarning(opportunity, /venting|chimney/i)) flags.push('venting-details')
  if (hasWarning(opportunity, /paid\/closed\/reference|closed|reference/i)) flags.push('closed-reference')
  return flags
}

export function recommendFollowUpCadence({
  opportunity = {},
  activities = [],
  now = new Date(),
} = {}) {
  const contacts = contactFlags(opportunity)
  const flags = warningFlags(opportunity, contacts)
  const quoteAgeDays = daysSince(opportunity.quoteDate, now)
  const contactedAgeDays = daysSince(lastContactDate(opportunity, activities), now)
  const channel = suggestedChannel(opportunity)

  if (closedStatuses.includes(opportunity.status)) {
    return {
      priority: 'archive-review',
      label: opportunity.status === 'reference-only' ? 'Reference only, do not follow up' : 'No active follow-up',
      reason: 'This opportunity is closed, archived, or reference-only.',
      suggestedChannel: 'manual',
      warningFlags: flags,
      nextActionCopy: opportunity.status === 'reference-only' ? 'Keep for reference' : 'No active follow-up',
    }
  }

  if (!contacts.hasName || (!contacts.hasEmail && !contacts.hasPhone)) {
    return {
      priority: 'blocked',
      label: 'Contact info needs review',
      reason: 'Customer identity or contact details are incomplete.',
      suggestedChannel: 'manual',
      warningFlags: flags,
      nextActionCopy: 'Confirm customer contact before drafting follow-up',
    }
  }

  if (opportunity.status === 'needs-review' || opportunity.proposalReadiness === 'blocked' || flags.includes('product-review') || flags.includes('install-details') || flags.includes('venting-details')) {
    return {
      priority: 'blocked',
      label: 'Review before sending',
      reason: 'Internal warnings need review before this is treated as ready.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Review quote details before sending',
    }
  }

  if (opportunity.status === 'waiting-on-customer' || opportunity.status === 'proposal-sent') {
    if (contactedAgeDays !== null && contactedAgeDays <= 3) {
      return {
        priority: 'waiting',
        label: 'Give customer time to respond',
        reason: 'A recent follow-up is already logged.',
        suggestedChannel: channel,
        warningFlags: flags,
        nextActionCopy: 'Wait before checking back',
      }
    }
    return {
      priority: contactedAgeDays !== null && contactedAgeDays > 7 ? 'today' : 'soon',
      label: 'Check back with customer',
      reason: 'The quote is waiting on customer response.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Check back with customer',
    }
  }

  if (quoteAgeDays !== null && quoteAgeDays > 90) {
    return {
      priority: quoteAgeDays > 180 || contactedAgeDays === null || contactedAgeDays > 14 ? 'today' : 'soon',
      label: 'Soft reactivation',
      reason: 'Older quote may need a low-pressure refresh.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Send a soft reactivation follow-up',
    }
  }

  if (opportunity.temperature === 'hot' && (contactedAgeDays === null || contactedAgeDays > 2)) {
    return {
      priority: 'today',
      label: 'Follow up today',
      reason: 'Hot opportunity with no recent contact logged.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Follow up today',
    }
  }

  if (opportunity.status === 'ready-for-proposal' || opportunity.proposalReadiness === 'ready') {
    return {
      priority: 'today',
      label: 'Ready for proposal',
      reason: 'Reviewed quote looks ready for the proposal path.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Prepare customer-facing proposal',
    }
  }

  if (opportunity.temperature === 'warm' && (contactedAgeDays === null || contactedAgeDays > 5)) {
    return {
      priority: 'soon',
      label: 'Follow up this week',
      reason: 'Warm opportunity has not been contacted in several days.',
      suggestedChannel: channel,
      warningFlags: flags,
      nextActionCopy: 'Follow up this week',
    }
  }

  return {
    priority: 'monitor',
    label: 'Monitor',
    reason: 'No urgent follow-up signal is present.',
    suggestedChannel: channel,
    warningFlags: flags,
    nextActionCopy: opportunity.nextAction || 'Monitor opportunity',
  }
}

export function summarizeCadence(opportunities = [], activityMap = {}, now = new Date()) {
  const recommendations = opportunities.map((opportunity) => ({
    opportunity,
    cadence: recommendFollowUpCadence({ opportunity, activities: activityMap[opportunity.id] || [], now }),
  }))

  return {
    needsFollowUp: recommendations.filter(({ cadence }) => ['today', 'soon'].includes(cadence.priority)).length,
    staleOpportunities: recommendations.filter(({ opportunity }) => {
      const quoteAgeDays = daysSince(opportunity.quoteDate, now)
      const contactedAgeDays = daysSince(opportunity.lastContactedAt, now)
      return !closedStatuses.includes(opportunity.status) && ((quoteAgeDays !== null && quoteAgeDays > 90) || (contactedAgeDays !== null && contactedAgeDays > 14))
    }).length,
    missingContactInfo: recommendations.filter(({ cadence }) => cadence.warningFlags.includes('missing-contact') || cadence.warningFlags.includes('missing-name')).length,
    readyForProposal: recommendations.filter(({ opportunity, cadence }) => opportunity.proposalReadiness === 'ready' && cadence.priority !== 'blocked').length,
    waitingOnCustomer: recommendations.filter(({ opportunity }) => opportunity.status === 'waiting-on-customer').length,
    reviewBeforeSending: recommendations.filter(({ cadence }) => cadence.priority === 'blocked').length,
  }
}
