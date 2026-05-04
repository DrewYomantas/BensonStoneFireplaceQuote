import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySalesJourneyQuickPatch,
  buildCustomerSafeSalesRecap,
  buildInternalSalesDigest,
  buildSalesJourneyQuickPatch,
  deriveSalesJourney,
} from './salesJourney.js'

const now = new Date('2026-05-03T12:00:00.000Z')

function baseFile(overrides = {}) {
  return {
    id: 'cf-test',
    customerName: 'Colton Customer',
    customerPhone: '555-1111',
    customerEmail: '',
    customerGoal: 'Less mess from masonry fireplace but still wants flame ambiance',
    existingApplianceType: 'fireplace',
    existingFuelType: 'wood',
    likelyPath: 'Gas logs or gas insert discussion',
    photos: [{ id: 'p1', label: 'Firebox photo' }],
    measurements: [{ id: 'm1', label: 'Opening', value: '36 x 30' }],
    modelTagReceived: '',
    taggedModel: '',
    opportunityId: 'opp-123',
    lineItemQuoteIncluded: 'true',
    detailedInvestmentBreakdownIncluded: 'true',
    scopeResponsibilityNotesIncluded: 'true',
    followUpTasks: [],
    ...overrides,
  }
}

test('deriveSalesJourney summarizes completion, bucket, facts, and next action', () => {
  const journey = deriveSalesJourney(baseFile(), now)
  assert.equal(journey.queueBucket, 'ready-to-generate-packet')
  assert.equal(journey.completion.percent > 50, true)
  assert.equal(journey.verification.contact, true)
  assert.equal(journey.verification.quoteImported, true)
  assert.equal(journey.quickFacts.some((fact) => fact.label === 'Likely path' && fact.value.includes('Gas')), true)
  assert.equal(journey.nextBestAction, 'Generate customer packet')
  assert.equal(journey.systemTracking.some((item) => item.label === 'Photos detected'), true)
})

test('deriveSalesJourney calls out visit-file gaps before quote import', () => {
  const journey = deriveSalesJourney(baseFile({ opportunityId: '', photos: [], measurements: [], likelyPath: '' }), now)
  assert.equal(journey.queueBucket, 'waiting-on-customer-info')
  assert.equal(journey.attention.some((item) => item.id === 'photos'), true)
  assert.equal(journey.attention.some((item) => item.id === 'quote'), true)
  assert.equal(journey.blockers.includes('BizTrack quote not imported yet'), true)
})

test('deriveSalesJourney honors inferred notes without requiring manual toggles', () => {
  const journey = deriveSalesJourney(baseFile({
    photos: [],
    measurements: [],
    notes: [{ body: 'Customer already texted photos and rough opening dimensions 36 x 30.' }],
  }), now)

  assert.equal(journey.attention.some((item) => item.id === 'photos'), false)
  assert.equal(journey.attention.some((item) => item.id === 'measurements'), false)
})

test('quick patches mutate real customer-file fields only through explicit actions', () => {
  const file = baseFile({ photos: [], measurements: [] })
  const withPhoto = applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('log-photos-received', now))
  assert.equal(withPhoto.photos.length, 1)
  assert.equal(withPhoto.photos[0].label, 'Customer photos received')
  const withTag = applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('mark-model-tag-received', now))
  assert.equal(withTag.modelTagReceived, 'true')
})



test('quick patch clear actions make logged statuses reversible', () => {
  const file = baseFile({
    photos: [{ id: 'p1', label: 'Customer photos received' }],
    measurements: [{ id: 'm1', label: 'Rough measurements received' }],
    modelTagReceived: 'true',
    taggedModel: 'ABC-123',
    pricingConfirmedAt: '2026-05-03T12:00:00.000Z',
    displaysShown: [{ id: 'd1', label: 'Showroom path discussed' }],
  })

  assert.deepEqual(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-photos-received')).photos, [])
  assert.deepEqual(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-rough-measurements')).measurements, [])
  assert.equal(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-model-tag-received')).modelTagReceived, '')
  assert.equal(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-model-tag-received')).taggedModel, '')
  assert.equal(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-pricing-confirmed')).pricingConfirmedAt, '')
  assert.deepEqual(applySalesJourneyQuickPatch(file, buildSalesJourneyQuickPatch('clear-showroom-walked')).displaysShown, [])
})

test('customer-safe recap removes internal paths and source metadata', () => {
  const recap = buildCustomerSafeSalesRecap(baseFile({
    guidedPathCustomerSummary: 'Good line\nC:\\Users\\beyon\\secret\nbackend source metadata: hidden',
  }))
  assert.match(recap, /Good line/)
  assert.doesNotMatch(recap, /Users|backend source/i)
})

test('internal digest stays internal and concise', () => {
  const digest = buildInternalSalesDigest(baseFile({ packetGeneratedAt: '2026-05-03T10:00:00.000Z' }), now)
  assert.match(digest, /Next best action/)
  assert.match(digest, /Queue bucket/)
})
