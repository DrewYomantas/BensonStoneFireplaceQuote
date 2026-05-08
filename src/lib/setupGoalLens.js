// Setup + Goal Lens: pure logic. The Lens is where a quick walk-in customer
// file becomes a clearer fireplace sales picture — what does the customer
// currently have, what do they want, what is verified vs assumed, and what
// must be clarified before a real proposal.
//
// All output is design-safe: source-stamped facts, deterministic blockers,
// clarifying questions, and a customer-file patch with a strict whitelist.
// Sensitive keys (cost / margin / supplier / OCR confidence / etc.) are
// stripped on every save path.

import { sanitizeCustomerFile } from './customerFile.js'
import { isSensitiveKey } from './salesOsStorageSchema.js'
import { normalizeSourceKind } from './sourceTrust.js'

export const SETUP_TYPES = Object.freeze([
  'unknown',
  'masonry-fireplace',
  'zero-clearance-metal-fireplace',
  'direct-vent-gas-fireplace',
  'gas-insert',
  'gas-log-set',
  'wood-stove',
  'pellet-stove-or-insert',
  'electric-fireplace',
  'new-construction-or-framed-chase',
])

export const SETUP_TYPE_LABELS = Object.freeze({
  'unknown': 'Not yet known',
  'masonry-fireplace': 'Masonry fireplace',
  'zero-clearance-metal-fireplace': 'Zero-clearance metal fireplace',
  'direct-vent-gas-fireplace': 'Direct-vent gas fireplace',
  'gas-insert': 'Gas insert',
  'gas-log-set': 'Gas log set',
  'wood-stove': 'Wood stove',
  'pellet-stove-or-insert': 'Pellet stove / insert',
  'electric-fireplace': 'Electric fireplace',
  'new-construction-or-framed-chase': 'New construction / framed chase',
})

export const DESIRED_OUTCOMES = Object.freeze([
  'unknown',
  'more-heat',
  'easier-operation',
  'cleaner-look',
  'gas-convenience',
  'wood-burning-experience',
  'electric-simplicity',
  'ambience-design',
  'replace-existing-unit',
  'explore-options',
])

export const DESIRED_OUTCOME_LABELS = Object.freeze({
  'unknown': 'Not yet known',
  'more-heat': 'More heat',
  'easier-operation': 'Easier operation',
  'cleaner-look': 'Cleaner look',
  'gas-convenience': 'Gas convenience',
  'wood-burning-experience': 'Wood-burning experience',
  'electric-simplicity': 'Electric simplicity',
  'ambience-design': 'Ambience / design',
  'replace-existing-unit': 'Replace existing unit',
  'explore-options': 'Just exploring',
})

export const PRESENCE_VALUES = Object.freeze(['unknown', 'yes', 'no'])

export const GAS_TYPES = Object.freeze(['unknown', 'natural-gas', 'propane'])
export const GAS_TYPE_LABELS = Object.freeze({
  'unknown': 'Not yet known',
  'natural-gas': 'Natural gas',
  'propane': 'Propane',
})

export const VENTING_TYPES = Object.freeze([
  'unknown',
  'masonry-chimney',
  'direct-vent',
  'vertical-chimney',
  'no-venting',
])
export const VENTING_LABELS = Object.freeze({
  'unknown': 'Not yet known',
  'masonry-chimney': 'Masonry chimney',
  'direct-vent': 'Direct vent',
  'vertical-chimney': 'Vertical chimney',
  'no-venting': 'No venting',
})

export const CONSTRUCTION_FLAGS = Object.freeze([
  'exterior-siding-bumpout-framing',
  'drywall-finish-work',
  'stone-or-masonry-work',
  'existing-appliance-removal',
])
export const CONSTRUCTION_FLAG_LABELS = Object.freeze({
  'exterior-siding-bumpout-framing': 'Exterior siding / bump-out / framing',
  'drywall-finish-work': 'Drywall / finish work',
  'stone-or-masonry-work': 'Stone / masonry work',
  'existing-appliance-removal': 'Existing appliance removal',
})

