import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  SESSION_STATUS,
  CHAPTER_LABELS,
  normalizeSession,
  projectHearthStudioSessionForDisplay,
  scrubSessionRecord,
  sessionTopLineSummary,
  listSessions,
  getSession,
  getActiveSessionsForCustomer,
  createSession,
  updateSession,
  pauseSession,
  resumeSession,
  completeSession,
  softDeleteSession,
  restoreSession,
} from './hearthStudioSessionStorage.js'

function makeStorage(initial = {}) {
  return createSalesOsStorage({ engine: createMemoryEngine(initial) })
}

const NOW = new Date('2026-05-12T10:00:00.000Z')

const BASE_SESSION = {
  id: 'hs-test-001',
  customerFileId: 'file-abc',
  startedByRepId: 'rep-drew',
  lastTouchedByRepId: 'rep-drew',
  startedAt: '2026-05-12T10:00:00.000Z',
  lastTouchedAt: '2026-05-12T10:00:00.000Z',
  pausedAt: null,
  completedAt: null,
  softDeletedAt: null,
  status: 'active',
  currentChapter: 0,
  chaptersCompleted: [],
  selections: { setupType: 'new-construction', goal: 'warmth' },
  flags: { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: [] },
}

// ---- normalizeSession ---------------------------------------------------

describe('normalizeSession — validation', () => {
  it('returns null for null / non-object input', () => {
    assert.equal(normalizeSession(null), null)
    assert.equal(normalizeSession(undefined), null)
    assert.equal(normalizeSession([]), null)
    assert.equal(normalizeSession('string'), null)
  })

  it('returns null when customerFileId is missing', () => {
    assert.equal(normalizeSession({ id: 'x', status: 'active' }), null)
    assert.equal(normalizeSession({ ...BASE_SESSION, customerFileId: '' }), null)
  })

  it('returns a frozen object for valid input', () => {
    const s = normalizeSession(BASE_SESSION)
    assert.ok(s)
    assert.ok(Object.isFrozen(s))
  })

  it('generates id when not provided', () => {
    const s = normalizeSession({ customerFileId: 'file-abc' })
    assert.ok(s)
    assert.ok(s.id.startsWith('hs-'))
  })

  it('defaults status to active for unknown value', () => {
    const s = normalizeSession({ ...BASE_SESSION, status: 'invalid' })
    assert.equal(s.status, SESSION_STATUS.active)
  })

  it('accepts all valid SESSION_STATUS values', () => {
    for (const status of Object.values(SESSION_STATUS)) {
      const s = normalizeSession({ ...BASE_SESSION, status })
      assert.equal(s.status, status)
    }
  })

  it('defaults currentChapter to 0 for out-of-range values', () => {
    assert.equal(normalizeSession({ ...BASE_SESSION, currentChapter: -1 }).currentChapter, 0)
    assert.equal(normalizeSession({ ...BASE_SESSION, currentChapter: 13 }).currentChapter, 0)
    assert.equal(normalizeSession({ ...BASE_SESSION, currentChapter: 'bad' }).currentChapter, 0)
  })

  it('accepts currentChapter 0-12', () => {
    for (let i = 0; i <= 12; i++) {
      const s = normalizeSession({ ...BASE_SESSION, currentChapter: i })
      assert.equal(s.currentChapter, i)
    }
  })

  it('filters chaptersCompleted to numbers', () => {
    const s = normalizeSession({ ...BASE_SESSION, chaptersCompleted: [0, 1, 'bad', null, 2] })
    assert.deepEqual(s.chaptersCompleted, [0, 1, 2])
  })

  it('defaults chaptersCompleted to [] when not an array', () => {
    const s = normalizeSession({ ...BASE_SESSION, chaptersCompleted: undefined })
    assert.deepEqual(s.chaptersCompleted, [])
  })

  it('only keeps whitelisted selection keys', () => {
    const s = normalizeSession({
      ...BASE_SESSION,
      selections: { setupType: 'existing', unknownKey: 'should-drop', investment: 100 },
    })
    assert.equal(s.selections.setupType, 'existing')
    assert.equal(s.selections.unknownKey, undefined)
    assert.equal(s.selections.investment, 100)
  })

  it('defaults selections to {} when missing', () => {
    const s = normalizeSession({ ...BASE_SESSION, selections: undefined })
    assert.deepEqual(s.selections, {})
  })

  it('normalizes flags correctly', () => {
    const s = normalizeSession({ ...BASE_SESSION, flags: { needsFieldMeasure: true, hasComplexSetup: true, fieldRulesTriggered: ['rule-1'] } })
    assert.equal(s.flags.needsFieldMeasure, true)
    assert.equal(s.flags.hasComplexSetup, true)
    assert.deepEqual(s.flags.fieldRulesTriggered, ['rule-1'])
  })

  it('defaults flags to safe values when missing', () => {
    const s = normalizeSession({ ...BASE_SESSION, flags: undefined })
    assert.equal(s.flags.needsFieldMeasure, false)
    assert.equal(s.flags.hasComplexSetup, false)
    assert.deepEqual(s.flags.fieldRulesTriggered, [])
  })

  it('generates startedAt and lastTouchedAt from now when not provided', () => {
    const s = normalizeSession({ customerFileId: 'file-abc' }, NOW)
    assert.equal(s.startedAt, '2026-05-12T10:00:00.000Z')
  })

  it('falls back lastTouchedByRepId to startedByRepId when not provided', () => {
    const s = normalizeSession({ ...BASE_SESSION, lastTouchedByRepId: undefined })
    assert.equal(s.lastTouchedByRepId, 'rep-drew')
  })

  it('strips sensitive top-level keys', () => {
    const s = normalizeSession({ ...BASE_SESSION, cost: 999, margin: 0.3 })
    assert.equal(s.cost, undefined)
    assert.equal(s.margin, undefined)
  })
})

