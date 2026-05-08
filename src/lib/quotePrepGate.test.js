import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateQuotePrepGate,
  normalizeQuotePrepGateFields,
  buildCustomerFilePatchFromQuotePrepGate,
  quotePrepGateDraftFromCustomerFile,
  projectQuotePrepGateStatus,
  GATE_STATUS,
  QUOTE_TYPE_VALUES,
  DEFAULT_QUOTE_TYPE,
} from './quotePrepGate.js'
import { evaluateFieldRules } from './fieldRules.js'
import {
  buildQuotePrepEngineInput,
  normalizeQuotePrepLine,
} from './quotePrepDraft.js'
import {
  createMemoryEngine,
  createSalesOsStorage,
} from './salesOsStorage.js'
import {
  saveCustomerFileDurable,
  getCustomerFileDurable,
} from './customerFileDurable.js'

function rowOf(result, groupId, rowId) {
  const g = result.groups.find((x) => x.id === groupId)
  return g && g.rows.find((r) => r.id === rowId)
}

function readyFile(extra = {}) {
  return {
    customerName: 'Test Customer',
    customerPhone: '555-0100',
    projectAddress: '12 Oak Ln, Rockford IL',
    customerGoal: 'More heat',
    lensSetupType: 'masonry-fireplace',
    lensFuelGasPresent: 'yes',
    quotePrepQuoteType: 'planning',
    quotePrepVerificationOwner: 'Drew',
    quotePrepUnverifiedItems: 'Confirm flue.',
    quotePrepNextStep: 'Call Liam tomorrow.',
    ...extra,
  }
}

describe('quotePrepGate — normalize + patch', () => {
  it('falls back to unknown on invalid quote type', () => {
    const out = normalizeQuotePrepGateFields({ quotePrepQuoteType: 'totally-bogus' })
    assert.equal(out.quotePrepQuoteType, DEFAULT_QUOTE_TYPE)
  })

  it('preserves all valid quote types', () => {
    for (const t of QUOTE_TYPE_VALUES) {
      const out = normalizeQuotePrepGateFields({ quotePrepQuoteType: t })
      assert.equal(out.quotePrepQuoteType, t)
    }
  })

  it('strips banned sensitive keys from gate fields', () => {
    const out = normalizeQuotePrepGateFields({
      quotePrepQuoteType: 'planning',
      quotePrepVerificationOwner: 'Drew',
      cost: 9999,
      margin: 0.5,
      buyPrice: 100,
      supplierTotal: 200,
      bistrackConfidence: '0.7',
      ocrConfidence: '0.9',
      rawOcr: 'noise',
    })
    for (const k of [
      'cost', 'margin', 'buyPrice', 'supplierTotal',
      'bistrackConfidence', 'ocrConfidence', 'rawOcr',
    ]) {
      assert.equal(k in out, false, `leaked: ${k}`)
    }
    assert.equal(out.quotePrepVerificationOwner, 'Drew')
  })

  it('builds a patch with deterministic timestamp', () => {
    const patch = buildCustomerFilePatchFromQuotePrepGate(
      { quotePrepQuoteType: 'verified', quotePrepNextStep: 'Call.' },
      new Date('2026-05-08T17:00:00Z'),
    )
    assert.equal(patch.quotePrepQuoteType, 'verified')
    assert.equal(patch.quotePrepNextStep, 'Call.')
    assert.equal(patch.quotePrepGateUpdatedAt, '2026-05-08T17:00:00.000Z')
  })

  it('quotePrepGateDraftFromCustomerFile is null/undefined safe', () => {
    assert.equal(quotePrepGateDraftFromCustomerFile(null).quotePrepQuoteType, DEFAULT_QUOTE_TYPE)
    assert.equal(quotePrepGateDraftFromCustomerFile(undefined).quotePrepNextStep, '')
  })
})

