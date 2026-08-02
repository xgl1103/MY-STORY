// 真实 SQLite 记忆闭环测试：使用 sql.js 内存数据库，而非 Mock 记忆仓库。
// AI 输出是确定性的，验证目标是数据库写入、读取和状态推进，不受模型随机性影响。
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
const wasmPath = fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}
globalThis.window = { initSqlJs: options => initSqlJs({ ...options, locateFile: () => wasmPath }) }

const [{ initDatabase }, { default: StoryEngine }, { NarrativeStateRepository }, { EntityRepository }, { ForeshadowingRepository }, { default: MockUserRepository }, { default: MockDiaryRepository }, { default: MockChapterRepository }, { default: MockSegmentRepository }, { default: MockWorldRepository }] = await Promise.all([
  import('../src/db/Database.js'),
  import('../src/core/StoryEngine.js'),
  import('../src/db/repositories/NarrativeStateRepository.js'),
  import('../src/db/repositories/EntityRepository.js'),
  import('../src/db/repositories/ForeshadowingRepository.js'),
  import('../mock/MockUserRepository.js'),
  import('../mock/MockDiaryRepository.js'),
  import('../mock/MockChapterRepository.js'),
  import('../mock/MockSegmentRepository.js'),
  import('../mock/MockWorldRepository.js'),
])

await initDatabase()

const userRepo = new MockUserRepository()
userRepo.setState({
  current_day: 0, current_chapter: 0, hero_name: '林墨', ai_max_tokens: 2200, ai_temperature: 0.2,
  ai_provider: 'deepseek', api_key_encrypted: 'test-only',
})
const worldRepo = new MockWorldRepository()
worldRepo.outlineNodes = [
  { node_id: 'day1', chapter_number: 0, node_type: 'mainline', trigger_day: 1, content: '发现铜制怀表与陌生纹章，作为未解伏笔。', prerequisites: '[]', branch_options: '[]' },
  { node_id: 'day2', chapter_number: 0, node_type: 'mainline', trigger_day: 2, content: '追查纹章并让已有线索影响行动。', prerequisites: '["day1"]', branch_options: '[]' },
  { node_id: 'day3_choice', chapter_number: 0, node_type: 'branch', trigger_day: 3, content: '选择是否冒险追查。', prerequisites: '["day2"]', branch_options: '[{"id":"bold","desc":"主动追踪","effect":"承担风险继续追查"}]' },
  { node_id: 'day4', chapter_number: 0, node_type: 'mainline', trigger_day: 4, content: '选择带来调查代价。', prerequisites: '["day3_choice"]', branch_options: '[]' },
  { node_id: 'day5', chapter_number: 0, node_type: 'mainline', trigger_day: 5, content: '调查压力升级。', prerequisites: '["day4"]', branch_options: '[]' },
  { node_id: 'day6', chapter_number: 1, node_type: 'resolution', trigger_day: 6, content: '解释纹章来源并回收铜制怀表伏笔。', prerequisites: '["day5"]', branch_options: '[]' },
  { node_id: 'day7', chapter_number: 1, node_type: 'mainline', trigger_day: 7, content: '回收后的余波。', prerequisites: '["day6"]', branch_options: '[]' },
]

const writerPrompts = []
const storyBody = '林墨将铜制怀表放在桌上，陌生纹章在灯下泛出暗红色光泽。他没有遗忘此前的调查，也清楚主动追踪意味着风险。为了核对线索，他整理记录、拜访旧仓库，并将日常的疲惫化为谨慎行动。经过反复比对，他确认纹章属于失踪钟表匠留下的求救标记，铜制怀表正是开启暗门的钥匙。这个发现既解释了纹章来源，也让他明白接下来必须与可靠同伴合作。夜色落下时，林墨收起怀表，决定带着新的证据继续前行。'.repeat(6)

