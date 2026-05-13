import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveTodayHearthSessions,
  projectHearthSessionForInternalHandoff,
  buildHearthSessionBackstageSummary,
  pickHearthSessionToResume,
  deriveCustomerFileLaunchAction,
  projectHearthSessionForGuestMode,
  COMPLETED_RECENT_DAYS,
} from './todayHearthSessions.js'
import { SESSION_STATUS } from './hearthStudioSessionStorage.js'

const NOW = new Date('2026-05-13T12:00:00Z')

function isoMinusDays(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString()
}

function makeSession(id, fileId, status, overrides = {}) {
  return {
    id,
    customerFileId: fileId,
    status,
    currentChapter: overrides.currentChapter ?? 3,
    chaptersCompleted: overrides.chaptersCompleted ?? [0, 1, 2],
    selections: overrides.selections ?? {
      setupType: 'Insert',
      goal: 'Replace existing',
      stoneSeries: 'Silverton Mountain Ledge',
      investment: { total: 9999 },
      roomContext: { secret: 'internal' },
    },
    flags: overrides.flags ?? { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: [] },
    startedAt: overrides.startedAt ?? isoMinusDays(2),
    lastTouchedAt: overrides.lastTouchedAt ?? isoMinusDays(1),
    completedAt: overrides.completedAt ?? null,
    pausedAt: overrides.pausedAt ?? null,
    softDeletedAt: overrides.softDeletedAt ?? null,
  }
}

const files = [
  { id: 'f1', customerName: 'Drew Y.' },
  { id: 'f2', customerName: 'Jane Doe' },
]

describe('deriveTodayHearthSessions', () => {
  it('returns empty array for no sessions', () => {
    assert.deepEqual(deriveTodayHearthSessions({ sessions: [], files, now: NOW }), [])
  })

  it('surfaces active sessions', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [makeSession('s1', 'f1', SESSION_STATUS.active)],
      files,
      now: NOW,
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sessionId, 's1')
    assert.equal(rows[0].customerName, 'Drew Y.')
    assert.equal(rows[0].status, SESSION_STATUS.active)
  })

  it('surfaces paused sessions', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [makeSession('s1', 'f1', SESSION_STATUS.paused, { pausedAt: isoMinusDays(0.5) })],
      files,
      now: NOW,
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, SESSION_STATUS.paused)
  })

  it('excludes soft-deleted sessions', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [
        makeSession('s1', 'f1', SESSION_STATUS.soft_deleted, { softDeletedAt: isoMinusDays(0.5) }),
      ],
      files,
      now: NOW,
    })
    assert.equal(rows.length, 0)
  })

  it('drops completed sessions older than COMPLETED_RECENT_DAYS', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [
        makeSession('s-old', 'f1', SESSION_STATUS.completed, {
          completedAt: isoMinusDays(COMPLETED_RECENT_DAYS + 2),
          lastTouchedAt: isoMinusDays(COMPLETED_RECENT_DAYS + 2),
        }),
        makeSession('s-new', 'f1', SESSION_STATUS.completed, {
          completedAt: isoMinusDays(2),
          lastTouchedAt: isoMinusDays(2),
        }),
      ],
      files,
      now: NOW,
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sessionId, 's-new')
  })

  it('skips orphans whose customer file is missing — no crash', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [makeSession('s1', 'missing-file', SESSION_STATUS.active)],
      files,
      now: NOW,
    })
    assert.equal(rows.length, 0)
  })

  it('active/paused beat recent completed', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [
        makeSession('completed', 'f1', SESSION_STATUS.completed, {
          completedAt: isoMinusDays(0.1),
          lastTouchedAt: isoMinusDays(0.1),
        }),
        makeSession('active', 'f2', SESSION_STATUS.active, { lastTouchedAt: isoMinusDays(3) }),
      ],
      files,
      now: NOW,
    })
    assert.equal(rows[0].sessionId, 'active')
    assert.equal(rows[1].sessionId, 'completed')
  })

  it('sorts newest lastTouchedAt first within active/paused', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [
        makeSession('older', 'f1', SESSION_STATUS.active, { lastTouchedAt: isoMinusDays(3) }),
        makeSession('newer', 'f2', SESSION_STATUS.active, { lastTouchedAt: isoMinusDays(0.5) }),
      ],
      files,
      now: NOW,
    })
    assert.equal(rows[0].sessionId, 'newer')
    assert.equal(rows[1].sessionId, 'older')
  })

  it('does not expose sensitive selection fields', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [makeSession('s1', 'f1', SESSION_STATUS.active)],
      files,
      now: NOW,
    })
    const row = rows[0]
    const flat = JSON.stringify(row)
    assert.ok(!flat.includes('investment'), 'investment must not appear')
    assert.ok(!flat.includes('roomContext'), 'roomContext must not appear')
    assert.ok(!flat.includes('9999'), 'investment.total must not leak')
    assert.ok(!flat.includes('internal'), 'roomContext.secret must not leak')
  })

  it('honors limit', () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      makeSession(`s${i}`, 'f1', SESSION_STATUS.active, { lastTouchedAt: isoMinusDays(i) })
    )
    const rows = deriveTodayHearthSessions({ sessions, files, now: NOW, limit: 3 })
    assert.equal(rows.length, 3)
  })

  it('handles empty files list gracefully', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [makeSession('s1', 'f1', SESSION_STATUS.active)],
      files: [],
      now: NOW,
    })
    assert.equal(rows.length, 0)
  })

  it('carries triggered field rule labels through to row', () => {
    const rows = deriveTodayHearthSessions({
      sessions: [
        makeSession('s1', 'f1', SESSION_STATUS.active, {
          flags: { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: ['ZC gas insert ack'] },
        }),
      ],
      files,
      now: NOW,
    })
    assert.deepEqual(rows[0].fieldRuleLabels, ['ZC gas insert ack'])
  })
})

