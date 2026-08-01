import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // 生产构建时 base 设为相对路径，便于 Capacitor 加载
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2018',
    // sql.js 通过 script 标签加载（public/sql-wasm-browser.js），不走 Vite 模块系统
    chunkSizeWarningLimit: 1500
  }
})
