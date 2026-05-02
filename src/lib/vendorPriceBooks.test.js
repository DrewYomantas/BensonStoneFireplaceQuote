import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  categoryOptions,
  filterVendors,
  getPriceBookPath,
  getVendorCategoryCounts,
  listVendors,
  loadVendorNotes,
  matchVendorToQuote,
  mergeVendorNotes,
  PRICE_BOOK_FOLDER,
  PRICING_HIERARCHY,
  saveVendorNote,
} from './vendorPriceBooks.js'

const vendors = listVendors()

describe('listVendors', () => {
  it('returns a non-empty array', () => {
    assert.ok(Array.isArray(vendors))
    assert.ok(vendors.length > 0)
  })

  it('every vendor has required fields', () => {
    for (const vendor of vendors) {
      assert.ok(vendor.id, `missing id: ${JSON.stringify(vendor)}`)
      assert.ok(vendor.name, `missing name: ${vendor.id}`)
      assert.ok(vendor.category, `missing category: ${vendor.id}`)
      assert.ok(vendor.priceListFile, `missing priceListFile: ${vendor.id}`)
      assert.ok(vendor.priceListDate, `missing priceListDate: ${vendor.id}`)
      assert.ok(Array.isArray(vendor.aliases), `missing aliases: ${vendor.id}`)
    }
  })

  it('every vendor category is a known category', () => {
    const validCategories = categoryOptions.map((c) => c.value).filter((v) => v !== 'all')
    for (const vendor of vendors) {
      assert.ok(
        validCategories.includes(vendor.category),
        `unknown category "${vendor.category}" for ${vendor.id}`,
      )
    }
  })

  it('ids are unique', () => {
    const ids = vendors.map((v) => v.id)
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length)
  })
})

describe('filterVendors', () => {
  it('returns all vendors when category is all and search is empty', () => {
    const result = filterVendors(vendors, 'all', '')
    assert.equal(result.length, vendors.length)
  })

  it('filters by category', () => {
    const gasVendors = filterVendors(vendors, 'gas-fireplace', '')
    assert.ok(gasVendors.length > 0)
    assert.ok(gasVendors.every((v) => v.category === 'gas-fireplace'))
  })

  it('returns empty array for unknown category with no matches', () => {
    const result = filterVendors(vendors, 'electric', 'woodstove-brand-xyz')
    assert.equal(result.length, 0)
  })

  it('filters by search text matching vendor name', () => {
    const result = filterVendors(vendors, 'all', 'kingsman')
    assert.ok(result.length >= 1)
    assert.ok(result.some((v) => v.id === 'kingsman'))
  })

  it('filters by search text matching price list filename', () => {
    const result = filterVendors(vendors, 'all', 'march 2026')
    assert.ok(result.length > 0)
  })

  it('search is case-insensitive', () => {
    const lower = filterVendors(vendors, 'all', 'empire')
    const upper = filterVendors(vendors, 'all', 'EMPIRE')
    assert.equal(lower.length, upper.length)
  })

  it('returns empty when search matches nothing', () => {
    const result = filterVendors(vendors, 'all', 'zzznomatchvendor')
    assert.equal(result.length, 0)
  })
})

describe('getVendorCategoryCounts', () => {
  it('returns counts for every category option', () => {
    const counts = getVendorCategoryCounts(vendors, '')
    for (const { value } of categoryOptions) {
      assert.ok(value in counts, `missing count for ${value}`)
      assert.ok(typeof counts[value] === 'number')
    }
  })

  it('all-category count equals total vendors', () => {
    const counts = getVendorCategoryCounts(vendors, '')
    assert.equal(counts.all, vendors.length)
  })

  it('category sub-counts sum to at most total vendors', () => {
    const counts = getVendorCategoryCounts(vendors, '')
    const subTotal = categoryOptions
      .filter((c) => c.value !== 'all')
      .reduce((sum, c) => sum + counts[c.value], 0)
    assert.equal(subTotal, vendors.length)
  })
})

describe('loadVendorNotes / saveVendorNote', () => {
  it('returns empty object when storage is empty', () => {
    const storage = { getItem: () => null, setItem: () => {} }
    const notes = loadVendorNotes(storage)
    assert.deepEqual(notes, {})
  })

  it('returns empty object when storage throws', () => {
    const storage = {
      getItem: () => { throw new Error('fail') },
      setItem: () => {},
    }
    const notes = loadVendorNotes(storage)
    assert.deepEqual(notes, {})
  })

  it('round-trips a saved note', () => {
    const store = {}
    const storage = {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = val },
    }
    saveVendorNote('kingsman', 'Great warranty coverage', storage)
    const notes = loadVendorNotes(storage)
    assert.equal(notes['kingsman'], 'Great warranty coverage')
  })

  it('overwrites an existing note', () => {
    const store = {}
    const storage = {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = val },
    }
    saveVendorNote('empire-gas', 'First note', storage)
    saveVendorNote('empire-gas', 'Updated note', storage)
    const notes = loadVendorNotes(storage)
    assert.equal(notes['empire-gas'], 'Updated note')
  })

  it('does not touch other vendor notes when saving', () => {
    const store = {}
    const storage = {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = val },
    }
    saveVendorNote('hargrove-vented', 'Note A', storage)
    saveVendorNote('marquis', 'Note B', storage)
    const notes = loadVendorNotes(storage)
    assert.equal(notes['hargrove-vented'], 'Note A')
    assert.equal(notes['marquis'], 'Note B')
  })
})

