import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  projectBisTrackHandoff,
  formatBisTrackHandoffAsText,
} from './bisTrackHandoff.js'

function readyFile() {
  return {
    customerName: 'Test Customer',
    customerPhone: '555-0100',
    customerEmail: 'test@example.com',
    projectAddress: '12 Oak Ln, Rockford IL',
    customerGoal: 'More heat',
    goalNotes: 'Family room.',
    existingNotes: 'WMH vent-free log set.',
    likelyPath: 'Replace logs with insert.',
    lensSetupType: 'masonry-fireplace',
    lensFuelGasPresent: 'yes',
    quotePrepQuoteType: 'planning',
    quotePrepVerificationOwner: 'Drew',
    quotePrepUnverifiedItems: 'Confirm flue.',
    quotePrepNextStep: 'Call Liam.',
    quotePrepLines: [
      {
        id: 'qpl-1',
        name: 'Whisper Flex 12',
        partNumber: 'T1009898-12',
        brand: 'Empire',
        category: 'gas-flex',
        quantity: '1',
        customerSafeNotes: 'Required with vent-free log set.',
        internalPrepNote: 'Pull from shop.',
        sourceBasis: 'from_pricebook_or_manual',
        reviewStatus: 'ready_for_bistrack',
        reviewFlags: ['sku_or_part_confirmed', 'field_rule_checked'],
      },
    ],
  }
}

