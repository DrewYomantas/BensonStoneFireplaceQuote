import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSaveState, humanLabel } from './salesOsSaveState.js'

describe('salesOsSaveState', () => {
  it('starts idle and emits the initial snapshot to subscribers', () => {
    const ss = createSaveState()
    let captured = null
    ss.subscribe((s) => { captured = s })
    assert.equal(captured.state, 'idle')
    assert.equal(captured.storageAvailable, true)
    assert.equal(captured.label, 'Idle')
  })

  it('records lastSavedAt and produces a human label', () => {
    const ss = createSaveState()
    ss.markSaving()
    assert.equal(ss.snapshot().state, 'saving')
    assert.equal(ss.snapshot().label, 'Saving locally…')

    ss.markSaved(new Date('2026-05-07T14:02:00Z'))
    const snap = ss.snapshot()
    assert.equal(snap.state, 'saved')
    assert.equal(snap.lastSavedAt, '2026-05-07T14:02:00.000Z')
    assert.match(snap.label, /^Saved locally · \d{2}:\d{2}$/)
  })

  it('error state surfaces a readable message', () => {
    const ss = createSaveState()
    ss.markError('disk full')
    const snap = ss.snapshot()
    assert.equal(snap.state, 'error')
    assert.equal(snap.label, 'Save failed — disk full')
  })

  it('setAvailability(false) flips to error and labels storage unavailability', () => {
    const ss = createSaveState()
    ss.setAvailability(false, 'IndexedDB blocked')
    const snap = ss.snapshot()
    assert.equal(snap.storageAvailable, false)
    assert.equal(snap.label, 'Storage unavailable — IndexedDB blocked')
  })

  it('markBackup records lastBackupAt without changing state', () => {
    const ss = createSaveState()
    ss.markSaved(new Date('2026-05-07T14:02:00Z'))
    ss.markBackup(new Date('2026-05-07T14:05:00Z'))
    const snap = ss.snapshot()
    assert.equal(snap.lastBackupAt, '2026-05-07T14:05:00.000Z')
    assert.equal(snap.state, 'saved')
  })

  it('humanLabel pure helper handles edge cases', () => {
    assert.equal(humanLabel({ state: 'idle', storageAvailable: true }), 'Idle')
    assert.equal(humanLabel({ state: 'error', storageAvailable: true }), 'Save failed')
    assert.equal(humanLabel({ state: 'saved', lastSavedAt: '', storageAvailable: true }), 'Saved locally')
  })
})
