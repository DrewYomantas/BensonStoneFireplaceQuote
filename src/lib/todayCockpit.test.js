import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTodayCockpit, deriveOneThing, quoteActionLabel, isBannedCopy, COCKPIT_RECENT_LIMIT } from './todayCockpit.js'
import { GATE_STATUS } from './quotePrepGate.js'

// ---- helpers ---------------------------------------------------------------

function makeRow(id, overrides = {}) {
  return {
    id,
    customerName: overrides.customerName ?? `Customer ${id}`,
    contact: overrides.contact ?? 'test@example.com',
    summary: overrides.summary ?? '',
    quotePrep: overrides.quotePrep ?? { status: GATE_STATUS.draft, hasLines: false, counts: { total: 0 } },
    followUp: overrides.followUp ?? null,
    updatedAt: overrides.updatedAt ?? new Date(Date.now() - 60000).toISOString(),
  }
}

function overdueFollowUp() {
  return { dueAt: new Date(Date.now() - 86400000).toISOString(), note: 'call them', signal: { kind: 'overdue', text: 'Overdue', tone: 'ember' } }
}
function todayFollowUp() {
  return { dueAt: new Date().toISOString(), note: '', signal: { kind: 'today', text: 'Due today', tone: 'ember' } }
}
function futureFollowUp() {
  return { dueAt: new Date(Date.now() + 86400000 * 3).toISOString(), note: '', signal: { kind: 'future', text: 'In 3 days', tone: 'brass' } }
}
function needsVerificationPrep(doNotUseYet = 0, needsReview = 0) {
  return { status: GATE_STATUS.needsVerification, hasLines: true, counts: { total: 2, doNotUseYet, needsReview } }
}

// ---- isBannedCopy ----------------------------------------------------------

describe('isBannedCopy', () => {
  it('detects banned phrases', () => {
    assert.ok(isBannedCopy('ready to send'))
    assert.ok(isBannedCopy('This proposal is customer ready'))
    assert.ok(isBannedCopy('APPROVED'))
  })
  it('passes clean copy', () => {
    assert.ok(!isBannedCopy('Follow up with customer'))
    assert.ok(!isBannedCopy('Verify line items'))
    assert.ok(!isBannedCopy(''))
  })
})

// ---- quoteActionLabel -------------------------------------------------------

describe('quoteActionLabel', () => {
  it('do-not-use-yet takes priority', () => {
    assert.equal(quoteActionLabel(needsVerificationPrep(1, 0)), 'Review line items marked do-not-use')
  })
  it('needs-review when no do-not-use-yet', () => {
    assert.equal(quoteActionLabel(needsVerificationPrep(0, 2)), 'Verify line items')
  })
  it('finish gate when lines are present', () => {
    assert.equal(quoteActionLabel({ status: GATE_STATUS.needsVerification, hasLines: true, counts: { total: 2, doNotUseYet: 0, needsReview: 0 } }), 'Finish Pre-BisTrack gate')
  })
  it('returns empty for draft with no lines', () => {
    assert.equal(quoteActionLabel({ status: GATE_STATUS.draft, hasLines: false, counts: {} }), 'Add quote lines to Quote / Prep')
  })
  it('returns empty string for null', () => {
    assert.equal(quoteActionLabel(null), '')
  })
})

// ---- deriveTodayCockpit — section placement ---------------------------------

