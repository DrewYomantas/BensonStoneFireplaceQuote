import { recommendFollowUpCadence } from './followUpCadence.js'

const closedStatuses = ['reference-only', 'closed-won', 'closed-lost', 'archived']
const sensitivePatterns = [
  /\bcost\b/i,
  /buy\s*price/i,
  /average\s*cost/i,
  /\bmargin\b/i,
  /supplier/i,
  /inventory\s*turn/i,
  /product\s*rank/i,
  /sales\s*rank/i,
  /sales\s*performance/i,
  /ocr/i,
  /fuzzy\s*match/i,
  /needs\s*review/i,
  /bistrack/i,
]

const packageDefinitions = {
  'warm-showroom-proposal': {
    label: 'Warm Showroom Proposal',
    purpose: 'A warm customer-facing proposal that feels like a continuation of the showroom/design conversation.',
    sections: ['Project recap', 'Reviewed fireplace selections', 'Installation path', 'Next steps'],
    checklist: ['Confirm customer contact', 'Confirm reviewed quote values', 'Confirm final finish selections'],
    copy: [
      'Here is a refreshed look at the fireplace project we discussed.',
      'I organized the proposal around the selections and project details we reviewed.',
      'Before approval, we can confirm the final installation details and finish choices together.',
    ],
  },
  'old-quote-refresh': {
    label: 'Old Quote Refresh',
    purpose: 'A softer package that avoids implying old pricing is final.',
    sections: ['Project refresher', 'Items to reconfirm', 'Updated next steps'],
    checklist: ['Refresh pricing before final approval', 'Confirm current product availability', 'Confirm the project is still active'],
    copy: [
      'Here is a refreshed look at the fireplace project we discussed.',
      'Some pricing or availability may need to be refreshed before final approval.',
      'We can revisit the project and make sure the details still fit your space.',
    ],
  },
  'value-comparison': {
    label: 'Value Comparison',
    purpose: 'Help compare option paths without exposing internal pricing or ranking.',
    sections: ['Option overview', 'Good / better / best paths', 'Customer priorities', 'Next steps'],
    checklist: ['Confirm option totals', 'Write salesperson tradeoff notes', 'Keep internal metrics out of customer copy'],
    copy: [
      'I outlined the main fireplace options so you can compare the paths side by side.',
      'Each option can be adjusted around finish selections, installation details, and timing.',
      'We can walk through the tradeoffs together before anything is finalized.',
    ],
  },
  'premium-design': {
    label: 'Premium Design Proposal',
    purpose: 'Make the quote feel polished, design-forward, and showroom-level.',
    sections: ['Design direction', 'Fireplace package', 'Finish details', 'Installation plan', 'Approval steps'],
    checklist: ['Confirm design details', 'Confirm finish selections', 'Confirm project scope is customer-ready'],
    copy: [
      'This proposal brings together the fireplace, finishing details, and installation scope for your project.',
      'The selections are organized so you can see how the full fireplace package comes together.',
      'We can refine final finishes and installation details before approval.',
    ],
  },
  'missing-info-preproposal': {
    label: 'Missing-Info Pre-Proposal',
    purpose: 'Prepare a friendly clarification package before creating a final proposal.',
    sections: ['Details to confirm', 'Project questions', 'Next review step'],
    checklist: ['Confirm customer identity/contact', 'Confirm install path', 'Confirm venting/chimney details', 'Confirm product selections'],
    copy: [
      'Before finalizing, we would want to confirm a few project details.',
      'That helps us make sure the fireplace, venting, and installation path are quoted correctly.',
      'Once those details are confirmed, we can prepare the finished proposal for review.',
    ],
  },
  'display-model-followup': {
    label: 'Display Model Follow-Up',
    purpose: 'Encourage a showroom visit or revisit safely.',
    sections: ['Showroom viewing note', 'Project recap', 'Details to confirm', 'Next steps'],
    checklist: ['Confirm display status internally', 'Avoid saying the customer viewed it unless notes confirm that', 'Confirm product selections before final proposal'],
    copy: [
      'This option may be available to view in our showroom.',
      'If you would like another look at the fireplace or finish details, we would be happy to walk through it with you.',
      'We can confirm final selections and installation details before moving forward.',
    ],
  },
  'reference-only-guardrail': {
    label: 'Reference-Only Guardrail',
    purpose: 'Prevent accidental outreach or customer-facing proposal export.',
    sections: ['Internal source review', 'Reference notes', 'Archive decision'],
    checklist: ['Do not treat this as active outreach', 'Confirm record status', 'Keep customer-facing export blocked'],
    copy: [],
  },
}

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

