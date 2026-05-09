import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  QUEUE_STATUS,
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_CLS,
  fileExtFromName,
  createQueueItem,
  updateQueueItem,
  queueItemCountLabel,
  hasUnfinishedItems,
} from './bulkIntakeQueue.js'

describe('fileExtFromName', () => {
  it('returns lowercase extension', () => {
    assert.equal(fileExtFromName('customers.CSV'), 'csv')
  })
  it('returns lowercase for pdf', () => {
    assert.equal(fileExtFromName('Scan.PDF'), 'pdf')
  })
  it('returns empty string for no extension', () => {
    assert.equal(fileExtFromName('noext'), '')
  })
  it('returns empty string for null', () => {
    assert.equal(fileExtFromName(null), '')
  })
  it('handles dotfile', () => {
    assert.equal(fileExtFromName('.gitignore'), 'gitignore')
  })
  it('uses last dot for double-extension', () => {
    assert.equal(fileExtFromName('archive.tar.gz'), 'gz')
  })
})

describe('createQueueItem', () => {
  it('sets status to waiting', () => {
    const item = createQueueItem('test.csv')
    assert.equal(item.status, QUEUE_STATUS.waiting)
  })
  it('sets fileName', () => {
    const item = createQueueItem('my-file.txt')
    assert.equal(item.fileName, 'my-file.txt')
  })
  it('sets fileType from extension', () => {
    const item = createQueueItem('data.CSV')
    assert.equal(item.fileType, 'csv')
  })
  it('sets fileType to unknown when no extension', () => {
    const item = createQueueItem('noext')
    assert.equal(item.fileType, 'unknown')
  })
  it('has empty extractedText', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.extractedText, '')
  })
  it('has empty errorMessage', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.errorMessage, '')
  })
  it('has empty progressLabel', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.progressLabel, '')
  })
  it('has parsedRowCount 0', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.parsedRowCount, 0)
  })
  it('has importedCount 0', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.importedCount, 0)
  })
  it('has phase input', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.phase, 'input')
  })
  it('has empty draftRows array', () => {
    const item = createQueueItem('x.csv')
    assert.deepEqual(item.draftRows, [])
  })
  it('has empty selectedIds array', () => {
    const item = createQueueItem('x.csv')
    assert.deepEqual(item.selectedIds, [])
  })
  it('has null importResult', () => {
    const item = createQueueItem('x.csv')
    assert.equal(item.importResult, null)
  })
  it('generates unique ids', () => {
    const a = createQueueItem('a.csv')
    const b = createQueueItem('b.csv')
    assert.notEqual(a.id, b.id)
  })
  it('id starts with qi-', () => {
    const item = createQueueItem('x.csv')
    assert.ok(item.id.startsWith('qi-'), `id should start with qi- but got: ${item.id}`)
  })
  it('does not store File object, raw bytes, or file path', () => {
    const item = createQueueItem('x.csv')
    const keys = Object.keys(item)
    assert.ok(!keys.includes('file'), 'must not store file object')
    assert.ok(!keys.includes('filePath'), 'must not store file path')
    assert.ok(!keys.includes('bytes'), 'must not store bytes')
    assert.ok(!keys.includes('buffer'), 'must not store buffer')
    assert.ok(!keys.includes('ocrImages'), 'must not store ocr images')
    assert.ok(!keys.includes('canvas'), 'must not store canvas')
  })
  it('handles null fileName gracefully', () => {
    const item = createQueueItem(null)
    assert.equal(item.fileName, '')
    assert.equal(item.fileType, 'unknown')
  })
})