// ---- projectHearthStudioSessionForDisplay ------------------------------

describe('projectHearthStudioSessionForDisplay', () => {
  it('returns null for null input', () => {
    assert.equal(projectHearthStudioSessionForDisplay(null), null)
  })

  it('strips investment and roomContext from selections', () => {
    const s = normalizeSession({
      ...BASE_SESSION,
      selections: { setupType: 'new-construction', investment: 8000, roomContext: 'open-plan' },
    })
    const view = projectHearthStudioSessionForDisplay(s)
    assert.equal(view.selections.setupType, 'new-construction')
    assert.equal(view.selections.investment, undefined)
    assert.equal(view.selections.roomContext, undefined)
  })

  it('does not mutate the original session selections', () => {
    const s = normalizeSession({ ...BASE_SESSION, selections: { investment: 5000 } })
    projectHearthStudioSessionForDisplay(s)
    assert.equal(s.selections.investment, 5000)
  })

  it('preserves all non-scrubbed fields', () => {
    const s = normalizeSession({ ...BASE_SESSION, selections: { setupType: 'existing', goal: 'warmth' } })
    const view = projectHearthStudioSessionForDisplay(s)
    assert.equal(view.status, s.status)
    assert.equal(view.currentChapter, s.currentChapter)
    assert.equal(view.selections.setupType, 'existing')
    assert.equal(view.selections.goal, 'warmth')
  })
})

// ---- scrubSessionRecord -------------------------------------------------

describe('scrubSessionRecord', () => {
  it('strips investment and roomContext from selections', () => {
    const record = { id: 'x', selections: { investment: 9000, roomContext: 'living-room', goal: 'warmth' } }
    const scrubbed = scrubSessionRecord(record)
    assert.equal(scrubbed.selections.investment, undefined)
    assert.equal(scrubbed.selections.roomContext, undefined)
    assert.equal(scrubbed.selections.goal, 'warmth')
  })

  it('returns record as-is when selections is absent', () => {
    const record = { id: 'x', status: 'active' }
    const scrubbed = scrubSessionRecord(record)
    assert.equal(scrubbed.id, 'x')
    assert.equal(scrubbed.selections, undefined)
  })

  it('returns input as-is for non-object', () => {
    assert.equal(scrubSessionRecord(null), null)
  })
})

