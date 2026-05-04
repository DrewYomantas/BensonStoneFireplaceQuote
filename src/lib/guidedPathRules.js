const text = (...parts) => parts.map((part) => String(part || '').toLowerCase()).join(' ')
const hasAny = (haystack, terms) => terms.some((term) => haystack.includes(term))
const isTrue = (value) => String(value || '').toLowerCase() === 'true'

function evidenceFor(file = {}) {
  const hay = text(
    file.existingApplianceType,
    file.existingFuelType,
    file.existingNotes,
    file.existingVentingNotes,
    file.customerGoal,
    file.goalNotes,
    file.customerPainPoints,
    file.likelyPath,
  )
  return {
    hay,
    isMasonry: hasAny(hay, ['masonry', 'brick fireplace', 'open fireplace', 'wood fireplace']) || (file.existingApplianceType === 'fireplace' && file.existingFuelType !== 'electric'),
    isPrefabOrZc: hasAny(hay, ['prefab', 'pre-fab', 'zero clearance', 'zero-clearance', 'zc ', ' zc', 'factory-built', 'factory built']) || file.existingApplianceType === 'prefab' || file.existingApplianceType === 'zero-clearance',
    wantsHeat: hasAny(hay, ['more heat', 'heat', 'warm', 'warmer', 'efficient', 'efficiency']),
    wantsLessMess: hasAny(hay, ['less mess', 'mess', 'ash', 'wood mess', 'cleaner', 'no wood', 'less work']),
    wantsAmbiance: hasAny(hay, ['ambiance', 'ambience', 'look', 'flame', 'cozy', 'decorative']),
    wantsModernWall: hasAny(hay, ['new wall', 'remodel', 'modern look', 'modern fireplace', 'linear', 'media wall', 'feature wall', 'new construction']),
    appearanceOnly: hasAny(hay, ['appearance only', 'looks only', 'doors', 'screen', 'surround', 'mantel', 'stone', 'hearth', 'facelift', 'cosmetic']),
    strongHeat: hasAny(text(file.heatExpectation, file.customerGoal, file.goalNotes), ['strong', 'primary', 'main heat', 'heat the room', 'heat whole', 'lots of heat', 'high heat']),
    modestHeat: hasAny(text(file.heatExpectation, file.customerGoal, file.goalNotes), ['modest', 'some heat', 'ambiance', 'decorative', 'occasional']),
    gasKnown: ['gas', 'natural gas', 'propane', 'lp'].some((term) => hay.includes(term)) || file.existingFuelType === 'gas',
    photosReceived: Array.isArray(file.photos) && file.photos.length > 0,
    measurementsReceived: Array.isArray(file.measurements) && file.measurements.length > 0,
    modelTagReceived: isTrue(file.modelTagReceived) || Boolean(String(file.taggedModel || '').trim()),
  }
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)))
}

