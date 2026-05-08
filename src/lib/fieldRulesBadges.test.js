import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { badgesForFile, findingsToBadges } from './fieldRulesBadges.js'
import { FIELD_RULE_IDS } from '../config/fieldRules.js'

describe('fieldRulesBadges — Today projection', () => {
  it('Empire VF logs surfaces Whisper Flex badge', () => {
    const badges = badgesForFile({
      existingNotes: 'Empire vent-free log set in masonry fireplace.',
    })
    const labels = badges.map((b) => b.label)
    assert.ok(labels.includes('Whisper Flex needed'))
  })

  it('ZC + gas insert (no ack) surfaces ZC ack pending blocker badge', () => {
    const badges = badgesForFile({
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert into the existing prefab.',
    })
    const ack = badges.find((b) => b.id === FIELD_RULE_IDS.zcGasInsertAck)
    assert.ok(ack)
    assert.equal(ack.label, 'ZC ack pending')
    assert.equal(ack.tone, 'blocker')
  })

  it('Rockford + millivolt surfaces Rockford ignition badge', () => {
    const badges = badgesForFile({
      projectAddress: '14 Oak Ln, Rockford IL 61104',
      existingNotes: 'Millivolt log set under consideration.',
    })
    const labels = badges.map((b) => b.label)
    assert.ok(labels.includes('Rockford ignition check'))
  })

  it('Install scope surfaces IRTAX checklist badge', () => {
    const badges = badgesForFile({
      existingNotes: 'Full installation including drywall finish work.',
    })
    const labels = badges.map((b) => b.label)
    assert.ok(labels.includes('IRTAX checklist'))
  })

  it('No findings = no badges', () => {
    const badges = badgesForFile({})
    assert.deepEqual(badges, [])
  })

  it('cleared/satisfied findings do not produce badges', () => {
    const findings = [
      { id: FIELD_RULE_IDS.zcGasInsertAck, status: 'cleared', severity: 'blocker' },
      { id: FIELD_RULE_IDS.whisperFlex, status: 'satisfied', severity: 'checklist' },
    ]
    assert.deepEqual(findingsToBadges(findings), [])
  })
})
