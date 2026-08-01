<template>
  <div class="home">
    <!-- 顶部栏：App名 + 章节信息 -->
    <header class="top-bar">
      <span class="app-title">My Story</span>
      <span class="chapter-info" v-if="currentChapter">
        第{{ currentChapter.chapter_number === 0 ? '序章' : currentChapter.chapter_number + '章' }}·{{ currentChapter.title || '' }}
      </span>
    </header>

    <!-- 进度胶囊 -->
    <div class="progress-bar">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <span class="progress-pill">{{ user.current_day || 0 }}/{{ user.duration_days || 90 }}天</span>
    </div>

    <!-- 故事完结提示 -->
    <div v-if="isEnded" class="ended-banner">
      故事已完结 · 感谢陪伴 {{ user.hero_name || '你' }} 走完全程
    </div>

    <!-- 主内容区 -->
    <main class="content">
      <LoadingSpinner v-if="loading" tip="加载中..." />

      <div v-else-if="error" class="error-state">
        <p class="error-tip">{{ error }}</p>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!latestSegment" class="empty-state">
        <p class="empty-tip">{{ emptyTip }}</p>
      </div>

      <!-- 当前章节卡片 -->
      <div v-else class="current-card" @click="continueReading">
        <p class="card-label">当前章节</p>
        <h2 class="card-title">
          {{ currentChapter?.chapter_number === 0 ? '序章' : '第' + currentChapter?.chapter_number + '章' }}
          <span v-if="currentChapter?.title">· {{ currentChapter.title }}</span>
        </h2>
        <p class="card-summary">{{ storySummary }}</p>
        <button class="continue-btn">
          继续阅读
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>

      <!-- 章节列表 -->
      <div class="chapter-section">
        <div class="chapter-filters">
          <button
            v-for="f in filters"
            :key="f.key"
            class="filter-tag"
            :class="{ active: activeFilter === f.key }"
            @click="activeFilter = f.key"
          >{{ f.label }}</button>
        </div>

        <div class="chapter-list">
          <div
            v-for="ch in filteredChapters"
            :key="ch.id"
            class="chapter-item"
            :class="ch.statusType"
            @click="jumpChapter(ch)"
          >
            <span class="ch-icon">
              <span v-if="ch.statusType === 'done'" class="icon-check">✓</span>
              <span v-else-if="ch.statusType === 'current'" class="icon-current" />
              <span v-else-if="ch.statusType === 'locked'" class="icon-lock">🔒</span>
              <span v-else class="icon-pending" />
            </span>
            <div class="ch-info">
              <span class="ch-title">{{ ch.chapter_number === 0 ? '序章' : '第' + ch.chapter_number + '章' }}<span v-if="ch.title">·{{ ch.title }}</span></span>
              <span class="ch-meta">
                <template v-if="ch.statusType === 'done'">{{ ch.wordCount }}字</template>
                <template v-else-if="ch.statusType === 'current'">进行中</template>
                <template v-else-if="ch.statusType === 'locked'">未解锁</template>
                <template v-else>待生成</template>
              </span>
            </div>
            <span class="ch-arrow">›</span>
          </div>
        </div>
      </div>
    </main>

    <!-- 记日记悬浮按钮 -->
    <button class="fab" :disabled="actionDisabled" @click="goDiary">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>{{ actionLabel }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const router = useRouter()
const route = useRoute()

const user = ref({ hero_name: '', current_chapter: 0, current_day: 0, duration_days: 90 })
const chapters = ref([])
const latestSegment = ref(null)
const currentChapterId = ref(null)
const loading = ref(true)
const error = ref('')
const activeFilter = ref('all')

const isEnded = computed(() => route.query.ended === '1')
const currentChapter = computed(() =>
  chapters.value.find(c => c.id === currentChapterId.value) || null
)

const progressPercent = computed(() => {
  const total = user.value.duration_days || 90
  const current = user.value.current_day || 0
  return Math.min(100, (current / total) * 100)
})

const storySummary = computed(() => {
  const raw = latestSegment.value?.content || ''
  if (!raw) return '暂无内容'
  // 取前 120 字作为摘要
  return raw.replace(/\n/g, ' ').slice(0, 120) + '...'
})

// 章节状态计算
const chaptersWithStatus = computed(() => {
  return chapters.value.map(ch => {
    let statusType = 'pending'
    // 5.1 修复：保留 onMounted 中从 segments 计算的 wordCount
    let wordCount = ch.wordCount || 0
    if (ch.status === 'completed') statusType = 'done'
    else if (ch.status === 'ongoing' && ch.id === currentChapterId.value) statusType = 'current'
    else if (ch.status === 'ongoing') statusType = 'done' // 进行中但有内容也算已读
    else if (ch.chapter_number > (user.value.current_chapter || 0) + 1) statusType = 'locked'
    return { ...ch, statusType, wordCount }
  })
})

const filters = [
  { key: 'all', label: '全部' },
  { key: 'done', label: '已读' },
  { key: 'current', label: '当前' },
  { key: 'pending', label: '待生成' }
]

const filteredChapters = computed(() => {
  if (activeFilter.value === 'all') return chaptersWithStatus.value
  return chaptersWithStatus.value.filter(c => c.statusType === activeFilter.value)
})

const todayDone = computed(() => {
  const seg = latestSegment.value
  const u = user.value
  if (!seg || !u) return false
  // 6.1 修复：只有 finalized 才算"今日已更新"；
  // draft_ready 状态需要用户去定稿，FAB 应可点击
  return seg.day_number === u.current_day && seg.status === 'finalized'
})
const hasDraft = computed(() => {
  const seg = latestSegment.value
  const u = user.value
  if (!seg || !u) return false
  // R1 修复：draft_ready 段落的 day_number = current_day + 1（天数在 finalize 时才递增）
  return seg.day_number === (u.current_day || 0) + 1 && seg.status === 'draft_ready'
})

const actionDisabled = computed(() => (todayDone.value && !hasDraft.value) || isEnded.value)
const actionLabel = computed(() => {
  if (isEnded.value) return '已完结'
  if (hasDraft.value) return '待定稿'
  return todayDone.value ? '今日已更新' : '记日记'
})

const emptyTip = computed(() =>
  user.value.current_day === 0
    ? '记录你的第一天，开启你的传奇'
    : '本章暂无内容，记下今天开启新篇章'
)

async function loadChapter(chapterId) {
  currentChapterId.value = chapterId
  try {
    const segs = await SegmentRepository.getByChapter(chapterId)
    latestSegment.value = segs.length ? segs[segs.length - 1] : null
  } catch (e) {
    latestSegment.value = null
  }
}

function continueReading() {
  if (currentChapter.value) {
    router.push('/reader/' + currentChapter.value.id)
  }
}

function jumpChapter(ch) {
  // 6.1 修复：锁定章节不允许跳转
  if (ch.statusType === 'locked') return
  router.push('/reader/' + ch.id)
}

function goDiary() {
  if (actionDisabled.value) return
  // 6.1 修复：draft_ready 状态跳转到预览页定稿，而非写新日记
  if (hasDraft.value && latestSegment.value) {
    router.push({
      path: '/preview',
      query: { day: latestSegment.value.day_number }
    })
    return
  }
  router.push('/diary/write')
}

onMounted(async () => {
  try {
    user.value = await UserRepository.get()
    chapters.value = await ChapterRepository.getAll()
    // 5.1 修复：从 segments 计算每章字数（chapters.content 可能为空）
    for (const ch of chapters.value) {
      try {
        const segs = await SegmentRepository.getByChapter(ch.id)
        ch.wordCount = segs.reduce((sum, s) => sum + (s.content?.length || 0), 0)
      } catch (e) {
        ch.wordCount = ch.content?.length || 0
      }
    }
    const cur = await ChapterRepository.getCurrent()
    if (cur) {
      await loadChapter(cur.id)
    } else if (chapters.value.length) {
      await loadChapter(chapters.value[chapters.value.length - 1].id)
    }
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

/* 顶部栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  padding-top: calc(var(--spacing-md) + env(safe-area-inset-top, 0px));
}

.app-title {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}

.chapter-info {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 进度条 */
.progress-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md) var(--spacing-md);
}

.progress-track {
  flex: 1;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.5s ease;
}

.progress-pill {
  font-size: var(--font-size-xs);
  color: var(--color-text);
  background: var(--color-surface-2);
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

/* 完结提示 */
.ended-banner {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-success);
  background: rgba(107, 142, 90, 0.12);
}

/* 内容区 */
.content {
  flex: 1;
  padding: 0 var(--spacing-md);
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 80px);
}

/* 空状态 / 错误 */
.empty-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  text-align: center;
}

