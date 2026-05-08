import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateFieldRules,
  hasUnclearedBlocker,
  projectFileForFieldRules,
  buildZcGasInsertAckPatch,
  FIELD_RULES,
  FIELD_RULES_VERSION,
  FIELD_RULE_IDS,
} from './fieldRules.js'
import {
  FIELD_RULES as CONFIG_FIELD_RULES,
  getFieldRuleById,
  getEnabledFieldRules,
} from '../config/fieldRules.js'

function findFinding(result, id) {
  return result.findings.find((f) => f.id === id) || null
}

describe('fieldRules config', () => {
  it('contains all four May 2026 rules and all enabled by default', () => {
    const ids = CONFIG_FIELD_RULES.map((r) => r.id)
    assert.ok(ids.includes(FIELD_RULE_IDS.whisperFlex))
    assert.ok(ids.includes(FIELD_RULE_IDS.zcGasInsertAck))
    assert.ok(ids.includes(FIELD_RULE_IDS.rockfordIgnition))
    assert.ok(ids.includes(FIELD_RULE_IDS.irtaxInstallHeader))
    for (const r of CONFIG_FIELD_RULES) {
      assert.equal(r.enabled, true, `${r.id} should be enabled by default`)
    }
    assert.equal(getEnabledFieldRules().length, CONFIG_FIELD_RULES.length)
  })

  it('every rule carries label, source, severity, surfaces, and internal note', () => {
    const allowedSeverities = ['blocker', 'warning', 'checklist']
    const allowedSurfaces = new Set([
      'customer-file', 'setup-goal-lens', 'quote-review',
      'proposal-prep', 'backstage',
    ])
    for (const r of CONFIG_FIELD_RULES) {
      assert.equal(typeof r.id, 'string')
      assert.equal(typeof r.label, 'string')
      assert.equal(typeof r.source, 'string')
      assert.ok(allowedSeverities.includes(r.severity), `bad severity: ${r.severity}`)
      assert.ok(Array.isArray(r.surfaces) && r.surfaces.length > 0)
      for (const s of r.surfaces) {
        assert.ok(allowedSurfaces.has(s), `bad surface: ${s}`)
      }
      assert.equal(typeof r.internal, 'string')
      // customerSafe may be null for rules that have no customer-facing line.
      if (r.customerSafe != null) assert.equal(typeof r.customerSafe, 'string')
    }
  })

  it('no customer-safe text contains cost / margin / supplier / OCR / BisTrack / fuzzy-match language', () => {
    const banned = [
      /cost/i, /margin/i, /buy\s*price/i,
      /supplier\s*total/i, /supplier\s*history/i,
      /sales\s*rank/i, /product\s*rank/i,
      /raw\s*ocr/i, /raw\s*pdf/i,
      /bistrack\s*confidence/i,
      /fuzzy\s*match\s*confidence/i,
      /ocr\s*confidence/i,
    ]
    for (const r of CONFIG_FIELD_RULES) {
      if (!r.customerSafe) continue
      for (const pattern of banned) {
        assert.equal(
          pattern.test(r.customerSafe), false,
          `${r.id} customer-safe text leaks: ${r.customerSafe}`
        )
      }
    }
  })

  it('exposes a pinned version label so the rule set is auditable', () => {
    assert.equal(typeof FIELD_RULES_VERSION, 'string')
    assert.match(FIELD_RULES_VERSION, /\d{4}/)
    assert.match(FIELD_RULES_VERSION.toLowerCase(), /may/)
  })

  it('getFieldRuleById returns the matching rule', () => {
    const rule = getFieldRuleById(FIELD_RULE_IDS.whisperFlex)
    assert.ok(rule)
    assert.equal(rule.id, FIELD_RULE_IDS.whisperFlex)
    assert.equal(getFieldRuleById('does-not-exist'), null)
  })
})

