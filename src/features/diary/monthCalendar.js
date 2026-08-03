export function formatCalendarDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function diaryTimestampToLocalDateKey(createdAt) {
  if (!createdAt) return ''
  const raw = String(createdAt).trim()
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/
  const normalized = sqliteUtc.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10)
  return formatCalendarDate(date.getFullYear(), date.getMonth(), date.getDate())
}

export function shiftCalendarMonth(year, month, delta) {
  const date = new Date(year, month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function getSwipeMonthDelta(startX, startY, endX, endY, threshold = 48) {
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? -1 : 1
}

export function buildMonthGrid(year, month, diariesByDate = new Map()) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []

  for (let offset = firstWeekday - 1; offset >= 0; offset--) {
    days.push(createDay(new Date(year, month, -offset), false, diariesByDate))
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(createDay(new Date(year, month, day), true, diariesByDate))
  }
  for (let day = 1; days.length < 42; day++) {
    days.push(createDay(new Date(year, month + 1, day), false, diariesByDate))
  }

  return days
}

function createDay(date, currentMonth, diariesByDate) {
  const dateStr = formatCalendarDate(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date()
  const todayStr = formatCalendarDate(today.getFullYear(), today.getMonth(), today.getDate())
  return {
    day: date.getDate(),
    dateStr,
    currentMonth,
    diary: diariesByDate.get(dateStr) || null,
    isToday: dateStr === todayStr
  }
}
