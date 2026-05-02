export function opportunityToQuoteFields(opportunity) {
  return {
    PROJECT_TITLE: opportunity.projectTitle || '',
    PROJECT_SCOPE_SUMMARY: opportunity.productsNotes || '',
    PROJECT_NOTES: opportunity.desiredOutcome || '',
    INSTALLATION_SCOPE: opportunity.existingSetup || '',
  }
}

export function getWorkspaceSourceSummary(opportunity) {
  const sourceType = opportunity.sourceType || ''
  const isActive = sourceType === 'quote-polish'
  const isBulk = sourceType.startsWith('bulk-')
  const isManual = sourceType === 'manual'
  const isUploaded = !isActive && !isBulk && !isManual && opportunity.recoverySource === 'true'

  let sourceTypeLabel = 'Unknown Source'
  if (isActive) sourceTypeLabel = 'Active BisTrack Quote'
  else if (isManual) sourceTypeLabel = 'Manual Recovery Entry'
  else if (isBulk) sourceTypeLabel = 'Bulk Uploaded Old Quote'
  else if (isUploaded) sourceTypeLabel = 'Uploaded Old Quote'
  else if (opportunity.recoverySource === 'true') sourceTypeLabel = 'Recovered Quote'

  const sourceLabel = opportunity.sourceLabel || ''
  const sourceDate = opportunity.sourceImportedAt || opportunity.createdAt || ''
  const safeFileName = (opportunity.sourceFileName || '')
    .replace(/[/\\]/g, '…')
    .replace(/^[A-Za-z]:/, '')
    .replace(/^\.\.\./, '')

  return {
    sourceTypeLabel,
    sourceLabel,
    sourceDate,
    safeFileName,
    isActive,
    isManual,
    isUploaded,
    isBulk,
    isRecovery: opportunity.recoverySource === 'true' && !isActive,
  }
}

export function getWorkspaceReadinessWarnings(opportunity) {
  const warnings = []

  if (!opportunity.customerEmail && !opportunity.customerPhone) {
    warnings.push('Missing contact info — confirm email or phone before any outreach.')
  }
  if (opportunity.lineItemQuoteAttached === 'false') {
    warnings.push('Attached line-item quote not yet confirmed.')
  }
  if (opportunity.needsRefresh === 'true') {
    warnings.push('Old quote — refresh pricing and availability before customer outreach.')
  }
  if (['paid-closed', 'reference-only'].includes(opportunity.recoveryClassification)) {
    warnings.push('Reference or closed record — do not treat as an active proposal without confirmation.')
  }
  if (opportunity.reviewedForFollowUp === 'false') {
    warnings.push('Not yet reviewed for follow-up — verify field accuracy before drafting outreach.')
  }
  if (opportunity.status === 'needs-review') {
    warnings.push('Needs review before proposal or follow-up.')
  }

  const safe = (opportunity.warnings || []).filter(
    (w) => !/Sensitive BisTrack fields/i.test(w),
  )
  for (const w of safe) {
    if (!warnings.some((ex) => ex.slice(0, 40) === w.slice(0, 40))) {
      warnings.push(w)
    }
  }

  return warnings
}

export function getWorkspaceProposalPanel(opportunity) {
  if (opportunity.sourceType !== 'quote-polish') {
    return {
      isActive: false,
      readinessLabel: '',
      readinessTone: 'neutral',
      modeLabel: '',
      lineItemState: '',
      nextStep: 'Refresh quote with current BisTrack pricing before proposing.',
    }
  }

  const reviewState = opportunity.proposalReviewState || 'unresolved'
  const readinessLabel =
    reviewState === 'reviewed'
      ? 'Reviewed — Okay to Send'
      : reviewState === 'follow-up'
        ? 'Follow-Up Questions Needed'
        : 'Unresolved — Review Before Sending'
  const readinessTone =
    reviewState === 'reviewed' ? 'ready' : reviewState === 'follow-up' ? 'warning' : 'blocked'

  const modeLabel =
    opportunity.proposalMode === 'detailed'
      ? 'Detailed Investment Breakdown'
      : opportunity.proposalMode === 'summary'
        ? 'Warm Summary'
        : 'Mode not set'

  const lineItemState =
    opportunity.lineItemQuoteAttached === 'true'
      ? 'Line-item quote confirmed attached.'
      : 'Line-item quote attachment not yet confirmed.'

  const allGood = reviewState === 'reviewed' && opportunity.lineItemQuoteAttached === 'true'
  const nextStep = allGood
    ? 'Ready — attach line-item quote and send proposal.'
    : reviewState === 'reviewed'
      ? 'Confirm line-item quote is attached before sending.'
      : 'Complete proposal readiness review before sending.'

  return { isActive: true, readinessLabel, readinessTone, modeLabel, lineItemState, nextStep }
}

export function getWorkspaceVendorRef(matchedVendors) {
  if (!matchedVendors || !matchedVendors.length) {
    return { hasVendors: false, vendors: [] }
  }
  return {
    hasVendors: true,
    vendors: matchedVendors.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      priceListDate: v.priceListDate || '',
    })),
  }
}
