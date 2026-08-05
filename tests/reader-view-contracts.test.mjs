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

test('reading viewport explicitly ignores clicks marked as settings dismissals', async () => {
  const source = await read('../src/components/ReadingViewport.vue')
  assert.match(source, /import \{ isOutsidePanelDismissClick \} from '@\/features\/reader\/outsidePanelController'/)
  assert.match(source, /function handleClick\(event\) \{\s*if \(isOutsidePanelDismissClick\(event\)\) return/)
})

test('preview exposes settings and uses the shared reading viewport', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /ReadingViewport/)
  assert.match(source, /ReadingModeToggle/)
  assert.match(source, /aria-label="阅读设置"/)
  assert.match(source, /effectiveReadingMode/)
  assert.match(source, /saveReadingMode/)
})

test('preview wires outside settings clicks through the shared controller without paging', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /import \{ createOutsidePanelController \} from '@\/features\/reader\/outsidePanelController'/)
  assert.match(source, /ref="settingsTrigger"/)
  assert.match(source, /ref="settingsPanel"/)
  assert.match(source, /const settingsTrigger = ref\(null\)/)
  assert.match(source, /const settingsPanel = ref\(null\)/)
  assert.match(source, /const suppressSettingsPageTurn = ref\(false\)/)
  assert.match(source, /createOutsidePanelController\(\{[\s\S]*eventTarget: document[\s\S]*isOpen: \(\) => showReaderSettings\.value[\s\S]*close: \(\) => \{ showReaderSettings\.value = false \}[\s\S]*setSuppressed: value => \{ suppressSettingsPageTurn\.value = value \}[\s\S]*\}\)/)
  assert.match(source, /settingsPanelController\.mount\(\)/)
  assert.match(source, /settingsPanelController\.unmount\(\)/)
  assert.match(source, /:disabled="showReaderSettings \|\| suppressSettingsPageTurn"/)
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

test('chapter reader wires outside settings clicks through the shared controller without paging', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  assert.match(source, /import \{ createOutsidePanelController \} from '@\/features\/reader\/outsidePanelController'/)
  assert.match(source, /ref="settingsTrigger"/)
  assert.match(source, /ref="settingsPanel"/)
  assert.match(source, /const settingsTrigger = ref\(null\)/)
  assert.match(source, /const settingsPanel = ref\(null\)/)
  assert.match(source, /const suppressSettingsPageTurn = ref\(false\)/)
  assert.match(source, /createOutsidePanelController\(\{[\s\S]*eventTarget: document[\s\S]*isOpen: \(\) => showSettings\.value[\s\S]*close: \(\) => \{ showSettings\.value = false \}[\s\S]*setSuppressed: value => \{ suppressSettingsPageTurn\.value = value \}[\s\S]*\}\)/)
  assert.match(source, /settingsPanelController\.mount\(\)/)
  assert.match(source, /settingsPanelController\.unmount\(\)/)
  assert.match(source, /:disabled="showSettings \|\| showToc \|\| suppressSettingsPageTurn"/)
})

test('chapter reader repaginates from every dynamically rendered layout input', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  const layoutKey = source.slice(
    source.indexOf('const readerLayoutKey'),
    source.indexOf('const currentIndex')
  )

  assert.match(layoutKey, /JSON\.stringify\(\{/)
  assert.match(layoutKey, /chapterId: chapter\.value\?\.id/)
  assert.match(layoutKey, /contentBlocks: contentBlocks\.value/)
  assert.match(layoutKey, /pendingChoice: pendingChoice\.value/)
  assert.match(layoutKey, /selectedChoice: selectedChoice\.value/)
  assert.match(layoutKey, /totalCommentCount: totalCommentCount\.value/)
  assert.match(layoutKey, /heatLevel: heatLevel\.value/)
  assert.match(layoutKey, /fontSize: fontSize\.value/)
  assert.match(layoutKey, /lineHeight: lineHeight\.value/)
  assert.doesNotMatch(layoutKey, /content\?\.length/)
})
