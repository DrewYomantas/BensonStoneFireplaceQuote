import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { describeSaveStatus, shouldRecommendBackup, BACKUP_RECOMMENDED_AFTER_DAYS } from './saveStatusView.js'

describe('saveStatusView', () => {
  it('maps saved → is-saved class with timestamped label', () => {
    const view = describeSaveStatus({ state: 'saved', storageAvailable: true, lastSavedAt: '2026-05-07T14:02:00Z' })
    assert.equal(view.key, 'saved')
    assert.equal(view.className, 'save-status is-saved')
    assert.match(view.label, /Saved locally/)
  })

  it('maps saving → is-saving', () => {
    const view = describeSaveStatus({ state: 'saving', storageAvailable: true })
    assert.equal(view.key, 'saving')
    assert.equal(view.className, 'save-status is-saving')
  })

  it('maps error → is-error and surfaces message', () => {
    const view = describeSaveStatus({ state: 'error', storageAvailable: true, errorMessage: 'disk full' })
    assert.equal(view.key, 'error')
    assert.equal(view.className, 'save-status is-error')
    assert.match(view.label, /disk full/)
  })

  it('maps storageAvailable=false → is-unavailable regardless of state', () => {
    const view = describeSaveStatus({ state: 'saved', storageAvailable: false })
    assert.equal(view.key, 'unavailable')
    assert.equal(view.className, 'save-status is-unavailable')
  })

  it('saved state with stale backup returns backup-recommended view', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const view = describeSaveStatus({ state: 'saved', storageAvailable: true, lastSavedAt: '2026-05-07T14:02:00Z', lastBackupAt: tenDaysAgo })
    assert.equal(view.key, 'backup')
    assert.equal(view.className, 'save-status is-backup')
    assert.match(view.label, /Backup recommended/)
  })

  it('shouldRecommendBackup honours the threshold', () => {
    const fresh = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const stale = new Date(Date.now() - (BACKUP_RECOMMENDED_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(shouldRecommendBackup({ lastBackupAt: fresh }), false)
    assert.equal(shouldRecommendBackup({ lastBackupAt: stale }), true)
  })
})
