import { composeFollowUpDraft } from './followUpComposer.js'
import { evaluateCurrentSetup } from './currentSetup.js'
import { createOpportunityFromCurrentQuote, sanitizeOpportunity } from './opportunities.js'
import { recommendProposalPackage } from './proposalPackages.js'

export const recoveryClassifications = [
  'hot',
  'warm',
  'cool',
  'unknown',
  'reference-only',
  'paid-closed',
  'missing-contact',
  'needs-review',
]

const closedClassifications = ['reference-only', 'paid-closed']

const closedSafeActivityTypes = ['note', 'follow-up-draft']

export const recoveryActivityOptions = [
  { type: 'note', label: 'Note Added' },
  { type: 'follow-up-draft', label: 'Draft Saved' },
  { type: 'follow-up-sent', label: 'Follow-Up Marked Sent (Manual)' },
  { type: 'phone-call', label: 'Call Completed' },
  { type: 'voicemail', label: 'Voicemail Left' },
  { type: 'status-change', label: 'Status Changed' },
]

function buildSetupFields(intake) {
  return {
    CUSTOMER_NAME: intake.customerName || '',
    CUSTOMER_EMAIL: intake.customerEmail || '',
    CUSTOMER_PHONE: intake.customerPhone || '',
    QUOTE_NO: intake.quoteNumber || '',
    QUOTE_DATE: intake.quoteDate || '',
    QUOTATION_TOTAL: intake.originalQuoteAmount || '',
    PROJECT_TITLE: intake.projectType || '',
    PROJECT_SCOPE_SUMMARY: intake.desiredOutcome || '',
    INSTALLATION_SCOPE: intake.existingSetup || '',
    PROJECT_NOTES: intake.productsNotes || '',
  }
}

function buildPlaybookWarnings(classification) {
  const warnings = [
    'Customer-facing proposal may need quote refresh before sending.',
    'Sensitive BisTrack fields excluded from customer export.',
  ]
  if (closedClassifications.includes(classification)) {
    warnings.push('Quote appears paid/closed/reference. Do not treat it as an active proposal without confirmation.')
  }
  if (classification === 'missing-contact') {
    warnings.push('Missing customer contact info. Confirm preferred contact before sending.')
  }
  return warnings
}

function inferTemperature(classification, baseTemperature) {
  if (classification === 'hot') return 'hot'
  if (classification === 'warm') return 'warm'
  if (classification === 'cool') return 'cool'
  return baseTemperature || 'unknown'
}

export function createOldQuoteOpportunity(intake = {}, now = new Date()) {
  const fields = buildSetupFields(intake)
  const classification = intake.recoveryClassification || 'unknown'

  const parseContext = {
    documentType: closedClassifications.includes(classification) ? 'bill' : 'quote',
    fullyPaid: classification === 'paid-closed',
    sourceType: 'old-quote-recovery',
    sourceLabel: intake.sourceLabel || intake.sourceFileNote || 'Old quote recovery intake',
    sourceFileName: intake.sourceFileNote || '',
    sourceConfidence: intake.sourceConfidence || '',
    sourceWarnings: [],
  }

  const playbookRecommendation = {
    id: closedClassifications.includes(classification) ? 'paid-order-summary' : 'old-quote-re-engagement',
    warnings: buildPlaybookWarnings(classification),
  }

  const base = createOpportunityFromCurrentQuote({
    fields,
    parseContext,
    productIntelligence: { needsReviewCount: 0, groupedRows: [] },
    playbookRecommendation,
    now,
  })

  const temperature = inferTemperature(classification, base.temperature)

  const hasSetupText = Boolean(intake.existingSetup || intake.desiredOutcome || intake.productsNotes)
  const setupGuidance = hasSetupText ? evaluateCurrentSetup({ fields }) : { blockers: [] }
  const setupBlockerWarnings = (setupGuidance.blockers || []).filter(Boolean)

  const allWarnings = [...new Set([...base.warnings, ...setupBlockerWarnings])]

  return sanitizeOpportunity({
    ...base,
    temperature,
    warnings: allWarnings,
    recoverySource: 'true',
    recoveryClassification: classification,
    needsRefresh: 'true',
    internalNotes: String(intake.internalNotes || ''),
  })
}

