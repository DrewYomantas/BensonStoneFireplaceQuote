// Sales OS durable storage wrapper.
// IndexedDB in the browser; an in-memory engine is exported for tests and as a fallback.
// All public methods return { ok: true, data } | { ok: false, error: { message } }
// so callers (UI, save-state hook, migration) can render a graceful error label
// without try/catch at every call site.

import {
  DB_NAME,
  SCHEMA_VERSION,
  STORE_LIST,
  STORE_NAMES,
  keyPathFor,
  stampRecord,
} from './salesOsStorageSchema.js'

function recordKey(store, record) {
  return store === STORE_NAMES.appMeta ? record.key : record.id
}

export function createMemoryEngine(initial = {}) {
  const data = {}
  for (const store of STORE_LIST) {
    data[store] = new Map()
    const seed = initial[store] || []
    for (const row of seed) data[store].set(recordKey(store, row), row)
  }
  return {
    name: 'memory',
    async open() {},
    async getAll(store) { return [...data[store].values()] },
    async getById(store, id) { return data[store].has(id) ? data[store].get(id) : null },
    async put(store, record) {
      data[store].set(recordKey(store, record), record)
      return record
    },
    async delete(store, id) { data[store].delete(id); return true },
    async clear(store) { data[store].clear() },
  }
}

export function createIndexedDbEngine({ idbFactory } = {}) {
  let dbPromise = null
  function getFactory() {
    if (idbFactory) return idbFactory
    if (typeof globalThis !== 'undefined' && globalThis.indexedDB) return globalThis.indexedDB
    return null
  }
  function getDb() {
    if (dbPromise) return dbPromise
    const factory = getFactory()
    if (!factory) return Promise.reject(new Error('IndexedDB unavailable'))
    dbPromise = new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, SCHEMA_VERSION)
      req.onupgradeneeded = (event) => {
        const db = event.target.result
        for (const store of STORE_LIST) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: keyPathFor(store) })
          }
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
      req.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'))
    })
    return dbPromise
  }
  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  async function withStore(store, mode, fn) {
    const db = await getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      let result
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
      Promise.resolve(fn(tx.objectStore(store), reqToPromise))
        .then((value) => { result = value })
        .catch(reject)
    })
  }
  return {
    name: 'indexeddb',
    async open() { await getDb() },
    getAll(store) { return withStore(store, 'readonly', (s, p) => p(s.getAll())) },
    async getById(store, id) {
      const value = await withStore(store, 'readonly', (s, p) => p(s.get(id)))
      return value === undefined ? null : value
    },
    async put(store, record) { await withStore(store, 'readwrite', (s, p) => p(s.put(record))); return record },
    async delete(store, id) { await withStore(store, 'readwrite', (s, p) => p(s.delete(id))); return true },
    async clear(store) { await withStore(store, 'readwrite', (s, p) => p(s.clear())) },
  }
}

export function createSalesOsStorage({ engine } = {}) {
  if (!engine) throw new Error('createSalesOsStorage: engine required')
  let available = true
  let lastError = null

  async function safe(fn) {
    try {
      const data = await fn()
      return { ok: true, data }
    } catch (error) {
      available = false
      lastError = error
      const message = (error && error.message) ? error.message : String(error)
      return { ok: false, error: { message } }
    }
  }

  function assertRecordStore(store) {
    if (!STORE_LIST.includes(store)) throw new Error(`Unknown store: ${store}`)
    if (store === STORE_NAMES.appMeta) throw new Error('Use getMeta/setMeta for appMeta')
  }

  return {
    engine,
    isAvailable: () => available,
    getLastError: () => lastError,
    open: () => safe(() => engine.open()),
    getAll: (store) => {
      if (!STORE_LIST.includes(store)) throw new Error(`Unknown store: ${store}`)
      return safe(() => engine.getAll(store))
    },
    getById: (store, id) => {
      if (!STORE_LIST.includes(store)) throw new Error(`Unknown store: ${store}`)
      return safe(() => engine.getById(store, id))
    },
    putRecord: (store, record, now = new Date()) => {
      assertRecordStore(store)
      if (!record || typeof record !== 'object') throw new Error('putRecord: record must be an object')
      if (!record.id) throw new Error('putRecord: record.id required')
      return safe(() => engine.put(store, stampRecord(record, now)))
    },
    deleteRecord: (store, id) => {
      assertRecordStore(store)
      return safe(() => engine.delete(store, id))
    },
    clearStore: (store) => {
      if (!STORE_LIST.includes(store)) throw new Error(`Unknown store: ${store}`)
      return safe(() => engine.clear(store))
    },
    async getMeta(key) {
      const result = await safe(() => engine.getById(STORE_NAMES.appMeta, key))
      if (!result.ok) return result
      return { ok: true, data: result.data ? result.data.value : null }
    },
    setMeta: (key, value, now = new Date()) =>
      safe(() => engine.put(STORE_NAMES.appMeta, {
        key,
        value,
        updatedAt: new Date(now).toISOString(),
      })),
  }
}
