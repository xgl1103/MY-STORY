<template>
  <div class="error-toast">
    <div class="icon">!</div>
    <p class="message">{{ message }}</p>
    <p class="code" v-if="code">错误码：{{ code }}</p>
    <div class="actions">
      <button v-if="retryable" @click="$emit('retry')" class="btn-retry">重试</button>
      <button v-if="isApiKeyError" @click="$emit('settings')" class="btn-settings">去设置</button>
      <button @click="$emit('dismiss')" class="btn-dismiss">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  code: { type: String, default: '' },     // E001-E014
  message: { type: String, required: true },
  retryable: { type: Boolean, default: false }
})
defineEmits(['retry', 'dismiss', 'settings'])

// Key 类错误（E001/E002）提供"去设置"跳转
const isApiKeyError = computed(() => {
  return props.code === 'E001' || props.code === 'E002'
})
</script>

<style scoped>
.error-toast {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
  text-align: center;
}

.error-toast .icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #e74c3c;
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-toast .message {
  font-size: 15px;
  color: #ccc;
  line-height: 1.6;
  margin: 0;
}

.error-toast .code {
  font-size: 13px;
  color: #888;
  margin: 0;
}

.error-toast .actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.error-toast button {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.error-toast button:active {
  opacity: 0.7;
}

.btn-retry {
  background: #6c5ce7;
  color: #fff;
}

.btn-settings {
  background: #00b894;
  color: #fff;
}

.btn-dismiss {
  background: #444;
  color: #ccc;
}
</style>
