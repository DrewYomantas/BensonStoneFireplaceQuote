export const proposalPlaybooks = [
  {
    id: 'warm-showroom-recap',
    name: 'Warm Showroom Recap',
    label: 'Warm Showroom Recap',
    leadTemperatureFit: 'Warm',
    whenToUse: 'Recent, mostly complete quote with confident product context and an active project.',
    goal: 'Recap the fireplace conversation and frame the proposal as the next step.',
    customerFacingAngle: 'Friendly showroom follow-up',
    requiredReviewState: 'Reviewed quote source, customer identity/contact, project scope, and product matches.',
    customerFacingSafe: true,
    copyScaffold: [
      'Thanks again for taking the time to discuss your fireplace project with us.',
      'I put together this proposal based on the details we reviewed.',
      'The next step is confirming the final installation details and any finish selections.',
    ],
  },
  {
    id: 'old-quote-re-engagement',
    name: 'Old Quote Re-Engagement',
    label: 'Old Quote Re-Engagement',
    leadTemperatureFit: 'Cold',
    whenToUse: 'Older quote with no obvious paid or closed status.',
    goal: 'Restart the conversation without pressure or stale-pricing claims.',
    customerFacingAngle: 'Soft quote refresh',
    requiredReviewState: 'Reviewed customer identity and manual confirmation that pricing or availability may need refresh.',
    customerFacingSafe: true,
    copyScaffold: [
      'I wanted to follow up on the fireplace quote we had started.',
      'If this project is still on your mind, we would be happy to revisit the details with you.',
      'Some product availability or pricing may need to be refreshed before finalizing.',
    ],
  },
  {
    id: 'value-focused-option-comparison',
    name: 'Value-Focused Option Comparison',
    label: 'Value-Focused Option Comparison',
    leadTemperatureFit: 'Warm',
    whenToUse: 'Multiple product groups or options are present and the customer may need help comparing paths.',
    goal: 'Help the salesperson explain tradeoffs without exposing internal pricing or margin data.',
    customerFacingAngle: 'Good / better / best discussion',
    requiredReviewState: 'Reviewed option structure, totals, and salesperson-written tradeoff notes.',
    customerFacingSafe: true,
    copyScaffold: [
      'I outlined the main fireplace options so you can compare the paths side by side.',
      'Each option can be adjusted around finish selections, installation details, and your preferred timeline.',
      'We can walk through the tradeoffs together before anything is finalized.',
    ],
  },
  {
    id: 'premium-design-proposal',
    name: 'Premium Design Proposal',
    label: 'Premium Design Proposal',
    leadTemperatureFit: 'Hot',
    whenToUse: 'High-value or design-heavy quote with fireplace unit plus finishing details.',
    goal: 'Present the project as a polished showroom/design proposal.',
    customerFacingAngle: 'Design-forward fireplace proposal',
    requiredReviewState: 'Reviewed selections, finish details, install scope, and customer-ready project copy.',
    customerFacingSafe: true,
    copyScaffold: [
      'This proposal brings together the fireplace, finishing details, and installation scope for your project.',
      'The selections are organized so you can see how the full fireplace package comes together.',
      'We can refine final finishes and installation details before approval.',
    ],
  },
  {
    id: 'missing-info-clarification',
    name: 'Missing-Info Clarification',
    label: 'Missing-Info Clarification',
    leadTemperatureFit: 'Needs Review',
    whenToUse: 'Customer contact, installation scope, venting/chimney/gas/electrical details, or product matches need review.',
    goal: 'Ask for missing details before sending a polished customer proposal.',
    customerFacingAngle: 'Clarify before final proposal',
    requiredReviewState: 'Internal review of missing fields and project questions.',
    customerFacingSafe: true,
    copyScaffold: [
      'Before we finalize this proposal, we would like to confirm a few project details.',
      'That helps us make sure the fireplace, venting, and installation path are quoted correctly.',
      'Once those details are confirmed, we can prepare the finished proposal for review.',
    ],
  },
  {
    id: 'display-model-follow-up',
    name: 'Display Model Follow-Up',
    label: 'Display Model Follow-Up',
    leadTemperatureFit: 'Warm',
    whenToUse: 'One or more exact product matches are marked on display.',
    goal: 'Reference showroom availability carefully without claiming what the customer saw.',
    customerFacingAngle: 'Showroom display availability',
    requiredReviewState: 'Confirm display status and avoid saying the customer viewed the model unless notes prove it.',
    customerFacingSafe: true,
    copyScaffold: [
      'This model is available to view in our showroom.',
      'If you would like another look at the fireplace or finish details, we would be happy to walk through it with you.',
      'We can confirm final selections and installation details before moving forward.',
    ],
  },
  {
    id: 'paid-order-summary',
    name: 'Paid Order Summary',
    label: 'Paid Order Summary',
    leadTemperatureFit: 'Closed / Paid',
    whenToUse: 'Order is paid or balance due is zero.',
    goal: 'Thank the customer and recap order/service details without treating it as a sales proposal.',
    customerFacingAngle: 'Order confirmation',
    requiredReviewState: 'Reviewed paid/closed source.',
    customerFacingSafe: true,
    copyScaffold: [
      'Thank you for your order.',
      'This summary recaps the project details currently on file.',
      'Please contact us if anything needs to be adjusted before the next scheduled step.',
    ],
  },
  {
    id: 'internal-install-review',
    name: 'Internal Install Review',
    label: 'Internal Install Review',
    leadTemperatureFit: 'Internal',
    whenToUse: 'Field measure sheets, install job sheets, photos, or handwritten support pages.',
    goal: 'Prepare internal install/support context.',
    customerFacingAngle: 'Internal only',
    requiredReviewState: 'Internal support source reviewed by staff.',
    customerFacingSafe: false,
    copyScaffold: [],
  },
]

