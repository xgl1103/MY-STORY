<template>
  <div class="settings page">
    <header class="page-header">
      <h1>我的</h1>
    </header>

    <div class="settings-content">
      <!-- 用户信息卡片 -->
      <div v-if="user" class="user-card">
        <div class="user-avatar">{{ (user.hero_name || '你')[0] }}</div>
        <div class="user-info">
          <span class="user-name">{{ user.hero_name || '你' }}</span>
          <span class="user-meta">{{ user.world_id || '诡秘之主' }} · 占卜家 · 第 {{ user.current_day || 0 }} 天</span>
        </div>
      </div>

      <!-- AI 设置分组 -->
      <p class="group-title">AI 设置</p>
      <div class="group-card">
        <button class="settings-item" @click="router.push('/settings/api')">
          <span class="item-icon icon-ai">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/></svg>
          </span>
          <span class="item-label">API Key 管理</span>
          <span class="item-value">{{ user?.ai_provider ? '已配置' : '未配置' }}</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item" @click="router.push('/settings/api')">
          <span class="item-icon icon-ai">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>
          </span>
          <span class="item-label">AI 模型选择</span>
          <span class="item-value">{{ user?.ai_provider || 'deepseek' }}</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item" @click="router.push('/settings/api')">
          <span class="item-icon icon-ai">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
          </span>
          <span class="item-label">生成参数</span>
          <span class="item-value">温度 / 长度</span>
          <span class="arrow">›</span>
        </button>
      </div>

      <!-- 世界观分组 -->
      <p class="group-title">世界观</p>
      <div class="group-card">
        <button class="settings-item" @click="router.push('/settings/world')">
          <span class="item-icon icon-world">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>
          </span>
          <span class="item-label">当前世界观</span>
          <span class="item-value">{{ user?.world_id || '诡秘之主' }}</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item" @click="router.push('/settings/world')">
          <span class="item-icon icon-world">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </span>
          <span class="item-label">途径选择</span>
          <span class="item-value">占卜家</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item" @click="router.push('/settings/world')">
          <span class="item-icon icon-world">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </span>
          <span class="item-label">映射规则</span>
          <span class="item-value">行为 → 世界观</span>
          <span class="arrow">›</span>
        </button>
      </div>

      <!-- 数据管理分组 -->
      <p class="group-title">数据管理</p>
      <div class="group-card">
        <button class="settings-item" @click="router.push('/settings/data')">
          <span class="item-icon icon-data">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </span>
          <span class="item-label">备份导出</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item" @click="router.push('/settings/data')">
          <span class="item-icon icon-data">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          </span>
          <span class="item-label">导入恢复</span>
          <span class="arrow">›</span>
        </button>
        <button class="settings-item danger" @click="resetStory">
          <span class="item-icon icon-danger">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </span>
          <span class="item-label">重置故事</span>
          <span class="item-value danger-text">删除全部数据重新开始</span>
          <span class="arrow">›</span>
        </button>
      </div>

      <div class="app-info">
        <p>My Story v1.0.0</p>
        <p>AI 驱动的连载小说生成器</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import { AppConfigRepository } from '@/db/repositories/AppConfigRepository'
import { execute, markWrite, runTransaction } from '@/db/Database'

const router = useRouter()
const user = ref(null)

async function resetStory() {
  if (!confirm('确定要重置全部故事数据吗？此操作不可撤销。')) return
  try {
    runTransaction(() => {
      execute('DELETE FROM story_segments')
      execute('DELETE FROM chapters')
      execute('DELETE FROM diary_entries')
      execute('DELETE FROM encounter_log')
    })
    await UserRepository.update({
      current_day: 0, current_chapter: 0, story_started: 0
    })
    await AppConfigRepository.set('onboarding_completed', '0')
    await markWrite(true)
    router.replace('/onboarding')
  } catch (e) {
    alert(`重置失败：${(e && e.message) || '未知错误'}，数据已回滚`)
  }
}

onMounted(async () => {
  try { user.value = await UserRepository.get() } catch (e) { /* ignore */ }
})
</script>

<style scoped>
.settings {
  background: #F7F5F2;
  min-height: 100vh;
}

.page-header {
  padding: var(--spacing-lg) var(--spacing-md) var(--spacing-sm);
}

.page-header h1 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: #333333;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-md);
  padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 16px);
}

/* 用户信息卡片 */
.user-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.user-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: #333333;
}

.user-meta {
  font-size: var(--font-size-xs);
  color: #888888;
}

/* 分组标题 */
.group-title {
  font-size: var(--font-size-xs);
  color: #888888;
  margin-bottom: var(--spacing-sm);
  margin-top: var(--spacing-lg);
  padding-left: var(--spacing-xs);
  font-weight: 500;
}

.group-title:first-of-type {
  margin-top: 0;
}

/* 分组卡片 */
.group-card {
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

/* 设置项 */
.settings-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md);
  background: transparent;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.settings-item:last-child {
  border-bottom: none;
}

/* 图标容器 */
.item-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-ai {
  background: rgba(196, 92, 62, 0.1);
  color: #C45C3E;
}

.icon-world {
  background: rgba(107, 155, 122, 0.1);
  color: #6B9B7A;
}

.icon-data {
  background: rgba(139, 129, 120, 0.1);
  color: #8B8178;
}

.icon-danger {
  background: rgba(196, 92, 62, 0.1);
  color: #C45C3E;
}

.item-label {
  flex: 1;
  font-size: var(--font-size-base);
  color: #333333;
}

.item-value {
  font-size: var(--font-size-sm);
  color: #888888;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.danger-text {
  color: #C45C3E;
}

.settings-item.danger .item-label {
  color: #C45C3E;
}

.arrow {
  color: #CCCCCC;
  font-size: 18px;
  flex-shrink: 0;
}

/* 应用信息 */
.app-info {
  text-align: center;
  margin-top: var(--spacing-xl);
  color: #AAAAAA;
  font-size: 12px;
  line-height: 1.8;
}
</style>