export const LENS_SOURCE_KINDS = Object.freeze([
  'manual',
  'said',
  'assumed',
  'verified',
  'bistrack',
  'ocr',
])

function pickEnum(value, allowed, fallback = 'unknown') {
  const v = String(value || '').trim().toLowerCase()
  return allowed.includes(v) ? v : fallback
}

function pickSource(value, fallback = 'manual') {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return fallback
  return LENS_SOURCE_KINDS.includes(v) ? v : normalizeSourceKind(v)
}

// Canonical Start Visit → Lens goal mapping. Exported so Start Visit can show
// the same label set Drew will see in the Lens, and so backwards compat for
// already-saved customer files stays explicit (legacy or unknown values fall
// through to 'unknown' rather than throwing).
export const START_VISIT_GOAL_TO_LENS = Object.freeze({
  'more-heat': 'more-heat',
  'less-mess': 'easier-operation',
  'update-look': 'cleaner-look',
  'easier-operation': 'easier-operation',
  'replace-existing': 'replace-existing-unit',
  'explore-options': 'explore-options',
  'gas-convenience': 'gas-convenience',
  'wood-burning-experience': 'wood-burning-experience',
  'electric-simplicity': 'electric-simplicity',
  'ambience-design': 'ambience-design',
  'unknown': 'unknown',
})

export function mapStartVisitGoalToLens(value) {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return 'unknown'
  if (v in START_VISIT_GOAL_TO_LENS) return START_VISIT_GOAL_TO_LENS[v]
  // If the customer file already stores a canonical Lens value (e.g. legacy
  // direct mirror), accept it; otherwise treat as unknown.
  return DESIRED_OUTCOMES.includes(v) ? v : 'unknown'
}

function pickFlags(values) {
  if (!Array.isArray(values)) return []
  const out = []
  for (const value of values) {
    const v = String(value || '').trim().toLowerCase()
    if (CONSTRUCTION_FLAGS.includes(v) && !out.includes(v)) out.push(v)
  }
  return out
}

function cleanString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// Build an empty, manual-source draft. Used when no Customer File state exists.
export function emptyLensDraft() {
  return {
    setupType: 'unknown',
    setupTypeSource: 'manual',
    desiredOutcome: 'unknown',
    desiredOutcomeSource: 'manual',
    fuelGasPresent: 'unknown',
    fuelGasPresentSource: 'manual',
    fuelElectricPresent: 'unknown',
    fuelElectricPresentSource: 'manual',
    gasType: 'unknown',
    gasTypeSource: 'manual',
    venting: 'unknown',
    ventingSource: 'manual',
    constructionFlags: [],
    salespersonNotes: '',
  }
}

// Pull an existing Customer File into a Lens draft. Facts that came from
// Start Visit (existingNotes, customerGoal) but have not been re-stamped by
// the Lens default to 'said' (customer-stated) — never 'verified'.
export function lensDraftFromCustomerFile(file = {}) {
  const draft = emptyLensDraft()
  if (!file || typeof file !== 'object') return draft

  if (file.lensSetupType) {
    draft.setupType = pickEnum(file.lensSetupType, SETUP_TYPES)
    draft.setupTypeSource = pickSource(file.lensSetupTypeSource, 'said')
  } else if (file.existingNotes) {
    draft.setupType = 'unknown'
    draft.setupTypeSource = 'said'
  }

  if (file.lensDesiredOutcome) {
    draft.desiredOutcome = pickEnum(file.lensDesiredOutcome, DESIRED_OUTCOMES)
    draft.desiredOutcomeSource = pickSource(file.lensDesiredOutcomeSource, 'said')
  } else if (file.customerGoal) {
    const mapped = mapStartVisitGoalToLens(file.customerGoal)
    if (mapped !== 'unknown') {
      draft.desiredOutcome = mapped
      // Start Visit captured this from the customer; never auto-promote to verified.
      draft.desiredOutcomeSource = 'said'
    }
  }

  if (file.lensFuelGasPresent) {
    draft.fuelGasPresent = pickEnum(file.lensFuelGasPresent, PRESENCE_VALUES)
    draft.fuelGasPresentSource = pickSource(file.lensFuelGasPresentSource, 'said')
  }
  if (file.lensFuelElectricPresent) {
    draft.fuelElectricPresent = pickEnum(file.lensFuelElectricPresent, PRESENCE_VALUES)
    draft.fuelElectricPresentSource = pickSource(file.lensFuelElectricPresentSource, 'said')
  }
  if (file.lensGasType) {
    draft.gasType = pickEnum(file.lensGasType, GAS_TYPES)
    draft.gasTypeSource = pickSource(file.lensGasTypeSource, 'said')
  }
  if (file.lensVenting) {
    draft.venting = pickEnum(file.lensVenting, VENTING_TYPES)
    draft.ventingSource = pickSource(file.lensVentingSource, 'said')
  }
  if (Array.isArray(file.lensConstructionFlags)) {
    draft.constructionFlags = pickFlags(file.lensConstructionFlags)
  }
  if (file.lensSalespersonNotes) {
    draft.salespersonNotes = cleanString(file.lensSalespersonNotes)
  }
  return draft
}

