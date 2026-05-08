// Field Rules — May 2026 (V1).
// Single source of truth for the four manager-author Field Rules. Each rule
// carries: id, label, source path, severity (blocker | warning | checklist),
// the app surfaces where it should appear, an internal-only explanation that
// stays in Backstage/Admin, customer-safe wording (where applicable) for any
// surface that may be visible alongside customer interaction, an enabled
// flag, and the version label that pins the rule set to a published cadence.
//
// Per V1.1 design discipline:
//   - The rule set lives in config, never hardcoded in a screen or component.
//   - Customer-safe wording must never expose internal workflow language,
//     cost, margin, supplier, OCR/BisTrack confidence, or fuzzy-match terms.
//   - Easy to revise: change a single object below if the manager updates the
//     wording or scope. The shape stays stable so the engine doesn't need to
//     change in lock-step.
//
// Source: Cowork Workflow V1, "Liam's May 2026 Field Rules — Active Today",
// stored at:
//   00 - START HERE - Benson Fireplace Workspace/Cowork Workflow V1.md
// inside the Fireplace Department Drive (read-only reference, never bundled).

export const FIELD_RULES_VERSION = 'May 2026'

export const FIELD_RULE_SEVERITIES = Object.freeze(['blocker', 'warning', 'checklist'])

export const FIELD_RULE_SURFACES = Object.freeze([
  'customer-file',
  'setup-goal-lens',
  'quote-review',
  'proposal-prep',
  'backstage',
])

export const FIELD_RULE_IDS = Object.freeze({
  whisperFlex: 'whisper-flex',
  zcGasInsertAck: 'zc-gas-insert-ack',
  rockfordIgnition: 'rockford-ignition',
  irtaxInstallHeader: 'irtax-install-header',
})

export const FIELD_RULES = Object.freeze([
  Object.freeze({
    id: FIELD_RULE_IDS.whisperFlex,
    label: 'Whisper Flex required on Empire / White Mountain Hearth vent-free logs',
    source: '00 - START HERE/Cowork Workflow V1.md · Field Rule 1',
    severity: 'checklist',
    surfaces: Object.freeze(['customer-file', 'quote-review', 'proposal-prep']),
    internal: 'Empire / White Mountain Hearth (WMH) vent-free log sales need a Whisper Flex line. Use part T1009898-12 (smaller) or T1009898-16 (larger). Hargrove already includes flex, so do not warn for Hargrove-only products.',
    customerSafe: 'Add the required gas flex connector for this log set before finalizing.',
    parts: Object.freeze({
      smaller: 'T1009898-12',
      larger: 'T1009898-16',
    }),
    enabled: true,
  }),
  Object.freeze({
    id: FIELD_RULE_IDS.zcGasInsertAck,
    label: 'Gas insert into ZC / prefab fireplace acknowledgement',
    source: '00 - START HERE/Cowork Workflow V1.md · Field Rule 2',
    severity: 'blocker',
    surfaces: Object.freeze(['customer-file', 'setup-goal-lens', 'quote-review', 'proposal-prep']),
    internal: 'When a gas insert is going into a zero-clearance / prefab metal fireplace, the existing wood-burner is being permanently disabled. The customer must be told upfront and acknowledge it before the order is finalized.',
    customerSafe: 'Customer has been told upfront that converting this fireplace to a gas insert means it will no longer be usable as a wood-burning fireplace.',
    enabled: true,
  }),
  Object.freeze({
    id: FIELD_RULE_IDS.rockfordIgnition,
    label: 'Rockford / Illinois continuous-pilot compliance check',
    source: '00 - START HERE/Cowork Workflow V1.md · Field Rule 3',
    severity: 'blocker',
    surfaces: Object.freeze(['customer-file', 'quote-review', 'proposal-prep']),
    internal: 'Route millivolt / standing-pilot questions to the manager unless confirmed IPI / on-demand / intermittent / interrupted ignition or an approved exception. Surrounding counties are tracking the same direction; treat outside-Rockford as a softer warning until updated guidance lands.',
    customerSafe: 'Before finalizing, we need to confirm the ignition system required for this project location.',
    enabled: true,
  }),
  Object.freeze({
    id: FIELD_RULE_IDS.irtaxInstallHeader,
    label: 'Install orders should use IRTAX order header',
    source: '00 - START HERE/Cowork Workflow V1.md · Field Rule 4',
    severity: 'checklist',
    surfaces: Object.freeze(['customer-file', 'quote-review', 'proposal-prep']),
    internal: 'When an opportunity contains install scope, set the order header to IRTAX. Maps conceptually to the IR_TAX field in the canonical Quote Template Field Map. Set ahead of time so the install order is correct on first save.',
    customerSafe: null,
    headerValue: 'IRTAX',
    enabled: true,
  }),
])

export function getFieldRuleById(ruleId, rules = FIELD_RULES) {
  return rules.find((r) => r.id === ruleId) || null
}

export function getEnabledFieldRules(rules = FIELD_RULES) {
  return rules.filter((r) => r.enabled !== false)
}