describe('quotePrepGate — evaluate', () => {
  it('returns draft when there are no proposed lines', () => {
    const result = evaluateQuotePrepGate({
      file: readyFile(),
      draft: { lines: [], notes: '' },
      fieldRulesResult: { findings: [] },
    })
    assert.equal(result.status, GATE_STATUS.draft)
    assert.ok(result.reasons.some((r) => /no proposed line items/i.test(r)))
    const hasLinesRow = rowOf(result, 'lines', 'has-lines')
    assert.equal(hasLinesRow.status, 'missing')
  })

  it('counts needsVerification and readyForBistrack lines', () => {
    const draft = {
      lines: [
        normalizeQuotePrepLine({ name: 'a', reviewStatus: 'needs_verification', sourceBasis: 'manual_entry' }),
        normalizeQuotePrepLine({ name: 'b', reviewStatus: 'needs_verification', sourceBasis: 'manual_entry' }),
        normalizeQuotePrepLine({ name: 'c', reviewStatus: 'ready_for_bistrack', sourceBasis: 'manual_entry' }),
      ],
      notes: '',
    }
    const result = evaluateQuotePrepGate({
      file: readyFile(),
      draft,
      fieldRulesResult: { findings: [] },
    })
    assert.equal(result.counts.needsVerification, 2)
    assert.equal(result.counts.readyForBistrack, 1)
  })

  it('warns when any line is do_not_use_yet', () => {
    const draft = {
      lines: [
        normalizeQuotePrepLine({ name: 'a', reviewStatus: 'ready_for_bistrack', sourceBasis: 'manual_entry' }),
        normalizeQuotePrepLine({ name: 'b', reviewStatus: 'do_not_use_yet', sourceBasis: 'manual_entry' }),
      ],
      notes: '',
    }
    const result = evaluateQuotePrepGate({
      file: readyFile(),
      draft,
      fieldRulesResult: { findings: [] },
    })
    assert.equal(result.status, GATE_STATUS.needsVerification)
    const row = rowOf(result, 'lines', 'do-not-use')
    assert.equal(row.status, 'warning')
    assert.ok(/do not use yet/i.test(row.detail))
  })

  it('does not show ready when a Field Rule blocker is triggered', () => {
    const draft = {
      lines: [
        normalizeQuotePrepLine({ name: 'a', reviewStatus: 'ready_for_bistrack', sourceBasis: 'manual_entry' }),
      ],
      notes: '',
    }
    const fieldRulesResult = {
      findings: [
        { id: 'x', label: 'X', severity: 'blocker', status: 'triggered' },
      ],
    }
    const result = evaluateQuotePrepGate({
      file: readyFile(),
      draft,
      fieldRulesResult,
    })
    assert.notEqual(result.status, GATE_STATUS.ready)
    assert.equal(result.counts.triggeredBlockers, 1)
    assert.ok(result.reasons.some((r) => /field rule blocker/i.test(r)))
  })

  it('shows ready only when context, lines, rules, and quote type all line up', () => {
    const draft = {
      lines: [
        normalizeQuotePrepLine({ name: 'a', reviewStatus: 'ready_for_bistrack', sourceBasis: 'manual_entry' }),
      ],
      notes: '',
    }
    // Real Field Rules input — masonry + nothing triggered.
    const file = readyFile()
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })
    const result = evaluateQuotePrepGate({ file, draft, fieldRulesResult })
    assert.equal(result.status, GATE_STATUS.ready, JSON.stringify(result.reasons))
    assert.equal(result.label, 'Ready to build in BisTrack')
  })

  it('not ready when quote type is unknown even if everything else is fine', () => {
    const draft = {
      lines: [
        normalizeQuotePrepLine({ name: 'a', reviewStatus: 'ready_for_bistrack', sourceBasis: 'manual_entry' }),
      ],
      notes: '',
    }
    const result = evaluateQuotePrepGate({
      file: { ...readyFile(), quotePrepQuoteType: 'unknown' },
      draft,
      fieldRulesResult: { findings: [] },
    })
    assert.equal(result.status, GATE_STATUS.needsVerification)
    assert.ok(result.reasons.some((r) => /quote type/i.test(r)))
  })

  it('missing optional Customer File / Lens fields do not crash', () => {
    const result = evaluateQuotePrepGate({})
    assert.ok(result.status)
    assert.ok(Array.isArray(result.groups))
    assert.equal(result.counts.total, 0)
  })

  it('Whisper Flex satisfied via line text + ready gate stays ready', () => {
    const file = {
      ...readyFile(),
      existingNotes: 'Customer wants WMH vent-free log set.',
    }
    const draft = {
      lines: [
        normalizeQuotePrepLine({
          name: 'Whisper Flex 12', partNumber: 'T1009898-12',
          reviewStatus: 'ready_for_bistrack', sourceBasis: 'from_pricebook_or_manual',
        }),
      ],
      notes: '',
    }
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })
    const wf = fieldRulesResult.findings.find((f) => f.id === 'whisper-flex')
    assert.ok(wf && wf.status === 'satisfied')
    const result = evaluateQuotePrepGate({ file, draft, fieldRulesResult })
    assert.equal(result.status, GATE_STATUS.ready)
  })

  it('ZC ack respected: cleared ack + ready line + chosen type → ready', () => {
    const file = {
      ...readyFile(),
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'gas insert path',
      zcGasInsertAcknowledgedAt: '2026-05-08T12:00:00Z',
      zcGasInsertAcknowledgedBy: 'Drew',
    }
    const draft = {
      lines: [
        normalizeQuotePrepLine({
          name: 'Cosmo I35', reviewStatus: 'ready_for_bistrack',
          sourceBasis: 'from_bistrack_quote',
        }),
      ],
      notes: '',
    }
    const { file: engineFile, discussionText } = buildQuotePrepEngineInput(file, draft)
    const fieldRulesResult = evaluateFieldRules(engineFile, { discussionText })
    const result = evaluateQuotePrepGate({ file, draft, fieldRulesResult })
    assert.equal(result.status, GATE_STATUS.ready)
  })
})