// ---- sessionTopLineSummary ---------------------------------------------

describe('sessionTopLineSummary', () => {
  it('returns empty string for null', () => {
    assert.equal(sessionTopLineSummary(null), '')
  })

  it('shows Active + chapter label for active status', () => {
    const s = normalizeSession({ ...BASE_SESSION, status: 'active', currentChapter: 2 })
    assert.ok(sessionTopLineSummary(s).includes('Active'))
    assert.ok(sessionTopLineSummary(s).includes(CHAPTER_LABELS[2]))
  })

  it('shows Paused + chapter label for paused status', () => {
    const s = normalizeSession({ ...BASE_SESSION, status: 'paused', currentChapter: 5 })
    assert.ok(sessionTopLineSummary(s).includes('Paused'))
    assert.ok(sessionTopLineSummary(s).includes(CHAPTER_LABELS[5]))
  })

  it('shows Completed + chapter count for completed status', () => {
    const s = normalizeSession({ ...BASE_SESSION, status: 'completed', chaptersCompleted: [0, 1, 2] })
    const text = sessionTopLineSummary(s)
    assert.ok(text.includes('Completed'))
    assert.ok(text.includes('3'))
  })
})

// ---- CHAPTER_LABELS ----------------------------------------------------

describe('CHAPTER_LABELS', () => {
  it('covers chapters 0 through 12', () => {
    for (let i = 0; i <= 12; i++) {
      assert.ok(CHAPTER_LABELS[i], `missing label for chapter ${i}`)
    }
  })

  it('has exactly 13 entries', () => {
    assert.equal(Object.keys(CHAPTER_LABELS).length, 13)
  })
})

// ---- Durable storage ---------------------------------------------------

describe('hearthStudioSessionStorage — CRUD', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('createSession stores a session and listSessions returns it', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    assert.ok(s)
    assert.equal(s.customerFileId, 'file-abc')
    assert.equal(s.startedByRepId, 'rep-drew')
    assert.equal(s.status, SESSION_STATUS.active)
    const all = await listSessions(storage)
    assert.equal(all.length, 1)
    assert.equal(all[0].id, s.id)
  })

  it('createSession throws when customerFileId is missing', async () => {
    await assert.rejects(() => createSession(storage, '', 'rep-drew', NOW))
    await assert.rejects(() => createSession(storage, null, 'rep-drew', NOW))
  })

  it('getSession returns the session by id', async () => {
    const s = await createSession(storage, 'file-abc', null, NOW)
    const fetched = await getSession(storage, s.id)
    assert.ok(fetched)
    assert.equal(fetched.id, s.id)
  })

  it('getSession returns null for unknown id', async () => {
    const result = await getSession(storage, 'nonexistent')
    assert.equal(result, null)
  })

  it('getSession returns null for empty id', async () => {
    assert.equal(await getSession(storage, ''), null)
    assert.equal(await getSession(storage, null), null)
  })

  it('updateSession merges patch onto existing session', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    const updated = await updateSession(storage, s.id, { currentChapter: 3 }, NOW)
    assert.equal(updated.currentChapter, 3)
    assert.equal(updated.customerFileId, 'file-abc')
  })

  it('updateSession merges selections incrementally', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await updateSession(storage, s.id, { selections: { setupType: 'new-construction' } }, NOW)
    const updated = await updateSession(storage, s.id, { selections: { goal: 'warmth' } }, NOW)
    assert.equal(updated.selections.setupType, 'new-construction')
    assert.equal(updated.selections.goal, 'warmth')
  })

  it('updateSession throws when session does not exist', async () => {
    await assert.rejects(() => updateSession(storage, 'ghost', { currentChapter: 1 }, NOW))
  })

  it('listSessions returns [] with no sessions', async () => {
    assert.deepEqual(await listSessions(storage), [])
  })
})