describe('bisTrackHandoff — projectBisTrackHandoff', () => {
  it('returns a safe view model on empty/missing input', () => {
    const a = projectBisTrackHandoff(undefined)
    const b = projectBisTrackHandoff(null)
    const c = projectBisTrackHandoff({})
    for (const view of [a, b, c]) {
      assert.equal(view.title, 'Internal BisTrack Handoff')
      assert.ok(view.subtitle)
      assert.equal(view.customer.customerName, 'Unnamed customer')
      assert.deepEqual(view.lineItems, [])
      assert.deepEqual(view.lensFacts, [])
      assert.ok(view.gate)
      assert.ok(view.fieldRules)
      assert.ok(Array.isArray(view.nextActions))
      assert.ok(Array.isArray(view.warnings))
    }
  })

  it('includes customer header when present', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.equal(view.customer.customerName, 'Test Customer')
    assert.equal(view.customer.contact, '555-0100')
    assert.equal(view.customer.projectAddress, '12 Oak Ln, Rockford IL')
  })

  it('includes Quote Prep Gate status, quote type, owner, unverified items, and next step', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.equal(view.gate.status, 'ready')
    assert.equal(view.gate.label, 'Ready to build in BisTrack')
    assert.equal(view.gate.quoteType, 'Planning / ballpark')
    assert.equal(view.gate.verificationOwner, 'Drew')
    assert.equal(view.gate.unverifiedItems, 'Confirm flue.')
    assert.equal(view.gate.nextStep, 'Call Liam.')
  })

  it('helper line says build and verify in BisTrack when ready', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.match(view.subtitle, /Build and verify the official quote in BisTrack/i)
  })

  it('helper line says internal prep only when not ready', () => {
    const view = projectBisTrackHandoff({ customerName: 'X' })
    assert.match(view.subtitle, /BisTrack remains source of truth/i)
  })

  it('includes Lens facts when present', () => {
    const view = projectBisTrackHandoff(readyFile())
    const labels = view.lensFacts.map((f) => f.label)
    assert.ok(labels.includes('Customer goal'))
    assert.ok(labels.includes('Setup type'))
    assert.ok(labels.includes('Existing notes'))
  })

  it('includes proposed line items with safe fields and labels', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.equal(view.lineItems.length, 1)
    const line = view.lineItems[0]
    assert.equal(line.name, 'Whisper Flex 12')
    assert.equal(line.partNumber, 'T1009898-12')
    assert.equal(line.brand, 'Empire')
    assert.equal(line.category, 'gas-flex')
    assert.equal(line.quantity, '1')
    assert.equal(line.customerSafeNotes, 'Required with vent-free log set.')
    assert.equal(line.internalPrepNote, 'Pull from shop.')
    assert.equal(line.sourceBasisLabel, 'From price list / manual')
    assert.equal(line.reviewStatusLabel, 'Ready for BisTrack')
    assert.deepEqual(line.reviewFlags, ['SKU / part confirmed', 'Field rule checked'])
  })

  it('strips banned sensitive keys baked into a poisoned line', () => {
    const file = readyFile()
    file.quotePrepLines[0].cost = 999
    file.quotePrepLines[0].margin = 0.5
    file.quotePrepLines[0].buyPrice = 100
    file.quotePrepLines[0].supplierTotal = 200
    file.quotePrepLines[0].rawOcr = 'noise'
    file.quotePrepLines[0].bistrackConfidence = '0.7'
    const view = projectBisTrackHandoff(file)
    const line = view.lineItems[0]
    for (const k of ['cost', 'margin', 'buyPrice', 'supplierTotal', 'rawOcr', 'bistrackConfidence']) {
      assert.equal(k in line, false, `leaked: ${k}`)
    }
  })

  it('never surfaces banned customer-facing phrases', () => {
    const banned = [/ready to send/i, /proposal ready/i, /customer ready/i, /\bapproved\b/i]
    const variants = [
      projectBisTrackHandoff({}),
      projectBisTrackHandoff(readyFile()),
      projectBisTrackHandoff({
        customerName: 'X',
        quotePrepLines: [{ id: '1', name: 'a', reviewStatus: 'do_not_use_yet' }],
      }),
    ]
    function walk(value, path = '') {
      if (value === null || value === undefined) return
      if (typeof value === 'string') {
        for (const re of banned) {
          assert.equal(re.test(value), false, `banned phrase at ${path}: ${value}`)
        }
        return
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`))
        return
      }
      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`)
      }
    }
    for (const v of variants) walk(v)
  })

  it('projects Field Rules state without duplicating rule logic', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.ok(view.fieldRules)
    assert.ok(Array.isArray(view.fieldRules.items))
    // Whisper Flex should be satisfied because line carries T1009898-12.
    const wf = view.fieldRules.items.find((i) => i.id === 'whisper-flex')
    assert.ok(wf, 'whisper-flex finding missing')
    assert.equal(wf.status, 'satisfied')
    assert.equal(view.fieldRules.counts.satisfied >= 1, true)
  })

  it('passes through gate reason action descriptors as next actions', () => {
    const view = projectBisTrackHandoff({
      customerName: 'X',
      // missing customer goal so the gate emits a Lens action.
      quotePrepLines: [{
        id: '1', name: 'a', sourceBasis: 'manual_entry',
        reviewStatus: 'ready_for_bistrack',
      }],
      lensSetupType: 'masonry-fireplace',
      quotePrepQuoteType: 'planning',
      customerPhone: '5551111',
    })
    const lensAction = view.nextActions.find((a) => a.actionTarget === 'lens')
    assert.ok(lensAction, 'expected lens action')
    assert.equal(lensAction.actionLabel, 'Open Setup + Goal Lens')
  })

  it('does not surface raw sensitive top-level keys', () => {
    const view = projectBisTrackHandoff({
      customerName: 'X',
      cost: 999,
      margin: 0.5,
      buyPrice: 100,
      supplierTotal: 200,
      rawOcr: 'noise',
      bistrackConfidence: '0.7',
      ocrConfidence: '0.9',
      salesRank: 1,
      productRank: 2,
    })
    const flat = JSON.stringify(view).toLowerCase()
    for (const phrase of ['"cost"', '"margin"', '"buyprice"', '"suppliertotal"', '"rawocr"', '"bistrackconfidence"', '"ocrconfidence"', '"salesrank"', '"productrank"']) {
      assert.equal(flat.includes(phrase), false, `leaked key: ${phrase}`)
    }
  })

  it('warnings flag missing customer name and missing contact', () => {
    const view = projectBisTrackHandoff({})
    assert.ok(view.warnings.some((w) => /customer name/i.test(w)))
    assert.ok(view.warnings.some((w) => /phone or email/i.test(w)))
  })

  it('source-of-truth note never claims customer readiness', () => {
    const view = projectBisTrackHandoff(readyFile())
    assert.match(view.sourceNote, /BisTrack remains the official quote/i)
    assert.equal(/customer ready|proposal ready|ready to send|\bapproved\b/i.test(view.sourceNote), false)
  })
})

