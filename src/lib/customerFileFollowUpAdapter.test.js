import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { customerFileToOpportunity } from './customerFileFollowUpAdapter.js'

describe('customerFileToOpportunity', () => {
  it('maps name, email, phone from file', () => {
    const opp = customerFileToOpportunity({ customerName: 'Jane Doe', customerEmail: 'jane@example.com', customerPhone: '555-1234' })
    assert.equal(opp.customerName, 'Jane Doe')
    assert.equal(opp.customerEmail, 'jane@example.com')
    assert.equal(opp.customerPhone, '555-1234')
  })

  it('uses customerGoal as projectType', () => {
    const opp = customerFileToOpportunity({ customerGoal: 'gas fireplace insert' })
    assert.equal(opp.projectType, 'gas fireplace insert')
  })

  it('falls back to "fireplace project" when no customerGoal', () => {
    const opp = customerFileToOpportunity({})
    assert.equal(opp.projectType, 'fireplace project')
  })

  it('sets status to waiting-on-customer when follow-up is overdue', () => {
    const followUp = { dueAt: new Date(Date.now() - 86400000).toISOString(), setAt: new Date().toISOString() }
    const opp = customerFileToOpportunity({}, followUp)
    assert.equal(opp.status, 'waiting-on-customer')
  })

  it('sets blank status when no follow-up', () => {
    const opp = customerFileToOpportunity({ customerName: 'Test' })
    assert.equal(opp.status, '')
  })

  it('strips warnings containing sensitive terms', () => {
    const warnings = [
      { message: 'Missing install details' },
      { message: 'OCR confidence low' },
      { message: 'Check margin before sending' },
      'Venting unclear',
    ]
    const opp = customerFileToOpportunity({}, null, warnings)
    assert.ok(opp.warnings.every((w) => !/ocr|margin/i.test(w)), 'sensitive warnings must be stripped')
    assert.ok(opp.warnings.includes('Missing install details'))
    assert.ok(opp.warnings.includes('Venting unclear'))
  })

  it('draft output from composeFollowUpDraft contains no banned phrases', async () => {
    const { composeFollowUpDraft } = await import('./followUpComposer.js')
    const opp = customerFileToOpportunity({ customerName: 'Sam Smith', customerEmail: 'sam@example.com', customerGoal: 'gas fireplace' })
    const draft = composeFollowUpDraft({ opportunity: opp, tone: 'warm', channel: 'email' })
    const text = `${draft.subject} ${draft.body} ${draft.warnings.join(' ')}`
    const banned = ['ready to send', 'proposal ready', 'customer ready', 'approved']
    for (const phrase of banned) {
      assert.ok(!text.toLowerCase().includes(phrase), `banned phrase found: "${phrase}"`)
    }
  })
})