export function getGuidedPathRecommendation(file = {}) {
  const e = evidenceFor(file)
  const questions = []
  const paths = []
  const cautions = []
  let summary

  if (e.isPrefabOrZc && !e.modelTagReceived) {
    paths.push({ id: 'verify-prefab-zc', label: 'Verify prefab/ZC appliance before recommending fit', confidence: 'high', customerSafe: true })
    questions.push('Can you send a clear photo of the model/serial tag inside the fireplace or behind the lower panel?')
    questions.push('Do you know whether this is a prefab/zero-clearance fireplace or a masonry fireplace?')
    questions.push('What outcome matters most: more heat, less mess, appearance, or replacing the whole unit?')
    cautions.push('Do not assume gas logs or an insert are compatible until the existing prefab/ZC model is identified.')
    summary = 'This sounds like a prefab or zero-clearance verification path. The safe next step is getting the model tag before promising insert, log set, or door compatibility.'
  } else if (e.wantsModernWall) {
    paths.push({ id: 'direct-vent-gas', label: 'Direct vent gas fireplace path', confidence: 'medium', customerSafe: true })
    paths.push({ id: 'electric-wall', label: 'Electric fireplace path', confidence: 'medium', customerSafe: true })
    questions.push('Is this a new framed wall, a remodel of an existing wall, or an existing fireplace opening?')
    questions.push('What wall depth and framing space do we have to work with?')
    questions.push('Is there a possible vent route, gas line, and electrical access?')
    summary = 'For a new modern wall or remodel, direct vent gas and electric are the clean first paths. Site framing, vent route, gas, and electrical details decide which one fits.'
  } else if (e.appearanceOnly && !e.wantsHeat) {
    paths.push({ id: 'fireplace-appearance-refresh', label: 'Doors, screen, surround, mantel, stone, or hearth refresh', confidence: 'high', customerSafe: true })
    questions.push('Are you trying to change only the look, or do you also need more usable heat?')
    questions.push('Do you have opening measurements and photos of the full wall, hearth, and current fireplace face?')
    summary = 'This reads like an appearance refresh. Doors, screens, surrounds, mantels, stone, and hearth options can stay in play unless the customer also needs heat performance.'
  } else if (e.isMasonry && e.wantsLessMess) {
    paths.push({ id: 'gas-logs', label: 'Gas log set path if heat expectation is modest', confidence: e.modestHeat ? 'medium-high' : 'medium', customerSafe: true })
    paths.push({ id: 'gas-insert', label: 'Gas insert path if stronger heat is expected', confidence: e.strongHeat ? 'medium-high' : 'medium', customerSafe: true })
    questions.push('How much heat are you expecting: mostly ambiance with some warmth, or stronger room heat?')
    questions.push('Do you currently have natural gas or propane available at the fireplace?')
    questions.push('Can you provide photos and rough opening measurements?')
    if (!e.gasKnown) cautions.push('Confirm gas type and gas availability before leaning too hard into gas logs or a gas insert.')
    summary = 'For a masonry fireplace with less mess as the main pain point, gas logs can fit a modest-heat/ambiance goal, while a gas insert is the safer path for stronger heat.'
  } else if (e.isMasonry && e.wantsHeat) {
    paths.push({ id: 'gas-insert', label: 'Gas insert path', confidence: 'medium-high', customerSafe: true })
    paths.push({ id: 'wood-insert', label: 'Wood insert path', confidence: 'medium', customerSafe: true })
    questions.push('Are you hoping for occasional warmth, strong room heat, or a major heating upgrade?')
    questions.push('Has the chimney been inspected recently, and do you know its condition?')
    questions.push('Can you share opening width, height, depth, hearth depth, and full-wall photos?')
    summary = 'For a masonry fireplace where heat is the main goal, keep gas insert and wood insert paths open until heat expectation, chimney condition, and measurements are verified.'
  } else if (e.isMasonry && e.wantsAmbiance) {
    paths.push({ id: 'gas-logs', label: 'Gas log set path', confidence: 'medium', customerSafe: true })
    paths.push({ id: 'gas-insert', label: 'Gas insert path if heat expectation grows', confidence: 'low-medium', customerSafe: true })
    questions.push('Is the priority flame/ambiance, or do you also want meaningful room heat?')
    questions.push('Do you have natural gas or propane available at the fireplace?')
    summary = 'For masonry fireplace ambiance, gas logs may be a fit, but heat expectation and gas availability need to be confirmed.'
  } else {
    paths.push({ id: 'discovery-needed', label: 'Discovery needed before a product path', confidence: 'low', customerSafe: true })
    questions.push('What do you have now: masonry fireplace, prefab/zero-clearance fireplace, insert, stove, or no existing unit?')
    questions.push('What are you trying to improve: heat, mess, appearance, convenience, or a new remodel look?')
    questions.push('Do you have photos, measurements, and any model tag information?')
    summary = 'There is not enough verified information to recommend a product path yet. Capture setup, goal, photos, measurements, and model tag details first.'
  }

  if (!e.photosReceived) questions.push('Can you send photos of the full wall, close-up opening, inside firebox, hearth, and vent/chimney area?')
  if (!e.measurementsReceived) questions.push('Can you provide rough opening width, height, depth, and hearth depth?')

  const nextBestQuestion = questions[0] || 'What outcome matters most to you for this fireplace project?'
  return {
    likelyPath: paths[0]?.label || '',
    nextBestQuestion,
    safeDiscussionSummary: summary,
    possiblePaths: paths,
    questions: unique(questions),
    cautions: unique(cautions),
    evidence: {
      photosReceived: e.photosReceived,
      measurementsReceived: e.measurementsReceived,
      modelTagReceived: e.modelTagReceived,
    },
  }
}

export function buildGuidedPathPatch(file = {}, draft = {}) {
  const rec = getGuidedPathRecommendation(file)
  return {
    likelyPath: draft.likelyPath ?? rec.likelyPath,
    nextBestQuestion: draft.nextBestQuestion ?? rec.nextBestQuestion,
    guidedPathNotes: draft.guidedPathNotes ?? file.guidedPathNotes ?? '',
    guidedPathCustomerSummary: draft.guidedPathCustomerSummary ?? rec.safeDiscussionSummary,
  }
}