describe('deriveTodayCockpit — sections', () => {
  it('returns empty sections for empty rows', () => {
    const result = deriveTodayCockpit([])
    assert.equal(result.followUpsToday.length, 0)
    assert.equal(result.quoteActionsNeeded.length, 0)
    assert.equal(result.recentRows.length, 0)
    assert.equal(result.oneThing, null)
  })

  it('promotes overdue follow-up to followUpsToday', () => {
    const rows = [makeRow('1', { followUp: overdueFollowUp() })]
    const { followUpsToday, recentRows } = deriveTodayCockpit(rows)
    assert.equal(followUpsToday.length, 1)
    assert.equal(followUpsToday[0].row.id, '1')
    assert.equal(recentRows.length, 0, 'overdue file must not appear in recent')
  })

  it('promotes today follow-up to followUpsToday', () => {
    const rows = [makeRow('1', { followUp: todayFollowUp() })]
    const { followUpsToday } = deriveTodayCockpit(rows)
    assert.equal(followUpsToday.length, 1)
    assert.equal(followUpsToday[0].row.id, '1')
  })

  it('future follow-up does not go to followUpsToday', () => {
    const rows = [makeRow('1', { followUp: futureFollowUp() })]
    const { followUpsToday, recentRows } = deriveTodayCockpit(rows)
    assert.equal(followUpsToday.length, 0)
    assert.equal(recentRows.length, 1)
  })

  it('sorts overdue before today within followUpsToday', () => {
    const rows = [
      makeRow('today', { followUp: todayFollowUp() }),
      makeRow('overdue', { followUp: overdueFollowUp() }),
    ]
    const { followUpsToday } = deriveTodayCockpit(rows)
    assert.equal(followUpsToday[0].row.id, 'overdue')
    assert.equal(followUpsToday[1].row.id, 'today')
  })

  it('places needsVerification in quoteActionsNeeded', () => {
    const rows = [makeRow('1', { quotePrep: needsVerificationPrep() })]
    const { quoteActionsNeeded, recentRows } = deriveTodayCockpit(rows)
    assert.equal(quoteActionsNeeded.length, 1)
    assert.equal(quoteActionsNeeded[0].row.id, '1')
    assert.equal(recentRows.length, 0, 'quote action file must not appear in recent')
  })

  it('file with overdue follow-up AND needsVerification goes to followUpsToday only', () => {
    const rows = [makeRow('1', { followUp: overdueFollowUp(), quotePrep: needsVerificationPrep() })]
    const { followUpsToday, quoteActionsNeeded } = deriveTodayCockpit(rows)
    assert.equal(followUpsToday.length, 1)
    assert.equal(quoteActionsNeeded.length, 0)
  })

  it('recent excludes promoted IDs', () => {
    const rows = [
      makeRow('fu', { followUp: overdueFollowUp() }),
      makeRow('qa', { quotePrep: needsVerificationPrep() }),
      makeRow('r1'),
      makeRow('r2'),
    ]
    const { recentRows } = deriveTodayCockpit(rows)
    assert.ok(recentRows.every((r) => r.id !== 'fu' && r.id !== 'qa'))
    assert.equal(recentRows.length, 2)
  })

  it('recent is capped at COCKPIT_RECENT_LIMIT', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(String(i)))
    const { recentRows } = deriveTodayCockpit(rows)
    assert.ok(recentRows.length <= COCKPIT_RECENT_LIMIT)
  })

  it('cadence is attached to each followUpsToday entry', () => {
    const rows = [makeRow('1', { followUp: overdueFollowUp(), contact: 'jane@example.com' })]
    const { followUpsToday } = deriveTodayCockpit(rows)
    assert.ok(followUpsToday[0].cadence, 'cadence must be present')
    assert.ok(followUpsToday[0].cadence.priority, 'cadence must have priority')
  })
})

// ---- deriveOneThing --------------------------------------------------------

describe('deriveOneThing', () => {
  function entry(id, kind, cadenceOverrides = {}) {
    return {
      row: makeRow(id, { followUp: { signal: { kind } } }),
      cadence: { priority: 'soon', nextActionCopy: 'Check back with customer', label: 'Check back', ...cadenceOverrides },
    }
  }
  function qaEntry(id, reason = 'Verify line items') {
    return { row: makeRow(id), reason }
  }

  it('overdue follow-up beats today follow-up', () => {
    const result = deriveOneThing({ followUpsToday: [entry('a', 'today'), entry('b', 'overdue')], quoteActionsNeeded: [], recentRows: [] })
    assert.ok(result.text.includes('Customer b'), `Expected "Customer b" in: ${result.text}`)
    assert.equal(result.kind, 'follow-up')
    assert.equal(result.targetScreen, 'files')
  })

  it('today follow-up beats quote action', () => {
    const result = deriveOneThing({ followUpsToday: [entry('a', 'today')], quoteActionsNeeded: [qaEntry('b')], recentRows: [] })
    assert.equal(result.targetFileId, 'a')
  })

  it('quote action beats recent file', () => {
    const result = deriveOneThing({ followUpsToday: [], quoteActionsNeeded: [qaEntry('b')], recentRows: [makeRow('c')] })
    assert.equal(result.targetFileId, 'b')
    assert.equal(result.targetScreen, 'quotePrep')
    assert.equal(result.kind, 'quote-action')
  })

  it('recent file beats null', () => {
    const result = deriveOneThing({ followUpsToday: [], quoteActionsNeeded: [], recentRows: [makeRow('c')] })
    assert.equal(result.targetFileId, 'c')
    assert.equal(result.kind, 'recent-file')
  })

  it('returns null when no data', () => {
    const result = deriveOneThing({})
    assert.equal(result, null)
  })

  it('one-thing text never contains banned phrases', () => {
    const results = [
      deriveOneThing({ followUpsToday: [entry('a', 'overdue', { nextActionCopy: 'proposal ready' })], quoteActionsNeeded: [], recentRows: [] }),
      deriveOneThing({ followUpsToday: [], quoteActionsNeeded: [qaEntry('b', 'Ready to send')], recentRows: [] }),
      deriveOneThing({ followUpsToday: [], quoteActionsNeeded: [], recentRows: [makeRow('c')] }),
    ]
    for (const r of results) {
      if (r) assert.ok(!isBannedCopy(r.text), `Banned phrase in: "${r.text}"`)
    }
  })
})
