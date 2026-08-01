// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initDatabase } from './db/Database'
import { loadConfigIfNeeded } from './db/ConfigLoader'
import { initStoryEngine } from './core'

// 全局样式
import './assets/main.css'

// 显示致命错误 UI（数据库初始化失败等）
function showFatalError(message) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;padding:32px;text-align:center;
                font-family:system-ui,-apple-system,sans-serif;color:#e0e0e0;background:#1a1a2e;">
      <h2 style="margin-bottom:16px;font-size:20px;">应用初始化失败</h2>
      <p style="margin-bottom:24px;color:#999;font-size:14px;max-width:320px;word-break:break-all;">
        ${message}
      </p>
      <button onclick="location.reload()"
        style="padding:12px 32px;font-size:16px;border:none;border-radius:8px;
               background:#4a4ae0;color:#fff;cursor:pointer;">
        重试
      </button>
    </div>
  `
}

async function bootstrap() {
  // 1. 初始化数据库（核心依赖，失败则显示致命错误，不继续后续步骤）
  try {
    await initDatabase()
    console.log('[MyStory] 数据库初始化成功')
  } catch (e) {
    console.error('[MyStory] 数据库初始化失败:', e)
    showFatalError(`数据库初始化失败：${e.message}`)
    return // 不继续后续初始化
  }

  // 2. 加载世界观配置（首次启动）— 非致命，失败仍可运行
  try {
    await loadConfigIfNeeded()
    console.log('[MyStory] 配置加载完成')
  } catch (e) {
    console.error('[MyStory] 配置加载失败:', e)
  }

  // 3. 初始化 StoryEngine（Mock 或真实）— 非致命，失败仍可运行
  try {
    await initStoryEngine()
    console.log('[MyStory] StoryEngine 初始化完成')
  } catch (e) {
    console.error('[MyStory] StoryEngine 初始化失败:', e)
  }

  // 4. 创建 Vue 应用
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)

  // 全局错误处理：捕获 Vue 渲染异常，防止白屏
  app.config.errorHandler = (err, instance, info) => {
    console.error('[MyStory] Vue 运行时错误:', err, info)
  }

  app.mount('#app')
}

// 捕获未处理的 Promise 异常
window.addEventListener('unhandledrejection', (e) => {
  console.error('[MyStory] 未处理的 Promise 异常:', e.reason)
})

bootstrap()
