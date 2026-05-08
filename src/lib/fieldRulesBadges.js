// Map Field Rules engine findings into compact badge labels for Today
// action cards and other summary surfaces. Pure logic — UI-free, so it can
// be unit-tested deterministically against fixture inputs.
//
// Only the four May 2026 rules are mapped. Anything else from the engine
// is ignored on purpose: badges are sample-safe, not a comprehensive
// rendering of every finding.

import { evaluateFieldRules } from './fieldRules.js'
import { FIELD_RULE_IDS } from '../config/fieldRules.js'

const BADGE_LABELS = Object.freeze({
  [FIELD_RULE_IDS.whisperFlex]: 'Whisper Flex needed',
  [FIELD_RULE_IDS.zcGasInsertAck]: 'ZC ack pending',
  [FIELD_RULE_IDS.rockfordIgnition]: 'Rockford ignition check',
  [FIELD_RULE_IDS.irtaxInstallHeader]: 'IRTAX checklist',
})

const BADGE_TONE = Object.freeze({
  [FIELD_RULE_IDS.whisperFlex]: 'checklist',
  [FIELD_RULE_IDS.zcGasInsertAck]: 'blocker',
  [FIELD_RULE_IDS.rockfordIgnition]: 'blocker',
  [FIELD_RULE_IDS.irtaxInstallHeader]: 'checklist',
})

export function findingsToBadges(findings = []) {
  if (!Array.isArray(findings)) return []
  const out = []
  for (const f of findings) {
    if (!f || !f.id) continue
    const label = BADGE_LABELS[f.id]
    if (!label) continue
    if (f.status !== 'triggered' && f.status !== 'soft-warning') continue
    out.push({
      id: f.id,
      label,
      tone: BADGE_TONE[f.id] || 'checklist',
      status: f.status,
      severity: f.severity,
    })
  }
  return out
}

export function badgesForFile(file = {}) {
  const result = evaluateFieldRules(file)
  return findingsToBadges(result.findings)
}
