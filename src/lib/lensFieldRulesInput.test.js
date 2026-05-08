import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLensEngineInput } from './lensFieldRulesInput.js'
import { evaluateFieldRules } from './fieldRules.js'
import { FIELD_RULE_IDS } from '../config/fieldRules.js'
import { emptyLensDraft } from './setupGoalLens.js'

function findFinding(result, id) {
  return result.findings.find((f) => f.id === id) || null
}

describe('buildLensEngineInput — drives Field Rules from in-progress Lens', () => {
  it('overlays draft setup type onto saved file', () => {
    const saved = { id: 'cf-1', lensSetupType: 'masonry-fireplace' }
    const draft = { ...emptyLensDraft(), setupType: 'zero-clearance-metal-fireplace' }
    const input = buildLensEngineInput(saved, draft)
    assert.equal(input.lensSetupType, 'zero-clearance-metal-fireplace')
  })

  it('ZC + gas insert in saved discussion triggers blocker before Lens save', () => {
    const saved = {
      id: 'cf-1',
      existingNotes: 'Customer wants a gas insert in the existing prefab.',
    }
    const draft = { ...emptyLensDraft(), setupType: 'zero-clearance-metal-fireplace' }
    const input = buildLensEngineInput(saved, draft)
    const result = evaluateFieldRules(input)
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
    assert.equal(finding.severity, 'blocker')
  })

  it('preserves saved acknowledgement so Lens shows it cleared', () => {
    const saved = {
      id: 'cf-1',
      existingNotes: 'Gas insert path confirmed with customer.',
      zcGasInsertAcknowledgedAt: '2026-05-08T15:00:00.000Z',
      zcGasInsertAcknowledgedBy: 'Drew',
    }
    const draft = { ...emptyLensDraft(), setupType: 'zero-clearance-metal-fireplace' }
    const input = buildLensEngineInput(saved, draft)
    const result = evaluateFieldRules(input)
    const finding = findFinding(result, FIELD_RULE_IDS.zcGasInsertAck)
    assert.ok(finding)
    assert.equal(finding.status, 'cleared')
  })

  it('lens salesperson notes are visible to engine without saving', () => {
    const saved = { id: 'cf-1' }
    const draft = {
      ...emptyLensDraft(),
      salespersonNotes: 'Empire vent-free log set, no flex on the line yet.',
    }
    const input = buildLensEngineInput(saved, draft)
    const result = evaluateFieldRules(input)
    const finding = findFinding(result, FIELD_RULE_IDS.whisperFlex)
    assert.ok(finding)
    assert.equal(finding.status, 'triggered')
  })
})
