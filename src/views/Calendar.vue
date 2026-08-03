<template>
  <div class="calendar-page page">
    <!-- 顶部 -->
    <header class="page-header">
      <h1>日记</h1>
      <button class="search-btn" @click="toggleSearch">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </button>
    </header>

    <!-- F6 修复：搜索输入框 -->
    <div v-if="showSearch" class="search-box">
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜索日记内容..."
        class="search-input"
      />
      <button v-if="searchKeyword" class="search-clear" @click="searchKeyword = ''">✕</button>
    </div>

    <!-- F6 修复：搜索结果 -->
    <div v-if="searchKeyword.trim()" class="search-results">
      <p v-if="searchResults.length === 0" class="no-result">未找到匹配的日记</p>
      <div
        v-for="item in searchResults"
        :key="item.dateStr"
        class="search-result-item"
        @click="selectDay({ dateStr: item.dateStr }); searchKeyword = ''; showSearch = false"
      >
        <span class="result-date">{{ item.dateStr }}</span>
        <span class="result-text">{{ (item.diary.raw_text || '').slice(0, 50) }}...</span>
      </div>
    </div>

    <!-- F6 修复：loading 状态 -->
    <div v-if="loading" class="calendar-loading">
      <div class="loading-spinner" />
      <p>加载中...</p>
    </div>

    <!-- 筛选标签 -->
    <div v-if="!loading && !searchKeyword.trim()" class="filter-tags">
      <button
        v-for="f in filters"
        :key="f.key"
        class="filter-tag"
        :class="{ active: activeFilter === f.key }"
        @click="activeFilter = f.key"
      >{{ f.label }}</button>
    </div>

    <div v-if="!loading && !searchKeyword.trim()" class="calendar-overview-wrap">
      <MonthlyOverview
        :year="currentYear"
        :month="currentMonth"
        :diaries-by-date="diariesByDate"
        :selected-date="selectedDate"
        :dim-date="isDateDimmed"
        @change-month="changeMonth"
        @select-day="selectDay"
      />
    </div>

    <!-- 选中日期的日记卡片 -->
    <div v-if="selectedDiary" class="diary-card">
      <div class="diary-card-header">
        <span class="diary-date">{{ selectedDateLabel }}</span>
        <span v-if="selectedDiary.hasSegment" class="diary-tag">已生成 {{ selectedDiary.chapterLabel || '故事' }}</span>
      </div>
      <div class="diary-card-body">
        <span class="diary-mood">
          {{ getMoodOption(selectedDiary.mood).emoji }} {{ getMoodOption(selectedDiary.mood).label }}
          · {{ selectedDiary.weather ? getWeatherOption(selectedDiary.weather).emoji + ' ' + getWeatherOption(selectedDiary.weather).label : '天气未记录' }}
        </span>
        <h3 class="diary-title">{{ diaryTitle }}</h3>
        <p class="diary-summary">{{ diarySummary }}</p>
      </div>
      <button class="diary-link" @click="viewReference">查看对照 →</button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="selectedDate" class="empty-card">
      <p class="empty-text">该日无日记记录</p>
      <button class="write-btn" @click="goWrite">写日记</button>
    </div>

    <!-- FAB 写日记按钮 -->
    <button class="fab" @click="goWrite">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { DiaryRepository } from '@/db/repositories/DiaryRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import MonthlyOverview from '@/components/MonthlyOverview.vue'
import {
  formatCalendarDate,
  diaryTimestampToLocalDateKey,
  shiftCalendarMonth
} from '@/features/diary/monthCalendar.js'
import { getMoodOption, getWeatherOption } from '@/features/diary/moodWeatherOptions.js'

const router = useRouter()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth()) // 0-indexed
const selectedDate = ref('')
const diariesByDate = ref(new Map()) // dateStr -> diary
const activeFilter = ref('diary')
const showSearch = ref(false)
const searchKeyword = ref('')
const loading = ref(true)

const filters = [
  { key: 'diary', label: '有日记' },
  { key: 'generated', label: '已生成' },
  { key: 'both', label: '两者' }
]

function isDateDimmed(day) {
  if (!day.currentMonth) return false
  if (activeFilter.value === 'diary') return !day.diary
  if (activeFilter.value === 'generated') return !day.diary?.hasSegment
  if (activeFilter.value === 'both') return !(day.diary && day.diary.hasSegment)
  return false
}

