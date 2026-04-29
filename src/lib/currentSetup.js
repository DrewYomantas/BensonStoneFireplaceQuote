export const currentSetupTypes = [
  'unknown',
  'open-face-masonry',
  'masonry-fireplace',
  'zero-clearance-metal-fireplace',
  'direct-vent-gas-fireplace',
  'gas-insert',
  'gas-log-set',
  'wood-insert',
  'wood-stove',
  'gas-stove',
  'pellet-stove',
  'pellet-insert',
  'electric-fireplace',
  'existing-framed-chase',
  'new-construction',
  'other-review-needed',
]

export const customerGoalTags = [
  'more-heat',
  'ambiance',
  'heat-and-ambiance',
  'easier-operation',
  'replace-old-unit',
  'reduce-draft',
  'modernize-look',
  'wood-burning-experience',
  'gas-convenience',
  'electric-simplicity',
  'lower-maintenance',
  'showroom-design',
  'unknown-goal',
]

const sensitivePattern = /average\s*cost|buy\s*price|\bcost\b|\bmargin\b|inventory\s*turn|supplier|product\s*rank|sales\s*rank|sales\s*performance|fuzzy\s*match|needs\s*review|ocr|bistrack/i
const closedStatuses = ['reference-only', 'closed-won', 'closed-lost', 'archived']

function textFromFields(fields = {}) {
  return [
    fields.PROJECT_TITLE,
    fields.PROJECT_OVERVIEW,
    fields.INSTALLATION_SCOPE,
    fields.PROJECT_NOTES,
    fields.PACKAGE_1_TITLE,
    fields.PACKAGE_1_ITEM_1,
    fields.PACKAGE_1_ITEM_2,
    fields.PACKAGE_1_ITEM_3,
    fields.PACKAGE_1_ITEM_4,
    fields.PACKAGE_1_INSTALL_NOTE,
    fields.PACKAGE_2_TITLE,
    fields.PACKAGE_2_ITEM_1,
    fields.PACKAGE_2_ITEM_2,
    fields.PACKAGE_2_ITEM_3,
    fields.PACKAGE_2_ITEM_4,
    fields.PACKAGE_2_INSTALL_NOTE,
    fields.DETAIL_SECTION_1_TITLE,
    fields.DETAIL_SECTION_2_TITLE,
    ...Array.from({ length: 9 }, (_, index) => fields[`DETAIL_1_ITEM_${index + 1}`]),
    ...Array.from({ length: 9 }, (_, index) => fields[`DETAIL_2_ITEM_${index + 1}`]),
  ].filter(Boolean).join(' ')
}

function has(text, pattern) {
  return pattern.test(text)
}