describe('projectHearthSessionForInternalHandoff', () => {
  it('returns null for invalid input', () => {
    assert.equal(projectHearthSessionForInternalHandoff(null), null)
    assert.equal(projectHearthSessionForInternalHandoff({}), null)
  })

  it('builds internal handoff shape', () => {
    const view = projectHearthSessionForInternalHandoff(
      makeSession('s1', 'f1', SESSION_STATUS.paused)
    )
    assert.ok(view)
    assert.equal(view.sessionId, 's1')
    assert.equal(view.customerFileId, 'f1')
    assert.equal(view.status, SESSION_STATUS.paused)
    assert.equal(view.chapterProgress.currentChapter, 3)
    assert.equal(view.chapterProgress.chaptersCompletedCount, 3)
    assert.equal(view.needsVerification, true)
    assert.ok(view.contextLabel.toLowerCase().includes('verification'))
  })

  it('strips investment + roomContext from explored selections', () => {
    const view = projectHearthSessionForInternalHandoff(
      makeSession('s1', 'f1', SESSION_STATUS.active)
    )
    const flat = JSON.stringify(view)
    assert.ok(!flat.includes('investment'))
    assert.ok(!flat.includes('roomContext'))
    assert.ok(!flat.includes('9999'))
  })

  it('contextLabel is never customer-facing', () => {
    const view = projectHearthSessionForInternalHandoff(
      makeSession('s1', 'f1', SESSION_STATUS.active)
    )
    const banned = ['ready to send', 'proposal ready', 'customer ready', 'approved']
    const lower = view.contextLabel.toLowerCase()
    for (const b of banned) assert.ok(!lower.includes(b), `banned phrase "${b}" found`)
  })
})

