<template>
  <div class="progress-page page">
    <!-- 顶部 -->
    <header class="page-header">
      <h1>连载进度</h1>
    </header>

    <!-- F5 修复：loading 状态 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner" />
      <p>加载中...</p>
    </div>

    <!-- F5 修复：错误状态 -->
    <div v-else-if="loadError" class="error-state">
      <p>{{ loadError }}</p>
      <button class="retry-btn" @click="loadData">重试</button>
    </div>

    <div v-else class="page-content">
      <!-- 圆环进度 -->
      <div class="progress-ring-section">
        <div class="progress-ring">
          <svg viewBox="0 0 120 120" class="ring-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#E8E4E0" stroke-width="8" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke="#C45C3E" stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="ringCircumference"
              :stroke-dashoffset="ringOffset"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="ring-center">
            <span class="ring-number">{{ currentDay }}</span>
            <span class="ring-label">天 / {{ totalDays }} 天</span>
          </div>
        </div>
        <p class="ring-tagline">你的传奇正在书写中</p>
      </div>

      <!-- 统计网格 -->
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-number accent">{{ streak }}</span>
          <span class="stat-label">连续写作</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ chaptersDone }}</span>
          <span class="stat-label">已生成章节</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ diaryCount }}</span>
          <span class="stat-label">心情记录</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{{ formatNumber(totalWords) }}</span>
          <span class="stat-label">总字数</span>
        </div>
      </div>

      <!-- 心情趋势 -->
      <div class="mood-section">
        <h2 class="section-title">心情趋势</h2>
        <div class="mood-chart">
          <div v-for="(d, i) in moodWeek" :key="i" class="mood-bar-col">
            <div class="mood-bar-track">
              <div
                class="mood-bar-fill"
                :style="{ height: d.height + '%', background: d.color }"
              />
            </div>
            <span class="mood-day-label">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- 章节时间线 -->
      <div class="timeline-section">
        <h2 class="section-title">章节进度</h2>
        <div class="timeline">
          <div
            v-for="(ch, idx) in chapters"
            :key="ch.chapter_number"
            class="timeline-item"
            :class="ch.statusType"
          >
            <div class="timeline-marker">
              <span v-if="ch.statusType === 'done'" class="marker-dot done" />
              <span v-else-if="ch.statusType === 'current'" class="marker-dot current" />
              <span v-else-if="ch.statusType === 'locked'" class="marker-dot locked">🔒</span>
              <span v-else class="marker-dot pending" />
              <span v-if="idx < chapters.length - 1" class="marker-line" />
            </div>
            <div class="timeline-content">
              <span class="timeline-title">{{ ch.title }}</span>
              <span v-if="ch.statusType === 'done'" class="timeline-meta">{{ formatNumber(ch.wordCount) }}字 · {{ ch.date }}</span>
              <span v-else-if="ch.statusType === 'current'" class="timeline-meta current-meta">进行中</span>
              <span v-else-if="ch.statusType === 'locked'" class="timeline-meta">未解锁</span>
              <span v-else class="timeline-meta">待生成</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { UserRepository } from '@/db/repositories/UserRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'
import { DiaryRepository } from '@/db/repositories/DiaryRepository'
import worldJson from '@/config/worlds/lord_of_mysteries/world.json'

const user = ref({})
const chapters = ref([])
const totalWords = ref(0)
const diaryCount = ref(0)
const streak = ref(0)
const loading = ref(true)
const loadError = ref('')
const moodWeek = ref([])

const currentDay = computed(() => user.value.current_day || 0)
const totalDays = computed(() => user.value.duration_days || worldJson.default_duration || 90)
const chaptersDone = computed(() => chapters.value.filter(c => c.statusType === 'done').length)

const ringCircumference = 2 * Math.PI * 52
const ringOffset = computed(() => {
  const progress = totalDays.value > 0 ? currentDay.value / totalDays.value : 0
  return ringCircumference * (1 - progress)
})

