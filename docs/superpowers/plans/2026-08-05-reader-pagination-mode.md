# 阅读模式切换与点击翻页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在生成预览页和正式章节阅读页中提供共享、可持久化的“滑动 / 翻页”阅读模式，并支持左右半屏点击翻页及章节边界导航。

**Architecture:** 将阅读偏好与纯分页计算放在 `src/features/reader/readingMode.js`，用 `ReadingViewport.vue` 统一封装滚动、CSS 多栏分页、进度和边界事件，用 `ReadingModeToggle.vue` 统一呈现设置控件。`Preview.vue` 与 `ChapterReader.vue` 只负责页面内容、设置入口及章节导航，避免复制分页状态机。

**Tech Stack:** Vue 3 Composition API、Vite 5、CSS Multi-column、Node.js `node:test`、浏览器 `localStorage`、`ResizeObserver`

## Global Constraints

- 合法阅读模式只有 `scroll` 与 `page`，存储键固定为 `reader_mode`。
- 默认必须是 `scroll`，滑动模式保持现有视觉和交互行为。
- 翻页使用不可见中心线：左半屏上一页，右半屏下一页。
- 正式阅读页越过首尾页时导航到相邻章节；预览页只停留在边界页。
- 交互控件、设置面板和目录不得触发正文翻页。
- 预览编辑状态强制使用滚动布局，但不覆盖已保存的用户偏好。
- 不新增运行时依赖，不改变数据库结构，不保存章节阅读页码。
- 所有生产代码遵循测试先行：先观察对应测试按预期失败，再写最小实现。

---

## File Structure

- Create `src/features/reader/readingMode.js`: 阅读模式常量、存储容错、页码边界、进度与重分页映射。
- Create `src/components/ReadingModeToggle.vue`: “滑动 / 翻页”二段式可访问控件。
- Create `src/components/ReadingViewport.vue`: 滚动与 CSS 多栏分页容器、点击和键盘翻页、尺寸监听、事件输出。
- Create `tests/reading-mode.test.mjs`: 纯逻辑单元测试。
- Create `tests/reader-view-contracts.test.mjs`: 组件和两个页面的集成契约测试。
- Modify `src/views/Preview.vue`: 齿轮设置、共享阅读模式和统一阅读视口。
- Modify `src/views/ChapterReader.vue`: 设置面板阅读方式、统一阅读视口和章节边界事件。
- Modify `package.json`: 增加阅读模式测试脚本，并纳入完整测试链。

---

### Task 1: 阅读模式领域逻辑与持久化

**Files:**
- Create: `tests/reading-mode.test.mjs`
- Create: `src/features/reader/readingMode.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `READING_MODES`, `READER_MODE_STORAGE_KEY`, `normalizeReadingMode(value)`, `loadReadingMode(storage)`, `saveReadingMode(mode, storage)`, `clampPage(page, pageCount)`, `getPageTurn(currentPage, pageCount, direction)`, `pageProgress(page, pageCount)`, `pageAtProgress(progress, pageCount)`.
- Consumes: Storage-compatible object exposing `getItem(key)` and `setItem(key, value)`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/reading-mode.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
node --test tests/reading-mode.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/features/reader/readingMode.js`.

- [ ] **Step 3: Add the minimal reading-mode implementation**

Create `src/features/reader/readingMode.js`:

```js
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
```

- [ ] **Step 4: Register and run the test**

Add the following script to `package.json`:

```json
"test:reader-mode": "node --test tests/reading-mode.test.mjs"
```

Insert `npm run test:reader-mode &&` after `"test": "` in the full test chain.

Run:

```powershell
npm.cmd run test:reader-mode
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the domain layer**

```powershell
git add package.json tests/reading-mode.test.mjs src/features/reader/readingMode.js
git commit -m "feat(reader): add shared reading mode state"
```

---

### Task 2: 可复用模式切换与分页视口组件

**Files:**
- Create: `tests/reader-view-contracts.test.mjs`
- Create: `src/components/ReadingModeToggle.vue`
- Create: `src/components/ReadingViewport.vue`
- Modify: `package.json`

**Interfaces:**
- Consumes: `mode`, `contentKey`, `repaginateKey`; default slot containing rendered reading content.
- Produces: `ReadingModeToggle` emits `update:modelValue`; `ReadingViewport` emits `progress-change(number)`, `boundary-prev`, `boundary-next`, and exposes `resetToStart()` and `repaginate()`.

- [ ] **Step 1: Write failing component contract tests**

Create `tests/reader-view-contracts.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('reading mode toggle exposes two accessible shared modes', async () => {
  const source = await read('../src/components/ReadingModeToggle.vue')
  assert.match(source, /滑动/)
  assert.match(source, /翻页/)
  assert.match(source, /aria-pressed/)
  assert.match(source, /update:modelValue/)
})

