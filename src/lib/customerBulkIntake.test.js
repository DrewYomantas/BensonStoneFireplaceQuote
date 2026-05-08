import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  parseBulkIntakeText,
  normalizeBulkIntakeDraft,
  detectDuplicate,
  buildBulkIntakeReview,
  commitBulkIntakeDrafts,
  STATUS_LABELS,
} from './customerBulkIntake.js'
import { listCustomerFilesDurable } from './customerFileDurable.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

// ---- parseBulkIntakeText ---------------------------------------------------

describe('parseBulkIntakeText — CSV', () => {
  it('parses basic CSV with headers', () => {
    const text = 'name,phone,email\nJohn Smith,555-1234,john@example.com'
    const { headers, rows } = parseBulkIntakeText(text)
    assert.equal(headers.length, 3)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]['name'], 'John Smith')
    assert.equal(rows[0]['phone'], '555-1234')
    assert.equal(rows[0]['email'], 'john@example.com')
  })

  it('parses multiple CSV rows', () => {
    const text = 'name,phone\nAlice,555-0001\nBob,555-0002'
    const { rows } = parseBulkIntakeText(text)
    assert.equal(rows.length, 2)
    assert.equal(rows[0]['name'], 'Alice')
    assert.equal(rows[1]['name'], 'Bob')
  })

  it('parses quoted fields containing commas', () => {
    const text = 'name,address\n"Smith, John","123 Main St, Rockford"'
    const { rows } = parseBulkIntakeText(text)
    assert.equal(rows[0]['name'], 'Smith, John')
    assert.equal(rows[0]['address'], '123 Main St, Rockford')
  })

  it('returns empty for empty string', () => {
    const { headers, rows } = parseBulkIntakeText('')
    assert.equal(headers.length, 0)
    assert.equal(rows.length, 0)
  })

  it('returns empty for null', () => {
    const { headers, rows } = parseBulkIntakeText(null)
    assert.equal(headers.length, 0)
    assert.equal(rows.length, 0)
  })

  it('returns empty for header-only input', () => {
    const { rows } = parseBulkIntakeText('name,phone,email')
    assert.equal(rows.length, 0)
  })
})

describe('parseBulkIntakeText — TSV (pasted tabular text)', () => {
  it('parses tab-separated text', () => {
    const text = 'name\tphone\temail\nJane Doe\t555-9876\tjane@example.com'
    const { rows } = parseBulkIntakeText(text)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]['name'], 'Jane Doe')
    assert.equal(rows[0]['phone'], '555-9876')
  })

  it('auto-detects TSV when tabs outnumber commas', () => {
    const text = 'first name\tlast name\tphone\nBob\tJones\t555-1111'
    const { rows } = parseBulkIntakeText(text)
    assert.equal(rows[0]['first name'], 'Bob')
    assert.equal(rows[0]['last name'], 'Jones')
  })
})

// ---- normalizeBulkIntakeDraft — header aliases -----------------------------