describe('bisTrackHandoff — formatBisTrackHandoffAsText', () => {
  it('handles empty/missing view safely without throwing', () => {
    assert.equal(typeof formatBisTrackHandoffAsText(null), 'string')
    assert.equal(typeof formatBisTrackHandoffAsText(undefined), 'string')
    assert.equal(typeof formatBisTrackHandoffAsText({}), 'string')
    const empty = formatBisTrackHandoffAsText({})
    assert.match(empty, /Internal BisTrack Handoff/)
  })

  it('includes title and source-of-truth note', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /Internal BisTrack Handoff/)
    assert.match(text, /BisTrack remains the official quote/i)
  })

  it('includes customer/project header when present', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /CUSTOMER/)
    assert.match(text, /Test Customer/)
    assert.match(text, /555-0100/)
    assert.match(text, /12 Oak Ln, Rockford IL/)
  })

  it('includes gate status and gate fields', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /QUOTE PREP GATE/)
    assert.match(text, /Status: Ready to build in BisTrack/i)
    assert.match(text, /Quote type: Planning \/ ballpark/)
    assert.match(text, /Verification owner: Drew/)
    assert.match(text, /Next step: Call Liam\./)
  })

  it('includes Lens facts section', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /SETUP \+ GOAL LENS/)
    assert.match(text, /Customer goal:/)
    assert.match(text, /Setup type:/)
  })

  it('includes proposed line items with safe fields and review state', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /PROPOSED LINE ITEMS/)
    assert.match(text, /Whisper Flex 12/)
    assert.match(text, /Part: T1009898-12/)
    assert.match(text, /Brand: Empire/)
    assert.match(text, /Source basis: From price list \/ manual/)
    assert.match(text, /Review status: Ready for BisTrack/)
    assert.match(text, /Flags: SKU \/ part confirmed, Field rule checked/)
  })

  it('includes Field Rules summary block', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /FIELD RULES/)
    assert.match(text, /\[SATISFIED\]/)
  })

  it('includes missing / next actions when present', () => {
    const file = {
      customerName: 'X', customerPhone: '5',
      // missing goal, missing setup type — should produce next actions
      quotePrepLines: [{ id: '1', name: 'a', sourceBasis: 'manual_entry', reviewStatus: 'ready_for_bistrack' }],
      quotePrepQuoteType: 'planning',
    }
    const view = projectBisTrackHandoff(file)
    const text = formatBisTrackHandoffAsText(view)
    assert.match(text, /MISSING \/ NEXT ACTIONS/)
    assert.match(text, /\(Open Setup \+ Goal Lens\)/)
  })

  it('omits empty sections', () => {
    const text = formatBisTrackHandoffAsText({
      title: 'Internal BisTrack Handoff',
      subtitle: 'sub',
      customer: { customerName: '', contact: '', projectAddress: '' },
      gate: null,
      lensFacts: [],
      lineItems: [],
      fieldRules: { items: [], counts: {} },
      nextActions: [],
      warnings: [],
      sourceNote: 'x',
    })
    assert.equal(/QUOTE PREP GATE/.test(text), false)
    assert.equal(/SETUP \+ GOAL LENS/.test(text), false)
    assert.equal(/PROPOSED LINE ITEMS/.test(text), false)
    assert.equal(/FIELD RULES/.test(text), false)
    assert.equal(/MISSING \/ NEXT ACTIONS/.test(text), false)
    assert.equal(/CUSTOMER\n/.test(text), false)
  })

  it('output is plain text — no HTML tags or Markdown tables', () => {
    const view = projectBisTrackHandoff(readyFile())
    const text = formatBisTrackHandoffAsText(view)
    assert.equal(/<\w+[^>]*>/.test(text), false, 'should not contain HTML tags')
    assert.equal(/^\|.*\|$/m.test(text), false, 'should not contain Markdown tables')
  })

  it('never includes banned customer-facing phrases', () => {
    const banned = [/ready to send/i, /proposal ready/i, /customer ready/i, /\bapproved\b/i]
    const variants = [
      formatBisTrackHandoffAsText(projectBisTrackHandoff({})),
      formatBisTrackHandoffAsText(projectBisTrackHandoff(readyFile())),
      formatBisTrackHandoffAsText(projectBisTrackHandoff({
        customerName: 'X',
        quotePrepLines: [{ id: '1', name: 'a', reviewStatus: 'do_not_use_yet' }],
      })),
    ]
    for (const text of variants) {
      for (const re of banned) {
        assert.equal(re.test(text), false, `banned phrase in:\n${text}`)
      }
    }
  })

  it('strips/omits sensitive keys and poisoned values', () => {
    const view = projectBisTrackHandoff({
      customerName: 'X', customerPhone: '5',
      cost: 999, margin: 0.5, buyPrice: 100, supplierTotal: 200,
      bistrackConfidence: '0.9', ocrConfidence: '0.7', rawOcr: 'noise',
      salesRank: 1, productRank: 2,
      quotePrepLines: [{
        id: '1', name: 'Bad line', cost: 9999, margin: 0.4, buyPrice: 50,
        rawOcr: 'leak', bistrackConfidence: '0.5',
      }],
    })
    const text = formatBisTrackHandoffAsText(view).toLowerCase()
    for (const phrase of [
      'cost:', 'margin:', 'buy price', 'supplier total',
      'raw ocr', 'raw pdf', 'bistrack confidence',
      'fuzzy match', 'ocr confidence', 'sales rank', 'product rank',
    ]) {
      assert.equal(text.includes(phrase), false, `leaked phrase: ${phrase}`)
    }
  })
})
