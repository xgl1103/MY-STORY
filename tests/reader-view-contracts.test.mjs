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

test('chapter reader exposes an accessible, non-paging comment-like button', async () => {
  const source = await read('../src/views/ChapterReader.vue')

  assert.match(source, /type="button"\s+class="comment-like-button"/)
  assert.match(source, /:aria-pressed="Number\(block\.data\.is_liked\) === 1"/)
  assert.match(source, /:aria-label="Number\(block\.data\.is_liked\) === 1 \? '取消点赞' : '点赞'"/)
  assert.match(source, /data-no-page-turn/)
  assert.match(source, /@click="toggleCommentLike\(block\.data\)"/)
  assert.match(source, /@animationend="clearCommentLikeAnimation\(block\.data\.id\)"/)
  assert.match(source, /comment-like-count/)
  assert.match(source, /'is-liked': Number\(block\.data\.is_liked\) === 1/)
  assert.match(source, /'is-liking': commentLikeAnimations\[block\.data\.id\] === 'liking'/)
  assert.match(source, /'is-unliking': commentLikeAnimations\[block\.data\.id\] === 'unliking'/)
  assert.match(source, /width="16" height="16"/)
  assert.match(source, /stroke="currentColor"/)
  assert.match(source, /:fill="Number\(block\.data\.is_liked\) === 1 \? 'currentColor' : 'none'"/)
})

test('chapter reader persists optimistic comment likes with a pending lock and rollback', async () => {
  const source = await read('../src/views/ChapterReader.vue')

  assert.match(source, /const pendingCommentLikeIds = ref\(new Set\(\)\)/)
  assert.match(source, /const commentLikeAnimations = ref\(\{\}\)/)
  assert.match(source, /if \(pendingCommentLikeIds\.value\.has\(commentId\)\) return/)
  assert.match(source, /const nextPending = new Set\(pendingCommentLikeIds\.value\)/)
  assert.match(source, /pendingCommentLikeIds\.value = nextPending/)
  assert.match(source, /comments\.value = comments\.value\.map\(/)
  assert.match(source, /commentLikeAnimations\.value = \{[\s\S]*\[commentId\]: nextLiked \? 'liking' : 'unliking'/)
  assert.match(source, /await CommentRepository\.setLiked\(commentId, Boolean\(nextLiked\)\)/)
  assert.match(source, /if \(!savedComment\) throw new Error\(/)
  assert.match(source, /console\.warn\('\[Reader\] 点赞保存失败:'/)
  assert.match(source, /clearCommentLikeAnimation\(commentId\)/)
})

test('chapter reader centers narrower comment cards and supplies reversible like motion', async () => {
  const source = await read('../src/views/ChapterReader.vue')

  assert.match(source, /\.comment-card\s*\{[\s\S]*width: min\(92%, 680px\);[\s\S]*box-sizing: border-box;[\s\S]*margin-left: auto;[\s\S]*margin-right: auto;/)
  assert.match(source, /\.comment-like-button\s*\{[\s\S]*color: var\(--color-text-tertiary\)/)
  assert.match(source, /\.comment-like-button\.is-liked\s*\{[\s\S]*color: #/)
  assert.match(source, /\.comment-like-button:focus-visible/)
  assert.match(source, /\.comment-like-button:disabled/)
  assert.match(source, /@keyframes comment-heart-like/)
  assert.match(source, /@keyframes comment-heart-unlike/)
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/)
})
