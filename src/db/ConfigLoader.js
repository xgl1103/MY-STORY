// src/db/ConfigLoader.js
// 配置文件加载器：从 JSON 加载世界观配置到数据库
// 依据角色分工第五章，首次启动时执行一次
import { execute, markWrite, runTransaction } from './Database.js'
import { AppConfigRepository } from './repositories/AppConfigRepository.js'

// 配置 JSON 通过 Vite 的 import 直接打包（静态导入）
import worldJson from '@/config/worlds/lord_of_mysteries/world.json'
import pathsJson from '@/config/worlds/lord_of_mysteries/paths.json'
import mappingsJson from '@/config/worlds/lord_of_mysteries/mappings.json'
import outlineJson from '@/config/worlds/lord_of_mysteries/outline.json'
import encountersJson from '@/config/worlds/lord_of_mysteries/encounters.json'
import settingsJson from '@/config/worlds/lord_of_mysteries/settings.json'

const WORLD_ID = 'lord_of_mysteries'

// 入口：首次启动加载配置，已加载则跳过
export async function loadConfigIfNeeded() {
  const loaded = await AppConfigRepository.get('config_loaded')
  if (loaded === '1') return

  await loadAllConfigs()
  await AppConfigRepository.set('config_loaded', '1')
  await markWrite(true) // 配置加载完成，强制写回
}

async function loadAllConfigs() {
  validateWorld(worldJson)
  validatePaths(pathsJson)
  validateMappings(mappingsJson)
  validateOutline(outlineJson)
  validateEncounters(encountersJson)
  validateSettings(settingsJson)

  // 使用事务确保原子性：中途失败自动回滚，不会残留部分配置导致重复加载
  runTransaction(() => {
    // 1. world_settings 表：写入 settings.json 的设定档案
    for (const s of settingsJson.settings) {
      execute(
        `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [WORLD_ID, s.category, s.key, s.value, s.keywords || '', s.priority || 0]
      )
    }

    // 2. world_settings 表：写入 mappings.json 的映射规则（category='mapping'）
    // value 存储 JSON（含 world_behavior 和 description），供 getMappings() 解析
    for (const m of mappingsJson.mappings) {
      execute(
        `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
         VALUES (?, 'mapping', ?, ?, ?, 5)`,
        [WORLD_ID, m.behavior,
         JSON.stringify({ world_behavior: m.world_behavior, description: m.description || '' }),
         (m.keywords || []).join(' ')]
      )
    }

    // 3. encounter_library 表：写入奇遇库
    for (const e of encountersJson.encounters) {
      execute(
        `INSERT INTO encounter_library
         (world_id, encounter_id, title, content_template, min_chapter,
          max_chapter, min_path_level, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [WORLD_ID, e.encounter_id, e.title, e.content_template,
         e.min_chapter || 0, e.max_chapter || 99,
         e.min_path_level || 0, JSON.stringify(e.tags || [])]
      )
    }

    // 4. story_outline 表：写入剧情大纲节点
    for (const n of outlineJson.outline) {
      execute(
        `INSERT INTO story_outline
         (world_id, chapter_number, node_id, node_type, trigger_day,
          content, prerequisites, branch_options)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [WORLD_ID, n.chapter_number, n.node_id, n.node_type, n.trigger_day || null,
         n.content, JSON.stringify(n.prerequisites || []),
         JSON.stringify(n.branch_options || [])]
      )
    }

    // 5. paths.json 的途径能力写入 world_settings（category='path'）供 AI 层 RAG 检索
    for (const p of pathsJson.paths) {
      if (!p.available) continue
      for (const lvl of p.levels) {
        execute(
          `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
           VALUES (?, 'path', ?, ?, ?, 10)`,
          [WORLD_ID, `${p.path_id}_lv${lvl.level}`,
           `${lvl.name}：能力[${lvl.abilities.join(',')}]；${lvl.description}`,
           `${p.path_name} 序列${lvl.level} ${lvl.abilities.join(' ')}`]
        )
      }
    }
  }) // 事务结束

  // 注：world.json 和 paths.json 供 UI 直接使用（不需入表），
  // 通过 Vite 静态 import 在前端模块内直接使用
}

// ===== 格式校验（对应角色分工 5.2 节 Schema）=====
function validateWorld(j) {
  if (!j.world_id || !j.world_name || !j.chapters) {
    throw new Error('E014: world.json 格式不正确')
  }
}
function validatePaths(j) {
  if (!j.world_id || !Array.isArray(j.paths)) {
    throw new Error('E014: paths.json 格式不正确')
  }
}
function validateMappings(j) {
  if (!j.world_id || !Array.isArray(j.mappings)) {
    throw new Error('E014: mappings.json 格式不正确')
  }
  for (const m of j.mappings) {
    if (!m.behavior || !m.world_behavior || !Array.isArray(m.keywords)) {
      throw new Error('E014: mappings.json 映射项缺字段')
    }
  }
}
function validateOutline(j) {
  if (!j.world_id || !Array.isArray(j.outline)) {
    throw new Error('E014: outline.json 格式不正确')
  }
}
function validateEncounters(j) {
  if (!j.world_id || !Array.isArray(j.encounters)) {
    throw new Error('E014: encounters.json 格式不正确')
  }
}
function validateSettings(j) {
  if (!j.world_id || !Array.isArray(j.settings)) {
    throw new Error('E014: settings.json 格式不正确')
  }
}

// 导出 world.json 和 paths.json 供 UI 直接使用
export { worldJson, pathsJson }
