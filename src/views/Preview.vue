<template>
  <div class="preview">
    <!-- 顶部栏：返回按钮 + 状态标签 -->
    <header class="topbar">
      <button class="btn-back" @click="back">
        <span class="back-arrow">‹</span> 返回
      </button>
      <span class="status-label">{{ statusLabel }}</span>
    </header>

    <!-- 状态一：生成中 -->
    <div v-if="generating" class="state-area loading-area">
      <LoadingSpinner :tip="rotatingTip" />
    </div>

    <!-- 状态二：错误 -->
    <div v-else-if="error" class="state-area">
      <ErrorToast
        :code="errorCode"
        :message="error"
        :retryable="true"
        @retry="onRetry"
        @dismiss="onDismiss"
        @settings="goSettings"
      />
    </div>

    <!-- 状态三：预览 -->
    <template v-else-if="result">
      <div class="content-area">
        <!-- 故事正文 / 编辑器 -->
        <article v-if="!editing" class="story-text">{{ result.content }}</article>
        <textarea
          v-else
          v-model="editedText"
          class="story-editor"
          placeholder="编辑你的故事..."
        />

        <!-- 映射说明区 -->
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

        <!-- 日记→故事 引用标注区 -->
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

        <!-- 重生成上限提示 -->
        <p v-if="regenDisabled && !editing" class="regen-hint">
          已达重生成上限，可手动编辑
        </p>
      </div>

      <!-- 操作按钮区 -->
      <footer class="actions">
        <button
          class="btn btn-regenerate"
          :disabled="regenDisabled || submitting"
          @click="regenerate"
        >
          重新生成
          <span class="count">({{ revisionCount }}/3)</span>
        </button>
        <button
          class="btn btn-edit"
          :disabled="submitting"
          @click="toggleEdit"
        >
          {{ editing ? '取消' : '编辑' }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="submitting"
          @click="confirm"
        >
          {{ submitting ? '处理中...' : (editing ? '保存' : '确认通过') }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getStoryEngine } from '@/core'
import { DiaryRepository } from '@/db/repositories/DiaryRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'
import { triggerCommentGeneration } from '@/utils/CommentGenerator'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import ErrorToast from '@/components/ErrorToast.vue'

const router = useRouter()
const route = useRoute()

// StoryEngine 实例：getStoryEngine() 在未初始化时会抛错，需 try-catch 包裹
let storyEngine = null
let engineInitError = null
try {
  storyEngine = getStoryEngine()
} catch (e) {
  engineInitError = e
}

// ===== 响应式状态 =====
const generating = ref(false)
const result = ref(null) // { success, segmentId, content, mappingDesc }
const segmentId = ref(null)
const error = ref('')
const errorCode = ref('')
const editing = ref(false)
const editedText = ref('')
const revisionCount = ref(0)
const submitting = ref(false) // 定稿/保存进行中

// 路由参数缓存（供 onRetry 重新调用 doGenerate）
const routeDay = ref(null)

// ===== 趣味提示语轮播（2.5s 切换）=====
const tips = [
  '正在编织你的命运...',
  '占卜师正在凝视水晶球...',
  '命运的丝线正在交织...'
]
const rotatingTip = ref(tips[0])
let tipTimer = null
let tipIndex = 0

function startTips() {
  stopTips()
  tipIndex = 0
  rotatingTip.value = tips[0]
  tipTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % tips.length
    rotatingTip.value = tips[tipIndex]
  }, 2500)
}

function stopTips() {
  if (tipTimer) {
    clearInterval(tipTimer)
    tipTimer = null
  }
}

// ===== 计算属性 =====
const statusLabel = computed(() => {
  if (generating.value) return '生成中'
  if (error.value) return '生成失败'
  if (result.value) return routeDay.value ? `第 ${routeDay.value} 天 · 预览` : '预览'
  return '准备中'
})

