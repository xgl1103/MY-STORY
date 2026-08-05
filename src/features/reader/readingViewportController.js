import { READING_MODES, pageAtProgress } from './readingMode.js'

export function calculatePageCount(scrollWidth, clientWidth) {
  const width = Number(clientWidth)
  const contentWidth = Number(scrollWidth)
  if (!Number.isFinite(width) || !Number.isFinite(contentWidth) || width <= 0 || contentWidth <= 0) {
    return 1
  }
  return Math.max(1, Math.ceil(contentWidth / width))
}

export function restorePageAtProgress(progress, scrollWidth, clientWidth) {
  const pageCount = calculatePageCount(scrollWidth, clientWidth)
  return { pageCount, page: pageAtProgress(progress, pageCount) }
}

export function isPageTurnEnabled(mode, disabled) {
  return !disabled && mode === READING_MODES.PAGE
}

export function pageTurnDirectionForClick({ mode, disabled, clientX, left, width }) {
  if (!isPageTurnEnabled(mode, disabled) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return 0
  }
  return clientX < left + width / 2 ? -1 : 1
}

export function pageTurnDirectionForKey({ mode, disabled, key }) {
  if (!isPageTurnEnabled(mode, disabled)) return 0
  if (key === 'ArrowLeft') return -1
  if (key === 'ArrowRight') return 1
  return 0
}

export function createLatestFrameScheduler({
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  isActive = () => true
} = {}) {
  let pending = null
  let generation = 0
  let disposed = false

  function cancel() {
    generation += 1
    if (pending !== null) {
      cancelFrame?.(pending.handle)
      pending = null
    }
  }

  function schedule(callback) {
    cancel()
    if (disposed || !isActive() || typeof requestFrame !== 'function') return

    const token = generation
    const handle = requestFrame(() => {
      if (pending?.token !== token) return
      pending = null
      if (disposed || generation !== token || !isActive()) return
      callback()
    })
    pending = { token, handle }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    cancel()
  }

  return { schedule, cancel, dispose }
}
