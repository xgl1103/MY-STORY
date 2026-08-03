<template>
  <div class="onboarding page">
    <!-- 顶部进度指示器 -->
    <div class="steps-indicator">
      <span v-for="i in 5" :key="i" :class="['dot', { active: i === step, done: i < step }]" />
    </div>

    <!-- Step 1: 欢迎页 -->
    <div v-show="step === 1" class="step-content welcome-step">
      <div class="brand-logo">
        <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M32 8c-5-3-12-4-20-4v44c8 0 15 1 20 4 5-3 12-4 20-4V4c-8 0-15 1-20 4z"/>
          <line x1="32" y1="8" x2="32" y2="52"/>
        </svg>
      </div>
      <h1 class="brand-title">My Story</h1>
      <p class="brand-subtitle">AI 连载小说 · 将你的日常化作传奇</p>
      <div class="intro-card">
        <p>每天记录你的经历，AI 将其编织成一部以你为主角的连载小说。</p>
        <p>设定在「诡秘之主」的世界观中，你是占卜家途径的非凡者，</p>
        <p>在雾气弥漫的贝克兰德展开属于你的故事。</p>
      </div>
    </div>

    <!-- Step 2: API Key 配置 -->
    <div v-show="step === 2" class="step-content">
      <h2 v-if="!USE_SERVERLESS_AI" class="step-title">配置 AI 模型</h2>
      <p v-if="!USE_SERVERLESS_AI" class="step-desc">选择你使用的 AI 模型并填入 API Key，故事生成将调用此模型。</p>
      <div v-else class="hosted-ai-card">
        <h2 class="step-title">AI 创作服务已就绪</h2>
        <p class="step-desc">My Story 已为本次体验配置好 DeepSeek AI。无需填写或保管 API Key，直接开始创作即可。</p>
      </div>

      <label v-if="!USE_SERVERLESS_AI" class="field">
        <span class="field-label">模型选择</span>
        <select v-model="form.aiProvider" @change="onProviderChange">
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="kimi">Kimi (月之暗面)</option>
          <option value="qwen">通义千问</option>
        </select>
      </label>

      <label v-if="!USE_SERVERLESS_AI" class="field">
        <span class="field-label">API Base URL（可选）</span>
        <input v-model="form.baseUrl" :placeholder="defaultBaseUrl" />
      </label>

      <label v-if="!USE_SERVERLESS_AI" class="field">
        <span class="field-label">API Key</span>
        <div class="key-input">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="form.apiKey"
            placeholder="sk-..."
          />
          <button class="toggle-key" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
      </label>

      <button class="test-btn" :disabled="testing" @click="testConnection">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <p v-if="testResult" :class="['test-result', testSuccess ? 'success' : 'fail']">{{ testResult }}</p>
    </div>

    <!-- Step 3: 主角名 -->
    <div v-show="step === 3" class="step-content">
      <h2 class="step-title">你的名字</h2>
      <p class="step-desc">小说中主角的名字。如果不填，默认使用「你」。</p>
      <label class="field">
        <span class="field-label">主角名</span>
        <input v-model="form.heroName" placeholder="你" maxlength="20" />
      </label>
    </div>

    <!-- Step 4: 世界观介绍 -->
    <div v-show="step === 4" class="step-content">
      <h2 class="step-title">{{ worldInfo.world_name }}</h2>
      <p class="world-desc">{{ worldInfo.description }}</p>

      <div class="path-preview">
        <h3>你的途径：占卜家</h3>
        <p class="path-desc">{{ seerPath.description }}</p>
        <div class="levels">
          <span v-for="lvl in seerPath.levels" :key="lvl.level" class="level-tag">
            {{ lvl.name }}
          </span>
        </div>
      </div>

      <div class="mapping-preview">
        <h3>行为映射示例</h3>
        <p class="mapping-hint">你的日常行为将被映射为世界观内的活动</p>
        <div class="mapping-list">
          <div v-for="m in mappingPreview" :key="m.behavior" class="mapping-item">
            <span class="m-behavior">{{ m.behavior }}</span>
            <span class="m-arrow">→</span>
            <span class="m-world">{{ m.world_behavior }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 5: 确认开始 -->
    <div v-show="step === 5" class="step-content">
      <h2 class="step-title">准备就绪</h2>
      <div class="summary">
        <div class="summary-item"><span>世界观</span><span>{{ worldInfo.world_name }}</span></div>
        <div class="summary-item"><span>途径</span><span>占卜家</span></div>
        <div class="summary-item"><span>主角名</span><span>{{ form.heroName || '你' }}</span></div>
        <div class="summary-item"><span>故事时长</span><span>{{ worldInfo.default_duration }} 天（6 个章节）</span></div>
        <div class="summary-item"><span>AI 模型</span><span>{{ providerName }}</span></div>
      </div>
      <p class="ready-hint">点击下方按钮，开启你的第一天</p>
    </div>

    <!-- 底部按钮 -->
    <div class="actions">
      <button v-if="step > 1" class="btn-back" @click="step--">上一步</button>
      <button v-if="step < 5" class="btn-next" :disabled="!canNext" @click="next">下一步</button>
      <button v-if="step === 5" class="btn-finish" @click="finish">开启第一天</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import { AppConfigRepository } from '@/db/repositories/AppConfigRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import Crypto from '@/utils/Crypto'
import worldJson from '@/config/worlds/lord_of_mysteries/world.json'
import pathsJson from '@/config/worlds/lord_of_mysteries/paths.json'
import mappingsJson from '@/config/worlds/lord_of_mysteries/mappings.json'

const router = useRouter()

const step = ref(1)
const form = ref({
  aiProvider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  heroName: '你',
  apiTested: false
})
const showKey = ref(false)
const testing = ref(false)
const testResult = ref('')
const testSuccess = ref(false)

const worldInfo = worldJson
const seerPath = pathsJson.paths.find(p => p.path_id === 'seer') || pathsJson.paths[0] || {}
const mappingPreview = (mappingsJson.mappings || []).slice(0, 4)

const PROVIDER_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  kimi: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

const defaultBaseUrl = computed(() => PROVIDER_URLS[form.value.aiProvider] || '')
const providerName = computed(() => {
  const names = { deepseek: 'DeepSeek', openai: 'OpenAI', kimi: 'Kimi', qwen: '通义千问' }
  return names[form.value.aiProvider] || form.value.aiProvider
})

function onProviderChange() {
  form.value.apiTested = false
  testResult.value = ''
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const USE_SERVERLESS_AI = import.meta.env.VITE_USE_SERVERLESS_AI === 'true'

const canNext = computed(() => {
  if (step.value === 2) {
    if (USE_MOCK) return true
    return form.value.apiTested
  }
  if (step.value === 3) return (form.value.heroName || '').trim().length > 0
  return true
})

async function testConnection() {
  if (USE_SERVERLESS_AI) {
    testing.value = true
    testResult.value = ''
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health' })
      })
      const data = await res.json().catch(() => ({}))
      testSuccess.value = res.ok && data.configured
      form.value.apiTested = testSuccess.value
      testResult.value = testSuccess.value ? 'AI 创作服务连接成功' : 'AI 创作服务尚未配置，请联系项目方'
    } catch (_) {
      testSuccess.value = false
      testResult.value = 'AI 创作服务暂时无法连接，请稍后重试'
    } finally {
      testing.value = false
    }
    return
  }
  if (!form.value.apiKey) {
    testResult.value = '请先输入 API Key'
    testSuccess.value = false
    return
  }
  testing.value = true
  testResult.value = ''
  try {
    const baseUrl = (form.value.baseUrl || defaultBaseUrl.value).replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${form.value.apiKey}` }
    })
    if (res.ok) {
      testResult.value = '连接成功！'
      testSuccess.value = true
      form.value.apiTested = true
    } else if (res.status === 401) {
      testResult.value = 'API Key 无效，请检查'
      testSuccess.value = false
    } else {
      testResult.value = `服务器返回 ${res.status}，请检查 URL`
      testSuccess.value = false
    }
  } catch (e) {
    testResult.value = `连接失败：${e.message}。Mock 模式下可跳过。`
    testSuccess.value = false
    form.value.apiTested = true
  } finally {
    testing.value = false
  }
}

async function next() {
  if (step.value === 2) {
    try {
      const encrypted = USE_SERVERLESS_AI ? null : await Crypto.encrypt(form.value.apiKey)
      await UserRepository.update({
        ai_provider: USE_SERVERLESS_AI ? 'deepseek' : form.value.aiProvider,
        ai_base_url: USE_SERVERLESS_AI ? '/api/ai' : (form.value.baseUrl || null),
        api_key_encrypted: encrypted
      })
    } catch (e) {
      alert(`保存失败：${(e && e.message) || '未知错误'}，请重试`)
      return
    }
  }
  if (step.value === 3) {
    try {
      await UserRepository.update({ hero_name: form.value.heroName || '你' })
    } catch (e) {
      alert(`保存失败：${(e && e.message) || '未知错误'}，请重试`)
      return
    }
  }
  step.value++
}

async function finish() {
  try {
    const prologue = worldJson.chapters.find(c => c.number === 0) || worldJson.chapters[0]
    const existing = await ChapterRepository.getByNumber(prologue.number)
    if (!existing) {
      await ChapterRepository.create({
        chapter_number: prologue.number,
        title: prologue.name,
        content: null,
        summary: null,
        start_day: prologue.start_day,
        end_day: prologue.end_day,
        status: 'ongoing'
      })
    }
    await AppConfigRepository.set('onboarding_completed', '1')
    await UserRepository.update({ story_started: 1, current_day: 0, current_chapter: prologue.number })
    router.replace('/diary')
  } catch (e) {
    alert(`初始化失败：${(e && e.message) || '未知错误'}，请重试`)
  }
}
</script>

<style scoped>
.onboarding {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
}

/* 进度指示器 */
.steps-indicator {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: var(--spacing-md) 0;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border);
  transition: all 0.3s;
}

.dot.active {
  background: var(--color-primary);
  width: 24px;
  border-radius: 4px;
}

.dot.done {
  background: var(--color-primary-light);
}

.step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--spacing-md) 0;
}

/* 欢迎页品牌区 */
.welcome-step {
  align-items: center;
}

.brand-logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: rgba(196, 92, 62, 0.08);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
}

.brand-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
  text-align: center;
  margin-bottom: var(--spacing-sm);
  letter-spacing: 1px;
}

.brand-subtitle {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-xl);
}

.intro-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  max-width: 100%;
}

.intro-card p {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  line-height: 1.8;
  margin-bottom: var(--spacing-xs);
}

/* 步骤标题 */
.step-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--spacing-sm);
}

.step-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
  line-height: 1.6;
}

/* 表单字段 */
.field {
  display: block;
  margin-bottom: var(--spacing-md);
}

.field-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
  font-weight: 500;
}

.field input, .field select {
  width: 100%;
  padding: 12px var(--spacing-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.field input:focus, .field select:focus {
  border-color: var(--color-primary);
}

.key-input {
  display: flex;
  gap: var(--spacing-sm);
}

.key-input input {
  flex: 1;
}

.toggle-key {
  padding: 0 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.test-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-sm);
}

.test-btn:disabled {
  opacity: 0.5;
}

.test-result {
  text-align: center;
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-sm);
}

.test-result.success { color: var(--color-success); }
.test-result.fail { color: var(--color-error); }

/* 世界观介绍 */
.world-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  line-height: 1.8;
  margin-bottom: var(--spacing-lg);
}

.path-preview {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.path-preview h3 {
  font-size: var(--font-size-base);
  color: var(--color-primary);
  margin-bottom: var(--spacing-sm);
  font-weight: 600;
}

.path-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: var(--spacing-sm);
}

.levels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.level-tag {
  font-size: 12px;
  padding: 4px 10px;
  background: rgba(196, 92, 62, 0.08);
  border-radius: 12px;
  color: var(--color-primary);
}

.mapping-preview h3 {
  font-size: var(--font-size-base);
  color: var(--color-text);
  margin-bottom: var(--spacing-xs);
  font-weight: 600;
}

.mapping-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.mapping-list {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.mapping-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.mapping-item:last-child { border-bottom: none; }

.m-behavior {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  min-width: 50px;
  font-weight: 500;
}

.m-arrow {
  color: var(--color-text-tertiary);
}

.m-world {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  flex: 1;
}

/* 确认摘要 */
.summary {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}

.summary-item:last-child { border-bottom: none; }
.summary-item span:first-child { color: var(--color-text-secondary); }
.summary-item span:last-child { color: var(--color-text); font-weight: 500; }

.ready-hint {
  text-align: center;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
}

/* 底部按钮 */
.actions {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg) 0;
}

.btn-back {
  flex: 1;
  padding: 14px;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
}

.btn-next, .btn-finish {
  flex: 2;
  padding: 14px;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.btn-next:disabled {
  opacity: 0.4;
}
</style>
