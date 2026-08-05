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

test('preview exposes settings and uses the shared reading viewport', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /ReadingViewport/)
  assert.match(source, /ReadingModeToggle/)
  assert.match(source, /aria-label="阅读设置"/)
  assert.match(source, /effectiveReadingMode/)
  assert.match(source, /saveReadingMode/)
})

test('preview repaginates for every rendered detail and styles its settings transition', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /JSON\.stringify\(mappingList\.value\)/)
  assert.match(source, /JSON\.stringify\(referenceList\.value\)/)
  assert.match(source, /regenDisabled\.value/)
  assert.match(source, /\.slide-up-enter-active/)
  assert.match(source, /\.slide-up-leave-active/)
})

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
