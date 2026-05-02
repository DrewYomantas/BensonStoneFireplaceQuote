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
    QUOTATION_TOTAL: intake.quotationTotal || intake.originalQuoteAmount || '',
    PROJECT_TITLE: intake.projectTitle || intake.projectType || '',
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

function uploadedWarnings(intake) {
  const warnings = []
  const isUploaded = Boolean(intake.sourceType && intake.sourceType !== 'manual')
  if (isUploaded) warnings.push('Review extracted text before follow-up.')
  if (isUploaded && intake.reviewedForFollowUp !== true && intake.reviewedForFollowUp !== 'true') warnings.push('OCR/source review required before follow-up draft.')
  if (!intake.quoteDate) warnings.push('Quote date missing.')
  if (!intake.originalQuoteAmount && !intake.quotationTotal) warnings.push('Quote total missing.')
  if (!intake.productsNotes) warnings.push('Product details need review.')
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
    sourceWarnings: intake.sourceWarnings || [],
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

  const allWarnings = [...new Set([...base.warnings, ...setupBlockerWarnings, ...uploadedWarnings(intake), ...(intake.sourceWarnings || [])])]
  const reviewedForFollowUp = intake.reviewedForFollowUp === true || intake.reviewedForFollowUp === 'true'

  return sanitizeOpportunity({
    ...base,
    sourceType: intake.sourceType || base.sourceType,
    sourceLabel: intake.sourceLabel || base.sourceLabel,
    sourceFileName: intake.sourceFileNote || base.sourceFileName,
    sourceTrailNote: intake.sourceTrailNote || intake.sourceLabel || '',
    sourceWarnings: intake.sourceWarnings || base.sourceWarnings,
    originalQuoteAmount: intake.originalQuoteAmount || '',
    quotationTotal: intake.quotationTotal || intake.originalQuoteAmount || '',
    projectTitle: intake.projectTitle || '',
    existingSetup: intake.existingSetup || '',
    desiredOutcome: intake.desiredOutcome || '',
    productsNotes: intake.productsNotes || '',
    temperature,
    warnings: allWarnings,
    recoverySource: 'true',
    recoveryClassification: classification,
    needsRefresh: 'true',
    reviewedForFollowUp: reviewedForFollowUp ? 'true' : 'false',
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
  const isUploadedUnreviewed = opportunity.sourceType && opportunity.sourceType !== 'old-quote-recovery' && opportunity.reviewedForFollowUp !== 'true'
  const isQuotePolish = opportunity.sourceType === 'quote-polish'
  const quotePolishAttachmentMissing = isQuotePolish && opportunity.lineItemQuoteAttached !== 'true'
  const quotePolishReadinessBlocked = isQuotePolish && ['blocked', 'needs-review'].includes(opportunity.proposalReadiness)

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

  if (isUploadedUnreviewed) {
    return {
      nextAction: 'review-uploaded-source',
      label: 'Review extracted quote before outreach',
      path: 'missing-info-preproposal',
      safe: false,
      reason: 'Uploaded/OCR intake must be reviewed before follow-up copy is available.',
    }
  }

  if (quotePolishAttachmentMissing) {
    return {
      nextAction: 'confirm-line-item-quote',
      label: 'Confirm attached line-item quote',
      path: 'missing-info-preproposal',
      safe: false,
      reason: 'The original BisTrack line-item quote must be confirmed before proposal follow-up copy is available.',
    }
  }

  if (quotePolishReadinessBlocked) {
    return {
      nextAction: 'review-proposal-readiness',
      label: 'Review proposal readiness',
      path: 'missing-info-preproposal',
      safe: false,
      reason: 'Proposal readiness is not clear enough for follow-up copy yet.',
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
  if (opportunity.sourceType && opportunity.sourceType !== 'old-quote-recovery' && opportunity.reviewedForFollowUp !== 'true') {
    return {
      subject: 'Review extracted quote first',
      body: '',
      channel: opts.channel || 'email',
      tone: opts.tone || 'reactivation',
      warnings: ['Uploaded quote must be reviewed before follow-up copy is available.'],
      unsafeToSend: true,
      reasons: ['OCR/source review is incomplete.'],
    }
  }
  if (opportunity.sourceType === 'quote-polish' && opportunity.lineItemQuoteAttached !== 'true') {
    return {
      subject: 'Confirm line-item quote attachment',
      body: '',
      channel: opts.channel || 'email',
      tone: opts.tone || 'reactivation',
      warnings: ['Original BisTrack line-item quote attachment must be confirmed before follow-up copy is available.'],
      unsafeToSend: true,
      reasons: ['Line-item quote attachment is not confirmed.'],
    }
  }
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
