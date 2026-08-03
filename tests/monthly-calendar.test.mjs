import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCalendarDate,
  diaryTimestampToLocalDateKey,
  shiftCalendarMonth,
  buildMonthGrid,
  getSwipeMonthDelta
} from '../src/features/diary/monthCalendar.js'

test('builds a Monday-first 42-cell month grid with diary data', () => {
  const diaries = new Map([
    ['2026-08-03', { id: 7, mood: 'happy', weather: 'sunny' }]
  ])
  const days = buildMonthGrid(2026, 7, diaries)
  assert.equal(days.length, 42)
  assert.equal(days[0].dateStr, '2026-07-27')
  assert.equal(days.find(day => day.dateStr === '2026-08-03').diary.id, 7)
})

test('shifts months across year boundaries', () => {
  assert.deepEqual(shiftCalendarMonth(2026, 0, -1), { year: 2025, month: 11 })
  assert.deepEqual(shiftCalendarMonth(2026, 11, 1), { year: 2027, month: 0 })
  assert.equal(formatCalendarDate(2026, 7, 3), '2026-08-03')
})

test('maps SQLite UTC timestamps to the local calendar date', () => {
  const timestamp = '2026-08-02 16:30:00'
  const local = new Date('2026-08-02T16:30:00Z')
  assert.equal(
    diaryTimestampToLocalDateKey(timestamp),
    formatCalendarDate(local.getFullYear(), local.getMonth(), local.getDate())
  )
  assert.equal(diaryTimestampToLocalDateKey(''), '')
})

test('uses the requested swipe directions and ignores short or vertical gestures', () => {
  assert.equal(getSwipeMonthDelta(200, 100, 120, 106), -1)
  assert.equal(getSwipeMonthDelta(120, 100, 200, 104), 1)
  assert.equal(getSwipeMonthDelta(120, 100, 150, 102), 0)
  assert.equal(getSwipeMonthDelta(120, 100, 190, 190), 0)
})
