import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildHearthSessionReference,
  buildHearthSessionReferences,
  buildDisplayReference,
  buildReferenceLibrary,
  buildVendorReference,
  deriveReferenceMatches,
  getReferenceAutocompleteOptions,
  hasCriticalSmartContextReferences,
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

const hearthSession = {
  id: 'hs-001',
  customerFileId: 'file-abc',
  status: 'paused',
  currentChapter: 6,
  lastTouchedAt: '2026-05-10T10:00:00.000Z',
  pausedAt: '2026-05-10T10:00:00.000Z',
  completedAt: null,
  selections: {
    setupType: 'gas insert',
    goal: 'more heat',
    stoneSeries: 'Cliffstone',
    dimensions: { w: 36, h: 30, d: 12 },
    investment: { range: '$8k-$10k' },
    roomContext: { room: 'living room' },
  },
  flags: { fieldRulesTriggered: ['ZC gas-insert', 'Whisper Flex'] },
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

test('buildHearthSessionReference projects paused session context without sensitive selections', () => {
  const ref = buildHearthSessionReference(hearthSession, { now: new Date('2026-05-12T10:00:00.000Z') })
  assert.equal(ref.type, 'hearthSession')
  assert.equal(ref.id, 'hearth-session:hs-001')
  assert.match(ref.title, /Paused at Chapter 06/)
  assert.match(ref.subtitle, /Cliffstone .* 36/)
  assert.ok(ref.details.some((line) => /gas insert.*more heat/i.test(line)))
  assert.ok(ref.details.some((line) => /2 rules: ZC gas-insert, Whisper Flex/i.test(line)))
  assert.equal(ref.safety.tone, 'internal')
  assert.equal(ref.safety.label, 'Hearth Studio')
  assert.equal(ref.selections.investment, undefined)
  assert.equal(ref.selections.roomContext, undefined)
})

test('buildHearthSessionReference uses empty-selection fallback', () => {
  const ref = buildHearthSessionReference({
    ...hearthSession,
    selections: {},
    flags: { fieldRulesTriggered: [] },
  })
  assert.equal(ref.subtitle, 'Selections not yet recorded')
  assert.ok(!ref.details.some((line) => /rules:/i.test(line)))
})

test('buildHearthSessionReference shows active chapter status', () => {
  const ref = buildHearthSessionReference({ ...hearthSession, status: 'active', pausedAt: null })
  assert.match(ref.title, /Chapter 06/)
  assert.doesNotMatch(ref.title, /Paused/)
})

test('buildHearthSessionReference shows completed relative status', () => {
  const ref = buildHearthSessionReference({
    ...hearthSession,
    status: 'completed',
    completedAt: '2026-05-05T10:00:00.000Z',
  }, { now: new Date('2026-05-12T10:00:00.000Z') })
  assert.equal(ref.title, 'Completed 7 days ago')
})

test('buildHearthSessionReference keeps partial stone selection readable', () => {
  const ref = buildHearthSessionReference({ ...hearthSession, selections: { stoneSeries: 'Cliffstone' } })
  assert.equal(ref.subtitle, 'Cliffstone')
})

test('buildHearthSessionReference keeps partial dimensions selection readable', () => {
  const ref = buildHearthSessionReference({ ...hearthSession, selections: { dimensions: { w: 42, h: 28 } } })
  assert.equal(ref.subtitle, '42 x 28')
})

test('buildHearthSessionReference returns null for missing session id', () => {
  assert.equal(buildHearthSessionReference({ ...hearthSession, id: '' }), null)
})

test('buildHearthSessionReference returns null for null session', () => {
  assert.equal(buildHearthSessionReference(null), null)
})

test('buildHearthSessionReference marks references customer-unsafe and neutral', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(ref.safety.customerSafe, false)
  assert.equal(ref.safety.tone, 'internal')
  assert.doesNotMatch(ref.safety.label, /warning|review|required/i)
})

test('buildHearthSessionReference includes session content in aliases without phone-like PII fields', () => {
  const ref = buildHearthSessionReference({ ...hearthSession, phone: '815-555-1212' })
  assert.ok(ref.aliases.some((alias) => /Cliffstone/i.test(alias)))
  assert.ok(!ref.aliases.some((alias) => /815-555/i.test(alias)))
})

test('buildHearthSessionReferences sorts by last touched and limits to top three', () => {
  const refs = buildHearthSessionReferences([
    { ...hearthSession, id: 'old', lastTouchedAt: '2026-05-01T10:00:00.000Z' },
    { ...hearthSession, id: 'newest', lastTouchedAt: '2026-05-12T10:00:00.000Z' },
    { ...hearthSession, id: 'middle', lastTouchedAt: '2026-05-08T10:00:00.000Z' },
    { ...hearthSession, id: 'fourth', lastTouchedAt: '2026-05-07T10:00:00.000Z' },
  ])
  assert.deepEqual(refs.map((ref) => ref.sessionId), ['newest', 'middle', 'fourth'])
  assert.equal(refs.hiddenCount, 1)
})

test('buildHearthSessionReferences excludes soft-deleted sessions', () => {
  const refs = buildHearthSessionReferences([
    { ...hearthSession, id: 'deleted', status: 'soft_deleted', softDeletedAt: '2026-05-11T10:00:00.000Z' },
    { ...hearthSession, id: 'visible', status: 'active', softDeletedAt: null },
  ])
  assert.deepEqual(refs.map((ref) => ref.sessionId), ['visible'])
})