const selectedDiary = computed(() => {
  if (!selectedDate.value) return null
  return diariesByDate.value.get(selectedDate.value) || null
})

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  const [y, m, d] = selectedDate.value.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${Number(m)}月${Number(d)}日·${weeks[date.getDay()]}`
})

const diaryTitle = computed(() => {
  const raw = selectedDiary.value?.raw_text || ''
  if (!raw) return '无标题'
  // 取第一行或前 10 字
  const firstLine = raw.split('\n')[0]
  return firstLine.slice(0, 12) + (firstLine.length > 12 ? '...' : '')
})

const diarySummary = computed(() => {
  const raw = selectedDiary.value?.raw_text || ''
  if (!raw) return ''
  return raw.replace(/\n/g, ' ').slice(0, 80) + (raw.length > 80 ? '...' : '')
})

function changeMonth(delta) {
  const shifted = shiftCalendarMonth(currentYear.value, currentMonth.value, delta)
  currentYear.value = shifted.year
  currentMonth.value = shifted.month
}

function selectDay(day) {
  selectedDate.value = day.dateStr
}

function viewReference() {
  if (!selectedDiary.value) return
  router.push({
    path: '/preview',
    query: { day: selectedDiary.value.day_number, diary: selectedDiary.value.id }
  })
}

function goWrite() {
  router.push('/diary/write')
}

// F6 修复：搜索功能
function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) searchKeyword.value = ''
}

// F6 修复：搜索结果列表
const searchResults = computed(() => {
  if (!searchKeyword.value.trim()) return []
  const keyword = searchKeyword.value.trim().toLowerCase()
  const results = []
  for (const [dateStr, diary] of diariesByDate.value) {
    const rawText = (diary.raw_text || '').toLowerCase()
    if (rawText.includes(keyword)) {
      results.push({ dateStr, diary })
    }
  }
  return results.sort((a, b) => b.dateStr.localeCompare(a.dateStr))
})

onMounted(async () => {
  // 加载当月日记
  loading.value = true
  try {
    const allDiaries = await DiaryRepository.getAll()
    const map = new Map()
    for (const d of allDiaries) {
      const dateStr = diaryTimestampToLocalDateKey(d.created_at)
      if (dateStr) {
        // 检查是否有关联的段落
        let hasSegment = false
        let chapterLabel = ''
        try {
            const seg = await SegmentRepository.getByDay(d.day_number)
            if (seg) {
              hasSegment = true
              // 5.3 修复：动态获取章节号
              if (seg.chapter_id) {
                const ch = await ChapterRepository.getById(seg.chapter_id)
                if (ch) {
                  chapterLabel = ch.chapter_number === 0 ? '序章' : `第${ch.chapter_number}章`
                }
              }
            }
          } catch (e) { /* ignore */ }
        map.set(dateStr, { ...d, hasSegment, chapterLabel })
      }
    }
    diariesByDate.value = map

    // 默认选中今天
    const today = new Date()
    selectedDate.value = formatCalendarDate(today.getFullYear(), today.getMonth(), today.getDate())
  } catch (e) {
    console.error('[Calendar] 加载失败:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #E0DCD5;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

.search-clear {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}

.search-results {
  padding: 0 16px 16px;
  max-height: 300px;
  overflow-y: auto;
}

.no-result {
  text-align: center;
  color: #999;
  padding: 20px;
  font-size: 14px;
}

.search-result-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border-bottom: 1px solid #F0EDE8;
  cursor: pointer;
}

.search-result-item:active { background: #F8F6F3; }

.result-date {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.result-text {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
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

.calendar-page {
  background: #FFFFFF;
  min-height: 100vh;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-md) var(--spacing-sm);
}

.page-header h1 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: #333333;
}

.search-btn {
  background: transparent;
  color: #666666;
  padding: 4px;
}

/* 筛选标签 */
.filter-tags {
  display: flex;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.filter-tag {
  padding: 6px 16px;
  font-size: var(--font-size-xs);
  color: #666666;
  background: #F0F0F0;
  border-radius: 999px;
  transition: all 0.2s;
}

.filter-tag.active {
  background: #C45C3E;
  color: #FFFFFF;
}

.calendar-overview-wrap {
  margin: 0 var(--spacing-md) var(--spacing-md);
  padding: 14px 12px;
  border: 1px solid #efe5df;
  border-radius: 20px;
  background: #fffdfb;
  box-shadow: 0 8px 24px rgba(85, 58, 46, 0.06);
}

/* 日记卡片 */
.diary-card {
  margin: 0 var(--spacing-md);
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
}

.diary-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.diary-date {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #333333;
}

.diary-tag {
  font-size: 11px;
  color: #5A8F5A;
  background: #E8F5E9;
  padding: 2px 8px;
  border-radius: 4px;
}

.diary-card-body {
  margin-bottom: var(--spacing-sm);
}

.diary-mood {
  font-size: var(--font-size-sm);
  color: #5A8F5A;
  margin-bottom: 4px;
  display: block;
}

.diary-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #333333;
  margin-bottom: 4px;
}

.diary-summary {
  font-size: var(--font-size-sm);
  color: #888888;
  line-height: 1.6;
}

.diary-link {
  background: transparent;
  color: #C45C3E;
  font-size: var(--font-size-sm);
  font-weight: 500;
  padding: 0;
}

/* 空状态 */
.empty-card {
  margin: 0 var(--spacing-md);
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
  margin-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
}

.empty-text {
  font-size: var(--font-size-sm);
  color: #999999;
  margin-bottom: var(--spacing-md);
}

.write-btn {
  padding: 8px 24px;
  background: #C45C3E;
  color: #FFFFFF;
  font-size: var(--font-size-sm);
  border-radius: var(--radius-sm);
}

/* FAB 按钮 */
.fab {
  position: fixed;
  right: max(16px, calc((100vw - 480px) / 2 + 16px));
  bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: #FFFFFF;
  background: #C45C3E;
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(196, 92, 62, 0.3);
}

.fab:active {
  transform: scale(0.95);
}
</style>
