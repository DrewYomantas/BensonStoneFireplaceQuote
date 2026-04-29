import assert from 'node:assert/strict'
import test from 'node:test'
import { getChannelHints, recommendFollowUpCadence, summarizeCadence } from './followUpCadence.js'

function opportunity(overrides = {}) {
  return {
    id: 'quote-1',
    customerName: 'Sample Customer',
    customerEmail: 'sample@example.com',
    customerPhone: '815-555-0100',
    quoteDate: '04/20/2026',
    status: 'ready-for-proposal',
    temperature: 'warm',
    proposalReadiness: 'ready',
    warnings: [],
    nextAction: 'Prepare proposal',
    lastContactedAt: '',
    ...overrides,
  }
}

const now = new Date('2026-04-29T12:00:00.000Z')

test('hot opportunity with no recent contact recommends follow up today', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({ temperature: 'hot' }),
    now,
  })

  assert.equal(cadence.priority, 'today')
  assert.equal(cadence.label, 'Follow up today')
  assert.equal(cadence.suggestedChannel, 'email')
})

test('warm opportunity not contacted in several days recommends this week', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({
      status: 'new-intake',
      proposalReadiness: 'needs-review',
      temperature: 'warm',
      lastContactedAt: '2026-04-20',
    }),
    now,
  })

  assert.equal(cadence.priority, 'soon')
  assert.equal(cadence.label, 'Follow up this week')
})

test('waiting on customer with recent sent activity gives customer time', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({ status: 'waiting-on-customer', proposalReadiness: 'sent' }),
    activities: [{ type: 'follow-up-sent', createdAt: '2026-04-28T12:00:00.000Z' }],
    now,
  })

  assert.equal(cadence.priority, 'waiting')
  assert.equal(cadence.label, 'Give customer time to respond')
})

test('old quote recommends soft reactivation', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({ quoteDate: '10/01/2025', status: 'follow-up-needed', proposalReadiness: 'needs-review' }),
    now,
  })

  assert.equal(cadence.priority, 'today')
  assert.equal(cadence.label, 'Soft reactivation')
})

test('missing customer contact blocks follow-up readiness', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({ customerEmail: '', customerPhone: '' }),
    now,
  })

  assert.equal(cadence.priority, 'blocked')
  assert.equal(cadence.label, 'Contact info needs review')
  assert.ok(cadence.warningFlags.includes('missing-contact'))
})

test('reference and closed records are archive review only', () => {
  const reference = recommendFollowUpCadence({ opportunity: opportunity({ status: 'reference-only' }), now })
  const closed = recommendFollowUpCadence({ opportunity: opportunity({ status: 'closed-won' }), now })

  assert.equal(reference.priority, 'archive-review')
  assert.equal(reference.label, 'Reference only, do not follow up')
  assert.equal(closed.label, 'No active follow-up')
})

test('product and install warnings require review before sending', () => {
  const cadence = recommendFollowUpCadence({
    opportunity: opportunity({
      warnings: [
        'Product match needs review before presenting selections as confirmed.',
        'Missing install details.',
      ],
    }),
    now,
  })

  assert.equal(cadence.priority, 'blocked')
  assert.ok(cadence.warningFlags.includes('product-review'))
  assert.ok(cadence.warningFlags.includes('install-details'))
})

test('channel hints reflect available contact methods', () => {
  assert.deepEqual(getChannelHints(opportunity({ customerEmail: '', customerPhone: '' })), [
    'Email missing',
    'Phone missing',
    'Text blocked',
  ])
})

test('cadence summary counts deterministic queue signals', () => {
  const opportunities = [
    opportunity({ id: 'ready', status: 'ready-for-proposal', proposalReadiness: 'ready' }),
    opportunity({ id: 'missing', customerEmail: '', customerPhone: '' }),
    opportunity({ id: 'waiting', status: 'waiting-on-customer', proposalReadiness: 'sent' }),
    opportunity({ id: 'old', quoteDate: '10/01/2025', status: 'follow-up-needed', proposalReadiness: 'needs-review' }),
  ]
  const summary = summarizeCadence(opportunities, {
    waiting: [{ type: 'follow-up-sent', createdAt: '2026-04-28T12:00:00.000Z' }],
  }, now)

  assert.equal(summary.needsFollowUp, 2)
  assert.equal(summary.staleOpportunities, 1)
  assert.equal(summary.missingContactInfo, 1)
  assert.equal(summary.readyForProposal, 1)
  assert.equal(summary.waitingOnCustomer, 1)
  assert.equal(summary.reviewBeforeSending, 1)
})
