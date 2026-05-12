import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryEngine, createSalesOsStorage } from './salesOsStorage.js'
import {
  normalizeRep,
  listReps,
  getRep,
  getRepByLast4Ssn,
  addRep,
  updateRep,
  setActive,
} from './repStorage.js'

function makeStorage(initial = {}) {
  return createSalesOsStorage({ engine: createMemoryEngine(initial) })
}

const DREW = {
  id: 'rep-drew',
  firstName: 'Drew',
  lastName: 'Yomantas',
  initials: 'DY',
  last4Ssn: '1234',
  startedAt: '2026-05-01T00:00:00.000Z',
  active: true,
}

// ---- normalizeRep -------------------------------------------------------

describe('normalizeRep — validation', () => {
  it('returns null for null / non-object input', () => {
    assert.equal(normalizeRep(null), null)
    assert.equal(normalizeRep(undefined), null)
    assert.equal(normalizeRep([]), null)
    assert.equal(normalizeRep('string'), null)
  })

  it('returns null when id is missing', () => {
    assert.equal(normalizeRep({ ...DREW, id: '' }), null)
    assert.equal(normalizeRep({ ...DREW, id: undefined }), null)
  })

  it('returns null when last4Ssn is not exactly 4 characters', () => {
    assert.equal(normalizeRep({ ...DREW, last4Ssn: '123' }), null)
    assert.equal(normalizeRep({ ...DREW, last4Ssn: '12345' }), null)
    assert.equal(normalizeRep({ ...DREW, last4Ssn: '' }), null)
  })

  it('returns null when firstName or lastName is blank', () => {
    assert.equal(normalizeRep({ ...DREW, firstName: '' }), null)
    assert.equal(normalizeRep({ ...DREW, lastName: '' }), null)
  })

  it('normalizes a valid rep correctly', () => {
    const rep = normalizeRep(DREW)
    assert.ok(rep)
    assert.equal(rep.id, 'rep-drew')
    assert.equal(rep.firstName, 'Drew')
    assert.equal(rep.lastName, 'Yomantas')
    assert.equal(rep.initials, 'DY')
    assert.equal(rep.last4Ssn, '1234')
    assert.equal(rep.active, true)
    assert.ok(rep.startedAt)
  })

  it('derives initials from firstName + lastName when not provided', () => {
    const rep = normalizeRep({ ...DREW, initials: '' })
    assert.equal(rep.initials, 'DY')
  })

  it('defaults active to true when not provided', () => {
    const rep = normalizeRep({ ...DREW, active: undefined })
    assert.equal(rep.active, true)
  })

  it('accepts active: false', () => {
    const rep = normalizeRep({ ...DREW, active: false })
    assert.equal(rep.active, false)
  })

  it('returns a frozen object', () => {
    const rep = normalizeRep(DREW)
    assert.ok(Object.isFrozen(rep))
  })
})

// ---- CRUD ---------------------------------------------------------------

describe('repStorage — CRUD', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('addRep stores a rep and listReps returns it', async () => {
    const rep = await addRep(storage, DREW)
    assert.equal(rep.id, 'rep-drew')
    const all = await listReps(storage)
    assert.equal(all.length, 1)
    assert.equal(all[0].firstName, 'Drew')
  })

  it('addRep generates an id when none is provided', async () => {
    const noId = { firstName: DREW.firstName, lastName: DREW.lastName, initials: DREW.initials, last4Ssn: DREW.last4Ssn, active: DREW.active }
    const rep = await addRep(storage, noId)
    assert.ok(rep.id.startsWith('rep-'))
  })

  it('addRep throws for invalid rep data', async () => {
    await assert.rejects(() => addRep(storage, { firstName: 'Drew' }))
    await assert.rejects(() => addRep(storage, { ...DREW, last4Ssn: '12' }))
  })

  it('getRep returns the rep by id', async () => {
    await addRep(storage, DREW)
    const rep = await getRep(storage, 'rep-drew')
    assert.equal(rep.firstName, 'Drew')
  })

  it('getRep returns null for unknown id', async () => {
    const rep = await getRep(storage, 'nonexistent')
    assert.equal(rep, null)
  })

  it('getRep returns null for empty id', async () => {
    const rep = await getRep(storage, '')
    assert.equal(rep, null)
  })

  it('updateRep merges fields onto existing rep', async () => {
    await addRep(storage, DREW)
    const updated = await updateRep(storage, { id: 'rep-drew', firstName: 'Andrew' })
    assert.equal(updated.firstName, 'Andrew')
    assert.equal(updated.lastName, 'Yomantas')
    const fetched = await getRep(storage, 'rep-drew')
    assert.equal(fetched.firstName, 'Andrew')
  })

  it('updateRep throws when rep does not exist', async () => {
    await assert.rejects(() => updateRep(storage, { id: 'ghost', firstName: 'X' }))
  })

  it('setActive sets active to false', async () => {
    await addRep(storage, DREW)
    const updated = await setActive(storage, 'rep-drew', false)
    assert.equal(updated.active, false)
    const fetched = await getRep(storage, 'rep-drew')
    assert.equal(fetched.active, false)
  })

  it('setActive sets active to true', async () => {
    await addRep(storage, { ...DREW, active: false })
    const updated = await setActive(storage, 'rep-drew', true)
    assert.equal(updated.active, true)
  })

  it('setActive throws when rep does not exist', async () => {
    await assert.rejects(() => setActive(storage, 'ghost', true))
  })

  it('listReps returns empty array with no reps', async () => {
    const all = await listReps(storage)
    assert.deepEqual(all, [])
  })
})

// ---- getRepByLast4Ssn ---------------------------------------------------

describe('getRepByLast4Ssn — lookup', () => {
  let storage
  beforeEach(() => { storage = makeStorage() })

  it('finds a rep by exact last4Ssn', async () => {
    await addRep(storage, DREW)
    const rep = await getRepByLast4Ssn(storage, '1234')
    assert.ok(rep)
    assert.equal(rep.id, 'rep-drew')
  })

  it('returns null for an unrecognized last4Ssn', async () => {
    await addRep(storage, DREW)
    const rep = await getRepByLast4Ssn(storage, '9999')
    assert.equal(rep, null)
  })

  it('returns null for empty input', async () => {
    await addRep(storage, DREW)
    assert.equal(await getRepByLast4Ssn(storage, ''), null)
    assert.equal(await getRepByLast4Ssn(storage, null), null)
  })

  it('does not match an inactive rep (caller must check active)', async () => {
    await addRep(storage, { ...DREW, active: false })
    const rep = await getRepByLast4Ssn(storage, '1234')
    assert.ok(rep)
    assert.equal(rep.active, false)
  })
})