describe('evaluateFieldRules — Rule 1: Whisper Flex', () => {
  it('Empire vent-free logs trigger Whisper Flex', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Customer wants Empire vent-free logs in their masonry fireplace.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding, 'expected Whisper Flex finding')
    assert.equal(finding.status, 'triggered')
    assert.ok(finding.parts && finding.parts.smaller && finding.parts.larger)
  })

  it('White Mountain Hearth vent-free logs trigger Whisper Flex', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Looking at White Mountain Hearth VF log set for the family room.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
  })

  it('WMH abbreviation also triggers Whisper Flex', () => {
    const result = evaluateFieldRules({
      lensSalespersonNotes: 'WMH ventless logs — confirm size on next call.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
  })

  it('Hargrove gas logs do NOT trigger Whisper Flex', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Hargrove vented log set, customer chose the wider basket.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.equal(finding, null)
  })

  it('Empire fireplace without vent-free LOGS does not trigger Whisper Flex', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Empire direct-vent fireplace install, no log set this round.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.equal(finding, null)
  })

  it('Empire VF logs WITH T1009898-12 mark Whisper Flex satisfied', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Empire vent-free log set; quoted Whisper Flex T1009898-12 with the basket.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.status, 'satisfied')
    assert.match(finding.reason, /T1009898-12/)
  })

  it('Empire VF logs WITH T1009898-16 also mark Whisper Flex satisfied', () => {
    const result = evaluateFieldRules({
      lensSalespersonNotes: 'WMH ventless logs · added T1009898-16 (larger flex).',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.status, 'satisfied')
  })

  it('Mixed Empire + Hargrove still triggers Whisper Flex when no flex part is present', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Empire vent-free log set in family room; Hargrove vented set in den.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
    assert.match(finding.action, /Whisper Flex size/i)
  })

  it('Triggered wording asks to add the correct Whisper Flex size when both parts absent', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Empire VF logs, customer wants more heat.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.action, 'Add the correct Whisper Flex size')
  })
})

