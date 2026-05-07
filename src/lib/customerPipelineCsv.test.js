import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCsv,
  parseCustomerPipelineCsv,
  normalizePipelineRow,
  buildPipelineDraft,
  createOpportunityDraftsFromPipelineCsv,
  buildImportSummary,
} from './customerPipelineCsv.js'

const HEADERS = 'Date Visited,Customer Name,Phone,Email,Source,Stage,Who Helped,Fireplace / Product Interest,Stone / Surround Interest,Quote Total,Next Action,Notes'

const SAMPLE_CSV = `${HEADERS}
5/6/26,Alex Sample,815-555-0100,alex@example.com,Walk-in,Active - Quote Stage,Drew,Kozy Heat 36" DV,"Halquist Cascade",,Follow-up call,"New build; corner unit"
4/27/26,"Pat Example",312-555-0199,,Walk-in,Active - Quote Sent,Drew / Liam,"Lopi Insert; liner kit",,$21067.54,Follow up on deposit,"Quote #74465"
6/8/24,Old Lead,,,Walk-in,Dead / Needs Revival,Liam,Lopi gas stove,,,$6594.86,Verify still interested,"2 years old"
`

test('parseCsv handles quoted fields, escaped quotes, blank lines', () => {
  const text = `a,b,c\n"hello, world","he said ""hi""",3\n\n,,\nx,y,z\n`
  const rows = parseCsv(text)
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['hello, world', 'he said "hi"', '3'],
    ['x', 'y', 'z'],
  ])
})

test('parseCsv strips BOM', () => {
  const text = '﻿a,b\n1,2\n'
  const rows = parseCsv(text)
  assert.deepEqual(rows[0], ['a', 'b'])
})

test('parseCustomerPipelineCsv parses sample valid CSV', () => {
  const result = parseCustomerPipelineCsv(SAMPLE_CSV)
  assert.equal(result.error, undefined)
  assert.equal(result.records.length, 3)
  assert.equal(result.records[0].customerName, 'Alex Sample')
  assert.equal(result.records[0].customerPhone, '815-555-0100')
  assert.equal(result.records[0].customerEmail, 'alex@example.com')
  assert.equal(result.records[0].quoteDate, '05/06/2026')
  assert.equal(result.records[0].status, 'needs-review')
  assert.equal(result.records[0].projectType, 'Fireplace')
})

test('parseCustomerPipelineCsv rejects CSV missing required columns', () => {
  const result = parseCustomerPipelineCsv('Foo,Bar\n1,2\n')
  assert.match(result.error || '', /Missing required columns/)
  assert.equal(result.records.length, 0)
})

test('normalizePipelineRow handles missing optional fields', () => {
  const record = normalizePipelineRow({
    'Date Visited': '',
    'Customer Name': 'Solo',
    'Phone': '',
    'Email': '',
    'Source': '',
    'Stage': '',
    'Who Helped': '',
    'Fireplace / Product Interest': '',
    'Stone / Surround Interest': '',
    'Quote Total': '',
    'Next Action': '',
    'Notes': '',
  })
  assert.equal(record.customerName, 'Solo')
  assert.equal(record.customerPhone, '')
  assert.equal(record.customerEmail, '')
  assert.equal(record.quoteDate, '')
  assert.equal(record.status, '')
  assert.equal(record.quoteTotal, '')
  assert.equal(record.projectType, 'Fireplace Project')
})

test('normalizePipelineRow extracts first phone from multi-phone cell and preserves raw in notes', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Two Phones',
    'Phone': 'Carroll: 832-405-9826 / Kathy: 815-973-1404',
    'Email': '',
    'Stage': 'Active - Quote Sent',
    'Notes': 'note',
  })
  assert.equal(record.customerPhone, '832-405-9826')
  assert.match(record.internalNotes, /Phone cell raw/)
  assert.equal(record.status, 'waiting-on-customer')
})

test('normalizePipelineRow strips parens/quotes from customer name', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Teresa Geiger ("Tereisa")',
    'Phone': '815-555-0100',
  })
  assert.equal(record.customerName, 'Teresa Geiger')
})

test('normalizePipelineRow drops rows with no customer name', () => {
  assert.equal(normalizePipelineRow({ 'Customer Name': '   ' }), null)
})

test('parseCustomerPipelineCsv skips blank rows and counts skipped', () => {
  const text = `${HEADERS}\n,,,,,,,,,,,\n5/6/26,OK Person,815-555-0100,,Walk-in,Active - Quote Stage,,,,,,\n`
  const result = parseCustomerPipelineCsv(text)
  assert.equal(result.records.length, 1)
})

test('buildPipelineDraft preserves notes and stage status', () => {
  const record = normalizePipelineRow({
    'Date Visited': '4/27/26',
    'Customer Name': 'Pat Example',
    'Phone': '312-555-0199',
    'Email': '',
    'Source': 'Walk-in',
    'Stage': 'Active - Quote Sent',
    'Who Helped': 'Drew',
    'Fireplace / Product Interest': 'Lopi Insert; liner kit',
    'Stone / Surround Interest': '',
    'Quote Total': '$21067.54',
    'Next Action': 'Follow up on deposit',
    'Notes': 'Quote #74465',
  })
  const draft = buildPipelineDraft(record, { now: new Date('2026-05-07T12:00:00Z') })
  assert.equal(draft.opportunity.status, 'waiting-on-customer')
  assert.equal(draft.opportunity.customerName, 'Pat Example')
  assert.equal(draft.opportunity.nextAction, 'Follow up on deposit')
  assert.match(draft.opportunity.internalNotes, /Helped by Drew/)
  assert.match(draft.opportunity.internalNotes, /Quote #74465/)
  assert.equal(draft.opportunity.sourceType, 'customer-pipeline-csv')
  assert.equal(draft.opportunity.recoverySource, 'true')
})

test('buildPipelineDraft flags duplicate when same phone exists', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Alex Sample',
    'Phone': '815-555-0100',
    'Stage': 'Active - Quote Stage',
  })
  const existing = [{
    id: 'quote-existing',
    customerName: 'Alex Sample',
    customerPhone: '815-555-0100',
    customerEmail: '',
    quoteNumber: '',
    quoteDate: '',
  }]
  const draft = buildPipelineDraft(record, { existingOpportunities: existing })
  assert.equal(draft.duplicate.isDuplicate, true)
  assert.equal(draft.duplicate.confidence, 'high')
  assert.equal(draft.action, 'update-existing')
})

