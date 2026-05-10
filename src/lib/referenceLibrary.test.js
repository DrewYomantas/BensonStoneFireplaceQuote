import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDisplayReference,
  buildReferenceLibrary,
  buildVendorReference,
  deriveReferenceMatches,
  getReferenceAutocompleteOptions,
  inferReferenceNeeds,
  searchReferences,
  buildWebReference,
} from './referenceLibrary.js'

const stoll = {
  id: 'stoll-glass',
  name: 'Stoll — Glass Doors',
  aliases: ['stoll', 'glass doors'],
  category: 'doors-glass',
  priceListFile: 'Stoll Glass Door orderbook 2025.pdf',
  priceListDate: '2025',
  priceListYear: 2025,
  internalNote: 'Separate outdoor living list also available.',
}

const magra = {
  id: 'magrahearth',
  name: 'MagraHearth',
  aliases: ['magrahearth'],
  category: 'stone-mantel',
  priceListFile: 'MagraHearth Dealer Cost Pricing 2025 and 2026.pdf',
  priceListDate: '2025 and 2026',
  priceListYear: 2026,
  internalNote: 'INTERNAL ONLY — file contains dealer cost pricing. Never use for customer-facing output.',
}

const hargrove = {
  id: 'hargrove-vented',
  name: 'Hargrove — Vented Gas Logs',
  aliases: ['hargrove', 'gas logs', 'vented logs'],
  category: 'gas-log',
  priceListFile: 'Hargrove 2026 Vented Gas Log price list.pdf',
  priceListDate: '2026',
  priceListYear: 2026,
  internalNote: '',
}

const display864 = {
  id: 'display-864',
  productCode: '864TRV',
  modelName: '864 Clean Face',
  brand: 'Travis',
  applianceType: 'gas-fireplace',
  locationZone: 'cellar',
  locationDetail: 'west wall',
  displayStatus: 'on-display',
  workingStatus: 'burning',
  talkingPoints: 'Clean-face look\nGood remodel conversation starter',
}

test('searchReferences finds binder files by fuzzy vendor/category terms', () => {
  const library = buildReferenceLibrary({ vendors: [stoll], displayRecords: [], webReferences: [], includeGuardrails: false })
  const results = searchReferences(library, 'stoll doors')
  assert.equal(results[0].id, 'vendor:stoll-glass')
  assert.equal(results[0].fileName, 'Stoll Glass Door orderbook 2025.pdf')
})

test('autocomplete suggests aliases and titles', () => {
  const library = buildReferenceLibrary({ vendors: [stoll], displayRecords: [], webReferences: [], includeGuardrails: false })
  const options = getReferenceAutocompleteOptions(library, 'sto')
  assert.ok(options.some((option) => option.value.includes('Stoll')))
})

test('dealer cost vendor references are internal-only and not customer safe', () => {
  const ref = buildVendorReference(magra)
  assert.equal(ref.safety.tone, 'danger')
  assert.equal(ref.safety.customerSafe, false)
  assert.match(ref.safety.warning, /Never copy/i)
})

test('display references can be customer-safe only when on display', () => {
  const ref = buildDisplayReference(display864)
  assert.equal(ref.safety.tone, 'ready')
  assert.equal(ref.safety.customerSafe, true)
  assert.match(ref.customerSafeSummary, /864 Clean Face/)
})

test('deriveReferenceMatches auto-detects masonry less-mess gas log path and guardrails', () => {
  const library = buildReferenceLibrary({ vendors: [stoll, hargrove], displayRecords: [], webReferences: [], includeGuardrails: true })
  const matches = deriveReferenceMatches({
    library,
    file: {
      existingApplianceType: 'fireplace',
      existingNotes: 'masonry fireplace',
      customerGoal: 'Customer wants less mess and ambiance, asked about gas logs.',
      customerPainPoints: 'wood mess',
    },
  })
  assert.ok(matches.some((match) => match.id === 'guardrail:masonry-heat-path'))
  assert.ok(matches.some((match) => match.detectedReason === 'Gas log set references'))
})

test('deriveReferenceMatches surfaces prefab/ZC model tag guardrail', () => {
  const library = buildReferenceLibrary({ vendors: [], displayRecords: [], webReferences: [], includeGuardrails: true })
  const matches = deriveReferenceMatches({
    library,
    file: {
      existingNotes: 'Prefab zero clearance metal fireplace with unknown model tag',
      modelTagReceived: '',
    },
  })
  assert.equal(matches[0].id, 'guardrail:prefab-zc-model-tag')
})


test('buildWebReference exposes current vendor brochure/manual sources as searchable references', () => {
  const ref = buildWebReference({ vendor: 'Kingsman', folder: 'Kingsman', doc_type: 'brochure', title: 'IDV24 / IDV34 / IDV44 Direct Vent Gas Fireplace Inserts brochure', models: 'IDV24, IDV34, IDV44', pdf_url: 'https://example.com/kingsman-idv.pdf', customer_safe: 'yes', notes: 'Current customer brochure.' })
  assert.equal(ref.type, 'web-reference')
  assert.equal(ref.safety.customerSafe, true)
  assert.match(ref.subtitle, /Kingsman/)
  assert.match(ref.fileName, /kingsman-idv\.pdf/)
})

test('inferReferenceNeeds detects masonry from existingApplianceType', () => {
  const needs = inferReferenceNeeds({ file: { existingApplianceType: 'masonry fireplace' } })
  assert.ok(needs.some((n) => n.id === 'masonry'), `expected masonry need, got: ${needs.map((n) => n.id).join(', ')}`)
})

test('inferReferenceNeeds detects insert from customerGoal heat', () => {
  const needs = inferReferenceNeeds({ file: { customerGoal: 'more heat from the fireplace' } })
  assert.ok(needs.some((n) => n.id === 'insert'), 'expected insert need')
})

test('inferReferenceNeeds returns empty for a blank file', () => {
  const needs = inferReferenceNeeds({ file: {} })
  assert.deepEqual(needs, [])
})

test('buildReferenceLibrary returns vendors and guardrails when display and web refs are empty', () => {
  const lib = buildReferenceLibrary({ displayRecords: [], webReferences: [] })
  assert.ok(lib.some((r) => r.type === 'vendor-price-book'), 'expected vendor entries')
  assert.ok(lib.some((r) => r.type === 'sales-guardrail'), 'expected guardrail entries')
  assert.ok(!lib.some((r) => r.type === 'showroom-display'), 'expected no display entries')
})
