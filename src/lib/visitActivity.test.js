import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_KINDS,
  normalizeActivityEvent,
  normalizeActivityEvents,
  projectActivityForFile,
  safeActivitySummary,
  normalizeFollowUp,
  describeFollowUp,
  isFollowUpDueOrOverdue,
  listActivityForFile,
  appendActivityForFile,
  getFollowUpForFile,
  saveFollowUpForFile,
  clearFollowUpForFile,
} from './visitActivity.js'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'

function makeStorage() {
  return createSalesOsStorage({ engine: createMemoryEngine() })
}

describe('visitActivity — normalize + scrub', () => {
  it('rejects events with no fileId or unknown kind', () => {
    assert.equal(normalizeActivityEvent(null), null)
    assert.equal(normalizeActivityEvent({ kind: 'visit_started' }), null)
    assert.equal(normalizeActivityEvent({ fileId: 'cf-1', kind: 'unknown_kind' }), null)
  })

  it('preserves caller-supplied id and at for determinism', () => {
    const ev = normalizeActivityEvent({
      id: 'fixed-1',
      fileId: 'cf-1',
      kind: 'visit_started',
      at: '2026-05-08T10:00:00.000Z',
      summary: 'Walk-in.',
    })
    assert.equal(ev.id, 'fixed-1')
    assert.equal(ev.at, '2026-05-08T10:00:00.000Z')
    assert.equal(ev.kind, 'visit_started')
    assert.equal(ev.summary, 'Walk-in.')
  })

  it('auto-generates a stable-shaped id when none is supplied', () => {
    const ev = normalizeActivityEvent({
      fileId: 'cf-1', kind: 'manual_note', summary: 'Note.',
    })
    assert.match(ev.id, /^act-/)
  })

  it('all known kinds are accepted', () => {
    for (const kind of ACTIVITY_KINDS) {
      const ev = normalizeActivityEvent({ fileId: 'cf-x', kind })
      assert.ok(ev, `kind rejected: ${kind}`)
    }
  })

  it('strips banned customer-facing phrases from summaries', () => {
    const banned = ['ready to send', 'proposal ready', 'customer ready', 'approved']
    for (const phrase of banned) {
      const ev = normalizeActivityEvent({
        fileId: 'cf-1', kind: 'manual_note', summary: `Quote ${phrase} now.`,
      })
      assert.equal(ev.summary, '', `leaked phrase: ${phrase}`)
    }
  })

  it('strips sensitive keywords from free-text summaries', () => {
    const cases = [
      'cost is 1200',
      'margin notes',
      'buy price detail',
      'supplier total',
      'raw OCR text',
      'BisTrack confidence high',
      'OCR confidence low',
      'fuzzy match suspect',
      'sales rank top',
      'product rank middle',
    ]
    for (const text of cases) {
      assert.equal(safeActivitySummary(text), '', `leaked: ${text}`)
    }
  })

  it('strips sensitive keys from the event object boundary', () => {
    const ev = normalizeActivityEvent({
      fileId: 'cf-1', kind: 'manual_note', summary: 'Note.',
      cost: 999, margin: 0.5, buyPrice: 50, supplierTotal: 100,
      bistrackConfidence: '0.7', rawOcr: 'noise', salesRank: 1,
    })
    for (const k of ['cost', 'margin', 'buyPrice', 'supplierTotal', 'bistrackConfidence', 'rawOcr', 'salesRank']) {
      assert.equal(k in ev, false, `leaked: ${k}`)
    }
    assert.equal(ev.summary, 'Note.')
  })

  it('normalizeActivityEvents drops invalid entries silently', () => {
    const out = normalizeActivityEvents([
      null,
      { kind: 'visit_started' },
      { fileId: 'cf-1', kind: 'visit_started' },
      { fileId: 'cf-2', kind: 'manual_note', summary: 'ok' },
      'string-noise',
    ])
    assert.equal(out.length, 2)
  })
})

describe('visitActivity — projectActivityForFile', () => {
  const events = [
    { id: 'a', fileId: 'cf-1', kind: 'visit_started', at: '2026-05-01T10:00:00.000Z' },
    { id: 'b', fileId: 'cf-1', kind: 'lens_saved', at: '2026-05-03T10:00:00.000Z' },
    { id: 'c', fileId: 'cf-1', kind: 'manual_note', at: '2026-05-02T10:00:00.000Z', summary: 'Mid.' },
    { id: 'd', fileId: 'cf-2', kind: 'visit_started', at: '2026-05-04T10:00:00.000Z' },
  ]

  it('filters to one fileId and sorts newest-first', () => {
    const out = projectActivityForFile(events, 'cf-1')
    assert.deepEqual(out.map((e) => e.id), ['b', 'c', 'a'])
  })

  it('caps at the requested limit', () => {
    const out = projectActivityForFile(events, 'cf-1', { limit: 2 })
    assert.equal(out.length, 2)
    assert.equal(out[0].id, 'b')
  })

  it('returns empty array for unknown fileId', () => {
    assert.deepEqual(projectActivityForFile(events, 'cf-zzz'), [])
  })

  it('does not crash on empty / null input', () => {
    assert.deepEqual(projectActivityForFile([], 'cf-1'), [])
    assert.deepEqual(projectActivityForFile(null, 'cf-1'), [])
    assert.deepEqual(projectActivityForFile(undefined, 'cf-1'), [])
  })
})