describe('quotePrepGate — durable round trip', () => {
  it('saves + reloads file-level gate fields via memory storage', async () => {
    const storage = createSalesOsStorage({ engine: createMemoryEngine() })
    const patch = buildCustomerFilePatchFromQuotePrepGate(
      {
        quotePrepQuoteType: 'verified',
        quotePrepVerificationOwner: 'Drew',
        quotePrepUnverifiedItems: 'Flue size.',
        quotePrepNextStep: 'Confirm with Liam.',
      },
      new Date('2026-05-08T18:00:00Z'),
    )
    await saveCustomerFileDurable(storage, {
      id: 'cf-gate', customerName: 'Test', ...patch,
    })
    const reloaded = await getCustomerFileDurable(storage, 'cf-gate')
    assert.equal(reloaded.quotePrepQuoteType, 'verified')
    assert.equal(reloaded.quotePrepVerificationOwner, 'Drew')
    assert.equal(reloaded.quotePrepUnverifiedItems, 'Flue size.')
    assert.equal(reloaded.quotePrepNextStep, 'Confirm with Liam.')
    assert.equal(reloaded.quotePrepGateUpdatedAt, '2026-05-08T18:00:00.000Z')
  })
})

describe('projectQuotePrepGateStatus', () => {
  function noLinesFile() {
    return { customerName: 'A', customerPhone: '5551111' }
  }

  function readyFileWithLine() {
    return {
      customerName: 'Test',
      customerPhone: '555-0100',
      projectAddress: '12 Oak Ln',
      customerGoal: 'More heat',
      lensSetupType: 'masonry-fireplace',
      lensFuelGasPresent: 'yes',
      quotePrepQuoteType: 'planning',
      quotePrepVerificationOwner: 'Drew',
      quotePrepNextStep: 'Call Liam.',
      quotePrepLines: [
        {
          id: 'qpl-1', name: 'a',
          sourceBasis: 'manual_entry',
          reviewStatus: 'ready_for_bistrack',
        },
      ],
    }
  }

  it('returns draft state when there are no proposed lines', () => {
    const status = projectQuotePrepGateStatus(noLinesFile())
    assert.equal(status.hasLines, false)
    assert.equal(status.status, GATE_STATUS.draft)
    assert.match(status.helper, /Open Quote \/ Prep/)
  })

  it('returns needs-verification state with capped reasons', () => {
    const status = projectQuotePrepGateStatus({
      customerName: 'Test',
      customerPhone: '555',
      // no goal, no setup, do_not_use line
      quotePrepLines: [
        { id: 'a', name: 'a', sourceBasis: 'manual_entry', reviewStatus: 'do_not_use_yet' },
      ],
    })
    assert.equal(status.status, GATE_STATUS.needsVerification)
    assert.ok(status.reasons.length <= 2)
    assert.equal(status.label, 'Needs verification before BisTrack')
  })

  it('returns ready-to-build-in-BisTrack when everything aligns', () => {
    const status = projectQuotePrepGateStatus(readyFileWithLine())
    assert.equal(status.status, GATE_STATUS.ready)
    assert.equal(status.label, 'Ready to build in BisTrack')
    assert.match(status.helper, /Build and verify the official quote in BisTrack/)
  })

  it('count summary surfaces total / needsVerification / readyForBistrack / doNotUseYet', () => {
    const status = projectQuotePrepGateStatus({
      customerName: 'Test', customerPhone: '555',
      quotePrepLines: [
        { id: 'a', name: 'a', reviewStatus: 'needs_verification' },
        { id: 'b', name: 'b', reviewStatus: 'needs_verification' },
        { id: 'c', name: 'c', reviewStatus: 'ready_for_bistrack' },
        { id: 'd', name: 'd', reviewStatus: 'do_not_use_yet' },
      ],
    })
    assert.equal(status.counts.total, 4)
    assert.equal(status.counts.needsVerification, 2)
    assert.equal(status.counts.readyForBistrack, 1)
    assert.equal(status.counts.doNotUseYet, 1)
  })

  it('never surfaces banned customer-facing wording in label or helper', () => {
    const banned = [/ready to send/i, /proposal ready/i, /customer ready/i, /\bapproved\b/i]
    const variants = [
      projectQuotePrepGateStatus(noLinesFile()),
      projectQuotePrepGateStatus({
        customerName: 'X', customerPhone: '5', quotePrepLines: [{ id: '1', reviewStatus: 'do_not_use_yet' }],
      }),
      projectQuotePrepGateStatus(readyFileWithLine()),
    ]
    for (const v of variants) {
      for (const re of banned) {
        assert.equal(re.test(v.label), false, `label: ${v.label}`)
        assert.equal(re.test(v.helper), false, `helper: ${v.helper}`)
        for (const r of v.reasons) {
          assert.equal(re.test(r), false, `reason: ${r}`)
        }
      }
    }
  })

  it('does not crash on missing/empty file', () => {
    const a = projectQuotePrepGateStatus(undefined)
    const b = projectQuotePrepGateStatus(null)
    const c = projectQuotePrepGateStatus({})
    for (const status of [a, b, c]) {
      assert.ok(status.status)
      assert.equal(status.hasLines, false)
    }
  })

  it('does not surface sensitive keys to display output', () => {
    const status = projectQuotePrepGateStatus({
      customerName: 'X', customerPhone: '5',
      cost: 999, margin: 0.4, buyPrice: 50,
      supplierTotal: 100, bistrackConfidence: '0.5',
      ocrConfidence: '0.7', rawOcr: 'noise', rawPdf: 'bytes',
      quotePrepLines: [{ id: '1', name: 'a', reviewStatus: 'do_not_use_yet' }],
    })
    const keys = Object.keys(status)
    for (const k of keys) {
      const lower = k.toLowerCase()
      for (const banned of ['cost', 'margin', 'buyprice', 'supplier', 'rawocr', 'rawpdf', 'bistrackconfidence', 'ocrconfidence']) {
        assert.equal(lower.includes(banned), false, `leaked key: ${k}`)
      }
    }
  })
})