// Normalize a Lens draft into a strict shape.
export function normalizeLensDraft(rawDraft = {}) {
  const draft = emptyLensDraft()
  if (!rawDraft || typeof rawDraft !== 'object') return draft
  draft.setupType = pickEnum(rawDraft.setupType, SETUP_TYPES)
  draft.setupTypeSource = pickSource(rawDraft.setupTypeSource)
  draft.desiredOutcome = pickEnum(rawDraft.desiredOutcome, DESIRED_OUTCOMES)
  draft.desiredOutcomeSource = pickSource(rawDraft.desiredOutcomeSource)
  draft.fuelGasPresent = pickEnum(rawDraft.fuelGasPresent, PRESENCE_VALUES)
  draft.fuelGasPresentSource = pickSource(rawDraft.fuelGasPresentSource)
  draft.fuelElectricPresent = pickEnum(rawDraft.fuelElectricPresent, PRESENCE_VALUES)
  draft.fuelElectricPresentSource = pickSource(rawDraft.fuelElectricPresentSource)
  draft.gasType = pickEnum(rawDraft.gasType, GAS_TYPES)
  draft.gasTypeSource = pickSource(rawDraft.gasTypeSource)
  draft.venting = pickEnum(rawDraft.venting, VENTING_TYPES)
  draft.ventingSource = pickSource(rawDraft.ventingSource)
  draft.constructionFlags = pickFlags(rawDraft.constructionFlags)
  draft.salespersonNotes = cleanString(rawDraft.salespersonNotes)
  return draft
}

// Strip sensitive keys defensively before producing a Customer File patch.
function stripSensitive(record) {
  if (!record || typeof record !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(record)) {
    if (isSensitiveKey(k)) continue
    out[k] = v
  }
  return out
}

// Map a Lens draft into a Customer File patch. The patch only writes the
// whitelisted lens-prefixed keys plus a customer-friendly mirror of the goal
// and existing-setup notes — never anything else from the draft.
export function buildCustomerFilePatchFromLens(rawDraft = {}, now = new Date()) {
  const draft = normalizeLensDraft(rawDraft)
  const patch = stripSensitive({
    lensSetupType: draft.setupType,
    lensSetupTypeSource: draft.setupTypeSource,
    lensDesiredOutcome: draft.desiredOutcome,
    lensDesiredOutcomeSource: draft.desiredOutcomeSource,
    lensFuelGasPresent: draft.fuelGasPresent,
    lensFuelGasPresentSource: draft.fuelGasPresentSource,
    lensFuelElectricPresent: draft.fuelElectricPresent,
    lensFuelElectricPresentSource: draft.fuelElectricPresentSource,
    lensGasType: draft.gasType,
    lensGasTypeSource: draft.gasTypeSource,
    lensVenting: draft.venting,
    lensVentingSource: draft.ventingSource,
    lensConstructionFlags: draft.constructionFlags,
    lensSalespersonNotes: draft.salespersonNotes,
    lensUpdatedAt: new Date(now).toISOString(),
  })
  // Mirror lens facts onto the existing customer-file fields so legacy reads
  // see the latest. Only mirror when the lens has a real value.
  if (draft.desiredOutcome !== 'unknown') {
    patch.customerGoal = draft.desiredOutcome
  }
  if (draft.setupType !== 'unknown') {
    patch.existingNotes = SETUP_TYPE_LABELS[draft.setupType]
  }
  return patch
}