describe('visitActivity — follow-up status', () => {
  const now = new Date('2026-05-08T15:00:00.000Z')

  it('describes overdue / today / tomorrow / future / none', () => {
    assert.equal(describeFollowUp({ dueAt: '2026-05-01' }, now).kind, 'overdue')
    assert.equal(describeFollowUp({ dueAt: '2026-05-08' }, now).kind, 'today')
    assert.equal(describeFollowUp({ dueAt: '2026-05-09' }, now).kind, 'tomorrow')
    assert.equal(describeFollowUp({ dueAt: '2026-06-01' }, now).kind, 'future')
    assert.equal(describeFollowUp(null, now).kind, 'none')
    assert.equal(describeFollowUp({ dueAt: '' }, now).kind, 'none')
    assert.equal(describeFollowUp({ dueAt: 'not-a-date' }, now).kind, 'none')
  })

  it('overdue/today text matches required wording', () => {
    assert.equal(describeFollowUp({ dueAt: '2026-05-01' }, now).text, 'Follow-up overdue.')
    assert.equal(describeFollowUp({ dueAt: '2026-05-08' }, now).text, 'Follow-up due today.')
    assert.equal(describeFollowUp({ dueAt: '2026-05-09' }, now).text, 'Follow-up due tomorrow.')
    assert.match(describeFollowUp({ dueAt: '2026-06-01' }, now).text, /^Follow-up set for /)
  })

  it('isFollowUpDueOrOverdue is true only for overdue + today', () => {
    assert.equal(isFollowUpDueOrOverdue({ dueAt: '2026-05-01' }, now), true)
    assert.equal(isFollowUpDueOrOverdue({ dueAt: '2026-05-08' }, now), true)
    assert.equal(isFollowUpDueOrOverdue({ dueAt: '2026-05-09' }, now), false)
    assert.equal(isFollowUpDueOrOverdue({ dueAt: '2026-06-01' }, now), false)
    assert.equal(isFollowUpDueOrOverdue(null, now), false)
  })

  it('normalizeFollowUp rejects without dueAt and strips banned text from note', () => {
    assert.equal(normalizeFollowUp({ fileId: 'cf-1' }), null)
    assert.equal(normalizeFollowUp({ fileId: 'cf-1', dueAt: '' }), null)
    const fu = normalizeFollowUp({
      fileId: 'cf-1',
      dueAt: '2026-05-15',
      note: 'Quote ready to send to customer',
    })
    assert.equal(fu.note, '', 'banned phrase should not survive')
    assert.equal(fu.dueAt, '2026-05-15')
  })
})

describe('visitActivity — durable round trip', () => {
  it('appendActivityForFile + listActivityForFile round-trip', async () => {
    const storage = makeStorage()
    await appendActivityForFile(storage, 'cf-1', {
      id: 'fixed-1', kind: 'visit_started', summary: 'Walk-in.', at: '2026-05-01T10:00:00.000Z',
    })
    await appendActivityForFile(storage, 'cf-1', {
      id: 'fixed-2', kind: 'lens_saved', summary: '', at: '2026-05-03T10:00:00.000Z',
    })
    await appendActivityForFile(storage, 'cf-2', {
      id: 'fixed-3', kind: 'visit_started', at: '2026-05-04T10:00:00.000Z',
    })
    const list = await listActivityForFile(storage, 'cf-1')
    assert.equal(list.length, 2)
    assert.deepEqual(list.map((e) => e.id), ['fixed-2', 'fixed-1'])
  })

  it('save + get + clear follow-up round-trip', async () => {
    const storage = makeStorage()
    await saveFollowUpForFile(storage, 'cf-1', { dueAt: '2026-05-15', note: 'Confirm.' })
    const saved = await getFollowUpForFile(storage, 'cf-1')
    assert.equal(saved.dueAt, '2026-05-15')
    assert.equal(saved.note, 'Confirm.')
    await clearFollowUpForFile(storage, 'cf-1')
    const after = await getFollowUpForFile(storage, 'cf-1')
    assert.equal(after, null)
  })

  it('saveFollowUpForFile rejects when dueAt is missing', async () => {
    const storage = makeStorage()
    await assert.rejects(() => saveFollowUpForFile(storage, 'cf-1', {}))
  })

  it('appendActivityForFile drops events with banned-phrase summary but keeps the kind', async () => {
    const storage = makeStorage()
    await appendActivityForFile(storage, 'cf-1', {
      id: 'fixed-x', kind: 'manual_note', summary: 'proposal ready', at: '2026-05-08T10:00:00.000Z',
    })
    const list = await listActivityForFile(storage, 'cf-1')
    assert.equal(list.length, 1)
    assert.equal(list[0].summary, '')
  })
})
