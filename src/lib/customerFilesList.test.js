import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  projectCustomerFileForList,
  projectCustomerFilesList,
  recentCustomerFiles,
  searchCustomerFilesList,
  filterCustomerFilesListByQuotePrep,
  QUOTE_PREP_FILTER_VALUES,
} from './customerFilesList.js'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  saveCustomerFileDurable,
  listCustomerFilesDurable,
} from './customerFileDurable.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('projectCustomerFilesList — sorting + projection', () => {
  it('sorts most-recently-updated first', () => {
    const rows = projectCustomerFilesList([
      { id: 'cf-old', customerName: 'Old', updatedAt: '2026-04-10T10:00:00Z' },
      { id: 'cf-new', customerName: 'New', updatedAt: '2026-05-08T10:00:00Z' },
      { id: 'cf-mid', customerName: 'Mid', updatedAt: '2026-04-25T10:00:00Z' },
    ])
    assert.deepEqual(rows.map((r) => r.id), ['cf-new', 'cf-mid', 'cf-old'])
  })

  it('falls back to lensUpdatedAt / visitedAt / createdAt when updatedAt missing', () => {
    const rows = projectCustomerFilesList([
      { id: 'cf-1', customerName: 'A', createdAt: '2026-04-01T10:00:00Z' },
      { id: 'cf-2', customerName: 'B', lensUpdatedAt: '2026-05-01T10:00:00Z' },
    ])
    assert.equal(rows[0].id, 'cf-2')
  })

  it('survives missing optional fields without crashing', () => {
    const row = projectCustomerFileForList({ id: 'cf-x', customerName: 'Bare' })
    assert.equal(row.customerName, 'Bare')
    assert.equal(row.contact, '')
    assert.equal(row.summary, '')
    assert.equal(row.projectAddress, '')
    assert.equal(row.lensSetupTypeLabel, '')
  })

  it('returns null when row has no id', () => {
    assert.equal(projectCustomerFileForList({ customerName: 'Anon' }), null)
  })

  it('empty input returns an empty array', () => {
    assert.deepEqual(projectCustomerFilesList([]), [])
    assert.deepEqual(projectCustomerFilesList(null), [])
  })

  it('contact prefers phone over email', () => {
    const r = projectCustomerFileForList({
      id: 'cf-1',
      customerName: 'X',
      customerPhone: '555-0001',
      customerEmail: 'x@y.com',
    })
    assert.equal(r.contact, '555-0001')
  })

  it('summary picks lens notes first, then existing notes, then goal', () => {
    assert.equal(
      projectCustomerFileForList({ id: 'cf-1', lensSalespersonNotes: 'Lens', existingNotes: 'Existing', customerGoal: 'Goal' }).summary,
      'Lens'
    )
    assert.equal(
      projectCustomerFileForList({ id: 'cf-2', existingNotes: 'Existing', customerGoal: 'Goal' }).summary,
      'Existing'
    )
    assert.equal(
      projectCustomerFileForList({ id: 'cf-3', customerGoal: 'Goal' }).summary,
      'Goal'
    )
  })

  it('lensSetupType is rendered to its human label', () => {
    const row = projectCustomerFileForList({ id: 'cf-1', lensSetupType: 'zero-clearance-metal-fireplace' })
    assert.equal(row.lensSetupTypeLabel, 'Zero-clearance metal fireplace')
  })

  it('does not surface sensitive keys on list rows', () => {
    const row = projectCustomerFileForList({
      id: 'cf-1',
      customerName: 'Audit',
      cost: 999,
      margin: 0.4,
      buyPrice: 50,
      supplierTotal: 500,
      rawOcr: 'redacted',
      rawPdf: 'redacted',
      bistrackConfidence: 0.7,
      fuzzyMatchConfidence: 0.9,
      ocrConfidence: 0.5,
      salesRank: 1,
      productRank: 2,
    })
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'rawOcr', 'rawPdf',
      'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
      'salesRank', 'productRank',
    ]) {
      assert.equal(k in row, false, `${k} leaked into list row`)
    }
  })
})

