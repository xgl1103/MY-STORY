// src/router/index.js
// 路由配置：Tab 页面（带底部导航）+ 覆盖层页面（无底部导航）
import { createRouter, createWebHashHistory } from 'vue-router'
import { AppConfigRepository } from '@/db/repositories/AppConfigRepository'

const routes = [
  // ===== 引导页（无底部导航） =====
  { path: '/onboarding', name: 'onboarding', component: () => import('@/views/Onboarding.vue') },

  // ===== Tab 页面（带底部导航） =====
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { tabBar: true }
  },
  {
    path: '/diary',
    name: 'diary',
    component: () => import('@/views/Calendar.vue'),
    meta: { tabBar: true }
  },
  {
    path: '/diary/write',
    name: 'diary-write',
    component: () => import('@/views/DiaryInput.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/progress',
    name: 'progress',
    component: () => import('@/views/Progress.vue'),
    meta: { tabBar: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/Settings.vue'),
    meta: { tabBar: true }
  },

  // ===== 覆盖层页面（无底部导航） =====
  {
    path: '/preview',
    name: 'preview',
    component: () => import('@/views/Preview.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/reader/:chapterId',
    name: 'reader',
    component: () => import('@/views/ChapterReader.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/Settings.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/settings/world',
    name: 'settings-world',
    component: () => import('@/views/SettingsWorld.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/settings/api',
    name: 'settings-api',
    component: () => import('@/views/SettingsApi.vue'),
    meta: { requireOnboarded: true }
  },
  {
    path: '/settings/data',
    name: 'settings-data',
    component: () => import('@/views/SettingsData.vue'),
    meta: { requireOnboarded: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

// 导航守卫：首次使用跳引导页
router.beforeEach(async (to) => {
  if (to.path === '/onboarding') return true
  try {
    const completed = await AppConfigRepository.get('onboarding_completed')
    if (completed !== '1') {
      return { path: '/onboarding' }
    }
  } catch (e) {
    console.warn('[Router] 数据库未就绪，跳转引导页:', e.message)
    return { path: '/onboarding' }
  }
  return true
})

export default router