// 解析 result.mappingDesc（JSON 字符串），列表展示 behavior → worldBehavior
const mappingList = computed(() => {
  if (!result.value || !result.value.mappingDesc) return []
  try {
    const parsed = JSON.parse(result.value.mappingDesc)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
})

// 解析 result.references（JSON 字符串），展示日记→故事引用标注
const referenceList = computed(() => {
  if (!result.value || !result.value.references) return []
  try {
    const parsed = JSON.parse(result.value.references)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
})

// 重新生成是否已达上限（最多 3 次）
const regenDisabled = computed(() => revisionCount.value >= 3)

// ===== 生命周期 =====
onMounted(async () => {
  const day = Number(route.query.day)
  // 引擎未初始化：直接展示错误
  if (engineInitError) {
    error.value = '故事引擎未初始化，请重启 App 或完成引导流程'
    errorCode.value = 'E008'
    return
  }
  // 缺少路由参数（day=0 也不合法，因为第一天是 day=1）
  if (day == null || Number.isNaN(day) || day < 1) {
    error.value = '缺少日记参数，请返回重新记日记'
    errorCode.value = ''
    return
  }
  routeDay.value = day

  // R2 修复：先检查是否已有段落，避免重复生成
  try {
    const existing = await SegmentRepository.getByDay(day)
    if (existing) {
      if (existing.status === 'draft_ready' || existing.status === 'finalized') {
        // 加载已有段落，不重新生成
        result.value = {
          success: true,
          segmentId: existing.id,
          content: existing.content,
          mappingDesc: existing.mapping_desc,
        }
        segmentId.value = existing.id
        revisionCount.value = existing.revision_count || 0
        editing.value = false
        editedText.value = existing.content
        return
      }
    }
  } catch (e) {
    console.warn('[Preview] 检查已有段落失败，继续生成:', e.message)
  }

  await doGenerate(day)
})

onBeforeUnmount(() => {
  stopTips()
})

// ===== 核心方法 =====

// 生成故事：获取日记 → storyEngine.generateStory → 处理结果
async function doGenerate(day) {
  generating.value = true
  error.value = ''
  errorCode.value = ''
  startTips()
  try {
    const diary = await DiaryRepository.getByDay(day)
    if (!diary) {
      generating.value = false
      stopTips()
      error.value = '未找到该天的日记，请返回重新记日记'
      errorCode.value = ''
      return
    }
    // 解析 behavior_tags，损坏时降级为空数组
    let behaviorTags = []
    try { behaviorTags = JSON.parse(diary.behavior_tags || '[]') } catch { behaviorTags = [] }
    const res = await storyEngine.generateStory({
      diaryText: diary.raw_text,
      behaviorTags,
      dayNumber: day,
      // 段落必须关联用户刚保存的日记，避免生成器重复创建或丢失关联。
      diaryId: diary.id
    })
    generating.value = false
    stopTips()
    if (res && res.success) {
      result.value = res
      segmentId.value = res.segmentId
      // 新段落，重置重生成计数与编辑态
      revisionCount.value = 0
      editing.value = false
      editedText.value = res.content
    } else {
      error.value = (res && res.error) || '生成失败，请重试'
      errorCode.value = (res && res.errorCode) || ''
    }
  } catch (e) {
    generating.value = false
    stopTips()
    error.value = (e && (e.error || e.message)) || '生成失败，请重试'
    errorCode.value = (e && e.errorCode) || ''
  }
}

// 重新生成：storyEngine.regenerate(segmentId)，成功才消耗次数
async function regenerate() {
  if (regenDisabled.value || !segmentId.value) return
  editing.value = false
  generating.value = true
  error.value = ''
  errorCode.value = ''
  startTips()
  try {
    const res = await storyEngine.regenerate(segmentId.value)
    generating.value = false
    stopTips()
    if (res && res.success) {
      // 仅成功时才消耗重生成次数
      revisionCount.value++
      result.value = res
      editedText.value = res.content
    } else {
      error.value = (res && res.error) || '重新生成失败，请重试'
      errorCode.value = (res && res.errorCode) || ''
    }
  } catch (e) {
    generating.value = false
    stopTips()
    error.value = (e && (e.error || e.message)) || '重新生成失败，请重试'
    errorCode.value = (e && e.errorCode) || ''
  }
}

// 切换编辑模式：textarea 替换 article
function toggleEdit() {
  if (editing.value) {
    // 取消编辑，丢弃修改
    editing.value = false
    editedText.value = (result.value && result.value.content) || ''
  } else {
    editedText.value = (result.value && result.value.content) || ''
    editing.value = true
  }
}

// 确认通过：编辑模式下先 saveEdit 再 finalize，根据结果跳转
async function confirm() {
  if (submitting.value || !segmentId.value) return
  // 编辑模式下校验内容非空
  if (editing.value && !editedText.value.trim()) {
    alert('内容不能为空')
    return
  }
  submitting.value = true
  try {
    if (editing.value) {
      const saveRes = await storyEngine.saveEdit(segmentId.value, editedText.value)
      if (!saveRes || !saveRes.success) {
        error.value = (saveRes && saveRes.error) || '保存失败，请重试'
        errorCode.value = (saveRes && saveRes.errorCode) || ''
        return
      }
      // 同步编辑后的内容到预览
      result.value = { ...result.value, content: editedText.value }
      editing.value = false
    }
    const res = await storyEngine.finalize(segmentId.value)
    if (res && res.success) {
      // 定稿后跳转：故事完结跳 /?ended=1，否则跳 /
      if (res.storyEnded) {
        router.replace('/?ended=1')
      } else {
        router.replace('/')
      }

      // R11 修复：基于刚定稿的 segmentId 取章节，而非 getCurrent()（可能已切换到新章节）
      ;(async () => {
        try {
          const seg = await SegmentRepository.getByDay(routeDay.value)
          if (seg && seg.chapter_id) {
            const chapter = await ChapterRepository.getById(seg.chapter_id)
            if (chapter) {
              const segments = await SegmentRepository.getByChapter(chapter.id)
              const chapterContent = segments
                .filter(s => s.content)
                .map(s => s.content)
                .join('\n\n')
              if (chapterContent) {
                triggerCommentGeneration(chapter.chapter_number, chapterContent)
              }
            }
          }
        } catch (e) {
          console.warn('[Preview] 后台评论生成触发失败:', e)
        }
      })()
    } else {
      error.value = (res && res.error) || '定稿失败，请重试'
      errorCode.value = (res && res.errorCode) || ''
    }
  } catch (e) {
    error.value = (e && (e.error || e.message)) || '定稿失败，请重试'
    errorCode.value = (e && e.errorCode) || ''
  } finally {
    submitting.value = false
  }
}

// 重试：清除错误，重新 doGenerate（不消耗重生成次数）
function onRetry() {
  error.value = ''
  errorCode.value = ''
  if (routeDay.value !== null) {
    doGenerate(routeDay.value)
  }
}

// 关闭错误：返回上一页
function onDismiss() {
  error.value = ''
  errorCode.value = ''
  back()
}

// API Key 类错误跳转设置页
function goSettings() {
  router.push('/settings/api')
}

// 返回
function back() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/')
  }
}
</script>