describe('searchCustomerFilesList', () => {
  const sampleRows = projectCustomerFilesList([
    {
      id: 'cf-anna',
      customerName: 'Anna Orlinska',
      customerPhone: '815-555-0119',
      customerEmail: 'anna@example.com',
      projectAddress: '14 Maple St, Rockford IL 61104',
      existingNotes: 'Existing prefab fireplace, customer wants gas insert.',
      lensSetupType: 'zero-clearance-metal-fireplace',
      updatedAt: '2026-05-08T10:00:00Z',
    },
    {
      id: 'cf-tom',
      customerName: 'Tom Karpinski',
      customerPhone: '815-555-2200',
      projectAddress: 'Belvidere IL',
      existingNotes: 'Empire vent-free logs.',
      lensSetupType: 'masonry-fireplace',
      updatedAt: '2026-05-07T10:00:00Z',
    },
    {
      id: 'cf-rebecca',
      customerName: 'Rebecca Powell',
      customerEmail: 'rebecca@example.com',
      projectAddress: 'Loves Park IL',
      goalNotes: 'Wants ambience, not heat.',
      updatedAt: '2026-05-05T10:00:00Z',
    },
  ])

  it('matches by customer name', () => {
    const out = searchCustomerFilesList(sampleRows, 'anna')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'cf-anna')
  })

  it('matches by phone number substring', () => {
    const out = searchCustomerFilesList(sampleRows, '2200')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'cf-tom')
  })

  it('matches by email substring', () => {
    const out = searchCustomerFilesList(sampleRows, 'rebecca@')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'cf-rebecca')
  })

  it('matches by city / address', () => {
    const out = searchCustomerFilesList(sampleRows, 'Rockford')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'cf-anna')
  })

  it('matches setup / project / reason text', () => {
    const out = searchCustomerFilesList(sampleRows, 'vent-free')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'cf-tom')
  })

  it('case-insensitive', () => {
    assert.equal(searchCustomerFilesList(sampleRows, 'ROCKFORD').length, 1)
  })

  it('empty query returns the list unchanged', () => {
    assert.equal(searchCustomerFilesList(sampleRows, '').length, sampleRows.length)
    assert.equal(searchCustomerFilesList(sampleRows, '   ').length, sampleRows.length)
  })

  it('no matches → empty array', () => {
    assert.deepEqual(searchCustomerFilesList(sampleRows, 'zzz-nothing'), [])
  })
})