function parseDate(value) {
  if (!value) return null
  const slash = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, month, day, year] = slash
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year)
    const date = new Date(fullYear, Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysSince(value, now) {
  const date = parseDate(value)
  if (!date) return null
  return Math.floor((new Date(now).getTime() - date.getTime()) / 86400000)
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function safeLines(lines) {
  return unique(lines).filter((line) => !sensitivePattern.test(line))
}

function inferSetupType(text) {
  if (!text.trim()) return 'unknown'
  if (has(text, /high\s*efficiency\s*wood|high[-\s]*efficient\s*wood|wood\s*fireplace\s*conversion/i)) return 'other-review-needed'
  if (has(text, /new\s*construction|new\s*build|new\s*framing|new\s*wall/i)) return 'new-construction'
  if (has(text, /zero\s*clearance|factory[-\s]*built|prefab|metal\s*(fireplace|box)/i)) return 'zero-clearance-metal-fireplace'
  if (has(text, /open[-\s]*face|open\s*hearth/i) && has(text, /masonry|brick|block|stone/i)) return 'open-face-masonry'
  if (has(text, /masonry|brick|block|stone|clay\s*tile/i) && has(text, /fireplace|chimney|hearth/i)) return 'masonry-fireplace'
  if (has(text, /framed\s*chase|existing\s*chase|bump[-\s]*out|exterior\s*chase/i)) return 'existing-framed-chase'
  if (has(text, /pellet\s*insert/i)) return 'pellet-insert'
  if (has(text, /pellet\s*stove/i)) return 'pellet-stove'
  if (has(text, /wood\s*insert/i)) return 'wood-insert'
  if (has(text, /gas\s*insert/i)) return 'gas-insert'
  if (has(text, /gas\s*log|log\s*set/i)) return 'gas-log-set'
  if (has(text, /direct\s*vent/i)) return 'direct-vent-gas-fireplace'
  if (has(text, /wood\s*stove/i)) return 'wood-stove'
  if (has(text, /gas\s*stove/i)) return 'gas-stove'
  if (has(text, /electric\s*fireplace|electric\s*unit|electric\s*insert/i)) return 'electric-fireplace'
  return 'unknown'
}

function inferGoals(text) {
  const goals = []
  const heat = has(text, /more\s*heat|heat(?!ilator)|warm|primary\s*heat|supplemental\s*heat|cold\s*room/i)
  const ambiance = has(text, /ambiance|look\s*of\s*fire|flame|aesthetic|decorative/i)
  if (heat && ambiance) goals.push('heat-and-ambiance')
  else if (heat) goals.push('more-heat')
  else if (ambiance) goals.push('ambiance')
  if (has(text, /remote|easier|easy\s*operation|switch|thermostat/i)) goals.push('easier-operation')
  if (has(text, /replace|old\s*unit|existing\s*unit|upgrade/i)) goals.push('replace-old-unit')
  if (has(text, /draft|cold\s*air|cold\s*draft/i)) goals.push('reduce-draft')
  if (has(text, /modern|update|modernize|surround|trim|finish/i)) goals.push('modernize-look')
  if (has(text, /wood\s*burn|wood[-\s]*burning|real\s*wood/i)) goals.push('wood-burning-experience')
  if (has(text, /gas\s*convenience|natural\s*gas|propane|lp\b|gas\s*line/i)) goals.push('gas-convenience')
  if (has(text, /electric|outlet|plug/i)) goals.push('electric-simplicity')
  if (has(text, /maintenance|less\s*mess|lower\s*maintenance/i)) goals.push('lower-maintenance')
  if (has(text, /showroom|design|finish\s*selection/i)) goals.push('showroom-design')
  return goals.length ? unique(goals) : ['unknown-goal']
}

function suggestedPaths(setupType, goals, text) {
  const paths = []
  if (setupType === 'masonry-fireplace' || setupType === 'open-face-masonry') paths.push('Insert path may fit after masonry and chimney details are confirmed.')
  if (setupType === 'zero-clearance-metal-fireplace') paths.push('Factory-built fireplace path needs model, chase, and venting review.')
  if (setupType === 'electric-fireplace') paths.push('Electric path may fit after depth, framing, and power are confirmed.')
  if (setupType === 'existing-framed-chase' || setupType === 'new-construction') paths.push('Framing/chase coordination should be reviewed before final proposal.')
  if (setupType === 'gas-log-set') paths.push('Gas log path may fit ambiance goals, but heat and draft expectations need review.')
  if (goals.includes('more-heat') || goals.includes('heat-and-ambiance')) paths.push('Heat-focused solution path should be reviewed before assuming an ambiance-first appliance.')
  if (has(text, /gas|propane|lp|natural\s*gas/i)) paths.push('Gas path needs fuel type and line availability confirmed.')
  if (!paths.length) paths.push('Clarification path first, then choose the proposal package.')
  return safeLines(paths)
}

function buildBlockers({ setupType, goals, text, quoteAgeDays, status }) {
  const blockers = []
  const saysInsert = has(text, /\binsert\b/i)
  const masonryConfirmed = ['open-face-masonry', 'masonry-fireplace'].includes(setupType)
  const zeroClearanceKnown = setupType === 'zero-clearance-metal-fireplace'
  const fuelMentioned = has(text, /gas|propane|lp\b|natural\s*gas|wood|pellet|electric/i)
  const gasMentioned = has(text, /gas|propane|lp\b|natural\s*gas/i)
  const electricMentioned = has(text, /electric|outlet|plug|switch/i)
  const ventingKnown = has(text, /vent|chimney|liner|flue|direct\s*vent|exhaust/i)
  const exteriorCoordination = has(text, /siding|framing|drywall|chase|bump[-\s]*out|exterior/i)
  const heatGoal = goals.includes('more-heat') || goals.includes('heat-and-ambiance')
  const ambianceFirst = has(text, /gas\s*log|log\s*set|decorative|ambiance|electric/i)

  if (closedStatuses.includes(status)) blockers.push('Closed/reference record. Keep setup lens internal unless the opportunity is reopened intentionally.')
  if (saysInsert && (setupType === 'unknown' || (!masonryConfirmed && !zeroClearanceKnown))) blockers.push('Customer says insert, but the existing fireplace type is unclear.')
  if (setupType === 'unknown') blockers.push('Current appliance type is unknown.')
  if (saysInsert && !masonryConfirmed && !zeroClearanceKnown) blockers.push('Confirm whether the existing fireplace is masonry or a metal fireplace box before quoting an insert path.')
  if (!ventingKnown && setupType !== 'electric-fireplace') blockers.push('Chimney or venting path is unknown.')
  if (!fuelMentioned) blockers.push('Fuel type is unknown.')
  if (gasMentioned && !has(text, /natural\s*gas|\bng\b|propane|\blp\b/i)) blockers.push('Natural gas vs propane is unknown.')
  if ((electricMentioned || setupType === 'electric-fireplace') && !has(text, /outlet|switch|power|electrical|electrician/i)) blockers.push('Electrical availability is unknown.')
  if (setupType === 'electric-fireplace' && !has(text, /depth|framing|opening|wall|chase/i)) blockers.push('Electric unit requested, but depth/framing is unknown.')
  if (exteriorCoordination) blockers.push('Exterior chase, siding, framing, or drywall coordination must be clarified.')
  if (quoteAgeDays !== null && quoteAgeDays > 90) blockers.push('Older quote may need field verification before proposal/export.')
  if (heatGoal && ambianceFirst) blockers.push('Customer wants heat, but the selected path may be ambiance-first. Set expectations before proposal.')
  if (setupType === 'electric-fireplace' && heatGoal) blockers.push('Electric heat expectations should be reviewed carefully with the customer.')
  if (has(text, /wood\s*insert/i) && !masonryConfirmed) blockers.push('Wood insert path requires masonry fireplace confirmation.')
  if (has(text, /gas\s*log|log\s*set/i) && has(text, /draft|cold\s*air/i)) blockers.push('Gas log path with draft/cold-air concerns may require insert discussion.')
  if (has(text, /high\s*efficiency\s*wood|wood\s*fireplace\s*conversion/i) && gasMentioned) blockers.push('High-efficiency wood fireplace conversion must be reviewed before assuming a gas conversion path.')
  return safeLines(blockers)
}

function buildWarnings(setupType, blockers) {
  const warnings = []
  if (setupType === 'zero-clearance-metal-fireplace') warnings.push('Zero-clearance metal fireplace path needs model, framing, and venting review.')
  if (setupType === 'other-review-needed') warnings.push('Current setup may involve a special conversion path. Review before proposal.')
  if (blockers.length) warnings.push('Current setup blockers should be clarified before final proposal/export.')
  return safeLines(warnings)
}

function buildQuestions(blockers, goals) {
  const questions = []
  if (blockers.some((blocker) => /masonry|metal fireplace box|insert|appliance type/i.test(blocker))) {
    questions.push('Just to make sure we are looking at the right path, is the existing fireplace masonry brick/block or a metal fireplace box?')
  }
  if (goals.includes('unknown-goal') || goals.some((goal) => ['more-heat', 'ambiance', 'heat-and-ambiance'].includes(goal))) {
    questions.push('Are you mainly looking for more heat, the look and feel of a fire, or both?')
  }
  if (blockers.some((blocker) => /gas|fuel type/i.test(blocker))) {
    questions.push('Do you currently have gas at the fireplace, and is it natural gas or propane?')
  }
  if (blockers.some((blocker) => /Electrical|Electric/i.test(blocker))) {
    questions.push('Is there already an outlet or switch near the fireplace?')
  }
  if (blockers.some((blocker) => /depth|framing|opening|wall|chase/i.test(blocker))) {
    questions.push('Are you hoping to keep the existing opening, or are you planning to change the wall/chase area?')
  }
  if (blockers.some((blocker) => /siding|framing|drywall|exterior|chase/i.test(blocker))) {
    questions.push('Is any siding, framing, drywall, or exterior chase work already planned?')
  }
  if (!questions.length) questions.push('Is there anything about the existing fireplace or your goals that we should confirm before finalizing the proposal?')
  return safeLines(questions)
}

function confidence(setupType, blockers) {
  if (setupType === 'unknown') return 'low'
  if (blockers.length >= 3) return 'low'
  if (blockers.length) return 'medium'
  return 'high'
}

export function evaluateCurrentSetup({
  fields = {},
  opportunity = {},
  parseContext = {},
  now = new Date(),
} = {}) {
  const text = textFromFields(fields)
  const normalizedText = text.toLowerCase()
  const setupType = inferSetupType(normalizedText)
  const goals = inferGoals(normalizedText)
  const quoteDate = opportunity.quoteDate || fields.QUOTE_DATE || ''
  const quoteAgeDays = daysSince(quoteDate, now)
  const status = opportunity.status || (parseContext.fullyPaid ? 'reference-only' : '')
  const blockers = buildBlockers({ setupType, goals, text: normalizedText, quoteAgeDays, status })
  const reviewWarnings = buildWarnings(setupType, blockers)
  const questions = buildQuestions(blockers, goals)
  const checklist = safeLines([
    'Confirm what is currently in the fireplace opening.',
    'Confirm customer goal: heat, ambiance, or both.',
    'Confirm fuel type and venting path before final proposal.',
    blockers.some((blocker) => /framing|siding|drywall|chase/i.test(blocker)) ? 'Coordinate exterior/framing scope before final proposal.' : '',
    blockers.some((blocker) => /field verification|Older quote/i.test(blocker)) ? 'Field verify older quote conditions before customer-facing proposal.' : '',
  ])

  return {
    currentSetupType: setupType,
    confidence: confidence(setupType, blockers),
    customerGoalTags: goals,
    suggestedSolutionPaths: suggestedPaths(setupType, goals, normalizedText),
    blockers,
    reviewWarnings,
    clarificationQuestions: questions,
    internalChecklist: checklist,
    proposalPackageImpact: {
      recommendedPackageId: blockers.length ? 'missing-info-preproposal' : '',
      exportSafety: closedStatuses.includes(status) ? 'blocked' : blockers.length ? 'blocked' : 'ready',
      reason: blockers.length ? 'Clarify current setup and goals before final package/export.' : 'No setup-specific package blocker.',
    },
  }
}