describe('normalizeBulkIntakeDraft — header aliases', () => {
  it('maps "customer name" alias to customerName', () => {
    const row = { 'customer name': 'Alice Brown' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerName, 'Alice Brown')
  })

  it('maps "full name" alias to customerName', () => {
    const row = { 'full name': 'Carol White' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerName, 'Carol White')
  })

  it('combines first name and last name into customerName', () => {
    const row = { 'first name': 'Bob', 'last name': 'Jones' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerName, 'Bob Jones')
  })

  it('maps "mobile" alias to customerPhone', () => {
    const row = { 'name': 'Test', 'mobile': '555-0001' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerPhone, '555-0001')
  })

  it('maps "cell" alias to customerPhone', () => {
    const row = { 'name': 'Test', 'cell': '555-0002' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerPhone, '555-0002')
  })

  it('maps "e-mail" alias to customerEmail', () => {
    const row = { 'name': 'Test', 'e-mail': 'test@test.com' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerEmail, 'test@test.com')
  })

  it('maps "email address" alias to customerEmail', () => {
    const row = { 'name': 'Test', 'email address': 'addr@test.com' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerEmail, 'addr@test.com')
  })

  it('combines street, city, state, zip into projectAddress', () => {
    const row = { 'name': 'Test', 'street': '123 Main St', 'city': 'Rockford', 'state': 'IL', 'zip': '61104' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.ok(draft.projectAddress.includes('123 Main St'))
    assert.ok(draft.projectAddress.includes('Rockford'))
    assert.ok(draft.projectAddress.includes('IL'))
    assert.ok(draft.projectAddress.includes('61104'))
  })

  it('maps "goal" header to customerGoal', () => {
    const row = { 'name': 'Test', 'phone': '555-0001', 'goal': 'Replace gas fireplace' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.customerGoal, 'Replace gas fireplace')
  })

  it('maps "project" header to existingNotes', () => {
    const row = { 'name': 'Test', 'phone': '555-0001', 'project': 'Masonry insert replacement' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.equal(draft.existingNotes, 'Masonry insert replacement')
  })

  it('ignores "source" column (not persisted)', () => {
    const row = { 'name': 'Test', 'phone': '555-0001', 'source': 'Walk-in referral' }
    const draft = normalizeBulkIntakeDraft(row)
    assert.ok(!('source' in draft))
    assert.ok(!('_sourceIgnored' in draft))
  })

  it('does not mutate the input row', () => {
    const row = Object.freeze({ 'name': 'Frozen User', 'phone': '555-0001' })
    assert.doesNotThrow(() => normalizeBulkIntakeDraft(row))
  })

  it('returns null for non-object input', () => {
    assert.equal(normalizeBulkIntakeDraft(null), null)
    assert.equal(normalizeBulkIntakeDraft('string'), null)
    assert.equal(normalizeBulkIntakeDraft([]), null)
  })
})

// ---- detectDuplicate -------------------------------------------------------

describe('detectDuplicate — phone', () => {
  it('detects hard duplicate by normalized phone', () => {
    const existing = [{ id: 'cf-1', customerName: 'Alice', customerPhone: '5551234567', customerEmail: '' }]
    const draft = { customerName: 'Alice B', customerPhone: '(555) 123-4567', customerEmail: '' }
    const dup = detectDuplicate(draft, existing)
    assert.ok(dup)
    assert.equal(dup.kind, 'phone')
    assert.equal(dup.existingId, 'cf-1')
  })

  it('does not match when both phones are empty', () => {
    const existing = [{ id: 'cf-2', customerName: 'Bob', customerPhone: '', customerEmail: '' }]
    const draft = { customerName: 'Carol', customerPhone: '', customerEmail: 'carol@x.com' }
    const dup = detectDuplicate(draft, existing)
    assert.equal(dup, null)
  })
})

describe('detectDuplicate — email', () => {
  it('detects hard duplicate by case-insensitive email', () => {
    const existing = [{ id: 'cf-10', customerName: 'Dave', customerPhone: '', customerEmail: 'dave@example.com' }]
    const draft = { customerName: 'David', customerPhone: '', customerEmail: 'DAVE@EXAMPLE.COM' }
    const dup = detectDuplicate(draft, existing)
    assert.ok(dup)
    assert.equal(dup.kind, 'email')
    assert.equal(dup.existingId, 'cf-10')
  })

  it('does not match when both emails are empty', () => {
    const existing = [{ id: 'cf-11', customerName: 'Eve', customerPhone: '', customerEmail: '' }]
    const draft = { customerName: 'Frank', customerPhone: '5559999', customerEmail: '' }
    const dup = detectDuplicate(draft, existing)
    assert.equal(dup, null)
  })
})

describe('detectDuplicate — soft name match', () => {
  it('detects soft duplicate by name when no contact matches', () => {
    const existing = [{ id: 'cf-20', customerName: 'Carol Smith', customerPhone: '', customerEmail: '' }]
    const draft = { customerName: 'Carol Smith', customerPhone: '', customerEmail: '' }
    const dup = detectDuplicate(draft, existing)
    assert.ok(dup)
    assert.equal(dup.kind, 'name')
  })

  it('returns null when names differ', () => {
    const existing = [{ id: 'cf-21', customerName: 'Grace', customerPhone: '', customerEmail: '' }]
    const draft = { customerName: 'Henry', customerPhone: '', customerEmail: '' }
    const dup = detectDuplicate(draft, existing)
    assert.equal(dup, null)
  })

  it('returns null when no existing files', () => {
    const draft = { customerName: 'Ivy Lee', customerPhone: '5551111', customerEmail: 'ivy@x.com' }
    assert.equal(detectDuplicate(draft, []), null)
  })

  it('returns null for null existing files', () => {
    const draft = { customerName: 'Jack', customerPhone: '5552222', customerEmail: '' }
    assert.equal(detectDuplicate(draft, null), null)
  })
})

// ---- buildBulkIntakeReview — missing field detection ----------------------

describe('buildBulkIntakeReview — missing field detection', () => {
  it('flags missing name', () => {
    const text = 'name,phone\n,555-1234'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'missing-name')
    assert.equal(rows[0].statusLabel, STATUS_LABELS['missing-name'])
  })

  it('flags missing contact when phone and email both absent', () => {
    const text = 'name,phone,email\nAlice,,'
    const rows = buildBulkIntakeReview(text, [])
    const r = rows.find((row) => row.customerName === 'Alice')
    assert.ok(r, 'expected a row for Alice')
    assert.equal(r.status, 'missing-contact')
    assert.equal(r.statusLabel, STATUS_LABELS['missing-contact'])
  })

  it('marks ready when name + phone present', () => {
    const text = 'name,phone\nBob Smith,555-1234'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].status, 'ready')
    assert.equal(rows[0].statusLabel, STATUS_LABELS.ready)
  })

  it('marks ready when name + email present (no phone)', () => {
    const text = 'name,email\nCarol,carol@test.com'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].status, 'ready')
  })
})

