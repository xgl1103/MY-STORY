<template>
  <div class="settings-data">
    <header class="top-bar">
      <button class="back-btn" @click="goBack">返回</button>
      <h2>数据管理</h2>
      <span />
    </header>

    <div class="content">
      <div class="section">
        <h3>导出数据</h3>
        <p class="section-desc">将你的故事数据导出为 JSON 文件，可用于备份或迁移。</p>
        <button class="action-btn" :disabled="exporting" @click="doExport">
          {{ exporting ? '导出中...' : '导出为 JSON 文件' }}
        </button>
      </div>

      <div class="section">
        <h3>导入数据</h3>
        <p class="section-desc">从 JSON 备份文件恢复数据。注意：导入会覆盖当前数据。</p>
        <label class="file-label">
          <input type="file" accept=".json" @change="onFileSelected" />
          <span class="file-btn">{{ importing ? '导入中...' : '选择文件导入' }}</span>
        </label>
        <p v-if="importResult" :class="['import-result', importSuccess ? 'success' : 'fail']">{{ importResult }}</p>
      </div>

      <div class="section">
        <h3>数据统计</h3>
        <div class="card">
          <div class="stat-row"><span>日记条目</span><span>{{ stats.diaries }} 条</span></div>
          <div class="stat-row"><span>故事段落</span><span>{{ stats.segments }} 段</span></div>
          <div class="stat-row"><span>已完成章节</span><span>{{ stats.chapters }} 章</span></div>
          <div class="stat-row"><span>奇遇记录</span><span>{{ stats.encounters }} 次</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { exportData, importData } from '@/db/DataExporter'
import { queryAll } from '@/db/Database'

const router = useRouter()

// 返回（history 兜底）
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/settings')
}
const exporting = ref(false)
const importing = ref(false)
const importResult = ref('')
const importSuccess = ref(false)
const stats = ref({ diaries: 0, segments: 0, chapters: 0, encounters: 0 })

async function doExport() {
  exporting.value = true
  try {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mystory_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert(`导出失败：${e.message}`)
  } finally {
    exporting.value = false
  }
}

async function onFileSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  // 文件大小限制（50MB）
  if (file.size > 50 * 1024 * 1024) {
    importResult.value = '文件过大（超过 50MB），请检查是否选择了正确的备份文件'
    importSuccess.value = false
    e.target.value = ''
    return
  }
  if (!confirm('导入将覆盖当前所有数据，确定继续吗？')) {
    e.target.value = ''
    return
  }
  importing.value = true
  importResult.value = ''
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await importData(data)
    importResult.value = '导入成功！'
    importSuccess.value = true
    await loadStats()
  } catch (e) {
    importResult.value = `导入失败：${(e && e.message) || '未知错误'}`
    importSuccess.value = false
  } finally {
    importing.value = false
    e.target.value = ''
  }
}

async function loadStats() {
  try {
    stats.value = {
      diaries: queryAll('SELECT COUNT(*) as c FROM diary_entries')[0]?.c || 0,
      segments: queryAll('SELECT COUNT(*) as c FROM story_segments')[0]?.c || 0,
      chapters: queryAll("SELECT COUNT(*) as c FROM chapters WHERE status = 'completed'")[0]?.c || 0,
      encounters: queryAll('SELECT COUNT(*) as c FROM encounter_log')[0]?.c || 0
    }
  } catch (e) { /* ignore */ }
}

onMounted(loadStats)
</script>

<style scoped>
.settings-data { min-height: 100vh; display: flex; flex-direction: column; }

.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-md);
  padding-top: calc(var(--spacing-md) + env(safe-area-inset-top, 0px));
  background: var(--color-surface); position: sticky; top: 0; z-index: 10;
}
.top-bar h2 { font-size: var(--font-size-lg); color: var(--color-text); }
.back-btn { background: none; color: var(--color-primary-light); font-size: var(--font-size-sm); }
.top-bar > span { width: 40px; }

.content { padding: var(--spacing-md); }

.section { margin-bottom: var(--spacing-lg); }
.section h3 { font-size: var(--font-size-base); color: var(--color-text); margin-bottom: var(--spacing-xs); }
.section-desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); line-height: 1.5; }

.action-btn {
  width: 100%; padding: 12px; background: var(--color-primary);
  border-radius: var(--radius-sm); color: #fff; font-size: var(--font-size-sm);
}
.action-btn:disabled { opacity: 0.5; }

.file-label { position: relative; display: block; }
.file-label input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.file-btn {
  display: block; text-align: center; padding: 12px; background: var(--color-surface);
  border: 1px solid var(--color-primary); border-radius: var(--radius-sm);
  color: var(--color-primary-light); font-size: var(--font-size-sm);
}

.import-result { text-align: center; font-size: var(--font-size-sm); margin-top: var(--spacing-sm); }
.import-result.success { color: var(--color-success); }
.import-result.fail { color: var(--color-error); }

.card { background: var(--color-surface); border-radius: var(--radius-md); padding: var(--spacing-md); }
.stat-row { display: flex; justify-content: space-between; padding: var(--spacing-sm) 0; font-size: var(--font-size-sm); border-bottom: 1px solid var(--color-border); }
.stat-row:last-child { border-bottom: none; }
.stat-row span:first-child { color: var(--color-text-secondary); }
.stat-row span:last-child { color: var(--color-text); }
</style>