describe('recentCustomerFiles — Today projection', () => {
  const fixtures = [
    { id: 'cf-1', customerName: 'A', updatedAt: '2026-05-01T10:00:00Z' },
    { id: 'cf-2', customerName: 'B', updatedAt: '2026-05-08T10:00:00Z' },
    { id: 'cf-3', customerName: 'C', updatedAt: '2026-05-04T10:00:00Z' },
    { id: 'cf-4', customerName: 'D', updatedAt: '2026-05-07T10:00:00Z' },
    { id: 'cf-5', customerName: 'E', updatedAt: '2026-05-02T10:00:00Z' },
    { id: 'cf-6', customerName: 'F', updatedAt: '2026-05-06T10:00:00Z' },
  ]

  it('returns most-recently-updated first', () => {
    const out = recentCustomerFiles(fixtures, 3)
    assert.deepEqual(out.map((r) => r.id), ['cf-2', 'cf-4', 'cf-6'])
  })

  it('caps at the requested limit (default 4)', () => {
    assert.equal(recentCustomerFiles(fixtures).length, 4)
    assert.equal(recentCustomerFiles(fixtures, 5).length, 5)
    assert.equal(recentCustomerFiles(fixtures, 100).length, fixtures.length)
  })

  it('treats invalid limit as zero (returns empty array)', () => {
    assert.deepEqual(recentCustomerFiles(fixtures, 0), [])
    assert.deepEqual(recentCustomerFiles(fixtures, -2), [])
    assert.deepEqual(recentCustomerFiles(fixtures, NaN), [])
  })

  it('empty durable list returns empty array', () => {
    assert.deepEqual(recentCustomerFiles([], 4), [])
    assert.deepEqual(recentCustomerFiles(null, 4), [])
  })

  it('preserves the file id so Today can route to detail', () => {
    const out = recentCustomerFiles([
      { id: 'cf-keep', customerName: 'Keep', updatedAt: '2026-05-08T10:00:00Z' },
    ], 4)
    assert.equal(out[0].id, 'cf-keep')
  })

  it('survives missing optional fields', () => {
    const out = recentCustomerFiles([
      { id: 'cf-bare', customerName: 'Bare' },
    ], 4)
    assert.equal(out.length, 1)
    assert.equal(out[0].customerName, 'Bare')
  })

  it('does not surface sensitive keys', () => {
    const out = recentCustomerFiles([{
      id: 'cf-1', customerName: 'X', updatedAt: '2026-05-08T10:00:00Z',
      cost: 1, margin: 0.4, buyPrice: 50, supplierTotal: 500,
      rawOcr: 'r', rawPdf: 'r', bistrackConfidence: 0.7,
      fuzzyMatchConfidence: 0.9, ocrConfidence: 0.5,
      salesRank: 1, productRank: 2,
    }], 4)
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'rawOcr', 'rawPdf',
      'bistrackConfidence', 'fuzzyMatchConfidence', 'ocrConfidence',
      'salesRank', 'productRank',
    ]) {
      assert.equal(k in out[0], false, `${k} leaked into Today row`)
    }
  })
})

describe('listCustomerFilesDurable → projectCustomerFilesList round-trip', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('saving multiple files surfaces them on the list, sorted recent first', async () => {
    await saveCustomerFileDurable(storage, { id: 'cf-1', customerName: 'A' }, new Date('2026-05-01T10:00:00Z'))
    await saveCustomerFileDurable(storage, { id: 'cf-2', customerName: 'B' }, new Date('2026-05-08T10:00:00Z'))
    await saveCustomerFileDurable(storage, { id: 'cf-3', customerName: 'C' }, new Date('2026-05-04T10:00:00Z'))
    const raw = await listCustomerFilesDurable(storage)
    const rows = projectCustomerFilesList(raw)
    assert.deepEqual(rows.map((r) => r.id), ['cf-2', 'cf-3', 'cf-1'])
    assert.deepEqual(rows.map((r) => r.customerName), ['B', 'C', 'A'])
  })
})

