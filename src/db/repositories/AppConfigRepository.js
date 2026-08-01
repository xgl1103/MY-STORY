// src/db/repositories/AppConfigRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryOne, queryAll, execute, markWrite } from '../Database.js'

export const AppConfigRepository = {
  async get(key) {
    const row = queryOne('SELECT value FROM app_config WHERE key = ?', [key])
    return row ? row.value : null
  },

  async set(key, value) {
    execute(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    )
    await markWrite()
    return true
  },

  async getAll() {
    const rows = queryAll('SELECT key, value FROM app_config')
    const result = {}
    for (const r of rows) result[r.key] = r.value
    return result
  }
}
