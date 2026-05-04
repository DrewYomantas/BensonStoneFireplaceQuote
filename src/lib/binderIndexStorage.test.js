import test from 'node:test'
import assert from 'node:assert/strict'
import { clearBinderPageIndex, loadBinderPageIndex, mergeBinderPageIndex, saveBinderPageIndex } from './binderIndexStorage.js'
function makeStorage() { const map = new Map(); return { getItem(key) { return map.has(key) ? map.get(key) : null }, setItem(key, value) { map.set(key, String(value)) }, removeItem(key) { map.delete(key) } } }
test('save/load binder page index records', () => { const storage = makeStorage(); saveBinderPageIndex([{ id: 'a', text: '864 manual', pageNumber: 1, title: 'Manual' }], storage); const loaded = loadBinderPageIndex(storage); assert.equal(loaded.length, 1); assert.equal(loaded[0].title, 'Manual') })
test('mergeBinderPageIndex replaces duplicate page records', () => { const storage = makeStorage(); const merged = mergeBinderPageIndex([{ id: 'a', text: 'old text', pageNumber: 1 }], [{ id: 'a', text: 'new text', pageNumber: 1 }, { id: 'b', text: 'second', pageNumber: 2 }], storage); assert.equal(merged.length, 2); assert.equal(loadBinderPageIndex(storage).find((record) => record.id === 'a').text, 'new text') })
test('clearBinderPageIndex removes stored index', () => { const storage = makeStorage(); saveBinderPageIndex([{ id: 'a', text: 'old text' }], storage); clearBinderPageIndex(storage); assert.deepEqual(loadBinderPageIndex(storage), []) })
