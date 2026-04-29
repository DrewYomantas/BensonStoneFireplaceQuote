import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addOpportunityActivity,
  buildSentOpportunityPatch,
  listOpportunityActivities,
  removeOpportunityActivity,
  updateOpportunityActivity,
} from './opportunityActivity.js'

function storageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

test('saving draft creates activity item', () => {
  const storage = storageMock()
  const activity = addOpportunityActivity('quote-1', {
    type: 'follow-up-draft',
    title: 'Draft',
    body: 'Safe draft body',
    channel: 'email',
    createdAt: '2026-04-29T12:00:00.000Z',
  }, storage)

  assert.equal(activity.type, 'follow-up-draft')
  assert.equal(listOpportunityActivities('quote-1', storage).length, 1)
})

test('logging sent patch updates lastContactedAt and active status safely', () => {
  const patch = buildSentOpportunityPatch({ status: 'ready-for-proposal', nextAction: 'Prepare proposal' }, new Date('2026-04-29T12:00:00.000Z'))

  assert.equal(patch.lastContactedAt, '2026-04-29')
  assert.equal(patch.status, 'waiting-on-customer')
  assert.equal(patch.nextAction, 'Check back with customer')
})

test('logging sent patch does not reopen reference opportunity', () => {
  const patch = buildSentOpportunityPatch({ status: 'reference-only', nextAction: 'Archive' }, new Date('2026-04-29T12:00:00.000Z'))

  assert.equal(patch.lastContactedAt, '2026-04-29')
  assert.equal(patch.status, undefined)
  assert.equal(patch.nextAction, 'Archive')
})

test('localStorage activity helpers save list update and remove correctly', () => {
  const storage = storageMock()
  const activity = addOpportunityActivity('quote-1', {
    type: 'note',
    title: 'Note',
    body: 'Called customer',
    channel: 'phone',
  }, storage)
  const updated = updateOpportunityActivity(activity.id, { body: 'Left voicemail', channel: 'voicemail' }, storage)

  assert.equal(updated.body, 'Left voicemail')
  assert.equal(listOpportunityActivities('quote-1', storage)[0].channel, 'voicemail')
  removeOpportunityActivity(activity.id, storage)
  assert.equal(listOpportunityActivities('quote-1', storage).length, 0)
})

test('activity storage removes raw OCR and sensitive metrics', () => {
  const storage = storageMock()
  addOpportunityActivity('quote-1', {
    type: 'note',
    title: 'raw OCR note',
    body: 'average cost and supplier detail should not store',
    channel: 'manual',
    metadata: {
      rawOcrText: 'RAW OCR SHOULD NOT STORE',
      productRank: 1,
      safePage: 'Page 1',
    },
  }, storage)

  const serialized = JSON.stringify(listOpportunityActivities('quote-1', storage))
  assert.equal(/RAW OCR|average cost|supplier|productRank|rawOcrText/i.test(serialized), false)
  assert.match(serialized, /safePage/)
})
