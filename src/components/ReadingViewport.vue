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
  pageProgress
} from '@/features/reader/readingMode'
import {
  createLatestFrameScheduler,
  isPageTurnEnabled,
  pageTurnDirectionForClick,
  pageTurnDirectionForKey,
  restorePageAtProgress
} from '@/features/reader/readingViewportController'
import { isOutsidePanelDismissClick } from '@/features/reader/outsidePanelController'

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
let isMounted = false
const measurementScheduler = createLatestFrameScheduler({
  isActive: () => isMounted && normalizedMode.value === READING_MODES.PAGE
})

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
  if (!isMounted || !viewportEl || !contentEl || normalizedMode.value !== READING_MODES.PAGE) return
  const width = viewportEl.clientWidth
  const height = viewportEl.clientHeight
  if (width <= 0 || height <= 0) return

  const progress = preserveProgress ? lastProgress.value : 0
  viewportEl.style.setProperty('--reader-page-width', `${width}px`)
  const restored = restorePageAtProgress(progress, contentEl.scrollWidth, width)
  pageCount.value = restored.pageCount
  currentPage.value = restored.page
  syncPagePosition()
}

function scheduleMeasure(preserveProgress = true) {
  nextTick(() => {
    measurementScheduler.schedule(() => measurePages(preserveProgress))
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
  if (!isPageTurnEnabled(normalizedMode.value, props.disabled)) return
  const result = getPageTurn(currentPage.value, pageCount.value, direction)
  if (result.boundary === 'prev') return emit('boundary-prev')
  if (result.boundary === 'next') return emit('boundary-next')
  currentPage.value = result.page
  syncPagePosition()
}

function handleClick(event) {
  if (isOutsidePanelDismissClick(event)) return
  if (props.disabled || normalizedMode.value !== READING_MODES.PAGE || isInteractiveTarget(event.target)) return
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  const direction = pageTurnDirectionForClick({
    mode: normalizedMode.value,
    disabled: props.disabled,
    clientX: event.clientX,
    left: rect.left,
    width: rect.width
  })
  if (direction) turnPage(direction)
}

function handleKeydown(event) {
  if (normalizedMode.value !== READING_MODES.PAGE) return
  if (props.disabled || isInteractiveTarget(event.target)) return
  const direction = pageTurnDirectionForKey({
    mode: normalizedMode.value,
    disabled: props.disabled,
    key: event.key
  })
  if (direction) {
    event.preventDefault()
    turnPage(direction)
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
  isMounted = true
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
  isMounted = false
  measurementScheduler.dispose()
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