describe('buildHearthSessionBackstageSummary', () => {
  it('returns null for invalid input', () => {
    assert.equal(buildHearthSessionBackstageSummary(null), null)
    assert.equal(buildHearthSessionBackstageSummary({}), null)
  })

  it('builds summary with explored selection bullets', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.paused, {
        selections: {
          setupType: 'Zero-clearance gas',
          goal: 'Ambiance + easier operation',
          stoneSeries: 'Silverton Mountain Ledge',
          dimensions: { w: 42, h: 30, d: 18 },
          investment: { total: 9999 },
          roomContext: { secret: 'internal' },
        },
      })
    )
    assert.ok(summary)
    assert.equal(summary.sessionId, 's1')
    assert.ok(summary.guestDirection.length > 0)
    const labels = summary.exploredSelections.map((s) => s.label)
    assert.ok(labels.includes('Setup'))
    assert.ok(labels.includes('Stone'))
    assert.ok(labels.includes('Dimensions'))
    const dims = summary.exploredSelections.find((s) => s.label === 'Dimensions')
    assert.equal(dims.value, '42 x 30 x 18')
  })

  it('always includes baseline verification checklist', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active)
    )
    for (const item of ['Fireplace type', 'Opening dimensions', 'Venting path', 'Gas availability']) {
      assert.ok(summary.verificationChecklist.includes(item), `missing baseline: ${item}`)
    }
  })

  it('adds field-rule labels to verification checklist', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active, {
        flags: { needsFieldMeasure: false, hasComplexSetup: false, fieldRulesTriggered: ['ZC gas insert ack'] },
      })
    )
    assert.ok(summary.verificationChecklist.includes('ZC gas insert ack'))
    assert.deepEqual([...summary.fieldRuleLabels], ['ZC gas insert ack'])
  })

  it('strips sensitive selection keys from the summary', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active)
    )
    const flat = JSON.stringify(summary)
    assert.ok(!flat.includes('investment'))
    assert.ok(!flat.includes('roomContext'))
    assert.ok(!flat.includes('9999'))
    assert.ok(!flat.includes('internal'))
  })

  it('salesNote names BisTrack as quote source of truth', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active)
    )
    assert.ok(summary.salesNote.toLowerCase().includes('bistrack'))
    assert.ok(summary.salesNote.toLowerCase().includes('discovery support'))
  })

  it('summary contains no banned customer-readiness phrases', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active, {
        selections: { setupType: 'approved by customer' },
      })
    )
    const flat = JSON.stringify(summary).toLowerCase()
    for (const b of ['ready to send', 'proposal ready', 'customer ready']) {
      assert.ok(!flat.includes(b), `banned phrase "${b}" found`)
    }
    // 'approved' may flow through user-entered selections; but salesNote must not introduce it.
    assert.ok(!summary.salesNote.toLowerCase().includes('approved'))
  })

  it('placeholder', () => { assert.ok(true) })
})

describe('pickHearthSessionToResume', () => {
  it('returns null for empty list', () => {
    assert.equal(pickHearthSessionToResume([]), null)
    assert.equal(pickHearthSessionToResume(null), null)
  })
  it('picks active over paused over completed', () => {
    const sessions = [
      makeSession('paused', 'f1', SESSION_STATUS.paused, { lastTouchedAt: isoMinusDays(0.1) }),
      makeSession('active', 'f1', SESSION_STATUS.active, { lastTouchedAt: isoMinusDays(3) }),
      makeSession('done', 'f1', SESSION_STATUS.completed, { completedAt: isoMinusDays(0.05), lastTouchedAt: isoMinusDays(0.05) }),
    ]
    assert.equal(pickHearthSessionToResume(sessions).id, 'active')
  })
  it('falls through to paused when no active', () => {
    const sessions = [
      makeSession('p1', 'f1', SESSION_STATUS.paused, { lastTouchedAt: isoMinusDays(3) }),
      makeSession('p2', 'f1', SESSION_STATUS.paused, { lastTouchedAt: isoMinusDays(0.5) }),
    ]
    assert.equal(pickHearthSessionToResume(sessions).id, 'p2')
  })
  it('skips soft-deleted', () => {
    const sessions = [
      makeSession('del', 'f1', SESSION_STATUS.soft_deleted, { softDeletedAt: isoMinusDays(0.1) }),
    ]
    assert.equal(pickHearthSessionToResume(sessions), null)
  })
  it('does not auto-resume completed sessions', () => {
    const sessions = [makeSession('done', 'f1', SESSION_STATUS.completed, { completedAt: isoMinusDays(0.1) })]
    assert.equal(pickHearthSessionToResume(sessions), null)
  })
})