<style scoped>
.preview {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

/* ===== 顶部栏 ===== */
.topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.btn-back {
  display: flex;
  align-items: center;
  background: transparent;
  color: var(--color-primary-light);
  font-size: var(--font-size-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.btn-back .back-arrow {
  font-size: 22px;
  line-height: 1;
  margin-right: 2px;
}

.status-label {
  margin-left: auto;
  margin-right: auto;
  transform: translateX(-24px);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* ===== 通用状态容器（生成中 / 错误） ===== */
.state-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
}

.loading-area {
  flex-direction: column;
}

/* ===== 预览内容区 ===== */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg) var(--spacing-md);
}

.story-text {
  font-size: var(--font-size-base);
  line-height: 1.85;
  color: var(--color-text);
  letter-spacing: 0.3px;
  white-space: pre-wrap;
  word-break: break-word;
}

.story-editor {
  width: 100%;
  min-height: 240px;
  padding: var(--spacing-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-base);
  line-height: 1.85;
  resize: vertical;
  letter-spacing: 0.3px;
}

.story-editor:focus {
  border-color: var(--color-primary);
}

/* ===== 映射说明区 ===== */
.mapping {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px dashed var(--color-border);
}

.mapping-title {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
  font-weight: 600;
}

.mapping-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.mapping-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.mapping-item .behavior {
  padding: 2px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-primary-light);
  white-space: nowrap;
}

.mapping-item .mapping-arrow {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.mapping-item .world-behavior {
  color: var(--color-text);
}

/* ===== 日记→故事 引用标注区 ===== */
.references {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px dashed var(--color-border);
}

.references-title {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  margin-bottom: var(--spacing-md);
  font-weight: 600;
}

.ref-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border-left: 3px solid var(--color-primary);
}

.ref-row {
  display: flex;
  gap: var(--spacing-sm);
  align-items: flex-start;
}

.ref-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}

.ref-text {
  font-size: var(--font-size-sm);
  line-height: 1.6;
  margin: 0;
  flex: 1;
}

.ref-text.diary-text {
  color: var(--color-primary-light);
}

.ref-text.story-text {
  color: var(--color-text);
}

.ref-arrow {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: var(--spacing-xs) 0;
  padding-left: 60px;
}

.ref-mapping {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
  padding-top: var(--spacing-xs);
  border-top: 1px solid var(--color-border);
}

/* ===== 重生成上限提示 ===== */
.regen-hint {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--color-warning);
  text-align: center;
}

/* ===== 操作按钮区 ===== */
.actions {
  flex-shrink: 0;
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.btn {
  flex: 1;
  padding: 12px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  transition: opacity 0.2s ease, transform 0.1s ease;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-regenerate .count {
  font-size: 12px;
  opacity: 0.8;
}

.btn-edit {
  background: var(--color-bg);
  color: var(--color-text);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  font-weight: 600;
}

.btn-primary:not(:disabled) {
  box-shadow: 0 2px 8px rgba(108, 92, 231, 0.3);
}

/* ===== 移动端适配 ===== */
@media (max-width: 360px) {
  .actions {
    gap: var(--spacing-xs);
    padding: var(--spacing-sm);
  }
  .btn {
    padding: 10px 4px;
    font-size: 13px;
  }
  .status-label {
    font-size: 13px;
  }
}
</style>
