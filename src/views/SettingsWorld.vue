<template>
  <div class="settings-world">
    <header class="top-bar">
      <button class="back-btn" @click="goBack">返回</button>
      <h2>世界观与途径</h2>
      <span />
    </header>

    <div class="content">
      <!-- 主角名编辑 -->
      <div class="section">
        <h3>主角名</h3>
        <div class="card">
          <div class="hero-edit">
            <input
              v-model="heroName"
              class="hero-input"
              placeholder="你"
              maxlength="20"
              :disabled="!editingHero"
            />
            <button v-if="!editingHero" class="edit-btn" @click="startEditHero">修改</button>
            <button v-else class="save-btn" :disabled="savingHero" @click="saveHeroName">
              {{ savingHero ? '保存中...' : '保存' }}
            </button>
          </div>
          <p v-if="heroMsg" :class="['hero-msg', heroSuccess ? 'success' : 'fail']">{{ heroMsg }}</p>
        </div>
      </div>

      <!-- 当前世界观 -->
      <div class="section">
        <h3>当前世界观</h3>
        <div class="card">
          <p class="world-name">{{ world.world_name }}</p>
          <p class="world-desc">{{ world.description }}</p>
        </div>
      </div>

      <!-- 当前途径 -->
      <div class="section">
        <h3>当前途径</h3>
        <div class="card">
          <p class="path-name">{{ seerPath.path_name }}</p>
          <p class="path-desc">{{ seerPath.description }}</p>
          <div class="levels">
            <div v-for="lvl in seerPath.levels" :key="lvl.level" class="level-row">
              <span class="lvl-name">{{ lvl.name }}</span>
              <span class="lvl-abilities">{{ lvl.abilities.join('、') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 行为映射规则预览 -->
      <div class="section">
        <h3>行为映射规则</h3>
        <p class="section-hint">你的日常行为将被映射为世界观内的活动</p>
        <div class="mapping-list">
          <div
            v-for="m in mappings"
            :key="m.behavior"
            class="mapping-card"
            @click="toggleExpand(m.behavior)"
          >
            <div class="mapping-head">
              <span class="m-behavior">{{ m.behavior }}</span>
              <span class="m-arrow">→</span>
              <span class="m-world">{{ m.world_behavior }}</span>
              <span class="m-expand-icon" :class="{ expanded: expandedSet.has(m.behavior) }">›</span>
            </div>
            <div v-if="expandedSet.has(m.behavior)" class="mapping-detail">
              <p class="m-desc">{{ m.description }}</p>
              <div class="m-keywords">
                <span v-for="kw in m.keywords.slice(0, 8)" :key="kw" class="kw-tag">{{ kw }}</span>
                <span v-if="m.keywords.length > 8" class="kw-more">+{{ m.keywords.length - 8 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 故事设定 -->
      <div class="section">
        <h3>故事设定</h3>
        <div class="card">
          <div class="info-row">
            <span>故事时长</span>
            <span>{{ user?.duration_days || world.default_duration }} 天</span>
          </div>
          <div class="info-row">
            <span>当前进度</span>
            <span>第 {{ user?.current_day || 0 }} 天 · 第 {{ (user?.current_chapter ?? 0) === 0 ? '序章' : user.current_chapter + ' 章' }}</span>
          </div>
        </div>
      </div>

      <p class="hint">更多世界观和途径将在后续版本中开放</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import worldJson from '@/config/worlds/lord_of_mysteries/world.json'
import pathsJson from '@/config/worlds/lord_of_mysteries/paths.json'
import mappingsJson from '@/config/worlds/lord_of_mysteries/mappings.json'

const router = useRouter()
const user = ref(null)
const world = worldJson

// 返回（history 兜底）
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/settings')
}

const seerPath = pathsJson.paths.find(p => p.path_id === 'seer') || pathsJson.paths[0] || {}
const mappings = mappingsJson.mappings || []

// ===== 主角名编辑 =====
const heroName = ref('你')
const editingHero = ref(false)
const savingHero = ref(false)
const heroMsg = ref('')
const heroSuccess = ref(false)

function startEditHero() {
  editingHero.value = true
  heroMsg.value = ''
}

async function saveHeroName() {
  const name = heroName.value.trim()
  if (!name) {
    heroMsg.value = '主角名不能为空'
    heroSuccess.value = false
    return
  }
  savingHero.value = true
  try {
    await UserRepository.update({ hero_name: name })
    if (user.value) user.value.hero_name = name
    heroMsg.value = '保存成功'
    heroSuccess.value = true
    editingHero.value = false
  } catch (e) {
    heroMsg.value = `保存失败：${(e && e.message) || '未知错误'}`
    heroSuccess.value = false
  } finally {
    savingHero.value = false
  }
}

// ===== 映射规则展开/收起 =====
const expandedSet = ref(new Set())

function toggleExpand(behavior) {
  const next = new Set(expandedSet.value)
  if (next.has(behavior)) {
    next.delete(behavior)
  } else {
    next.add(behavior)
  }
  expandedSet.value = next
}

onMounted(async () => {
  try {
    user.value = await UserRepository.get()
    heroName.value = user.value?.hero_name || '你'
  } catch (e) {
    console.error('[SettingsWorld] 加载用户信息失败:', e)
  }
})
</script>

<style scoped>
.settings-world { min-height: 100vh; display: flex; flex-direction: column; }

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
.section h3 { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); }
.section-hint { font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); }

.card {
  background: var(--color-surface); border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

/* 主角名编辑 */
.hero-edit { display: flex; gap: var(--spacing-sm); align-items: center; }
.hero-input {
  flex: 1; padding: 10px var(--spacing-md);
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); color: var(--color-text); font-size: var(--font-size-base);
}
.hero-input:disabled { opacity: 0.8; border-color: transparent; }
.edit-btn, .save-btn {
  padding: 8px 20px; border-radius: var(--radius-sm); font-size: var(--font-size-sm); white-space: nowrap;
}
.edit-btn {
  background: var(--color-surface); border: 1px solid var(--color-primary);
  color: var(--color-primary-light);
}
.save-btn {
  background: var(--color-primary); color: #fff;
}
.save-btn:disabled { opacity: 0.5; }
.hero-msg { font-size: var(--font-size-sm); margin-top: var(--spacing-sm); }
.hero-msg.success { color: var(--color-success); }
.hero-msg.fail { color: var(--color-error); }

/* 世界观 */
.world-name { font-size: var(--font-size-lg); color: var(--color-primary-light); margin-bottom: var(--spacing-sm); }
.world-desc { font-size: var(--font-size-sm); color: var(--color-text); line-height: 1.6; }

/* 途径 */
.path-name { font-size: var(--font-size-base); color: var(--color-primary-light); margin-bottom: var(--spacing-sm); }
.path-desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.6; margin-bottom: var(--spacing-md); }

