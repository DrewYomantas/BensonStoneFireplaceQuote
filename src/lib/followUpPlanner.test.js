import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyCustomerFile } from './customerFile.js'
import { buildFollowUpTask, buildSnoozePatch, planFollowUpTasks, upsertFollowUpTask } from './followUpPlanner.js'

const now = new Date('2026-05-03T12:00:00.000Z')

function file(overrides = {}) {
  return createEmptyCustomerFile({
    customerName: 'Anna',
    customerEmail: 'a@example.com',
    customerGoal: 'Gas insert',
    opportunityId: 'quote-1',
    ...overrides,
  }, now)
}

describe('followUpPlanner', () => {
  it('creates model tag and gas type tasks from missing verification', () => {
    const plan = planFollowUpTasks(file({ existingNotes: 'prefab zero-clearance fireplace', likelyPath: 'gas logs' }), now)
    assert.ok(plan.tasks.some((t) => t.planId === 'ask-model-tag-photo'))
    assert.ok(plan.tasks.some((t) => t.planId === 'confirm-gas-type'))
  })

  it('creates same-day packet task when quote exists but packet is not sent', () => {
    const plan = planFollowUpTasks(file(), now)
    assert.ok(plan.tasks.some((t) => t.planId === 'send-quote-packet'))
  })

  it('creates 3-day and 7-day tasks after packet send', () => {
    const sentAt = '2026-05-01T09:00:00.000Z'
    const plan = planFollowUpTasks(file({ packetSentAt: sentAt, packetSendChannel: 'email' }), now)
    assert.ok(plan.tasks.some((t) => t.planId === 'check-in-2-3-days' && t.dueAt.startsWith('2026-05-04')))
    assert.ok(plan.tasks.some((t) => t.planId === 'follow-up-7-days' && t.dueAt.startsWith('2026-05-08')))
  })

  it('creates 14-day scheduler task when waiting on handoff', () => {
    const plan = planFollowUpTasks(file({ handoffState: 'waiting_for_measure', handoffSentAt: '2026-05-02T10:00:00.000Z' }), now)
    assert.ok(plan.tasks.some((t) => t.planId === 'follow-up-14-days-scheduler' && t.dueAt.startsWith('2026-05-16')))
  })

  it('creates pricing refresh task for stale recovery outreach', () => {
    const plan = planFollowUpTasks(file({ customerGoal: 'old quote recovery', pricingConfirmedAt: '2026-03-01T00:00:00.000Z' }), now)
    assert.ok(plan.tasks.some((t) => t.planId === 'pricing-refresh-before-recovery'))
  })

  it('snooze only changes a real task due date', () => {
    assert.equal(buildSnoozePatch({}, 1, now), null)
    const patch = buildSnoozePatch({ id: 't1', label: 'Call' }, 2, now)
    assert.equal(patch.dueAt.startsWith('2026-05-05'), true)
    assert.equal(patch.snoozedAt, now.toISOString())
  })

  it('upserts planned tasks into the customer file task list', () => {
    const planned = buildFollowUpTask({ planId: 'send-quote-packet', label: 'Send quote packet' }, now)
    const next = upsertFollowUpTask(file(), planned, now)
    assert.equal(next.length, 1)
    const updated = upsertFollowUpTask({ followUpTasks: next }, { planId: 'send-quote-packet', label: 'Send packet today' }, now)
    assert.equal(updated.length, 1)
    assert.equal(updated[0].label, 'Send packet today')
  })
})
