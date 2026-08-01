<template>
  <div class="behavior-tags">
    <span class="label">行为标签（可选）</span>
    <div class="tags">
      <button
        v-for="t in options"
        :key="t"
        :class="{ selected: modelValue.includes(t) }"
        @click="toggle(t)"
      >{{ t }}</button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])
const options = ['学习', '工作', '健身', '社交', '休息', '娱乐', '其他']

function toggle(tag) {
  const next = props.modelValue.includes(tag)
    ? props.modelValue.filter(t => t !== tag)
    : [...props.modelValue, tag]
  emit('update:modelValue', next)
}
</script>

<style scoped>
.behavior-tags {
  margin: var(--spacing-md) 0;
}

.label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.tags button {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  transition: all 0.2s;
}

.tags button.selected {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
</style>
