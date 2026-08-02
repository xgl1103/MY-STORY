import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
const wasmPath = fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
const storage = new Map()
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
globalThis.window = { initSqlJs: options => initSqlJs({ ...options, locateFile: () => wasmPath }) }

const [{ initDatabase, execute, queryOne, queryAll, markWrite }, { exportData, importData }] = await Promise.all([
  import('../src/db/Database.js'),
  import('../src/db/DataExporter.js'),
])

await initDatabase()
execute(`INSERT OR REPLACE INTO user_settings (id, hero_name, world_id, path_id, duration_days, current_day, current_chapter, ai_provider, ai_temperature, ai_max_tokens, story_started, api_key_encrypted)
         VALUES (1, '林墨', 'lord_of_mysteries', 'seer', 90, 1, 0, 'deepseek', 0.7, 2200, 1, 'device-key-must-stay-local')`)
execute(`INSERT INTO diary_entries (id, day_number, raw_text, behavior_tags, is_blank_day, mood) VALUES (1, 1, '整理调查笔记', '["学习"]', 0, '平静')`)
execute(`INSERT INTO chapters (id, chapter_number, title, start_day, end_day, status) VALUES (1, 0, '序章', 1, 5, 'ongoing')`)
execute(`INSERT INTO story_segments (id, day_number, chapter_id, diary_id, content, mapping_desc, diary_references, status) VALUES (1, 1, 1, 1, '林墨在旧仓库前收起铜制怀表。', '[]', '[{"diarySnippet":"整理调查笔记"}]', 'finalized')`)
execute(`INSERT INTO day_handoff (day_number, segment_id, schema_version, ending_scene_json, character_state_json, hard_facts_json, active_goal, unfinished_action, immediate_next_action, unresolved_threads_json, prohibited_changes_json, source, source_content_hash)
         VALUES (1, 1, 1, '{}', '[]', '["怀表为铜制"]', '追查纹章', '收起怀表', '前往旧仓库', '[]', '["不得改材质"]', 'ai', 'handoff-hash')`)
execute(`INSERT INTO story_plan (day_number, segment_id, schema_version, plan_json, status, source, input_fingerprint) VALUES (2, 1, 1, '{"dayNumber":2}', 'used', 'ai', 'plan-hash')`)
await markWrite(true)

const backup = await exportData()
assert.equal(backup.version, '1.1')
assert.equal(Object.hasOwn(backup.user_settings, 'api_key_encrypted'), false, '导出不得包含设备 API Key')
assert.equal(backup.diary_entries[0].mood, '平静')
assert.equal(backup.story_segments[0].diary_references, '[{"diarySnippet":"整理调查笔记"}]')
assert.equal(backup.day_handoff.length, 1)
assert.equal(backup.story_plan.length, 1)

await importData(backup)
assert.equal(queryOne('SELECT api_key_encrypted FROM user_settings WHERE id = 1').api_key_encrypted, 'device-key-must-stay-local', '导入不得清除当前设备 API Key')
assert.equal(queryOne('SELECT mood FROM diary_entries WHERE id = 1').mood, '平静')
assert.equal(queryOne('SELECT diary_references FROM story_segments WHERE id = 1').diary_references, '[{"diarySnippet":"整理调查笔记"}]')
assert.equal(queryAll('SELECT * FROM day_handoff').length, 1)
assert.equal(queryAll('SELECT * FROM story_plan').length, 1)

console.log('DATA_EXPORT_PLANNING_TEST_PASS')