const sensitiveTerms = [
  /average\s*cost/i,
  /\bbuy\s*price\b/i,
  /\bcost\b/i,
  /\bmargin\b/i,
  /inventory\s*turn/i,
  /supplier/i,
  /\brank\b/i,
  /sales\s*performance/i,
  /fuzzy\s*match/i,
  /needs\s*review/i,
  /ocr/i,
  /bistrack/i,
]

function findPlaybook(id) {
  return proposalPlaybooks.find((playbook) => playbook.id === id) || proposalPlaybooks[0]
}

function parseCurrency(value) {
  const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function parseQuoteDate(value, now) {
  if (!value) return null
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) return null
  const [, month, day, year] = match
  const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year)
  const date = new Date(fullYear, Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((now.getTime() - date.getTime()) / 86400000)
}

function hasAnyGroup(productIntelligence, groups) {
  return (productIntelligence?.groupedRows || []).some((section) => groups.includes(section.group))
}

function hasOnDisplay(productIntelligence) {
  return (productIntelligence?.rows || []).some((row) =>
    row.match?.matchType === 'exact' && (row.badges || []).includes('On Display')
  )
}

function getProductReviewCount(productIntelligence) {
  return Number(productIntelligence?.needsReviewCount || 0)
}

function hasSensitiveCopy(scaffold) {
  return scaffold.some((line) => sensitiveTerms.some((pattern) => pattern.test(line)))
}

function buildWarnings({ fields, parseContext, productIntelligence, quoteAgeDays, selectedPlaybookId }) {
  const warnings = []
  const productReviewCount = getProductReviewCount(productIntelligence)
  const phoneMissing = !fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE
  const installMissing = !fields.INSTALLATION_SCOPE
  const ventingMissing = !hasAnyGroup(productIntelligence, ['Venting / Chimney']) && !/vent|chimney|gas|electrical|electric|flue/i.test(`${fields.INSTALLATION_SCOPE || ''} ${fields.PROJECT_NOTES || ''}`)
  const paidOrClosed = Boolean(parseContext?.fullyPaid) || ['bill', 'invoice', 'receipt'].includes(parseContext?.documentType)

  if (productReviewCount) warnings.push('Product match needs review before presenting selections as confirmed.')
  if (phoneMissing) warnings.push('Missing customer email or phone. Confirm preferred contact before sending.')
  if (installMissing) warnings.push('Missing install details. Confirm installation scope before final proposal.')
  if (ventingMissing) warnings.push('Missing venting/chimney details. Confirm fireplace path before final proposal.')
  if (paidOrClosed && selectedPlaybookId !== 'paid-order-summary') warnings.push('Quote appears paid/closed/reference. Do not treat it as an active proposal without confirmation.')
  if (quoteAgeDays !== null && quoteAgeDays > 90) warnings.push('Customer-facing proposal may need quote refresh before sending.')
  if (hasOnDisplay(productIntelligence)) warnings.push('Display-model wording requires salesperson confirmation. Do not say the customer viewed it unless approved notes confirm that.')
  warnings.push('Sensitive BisTrack fields excluded from customer export.')

  return warnings
}