test('buildPipelineDraft does not flag distinct customers as duplicates', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Alex Sample',
    'Phone': '815-555-0100',
    'Stage': 'Active - Quote Stage',
  })
  const existing = [{
    id: 'quote-other',
    customerName: 'Different Person',
    customerPhone: '312-555-9999',
    customerEmail: 'other@example.com',
    quoteNumber: '',
    quoteDate: '',
  }]
  const draft = buildPipelineDraft(record, { existingOpportunities: existing })
  assert.equal(draft.duplicate.isDuplicate, false)
})

test('createOpportunityDraftsFromPipelineCsv returns BulkOpportunityIntake-shaped payload', () => {
  const result = createOpportunityDraftsFromPipelineCsv(SAMPLE_CSV, {
    now: new Date('2026-05-07T12:00:00Z'),
  })
  assert.equal(result.error, undefined)
  assert.equal(result.drafts.length, 3)
  assert.ok(result.summary)
  assert.equal(typeof result.summary.draftCount, 'number')
  assert.equal(result.summary.draftCount, 3)
  assert.equal(result.importedPacketCount, 1)
  const stages = result.drafts.map((d) => d.opportunity.status)
  assert.ok(stages.includes('needs-review'))
  assert.ok(stages.includes('waiting-on-customer'))
  assert.ok(stages.includes('reference-only'))
})

test('column-shift heuristic recovers misplaced quote total and warns', () => {
  const record = normalizePipelineRow({
    'Date Visited': '4/27/26',
    'Customer Name': 'Anna Test',
    'Phone': '312-555-0199',
    'Stage': 'Active - Quote Sent',
    'Quote Total': '',
    'Next Action': '$21067.54',
    'Notes': 'Quote #74465',
  })
  assert.equal(record.quoteTotal, '$21067.54')
  assert.equal(record.nextAction, '')
  assert.ok(record.warnings.some((w) => /column shift/i.test(w)))
})

test('warns when contact info is missing but does not drop row', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Teresa No-Phone',
    'Phone': '',
    'Email': '',
    'Stage': 'Dead / Needs Revival',
  })
  assert.ok(record)
  assert.ok(record.warnings.some((w) => /no phone or email/i.test(w)))
})

test('warns when quote total missing without dropping row', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Doug Sample',
    'Phone': '815-555-0100',
    'Stage': 'Active - Quote Stage',
    'Quote Total': '',
  })
  assert.ok(record.warnings.some((w) => /no quote total/i.test(w)))
})

test('row warnings flow into draft.opportunity.warnings and rowWarnings', () => {
  const record = normalizePipelineRow({
    'Customer Name': 'Anna Test',
    'Phone': '312-555-0199',
    'Stage': 'Active - Quote Sent',
    'Quote Total': '',
    'Next Action': '$21067.54',
  })
  const draft = buildPipelineDraft(record)
  assert.ok(draft.rowWarnings.length >= 1)
  assert.ok(draft.opportunity.warnings.some((w) => /column shift/i.test(w)))
})

test('createOpportunityDraftsFromPipelineCsv reports rowsRead and rowsWithWarnings', () => {
  const result = createOpportunityDraftsFromPipelineCsv(SAMPLE_CSV, {
    now: new Date('2026-05-07T12:00:00Z'),
  })
  assert.equal(result.summary.rowsRead, 3)
  assert.equal(typeof result.summary.rowsWithWarnings, 'number')
  assert.ok(result.summary.rowsWithWarnings >= 1)
})

test('buildImportSummary produces friendly multi-clause string', () => {
  const result = createOpportunityDraftsFromPipelineCsv(SAMPLE_CSV, {
    now: new Date('2026-05-07T12:00:00Z'),
  })
  const summary = buildImportSummary(result, 'Customer Pipeline.csv')
  assert.match(summary, /Customer Pipeline.csv/)
  assert.match(summary, /3 rows read/)
  assert.match(summary, /3 drafts ready/)
})

test('buildImportSummary handles empty CSV and parser errors gracefully', () => {
  const empty = createOpportunityDraftsFromPipelineCsv('Customer Name\n', {})
  assert.match(buildImportSummary(empty, 'empty.csv'), /No rows found/)
  const bad = createOpportunityDraftsFromPipelineCsv('Foo,Bar\n1,2\n', {})
  assert.match(buildImportSummary(bad, 'bad.csv'), /Couldn't parse CSV/)
})

test('weird whitespace in headers and cells is tolerated', () => {
  const text = `  Date Visited , Customer Name , Phone , Email , Source , Stage , Who Helped , Fireplace / Product Interest , Stone / Surround Interest , Quote Total , Next Action , Notes \n5/6/26, Spaced Name ,815-555-0100,,,Active - Quote Stage,,,,,,note\n`
  const result = parseCustomerPipelineCsv(text)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].customerName, 'Spaced Name')
  assert.equal(result.records[0].customerPhone, '815-555-0100')
})