// ---- buildBulkIntakeReview — duplicate detection --------------------------

describe('buildBulkIntakeReview — duplicate detection', () => {
  it('marks phone duplicate as duplicate status', () => {
    const existing = [{ id: 'cf-30', customerName: 'Henry', customerPhone: '5551111111', customerEmail: '' }]
    const text = 'name,phone\nHenry B,(555) 111-1111'
    const rows = buildBulkIntakeReview(text, existing)
    assert.equal(rows[0].status, 'duplicate')
    assert.ok(rows[0].duplicateInfo)
    assert.equal(rows[0].duplicateInfo.kind, 'phone')
  })

  it('marks email duplicate as duplicate status', () => {
    const existing = [{ id: 'cf-31', customerName: 'Iris', customerPhone: '', customerEmail: 'iris@x.com' }]
    const text = 'name,phone,email\nIris B,555-9876,IRIS@X.COM'
    const rows = buildBulkIntakeReview(text, existing)
    assert.equal(rows[0].status, 'duplicate')
    assert.equal(rows[0].duplicateInfo.kind, 'email')
  })

  it('marks name-only match as duplicate-soft', () => {
    const existing = [{ id: 'cf-32', customerName: 'Jack Lee', customerPhone: '', customerEmail: '' }]
    const text = 'name,phone,email\nJack Lee,555-2222,jack@x.com'
    const rows = buildBulkIntakeReview(text, existing)
    assert.equal(rows[0].status, 'duplicate-soft')
    assert.equal(rows[0].statusLabel, STATUS_LABELS['duplicate-soft'])
  })
})

// ---- buildBulkIntakeReview — scrub safety ---------------------------------

describe('buildBulkIntakeReview — scrub safety', () => {
  it('scrubs banned phrase from customerGoal', () => {
    const text = 'name,phone,goal\nJack,555-3333,ready to send proposal'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].customerGoal, '')
  })

  it('scrubs "approved" banned phrase from existingNotes', () => {
    const text = 'name,phone,notes\nKaren,555-4444,approved by liam'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].existingNotes, '')
  })

  it('scrubs sensitive term "product rank" from existingNotes', () => {
    const text = 'name,phone,notes\nLarry,555-5555,product rank 5 out of 10'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].existingNotes, '')
  })

  it('scrubs "margin" from customerGoal', () => {
    const text = 'name,phone,goal\nMaria,555-6666,improve margin on install'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0].customerGoal, '')
  })

  it('does not add file path fields to draft', () => {
    const text = 'name,phone\nKyle,555-7777'
    const rows = buildBulkIntakeReview(text, [])
    const r = rows[0]
    assert.ok(!('filePath' in r))
    assert.ok(!('rawPdf' in r))
    assert.ok(!('rawOcr' in r))
  })
})

// ---- buildBulkIntakeReview — edge cases ------------------------------------