export function deriveRecoveryRecommendation(opportunity = {}) {
  const warnings = opportunity.warnings || []
  const isPaidClosed = opportunity.recoveryClassification === 'paid-closed'
  const isReference = ['reference-only', 'archived'].includes(opportunity.status)
  const hasName = Boolean(opportunity.customerName)
  const hasEmail = Boolean(opportunity.customerEmail)
  const hasPhone = Boolean(opportunity.customerPhone)
  const isMissingContact = !hasName || (!hasEmail && !hasPhone)
  const hasSetupBlockers = warnings.some((w) =>
    /current appliance type is unknown|chimney or venting path|fuel type is unknown|customer says insert|framing|electrical availability/i.test(w),
  )
  const hasProductReviewWarning = warnings.some((w) => /Product match needs review/i.test(w))

  if (isPaidClosed) {
    return {
      nextAction: 'paid-closed-archive',
      label: 'Paid/closed — archive or reference only',
      path: 'reference-only-guardrail',
      safe: false,
      reason: 'This quote appears paid or closed. Keep as reference only.',
    }
  }

  if (isReference) {
    return {
      nextAction: 'reference-only',
      label: 'Reference only — do not contact yet',
      path: 'reference-only-guardrail',
      safe: false,
      reason: 'Record is reference-only. Keep internal unless intentionally reopened.',
    }
  }

  if (isMissingContact) {
    return {
      nextAction: 'needs-contact-info',
      label: 'Confirm contact info before outreach',
      path: 'missing-info-preproposal',
      safe: false,
      reason: 'Customer contact is missing. Outreach is blocked until confirmed.',
    }
  }

  if (hasSetupBlockers) {
    return {
      nextAction: 'needs-setup-clarification',
      label: 'Needs setup clarification',
      path: 'missing-info-preproposal',
      safe: false,
      reason: 'Setup or goal blockers need resolution before drafting a proposal.',
    }
  }

  if (hasProductReviewWarning) {
    return {
      nextAction: 'needs-price-refresh',
      label: 'Needs price/product refresh',
      path: 'old-quote-refresh',
      safe: false,
      reason: 'Pricing or product selections need review before any outreach.',
    }
  }

  if (hasEmail) {
    return {
      nextAction: 'draft-follow-up-email',
      label: 'Draft follow-up email',
      path: 'old-quote-refresh',
      safe: true,
      reason: 'Email path available. Review draft before sending. Pricing may need confirmation.',
    }
  }

  if (hasPhone) {
    return {
      nextAction: 'call-first',
      label: 'Call first',
      path: 'old-quote-refresh',
      safe: true,
      reason: 'No email available. Phone call path recommended.',
    }
  }

  return {
    nextAction: 'needs-review',
    label: 'Review before outreach',
    path: 'needs-review',
    safe: false,
    reason: 'Opportunity needs review before any outreach.',
  }
}

export function getRecoveryFollowUpDraft(opportunity = {}, opts = {}) {
  return composeFollowUpDraft({
    opportunity,
    fields: { currentSetupGuidance: opts.currentSetupGuidance || {} },
    warnings: [...(opportunity.warnings || [])],
    tone: opts.tone || 'reactivation',
    channel: opts.channel || 'email',
  })
}

export function getRecoveryProposalPackage(opportunity = {}) {
  return recommendProposalPackage({
    opportunity,
    currentSetupGuidance: {},
    fields: {},
    productIntelligence: { needsReviewCount: 0, groupedRows: [] },
  })
}

export function isSafeActivityForStatus(activityType, opportunityStatus) {
  const closedStatuses = ['reference-only', 'closed-won', 'closed-lost', 'archived']
  if (closedStatuses.includes(opportunityStatus)) {
    return closedSafeActivityTypes.includes(activityType)
  }
  const openActivityTypes = [
    'note', 'follow-up-draft', 'follow-up-sent', 'phone-call', 'voicemail',
    'showroom-visit', 'proposal-created', 'proposal-sent', 'status-change', 'next-action-updated',
  ]
  return openActivityTypes.includes(activityType)
}
