<template>
  <div class="settings-api">
    <header class="top-bar">
      <button class="back-btn" @click="goBack">返回</button>
      <h2>AI 模型配置</h2>
      <span />
    </header>

    <div class="content">
      <label class="field">
        <span class="field-label">模型选择</span>
        <select v-model="form.provider" @change="onProviderChange">
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="kimi">Kimi (月之暗面)</option>
          <option value="qwen">通义千问</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label">API Base URL（可选）</span>
        <input v-model="form.baseUrl" :placeholder="defaultBaseUrl" />
      </label>

      <label class="field">
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

      <label class="field">
        <span class="field-label">Temperature（{{ form.temperature }}）</span>
        <input type="range" min="0" max="2" step="0.1" v-model.number="form.temperature" />
      </label>

      <label class="field">
        <span class="field-label">Max Tokens</span>
        <input type="number" v-model.number="form.maxTokens" min="100" max="8192" step="100" />
      </label>

      <button class="test-btn" :disabled="testing" @click="testConnection">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <p v-if="testResult" :class="['test-result', testSuccess ? 'success' : 'fail']">{{ testResult }}</p>

      <button class="save-btn" :disabled="saving" @click="save">
        {{ saving ? '保存中...' : '保存' }}
      </button>
      <p v-if="saveMsg" class="save-msg">{{ saveMsg }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import Crypto from '@/utils/Crypto'

const router = useRouter()

// 返回（history 兜底）
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/settings')
}
const form = ref({
  provider: 'deepseek',
  baseUrl: '',
  apiKey: '',
  temperature: 0.8,
  maxTokens: 2000
})
const showKey = ref(false)
const testing = ref(false)
const testResult = ref('')
const testSuccess = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const saveSuccess = ref(false)

const PROVIDER_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  kimi: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

const defaultBaseUrl = computed(() => PROVIDER_URLS[form.value.provider] || '')

function onProviderChange() {
  testResult.value = ''
}

async function testConnection() {
  if (!form.value.apiKey) {
    testResult.value = '请先输入 API Key'
    testSuccess.value = false
    return
  }
  testing.value = true
  try {
    const baseUrl = (form.value.baseUrl || defaultBaseUrl.value).replace(/\/$/, '')
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${form.value.apiKey}` }
    })
    if (res.ok) {
      testResult.value = '连接成功！'
      testSuccess.value = true
    } else if (res.status === 401) {
      testResult.value = 'API Key 无效'
      testSuccess.value = false
    } else {
      testResult.value = `服务器返回 ${res.status}`
      testSuccess.value = false
    }
  } catch (e) {
    testResult.value = `连接失败：${e.message}`
    testSuccess.value = false
  } finally {
    testing.value = false
  }
}

async function save() {
  saving.value = true
  saveMsg.value = ''
  try {
    const encrypted = form.value.apiKey ? await Crypto.encrypt(form.value.apiKey) : null
    await UserRepository.update({
      ai_provider: form.value.provider,
      ai_base_url: form.value.baseUrl || null,
      api_key_encrypted: encrypted,
      ai_temperature: form.value.temperature,
      ai_max_tokens: Math.max(100, Math.min(8192, form.value.maxTokens || 2000))
    })
    saveMsg.value = '保存成功'
    saveSuccess.value = true
  } catch (e) {
    saveMsg.value = `保存失败：${(e && e.message) || '未知错误'}`
    saveSuccess.value = false
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const user = await UserRepository.get()
    form.value.provider = user.ai_provider || 'deepseek'
    form.value.baseUrl = user.ai_base_url || ''
    form.value.temperature = user.ai_temperature ?? 0.8
    form.value.maxTokens = user.ai_max_tokens ?? 2000
    // decrypt 单独 try-catch：密钥损坏不影响其它字段已加载的值
    if (user.api_key_encrypted) {
      try {
        form.value.apiKey = await Crypto.decrypt(user.api_key_encrypted) || ''
      } catch (e) {
        console.warn('[SettingsApi] API Key 解密失败，可能数据已损坏:', e)
        form.value.apiKey = ''
      }
    }
  } catch (e) {
    console.error('[SettingsApi] 加载配置失败:', e)
  }
})
</script>

<style scoped>
.settings-api { min-height: 100vh; display: flex; flex-direction: column; }

.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-md);
  padding-top: calc(var(--spacing-md) + env(safe-area-inset-top, 0px));
  background: var(--color-surface); position: sticky; top: 0; z-index: 10;
}
.top-bar h2 { font-size: var(--font-size-lg); color: var(--color-text); }
.back-btn { background: none; color: var(--color-primary-light); font-size: var(--font-size-sm); }
.top-bar > span { width: 40px; }

.content { padding: var(--spacing-md); }

.field { display: block; margin-bottom: var(--spacing-md); }
.field-label { display: block; font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); }
.field input, .field select {
  width: 100%; padding: 12px var(--spacing-md);
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); color: var(--color-text); font-size: var(--font-size-base);
}
.field input[type="range"] { padding: 0; }

.key-input { display: flex; gap: var(--spacing-sm); }
.key-input input { flex: 1; }
.toggle-key {
  padding: 0 16px; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: var(--font-size-sm); white-space: nowrap;
}

.test-btn {
  width: 100%; padding: 10px; background: var(--color-surface);
  border: 1px solid var(--color-primary); border-radius: var(--radius-sm);
  color: var(--color-primary-light); font-size: var(--font-size-sm); margin-bottom: var(--spacing-sm);
}
.test-btn:disabled { opacity: 0.5; }

.test-result { text-align: center; font-size: var(--font-size-sm); margin-bottom: var(--spacing-md); }
.test-result.success { color: var(--color-success); }
.test-result.fail { color: var(--color-error); }

.save-btn {
  width: 100%; padding: 14px; background: var(--color-primary);
  border-radius: var(--radius-sm); color: #fff; font-size: var(--font-size-base);
}
.save-btn:disabled { opacity: 0.5; }

.save-msg { text-align: center; font-size: var(--font-size-sm); margin-top: var(--spacing-sm); }
.save-msg.success { color: var(--color-success); }
.save-msg.fail { color: var(--color-error); }
</style>
