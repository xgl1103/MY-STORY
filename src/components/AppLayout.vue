<template>
  <div class="app-layout" :data-theme="currentTheme">
    <main class="layout-content">
      <slot />
    </main>
    <BottomNav />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from './BottomNav.vue'

const route = useRoute()

// 根据路由自动切换主题：
// 全部页面默认使用浅色暖白主题
// 阅读页可由用户手动切换夜间模式（ChapterReader 内部处理）
const currentTheme = computed(() => {
  // 所有页面统一使用 light 浅色暖白主题
  return 'light'
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s ease;
}

.layout-content {
  flex: 1;
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 8px);
}
</style>
