export const READING_MODES = Object.freeze({
  SCROLL: 'scroll',
  PAGE: 'page'
})

export const READER_MODE_STORAGE_KEY = 'reader_mode'

export function normalizeReadingMode(value) {
  return value === READING_MODES.PAGE ? READING_MODES.PAGE : READING_MODES.SCROLL
}

export function loadReadingMode(storage = globalThis.localStorage) {
  try {
    return normalizeReadingMode(storage?.getItem(READER_MODE_STORAGE_KEY))
  } catch (_) {
    return READING_MODES.SCROLL
  }
}

export function saveReadingMode(mode, storage = globalThis.localStorage) {
  const normalized = normalizeReadingMode(mode)
  try {
    storage?.setItem(READER_MODE_STORAGE_KEY, normalized)
  } catch (_) {
    // 当前会话仍保留响应式状态，存储失败不阻断阅读。
  }
  return normalized
}

export function clampPage(page, pageCount) {
  const count = Math.max(1, Math.trunc(Number(pageCount)) || 1)
  const value = Math.trunc(Number(page)) || 0
  return Math.min(count - 1, Math.max(0, value))
}

export function getPageTurn(currentPage, pageCount, direction) {
  const page = clampPage(currentPage, pageCount)
  const count = Math.max(1, Math.trunc(Number(pageCount)) || 1)
  if (direction < 0 && page === 0) return { page, boundary: 'prev' }
  if (direction > 0 && page === count - 1) return { page, boundary: 'next' }
  return { page: clampPage(page + Math.sign(direction), count), boundary: null }
}

export function pageProgress(page, pageCount) {
  const count = Math.max(1, Math.trunc(Number(pageCount)) || 1)
  if (count === 1) return 100
  return (clampPage(page, count) / (count - 1)) * 100
}

export function pageAtProgress(progress, pageCount) {
  const count = Math.max(1, Math.trunc(Number(pageCount)) || 1)
  const ratio = Math.min(100, Math.max(0, Number(progress) || 0)) / 100
  return clampPage(Math.round(ratio * (count - 1)), count)
}
