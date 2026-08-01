<template>
  <div class="loading-spinner">
    <div class="spinner" />
    <p class="tip" v-if="tip">{{ tip }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  tip: { type: String, default: '加载中...' }
})
</script>

<style scoped>
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.tip {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