.empty-tip {
  font-size: var(--font-size-lg);
  color: var(--color-text);
  font-weight: 500;
}

.error-tip {
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

/* 当前章节卡片 */
.current-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
  cursor: pointer;
  transition: transform 0.2s;
}

.current-card:active {
  transform: scale(0.98);
}

.card-label {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.card-title {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-card-text);
  margin-bottom: var(--spacing-sm);
}

.card-summary {
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--color-card-text);
  opacity: 0.7;
  margin-bottom: var(--spacing-md);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.continue-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 8px 20px;
  background: var(--color-primary);
  color: var(--color-card-text);
  font-size: var(--font-size-sm);
  font-weight: 600;
  border-radius: var(--radius-sm);
}

/* 章节列表区 */
.chapter-section {
  margin-top: var(--spacing-sm);
}

.chapter-filters {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.filter-tag {
  padding: 4px 14px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  background: transparent;
  border-radius: 999px;
  transition: all 0.2s;
}

.filter-tag.active {
  background: var(--color-primary);
  color: var(--color-text);
}

.chapter-list {
  display: flex;
  flex-direction: column;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.chapter-item:last-child {
  border-bottom: none;
}

.chapter-item:active {
  opacity: 0.7;
}

/* 状态图标 */
.ch-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-check {
  color: var(--color-text-secondary);
  font-size: 16px;
}

.icon-current {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-primary);
}

.icon-lock {
  font-size: 12px;
  opacity: 0.4;
}

.icon-pending {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--color-text-tertiary);
}

.ch-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ch-title {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.ch-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.chapter-item.current .ch-title {
  color: var(--color-primary);
  font-weight: 600;
}

.chapter-item.current .ch-meta {
  color: var(--color-primary);
}

.chapter-item.locked .ch-title,
.chapter-item.locked .ch-meta {
  color: var(--color-text-tertiary);
}

.ch-arrow {
  color: var(--color-text-tertiary);
  font-size: 18px;
}

/* FAB 记日记按钮 */
.fab {
  position: fixed;
  right: max(16px, calc((100vw - 480px) / 2 + 16px));
  bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(232, 168, 140, 0.3);
}

.fab:active:not(:disabled) {
  transform: scale(0.96);
}

.fab:disabled {
  background: var(--color-border);
  color: var(--color-text-secondary);
  box-shadow: none;
}
</style>