function choosePlaybook({ fields, parseContext, productIntelligence, quoteAgeDays, quoteMeta }) {
  const productReviewCount = getProductReviewCount(productIntelligence)
  const groupCount = productIntelligence?.groupedRows?.length || 0
  const total = parseCurrency(fields.QUOTATION_TOTAL || fields.TOTAL_AMOUNT)
  const phoneMissing = !fields.CUSTOMER_PHONE && !fields.PROJECT_PHONE
  const installMissing = !fields.INSTALLATION_SCOPE
  const paidOrClosed = Boolean(parseContext?.fullyPaid) || ['bill', 'invoice', 'receipt'].includes(parseContext?.documentType)
  const display = hasOnDisplay(productIntelligence)
  const hasFireplaceUnit = hasAnyGroup(productIntelligence, ['Fireplace Unit'])
  const hasDesignDetails = hasAnyGroup(productIntelligence, ['Doors / Screens', 'Trim / Surround', 'Accessories'])

  if (paidOrClosed) return 'paid-order-summary'
  if (phoneMissing || installMissing || productReviewCount > 0) return 'missing-info-clarification'
  if (quoteAgeDays !== null && quoteAgeDays > 90) return 'old-quote-re-engagement'
  if (display) return 'display-model-follow-up'
  if (groupCount >= 3 && (quoteMeta?.customerTemperature === 'price-sensitive' || total !== null)) return 'value-focused-option-comparison'
  if ((total !== null && total >= 8000) || (hasFireplaceUnit && hasDesignDetails)) return 'premium-design-proposal'
  return 'warm-showroom-recap'
}

function buildReasons({ id, fields, productIntelligence, quoteAgeDays }) {
  const reasons = []
  const productReviewCount = getProductReviewCount(productIntelligence)
  const groupCount = productIntelligence?.groupedRows?.length || 0

  if (id === 'warm-showroom-recap') {
    if (quoteAgeDays !== null && quoteAgeDays <= 30) reasons.push('Recent quote')
    if (fields.CUSTOMER_NAME && (fields.CUSTOMER_PHONE || fields.PROJECT_PHONE)) reasons.push('Customer contact info present')
    if (productReviewCount === 0 && (productIntelligence?.rows || []).length) reasons.push('Product matches are confident')
  }
  if (id === 'old-quote-re-engagement') reasons.push('Quote appears older')
  if (id === 'missing-info-clarification') reasons.push('Missing or uncertain details need review before customer-facing proposal')
  if (id === 'display-model-follow-up') reasons.push('At least one matched product is marked on display')
  if (id === 'value-focused-option-comparison') reasons.push(`${groupCount} product groups are available for comparison`)
  if (id === 'premium-design-proposal') reasons.push('Quote has design-heavy fireplace selections or higher project value')
  if (id === 'paid-order-summary') reasons.push('Source appears paid, closed, or reference-oriented')
  if (!reasons.length) reasons.push('Best available fit from reviewed quote context')

  return reasons
}

function confidenceFor(id, warnings) {
  const majorWarnings = warnings.filter((warning) => !/Sensitive BisTrack fields/i.test(warning))
  if (id === 'missing-info-clarification') return majorWarnings.length > 0 ? 'high' : 'medium'
  if (majorWarnings.length >= 3) return 'low'
  if (majorWarnings.length) return 'medium'
  return 'high'
}

export function buildCustomerFacingPlaybookCopy(playbook) {
  const scaffold = playbook?.copyScaffold || []
  if (hasSensitiveCopy(scaffold)) return []
  return scaffold.slice()
}

export function recommendProposalPlaybook({ fields = {}, parseContext = {}, productIntelligence = {}, quoteMeta = {} }) {
  const now = quoteMeta.now ? new Date(quoteMeta.now) : new Date()
  const quoteAgeDays = parseQuoteDate(fields.QUOTE_DATE, now)
  const id = choosePlaybook({ fields, parseContext, productIntelligence, quoteAgeDays, quoteMeta })
  const playbook = findPlaybook(id)
  const warnings = buildWarnings({
    fields,
    parseContext,
    productIntelligence,
    quoteAgeDays,
    selectedPlaybookId: quoteMeta.selectedPlaybookId,
  })
  const copyScaffold = buildCustomerFacingPlaybookCopy(playbook)

  return {
    id: playbook.id,
    label: playbook.label || playbook.name,
    confidence: confidenceFor(playbook.id, warnings),
    reasons: buildReasons({ id: playbook.id, fields, productIntelligence, quoteAgeDays }),
    warnings,
    customerFacingAngle: playbook.customerFacingAngle,
    copyScaffold,
    otherPlaybooks: proposalPlaybooks
      .filter((candidate) => candidate.id !== playbook.id)
      .map((candidate) => ({
        id: candidate.id,
        label: candidate.label || candidate.name,
        customerFacingSafe: candidate.customerFacingSafe,
      })),
  }
}