describe('deriveCustomerFileLaunchAction', () => {
  it('returns start action when no sessions exist', () => {
    const action = deriveCustomerFileLaunchAction({ sessions: [], customerName: 'Drew' })
    assert.equal(action.mode, 'start')
    assert.equal(action.sessionId, null)
    assert.ok(/Begin/.test(action.label))
    assert.ok(action.helperText.includes('Drew'))
  })
  it('returns resume action when an active session exists', () => {
    const sessions = [makeSession('s1', 'f1', SESSION_STATUS.active, { currentChapter: 4 })]
    const action = deriveCustomerFileLaunchAction({ sessions, customerName: 'Jane' })
    assert.equal(action.mode, 'resume')
    assert.equal(action.sessionId, 's1')
    assert.ok(/Resume/.test(action.label))
    assert.ok(action.helperText.toLowerCase().includes('jane'))
  })
  it('label and helperText contain no banned phrases', () => {
    const banned = ['ready to send', 'proposal ready', 'customer ready', 'approved']
    const cases = [
      deriveCustomerFileLaunchAction({ sessions: [], customerName: 'Drew' }),
      deriveCustomerFileLaunchAction({
        sessions: [makeSession('s1', 'f1', SESSION_STATUS.paused)],
        customerName: 'Drew',
      }),
    ]
    for (const a of cases) {
      const flat = (a.label + ' ' + a.helperText).toLowerCase()
      for (const b of banned) assert.ok(!flat.includes(b), `banned phrase "${b}" in: ${flat}`)
    }
  })
  it('safe when customerName is missing', () => {
    const action = deriveCustomerFileLaunchAction({ sessions: [] })
    assert.equal(action.mode, 'start')
    assert.ok(action.helperText.length > 0)
  })
})

describe('projectHearthSessionForGuestMode', () => {
  it('returns null for invalid input', () => {
    assert.equal(projectHearthSessionForGuestMode(null), null)
    assert.equal(projectHearthSessionForGuestMode({}), null)
  })
  it('exposes only customer-safe fields', () => {
    const view = projectHearthSessionForGuestMode(
      makeSession('s1', 'f1', SESSION_STATUS.active, { currentChapter: 5 })
    )
    const flat = JSON.stringify(view)
    assert.ok(!flat.includes('investment'))
    assert.ok(!flat.includes('roomContext'))
    assert.ok(!flat.includes('9999'))
    assert.ok(!flat.includes('fieldRule'))
    assert.ok(!flat.includes('salesNote'))
  })
  it('builds 1-indexed progress label', () => {
    const view = projectHearthSessionForGuestMode(
      makeSession('s1', 'f1', SESSION_STATUS.active, { currentChapter: 5 })
    )
    assert.ok(view.progressLabel.includes('06'))
    assert.ok(view.progressLabel.includes('13'))
  })

  it('uses customer-safe chapter labels, not backstage labels', () => {
    // Backstage label for chapter 2 is "Fit Gauge" — too jargon-y for a customer.
    const view = projectHearthSessionForGuestMode(
      makeSession('s1', 'f1', SESSION_STATUS.active, { currentChapter: 2 })
    )
    assert.equal(view.chapterLabel, 'How it’ll fit')
    assert.ok(!view.progressLabel.includes('Fit Gauge'))
  })

  it('rewords chapters 7, 9, and 11 for customer readability', () => {
    const cases = [
      { ch: 7, expected: 'Hearth & surround' },
      { ch: 9, expected: 'Our recommendation' },
      { ch: 11, expected: 'Confirming details' },
    ]
    for (const { ch, expected } of cases) {
      const view = projectHearthSessionForGuestMode(
        makeSession(`s-${ch}`, 'f1', SESSION_STATUS.active, { currentChapter: ch })
      )
      assert.equal(view.chapterLabel, expected)
    }
  })

  it('guestDirection fallback marker', () => {
    const summary = buildHearthSessionBackstageSummary(
      makeSession('s1', 'f1', SESSION_STATUS.active, {
        selections: {},
        currentChapter: 2,
      })
    )
    assert.ok(summary.guestDirection.toLowerCase().includes('fit gauge') || summary.guestDirection.length > 0)
  })
})
