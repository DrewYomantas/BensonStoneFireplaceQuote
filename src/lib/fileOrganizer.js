const closedStatuses = new Set(['closed-won', 'closed-lost', 'reference-only', 'archived'])

function haystackForOpportunity(item = {}) {
  return [
    item.customerName,
    item.customerPhone,
    item.customerEmail,
    item.quoteNumber,
    item.quoteDate,
    item.projectType,
    item.projectTitle,
    item.sourceFileName,
    item.sourceLabel,
    item.status,
    item.nextAction,
  ].filter(Boolean).join(' ').toLowerCase()
}

function haystackForCustomerFile(file = {}) {
  return [
    file.customerName,
    file.customerPhone,
    file.customerEmail,
    file.projectAddress,
    file.customerGoal,
    file.likelyPath,
    file.existingApplianceType,
    file.existingFuelType,
    file.opportunityId,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function isArchivedOpportunity(opportunity = {}) {
  return opportunity.status === 'archived'
}

export function isClosedOrReferenceOpportunity(opportunity = {}) {
  return closedStatuses.has(opportunity.status)
}

export function isArchivedCustomerFile(file = {}) {
  return Boolean(file.archivedAt)
}

export function isActiveOpportunity(opportunity = {}) {
  return !isArchivedOpportunity(opportunity)
}

export function isActiveCustomerFile(file = {}) {
  return !isArchivedCustomerFile(file)
}

export function summarizeWorkbenchRecords({ opportunities = [], customerFiles = [] } = {}) {
  const activeOpportunities = opportunities.filter((item) => !isArchivedOpportunity(item))
  const archivedOpportunities = opportunities.filter(isArchivedOpportunity)
  const activeCustomerFiles = customerFiles.filter((file) => !isArchivedCustomerFile(file))
  const archivedCustomerFiles = customerFiles.filter(isArchivedCustomerFile)

  return {
    active: activeOpportunities.length + activeCustomerFiles.length,
    archived: archivedOpportunities.length + archivedCustomerFiles.length,
    quotes: opportunities.length,
    visits: customerFiles.length,
    ready: opportunities.filter((item) => item.status === 'ready-for-proposal').length,
    needsReview: opportunities.filter((item) => ['needs-review', 'blocked-missing-info'].includes(item.status)).length,
    followUp: opportunities.filter((item) => ['follow-up-needed', 'waiting-on-customer'].includes(item.status)).length,
  }
}

function sortNewest(first = {}, second = {}) {
  const a = new Date(first.updatedAt || first.createdAt || first.quoteDate || 0).getTime()
  const b = new Date(second.updatedAt || second.createdAt || second.quoteDate || 0).getTime()
  return b - a
}

export function deriveTodayWorkbench({ opportunities = [], customerFiles = [] } = {}) {
  const activeOpportunities = opportunities.filter(isActiveOpportunity)
  const activeCustomerFiles = customerFiles.filter(isActiveCustomerFile)

  const importsNeedingReview = activeOpportunities
    .filter((item) => ['new-intake', 'needs-review', 'blocked-missing-info'].includes(item.status))
    .sort(sortNewest)

  const activeCustomerWork = activeCustomerFiles
    .filter((file) => !file.archivedAt)
    .sort(sortNewest)

  const followUpItems = [
    ...activeOpportunities
      .filter((item) => ['follow-up-needed', 'waiting-on-customer'].includes(item.status))
      .map((item) => ({ kind: 'opportunity', id: item.id, record: item })),
    ...activeCustomerFiles
      .filter((file) => (file.followUpTasks || []).some((task) => !task.doneAt) || file.packetSentAt)
      .map((file) => ({ kind: 'customer-file', id: file.id, record: file })),
  ].sort((first, second) => sortNewest(first.record, second.record))

  const readyItems = [
    ...activeOpportunities
      .filter((item) => item.status === 'ready-for-proposal')
      .map((item) => ({ kind: 'opportunity', id: item.id, record: item })),
    ...activeCustomerFiles
      .filter((file) => file.packetGeneratedAt || (file.opportunityId && file.lineItemQuoteIncluded === 'true' && file.customerGoal))
      .map((file) => ({ kind: 'customer-file', id: file.id, record: file })),
  ].sort((first, second) => sortNewest(first.record, second.record))

  const recentItems = [
    ...activeOpportunities.map((item) => ({ kind: 'opportunity', id: item.id, record: item })),
    ...activeCustomerFiles.map((file) => ({ kind: 'customer-file', id: file.id, record: file })),
  ]
    .sort((first, second) => sortNewest(first.record, second.record))
    .slice(0, 6)

  return {
    importsNeedingReview,
    activeCustomerWork,
    followUpItems,
    readyItems,
    recentItems,
  }
}

function makeDuplicateKey(parts = []) {
  return parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
}

export function findPossibleDuplicates({ opportunities = [], customerFiles = [] } = {}) {
  const buckets = new Map()

  const add = (key, item) => {
    if (!key) return
    const existing = buckets.get(key) || []
    existing.push(item)
    buckets.set(key, existing)
  }

  for (const item of opportunities) {
    add(makeDuplicateKey(['quote', item.quoteNumber]), { kind: 'opportunity', record: item, reason: 'Same quote number' })
    add(makeDuplicateKey(['customer-quote', item.customerName, item.quoteDate, item.originalQuoteAmount || item.quotationTotal]), {
      kind: 'opportunity',
      record: item,
      reason: 'Same customer, date, and total',
    })
  }

  for (const file of customerFiles) {
    add(makeDuplicateKey(['visit', file.customerName, file.customerPhone || file.customerEmail]), {
      kind: 'customer-file',
      record: file,
      reason: 'Same customer contact',
    })
    add(makeDuplicateKey(['linked-opportunity', file.opportunityId]), {
      kind: 'customer-file',
      record: file,
      reason: 'Same linked quote',
    })
  }

  return [...buckets.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      reason: group[0].reason,
      items: group.sort((first, second) => sortNewest(first.record, second.record)),
    }))
    .sort((first, second) => second.items.length - first.items.length)
}

export function filterWorkbenchRecords({ opportunities = [], customerFiles = [] } = {}, { view = 'active', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase()
  const matchOpportunity = (item) => !q || haystackForOpportunity(item).includes(q)
  const matchCustomerFile = (file) => !q || haystackForCustomerFile(file).includes(q)

  let opps = opportunities
  let files = customerFiles

  if (view === 'active') {
    opps = opps.filter((item) => !isArchivedOpportunity(item))
    files = files.filter((file) => !isArchivedCustomerFile(file))
  } else if (view === 'archive') {
    opps = opps.filter(isArchivedOpportunity)
    files = files.filter(isArchivedCustomerFile)
  } else if (view === 'quotes') {
    files = []
  } else if (view === 'visits') {
    opps = []
  } else if (view === 'followup') {
    opps = opps.filter((item) => ['follow-up-needed', 'waiting-on-customer'].includes(item.status))
    files = files.filter((file) => !isArchivedCustomerFile(file) && /follow/i.test(`${file.lifecycleStage || ''} ${file.handoffState || ''}`))
  } else if (view === 'review') {
    opps = opps.filter((item) => ['needs-review', 'blocked-missing-info', 'new-intake'].includes(item.status))
    files = files.filter((file) => !isArchivedCustomerFile(file))
  }

  return {
    opportunities: opps.filter(matchOpportunity),
    customerFiles: files.filter(matchCustomerFile),
  }
}