const adapter = {
  async chat({ systemPrompt, userPrompt }) {
    if (systemPrompt.includes('日记分析助手')) {
      return { success: true, content: JSON.stringify({ events: ['整理调查记录'], detectedBehaviors: ['学习'], keywords: ['铜制怀表', '陌生纹章'] }) }
    }
    if (systemPrompt.includes('故事分析助手')) {
      const isDay6 = userPrompt.includes('第6天')
      return {
        success: true,
        content: JSON.stringify({
          entities: [{ type: 'item', name: '铜制怀表', description: '带有陌生纹章、可开启暗门的关键物品', status: 'active' }],
          foreshadowing_planted: userPrompt.includes('第1天') ? [{ description: '铜制怀表陌生纹章的来源', priority: 'high' }] : [],
          foreshadowing_resolved: isDay6 ? [{ description: '铜制怀表陌生纹章的来源', resolution: '确认它是失踪钟表匠留下的求救标记。' }] : [],
        }),
      }
    }
    if (userPrompt.includes('审查')) return { success: true, content: '{"passed":true,"issues":[],"revised_content":""}' }
    if (userPrompt.includes('润色')) return { success: true, content: storyBody }
    writerPrompts.push(userPrompt)
    return { success: true, content: `${storyBody}\n---DIARY_REFS---\n[]` }
  },
}

const storyEngine = new StoryEngine({
  userRepo,
  diaryRepo: new MockDiaryRepository(),
  chapterRepo: new MockChapterRepository(),
  segmentRepo: new MockSegmentRepository(),
  worldRepo,
  narrativeRepo: NarrativeStateRepository,
  entityRepo: EntityRepository,
  foreshadowRepo: ForeshadowingRepository,
})
storyEngine._getAIContext = async () => ({ adapter, apiKey: 'test-only', baseUrl: null })
storyEngine.storyRagRetriever.retrieve = async () => []

for (let day = 1; day <= 7; day++) {
  if (day === 3) {
    const pending = await storyEngine.getPendingChoiceForNextDay()
    assert.equal(pending?.nodeId, 'day3_choice')
    await storyEngine.chooseNextDestiny(pending.nodeId, 'bold')
  }
  const generated = await storyEngine.generateStory({ dayNumber: day, diaryText: `第${day}天记录：继续调查铜制怀表和陌生纹章。`, behaviorTags: ['学习'] })
  assert.equal(generated.success, true, `第${day}天应生成成功：${generated.error || ''}`)
  const finalized = await storyEngine.finalize(generated.segmentId)
  assert.equal(finalized.success, true, `第${day}天应定稿成功：${finalized.error || ''}`)
}

const selected = NarrativeStateRepository.get('day3_choice')
const watch = EntityRepository.getByName('item', '铜制怀表')
const foreshadows = ForeshadowingRepository.getUnresolved()
const resolved = (await import('../src/db/Database.js')).queryAll('SELECT * FROM foreshadowing WHERE status = ?', ['resolved'])

assert.equal(selected.selected_option_id, 'bold', '选择必须写入真实 SQLite')
assert.equal(selected.status, 'completed', '已选择节点应在定稿后完成')
assert.ok(watch, '实体记忆必须写入真实 SQLite')
assert.equal(watch.last_day, 7, '实体记忆必须在后续天数持续更新')
assert.equal(foreshadows.length, 0, '第6天回收后不应残留未回收伏笔')
assert.equal(resolved.length, 1, '伏笔必须在真实 SQLite 中标记为已回收')
assert.ok(writerPrompts.slice(1).some(prompt => prompt.includes('铜制怀表')), '第2天及后续 Writer Prompt 必须读到实体/伏笔记忆')

console.log('REAL_SQLITE_MEMORY_PASS')
console.log(JSON.stringify({
  narrativeSelection: selected.selected_option_id,
  entity: { name: watch.entity_name, lastDay: watch.last_day },
  resolvedForeshadowing: resolved[0].resolution,
  writerPromptCount: writerPrompts.length,
}, null, 2))