// ---- Lifecycle ops -----------------------------------------------------

describe('hearthStudioSessionStorage — lifecycle', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('pauseSession sets status=paused and pausedAt', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    const paused = await pauseSession(storage, s.id, 'rep-drew', NOW)
    assert.equal(paused.status, SESSION_STATUS.paused)
    assert.ok(paused.pausedAt)
  })

  it('pauseSession throws when session does not exist', async () => {
    await assert.rejects(() => pauseSession(storage, 'ghost', 'rep-drew', NOW))
  })

  it('resumeSession sets status=active and clears pausedAt', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await pauseSession(storage, s.id, 'rep-drew', NOW)
    const resumed = await resumeSession(storage, s.id, 'rep-drew', NOW)
    assert.equal(resumed.status, SESSION_STATUS.active)
    assert.equal(resumed.pausedAt, null)
  })

  it('resumeSession throws when session does not exist', async () => {
    await assert.rejects(() => resumeSession(storage, 'ghost', 'rep-drew', NOW))
  })

  it('completeSession sets status=completed and completedAt', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    const completed = await completeSession(storage, s.id, 'rep-drew', NOW)
    assert.equal(completed.status, SESSION_STATUS.completed)
    assert.ok(completed.completedAt)
  })

  it('completeSession throws when session does not exist', async () => {
    await assert.rejects(() => completeSession(storage, 'ghost', 'rep-drew', NOW))
  })

  it('softDeleteSession sets status=soft_deleted and softDeletedAt', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    const deleted = await softDeleteSession(storage, s.id, 'rep-drew', NOW)
    assert.equal(deleted.status, SESSION_STATUS.soft_deleted)
    assert.ok(deleted.softDeletedAt)
  })

  it('softDeleteSession throws when session does not exist', async () => {
    await assert.rejects(() => softDeleteSession(storage, 'ghost', 'rep-drew', NOW))
  })

  it('restoreSession sets status=active and clears softDeletedAt', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await softDeleteSession(storage, s.id, 'rep-drew', NOW)
    const restored = await restoreSession(storage, s.id, 'rep-drew', NOW)
    assert.equal(restored.status, SESSION_STATUS.active)
    assert.equal(restored.softDeletedAt, null)
  })

  it('restoreSession throws when session does not exist', async () => {
    await assert.rejects(() => restoreSession(storage, 'ghost', 'rep-drew', NOW))
  })
})

// ---- getActiveSessionsForCustomer --------------------------------------

describe('getActiveSessionsForCustomer', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('returns only active and paused sessions for the given file', async () => {
    const s1 = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    const s2 = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await pauseSession(storage, s2.id, 'rep-drew', NOW)
    const s3 = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await completeSession(storage, s3.id, 'rep-drew', NOW)
    const s4 = await createSession(storage, 'file-other', 'rep-drew', NOW)
    const active = await getActiveSessionsForCustomer(storage, 'file-abc')
    const ids = active.map((s) => s.id)
    assert.ok(ids.includes(s1.id))
    assert.ok(ids.includes(s2.id))
    assert.ok(!ids.includes(s3.id))
    assert.ok(!ids.includes(s4.id))
  })

  it('returns [] when customerFileId is empty', async () => {
    await createSession(storage, 'file-abc', 'rep-drew', NOW)
    assert.deepEqual(await getActiveSessionsForCustomer(storage, ''), [])
    assert.deepEqual(await getActiveSessionsForCustomer(storage, null), [])
  })

  it('returns [] when no sessions exist for the file', async () => {
    assert.deepEqual(await getActiveSessionsForCustomer(storage, 'file-abc'), [])
  })

  it('soft_deleted sessions are excluded', async () => {
    const s = await createSession(storage, 'file-abc', 'rep-drew', NOW)
    await softDeleteSession(storage, s.id, 'rep-drew', NOW)
    const active = await getActiveSessionsForCustomer(storage, 'file-abc')
    assert.equal(active.length, 0)
  })
})