describe('mergeVendorNotes', () => {
  it('adds empty userNote when no notes exist', () => {
    const merged = mergeVendorNotes(vendors, {})
    assert.ok(merged.every((v) => 'userNote' in v))
    assert.ok(merged.every((v) => v.userNote === ''))
  })

  it('attaches saved note to correct vendor', () => {
    const notes = { 'kozy-heat': 'Good heat output' }
    const merged = mergeVendorNotes(vendors, notes)
    const vendor = merged.find((v) => v.id === 'kozy-heat')
    assert.equal(vendor.userNote, 'Good heat output')
  })

  it('does not mutate original vendor objects', () => {
    const original = vendors.find((v) => v.id === 'marquis')
    const notes = { marquis: 'Some note' }
    mergeVendorNotes(vendors, notes)
    assert.ok(!('userNote' in original))
  })
})

describe('matchVendorToQuote', () => {
  it('returns empty array when quote has no text', () => {
    const matched = matchVendorToQuote(vendors, { fields: {}, lineItems: [] })
    assert.deepEqual(matched, [])
  })

  it('matches vendor by name in project title', () => {
    const matched = matchVendorToQuote(vendors, {
      fields: { PROJECT_TITLE: 'Kingsman direct vent installation' },
      lineItems: [],
    })
    assert.ok(matched.some((v) => v.aliases.includes('kingsman')))
  })

  it('matches vendor by alias in line item description', () => {
    const matched = matchVendorToQuote(vendors, {
      fields: {},
      lineItems: [{ description: 'Hargrove 24" vented gas log set' }],
    })
    assert.ok(matched.some((v) => v.aliases.includes('hargrove')))
  })

  it('deduplicates vendors from the same family', () => {
    const matched = matchVendorToQuote(vendors, {
      fields: { PROJECT_TITLE: 'Travis Lopi insert install' },
      lineItems: [],
    })
    const travisMatches = matched.filter((v) => v.aliases[0] === 'travis')
    assert.equal(travisMatches.length, 1)
  })

  it('matches multiple vendors from the same quote', () => {
    const matched = matchVendorToQuote(vendors, {
      fields: { PROJECT_TITLE: 'Empire gas fireplace with Stoll glass door' },
      lineItems: [],
    })
    const families = new Set(matched.map((v) => v.aliases[0] || v.id))
    assert.ok(families.has('empire'))
    assert.ok(families.has('stoll'))
  })

  it('does not match on empty alias strings', () => {
    const fakeVendors = [{ id: 'test', name: 'Test', aliases: [''], category: 'accessories', priceListFile: 'test.pdf', priceListDate: '2025', priceListYear: 2025, internalNote: '' }]
    const matched = matchVendorToQuote(fakeVendors, {
      fields: { PROJECT_TITLE: 'anything' },
      lineItems: [],
    })
    assert.equal(matched.length, 0)
  })
})

describe('getPriceBookPath', () => {
  it('returns folder + filename', () => {
    const vendor = vendors.find((v) => v.id === 'kingsman')
    const path = getPriceBookPath(vendor)
    assert.ok(path.includes(PRICE_BOOK_FOLDER))
    assert.ok(path.includes(vendor.priceListFile))
  })
})

describe('safety — no pricing data in customer-facing context', () => {
  it('vendor note fields are never exposed by matchVendorToQuote output', () => {
    const matched = matchVendorToQuote(vendors, {
      fields: { PROJECT_TITLE: 'Kingsman insert' },
      lineItems: [],
    })
    for (const v of matched) {
      const text = JSON.stringify(v).toLowerCase()
      assert.ok(!text.includes('dealer cost'), 'dealer cost must not appear in match output')
    }
  })

  it('PRICING_HIERARCHY does not contain customer-facing language', () => {
    for (const line of PRICING_HIERARCHY) {
      const lower = line.toLowerCase()
      assert.ok(!lower.includes('margin'), 'margin must not appear in pricing hierarchy')
      assert.ok(!lower.includes('buy price'), 'buy price must not appear')
      assert.ok(!lower.includes('cost price'), 'cost price must not appear')
    }
  })
})