// Apply a draft to a Customer File and return a sanitized merged record.
export function applyLensDraftToCustomerFile(file = {}, rawDraft = {}, now = new Date()) {
  const patch = buildCustomerFilePatchFromLens(rawDraft, now)
  return sanitizeCustomerFile({ ...file, ...patch })
}

// Promote a single lens fact's source kind. Used when Drew taps a fact and
// marks it verified or said. Strictly limited to known fields and known
// source kinds.
const LENS_SOURCE_FIELDS = Object.freeze({
  setupType: 'setupTypeSource',
  desiredOutcome: 'desiredOutcomeSource',
  fuelGasPresent: 'fuelGasPresentSource',
  fuelElectricPresent: 'fuelElectricPresentSource',
  gasType: 'gasTypeSource',
  venting: 'ventingSource',
})

const LENS_FACT_ENUMS = Object.freeze({
  setupType: SETUP_TYPES,
  desiredOutcome: DESIRED_OUTCOMES,
  fuelGasPresent: PRESENCE_VALUES,
  fuelElectricPresent: PRESENCE_VALUES,
  gasType: GAS_TYPES,
  venting: VENTING_TYPES,
})

export function setLensFactSource(rawDraft = {}, factKey, sourceKind) {
  const draft = normalizeLensDraft(rawDraft)
  const sourceField = LENS_SOURCE_FIELDS[factKey]
  if (!sourceField) return draft
  const next = pickSource(sourceKind, draft[sourceField])
  return { ...draft, [sourceField]: next }
}

// Demote a source kind when its paired value changes. The contract:
// - VERIFIED is never silently preserved across a value change. Drew has to
//   re-confirm it explicitly. Demote to SAID — the most common case is the
//   customer correcting what they previously said.
// - ASSUMED stays ASSUMED — still an inference, just about a new value.
// - SAID stays SAID — still customer-stated, just a different statement.
// - MANUAL/BISTRACK/OCR/anything else stays as-is, since the source describes
//   how the fact was captured, not which specific value it had.
export function demoteSourceForValueChange(prevSource) {
  const kind = pickSource(prevSource, 'manual')
  if (kind === 'verified') return 'said'
  return kind
}

// Set a lens fact's value. If the value actually changes and the previous
// source was VERIFIED, demote the source — Drew should not silently keep a
// verified pill on a value he just edited. Same shape as setLensFactSource so
// screens can call either one.
export function setLensFactValue(rawDraft = {}, factKey, value) {
  const draft = normalizeLensDraft(rawDraft)
  const sourceField = LENS_SOURCE_FIELDS[factKey]
  const allowed = LENS_FACT_ENUMS[factKey]
  if (!sourceField || !allowed) return draft
  const nextValue = pickEnum(value, allowed)
  if (nextValue === draft[factKey]) {
    return { ...draft, [factKey]: nextValue }
  }
  return {
    ...draft,
    [factKey]: nextValue,
    [sourceField]: demoteSourceForValueChange(draft[sourceField]),
  }
}

