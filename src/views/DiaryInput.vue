<template>
  <div class="diary-input">
    <!-- 顶部栏 -->
    <header class="top-bar">
      <button class="top-btn cancel" @click="goBack">取消</button>
      <span class="date-text">{{ dateLabel }}</span>
      <button class="top-btn done" :disabled="!canGenerate" @click="generate">{{ generating ? '...' : '完成' }}</button>
    </header>

    <!-- 主体 -->
    <div class="diary-body">
      <!-- 心情 + 天气 -->
      <div class="mood-weather">
        <button class="mood-picker" @click="cycleMood">
          <span class="mood-emoji">{{ moodEmoji }}</span>
          <span class="mood-label">{{ moodLabel }}</span>
        </button>
        <div class="weather-info">
          <span class="weather-icon">{{ weatherIcon }}</span>
          <span class="weather-text">{{ weatherText }}</span>
        </div>
      </div>

      <!-- 引导标题 -->
      <div class="guide-header">
        <span class="guide-title">今日引导</span>
        <span class="guide-sub">· 占卜家途径</span>
      </div>

      <!-- 引导问题卡片 -->
      <div class="question-cards">
        <div v-for="(q, i) in currentQuestions" :key="i" class="q-card">
          <div class="q-header">
            <span class="q-icon">{{ q.icon }}</span>
            <span class="q-text">{{ q.text }}</span>
          </div>
          <textarea
            v-model="answers[i]"
            class="q-input"
            :placeholder="'点击填写...'"
            rows="2"
            @input="onAnswerInput"
          />
        </div>
      </div>

      <!-- 换问题 + 字数 -->
      <div class="q-actions">
        <button class="change-btn" @click="changeQuestions">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          换问题
        </button>
        <span class="char-count">{{ totalCharCount }} 字</span>
      </div>

      <!-- 自由记录区 -->
      <div class="free-section">
        <button class="free-toggle" @click="showFree = !showFree">
          <span class="free-toggle-text">也可以直接写下今天的自由记录...</span>
          <span class="free-arrow" :class="{ expanded: showFree }">›</span>
        </button>
        <textarea
          v-if="showFree"
          v-model="freeText"
          class="free-input"
          placeholder="今天做了什么？随意写写..."
          :maxlength="MAX_LENGTH"
          rows="4"
          @input="onFreeInput"
        />
      </div>

      <!-- 行为标签 -->
      <BehaviorTags v-model="tags" />

      <!-- 语音输入 -->
      <div class="voice-row">
        <VoiceInput @result="onVoiceResult" @error="onVoiceError" />
        <span v-if="voiceError" class="voice-error">{{ voiceError }}</span>
      </div>
    </div>

    <!-- 底部生成按钮 -->
    <footer class="footer">
      <p v-if="networkError" class="network-error">{{ networkError }}</p>
      <button
        class="generate-btn"
        :disabled="!canGenerate || generating"
        @click="generate"
      >
        {{ generating ? '生成中...' : '生成故事' }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { DiaryRepository } from '@/db/repositories/DiaryRepository'
import { UserRepository } from '@/db/repositories/UserRepository'
import BehaviorTags from '@/components/BehaviorTags.vue'
import VoiceInput from '@/components/VoiceInput.vue'

const router = useRouter()

const MAX_LENGTH = 5000
const VOICE_ERROR_MESSAGES = {
  E011: '当前环境不支持语音输入，请改用文字',
  E012: '语音识别出错，请重试或改用文字'
}

// 问题池（占卜家途径）
const QUESTION_POOL = [
  { icon: '🔮', text: '今天你遇到了什么"异常"？' },
  { icon: '🌙', text: '如果占卜今天的运势，会是什么？' },
  { icon: '⚡', text: '今天最有力量的瞬间？' },
  { icon: '💬', text: '入夜前最想说的一句话？' },
  { icon: '🗝️', text: '今天哪件事让你觉得是命运的暗示？' },
  { icon: '👁️', text: '今天有没有注意到什么不寻常的细节？' },
  { icon: '📖', text: '今天学到的最重要的一课？' },
  { icon: '🎭', text: '今天你扮演了什么角色？' },
  { icon: '🕯️', text: '今天内心最深的感受是什么？' },
  { icon: '🧭', text: '今天的方向感如何？是否找到了目标？' }
]

// 心情选项
const MOODS = [
  { key: 'good', emoji: '😊', label: '心情不错' },
  { key: 'ok', emoji: '😐', label: '还行' },
  { key: 'calm', emoji: '😌', label: '平静' },
  { key: 'low', emoji: '😔', label: '低落' },
  { key: 'tired', emoji: '😴', label: '疲惫' }
]

// 响应式状态
const dayNumber = ref(0)
const answers = ref(['', '', '', ''])
const freeText = ref('')
const tags = ref([])
const generating = ref(false)
const voiceError = ref('')
const networkError = ref('')
const existingDiary = ref(null)
const showFree = ref(false)
const moodIndex = ref(0)
const currentQuestions = ref([])
const weatherText = ref('22°C·晴')
const weatherIcon = ref('☀️')

// 日期标签
const dateLabel = computed(() => {
  const d = new Date()
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weeks[d.getDay()]}`
})

const moodEmoji = computed(() => MOODS[moodIndex.value].emoji)
const moodLabel = computed(() => MOODS[moodIndex.value].label)

const totalCharCount = computed(() => {
  const answersCount = answers.value.reduce((sum, a) => sum + a.length, 0)
  return answersCount + freeText.value.length
})

// 合并所有回答为日记原文
const combinedText = computed(() => {
  const parts = []
  currentQuestions.value.forEach((q, i) => {
    if (answers.value[i]?.trim()) {
      parts.push(`【${q.text}】\n${answers.value[i].trim()}`)
    }
  })
  if (freeText.value.trim()) {
    parts.push(`【自由记录】\n${freeText.value.trim()}`)
  }
  return parts.join('\n\n')
})

const canGenerate = computed(() => combinedText.value.trim().length > 0)

// 草稿 key
function draftKey() {
  return `diary_draft_${dayNumber.value}`
}

let saveTimer = null
let voiceErrorTimer = null

function onAnswerInput() {
  scheduleDraft()
}

function onFreeInput() {
  scheduleDraft()
}

function scheduleDraft() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (dayNumber.value > 0) {
      try {
        localStorage.setItem(draftKey(), JSON.stringify({
          answers: answers.value,
          freeText: freeText.value,
          mood: moodIndex.value,
          // 5.4 修复：保存 currentQuestions 以便恢复时回答与问题对应
          currentQuestions: currentQuestions.value
        }))
      } catch (e) { /* ignore */ }
    }
  }, 500)
}

function cycleMood() {
  moodIndex.value = (moodIndex.value + 1) % MOODS.length
  scheduleDraft()
}

function changeQuestions() {
  // 随机抽取 4 个不同的问题
  const pool = [...QUESTION_POOL]
  const selected = []
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    selected.push(pool.splice(idx, 1)[0])
  }
  currentQuestions.value = selected
  // 清空已有回答
  answers.value = ['', '', '', '']
  scheduleDraft()
}

function onVoiceResult(transcript) {
  // 语音结果追加到自由记录区
  showFree.value = true
  const remain = MAX_LENGTH - freeText.value.length
  if (remain <= 0) return
  freeText.value += transcript.slice(0, remain)
  onFreeInput()
}

function onVoiceError(code) {
  voiceError.value = VOICE_ERROR_MESSAGES[code] || '语音输入不可用，请改用文字'
  clearTimeout(voiceErrorTimer)
  voiceErrorTimer = setTimeout(() => {
    voiceError.value = ''
  }, 4000)
}

async function generate() {
  if (!canGenerate.value || generating.value) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    networkError.value = '需要网络连接才能生成故事'
    return
  }
  networkError.value = ''
  generating.value = true

  try {
    const diaryData = {
      day_number: dayNumber.value,
      raw_text: combinedText.value,
      behavior_tags: tags.value,
      is_blank_day: false,
      mood: MOODS[moodIndex.value].key
    }

    let diaryId
    if (existingDiary.value) {
      await DiaryRepository.update(existingDiary.value.id, diaryData)
      diaryId = existingDiary.value.id
    } else {
      diaryId = await DiaryRepository.create(diaryData)
    }

    try { localStorage.removeItem(draftKey()) } catch (e) { /* ignore */ }
    router.push({ path: '/preview', query: { day: dayNumber.value, diary: diaryId } })
  } catch (e) {
    console.error('[DiaryInput] 保存日记失败:', e)
    networkError.value = '保存失败，请重试（E009）'
    generating.value = false
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

onMounted(async () => {
  // 初始化 4 个问题
  changeQuestions()

  try {
    const u = await UserRepository.get()
    dayNumber.value = (u.current_day || 0) + 1
  } catch (e) {
    alert('数据加载失败，请重试')
    router.replace('/')
    return
  }

  // 恢复草稿
  try {
    const draft = localStorage.getItem(draftKey())
    if (draft) {
      const parsed = JSON.parse(draft)
      // 5.4 修复：优先恢复 currentQuestions，避免回答与新问题错位
      if (parsed.currentQuestions && Array.isArray(parsed.currentQuestions) && parsed.currentQuestions.length > 0) {
        currentQuestions.value = parsed.currentQuestions
      }
      if (parsed.answers) answers.value = parsed.answers
      if (parsed.freeText) { freeText.value = parsed.freeText; showFree.value = true }
      if (parsed.mood !== undefined) moodIndex.value = parsed.mood
    }
  } catch (e) { /* ignore */ }

  // 检查今日已记录
  try {
    const exist = await DiaryRepository.getByDay(dayNumber.value)
    if (exist) {
      existingDiary.value = exist
      // 如果已有内容但草稿为空，尝试解析回填
      if (!combinedText.value.trim() && exist.raw_text) {
        // 简单回填到自由记录
        freeText.value = exist.raw_text
        showFree.value = true
      }
      try { tags.value = JSON.parse(exist.behavior_tags || '[]') } catch { tags.value = [] }
      // 恢复 mood 状态（兼容旧数据无 mood 列的情况）
      if (exist.mood) {
        const moodObj = MOODS.findIndex(m => m.key === exist.mood)
        if (moodObj >= 0) moodIndex.value = moodObj
      }
    }
  } catch (e) {
    console.warn('[DiaryInput] 检查今日记录失败:', e)
  }

  // 尝试获取天气（简单实现：使用默认值，实际可接入天气 API）
  // weatherText 和 weatherIcon 已有默认值
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(voiceErrorTimer)
})
</script>

<style scoped>
.diary-input {
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

.top-btn {
  background: transparent;
  font-size: var(--font-size-sm);
  padding: 4px 8px;
}

.top-btn.cancel {
  color: var(--color-text-secondary);
}

.top-btn.done {
  color: var(--color-primary);
  font-weight: 600;
}

.top-btn.done:disabled {
  color: var(--color-text-tertiary);
}

.date-text {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text);
}

/* 主体 */
.diary-body {
  flex: 1;
  padding: 0 var(--spacing-md);
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 80px);
  overflow-y: auto;
}

/* 心情 + 天气 */
.mood-weather {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  margin-bottom: var(--spacing-md);
}

.mood-picker {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: transparent;
}

.mood-emoji {
  font-size: 24px;
}

.mood-label {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.weather-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.weather-icon {
  font-size: 16px;
}

.weather-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 引导标题 */
.guide-header {
  margin-bottom: var(--spacing-md);
}

.guide-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.guide-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 问题卡片 */
.question-cards {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.q-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
}

.q-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.q-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.q-text {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-primary);
}

.q-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  resize: none;
  font-family: inherit;
}

.q-input::placeholder {
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* 换问题 + 字数 */
.q-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.change-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  padding: 4px 8px;
}

.char-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* 自由记录 */
.free-section {
  margin-bottom: var(--spacing-md);
}

.free-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  padding: var(--spacing-sm) 0;
}

.free-toggle-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-style: italic;
}

.free-arrow {
  color: var(--color-text-tertiary);
  font-size: 18px;
  transition: transform 0.2s;
  transform: rotate(90deg);
}

.free-arrow.expanded {
  transform: rotate(270deg);
}

.free-input {
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  line-height: 1.7;
  resize: none;
  font-family: inherit;
}

.free-input::placeholder {
  color: var(--color-text-tertiary);
}

/* 语音行 */
.voice-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-md);
}

.voice-error {
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

/* 底部 */
.footer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: var(--spacing-md);
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--spacing-md));
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  z-index: 20;
}

.network-error {
  font-size: var(--font-size-sm);
  color: var(--color-error);
  text-align: center;
  margin-bottom: var(--spacing-sm);
}

.generate-btn {
  width: 100%;
  padding: 14px;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
