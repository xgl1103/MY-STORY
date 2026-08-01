// src/db/repositories/DiaryRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryOne, queryAll, execute, markWrite } from '../Database.js'

export const DiaryRepository = {
  // behavior_tags 数组在入库时序列化为 JSON 字符串
  async create(data) {
    const tagsJson = JSON.stringify(data.behavior_tags || [])
    execute(
      `INSERT INTO diary_entries (day_number, raw_text, behavior_tags, is_blank_day, mood)
       VALUES (?, ?, ?, ?, ?)`,
      [data.day_number, data.raw_text, tagsJson, data.is_blank_day ? 1 : 0, data.mood || null]
    )
    // 同步取 last_insert_rowid，避免 await markWrite 期间被并发 INSERT 覆盖
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  async getByDay(dayNumber) {
    const row = queryOne('SELECT * FROM diary_entries WHERE day_number = ?', [dayNumber])
    return row ? normalize(row) : null
  },

  async getById(id) {
    const row = queryOne('SELECT * FROM diary_entries WHERE id = ?', [id])
    return row ? normalize(row) : null
  },

  async getByRange(startDay, endDay) {
    const rows = queryAll(
      'SELECT * FROM diary_entries WHERE day_number BETWEEN ? AND ? ORDER BY day_number',
      [startDay, endDay]
    )
    return rows.map(normalize)
  },

  async getAll() {
    const rows = queryAll('SELECT * FROM diary_entries ORDER BY day_number DESC')
    return rows.map(normalize)
  },

  async update(id, fields) {
    const allowed = ['raw_text', 'behavior_tags', 'is_blank_day', 'mood']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    // behavior_tags 若为数组则序列化
    const params = keys.map(k =>
      k === 'behavior_tags' && Array.isArray(fields[k])
        ? JSON.stringify(fields[k])
        : (k === 'is_blank_day' ? (fields[k] ? 1 : 0) : fields[k])
    )
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    execute(`UPDATE diary_entries SET ${setClause} WHERE id = ?`, [...params, id])
    await markWrite()
    return true
  }
}

// 出库时把 is_blank_day 转 boolean
// behavior_tags 保持 JSON 字符串（接口要求返回 JSON 字符串，由调用方按需 JSON.parse）
function normalize(row) {
  return {
    ...row,
    is_blank_day: !!row.is_blank_day
  }
}