function parseCurrency(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function hasWarning(warnings, pattern) {
  return (warnings || []).some((warning) => pattern.test(warning))
}

function hasGroup(productIntelligence, groups) {
  return (productIntelligence?.groupedRows || []).some((section) => groups.includes(section.group))
}

function hasDisplayProduct(productIntelligence, warnings) {
  if (hasWarning(warnings, /display-model|display model|showroom/i)) return true
  return (productIntelligence?.rows || []).some((row) => row.match?.matchType === 'exact' && (row.badges || []).includes('On Display'))
}

function selectedPlaybookId(playbookRecommendation, opportunity) {
  return opportunity?.selectedPlaybookId || opportunity?.recommendedPlaybookId || playbookRecommendation?.id || ''
}

function safeScaffold(lines) {
  return (lines || []).filter((line) => !sensitivePatterns.some((pattern) => pattern.test(line)))
}

function buildContext({ currentSetupGuidance = {}, fields = {}, opportunity = {}, productIntelligence = {}, playbookRecommendation = {}, cadenceRecommendation, parseContext = {}, now = new Date() }) {
  const warnings = [...(opportunity.warnings || []), ...(playbookRecommendation.warnings || [])]
  const quoteDate = opportunity.quoteDate || fields.QUOTE_DATE || ''
  const quoteAgeDays = daysSince(quoteDate, now)
  const playbookId = selectedPlaybookId(playbookRecommendation, opportunity)
  const customerName = opportunity.customerName || fields.CUSTOMER_NAME || ''
  const customerEmail = opportunity.customerEmail || fields.CUSTOMER_EMAIL || ''
  const customerPhone = opportunity.customerPhone || fields.CUSTOMER_PHONE || fields.PROJECT_PHONE || ''
  const installScope = fields.INSTALLATION_SCOPE || fields.PROJECT_SCOPE || ''
  const notes = `${fields.PROJECT_NOTES || ''} ${installScope}`
  const total = parseCurrency(fields.QUOTATION_TOTAL || fields.TOTAL_AMOUNT)
  const groupCount = productIntelligence?.groupedRows?.length || 0
  const status = opportunity.status || ''
  const paidOrClosed = Boolean(parseContext.fullyPaid) || ['bill', 'invoice', 'receipt'].includes(parseContext.documentType)
  const hasFieldData = Object.values(fields).some(Boolean)
  const installWarning = hasWarning(warnings, /install/i)
  const ventingWarning = hasWarning(warnings, /venting|chimney/i)
  const hasVentingDetail = hasGroup(productIntelligence, ['Venting / Chimney']) || /vent|chimney|gas|electrical|electric|flue/i.test(notes)
  const proposalReadiness = opportunity.proposalReadiness || ''
  const cadenceOpportunity = {
    ...opportunity,
    customerName,
    customerEmail,
    customerPhone,
    quoteDate,
    proposalReadiness,
    status,
    warnings,
  }
  const cadence = cadenceRecommendation || recommendFollowUpCadence({ opportunity: cadenceOpportunity, now })

  return {
    cadence,
    customerEmail,
    customerName,
    customerPhone,
    currentSetupGuidance,
    groupCount,
    hasContact: Boolean(customerEmail || customerPhone),
    hasDisplay: hasDisplayProduct(productIntelligence, warnings),
    hasFinishingDetails: hasGroup(productIntelligence, ['Doors / Screens', 'Trim / Surround', 'Accessories']),
    hasInstallScope: Boolean(installScope) || (!hasFieldData && !installWarning && proposalReadiness === 'ready'),
    hasProductReview: hasWarning(warnings, /product match/i) || Number(productIntelligence?.needsReviewCount || 0) > 0,
    hasSetupBlockers: (currentSetupGuidance.blockers || []).length > 0,
    hasVenting: hasVentingDetail || (!hasFieldData && !ventingWarning && proposalReadiness === 'ready'),
    paidOrClosed,
    playbookId,
    proposalReadiness,
    quoteAgeDays,
    sourceType: opportunity.sourceType || parseContext.sourceType || '',
    status,
    temperature: opportunity.temperature || '',
    total,
    warnings,
  }
}

function choosePackage(context) {
  if (closedStatuses.includes(context.status) || context.paidOrClosed || context.playbookId === 'paid-order-summary') return 'reference-only-guardrail'
  if (!context.customerName || !context.hasContact || !context.hasInstallScope || !context.hasVenting || context.hasProductReview || context.hasSetupBlockers || context.proposalReadiness === 'blocked' || context.cadence.priority === 'blocked') return 'missing-info-preproposal'
  if (context.hasDisplay || context.playbookId === 'display-model-follow-up') return 'display-model-followup'
  if (context.quoteAgeDays !== null && context.quoteAgeDays > 90 || context.playbookId === 'old-quote-re-engagement' || context.cadence.label === 'Soft reactivation') return 'old-quote-refresh'
  if (context.playbookId === 'value-focused-option-comparison' || context.groupCount >= 3) return 'value-comparison'
  if (context.playbookId === 'premium-design-proposal' || context.total >= 8000 || context.hasFinishingDetails && context.temperature === 'hot') return 'premium-design'
  return 'warm-showroom-proposal'
}

function buildWarnings(packageId, context) {
  const warnings = []
  if (!context.customerName) warnings.push('Missing customer identity. Confirm before preparing customer-facing package.')
  if (!context.hasContact) warnings.push('Missing customer contact info. Confirm preferred contact before sending.')
  if (!context.hasInstallScope) warnings.push('Missing install details. Confirm installation scope before final proposal.')
  if (!context.hasVenting) warnings.push('Missing venting/chimney details. Confirm fireplace path before final proposal.')
  if (context.hasProductReview) warnings.push('Product match needs review before presenting selections as confirmed.')
  warnings.push(...(context.currentSetupGuidance.blockers || []))
  warnings.push(...(context.currentSetupGuidance.reviewWarnings || []))
  if (context.quoteAgeDays !== null && context.quoteAgeDays > 90) warnings.push('Customer-facing proposal may need quote refresh before sending.')
  if (context.hasDisplay) warnings.push('Display-model wording requires salesperson confirmation. Do not say the customer viewed it unless approved notes confirm that.')
  if (packageId === 'reference-only-guardrail') warnings.push('Reference-only, closed, archived, or paid/closed record. Do not create an active customer proposal from this package.')
  return [...new Set(warnings)]
}

function buildReasons(packageId, context) {
  const reasons = []
  if (packageId === 'warm-showroom-proposal') reasons.push('Active quote with enough reviewed customer and project context.')
  if (packageId === 'old-quote-refresh') reasons.push('Older quote or soft reactivation cadence.')
  if (packageId === 'value-comparison') reasons.push('Playbook or product groups suggest option comparison.')
  if (packageId === 'premium-design') reasons.push('Project context supports a more design-forward proposal.')
  if (packageId === 'missing-info-preproposal') reasons.push('Critical details need review before a final customer proposal.')
  if ((context.currentSetupGuidance.blockers || []).length) reasons.push('Current setup or goal lens found assumptions to clarify.')
  if (packageId === 'display-model-followup') reasons.push('Display availability may be useful for a safe showroom follow-up.')
  if (packageId === 'reference-only-guardrail') reasons.push('Record should remain internal/reference instead of active outreach.')
  if (context.cadence?.label) reasons.push(`Cadence signal: ${context.cadence.label}`)
  return reasons
}

function exportSafety(packageId, warnings) {
  if (packageId === 'reference-only-guardrail') {
    return { status: 'blocked', label: 'Blocked', blockers: warnings }
  }
  const blockers = warnings.filter((warning) => /Missing customer identity|Missing customer contact|Missing install|Missing venting|Product match|Display-model/i.test(warning))
  if (packageId === 'missing-info-preproposal' && warnings.length) return { status: 'blocked', label: 'Blocked', blockers: warnings }
  if (blockers.length) return { status: 'blocked', label: 'Blocked', blockers }
  if (warnings.length) return { status: 'review-recommended', label: 'Review recommended', blockers: [] }
  return { status: 'ready', label: 'Ready', blockers: [] }
}

function confidence(packageId, warnings) {
  if (packageId === 'reference-only-guardrail') return 'high'
  if (packageId === 'missing-info-preproposal') return warnings.length ? 'high' : 'medium'
  if (warnings.length >= 3) return 'low'
  if (warnings.length) return 'medium'
  return 'high'
}

export function recommendProposalPackage(input = {}) {
  const context = buildContext(input)
  const packageId = choosePackage(context)
  const definition = packageDefinitions[packageId]
  const warnings = buildWarnings(packageId, context)
  const currentSetupChecklist = context.currentSetupGuidance.internalChecklist || []

  return {
    id: packageId,
    label: definition.label,
    purpose: definition.purpose,
    confidence: confidence(packageId, warnings),
    reasons: buildReasons(packageId, context),
    warnings,
    recommendedSections: definition.sections.slice(),
    internalChecklist: [...definition.checklist, ...currentSetupChecklist],
    copyScaffold: safeScaffold(definition.copy),
    exportSafety: exportSafety(packageId, warnings),
    currentSetupImpact: context.currentSetupGuidance.proposalPackageImpact || null,
  }
}

export const proposalPackageVariants = Object.entries(packageDefinitions).map(([id, definition]) => ({
  id,
  label: definition.label,
  purpose: definition.purpose,
}))
