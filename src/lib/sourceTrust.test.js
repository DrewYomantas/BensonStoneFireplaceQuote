import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SOURCE_KINDS, normalizeSourceKind, sourceClassName, sourceLabel } from './sourceTrust.js'

describe('sourceTrust', () => {
  it('exports the six required source kinds', () => {
    for (const k of ['verified', 'said', 'assumed', 'bistrack', 'ocr', 'manual']) {
      assert.ok(SOURCE_KINDS.includes(k), `missing ${k}`)
    }
  })

  it('normalizeSourceKind falls back to manual for unknown values', () => {
    assert.equal(normalizeSourceKind('mystery'), 'manual')
    assert.equal(normalizeSourceKind(null), 'manual')
    assert.equal(normalizeSourceKind('VERIFIED'), 'verified')
  })

  it('sourceClassName returns the expected pattern', () => {
    assert.equal(sourceClassName('verified'), 'source source-verified')
    assert.equal(sourceClassName('bistrack'), 'source source-bistrack')
    assert.equal(sourceClassName('unknown'), 'source source-manual')
  })

  it('sourceLabel uppercases by default and accepts overrides', () => {
    assert.equal(sourceLabel('verified'), 'VERIFIED')
    assert.equal(sourceLabel('bistrack'), 'BISTRACK')
    assert.equal(sourceLabel('manual', 'BT-44217'), 'BT-44217')
  })
})
