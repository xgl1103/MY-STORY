// Writer 与 Critical 共用的当天剧情计划持久化。
import { queryOne, execute, markWrite } from '../Database.js'

const parse = (value, fallback = null) => {
  try { return value ? JSON.parse(value) : fallback } catch (_) { return fallback }
}
const normalize = row => row ? { ...row, plan: parse(row.plan_json, {}), validationErrors: parse(row.validation_errors_json, []) } : null

export const StoryPlanRepository = {
  async getLatestForSegment(segmentId) {
    return normalize(queryOne(
      `SELECT * FROM story_plan WHERE segment_id = ? AND status IN ('planned', 'used')
       ORDER BY id DESC LIMIT 1`,
      [segmentId]
    ))
  },

  async getReusable(segmentId, inputFingerprint) {
    return normalize(queryOne(
      `SELECT * FROM story_plan
       WHERE segment_id = ? AND input_fingerprint = ? AND status IN ('planned', 'used')
       ORDER BY id DESC LIMIT 1`,
      [segmentId, inputFingerprint]
    ))
  },

  async upsert(data) {
    const existing = await this.getReusable(data.segmentId, data.inputFingerprint)
    if (existing) return existing
    execute(
      `INSERT INTO story_plan (
        day_number, segment_id, previous_handoff_day, schema_version, plan_json,
        status, source, input_fingerprint, validation_errors_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.dayNumber, data.segmentId, data.previousHandoffDay ?? null,
        data.schemaVersion || 1, JSON.stringify(data.plan || {}), data.status || 'planned',
        data.source || 'ai', data.inputFingerprint, JSON.stringify(data.validationErrors || []),
      ]
    )
    // 必须在 markWrite 前读取，持久化过程可能重建 sql.js 连接并丢失 last_insert_rowid 状态。
    const inserted = normalize(queryOne('SELECT * FROM story_plan WHERE id = last_insert_rowid()'))
    await markWrite(true)
    return inserted
  },

  async markUsed(id) {
    execute(`UPDATE story_plan SET status = 'used', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id])
    await markWrite()
  },

  async invalidateForSegment(segmentId) {
    execute(`UPDATE story_plan SET status = 'invalidated', updated_at = CURRENT_TIMESTAMP
             WHERE segment_id = ? AND status IN ('planned', 'used')`, [segmentId])
    await markWrite()
  },
}

export default StoryPlanRepository
