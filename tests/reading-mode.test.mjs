import test from 'node:test'
import assert from 'node:assert/strict'
import {
  READING_MODES,
  READER_MODE_STORAGE_KEY,
  normalizeReadingMode,
  loadReadingMode,
  saveReadingMode,
  clampPage,
  getPageTurn,
  pageProgress,
  pageAtProgress
} from '../src/features/reader/readingMode.js'

test('normalizes reading mode and defaults to scrolling', () => {
  assert.equal(normalizeReadingMode('scroll'), READING_MODES.SCROLL)
  assert.equal(normalizeReadingMode('page'), READING_MODES.PAGE)
  assert.equal(normalizeReadingMode('invalid'), READING_MODES.SCROLL)
  assert.equal(normalizeReadingMode(undefined), READING_MODES.SCROLL)
})

test('loads and saves one shared reading mode with storage failures tolerated', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }

  assert.equal(loadReadingMode(storage), READING_MODES.SCROLL)
  assert.equal(saveReadingMode('page', storage), READING_MODES.PAGE)
  assert.equal(values.get(READER_MODE_STORAGE_KEY), READING_MODES.PAGE)
  assert.equal(loadReadingMode(storage), READING_MODES.PAGE)

  const failingStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') }
  }
  assert.equal(loadReadingMode(failingStorage), READING_MODES.SCROLL)
  assert.equal(saveReadingMode('page', failingStorage), READING_MODES.PAGE)
})

test('clamps pages and reports page or chapter-boundary turns', () => {
  assert.equal(clampPage(-2, 4), 0)
  assert.equal(clampPage(8, 4), 3)
  assert.deepEqual(getPageTurn(1, 4, -1), { page: 0, boundary: null })
  assert.deepEqual(getPageTurn(1, 4, 1), { page: 2, boundary: null })
  assert.deepEqual(getPageTurn(0, 4, -1), { page: 0, boundary: 'prev' })
  assert.deepEqual(getPageTurn(3, 4, 1), { page: 3, boundary: 'next' })
})

test('converts between page index and reading progress', () => {
  assert.equal(pageProgress(0, 1), 100)
  assert.equal(pageProgress(0, 5), 0)
  assert.equal(pageProgress(2, 5), 50)
  assert.equal(pageProgress(4, 5), 100)
  assert.equal(pageAtProgress(50, 9), 4)
  assert.equal(pageAtProgress(100, 3), 2)
  assert.equal(pageAtProgress(-20, 3), 0)
})
