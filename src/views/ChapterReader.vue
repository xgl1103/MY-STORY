<template>
  <div class="chapter-reader" :data-theme="nightMode ? 'dark' : 'reader-day'" :data-reader-theme="nightMode ? 'night' : 'day'">
    <!-- 顶部工具栏 -->
    <header class="top-bar">
      <button class="tool-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="title-area">
        <h3 class="chapter-title">{{ chapter ? (chapter.title || '未命名') : '加载中' }}</h3>
        <span v-if="chapter" class="chapter-sub">第 {{ chapter.start_day }}-{{ chapter.end_day }} 天</span>
      </div>
      <button class="tool-btn" @click="showToc = !showToc">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <button ref="settingsTrigger" class="tool-btn" @click="showSettings = !showSettings">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <button class="tool-btn" :class="{ active: nightMode }" @click="toggleNight">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </header>

    <LoadingSpinner v-if="loading" tip="加载章节..." />

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="loadChapter">重试</button>
    </div>

    <ReadingViewport
      v-else-if="chapter"
      class="reader-body"
      :mode="readingMode"
      :content-key="chapter.id"
      :repaginate-key="readerLayoutKey"
      :disabled="showSettings || showToc || suppressSettingsPageTurn"
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
                  <button
                    type="button"
                    class="comment-like-button"
                    :class="{
                      'is-liked': Number(block.data.is_liked) === 1,
                      'is-liking': commentLikeAnimations[block.data.id] === 'liking',
                      'is-unliking': commentLikeAnimations[block.data.id] === 'unliking'
                    }"
                    :aria-pressed="Number(block.data.is_liked) === 1"
                    :aria-label="Number(block.data.is_liked) === 1 ? '取消点赞' : '点赞'"
                    :disabled="pendingCommentLikeIds.has(block.data.id)"
                    data-no-page-turn
                    @click="toggleCommentLike(block.data)"
                    @animationend="clearCommentLikeAnimation(block.data.id)"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" :fill="Number(block.data.is_liked) === 1 ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    <span class="comment-like-count">{{ block.data.likes }}</span>
                  </button>
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

      <!-- 章节底部评论区汇总 -->
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

      <section v-if="!hasNext" class="story-completion" data-no-page-turn>
        <button type="button" class="completion-btn" data-no-page-turn @click="goHomeAfterStory">
          完成今日故事，返回首页
        </button>
      </section>
    </ReadingViewport>

    <!-- 底部进度条 -->
    <div v-if="chapter && !loading" class="progress-bar">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: readProgress + '%' }" />
      </div>
      <span class="progress-text">{{ Math.round(readProgress) }}%</span>
    </div>

    <!-- 设置面板 -->
    <transition name="slide-up">
      <div v-if="showSettings" ref="settingsPanel" class="settings-panel">
        <div class="setting-row" data-no-page-turn>
          <span class="setting-label setting-label-wide">阅读方式</span>
          <ReadingModeToggle v-model="readingMode" />
        </div>
        <div class="setting-row">
          <span class="setting-label">字号</span>
          <button class="size-btn" @click="fontSize = Math.max(14, fontSize - 1)">A-</button>
          <span class="size-value">{{ fontSize }}</span>
          <button class="size-btn" @click="fontSize = Math.min(24, fontSize + 1)">A+</button>
        </div>
        <div class="setting-row">
          <span class="setting-label">行距</span>
          <button class="size-btn" @click="lineHeight = Math.max(1.5, lineHeight - 0.1)">−</button>
          <span class="size-value">{{ lineHeight.toFixed(1) }}</span>
          <button class="size-btn" @click="lineHeight = Math.min(2.5, lineHeight + 0.1)">+</button>
        </div>
        <div class="setting-row">
          <span class="setting-label">亮度</span>
          <input type="range" min="20" max="100" v-model="brightness" class="brightness-slider" />
        </div>
      </div>
    </transition>

    <!-- 目录弹层 -->
    <transition name="fade">
      <div v-if="showToc" class="toc-overlay" @click="showToc = false">
        <div class="toc-panel" @click.stop>
          <h4 class="toc-title">目录</h4>
          <div class="toc-list">
            <button
              v-for="ch in chapters"
              :key="ch.id"
              class="toc-item"
              :class="{ active: ch.id === chapter?.id }"
              @click="jumpChapter(ch)"
            >
              {{ ch.chapter_number === 0 ? '序章' : '第' + ch.chapter_number + '章' }}
              <span v-if="ch.title">· {{ ch.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 亮度遮罩 -->
    <div v-if="brightness < 100" class="brightness-overlay" :style="{ opacity: (100 - brightness) / 200 }" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'
import { CommentRepository } from '@/db/repositories/CommentRepository'
import { UserRepository } from '@/db/repositories/UserRepository'
import { getStoryEngine } from '@/core'
import { triggerCommentGeneration, generateComments, assessHeatLevel, HEAT_LEVELS } from '@/utils/CommentGenerator'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import ReadingViewport from '@/components/ReadingViewport.vue'
import ReadingModeToggle from '@/components/ReadingModeToggle.vue'
import { loadReadingMode, saveReadingMode } from '@/features/reader/readingMode'
import { createOutsidePanelController } from '@/features/reader/outsidePanelController'
import { createCommentLikeController } from '@/features/reader/commentLikeController'

const router = useRouter()
const route = useRoute()

const chapter = ref(null)
const chapters = ref([])
const comments = ref([])
const pendingCommentLikeIds = ref(new Set())
const commentLikeAnimations = ref({})
const COMMENT_LIKE_ANIMATION_DURATION = 480
const commentLikeAnimationTimers = new Map()
const totalCommentCount = ref(0)
const heatLevel = ref(1)
const commentRefreshing = ref(false)
const loading = ref(true)
const error = ref('')
const showSettings = ref(false)
const showToc = ref(false)
const nightMode = ref(false)
const fontSize = ref(16)
const lineHeight = ref(2)
const brightness = ref(100)
const readProgress = ref(0)
const readingMode = ref(loadReadingMode())
const pendingChoice = ref(null)
const selectedChoice = ref(null)
const selectingChoice = ref(false)
const settingsTrigger = ref(null)
const settingsPanel = ref(null)
const suppressSettingsPageTurn = ref(false)
const settingsPanelController = createOutsidePanelController({
  eventTarget: document,
  isOpen: () => showSettings.value,
  getTrigger: () => settingsTrigger.value,
  getPanel: () => settingsPanel.value,
  close: () => { showSettings.value = false },
  setSuppressed: value => { suppressSettingsPageTurn.value = value }
})
const commentLikeController = createCommentLikeController({
  getComment: commentId => comments.value.find(comment => comment.id === commentId),
  updateComment: updateCommentLikeState,
  persistLike: (commentId, liked) => CommentRepository.setLiked(commentId, liked),
  setAnimation: setCommentLikeAnimation,
  clearAnimation: clearCommentLikeAnimation,
  setPending: setCommentLikePending,
  warn: e => console.warn('[Reader] 点赞保存失败:', e)
})

// 渐进展示定时器：每 10 秒刷新可见评论
let commentTimer = null

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

function toggleNight() {
  nightMode.value = !nightMode.value
  try { localStorage.setItem('reader_night', nightMode.value ? '1' : '0') } catch (e) { /* ignore */ }
}

// 将正文段落和评论混合成渲染块
const contentBlocks = computed(() => {
  if (!chapter.value?.content) return []
  const paragraphs = chapter.value.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(/\n\s*\n/)
    .filter(p => p.trim().length > 0)

  const blocks = []
  // 6.3 修复：支持每段多条评论（用数组存储而非单条覆盖）
  const commentMap = new Map()
  for (const c of comments.value) {
    if (!commentMap.has(c.paragraph_index)) {
      commentMap.set(c.paragraph_index, [])
    }
    commentMap.get(c.paragraph_index).push(c)
  }

  for (let i = 0; i < paragraphs.length; i++) {
    blocks.push({ type: 'paragraph', content: paragraphs[i] })
    if (commentMap.has(i)) {
      for (const cmt of commentMap.get(i)) {
        blocks.push({ type: 'comment', data: cmt })
      }
    }
  }
  return blocks
})

const readerLayoutKey = computed(() => JSON.stringify({
  chapterId: chapter.value?.id || '',
  contentBlocks: contentBlocks.value,
  pendingChoice: pendingChoice.value,
  selectedChoice: selectedChoice.value,
  totalCommentCount: totalCommentCount.value,
  heatLevel: heatLevel.value,
  fontSize: fontSize.value,
  lineHeight: lineHeight.value,
  completionCta: !hasNext.value
}))

const currentIndex = computed(() => {
  if (!chapter.value) return -1
  return chapters.value.findIndex(c => c.id === chapter.value.id)
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < chapters.value.length - 1)

async function loadChapter() {
  loading.value = true
  error.value = ''
  showSettings.value = false
  showToc.value = false
  comments.value = []
  totalCommentCount.value = 0
  heatLevel.value = 1
  pendingChoice.value = null
  selectedChoice.value = null
  if (commentTimer) { clearInterval(commentTimer); commentTimer = null }
  try {
    const chapterId = Number(route.params.chapterId)
    chapters.value = await ChapterRepository.getAll()
    const found = chapters.value.find(c => c.id === chapterId)
    if (found) {
      chapter.value = found
      heatLevel.value = found.heat_level || 1

      // 关键修复：从 story_segments 表读取段落并拼接成完整正文
      // 包含 draft_ready 和 finalized 状态，避免 markFinalized 失败时内容不可见
      let segmentContent = ''
      try {
        const segs = await SegmentRepository.getByChapter(chapterId)
        console.log('[Reader] chapterId =', chapterId, ', 段落数据:', segs.map(s => ({ id: s.id, chapter_id: s.chapter_id, status: s.status, contentLen: (s.content||'').length })))
        segmentContent = segs
          .filter(s => s.content && (s.status === 'finalized' || s.status === 'draft_ready'))
          .map(s => s.content)
          .join('\n\n')
        console.log('[Reader] segmentContent length =', segmentContent.length)
      } catch (e) {
        console.warn('[Reader] 段落加载失败:', e)
      }

      // 优先使用段落拼接的内容；章节完成后的摘要做后备
      if (segmentContent) {
        chapter.value.content = segmentContent
      } else if (!chapter.value.content) {
        chapter.value.content = ''
      }

      await loadNarrativeChoice(found.id)

      // 加载评论
      let allComments = []
      try {
        allComments = CommentRepository.getByChapter(found.chapter_number)
      } catch (e) { /* ignore */ }

      // 如果没有评论且有内容，触发后台生成
      const contentForComments = chapter.value.content
      if (allComments.length === 0 && contentForComments) {
        // 6.3 修复：await 等待评论生成完成再加载，避免空评论
        try {
          await triggerCommentGeneration(found.chapter_number, contentForComments)
          allComments = CommentRepository.getByChapter(found.chapter_number)
        } catch (e) {
          console.warn('[Reader] 评论生成失败:', e)
        }
      }

      totalCommentCount.value = allComments.length

      // 初始只展示已可见的评论
      refreshVisibleComments()

      // 启动渐进刷新定时器
      if (allComments.length > comments.value.length) {
        commentTimer = setInterval(refreshVisibleComments, 10000)
      }
    } else {
      error.value = '章节不存在'
    }
  } catch (e) {
    error.value = `加载失败：${(e && e.message) || '未知错误'}`
  } finally {
    loading.value = false
    readProgress.value = 0
  }
}

async function loadNarrativeChoice(chapterId) {
  try {
    const user = await UserRepository.get()
    const latest = await SegmentRepository.getByDay(user.current_day)
    if (!latest || latest.status !== 'finalized' || latest.chapter_id !== chapterId) return
    pendingChoice.value = await getStoryEngine().getPendingChoiceForNextDay()
  } catch (e) {
    console.warn('[Reader] 命运抉择加载失败:', e.message)
  }
}

async function selectDestiny(option) {
  if (!pendingChoice.value || selectingChoice.value) return
  selectingChoice.value = true
  try {
    const result = await getStoryEngine().chooseNextDestiny(pendingChoice.value.nodeId, option.id)
    selectedChoice.value = result
    pendingChoice.value = null
  } catch (e) {
    alert(`选择未能保存：${e.message || '请重试'}`)
  } finally {
    selectingChoice.value = false
  }
}

function goWriteNextDay() {
  router.push('/diary/write')
}

function goHomeAfterStory() {
  router.replace('/')
}

// 刷新可见评论
function refreshVisibleComments() {
  if (!chapter.value) return
  try {
    const visible = CommentRepository.getVisibleByChapter(chapter.value.chapter_number)
    if (visible.length !== comments.value.length) {
      comments.value = visible
    }
    // 所有评论都已展示，停止定时器
    if (visible.length >= totalCommentCount.value && commentTimer) {
      clearInterval(commentTimer)
      commentTimer = null
    }
  } catch (e) { /* ignore */ }
}

function updateCommentLikeState(commentId, values) {
  comments.value = comments.value.map(comment => (
    comment.id === commentId ? { ...comment, ...values } : comment
  ))
}

function setCommentLikePending(commentId, pending) {
  const nextPending = new Set(pendingCommentLikeIds.value)
  if (pending) nextPending.add(commentId)
  else nextPending.delete(commentId)
  pendingCommentLikeIds.value = nextPending
}

function clearCommentLikeAnimation(commentId) {
  const timer = commentLikeAnimationTimers.get(commentId)
  if (timer) clearTimeout(timer)
  commentLikeAnimationTimers.delete(commentId)
  const { [commentId]: _animation, ...remainingAnimations } = commentLikeAnimations.value
  commentLikeAnimations.value = remainingAnimations
}

function setCommentLikeAnimation(commentId, animation) {
  const existingTimer = commentLikeAnimationTimers.get(commentId)
  if (existingTimer) clearTimeout(existingTimer)

  commentLikeAnimations.value = {
    ...commentLikeAnimations.value,
    [commentId]: animation
  }

  const timer = setTimeout(() => clearCommentLikeAnimation(commentId), COMMENT_LIKE_ANIMATION_DURATION)
  commentLikeAnimationTimers.set(commentId, timer)
}

async function toggleCommentLike(comment) {
  await commentLikeController.toggle(comment)
}

function goPrev() {
  if (hasPrev.value) {
    const prev = chapters.value[currentIndex.value - 1]
    router.replace(`/reader/${prev.id}`)
  }
}

function goNext() {
  if (hasNext.value) {
    const next = chapters.value[currentIndex.value + 1]
    router.replace(`/reader/${next.id}`)
  }
}

function jumpChapter(ch) {
  showToc.value = false
  router.replace(`/reader/${ch.id}`)
}

onMounted(() => {
  settingsPanelController.mount()
  // 恢复阅读设置
  try {
    const night = localStorage.getItem('reader_night')
    if (night === '1') nightMode.value = true
    const size = localStorage.getItem('reader_fontsize')
    if (size) fontSize.value = Number(size)
    const lh = localStorage.getItem('reader_lineheight')
    if (lh) lineHeight.value = Number(lh)
  } catch (e) { /* ignore */ }
  loadChapter()
})

onBeforeUnmount(() => {
  settingsPanelController.unmount()
  if (commentTimer) { clearInterval(commentTimer); commentTimer = null }
  for (const timer of commentLikeAnimationTimers.values()) clearTimeout(timer)
  commentLikeAnimationTimers.clear()
})

watch(() => route.params.chapterId, loadChapter)
watch(fontSize, (v) => { try { localStorage.setItem('reader_fontsize', v) } catch (e) {} })
watch(lineHeight, (v) => { try { localStorage.setItem('reader_lineheight', v) } catch (e) {} })
watch(readingMode, value => saveReadingMode(value))
</script>

<style scoped>
.chapter-reader {
  min-height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  position: relative;
  overflow: hidden;
}

/* 夜间模式 — data-theme="dark" 已提供变量，此处仅覆盖特殊值 */
.chapter-reader[data-reader-theme="night"] {
  --color-primary: #e8a88c;
}

/* 顶部工具栏 */
.top-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  padding-top: calc(var(--spacing-sm) + env(safe-area-inset-top, 0px));
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--color-border);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.tool-btn:active {
  background: var(--color-border);
}

.tool-btn.active {
  color: var(--color-primary);
  background: rgba(214, 120, 90, 0.15);
}

.title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.chapter-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.chapter-sub {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* 阅读区 */
.reader-body {
  flex: 1;
  min-height: 0;
}

.story-text :deep(p) {
  color: var(--color-text);
  margin-bottom: var(--spacing-md);
  text-indent: 2em;
}

/* 读者评论卡片 */
.comment-card {
  display: flex;
  gap: 6px;
  width: min(92%, 680px);
  box-sizing: border-box;
  margin: var(--spacing-md) auto var(--spacing-lg);
  margin-left: auto;
  margin-right: auto;
  padding: var(--spacing-sm) 12px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-primary);
  opacity: 0.85;
  transition: opacity 0.2s;
}

.comment-card:hover {
  opacity: 1;
}

.comment-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.comment-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.comment-like-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 3px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 11px;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.comment-like-button.is-liked {
  color: #d94c4c;
}

.comment-like-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.comment-like-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.comment-like-button svg,
.comment-like-count {
  position: relative;
  z-index: 1;
}

.comment-like-button.is-liking svg {
  animation: comment-heart-like 480ms ease-out;
}

.comment-like-button.is-unliking svg {
  animation: comment-heart-unlike 360ms ease-out;
}

.comment-like-button.is-liking::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 8px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 -8px 0 -1px currentColor, 7px -4px 0 -1px currentColor, 7px 4px 0 -1px currentColor, 0 8px 0 -1px currentColor, -7px 4px 0 -1px currentColor, -7px -4px 0 -1px currentColor;
  animation: comment-heart-burst 480ms ease-out;
}

.comment-like-button.is-liking .comment-like-count {
  animation: comment-like-count-up 480ms ease-out;
}

.comment-like-button.is-unliking .comment-like-count {
  animation: comment-like-count-down 360ms ease-out;
}

@keyframes comment-heart-like {
  0% { transform: scale(1); }
  45% { transform: scale(1.35); }
  72% { transform: scale(0.92); }
  100% { transform: scale(1); }
}

@keyframes comment-heart-unlike {
  0% { transform: scale(1); }
  48% { transform: scale(0.72); }
  76% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes comment-heart-burst {
  0% { opacity: 0; transform: scale(0.4); }
  35% { opacity: 0.8; }
  100% { opacity: 0; transform: scale(1.35); }
}

@keyframes comment-like-count-up {
  0% { transform: translateY(0); }
  45% { transform: translateY(-3px); }
  100% { transform: translateY(0); }
}

@keyframes comment-like-count-down {
  0% { transform: translateY(0); }
  45% { transform: translateY(3px); }
  100% { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .comment-like-button.is-liking svg,
  .comment-like-button.is-unliking svg,
  .comment-like-button.is-liking::after,
  .comment-like-button.is-liking .comment-like-count,
  .comment-like-button.is-unliking .comment-like-count {
    animation: none;
  }
}

.comment-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
  text-indent: 0;
}

/* 热度标签和评论计数 */
.comment-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
  margin-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.destiny-choice, .destiny-confirmed {
  margin: var(--spacing-xl) 0 var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid rgba(196, 92, 62, 0.28);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgba(196, 92, 62, 0.08), var(--color-surface));
}
.choice-kicker { color: var(--color-primary); font-size: 12px; letter-spacing: .08em; margin-bottom: var(--spacing-xs); }
.destiny-choice h3 { color: var(--color-text); font-size: var(--font-size-lg); margin-bottom: var(--spacing-sm); }
.choice-prompt { color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.7; margin-bottom: var(--spacing-md); }
.choice-options { display: grid; gap: var(--spacing-sm); }
.choice-option { text-align: left; padding: var(--spacing-md); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); }
.choice-option strong, .choice-option span { display: block; }
.choice-option strong { color: var(--color-primary); margin-bottom: 4px; }
.choice-option span { color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }
.choice-option:disabled { opacity: .55; }
.destiny-confirmed { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); color: var(--color-primary); }