describe('updateQueueItem', () => {
  it('returns a new array', () => {
    const queue = [createQueueItem('a.csv')]
    const result = updateQueueItem(queue, queue[0].id, { status: QUEUE_STATUS.extracting })
    assert.notEqual(result, queue)
  })
  it('does not mutate the original array', () => {
    const item = createQueueItem('a.csv')
    const queue = [item]
    updateQueueItem(queue, item.id, { status: QUEUE_STATUS.extracting })
    assert.equal(queue[0].status, QUEUE_STATUS.waiting)
  })
  it('merges updates onto the target item', () => {
    const item = createQueueItem('a.csv')
    const queue = [item]
    const result = updateQueueItem(queue, item.id, { status: QUEUE_STATUS.extracting, progressLabel: 'Reading…' })
    assert.equal(result[0].status, QUEUE_STATUS.extracting)
    assert.equal(result[0].progressLabel, 'Reading…')
  })
  it('leaves other items unchanged', () => {
    const a = createQueueItem('a.csv')
    const b = createQueueItem('b.csv')
    const queue = [a, b]
    const result = updateQueueItem(queue, a.id, { status: QUEUE_STATUS.error })
    assert.equal(result[1].status, QUEUE_STATUS.waiting)
    assert.equal(result[1].id, b.id)
  })
  it('returns same array length', () => {
    const queue = [createQueueItem('a.csv'), createQueueItem('b.csv')]
    const result = updateQueueItem(queue, queue[0].id, {})
    assert.equal(result.length, 2)
  })
  it('does not mutate the matched item', () => {
    const item = createQueueItem('a.csv')
    const queue = [item]
    const result = updateQueueItem(queue, item.id, { status: QUEUE_STATUS.error })
    assert.equal(item.status, QUEUE_STATUS.waiting)
    assert.equal(result[0].status, QUEUE_STATUS.error)
  })
})

describe('queueItemCountLabel', () => {
  it('returns empty string for null', () => {
    assert.equal(queueItemCountLabel(null), '')
  })
  it('returns empty string when both counts are 0', () => {
    const item = createQueueItem('x.csv')
    assert.equal(queueItemCountLabel(item), '')
  })
  it('returns imported count when importedCount > 0', () => {
    const item = { ...createQueueItem('x.csv'), importedCount: 5 }
    assert.equal(queueItemCountLabel(item), '5 imported')
  })
  it('importedCount takes priority over parsedRowCount', () => {
    const item = { ...createQueueItem('x.csv'), importedCount: 3, parsedRowCount: 10 }
    assert.equal(queueItemCountLabel(item), '3 imported')
  })
  it('returns singular row label for 1 row', () => {
    const item = { ...createQueueItem('x.csv'), parsedRowCount: 1 }
    assert.equal(queueItemCountLabel(item), '1 row')
  })
  it('returns plural rows label for multiple rows', () => {
    const item = { ...createQueueItem('x.csv'), parsedRowCount: 7 }
    assert.equal(queueItemCountLabel(item), '7 rows')
  })
})

describe('hasUnfinishedItems', () => {
  it('returns false for empty array', () => {
    assert.equal(hasUnfinishedItems([]), false)
  })
  it('returns false for non-array', () => {
    assert.equal(hasUnfinishedItems(null), false)
  })
  it('returns false when all items are imported', () => {
    const item = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.imported }
    assert.equal(hasUnfinishedItems([item]), false)
  })
  it('returns false when all items are error', () => {
    const item = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.error }
    assert.equal(hasUnfinishedItems([item]), false)
  })
  it('returns false when mix of imported and error', () => {
    const a = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.imported }
    const b = { ...createQueueItem('b.csv'), status: QUEUE_STATUS.error }
    assert.equal(hasUnfinishedItems([a, b]), false)
  })
  it('returns true when any item is waiting', () => {
    const a = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.imported }
    const b = createQueueItem('b.csv')
    assert.equal(hasUnfinishedItems([a, b]), true)
  })
  it('returns true when any item is extracting', () => {
    const item = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.extracting }
    assert.equal(hasUnfinishedItems([item]), true)
  })
  it('returns true when any item is ready-to-parse', () => {
    const item = { ...createQueueItem('a.csv'), status: QUEUE_STATUS.readyToParse }
    assert.equal(hasUnfinishedItems([item]), true)
  })
})

describe('QUEUE_STATUS_LABELS completeness', () => {
  it('has a label for every status value', () => {
    for (const val of Object.values(QUEUE_STATUS)) {
      assert.ok(
        val in QUEUE_STATUS_LABELS,
        `QUEUE_STATUS_LABELS is missing entry for '${val}'`,
      )
    }
  })
})

describe('QUEUE_STATUS_CLS completeness', () => {
  it('has a CSS class for every status value', () => {
    for (const val of Object.values(QUEUE_STATUS)) {
      assert.ok(
        val in QUEUE_STATUS_CLS,
        `QUEUE_STATUS_CLS is missing entry for '${val}'`,
      )
    }
  })
})