test('reading viewport owns paging, progress and boundary events', async () => {
  const source = await read('../src/components/ReadingViewport.vue')
  assert.match(source, /column-width/)
  assert.match(source, /ResizeObserver/)
  assert.match(source, /boundary-prev/)
  assert.match(source, /boundary-next/)
  assert.match(source, /progress-change/)
  assert.match(source, /disabled/)
  assert.match(source, /closest\(/)
})
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```powershell
node --test tests/reader-view-contracts.test.mjs
```

Expected: FAIL with `ENOENT` for the first missing Vue component.

- [ ] **Step 3: Implement `ReadingModeToggle.vue`**

Create `src/components/ReadingModeToggle.vue`:

```vue
<template>
  <div class="reading-mode-toggle" role="group" aria-label="阅读方式">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="reading-mode-option"
      :class="{ active: modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { READING_MODES } from '@/features/reader/readingMode'

defineProps({
  modelValue: { type: String, default: READING_MODES.SCROLL }
})

defineEmits(['update:modelValue'])

const options = [
  { value: READING_MODES.SCROLL, label: '滑动' },
  { value: READING_MODES.PAGE, label: '翻页' }
]
</script>

<style scoped>
.reading-mode-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  flex: 1;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.reading-mode-option {
  min-height: 36px;
  border-radius: calc(var(--radius-sm) - 2px);
  color: var(--color-text-secondary);
  background: transparent;
  font-size: var(--font-size-sm);
}

.reading-mode-option.active {
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(60, 45, 35, 0.12);
}
</style>
```

- [ ] **Step 4: Implement `ReadingViewport.vue`**

Create `src/components/ReadingViewport.vue`:

```vue
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
```

- [ ] **Step 5: Register the component contract test and verify GREEN**

Add to `package.json`:

```json
"test:reader-views": "node --test tests/reader-view-contracts.test.mjs"
```

Insert `npm run test:reader-views &&` immediately after `npm run test:reader-mode &&` in the complete test chain.

Run:

```powershell
npm.cmd run test:reader-views
npm.cmd run build
```

Expected: 2 tests pass; Vite build exits 0.

- [ ] **Step 6: Commit the shared UI primitives**

```powershell
git add package.json tests/reader-view-contracts.test.mjs src/components/ReadingModeToggle.vue src/components/ReadingViewport.vue
git commit -m "feat(reader): add reusable paged viewport"
```

---

### Task 3: 将统一阅读模式接入生成预览页

**Files:**
- Modify: `tests/reader-view-contracts.test.mjs`
- Modify: `src/views/Preview.vue`

**Interfaces:**
- Consumes: `ReadingViewport`, `ReadingModeToggle`, `READING_MODES`, `loadReadingMode()`, `saveReadingMode()`.
- Produces: 预览页齿轮设置；编辑时的临时滚动模式；非编辑状态的分页预览。

- [ ] **Step 1: Add a failing preview integration contract**

Append to `tests/reader-view-contracts.test.mjs`:

```js
test('preview exposes settings and uses the shared reading viewport', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /ReadingViewport/)
  assert.match(source, /ReadingModeToggle/)
  assert.match(source, /aria-label="阅读设置"/)
  assert.match(source, /effectiveReadingMode/)
  assert.match(source, /saveReadingMode/)
})
```

- [ ] **Step 2: Run the preview contract and verify RED**

Run:

```powershell
npm.cmd run test:reader-views
```

Expected: 1 failure because `Preview.vue` does not yet contain `ReadingViewport`.

- [ ] **Step 3: Replace the preview top bar and content wrapper**

In `src/views/Preview.vue`, replace the existing top bar with:

```vue
<header class="topbar">
  <button class="btn-back" @click="back">
    <span class="back-arrow">‹</span> 返回
  </button>
  <span class="status-label">{{ statusLabel }}</span>
  <button
    v-if="result && !generating"
    type="button"
    class="btn-reader-settings"
    aria-label="阅读设置"
    :aria-expanded="showReaderSettings"
    @click="showReaderSettings = !showReaderSettings"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.83 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"/></svg>
  </button>
</header>
```

Replace `<div class="content-area"> ... </div>` inside the result state with the same existing children wrapped by:

```vue
<ReadingViewport
  class="content-area"
  :mode="effectiveReadingMode"
  :content-key="segmentId || routeDay || ''"
  :repaginate-key="previewLayoutKey"
  :disabled="showReaderSettings"
>
  <article v-if="!editing" class="story-text">{{ result.content }}</article>
  <textarea
    v-else
    v-model="editedText"
    class="story-editor"
    placeholder="编辑你的故事..."
  />

  <section v-if="mappingList.length" class="mapping">
    <h4 class="mapping-title">今日事件映射</h4>
    <ul class="mapping-list">
      <li v-for="(m, i) in mappingList" :key="i" class="mapping-item">
        <span class="behavior">{{ m.behavior }}</span>
        <span class="mapping-arrow">→</span>
        <span class="world-behavior">{{ m.worldBehavior }}</span>
      </li>
    </ul>
  </section>

  <section v-if="referenceList.length" class="references">
    <h4 class="references-title">你的行动如何影响了故事</h4>
    <div v-for="(ref, i) in referenceList" :key="i" class="ref-card">
      <div class="ref-row">
        <span class="ref-label">你的日记</span>
        <p class="ref-text diary-text">「{{ ref.diarySnippet }}」</p>
      </div>
      <div class="ref-arrow">↓</div>
      <div class="ref-row">
        <span class="ref-label">故事对应</span>
        <p class="ref-text story-text">{{ ref.storySnippet }}</p>
      </div>
      <p v-if="ref.mapping" class="ref-mapping">{{ ref.mapping }}</p>
    </div>
  </section>

  <p v-if="regenDisabled && !editing" class="regen-hint">
    已达重生成上限，可手动编辑
  </p>
</ReadingViewport>
```

Insert before the action footer:

```vue
<transition name="slide-up">
  <div v-if="showReaderSettings" class="preview-settings-panel" data-no-page-turn>
    <div class="setting-row">
      <span class="setting-label">阅读方式</span>
      <ReadingModeToggle v-model="readingMode" />
    </div>
  </div>
</transition>
```

- [ ] **Step 4: Add preview state and persistence**

Update the Vue import and add component/feature imports:

```js
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import ReadingViewport from '@/components/ReadingViewport.vue'
import ReadingModeToggle from '@/components/ReadingModeToggle.vue'
import {
  READING_MODES,
  loadReadingMode,
  saveReadingMode
} from '@/features/reader/readingMode'
```

Add beside the existing state:

```js
const readingMode = ref(loadReadingMode())
const showReaderSettings = ref(false)
const effectiveReadingMode = computed(() => (
  editing.value ? READING_MODES.SCROLL : readingMode.value
))
const previewLayoutKey = computed(() => [
  result.value?.content || '',
  mappingList.value.length,
  referenceList.value.length,
  editing.value ? 'editing' : 'reading'
].join('|'))

watch(readingMode, value => saveReadingMode(value))
```

At the start of `toggleEdit()`, close the settings panel:

```js
showReaderSettings.value = false
```

- [ ] **Step 5: Make preview layout viewport-bound and style settings**

Change `.preview` to include:

```css
height: 100dvh;
overflow: hidden;
```

Change `.topbar` to `position: relative`, remove the status label transform, and add:

```css
.status-label {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.btn-reader-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-left: auto;
  color: var(--color-text-secondary);
  background: transparent;
  border-radius: var(--radius-sm);
}

.content-area {
  flex: 1;
  min-height: 0;
}

.preview-settings-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 30;
  width: 100%;
  max-width: 480px;
  padding: var(--spacing-lg) var(--spacing-md);
  padding-bottom: calc(var(--spacing-lg) + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  border-top: 1px solid var(--color-border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-surface);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.setting-label {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
```

Remove the old `overflow-y` and padding declarations from `.content-area`, because `ReadingViewport` owns them.

- [ ] **Step 6: Verify preview integration**

Run:

```powershell
npm.cmd run test:reader-views
npm.cmd run build
```

Expected: 3 contract tests pass; build exits 0.

- [ ] **Step 7: Commit preview integration**

```powershell
git add tests/reader-view-contracts.test.mjs src/views/Preview.vue
git commit -m "feat(preview): add selectable page reading"
```

---

### Task 4: 将统一阅读模式接入正式章节阅读页

**Files:**
- Modify: `tests/reader-view-contracts.test.mjs`
- Modify: `src/views/ChapterReader.vue`

**Interfaces:**
- Consumes: shared viewport and mode toggle; existing `goPrev()`, `goNext()`, `fontSize`, `lineHeight`, `comments`, `chapter`.
- Produces: 正式阅读页滚动/翻页切换、共享设置恢复、章节边界导航和统一进度。

- [ ] **Step 1: Add a failing chapter reader integration contract**

Append to `tests/reader-view-contracts.test.mjs`:

```js
test('chapter reader connects paging to settings, progress and chapter boundaries', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  assert.match(source, /ReadingViewport/)
  assert.match(source, /ReadingModeToggle/)
  assert.match(source, /阅读方式/)
  assert.match(source, /@boundary-prev="goPrev"/)
  assert.match(source, /@boundary-next="goNext"/)
  assert.match(source, /@progress-change="readProgress = \$event"/)
  assert.match(source, /saveReadingMode/)
})
```

- [ ] **Step 2: Run the reader contract and verify RED**

Run:

```powershell
npm.cmd run test:reader-views
```

Expected: 1 failure because `ChapterReader.vue` does not yet use `ReadingViewport`.

- [ ] **Step 3: Replace the reader body wrapper**

Replace the opening and closing `reader-body` `<div>` with:

```vue
<ReadingViewport
  v-else-if="chapter"
  class="reader-body"
  :mode="readingMode"
  :content-key="chapter.id"
  :repaginate-key="readerLayoutKey"
  :disabled="showSettings || showToc"
  @progress-change="readProgress = $event"
  @boundary-prev="goPrev"
  @boundary-next="goNext"
>
  <article class="story-text" :style="{ fontSize: fontSize + 'px', lineHeight: lineHeight }">
    <template v-if="contentBlocks.length > 0">
      <template v-for="(block, idx) in contentBlocks" :key="idx">
        <p v-if="block.type === 'paragraph'" v-html="block.content.replace(/\n/g, '<br>')"></p>
        <div v-else-if="block.type === 'comment'" class="comment-card">
          <div class="comment-avatar" :style="{ background: block.data.avatar_color }">
            {{ block.data.persona_name[0] }}
          </div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-name">{{ block.data.persona_name }}</span>
              <span class="comment-likes">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                {{ block.data.likes }}
              </span>
            </div>
            <p class="comment-text">{{ block.data.content }}</p>
          </div>
        </div>
      </template>
    </template>
    <p v-else style="color:var(--color-text-secondary);text-align:center;">本章暂无内容</p>
  </article>

  <div class="chapter-nav">
    <button v-if="hasPrev" class="nav-btn" @click="goPrev">← 上一章</button>
    <span v-else />
    <button v-if="hasNext" class="nav-btn" @click="goNext">下一章 →</button>
    <span v-else />
  </div>

  <div v-if="totalCommentCount > 0" class="comment-summary">
    <div class="heat-badge" :class="'heat-' + heatLevel">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
      {{ HEAT_LEVELS[heatLevel]?.label || '日常' }}
    </div>
    <span class="comment-count-text">本章 {{ comments.length }}/{{ totalCommentCount }} 条评论</span>
  </div>

  <section v-if="pendingChoice" class="destiny-choice">
    <p class="choice-kicker">读完这一页，命运仍在等待</p>
    <h3>第 {{ pendingChoice.triggerDay }} 天 · 下一步命运</h3>
    <p class="choice-prompt">{{ pendingChoice.prompt }}</p>
    <div class="choice-options">
      <button
        v-for="option in pendingChoice.options"
        :key="option.id"
        class="choice-option"
        :disabled="selectingChoice"
        @click="selectDestiny(option)"
      >
        <strong>{{ option.desc }}</strong>
        <span v-if="option.effect">{{ option.effect }}</span>
      </button>
    </div>
  </section>

  <section v-else-if="selectedChoice" class="destiny-confirmed">
    <p>命运已被写下：{{ selectedChoice.description }}</p>
    <button class="nav-btn" @click="goWriteNextDay">记录下一天</button>
  </section>
</ReadingViewport>
```

The closing tag immediately after the destiny section becomes `</ReadingViewport>`.

- [ ] **Step 4: Add reading mode to the gear panel**

Insert as the first row inside `.settings-panel`:

```vue
<div class="setting-row" data-no-page-turn>
  <span class="setting-label setting-label-wide">阅读方式</span>
  <ReadingModeToggle v-model="readingMode" />
</div>
```

Add imports:

```js
import ReadingViewport from '@/components/ReadingViewport.vue'
import ReadingModeToggle from '@/components/ReadingModeToggle.vue'
import { loadReadingMode, saveReadingMode } from '@/features/reader/readingMode'
```

Replace `const readerBody = ref(null)` with:

```js
const readingMode = ref(loadReadingMode())
```

Add:

```js
const readerLayoutKey = computed(() => [
  chapter.value?.id || '',
  chapter.value?.content?.length || 0,
  comments.value.length,
  fontSize.value,
  lineHeight.value
].join('|'))
```

- [ ] **Step 5: Remove duplicate scrolling logic and persist the mode**

Delete the existing `updateProgress()` function and the `nextTick()` block in `loadChapter()` that directly sets `readerBody.scrollTop`. Keep this final assignment in `loadChapter()`:

```js
readProgress.value = 0
```

Delete `nextTick` from the Vue import; after removing that block, this file has no remaining `nextTick` call.

Add beside the existing font and line-height watchers:

```js
watch(readingMode, value => saveReadingMode(value))
```

The existing `onMounted()` continues restoring night mode, font size and line height; `readingMode` is already initialized through `loadReadingMode()`.

- [ ] **Step 6: Constrain the formal reader viewport and preserve interactive cards**

Change `.chapter-reader` to include:

```css
height: 100dvh;
overflow: hidden;
```

Replace `.reader-body` with:

```css
.reader-body {
  flex: 1;
  min-height: 0;
}
```

Add:

```css
.setting-label-wide {
  width: 64px;
}

.comment-card,
.chapter-nav,
.comment-summary,
.destiny-confirmed {
  break-inside: avoid;
}
```

Do not apply `break-inside: avoid` to `.destiny-choice`, because a long list of choices must remain reachable even when taller than one page.

- [ ] **Step 7: Verify formal reader integration**

Run:

```powershell
npm.cmd run test:reader-mode
npm.cmd run test:reader-views
npm.cmd run build
```

Expected: 4 reading-mode tests and 4 contract tests pass; build exits 0.

- [ ] **Step 8: Commit formal reader integration**

```powershell
git add tests/reader-view-contracts.test.mjs src/views/ChapterReader.vue
git commit -m "feat(reader): add click pagination to chapters"
```

---

### Task 5: 浏览器验收、回归测试与分支检查

**Files:**
- Verify: `src/views/Preview.vue`
- Verify: `src/views/ChapterReader.vue`
- Verify: all tests and production bundle

**Interfaces:**
- Consumes: running Vite app at `http://127.0.0.1:5173`.
- Produces: verified implementation ready for review and PR; no additional feature behavior.

- [ ] **Step 1: Run all automated tests**

```powershell
npm.cmd test
```

Expected: every script exits 0, including `test:reader-mode` and `test:reader-views`; no test failures.

- [ ] **Step 2: Run a fresh production build**

```powershell
npm.cmd run build
```

Expected: Vite build exits 0 and writes the production bundle to `dist/`.

- [ ] **Step 3: Start or reuse the development server**

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite reports `http://127.0.0.1:5173/`. If an existing server already owns the port and serves this worktree, reuse it instead of starting a second instance.

- [ ] **Step 4: Verify preview behavior in the browser**

Open `http://127.0.0.1:5173/#/preview/1` or navigate through the diary generation flow to a valid preview.

Verify in this order:

1. Default or selected “滑动” mode scrolls exactly as before.
2. The top-right gear opens a panel containing “滑动 / 翻页”.
3. “翻页” mode displays one viewport page; left and right blank-text areas move one page in the correct direction.
4. First/last page boundary clicks stay on the boundary page.
5. “编辑” enables the scrollable textarea; saving or cancelling restores paging.
6. Regenerate, edit, confirm and settings buttons do not trigger page turns.

- [ ] **Step 5: Verify formal reader behavior in the browser**

Open `http://127.0.0.1:5173/#/reader/1`.

Verify in this order:

1. The gear panel contains “阅读方式” plus the existing字号、行距、亮度 controls.
2. Selecting “翻页” survives refresh and also appears selected in preview.
3. Left/right half clicks and left/right arrow keys move exactly one page.
4. On the first page, an additional left turn opens the previous chapter when one exists.
5. On the last page, an additional right turn opens the next chapter when one exists.
6. At the first/last available chapter, missing boundaries do nothing and produce no error.
7. Changing字号 or行距, resizing the window and receiving delayed comments reflows pages without blank or unreachable content.
8. Gear,目录,目录条目,章节按钮 and命运选择 remain clickable without accidental page turns.
9. Day and night themes keep content and settings readable.

- [ ] **Step 6: Inspect the branch scope**

```powershell
git status -sb
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: clean worktree; no whitespace errors; only the design/plan, reading-mode feature, two shared components, two reader views, tests and `package.json` differ from `origin/main`.

- [ ] **Step 7: Create the review handoff**

Summarize the verified behavior, test counts, build result, branch name `feat/reader-pagination-mode`, and commits. Do not merge directly to `main`; push the feature branch and open a PR only after the user requests publication, then require another team member to review before merge.