function formatNumber(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

// 心情颜色映射
const MOOD_COLORS = {
  good: '#8A9A6B',
  ok: '#B8C4A7',
  calm: '#C4D4B8',
  low: '#D4A59A',
  tired: '#E8E4E0'
}

// F5 修复：提取为可复用的 loadData 函数
async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    user.value = await UserRepository.get()
    const allChapters = await ChapterRepository.getAll()
    const allDiaries = await DiaryRepository.getAll()
    diaryCount.value = allDiaries.length

    // 5.2 修复：计算连续写作天数（基于 day_number 连续递增）
    if (allDiaries.length > 0) {
      const dayNumbers = allDiaries
        .map(d => d.day_number)
        .filter(n => n != null)
        .sort((a, b) => b - a) // 降序
      let streakCount = 0
      let expected = dayNumbers[0] // 从最近的一天开始往前数
      for (const dayNum of dayNumbers) {
        if (dayNum === expected) {
          streakCount++
          expected--
        } else if (dayNum < expected) {
          break // 出现间隔，中断
        }
      }
      streak.value = streakCount
    }

    // 心情趋势：取最近7天日记的心情
    const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
    const today = new Date()
    const dayOfWeek = (today.getDay() + 6) % 7 // 周一=0

    const moodData = []
    for (let i = 0; i < 7; i++) {
      const offset = i - dayOfWeek
      const date = new Date(today)
      date.setDate(today.getDate() + offset)
      const dateStr = date.toISOString().slice(0, 10)

      // 查找该天的日记
      const diary = allDiaries.find(d => {
        if (!d.created_at) return false
        return d.created_at.slice(0, 10) === dateStr
      })

      let height = 0
      let color = '#E8E4E0'
      if (diary) {
        const mood = diary.mood || 'ok'
        height = { good: 90, ok: 70, calm: 60, low: 40, tired: 30 }[mood] || 50
        color = MOOD_COLORS[mood] || MOOD_COLORS.ok
      } else {
        height = 20
      }

      moodData.push({ label: weekLabels[i], height, color })
    }
    moodWeek.value = moodData

    // 章节时间线
    chapters.value = []
    totalWords.value = 0
    for (const ch of allChapters) {
      const segments = await SegmentRepository.getByChapter(ch.id)
      const wordCount = segments.reduce((sum, s) => sum + (s.content?.length || 0), 0)
      totalWords.value += wordCount

      let statusType = 'pending'
      if (ch.status === 'completed') statusType = 'done'
      else if (ch.status === 'ongoing' && segments.length > 0) statusType = 'current'
      else if (ch.status === 'ongoing') statusType = 'pending'

      if (ch.chapter_number === 0 && wordCount > 0) statusType = 'done'

      // F5 修复：使用章节的 completed_at 作为日期
      let dateLabel = ''
      if (ch.completed_at) {
        const d = new Date(ch.completed_at)
        dateLabel = `${d.getMonth() + 1}月${d.getDate()}日`
      }

      chapters.value.push({
        chapter_number: ch.chapter_number,
        title: ch.chapter_number === 0 ? `序章·${ch.title}` : `第${ch.chapter_number}章·${ch.title}`,
        statusType,
        wordCount,
        date: dateLabel
      })
    }
  } catch (e) {
    console.error('[Progress] 加载失败:', e)
    loadError.value = '数据加载失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.progress-page {
  background: #F8F6F3;
  min-height: 100vh;
}

.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #999;
  font-size: 14px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #E8E4E0;
  border-top-color: #C45C3E;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.retry-btn {
  margin-top: 12px;
  padding: 8px 24px;
  background: #C45C3E;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
}

.page-header {
  padding: var(--spacing-lg) var(--spacing-md) var(--spacing-sm);
}

.page-header h1 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: #333333;
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
}

/* 圆环进度 */
.progress-ring-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-lg) 0;
}

.progress-ring {
  position: relative;
  width: 160px;
  height: 160px;
}

.ring-svg {
  width: 100%;
  height: 100%;
}

.ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ring-number {
  font-size: 36px;
  font-weight: 700;
  color: #333333;
  line-height: 1;
}

.ring-label {
  font-size: 13px;
  color: #888888;
  margin-top: 4px;
}

.ring-tagline {
  font-size: var(--font-size-sm);
  color: #888888;
  margin-top: var(--spacing-md);
}

/* 统计网格 */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.stat-card {
  background: #FFFFFF;
  border-radius: var(--radius-md);
  padding: var(--spacing-lg) var(--spacing-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #333333;
  line-height: 1;
}

.stat-number.accent {
  color: #C45C3E;
}

.stat-label {
  font-size: 13px;
  color: #888888;
}

/* 心情趋势 */
.mood-section {
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #333333;
  margin-bottom: var(--spacing-md);
}

.mood-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-xs);
  height: 100px;
  background: #FFFFFF;
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.mood-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.mood-bar-track {
  width: 100%;
  max-width: 24px;
  height: 64px;
  display: flex;
  align-items: flex-end;
}

.mood-bar-fill {
  width: 100%;
  border-radius: 4px;
  transition: height 0.3s ease;
}

.mood-day-label {
  font-size: 11px;
  color: #888888;
}

/* 章节时间线 */
.timeline-section {
  padding: 0 var(--spacing-md);
}

.timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: var(--spacing-md);
  min-height: 56px;
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}

.marker-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.marker-dot.done {
  background: #8A9A6B;
}

.marker-dot.current {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #C45C3E;
  background: transparent;
}

.marker-dot.locked {
  font-size: 10px;
  opacity: 0.4;
  width: auto;
  height: auto;
}

.marker-dot.pending {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #CCCCCC;
  background: transparent;
}

.marker-line {
  width: 2px;
  flex: 1;
  background: #DDDDDD;
  margin-top: 2px;
  margin-bottom: 2px;
  min-height: 24px;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: var(--spacing-md);
}

.timeline-title {
  font-size: var(--font-size-sm);
  color: #333333;
  font-weight: 500;
}

.timeline-meta {
  font-size: 12px;
  color: #888888;
}

.timeline-meta.current-meta {
  color: #C45C3E;
}

.timeline-item.locked .timeline-title,
.timeline-item.locked .timeline-meta {
  color: #BBBBBB;
}
</style>
