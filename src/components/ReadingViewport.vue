<template>
  <div
    ref="viewport"
    class="reading-viewport"
    :class="`reading-viewport--${normalizedMode}`"
    :tabindex="normalizedMode === READING_MODES.PAGE ? 0 : undefined"
    @scroll.passive="handleScroll"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    <div ref="content" class="reading-viewport__content">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  READING_MODES,
  normalizeReadingMode,
  getPageTurn,
  pageProgress,
  pageAtProgress
} from '@/features/reader/readingMode'

const props = defineProps({
  mode: { type: String, default: READING_MODES.SCROLL },
  contentKey: { type: [String, Number], default: '' },
  repaginateKey: { type: [String, Number], default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['progress-change', 'boundary-prev', 'boundary-next'])
const normalizedMode = computed(() => normalizeReadingMode(props.mode))
const viewport = ref(null)
const content = ref(null)
const currentPage = ref(0)
const pageCount = ref(1)
const lastProgress = ref(0)
let resizeObserver = null
let frame = 0

function isInteractiveTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    'button, a, input, textarea, select, label, [role="button"], [data-no-page-turn]'
  ))
}

function publishProgress(value) {
  lastProgress.value = Math.min(100, Math.max(0, Number(value) || 0))
  emit('progress-change', lastProgress.value)
}

function syncPagePosition() {
  if (!viewport.value) return
  viewport.value.scrollLeft = currentPage.value * viewport.value.clientWidth
  publishProgress(pageProgress(currentPage.value, pageCount.value))
}

function measurePages(preserveProgress = true) {
  const viewportEl = viewport.value
  const contentEl = content.value
  if (!viewportEl || !contentEl || normalizedMode.value !== READING_MODES.PAGE) return
  const width = viewportEl.clientWidth
  const height = viewportEl.clientHeight
  if (width <= 0 || height <= 0) return

  const progress = preserveProgress ? lastProgress.value : 0
  viewportEl.style.setProperty('--reader-page-width', `${width}px`)

  requestAnimationFrame(() => {
    const measured = Math.max(1, Math.ceil(contentEl.scrollWidth / width))
    pageCount.value = Number.isFinite(measured) ? measured : 1
    currentPage.value = pageAtProgress(progress, pageCount.value)
    syncPagePosition()
  })
}

function scheduleMeasure(preserveProgress = true) {
  cancelAnimationFrame(frame)
  nextTick(() => {
    frame = requestAnimationFrame(() => measurePages(preserveProgress))
  })
}

function updateScrollProgress() {
  const el = viewport.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  publishProgress(max <= 0 ? 100 : (el.scrollTop / max) * 100)
}

function handleScroll() {
  if (normalizedMode.value === READING_MODES.SCROLL) updateScrollProgress()
}

function turnPage(direction) {
  if (props.disabled || normalizedMode.value !== READING_MODES.PAGE) return
  const result = getPageTurn(currentPage.value, pageCount.value, direction)
  if (result.boundary === 'prev') return emit('boundary-prev')
  if (result.boundary === 'next') return emit('boundary-next')
  currentPage.value = result.page
  syncPagePosition()
}

function handleClick(event) {
  if (props.disabled || normalizedMode.value !== READING_MODES.PAGE || isInteractiveTarget(event.target)) return
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  turnPage(event.clientX < rect.left + rect.width / 2 ? -1 : 1)
}

function handleKeydown(event) {
  if (props.disabled || isInteractiveTarget(event.target)) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    turnPage(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    turnPage(1)
  }
}

function resetToStart() {
  currentPage.value = 0
  pageCount.value = 1
  if (viewport.value) {
    viewport.value.scrollTop = 0
    viewport.value.scrollLeft = 0
  }
  scheduleMeasure(false)
  publishProgress(0)
}

function repaginate() {
  scheduleMeasure(true)
}

watch(normalizedMode, async (nextMode, previousMode) => {
  await nextTick()
  if (!viewport.value) return
  if (nextMode === READING_MODES.PAGE) {
    scheduleMeasure(true)
  } else if (previousMode === READING_MODES.PAGE) {
    const max = viewport.value.scrollHeight - viewport.value.clientHeight
    viewport.value.scrollTop = max > 0 ? (lastProgress.value / 100) * max : 0
    updateScrollProgress()
  }
})

watch(() => props.contentKey, resetToStart)
watch(() => props.repaginateKey, repaginate)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => scheduleMeasure(true))
    if (viewport.value) resizeObserver.observe(viewport.value)
    if (content.value) resizeObserver.observe(content.value)
  } else {
    window.addEventListener('resize', repaginate)
  }
  if (normalizedMode.value === READING_MODES.PAGE) scheduleMeasure(false)
  else updateScrollProgress()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', repaginate)
})

defineExpose({ resetToStart, repaginate })
</script>

<style scoped>
.reading-viewport {
  --reader-page-inline: var(--spacing-md);
  --reader-page-block: var(--spacing-lg);
  --reader-page-width: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--reader-page-block) var(--reader-page-inline);
  -webkit-overflow-scrolling: touch;
}

.reading-viewport--scroll {
  overflow-x: hidden;
  overflow-y: auto;
}

.reading-viewport--page {
  overflow: hidden;
  cursor: pointer;
  outline: none;
}

.reading-viewport__content {
  min-height: 100%;
}

.reading-viewport--page .reading-viewport__content {
  height: 100%;
  column-width: calc(var(--reader-page-width) - 2 * var(--reader-page-inline));
  column-gap: calc(2 * var(--reader-page-inline));
  column-fill: auto;
}
</style>
