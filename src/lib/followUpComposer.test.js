import assert from 'node:assert/strict'
import test from 'node:test'
import { composeFollowUpDraft } from './followUpComposer.js'

function opportunity(overrides = {}) {
  return {
    id: 'quote-1',
    customerName: 'Sample Customer',
    customerEmail: 'sample@example.com',
    customerPhone: '815-555-0100',
    projectType: 'fireplace project',
    status: 'follow-up-needed',
    warnings: [],
    ...overrides,
  }
}

test('old quote creates reactivation follow-up with refresh language', () => {
  const draft = composeFollowUpDraft({
    opportunity: opportunity(),
    tone: 'reactivation',
    channel: 'email',
  })

  assert.match(draft.body, /wanted to follow up/i)
  assert.match(draft.body, /availability or pricing may need to be refreshed/i)
})

test('missing contact info marks draft unsafe for email and text', () => {
  const emailDraft = composeFollowUpDraft({
    opportunity: opportunity({ customerEmail: '' }),
    channel: 'email',
  })
  const textDraft = composeFollowUpDraft({
    opportunity: opportunity({ customerPhone: '' }),
    channel: 'text',
  })

  assert.equal(emailDraft.unsafeToSend, true)
  assert.equal(textDraft.unsafeToSend, true)
  assert.ok(emailDraft.warnings.some((warning) => /channel/i.test(warning)))
})

test('reference-only opportunity marks draft unsafe to send', () => {
  const draft = composeFollowUpDraft({
    opportunity: opportunity({ status: 'reference-only' }),
    warnings: ['Quote appears paid/closed/reference. Do not treat it as an active proposal without confirmation.'],
  })

  assert.equal(draft.unsafeToSend, true)
  assert.ok(draft.warnings.some((warning) => /reference-only|paid\/closed/i.test(warning)))
})

test('display model copy uses safe wording only when confirmed', () => {
  const unconfirmed = composeFollowUpDraft({
    opportunity: opportunity({ status: 'ready-for-proposal' }),
    warnings: ['Display-model wording requires salesperson confirmation. Do not say the customer viewed it unless approved notes confirm that.'],
  })
  const confirmed = composeFollowUpDraft({
    opportunity: opportunity({ status: 'ready-for-proposal' }),
    fields: { displayModelAvailable: true },
  })

  assert.equal(/available to view in our showroom/i.test(unconfirmed.body), false)
  assert.match(confirmed.body, /available to view in our showroom/i)
  assert.equal(/you saw/i.test(confirmed.body), false)
})

test('composer never includes sensitive terms', () => {
  const draft = composeFollowUpDraft({
    opportunity: opportunity(),
    playbook: { name: 'Value-Focused Option Comparison' },
    warnings: ['Product match needs review before presenting selections as confirmed.'],
    tone: 'professional',
  })
  const body = `${draft.subject} ${draft.body}`

  assert.equal(/average cost|buy price|\bcost\b|margin|inventory turns|supplier|product rank|sales rank|fuzzy match|needs review|ocr|bistrack/i.test(body), false)
})

test('product match review warnings remain internal only', () => {
  const draft = composeFollowUpDraft({
    opportunity: opportunity({ warnings: ['Product match needs review before presenting selections as confirmed.'] }),
  })

  assert.equal(draft.unsafeToSend, true)
  assert.ok(draft.warnings.some((warning) => /Product match warning stays internal/i.test(warning)))
  assert.equal(/Product match|needs review/i.test(draft.body), false)
})

test('clarification draft can include safe current setup questions', () => {
  const draft = composeFollowUpDraft({
    opportunity: opportunity(),
    tone: 'clarification',
    fields: {
      currentSetupGuidance: {
        blockers: ['Customer says insert, but the existing fireplace type is unclear.'],
        clarificationQuestions: [
          'Just to make sure we are looking at the right path, is the existing fireplace masonry brick/block or a metal fireplace box?',
          'Are you mainly looking for more heat, the look and feel of a fire, or both?',
        ],
      },
    },
  })

  assert.equal(draft.unsafeToSend, true)
  assert.match(draft.body, /masonry brick\/block or a metal fireplace box/i)
  assert.equal(/average cost|margin|supplier|ocr|fuzzy match|bistrack/i.test(draft.body), false)
})
