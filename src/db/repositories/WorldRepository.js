// src/db/repositories/WorldRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryAll, execute, markWrite } from '../Database.js'

export const WorldRepository = {
  // 按 world_id（+可选 category）查询设定档案
  async getSettings(worldId, category) {
    const sql = category
      ? `SELECT * FROM world_settings WHERE world_id = ? AND category = ? ORDER BY priority DESC`
      : `SELECT * FROM world_settings WHERE world_id = ? ORDER BY priority DESC`
    return queryAll(sql, category ? [worldId, category] : [worldId])
  },

  // 关键词检索（RAG 第三层档案记忆，功能规划 5.5）
  // keywords 数组在 keywords 字段（空格分隔）上做 LIKE 匹配，按 priority 加权排序
  async searchByKeywords(worldId, keywords, limit = 5) {
    if (!keywords || keywords.length === 0) return []
    // 转义 LIKE 通配符（%、_），避免关键词中含特殊字符导致误匹配
    const escapeLike = s => s.replace(/[%_\\]/g, c => '\\' + c)
    // 构造 OR 条件：每个关键词 LIKE '%kw%' ESCAPE '\'
    const conditions = keywords.map(() => `keywords LIKE ? ESCAPE '\\'`).join(' OR ')
    const params = keywords.map(k => `%${escapeLike(k)}%`)
    const sql = `
      SELECT * FROM world_settings
      WHERE world_id = ? AND (${conditions})
      ORDER BY priority DESC
      LIMIT ?`
    return queryAll(sql, [worldId, ...params, limit])
  },

  // 取符合章节/途径等级条件的奇遇（功能规划 8.5 节触发逻辑）
  async getEncounters(worldId, chapterNumber, pathLevel) {
    return queryAll(
      `SELECT encounter_id, title, content_template, min_chapter, max_chapter, min_path_level, tags
       FROM encounter_library
       WHERE world_id = ? AND min_chapter <= ? AND max_chapter >= ?
         AND min_path_level <= ?`,
      [worldId, chapterNumber, chapterNumber, pathLevel]
    )
  },

  // 已触发过的奇遇 ID 列表（用于去重，功能规划 8.5）
  async getLogEncounterIds() {
    const rows = queryAll(
      `SELECT DISTINCT encounter_id FROM encounter_log WHERE encounter_id IS NOT NULL`
    )
    return rows.map(r => r.encounter_id)
  },

  async logEncounter(dayNumber, encounterId, content) {
    execute(
      `INSERT INTO encounter_log (day_number, encounter_id, content) VALUES (?, ?, ?)`,
      [dayNumber, encounterId, content]
    )
    await markWrite()
    return true
  },

  async getOutlineNodes(worldId, chapterNumber) {
    return queryAll(
      `SELECT node_id, node_type, trigger_day, content, prerequisites, branch_options
       FROM story_outline
       WHERE world_id = ? AND chapter_number = ?
       ORDER BY trigger_day`,
      [worldId, chapterNumber]
    )
  },

  async getAllOutlineNodes(worldId) {
    return queryAll(
      `SELECT node_id, node_type, trigger_day, content, prerequisites, branch_options, chapter_number
       FROM story_outline WHERE world_id = ? ORDER BY trigger_day`,
      [worldId]
    )
  },

  // 映射规则：从 world_settings 表读取（category='mapping'）
  // key=behavior, value=JSON{world_behavior, description}, keywords=空格分隔
  async getMappings(worldId) {
    const rows = queryAll(
      `SELECT key, value, keywords FROM world_settings
       WHERE world_id = ? AND category = 'mapping'`,
      [worldId]
    )
    return rows.map(r => {
      // value 存储为 JSON（含 world_behavior 和 description）
      let parsed = {}
      try { parsed = JSON.parse(r.value) } catch { parsed = { world_behavior: r.value, description: '' } }
      return {
        behavior: r.key,
        world_behavior: parsed.world_behavior || r.value,
        keywords: r.keywords ? r.keywords.split(' ').filter(Boolean) : [],
        description: parsed.description || ''
      }
    })
  }
}