describe('buildBulkIntakeReview — edge cases', () => {
  it('returns empty array for empty input', () => {
    assert.equal(buildBulkIntakeReview('', []).length, 0)
  })

  it('returns empty array for header-only input', () => {
    assert.equal(buildBulkIntakeReview('name,phone,email', []).length, 0)
  })

  it('handles null existingFiles gracefully', () => {
    const text = 'name,phone\nLena,555-8888'
    assert.doesNotThrow(() => buildBulkIntakeReview(text, null))
  })

  it('row _id is unique across rows', () => {
    const text = 'name,phone\nAlpha,555-0001\nBeta,555-0002\nGamma,555-0003'
    const rows = buildBulkIntakeReview(text, [])
    const ids = rows.map((r) => r._id)
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length)
  })

  it('preserves row number in _row', () => {
    const text = 'name,phone\nFirst,555-0001\nSecond,555-0002'
    const rows = buildBulkIntakeReview(text, [])
    assert.equal(rows[0]._row, 1)
    assert.equal(rows[1]._row, 2)
  })
})

// ---- commitBulkIntakeDrafts ------------------------------------------------

describe('commitBulkIntakeDrafts — import behavior', () => {
  it('imports selected drafts as new Customer Files', async () => {
    const storage = makeStorage()
    const text = 'name,phone,email\nNora Green,555-0010,nora@test.com\nOliver Brown,555-0011,oliver@test.com'
    const rows = buildBulkIntakeReview(text, [])
    const { imported, errors } = await commitBulkIntakeDrafts(rows, storage)
    assert.equal(errors.length, 0)
    assert.equal(imported.length, 2)
    assert.equal(imported[0].customerName, 'Nora Green')
    assert.equal(imported[1].customerName, 'Oliver Brown')
  })

  it('only imports drafts in selectedDrafts (selection excludes others)', async () => {
    const storage = makeStorage()
    const text = 'name,phone\nPatrick,555-0020\nQuinn,555-0021\nRachel,555-0022'
    const allRows = buildBulkIntakeReview(text, [])
    const selected = [allRows[0]] // only first row
    const { imported } = await commitBulkIntakeDrafts(selected, storage)
    assert.equal(imported.length, 1)
    assert.equal(imported[0].customerName, 'Patrick')
    const all = await listCustomerFilesDurable(storage)
    assert.equal(all.length, 1)
  })

  it('skips drafts with missing name', async () => {
    const storage = makeStorage()
    const noName = { _id: 'bulk-draft-1', customerName: '', customerPhone: '555-0099' }
    const { imported } = await commitBulkIntakeDrafts([noName], storage)
    assert.equal(imported.length, 0)
  })

  it('persists customerName, customerPhone, customerEmail, projectAddress', async () => {
    const storage = makeStorage()
    const draft = {
      _id: 'bulk-draft-1',
      customerName: 'Sam Taylor',
      customerPhone: '555-1234',
      customerEmail: 'sam@test.com',
      projectAddress: '456 Oak Ave, Rockford, IL',
      existingNotes: '',
      customerGoal: '',
    }
    const { imported } = await commitBulkIntakeDrafts([draft], storage)
    assert.equal(imported[0].customerName, 'Sam Taylor')
    assert.equal(imported[0].customerPhone, '555-1234')
    assert.equal(imported[0].customerEmail, 'sam@test.com')
    assert.equal(imported[0].projectAddress, '456 Oak Ave, Rockford, IL')
  })

  it('each imported file gets a unique ID (no silent merge)', async () => {
    const storage = makeStorage()
    const rows = [
      { _id: 'bulk-draft-1', customerName: 'Tina Lee', customerPhone: '555-2222', customerEmail: '' },
      { _id: 'bulk-draft-2', customerName: 'Tina Lee', customerPhone: '555-2222', customerEmail: '' },
    ]
    const { imported } = await commitBulkIntakeDrafts(rows, storage, new Date('2026-05-10T10:00:00Z'))
    assert.equal(imported.length, 2)
    assert.notEqual(imported[0].id, imported[1].id)
  })

  it('returns empty result for empty selectedDrafts', async () => {
    const storage = makeStorage()
    const { imported, errors } = await commitBulkIntakeDrafts([], storage)
    assert.equal(imported.length, 0)
    assert.equal(errors.length, 0)
  })

  it('returns empty result when storage is null', async () => {
    const { imported, errors } = await commitBulkIntakeDrafts([{ customerName: 'Test' }], null)
    assert.equal(imported.length, 0)
    assert.equal(errors.length, 0)
  })
})