test('buildHearthSessionReferences returns empty metadata for no sessions', () => {
  const refs = buildHearthSessionReferences([])
  assert.equal(refs.length, 0)
  assert.equal(refs.hiddenCount, 0)
  assert.equal(refs.allCount, 0)
})

test('deriveReferenceMatches returns no hearth session refs when none are supplied', () => {
  const matches = deriveReferenceMatches({ library: [], file: { id: 'file-abc' }, hearthSessions: [] })
  assert.ok(!matches.some((match) => match.type === 'hearthSession'))
})

test('deriveReferenceMatches excludes soft-deleted hearth session refs', () => {
  const matches = deriveReferenceMatches({
    library: [],
    file: { id: 'file-abc' },
    hearthSessions: [{ ...hearthSession, status: 'soft_deleted', softDeletedAt: '2026-05-11T10:00:00.000Z' }],
  })
  assert.equal(matches.length, 0)
})

test('deriveReferenceMatches includes hearth sessions before library limit trimming', () => {
  const library = buildReferenceLibrary({ vendors: [stoll, hargrove], displayRecords: [display864], webReferences: [], includeGuardrails: true })
  const matches = deriveReferenceMatches({
    library,
    file: { id: 'file-abc', existingNotes: 'masonry fireplace', customerGoal: 'more heat' },
    hearthSessions: [hearthSession],
    limit: 3,
  })
  assert.equal(matches[0].type, 'hearthSession')
  assert.ok(matches.some((match) => match.sessionId === 'hs-001'))
})

test('deriveReferenceMatches keeps older hearth sessions hidden after top three', () => {
  const matches = deriveReferenceMatches({
    library: [],
    file: { id: 'file-abc' },
    hearthSessions: [
      { ...hearthSession, id: 'one', lastTouchedAt: '2026-05-12T10:00:00.000Z' },
      { ...hearthSession, id: 'two', lastTouchedAt: '2026-05-11T10:00:00.000Z' },
      { ...hearthSession, id: 'three', lastTouchedAt: '2026-05-10T10:00:00.000Z' },
      { ...hearthSession, id: 'four', lastTouchedAt: '2026-05-09T10:00:00.000Z' },
    ],
  })
  assert.equal(matches.filter((match) => match.type === 'hearthSession').length, 3)
  assert.equal(matches.hiddenCount, 1)
})

test('deriveReferenceMatches can expand all hearth sessions when requested', () => {
  const matches = deriveReferenceMatches({
    library: [],
    file: { id: 'file-abc' },
    hearthSessionLimit: 10,
    hearthSessions: [
      { ...hearthSession, id: 'one', lastTouchedAt: '2026-05-12T10:00:00.000Z' },
      { ...hearthSession, id: 'two', lastTouchedAt: '2026-05-11T10:00:00.000Z' },
      { ...hearthSession, id: 'three', lastTouchedAt: '2026-05-10T10:00:00.000Z' },
      { ...hearthSession, id: 'four', lastTouchedAt: '2026-05-09T10:00:00.000Z' },
    ],
  })
  assert.equal(matches.filter((match) => match.type === 'hearthSession').length, 4)
  assert.equal(matches.hiddenCount, 0)
})

test('searchReferences indexes safe hearth session content', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(searchReferences([ref], 'Cliffstone')[0].id, ref.id)
  assert.equal(searchReferences([ref], '36 x 30')[0].id, ref.id)
  assert.equal(searchReferences([ref], 'Chapter 06')[0].id, ref.id)
  assert.equal(searchReferences([ref], 'roomContext').length, 0)
  assert.equal(searchReferences([ref], '$8k').length, 0)
})

test('searchReferences finds setup type from hearth session references', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(searchReferences([ref], 'gas insert')[0].id, ref.id)
})

test('searchReferences finds goal from hearth session references', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(searchReferences([ref], 'more heat')[0].id, ref.id)
})

test('searchReferences finds field rule names from hearth session references', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(searchReferences([ref], 'Whisper Flex')[0].id, ref.id)
})

test('searchReferences can filter to hearth sessions only', () => {
  const sessionRef = buildHearthSessionReference(hearthSession)
  const vendorRef = buildVendorReference(stoll)
  const results = searchReferences([sessionRef, vendorRef], 'Cliffstone stoll', { category: 'hearth-sessions' })
  assert.deepEqual(results.map((ref) => ref.type), ['hearthSession'])
})

test('hasCriticalSmartContextReferences is true for hearth field rules', () => {
  const ref = buildHearthSessionReference(hearthSession)
  assert.equal(hasCriticalSmartContextReferences([ref]), true)
})

test('hasCriticalSmartContextReferences is true for paused session blockers', () => {
  const ref = buildHearthSessionReference({
    ...hearthSession,
    flags: { needsFieldMeasure: true, hasComplexSetup: false, fieldRulesTriggered: [] },
  })
  assert.equal(hasCriticalSmartContextReferences([ref]), true)
})

test('hasCriticalSmartContextReferences is false for calm hearth session', () => {
  const ref = buildHearthSessionReference({
    ...hearthSession,
    status: 'active',
    flags: { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: [] },
  })
  assert.equal(hasCriticalSmartContextReferences([ref]), false)
})

test('QuotePrepScreen imports and mounts SmartContextPanel with Hearth Studio session opening', () => {
  const source = readFileSync(new URL('../screens/QuotePrepScreen.jsx', import.meta.url), 'utf8')
  assert.match(source, /import SmartContextPanel from '\.\.\/components\/SmartContextPanel\.jsx'/)
  assert.match(source, /<SmartContextPanel/)
  assert.match(source, /onOpenHearthSession=\{onOpenHearthSession\}/)
})