// Deterministic blockers / clarifying questions / warnings.
export function deriveLensWarnings(rawDraft = {}) {
  const draft = normalizeLensDraft(rawDraft)
  const blockers = []
  const warnings = []
  const questions = []

  if (draft.setupType === 'unknown') {
    blockers.push({ code: 'unknown-setup', message: 'Current setup type is unknown.' })
    questions.push('Is the existing fireplace masonry brick/block, a metal fireplace box, or something else?')
  }
  if (draft.desiredOutcome === 'unknown') {
    blockers.push({ code: 'unknown-goal', message: 'Customer goal is not captured.' })
    questions.push('Are you mainly looking for more heat, the look of a fire, or both?')
  }
  if (draft.fuelGasPresent === 'unknown' && draft.setupType !== 'electric-fireplace') {
    blockers.push({ code: 'unknown-gas-presence', message: 'Gas presence at fireplace is unknown.' })
    questions.push('Is there gas already at the fireplace?')
  }
  if (draft.fuelGasPresent === 'yes' && draft.gasType === 'unknown') {
    warnings.push({ code: 'unknown-gas-type', message: 'Gas type (natural gas vs propane) is unknown.' })
    questions.push('Natural gas or propane?')
  }
  if (draft.venting === 'unknown' && draft.setupType !== 'electric-fireplace') {
    warnings.push({ code: 'unknown-venting', message: 'Venting / chimney path is unknown.' })
    questions.push('Is there a chimney or vent already, and what kind?')
  }
  if (draft.fuelElectricPresent === 'unknown' &&
      (draft.setupType === 'electric-fireplace' || draft.desiredOutcome === 'electric-simplicity')) {
    blockers.push({ code: 'unknown-electric', message: 'Electrical availability is unknown.' })
    questions.push('Is there a switch or outlet near the fireplace?')
  }
  if (draft.constructionFlags.length > 0) {
    warnings.push({
      code: 'construction-coordination',
      message: 'Construction coordination work was flagged — review scope before proposal.',
    })
  }
  return { blockers, warnings, questions }
}

export function isLensReadyForProposal(rawDraft = {}) {
  const { blockers } = deriveLensWarnings(rawDraft)
  return blockers.length === 0
}

// Surface the currently captured facts as a renderable list so the Customer
// File can show inline source pills without re-deriving anything.
export function lensFactsForDisplay(file = {}) {
  const draft = lensDraftFromCustomerFile(file)
  return [
    {
      key: 'setupType',
      label: 'Current setup',
      value: SETUP_TYPE_LABELS[draft.setupType],
      raw: draft.setupType,
      source: draft.setupTypeSource,
      missing: draft.setupType === 'unknown',
    },
    {
      key: 'desiredOutcome',
      label: 'Customer goal',
      value: DESIRED_OUTCOME_LABELS[draft.desiredOutcome],
      raw: draft.desiredOutcome,
      source: draft.desiredOutcomeSource,
      missing: draft.desiredOutcome === 'unknown',
    },
    {
      key: 'fuelGasPresent',
      label: 'Gas at fireplace',
      value: draft.fuelGasPresent === 'unknown' ? 'Not yet known'
           : draft.fuelGasPresent === 'yes' ? 'Yes' : 'No',
      raw: draft.fuelGasPresent,
      source: draft.fuelGasPresentSource,
      missing: draft.fuelGasPresent === 'unknown',
    },
    {
      key: 'fuelElectricPresent',
      label: 'Electric at fireplace',
      value: draft.fuelElectricPresent === 'unknown' ? 'Not yet known'
           : draft.fuelElectricPresent === 'yes' ? 'Yes' : 'No',
      raw: draft.fuelElectricPresent,
      source: draft.fuelElectricPresentSource,
      missing: draft.fuelElectricPresent === 'unknown',
    },
    {
      key: 'gasType',
      label: 'Gas type',
      value: GAS_TYPE_LABELS[draft.gasType],
      raw: draft.gasType,
      source: draft.gasTypeSource,
      missing: draft.gasType === 'unknown',
    },
    {
      key: 'venting',
      label: 'Venting',
      value: VENTING_LABELS[draft.venting],
      raw: draft.venting,
      source: draft.ventingSource,
      missing: draft.venting === 'unknown',
    },
  ]
}
