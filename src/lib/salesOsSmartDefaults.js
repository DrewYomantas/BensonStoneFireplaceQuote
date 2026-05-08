// Sales OS smart defaults. Pure, deterministic ordering of common options
// used across Start Visit and the Setup + Goal Lens. Designed so a future
// local-only usage-frequency layer can hook in without changing call sites:
// each helper takes an optional `frequency` map and falls back to a baked-in
// "common at Benson Stone" ordering when no usage data is supplied.
//
// Boundaries:
// - No AI, no cloud sync, no hidden automation.
// - No mutation of input arrays.
// - No tracking is performed here. Callers may pass an opt-in frequency map
//   later; until then this is a static, well-tested helper.

import {
  SETUP_TYPES,
  DESIRED_OUTCOMES,
  PRESENCE_VALUES,
  VENTING_TYPES,
  CONSTRUCTION_FLAGS,
} from './setupGoalLens.js'

// Hand-tuned baseline ordering. Reflects what walks through the Benson
// fireplace department most often, with 'unknown' parked at the end so it
// reads as the fallback rather than a default pick.
const COMMON_SETUP_TYPES = Object.freeze([
  'masonry-fireplace',
  'gas-insert',
  'zero-clearance-metal-fireplace',
  'gas-log-set',
  'direct-vent-gas-fireplace',
  'wood-stove',
  'electric-fireplace',
  'pellet-stove-or-insert',
  'new-construction-or-framed-chase',
  'unknown',
])

const COMMON_DESIRED_OUTCOMES = Object.freeze([
  'more-heat',
  'replace-existing-unit',
  'cleaner-look',
  'easier-operation',
  'gas-convenience',
  'ambience-design',
  'wood-burning-experience',
  'electric-simplicity',
  'explore-options',
  'unknown',
])

const PRESENCE_ORDER = Object.freeze(['yes', 'no', 'unknown'])

const COMMON_VENTING = Object.freeze([
  'masonry-chimney',
  'direct-vent',
  'vertical-chimney',
  'no-venting',
  'unknown',
])

const COMMON_CONSTRUCTION_FLAGS = Object.freeze([
  'existing-appliance-removal',
  'stone-or-masonry-work',
  'drywall-finish-work',
  'exterior-siding-bumpout-framing',
])

const COMMON_BLOCKERS = Object.freeze([
  'unknown-setup',
  'unknown-goal',
  'unknown-gas-presence',
  'unknown-electric',
  'unknown-venting',
  'unknown-gas-type',
  'construction-coordination',
])

const COMMON_NEXT_STEPS = Object.freeze([
  'open-setup-goal-lens',
  'capture-current-setup',
  'capture-goal',
  'capture-contact',
  'capture-name',
])

// Deterministic ordering: pin items that appear in `preferred`, in their
// preferred order, then append everything else in original order. Items not
// in `allowed` are dropped. No mutation. If `frequency` (a count map) is
// passed, ties are broken by frequency descending — preserved as a hook for
// a future local-only learning layer; current callers leave it undefined.
export function orderOptions(allowed, preferred = [], frequency = null) {
  if (!Array.isArray(allowed)) return []
  const allowedSet = new Set(allowed)
  const preferredFiltered = preferred.filter((value) => allowedSet.has(value))
  const seen = new Set(preferredFiltered)
  const remaining = allowed.filter((value) => !seen.has(value))
  if (frequency && typeof frequency === 'object') {
    remaining.sort((a, b) => (frequency[b] || 0) - (frequency[a] || 0))
  }
  return [...preferredFiltered, ...remaining]
}

export function suggestSetupTypeOrder(frequency) {
  return orderOptions(SETUP_TYPES, COMMON_SETUP_TYPES, frequency)
}

export function suggestDesiredOutcomeOrder(frequency) {
  return orderOptions(DESIRED_OUTCOMES, COMMON_DESIRED_OUTCOMES, frequency)
}

export function suggestPresenceOrder(frequency) {
  return orderOptions(PRESENCE_VALUES, PRESENCE_ORDER, frequency)
}

export function suggestVentingOrder(frequency) {
  return orderOptions(VENTING_TYPES, COMMON_VENTING, frequency)
}

export function suggestConstructionFlagOrder(frequency) {
  return orderOptions(CONSTRUCTION_FLAGS, COMMON_CONSTRUCTION_FLAGS, frequency)
}

// Read-only views so callers that want the baseline ordering don't have to
// pass through orderOptions. Useful for tests and snapshot-style assertions.
export function commonBlockerCodes() { return [...COMMON_BLOCKERS] }
export function commonNextStepCodes() { return [...COMMON_NEXT_STEPS] }