describe('evaluateFieldRules — Rule 2: ZC gas-insert acknowledgement', () => {
  it('ZC / prefab + gas insert triggers acknowledgement', () => {
    const result = evaluateFieldRules({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Customer wants a gas insert in the existing prefab.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
    assert.equal(finding.severity, 'blocker')
  })

  it('Masonry + gas insert does not trigger ZC acknowledgement', () => {
    const result = evaluateFieldRules({
      lensSetupType: 'masonry-fireplace',
      existingNotes: 'Gas insert into the brick fireplace, customer wants more heat.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.equal(finding, null)
  })

  it('ZC / prefab without a gas insert mention does not trigger', () => {
    const result = evaluateFieldRules({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Customer plans to keep wood-burning, just wants a new screen.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.equal(finding, null)
  })

  it('acknowledgement persists and clears the rule (status=cleared)', () => {
    const patch = buildZcGasInsertAckPatch(new Date('2026-05-08T15:00:00Z'), 'Drew')
    const result = evaluateFieldRules({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert path confirmed with customer.',
      ...patch,
    })
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.ok(finding)
    assert.equal(finding.status, 'cleared')
    assert.equal(patch.zcGasInsertAcknowledgedAt, '2026-05-08T15:00:00.000Z')
    assert.equal(patch.zcGasInsertAcknowledgedBy, 'Drew')
  })
})

describe('evaluateFieldRules — Rule 3: Rockford / Illinois ignition compliance', () => {
  it('Rockford + millivolt triggers blocker', () => {
    const result = evaluateFieldRules({
      projectAddress: '123 Maple St, Rockford IL 61104',
      existingNotes: 'Customer asked about a millivolt unit.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.rockfordIgnition)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
    assert.equal(finding.severity, 'blocker')
  })

  it('Rockford + standing pilot triggers blocker', () => {
    const result = evaluateFieldRules({
      projectAddress: 'Rockford, IL',
      lensSalespersonNotes: 'Standing pilot ignition on the older log set.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.rockfordIgnition)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
  })

  it('Non-Rockford Illinois project + millivolt is a soft warning, not a blocker', () => {
    const result = evaluateFieldRules({
      projectAddress: '500 Oak Ave, Belvidere IL',
      existingNotes: 'Continuous pilot system mentioned.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.rockfordIgnition)
    assert.ok(finding)
    assert.equal(finding.status, 'soft-warning')
  })

  it('Out-of-Illinois project + millivolt produces a soft warning, never a blocker', () => {
    const result = evaluateFieldRules({
      projectAddress: '1 Sunset Dr, Madison WI',
      existingNotes: 'Millivolt unit, customer asked about cost-of-ownership.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.rockfordIgnition)
    assert.ok(finding)
    assert.equal(finding.status, 'soft-warning')
  })

  it('Rockford without millivolt wording does not trigger', () => {
    const result = evaluateFieldRules({
      projectAddress: '123 Maple St, Rockford IL 61104',
      existingNotes: 'New IPI gas insert install.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.rockfordIgnition)
    assert.equal(finding, null)
  })
})

describe('evaluateFieldRules — Rule 4: IRTAX install header', () => {
  it('Install scope triggers the IRTAX checklist', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Full installation including drywall finish work and stone facing.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.irtaxInstallHeader)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
    assert.equal(finding.severity, 'checklist')
  })

  it('No install scope = no IRTAX finding', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Customer just shopping log sets, picking up in-store.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.irtaxInstallHeader)
    assert.equal(finding, null)
  })

  it('Bump-out / framing wording counts as install scope', () => {
    const result = evaluateFieldRules({
      lensSalespersonNotes: 'Bump-out and framing required on this house.',
    })
    const finding = findFinding(result, FIELD_RULE_IDS.irtaxInstallHeader)
    assert.ok(finding)
  })
})

describe('evaluateFieldRules — safety boundaries', () => {
  it('no finding customer-safe text contains cost / margin / supplier / confidence language', () => {
    const banned = [
      /cost/i, /margin/i, /buy\s*price/i,
      /supplier\s*total/i, /supplier\s*history/i,
      /sales\s*rank/i, /product\s*rank/i,
      /raw\s*ocr/i, /raw\s*pdf/i,
      /bistrack\s*confidence/i,
      /fuzzy\s*match\s*confidence/i,
      /ocr\s*confidence/i,
    ]
    const result = evaluateFieldRules({
      projectAddress: 'Rockford, IL',
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Empire VF logs, gas insert, millivolt, full install.',
    })
    assert.ok(result.findings.length > 0)
    for (const f of result.findings) {
      if (!f.customerSafe) continue
      for (const pattern of banned) {
        assert.equal(
          pattern.test(f.customerSafe), false,
          `${f.id} leaks unsafe wording: ${f.customerSafe}`
        )
      }
    }
  })

  it('projectFileForFieldRules strips sensitive incoming keys', () => {
    const out = projectFileForFieldRules({
      customerName: 'Audit',
      cost: 1234,
      margin: 0.4,
      buyPrice: 99,
      supplierTotal: 500,
      rawOcr: 'redacted',
      rawPdf: 'redacted',
      bistrackConfidence: 0.7,
      fuzzyMatchConfidence: 0.9,
      ocrConfidence: 0.5,
      salesRank: 1,
      productRank: 2,
      lensSetupType: 'masonry-fireplace',
      projectAddress: '1 Maple St',
      // Discussion-style fields that this engine reads:
      existingNotes: 'Empire VF logs.',
    })
    assert.equal(out.customerName, 'Audit')
    assert.equal(out.lensSetupType, 'masonry-fireplace')
    assert.equal(out.projectAddress, '1 Maple St')
    assert.equal(out.existingNotes, 'Empire VF logs.')
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'rawOcr', 'rawPdf',
      'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
      'salesRank', 'productRank',
    ]) {
      assert.equal(k in out, false, `${k} leaked into engine input`)
    }
  })

  it('hasUnclearedBlocker returns true only when a blocker is still triggered', () => {
    const blockerActive = evaluateFieldRules({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert path confirmed with customer.',
    })
    assert.equal(hasUnclearedBlocker(blockerActive), true)

    const acknowledged = evaluateFieldRules({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert path confirmed with customer.',
      zcGasInsertAcknowledgedAt: '2026-05-08T15:00:00.000Z',
    })
    assert.equal(hasUnclearedBlocker(acknowledged), false)

    const onlyChecklist = evaluateFieldRules({
      existingNotes: 'Standard installation scope, no Empire logs, no millivolt.',
    })
    assert.equal(hasUnclearedBlocker(onlyChecklist), false)
  })

  it('returns the pinned version label on every evaluation', () => {
    const result = evaluateFieldRules({})
    assert.equal(result.version, FIELD_RULES_VERSION)
  })

  it('result and findings are immutable (frozen)', () => {
    const result = evaluateFieldRules({
      existingNotes: 'Empire vent-free logs.',
    })
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.findings), true)
    if (result.findings.length > 0) {
      assert.equal(Object.isFrozen(result.findings[0]), true)
    }
  })

  it('FIELD_RULES export from engine matches config', () => {
    assert.equal(FIELD_RULES.length, CONFIG_FIELD_RULES.length)
  })

  it('projectFileForFieldRules drops a broad sweep of sensitive variants', () => {
    const sensitive = {
      cost: 1,
      averageCost: 2,
      margin: 0.3,
      marginPercent: 30,
      buyPrice: 50,
      buy_price: 50,
      'buy-price': 50,
      supplierTotal: 999,
      supplier_total: 999,
      supplierHistory: 'redacted',
      rawOcr: 'redacted',
      raw_ocr: 'redacted',
      rawPdf: 'redacted',
      raw_pdf: 'redacted',
      bistrackConfidence: 0.7,
      bistrack_confidence: 0.7,
      fuzzyMatchConfidence: 0.9,
      fuzzy_match_confidence: 0.9,
      ocrConfidence: 0.5,
      ocr_confidence: 0.5,
      salesRank: 1,
      sales_rank: 1,
      productRank: 2,
      product_rank: 2,
      inventoryTurn: 4,
      privateCatalog: 'redacted',
      // Safe keys that should survive:
      customerName: 'Audit',
      lensSetupType: 'masonry-fireplace',
      existingNotes: 'Empire VF logs.',
    }
    const out = projectFileForFieldRules(sensitive)
    for (const k of [
      'cost', 'averageCost', 'margin', 'marginPercent',
      'buyPrice', 'buy_price', 'buy-price',
      'supplierTotal', 'supplier_total', 'supplierHistory',
      'rawOcr', 'raw_ocr', 'rawPdf', 'raw_pdf',
      'bistrackConfidence', 'bistrack_confidence',
      'fuzzyMatchConfidence', 'fuzzy_match_confidence',
      'ocrConfidence', 'ocr_confidence',
      'salesRank', 'sales_rank', 'productRank', 'product_rank',
      'inventoryTurn', 'privateCatalog',
    ]) {
      assert.equal(k in out, false, `${k} leaked into engine input`)
    }
    assert.equal(out.customerName, 'Audit')
    assert.equal(out.lensSetupType, 'masonry-fireplace')
    assert.equal(out.existingNotes, 'Empire VF logs.')
  })

  it('vendor-net / dealer-net language never appears in customer-safe finding text', () => {
    const banned = [/vendor\s*net/i, /dealer\s*net/i]
    const result = evaluateFieldRules({
      projectAddress: 'Rockford, IL',
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Empire VF logs, gas insert, millivolt, full install.',
    })
    for (const f of result.findings) {
      if (!f.customerSafe) continue
      for (const pattern of banned) {
        assert.equal(pattern.test(f.customerSafe), false,
          `${f.id} leaks vendor/dealer-net language: ${f.customerSafe}`)
      }
    }
  })
})