.story-completion {
  display: flex;
  justify-content: center;
  padding: var(--spacing-xl) 0 calc(var(--spacing-xl) + 28px);
}

.completion-btn {
  min-width: min(100%, 240px);
  padding: 12px 20px;
  border: 1px solid rgba(196, 92, 62, 0.28);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-sm);
  font-weight: 600;
  box-shadow: 0 8px 20px rgba(196, 92, 62, 0.16);
}

.completion-btn:active {
  transform: translateY(1px);
}

.completion-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}

.heat-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.heat-1 {
  background: rgba(139, 129, 120, 0.12);
  color: #8B8178;
}

.heat-2 {
  background: rgba(196, 92, 62, 0.1);
  color: #C45C3E;
}

.heat-3 {
  background: rgba(220, 60, 40, 0.12);
  color: #DC3C28;
}

.comment-count-text {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.chapter-nav {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-lg) 0;
  margin-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

.nav-btn {
  padding: 10px 20px;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
}

/* 底部进度条 */
.progress-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  background: transparent;
  border-top: 1px solid var(--color-border);
}

.progress-track {
  flex: 1;
  height: 3px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  min-width: 36px;
  text-align: right;
}

/* 设置面板 */
.settings-panel {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-lg) var(--spacing-md);
  padding-bottom: calc(var(--spacing-lg) + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.setting-row:last-child {
  margin-bottom: 0;
}

.setting-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  width: 40px;
  flex-shrink: 0;
}

.setting-label-wide {
  width: 64px;
}

.comment-card,
.chapter-nav,
.comment-summary,
.destiny-confirmed {
  break-inside: avoid;
}

.size-btn {
  width: 36px;
  height: 36px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.size-value {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  min-width: 30px;
  text-align: center;
}

.brightness-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  outline: none;
}

.brightness-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
}

/* 目录弹层 */
.toc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toc-panel {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  width: 90%;
  max-width: 400px;
  max-height: 70vh;
  overflow-y: auto;
}

.toc-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--spacing-md);
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.toc-item {
  padding: var(--spacing-md);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-align: left;
  border-radius: var(--radius-sm);
}

.toc-item:active {
  background: var(--color-bg);
}

.toc-item.active {
  color: var(--color-primary);
  font-weight: 600;
  background: rgba(214, 120, 90, 0.1);
}

/* 亮度遮罩 */
.brightness-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  pointer-events: none;
  z-index: 50;
}

/* 错误状态 */
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  color: var(--color-text-secondary);
}

.retry-btn {
  padding: 10px 24px;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  color: #fff;
}

/* 过渡动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0;
}
</style>
