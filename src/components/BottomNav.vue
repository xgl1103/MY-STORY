<template>
  <nav class="bottom-nav">
    <router-link
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      class="nav-tab"
      :class="{ active: isActive(tab) }"
    >
      <!-- 小说：打开的书本 -->
      <svg v-if="tab.key === 'story'" class="nav-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 6c-2-1.5-5-2-8-2v18c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z"/>
        <line x1="14" y1="6" x2="14" y2="24"/>
      </svg>

      <!-- 日记：日历 -->
      <svg v-if="tab.key === 'diary'" class="nav-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="6" width="20" height="18" rx="2.5"/>
        <line x1="4" y1="11" x2="24" y2="11"/>
        <line x1="10" y1="3" x2="10" y2="8"/>
        <line x1="18" y1="3" x2="18" y2="8"/>
        <circle cx="10" cy="16" r="1" fill="currentColor" stroke="none"/>
        <circle cx="14" cy="16" r="1" fill="currentColor" stroke="none"/>
        <circle cx="18" cy="16" r="1" fill="currentColor" stroke="none"/>
        <circle cx="10" cy="20" r="1" fill="currentColor" stroke="none"/>
        <circle cx="14" cy="20" r="1" fill="currentColor" stroke="none"/>
      </svg>

      <!-- 进度：柱状图 -->
      <svg v-if="tab.key === 'progress'" class="nav-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="24" x2="25" y2="24"/>
        <rect x="7" y="16" width="4" height="8" rx="1"/>
        <rect x="13" y="10" width="4" height="14" rx="1"/>
        <rect x="19" y="14" width="4" height="10" rx="1"/>
      </svg>

      <!-- 我的：人物 -->
      <svg v-if="tab.key === 'profile'" class="nav-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="14" cy="10" r="4.5"/>
        <path d="M5 24c0-4.5 4-8 9-8s9 3.5 9 8"/>
      </svg>

      <span class="nav-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { key: 'story', path: '/', label: '小说' },
  { key: 'diary', path: '/diary', label: '日记' },
  { key: 'progress', path: '/progress', label: '进度' },
  { key: 'profile', path: '/profile', label: '我的' }
]

function isActive(tab) {
  if (tab.path === '/') return route.path === '/'
  return route.path.startsWith(tab.path)
}
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  height: calc(var(--tabbar-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  display: flex;
  background: var(--color-tabbar-bg);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 100;
}

.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-tabbar-inactive);
  text-decoration: none;
  transition: color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

/* 重置 visited 样式，防止绿色对钩 */
.nav-tab:visited,
.nav-tab:active,
.nav-tab:focus {
  color: var(--color-tabbar-inactive);
  text-decoration: none;
  outline: none;
}

.nav-tab.active {
  color: var(--color-primary);
}

.nav-tab.active:visited {
  color: var(--color-primary);
}

.nav-icon {
  width: 24px;
  height: 24px;
  display: block;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
</style>
