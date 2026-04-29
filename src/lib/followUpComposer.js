export const followUpTones = ['warm', 'professional', 'short', 'reactivation', 'clarification']
export const followUpChannels = ['email', 'text', 'phone-script', 'nextdoor-reply']

const sensitivePattern = /average\s*cost|buy\s*price|\bcost\b|\bmargin\b|inventory\s*turn|supplier|product\s*rank|sales\s*rank|sales\s*performance|fuzzy\s*match|needs\s*review|ocr|bistrack/i

function includesWarning(warnings, pattern) {
  return warnings.some((warning) => pattern.test(warning))
}

function quoteLooksOld(opportunity, warnings) {
  return opportunity.status === 'follow-up-needed' || includesWarning(warnings, /refresh|old quote|pricing/i)
}

function isReference(opportunity, warnings) {
  return opportunity.status === 'reference-only' || includesWarning(warnings, /paid\/closed|reference/i)
}

function missingContact(opportunity, channel) {
  if (channel === 'email') return !opportunity.customerEmail
  if (channel === 'text') return !opportunity.customerPhone
  if (channel === 'phone-script') return !opportunity.customerPhone
  return false
}

function safeLines(lines) {
  return lines.filter((line) => !sensitivePattern.test(line))
}

function subjectFor(opportunity, tone) {
  const project = opportunity.projectType || 'fireplace project'
  if (tone === 'clarification') return `A few details to confirm for your ${project}`
  if (tone === 'reactivation' || opportunity.status === 'follow-up-needed') return `Following up on your fireplace quote`
  return `Your ${project} proposal`
}

function bodyLinesFor({ opportunity, tone, warnings, fields }) {
  const name = opportunity.customerName ? `${opportunity.customerName},` : ''
  const lines = []
  const setupQuestions = fields?.currentSetupGuidance?.clarificationQuestions || []
  if (name) lines.push(`Hi ${name}`)

  if (tone === 'clarification' || includesWarning(warnings, /missing|install|venting|chimney|current setup|fireplace type|fuel type|depth|framing|electrical/i)) {
    lines.push('Before we finalize this proposal, we would like to confirm a few project details.')
    lines.push('That helps us make sure the fireplace, venting, and installation path are quoted correctly.')
    setupQuestions.slice(0, 2).forEach((question) => lines.push(question))
  } else if (tone === 'reactivation' || opportunity.status === 'follow-up-needed') {
    lines.push('I wanted to follow up on the fireplace quote we had started.')
    lines.push('If this project is still on your mind, we would be happy to revisit the details with you.')
  } else if (tone === 'short') {
    lines.push('I wanted to check in on your fireplace project and see if you would like us to revisit the quote with you.')
  } else {
    lines.push('Thanks again for taking the time to discuss your fireplace project with us.')
    lines.push('I put together this proposal based on the details we reviewed.')
  }

  if (quoteLooksOld(opportunity, warnings)) {
    lines.push('Some product availability or pricing may need to be refreshed before finalizing.')
  }

  if (fields?.displayModelAvailable === true) {
    lines.push('This model is available to view in our showroom.')
  }

  if (tone !== 'short') {
    lines.push('The next step is confirming the final installation details and any finish selections.')
  }

  return safeLines(lines)
}

function channelBody(body, channel) {
  if (channel === 'phone-script') return `Phone script:\n${body}`
  if (channel === 'nextdoor-reply') return body.replace(/^Hi [^\n]+\n\n/, '')
  if (channel === 'text') return body.split('\n\n').slice(0, 2).join(' ')
  return body
}

export function composeFollowUpDraft({
  opportunity = {},
  playbook = {},
  fields = {},
  warnings = [],
  tone = 'warm',
  channel = 'email',
} = {}) {
  const safeTone = followUpTones.includes(tone) ? tone : 'warm'
  const safeChannel = followUpChannels.includes(channel) ? channel : 'email'
  const allWarnings = [...new Set([...(opportunity.warnings || []), ...warnings])]
  const draftWarnings = []
  const reasons = []

  if (isReference(opportunity, allWarnings)) draftWarnings.push('Opportunity is reference-only or appears paid/closed. Review before sending.')
  if (!opportunity.customerName) draftWarnings.push('Missing customer name.')
  if (missingContact(opportunity, safeChannel)) draftWarnings.push('Selected channel does not fit available contact info.')
  if (quoteLooksOld(opportunity, allWarnings)) draftWarnings.push('Quote may need pricing refresh before sending.')
  if (includesWarning(allWarnings, /Product match needs review/i)) draftWarnings.push('Product match warning stays internal. Confirm selections before sending.')
  if (includesWarning(allWarnings, /install details/i)) draftWarnings.push('Install details missing.')
  if (includesWarning(allWarnings, /venting|chimney/i)) draftWarnings.push('Venting/chimney details missing.')
  if (includesWarning(allWarnings, /current setup|fireplace type|fuel type|depth|framing|electrical/i)) draftWarnings.push('Current setup or customer goal needs clarification before sending.')
  if ((fields?.currentSetupGuidance?.blockers || []).length) draftWarnings.push('Current setup or customer goal needs clarification before sending.')
  if (includesWarning(allWarnings, /Display-model wording/i) && fields.displayModelAvailable !== true) {
    draftWarnings.push('Display-model wording needs confirmation before use.')
  }

  if (safeTone === 'reactivation' || opportunity.status === 'follow-up-needed') reasons.push('Follow-up path is reactivation-oriented.')
  if (safeTone === 'clarification') reasons.push('Draft asks for missing project details before final proposal.')
  if (playbook?.name) reasons.push(`Aligned with ${playbook.name}.`)

  const subject = subjectFor(opportunity, safeTone)
  const body = channelBody(safeLines(bodyLinesFor({ opportunity, tone: safeTone, warnings: allWarnings, fields })).join('\n\n'), safeChannel)
  const safeDraftWarnings = [...new Set(draftWarnings)]
  const unsafeToSend = safeDraftWarnings.length > 0

  return {
    subject: sensitivePattern.test(subject) ? 'Fireplace project follow-up' : subject,
    body,
    channel: safeChannel,
    tone: safeTone,
    warnings: safeDraftWarnings,
    unsafeToSend,
    reasons,
  }
}
