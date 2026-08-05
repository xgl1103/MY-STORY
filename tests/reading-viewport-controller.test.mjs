import test from 'node:test'
import assert from 'node:assert/strict'
import { READING_MODES } from '../src/features/reader/readingMode.js'
import {
  calculatePageCount,
  createLatestFrameScheduler,
  pageTurnDirectionForClick,
  pageTurnDirectionForKey,
  restorePageAtProgress
} from '../src/features/reader/readingViewportController.js'

test('latest scheduled measurement wins and stale callbacks cannot write after disposal', () => {
  const frames = []
  const cancelled = []
  const writes = []
  let nextId = 0
  let active = true
  const scheduler = createLatestFrameScheduler({
    requestFrame: callback => {
      const frame = { id: ++nextId, callback }
      frames.push(frame)
      return frame.id
    },
    cancelFrame: id => cancelled.push(id),
    isActive: () => active
  })

  scheduler.schedule(() => writes.push('first'))
  scheduler.schedule(() => writes.push('latest'))
  frames[0].callback()
  frames[1].callback()

  scheduler.schedule(() => writes.push('disposed'))
  scheduler.dispose()
  frames[2].callback()

  active = false
  scheduler.schedule(() => writes.push('inactive'))

  assert.deepEqual(writes, ['latest'])
  assert.deepEqual(cancelled, [1, 3])
})

test('calculates page counts safely and restores a page from progress', () => {
  assert.equal(calculatePageCount(250, 100), 3)
  assert.equal(calculatePageCount(0, 100), 1)
  assert.equal(calculatePageCount(100, 0), 1)
  assert.equal(calculatePageCount(Number.NaN, 100), 1)
  assert.equal(calculatePageCount(100, Number.POSITIVE_INFINITY), 1)
  assert.deepEqual(restorePageAtProgress(50, 400, 100), {
    pageCount: 4,
    page: 2
  })
})

test('page controls gate disabled and scroll modes and choose click halves', () => {
  assert.equal(pageTurnDirectionForKey({ mode: READING_MODES.SCROLL, disabled: false, key: 'ArrowRight' }), 0)
  assert.equal(pageTurnDirectionForKey({ mode: READING_MODES.PAGE, disabled: true, key: 'ArrowRight' }), 0)
  assert.equal(pageTurnDirectionForKey({ mode: READING_MODES.PAGE, disabled: false, key: 'ArrowLeft' }), -1)
  assert.equal(pageTurnDirectionForKey({ mode: READING_MODES.PAGE, disabled: false, key: 'ArrowRight' }), 1)
  assert.equal(pageTurnDirectionForClick({ mode: READING_MODES.PAGE, disabled: false, clientX: 149, left: 100, width: 100 }), -1)
  assert.equal(pageTurnDirectionForClick({ mode: READING_MODES.PAGE, disabled: false, clientX: 150, left: 100, width: 100 }), 1)
  assert.equal(pageTurnDirectionForClick({ mode: READING_MODES.SCROLL, disabled: false, clientX: 149, left: 100, width: 100 }), 0)
})
