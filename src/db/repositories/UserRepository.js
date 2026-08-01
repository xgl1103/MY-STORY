// src/db/repositories/UserRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryOne, execute, markWrite } from '../Database.js'

export const UserRepository = {
  // 读取单行用户设置（id 固定为 1）
  async get() {
    const row = queryOne('SELECT * FROM user_settings WHERE id = 1')
    if (!row) throw new Error('E008: user_settings 默认行缺失')
    // sql.js 返回的 BOOLEAN 是 0/1，转成 JS boolean
    return {
      ...row,
      story_started: !!row.story_started
    }
  },

  // 部分字段更新，仅更新传入的字段
  async update(fields) {
    const allowed = [
      'hero_name', 'world_id', 'path_id', 'duration_days',
      'current_day', 'current_chapter', 'ai_provider', 'ai_base_url',
      'api_key_encrypted', 'ai_temperature', 'ai_max_tokens', 'story_started'
    ]
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    // story_started 是 BOOLEAN 字段，JS boolean 需转为 0/1
    const params = keys.map(k =>
      k === 'story_started' ? (fields[k] ? 1 : 0) : fields[k]
    )
    execute(`UPDATE user_settings SET ${setClause} WHERE id = 1`, params)
    await markWrite()
    return true
  }
}
