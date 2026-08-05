<template>
  <div class="reading-mode-toggle" role="group" aria-label="阅读方式">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="reading-mode-option"
      :class="{ active: modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { READING_MODES } from '@/features/reader/readingMode'

defineProps({
  modelValue: { type: String, default: READING_MODES.SCROLL }
})

defineEmits(['update:modelValue'])

const options = [
  { value: READING_MODES.SCROLL, label: '滑动' },
  { value: READING_MODES.PAGE, label: '翻页' }
]
</script>

<style scoped>
.reading-mode-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  flex: 1;
  padding: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.reading-mode-option {
  min-height: 36px;
  border-radius: calc(var(--radius-sm) - 2px);
  color: var(--color-text-secondary);
  background: transparent;
  font-size: var(--font-size-sm);
}

.reading-mode-option.active {
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(60, 45, 35, 0.12);
}
</style>