describe('customerFilesList — quotePrep status + filter (Milestone 14)', () => {
  function readyFile(extra = {}) {
    return {
      id: 'cf-ready',
      customerName: 'Ready Customer',
      customerPhone: '5550001',
      customerGoal: 'More heat',
      lensSetupType: 'masonry-fireplace',
      lensFuelGasPresent: 'yes',
      quotePrepQuoteType: 'planning',
      quotePrepLines: [
        { id: 'l1', name: 'Line', sourceBasis: 'manual_entry', reviewStatus: 'ready_for_bistrack' },
      ],
      ...extra,
    }
  }

  it('row carries a quotePrep block with status, label, hasLines, counts', () => {
    const row = projectCustomerFileForList(readyFile())
    assert.ok(row.quotePrep, 'quotePrep missing')
    assert.equal(row.quotePrep.status, 'ready')
    assert.equal(row.quotePrep.label, 'Ready to build in BisTrack')
    assert.equal(row.quotePrep.hasLines, true)
    assert.equal(row.quotePrep.counts.total, 1)
    assert.equal(row.quotePrep.counts.readyForBistrack, 1)
  })

  it('not-started file gets draft status with hasLines false', () => {
    const row = projectCustomerFileForList({ id: 'cf-empty', customerName: 'Empty', customerPhone: '5' })
    assert.equal(row.quotePrep.status, 'draft')
    assert.equal(row.quotePrep.hasLines, false)
    assert.equal(row.quotePrep.counts.total, 0)
  })

  it('filter "all" returns every row', () => {
    const rows = projectCustomerFilesList([
      readyFile(),
      { id: 'cf-empty', customerName: 'Empty', customerPhone: '5' },
    ])
    assert.equal(filterCustomerFilesListByQuotePrep(rows, 'all').length, 2)
  })

  it('filter "ready" returns only ready files', () => {
    const rows = projectCustomerFilesList([
      readyFile(),
      { id: 'cf-empty', customerName: 'Empty', customerPhone: '5' },
    ])
    const out = filterCustomerFilesListByQuotePrep(rows, 'ready')
    assert.equal(out.length, 1)
    assert.equal(out[0].customerName, 'Ready Customer')
  })

  it('filter "notStarted" returns drafts/empty files', () => {
    const rows = projectCustomerFilesList([
      readyFile(),
      { id: 'cf-empty', customerName: 'Empty', customerPhone: '5' },
    ])
    const out = filterCustomerFilesListByQuotePrep(rows, 'notStarted')
    assert.equal(out.length, 1)
    assert.equal(out[0].customerName, 'Empty')
  })

  it('filter "needsVerification" returns only needs-verification files', () => {
    const rows = projectCustomerFilesList([
      readyFile(),
      {
        id: 'cf-mid', customerName: 'Mid', customerPhone: '5',
        // line exists but quote type unknown → needs verification
        quotePrepLines: [{ id: 'l1', name: 'Line', sourceBasis: 'manual_entry', reviewStatus: 'ready_for_bistrack' }],
        customerGoal: 'g', lensSetupType: 'masonry-fireplace',
      },
    ])
    const out = filterCustomerFilesListByQuotePrep(rows, 'needsVerification')
    assert.equal(out.length, 1)
    assert.equal(out[0].customerName, 'Mid')
  })

  it('search and filter compose: search narrows then filter narrows', () => {
    const rows = projectCustomerFilesList([
      readyFile({ customerName: 'Ready Anna' }),
      readyFile({ id: 'cf-ready-2', customerName: 'Ready Bob' }),
      { id: 'cf-anna-empty', customerName: 'Empty Anna', customerPhone: '5' },
    ])
    const searched = searchCustomerFilesList(rows, 'anna')
    const filtered = filterCustomerFilesListByQuotePrep(searched, 'ready')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].customerName, 'Ready Anna')
  })

  it('unknown filter values fall back to "all"', () => {
    const rows = projectCustomerFilesList([
      readyFile(),
      { id: 'cf-empty', customerName: 'Empty', customerPhone: '5' },
    ])
    assert.equal(filterCustomerFilesListByQuotePrep(rows, 'totally-bogus').length, rows.length)
  })

  it('filter values list is exposed for the UI', () => {
    assert.ok(QUOTE_PREP_FILTER_VALUES.includes('all'))
    assert.ok(QUOTE_PREP_FILTER_VALUES.includes('ready'))
    assert.ok(QUOTE_PREP_FILTER_VALUES.includes('needsVerification'))
    assert.ok(QUOTE_PREP_FILTER_VALUES.includes('notStarted'))
  })

  it('quotePrep block does not surface sensitive keys', () => {
    const row = projectCustomerFileForList({
      ...readyFile(),
      cost: 9999, margin: 0.5, supplierTotal: 100,
      bistrackConfidence: '0.7', rawOcr: 'noise',
    })
    const flat = JSON.stringify(row.quotePrep).toLowerCase()
    for (const phrase of ['"cost"', '"margin"', '"suppliertotal"', '"rawocr"', '"bistrackconfidence"']) {
      assert.equal(flat.includes(phrase), false, `leaked: ${phrase}`)
    }
  })
})
