<template>
  <button
    class="voice-input"
    :class="{ recording, recognizing }"
    @touchstart.prevent="start"
    @touchend.prevent="stop"
    @touchcancel.prevent="stop"
    @mousedown.prevent="start"
    @mouseup.prevent="stop"
    @mouseleave="recording && stop()"
  >
    <svg class="mic-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
    <span v-if="recording">松开结束</span>
    <span v-else-if="recognizing">识别中...</span>
    <span v-else>按住说话</span>
  </button>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const emit = defineEmits(['result', 'error'])
const recording = ref(false)
const recognizing = ref(false)
let recognitionTimer = null // stop() 中的 setTimeout id

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null

// 控制 onend 是否自动重启识别（用户主动停止时为 false，浏览器超时终止时为 true）
let shouldRestart = false

async function start() {
  if (recording.value) return
  recording.value = true
  shouldRestart = true
  try {
    if (SpeechRecognition) {
      // 若已有旧实例未停止，先 abort 防止资源泄漏和重复回调
      if (recognition) {
        try { recognition.abort() } catch (e) { /* ignore */ }
      }
      recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      // continuous=true: 允许说话停顿而不终止识别，支持长按连续说话
      recognition.continuous = true
      recognition.interimResults = false
      recognition.onresult = (e) => {
        // continuous=true 时 onresult 可能多次触发，每次从 resultIndex 开始是新结果
        let finalText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          finalText += e.results[i][0].transcript
        }
        if (finalText) {
          emit('result', finalText)
        }
      }
      recognition.onerror = (e) => {
        console.warn('[VoiceInput] 语音识别错误:', e.error)
        // 'no-speech'（静音无语音）和 'aborted'（主动中断）是可恢复的，
        // 不重置状态，让 onend 自动重启，用户继续说话即可
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          shouldRestart = false
          recording.value = false
          emit('error', 'E012')
        }
      }
      recognition.onend = () => {
        // Chrome 约 60 秒后自动终止会话（服务端限制），此处自动重启
        // 仅当用户仍在按住按钮（shouldRestart=true 且 recording=true）时重启
        if (shouldRestart && recording.value) {
          try { recognition.start() } catch (e) { /* ignore */ }
        }
      }
      recognition.start()
    } else {
      // 浏览器不支持 Web Speech API
      emit('error', 'E011')
      recording.value = false
      shouldRestart = false
    }
  } catch (e) {
    emit('error', 'E011')
    recording.value = false
    shouldRestart = false
  }
}

function stop() {
  if (!recording.value) return
  recording.value = false
  shouldRestart = false // 阻止 onend 自动重启
  recognizing.value = true
  if (recognition) {
    try { recognition.stop() } catch (e) { /* ignore */ }
  }
  // 保存 timer id 以便卸载时清理
  recognitionTimer = setTimeout(() => { recognizing.value = false }, 1000)
}

onBeforeUnmount(() => {
  shouldRestart = false
  if (recognitionTimer) clearTimeout(recognitionTimer)
  if (recognition) {
    try { recognition.stop() } catch (e) { /* ignore */ }
  }
})
</script>

<style scoped>
.voice-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  user-select: none;
  -webkit-user-select: none;
}

.voice-input.recording {
  background: var(--color-error);
  color: #fff;
  border-color: var(--color-error);
}

.voice-input.recognizing {
  opacity: 0.6;
}

.mic-icon {
  flex-shrink: 0;
}
</style>
