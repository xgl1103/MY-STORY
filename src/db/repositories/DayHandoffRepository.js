// 每日故事交接状态。所有 JSON 在 Repository 边界序列化，业务层只处理对象。
import { queryOne, execute, markWrite } from '../Database.js'

const encode = value => JSON.stringify(value ?? (Array.isArray(value) ? [] : {}))
const parse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback } catch (_) { return fallback }
}

const normalize = row => row ? {
  ...row,
  endingScene: parse(row.ending_scene_json, {}),
  characterStates: parse(row.character_state_json, []),
  hardFacts: parse(row.hard_facts_json, []),
  unresolvedThreads: parse(row.unresolved_threads_json, []),
  prohibitedChanges: parse(row.prohibited_changes_json, []),
  choiceContext: parse(row.choice_context_json, null),
  factRecords: parse(row.fact_records_json, []),
  qualityIssues: parse(row.quality_issues_json, []),
} : null

export const DayHandoffRepository = {
  async getByDay(dayNumber) {
    return normalize(queryOne('SELECT * FROM day_handoff WHERE day_number = ?', [dayNumber]))
  },

  async getLatestBefore(dayNumber) {
    return normalize(queryOne(
      'SELECT * FROM day_handoff WHERE day_number < ? ORDER BY day_number DESC LIMIT 1',
      [dayNumber]
    ))
  },

  async upsert(data) {
    execute(
      `INSERT INTO day_handoff (
        day_number, segment_id, schema_version, ending_scene_json, character_state_json,
        hard_facts_json, active_goal, unfinished_action, immediate_next_action,
        unresolved_threads_json, prohibited_changes_json, choice_context_json,
        source, source_content_hash, quality_status, quality_issues_json,
        fact_records_json, fallback_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_number) DO UPDATE SET
        segment_id = excluded.segment_id, schema_version = excluded.schema_version,
        ending_scene_json = excluded.ending_scene_json,
        character_state_json = excluded.character_state_json,
        hard_facts_json = excluded.hard_facts_json, active_goal = excluded.active_goal,
        unfinished_action = excluded.unfinished_action,
        immediate_next_action = excluded.immediate_next_action,
        unresolved_threads_json = excluded.unresolved_threads_json,
        prohibited_changes_json = excluded.prohibited_changes_json,
        choice_context_json = excluded.choice_context_json, source = excluded.source,
        source_content_hash = excluded.source_content_hash,
        quality_status = excluded.quality_status,
        quality_issues_json = excluded.quality_issues_json,
        fact_records_json = excluded.fact_records_json,
        fallback_reason = excluded.fallback_reason, updated_at = CURRENT_TIMESTAMP`,
      [
        data.dayNumber, data.segmentId, data.schemaVersion || 1,
        encode(data.endingScene), encode(data.characterStates || []), encode(data.hardFacts || []),
        data.activeGoal || null, data.unfinishedAction || null, data.immediateNextAction || null,
        encode(data.unresolvedThreads || []), encode(data.prohibitedChanges || []),
        data.choiceContext == null ? null : encode(data.choiceContext),
        data.source || 'ai', data.sourceContentHash || '', data.qualityStatus || 'valid',
        encode(data.qualityIssues || []), encode(data.factRecords || []), data.fallbackReason || null,
      ]
    )
    await markWrite(true)
    return this.getByDay(data.dayNumber)
  },
}

export default DayHandoffRepository