.levels { border-top: 1px solid var(--color-border); padding-top: var(--spacing-sm); }
.level-row { display: flex; gap: var(--spacing-sm); padding: var(--spacing-xs) 0; }
.lvl-name { font-size: var(--font-size-sm); color: var(--color-text); min-width: 80px; }
.lvl-abilities { font-size: var(--font-size-sm); color: var(--color-text-secondary); }

/* 映射规则 */
.mapping-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }

.mapping-card {
  background: var(--color-surface); border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background 0.2s;
}

.mapping-card:active {
  background: var(--color-border);
}

.mapping-head {
  display: flex; align-items: center; gap: var(--spacing-sm);
}

.m-behavior {
  font-size: var(--font-size-sm); color: var(--color-primary-light);
  font-weight: 600; min-width: 40px;
}

.m-arrow { color: var(--color-text-secondary); font-size: 14px; }

.m-world {
  flex: 1; font-size: var(--font-size-sm); color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.m-expand-icon {
  font-size: 18px; color: var(--color-text-secondary);
  transition: transform 0.2s;
}
.m-expand-icon.expanded { transform: rotate(90deg); }

.mapping-detail {
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--color-border);
}

.m-desc {
  font-size: var(--font-size-sm); color: var(--color-text-secondary);
  line-height: 1.6; margin-bottom: var(--spacing-sm);
}

.m-keywords { display: flex; flex-wrap: wrap; gap: 4px; }

.kw-tag {
  font-size: 11px; padding: 2px 8px;
  background: var(--color-border); border-radius: 8px; color: var(--color-text);
}

.kw-more {
  font-size: 11px; padding: 2px 6px; color: var(--color-text-secondary);
}

/* 故事设定 */
.info-row { display: flex; justify-content: space-between; padding: var(--spacing-sm) 0; font-size: var(--font-size-sm); }
.info-row span:first-child { color: var(--color-text-secondary); }
.info-row span:last-child { color: var(--color-text); }

.hint { text-align: center; color: var(--color-text-secondary); font-size: 12px; margin-top: var(--spacing-lg); }
</style>
