import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveTodayWorkbench,
  findPossibleDuplicates,
  filterWorkbenchRecords,
  isActiveCustomerFile,
  isActiveOpportunity,
  isArchivedCustomerFile,
  isArchivedOpportunity,
  summarizeWorkbenchRecords,
} from './fileOrganizer.js'

test('detects archived records', () => {
  assert.equal(isArchivedOpportunity({ status: 'archived' }), true)
  assert.equal(isArchivedOpportunity({ status: 'needs-review' }), false)
  assert.equal(isArchivedCustomerFile({ archivedAt: '2026-05-04T00:00:00.000Z' }), true)
  assert.equal(isArchivedCustomerFile({ archivedAt: '' }), false)
  assert.equal(isActiveOpportunity({ status: 'needs-review' }), true)
  assert.equal(isActiveCustomerFile({ archivedAt: '' }), true)
})

test('summarizes active and archived workbench records', () => {
  const summary = summarizeWorkbenchRecords({
    opportunities: [
      { status: 'ready-for-proposal' },
      { status: 'archived' },
      { status: 'follow-up-needed' },
    ],
    customerFiles: [{}, { archivedAt: '2026-05-04T00:00:00.000Z' }],
  })
  assert.equal(summary.active, 3)
  assert.equal(summary.archived, 2)
  assert.equal(summary.ready, 1)
  assert.equal(summary.followUp, 1)
})

test('filters active, archive, quote, visit, and search records', () => {
  const records = {
    opportunities: [
      { id: 'q1', customerName: 'Carroll Freeman', quoteNumber: '74600', status: 'needs-review' },
      { id: 'q2', customerName: 'Old Quote', status: 'archived' },
    ],
    customerFiles: [
      { id: 'v1', customerName: 'Drew Yomantas', customerGoal: 'Replace insert', archivedAt: '' },
      { id: 'v2', customerName: 'Old Visit', archivedAt: '2026-05-04T00:00:00.000Z' },
    ],
  }

  assert.deepEqual(filterWorkbenchRecords(records, { view: 'active' }).opportunities.map((r) => r.id), ['q1'])
  assert.deepEqual(filterWorkbenchRecords(records, { view: 'archive' }).customerFiles.map((r) => r.id), ['v2'])
  assert.deepEqual(filterWorkbenchRecords(records, { view: 'quotes' }).customerFiles, [])
  assert.deepEqual(filterWorkbenchRecords(records, { view: 'visits' }).opportunities, [])
  assert.deepEqual(filterWorkbenchRecords(records, { view: 'active', query: '74600' }).opportunities.map((r) => r.id), ['q1'])
})

test("builds Today's Work buckets without archived clutter", () => {
  const today = deriveTodayWorkbench({
    opportunities: [
      { id: 'q1', customerName: 'Ready Quote', status: 'ready-for-proposal', updatedAt: '2026-05-04T10:00:00.000Z' },
      { id: 'q2', customerName: 'Needs Review', status: 'needs-review', updatedAt: '2026-05-04T11:00:00.000Z' },
      { id: 'q3', customerName: 'Archived Quote', status: 'archived', updatedAt: '2026-05-04T12:00:00.000Z' },
    ],
    customerFiles: [
      { id: 'cf1', customerName: 'Visit File', archivedAt: '', updatedAt: '2026-05-04T09:00:00.000Z' },
      { id: 'cf2', customerName: 'Follow Up File', archivedAt: '', packetSentAt: '2026-05-04T08:00:00.000Z', updatedAt: '2026-05-04T08:00:00.000Z' },
      { id: 'cf3', customerName: 'Archived Visit', archivedAt: '2026-05-04T07:00:00.000Z', updatedAt: '2026-05-04T07:00:00.000Z' },
    ],
  })

  assert.deepEqual(today.importsNeedingReview.map((item) => item.id), ['q2'])
  assert.equal(today.activeCustomerWork.some((file) => file.id === 'cf3'), false)
  assert.equal(today.followUpItems.some((item) => item.id === 'cf2'), true)
  assert.equal(today.readyItems.some((item) => item.id === 'q1'), true)
})

test('finds possible duplicate quote and visit records', () => {
  const duplicates = findPossibleDuplicates({
    opportunities: [
      { id: 'q1', quoteNumber: '1001', customerName: 'Anna', quoteDate: '2026-05-01', originalQuoteAmount: '$1200' },
      { id: 'q2', quoteNumber: '1001', customerName: 'Anna', quoteDate: '2026-05-01', originalQuoteAmount: '$1200' },
    ],
    customerFiles: [
      { id: 'cf1', customerName: 'Anna', customerPhone: '555-1111', archivedAt: '' },
      { id: 'cf2', customerName: 'Anna', customerPhone: '555-1111', archivedAt: '' },
    ],
  })

  assert.equal(duplicates.length >= 2, true)
  assert.equal(duplicates.some((group) => group.items.some((item) => item.record.id === 'q1')), true)
  assert.equal(duplicates.some((group) => group.items.some((item) => item.record.id === 'cf1')), true)
})
