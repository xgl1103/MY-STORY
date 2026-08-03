// src/db/DataExporter.js
// 数据导出/导入，依据功能规划 7.3 节
// 导出 JSON 不含 world_settings、encounter_library、story_outline（预置配置）
import { queryOne, queryAll, execute, markWrite, runTransaction } from './Database.js'

// 导出全部用户数据为 JSON 对象
export async function exportData() {
  const user_settings = queryOne('SELECT * FROM user_settings WHERE id = 1')
  if (user_settings) {
    // 导出时不包含 api_key_encrypted（功能规划 10.3：不导出 API Key）
    delete user_settings.api_key_encrypted
  }

  return {
    version: '1.2',
    export_date: new Date().toISOString(),
    user_settings,
    diary_entries: queryAll('SELECT * FROM diary_entries ORDER BY day_number'),
    chapters: queryAll('SELECT * FROM chapters ORDER BY chapter_number'),
    story_segments: queryAll('SELECT * FROM story_segments ORDER BY day_number'),
    encounter_log: queryAll('SELECT * FROM encounter_log ORDER BY day_number'),
    narrative_node_state: queryAll('SELECT * FROM narrative_node_state ORDER BY node_id'),
    entity_state: queryAll('SELECT * FROM entity_state ORDER BY id'),
    foreshadowing: queryAll('SELECT * FROM foreshadowing ORDER BY id'),
    day_handoff: queryAll('SELECT * FROM day_handoff ORDER BY day_number'),
    story_plan: queryAll('SELECT * FROM story_plan ORDER BY id')
  }
}

// 从 JSON 对象导入（覆盖式）
// 使用事务确保原子性：中途失败自动回滚，不会丢失用户原有数据
export async function importData(data) {
  if (!data.version || !data.user_settings) {
    throw new Error('E014: 文件格式不正确，请选择有效的备份文件')
  }

  // 备份文件有意不含 API Key；导入时必须保留当前设备已有的加密密钥。
  const existingApiKey = queryOne('SELECT api_key_encrypted FROM user_settings WHERE id = 1')?.api_key_encrypted || null

  runTransaction(() => {
    // 清空用户数据表（保留预置配置表 world_settings/encounter_library/story_outline）
    execute('DELETE FROM story_plan')
    execute('DELETE FROM day_handoff')
    execute('DELETE FROM story_segments')
    execute('DELETE FROM chapters')
    execute('DELETE FROM diary_entries')
    execute('DELETE FROM encounter_log')
    execute('DELETE FROM narrative_node_state')
    execute('DELETE FROM entity_state')
    execute('DELETE FROM foreshadowing')
    execute('DELETE FROM user_settings')

    // 重新插入 user_settings（导入数据不含 api_key_encrypted，保留原 Key）
    const u = data.user_settings
    execute(
      `INSERT INTO user_settings (id, hero_name, world_id, path_id, duration_days,
        current_day, current_chapter, ai_provider, ai_base_url,
        ai_temperature, ai_max_tokens, story_started, api_key_encrypted)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.hero_name, u.world_id, u.path_id, u.duration_days, u.current_day,
       u.current_chapter, u.ai_provider, u.ai_base_url,
       u.ai_temperature, u.ai_max_tokens, u.story_started ? 1 : 0, existingApiKey]
    )

    // 逐表插入其余数据
    if (data.diary_entries) {
      for (const d of data.diary_entries) {
        execute(
          `INSERT INTO diary_entries (id, day_number, raw_text, behavior_tags, is_blank_day, mood, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [d.id, d.day_number, d.raw_text, d.behavior_tags, d.is_blank_day ? 1 : 0, d.mood ?? null, d.created_at]
        )
      }
    }

    if (data.chapters) {
      for (const c of data.chapters) {
        execute(
          `INSERT INTO chapters (id, chapter_number, title, content, summary,
            start_day, end_day, status, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.chapter_number, c.title, c.content, c.summary,
           c.start_day, c.end_day, c.status, c.created_at, c.completed_at]
        )
      }
    }

    if (data.story_segments) {
      for (const s of data.story_segments) {
        execute(
          `INSERT INTO story_segments (id, day_number, chapter_id, diary_id, content,
            mapping_desc, diary_references, revision_count, internal_review_count, is_edited, status,
            created_at, finalized_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.day_number, s.chapter_id, s.diary_id, s.content,
           s.mapping_desc, s.diary_references ?? null, s.revision_count, s.internal_review_count,
           s.is_edited ? 1 : 0, s.status, s.created_at, s.finalized_at]
        )
      }
    }

    if (data.encounter_log) {
      for (const e of data.encounter_log) {
        execute(
          `INSERT INTO encounter_log (id, day_number, encounter_id, content, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [e.id, e.day_number, e.encounter_id, e.content, e.created_at]
        )
      }
    }

    for (const row of data.narrative_node_state || []) {
      execute(`INSERT INTO narrative_node_state (node_id, world_id, status, selected_option_id, selected_option_desc, selected_effect, selected_day, completed_day, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.node_id, row.world_id, row.status, row.selected_option_id, row.selected_option_desc, row.selected_effect, row.selected_day, row.completed_day, row.updated_at])
    }
    for (const row of data.entity_state || []) {
      execute(`INSERT INTO entity_state (id, entity_type, entity_name, description, status, first_day, last_day, relations, notes, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.entity_type, row.entity_name, row.description, row.status, row.first_day, row.last_day, row.relations, row.notes, row.updated_at])
    }
    for (const row of data.foreshadowing || []) {
      execute(`INSERT INTO foreshadowing (id, planted_day, planted_chapter, description, priority, status, resolved_day, resolved_chapter, resolution, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.planted_day, row.planted_chapter, row.description, row.priority, row.status, row.resolved_day, row.resolved_chapter, row.resolution, row.created_at])
    }
    for (const row of data.day_handoff || []) {
      execute(`INSERT INTO day_handoff (id, day_number, segment_id, schema_version, ending_scene_json, character_state_json, hard_facts_json, active_goal, unfinished_action, immediate_next_action, unresolved_threads_json, prohibited_changes_json, choice_context_json, source, source_content_hash, quality_status, quality_issues_json, fact_records_json, fallback_reason, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.day_number, row.segment_id, row.schema_version, row.ending_scene_json, row.character_state_json, row.hard_facts_json, row.active_goal, row.unfinished_action, row.immediate_next_action, row.unresolved_threads_json, row.prohibited_changes_json, row.choice_context_json, row.source, row.source_content_hash, row.quality_status || 'valid', row.quality_issues_json || '[]', row.fact_records_json || '[]', row.fallback_reason ?? null, row.created_at, row.updated_at])
    }
    for (const row of data.story_plan || []) {
      execute(`INSERT INTO story_plan (id, day_number, segment_id, previous_handoff_day, schema_version, plan_json, status, source, input_fingerprint, validation_errors_json, review_findings_json, repair_count, final_verification_status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.day_number, row.segment_id, row.previous_handoff_day, row.schema_version, row.plan_json, row.status, row.source, row.input_fingerprint, row.validation_errors_json, row.review_findings_json || '[]', row.repair_count || 0, row.final_verification_status ?? null, row.created_at, row.updated_at])
    }
  }) // 事务结束：全部成功则 COMMIT，任一失败则 ROLLBACK

  await markWrite(true)
}
