// 真实 DeepSeek 7 天连续剧情验证。密钥仅从环境变量读取，报告中绝不写入密钥。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = relative => import(pathToFileURL(path.join(root, relative)).href)
let apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required; set it only in the current terminal session. This test never reads a local key file.')
if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY；请设置本机环境变量，或在 gitignore 的 api_key.txt 中仅保存一行测试密钥。')
if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  throw new Error('测试密钥格式无效：api_key.txt 必须只含一行 ASCII 的 sk- 开头密钥，不能粘贴说明文字、引号或多行内容。')
}

const [{ createMockStoryEngine }, { default: DeepSeekAdapter }, { default: ReviewLoop }] = await Promise.all([
  load('mock/index.js'), load('src/ai/adapters/DeepSeekAdapter.js'), load('src/ai/ReviewLoop.js'),
])

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.join(root, 'test-reports')
await fs.mkdir(outputDir, { recursive: true })
const calls = []

class RecordingDeepSeekAdapter extends DeepSeekAdapter {
  async chat(args) {
    const kind = args.systemPrompt.includes('日记分析助手') ? 'diary-parser'
      : args.systemPrompt.includes('编剧规划器') ? 'planner'
      : args.userPrompt.includes('审查') ? 'critical'
      : args.userPrompt.includes('润色') ? 'polish'
        : 'writer'
    calls.push({ kind, prompt: args.userPrompt, at: new Date().toISOString() })
    return super.chat(args)
  }
}

const adapter = new RecordingDeepSeekAdapter()
const { storyEngine, repos } = createMockStoryEngine({
  useMockAdapter: false,
  userState: {
    current_day: 0, current_chapter: 0, hero_name: '林墨', ai_provider: 'deepseek',
    api_key_encrypted: 'environment-only', ai_max_tokens: 3200, ai_temperature: 0.65,
  },
})
storyEngine._getAIContext = async () => ({ adapter, apiKey, baseUrl: null })

// 独立的七日小型剧情图：第 2 天读完后，用户为第 3 天亲自选择命运。
repos.worldRepo.outlineNodes = [
  { node_id: 'd1_awaken', chapter_number: 0, node_type: 'mainline', trigger_day: 1, content: '林墨从一枚刻有陌生纹章的铜制怀表中感到异常灵性；它成为必须保留的未解线索。', prerequisites: '[]', branch_options: '[]' },
  { node_id: 'd2_clue', chapter_number: 0, node_type: 'mainline', trigger_day: 2, content: '林墨追查怀表纹章的来源，与可信对象交换有限情报，但不得提前揭露真相。', prerequisites: '["d1_awaken"]', branch_options: '[]' },
  { node_id: 'd3_choice', chapter_number: 0, node_type: 'branch', trigger_day: 3, content: '面对怀表线索，林墨必须决定主动追踪或暂时观察；选择会产生长期后果。', prerequisites: '["d2_clue"]', branch_options: '[{"id":"bold","desc":"主动追踪纹章来源","effect":"林墨主动调查，并承担更高风险以换取线索。"},{"id":"careful","desc":"谨慎观察并先收集情报","effect":"林墨优先保护自己，通过人脉和占卜间接调查。"}]' },
  { node_id: 'd4_consequence', chapter_number: 0, node_type: 'mainline', trigger_day: 4, content: '选择的后果显现。日记中的人际关系和行动必须改变调查方式与代价。', prerequisites: '["d3_choice"]', branch_options: '[]' },
  { node_id: 'd5_pressure', chapter_number: 0, node_type: 'climax', trigger_day: 5, content: '怀表线索带来压力，林墨需要在日常责任与调查风险间作出取舍。', prerequisites: '["d4_consequence"]', branch_options: '[]' },
  { node_id: 'd6_resolve', chapter_number: 1, node_type: 'resolution', trigger_day: 6, content: '必须解释铜制怀表纹章的来源，并回收至少一部分第一天留下的悬念，不得凭空遗忘。', prerequisites: '["d5_pressure"]', branch_options: '[]' },
  { node_id: 'd7_aftermath', chapter_number: 1, node_type: 'mainline', trigger_day: 7, content: '解释后的余波会改变林墨与盟友的信任及下一阶段目标。', prerequisites: '["d6_resolve"]', branch_options: '[]' },
]

const days = [
  { text: '下班回家时，我在旧书摊买到一枚「铜制怀表」，背面的「陌生纹章」让我整晚无法入睡。', tags: ['娱乐', '休息'] },
  { text: '今天查资料并和朋友聊天，发现有人见过「陌生纹章」；我写下了完整的「线索笔记」。', tags: ['学习', '社交'] },
  { text: '我带着「铜制怀表」冒雨前往「旧仓库」，主动确认纹章所在的位置。', tags: ['社交', '健身'] },
  { text: '今天完成「会议报告」很疲惫，但同事答应帮我「调班」，我因此能继续调查。', tags: ['工作', '社交'] },
  { text: '我因调查压力睡得很差，仍坚持「晨跑」，并在夜里整理「调查笔记」。', tags: ['健身', '学习'] },
  { text: '我回到旧仓库，找到「失踪钟表匠」留下的「求救暗号」，终于解释纹章来源。', tags: ['娱乐', '学习'] },
  { text: '我和朋友坦诚交流，决定把「钟表匠线索」交给「可靠组织」继续追查。', tags: ['社交', '工作'] },
]

const report = { runId, startedAt: new Date().toISOString(), status: 'running', days: [], choice: null, critical: null, errors: [] }
const generatedStories = new Map()

const reportPaths = {
  json: path.join(outputDir, `real-7day-${runId}.json`),
  markdown: path.join(outputDir, `real-7day-${runId}.md`),
}

const buildMarkdown = () => `# My Story 真实 DeepSeek 七日连续性测试

- Run: ${report.runId}
- Status: ${report.status}
- Completed days: ${report.days.length}/7

## Failures
${report.errors.length ? report.errors.map(item => `- Day ${item.day ?? 'N/A'} / ${item.stage}: ${item.message}`).join('\n') : 'None'}

## Days
${report.days.length ? report.days.map(day => `### Day ${day.day}
Input: ${day.input}
Chars: ${day.chars}
Clock signal: ${day.containsClock}
Plan: ${JSON.stringify(day.plan)}
Handoff quality: ${day.handoffQuality}

开头节选：${day.excerpt}

结尾节选：${day.endingExcerpt}`).join('\n\n') : 'No completed day yet.'}

## Result data
${JSON.stringify({ choice: report.choice, foreshadowAudit: report.foreshadowAudit, influenceAudit: report.influenceAudit, critical: report.critical, callCounts: report.callCounts }, null, 2)}
`

const saveReport = async () => {
  report.updatedAt = new Date().toISOString()
  report.callCounts = calls.reduce((counts, call) => ({ ...counts, [call.kind]: (counts[call.kind] || 0) + 1 }), {})
  await fs.writeFile(reportPaths.json, JSON.stringify(report, null, 2), 'utf8')
  await fs.writeFile(reportPaths.markdown, buildMarkdown(), 'utf8')
}

let activeDay = null
try {
for (let index = 0; index < days.length; index++) {
  const dayNumber = index + 1
  activeDay = dayNumber
  if (dayNumber === 3) {
    const pending = await storyEngine.getPendingChoiceForNextDay()
    if (!pending) throw new Error('第 2 天定稿后没有出现第 3 天命运选择')
    report.choice = await storyEngine.chooseNextDestiny(pending.nodeId, 'bold')
  }
  const input = days[index]
  const result = await storyEngine.generateStory({ diaryText: input.text, behaviorTags: input.tags, dayNumber })
  if (!result.success) throw new Error(`第${dayNumber}天生成失败：${result.error}`)
  const finalized = await storyEngine.finalize(result.segmentId)
  if (!finalized.success) throw new Error(`第${dayNumber}天定稿失败：${finalized.error}`)
  generatedStories.set(dayNumber, result.content)
  report.days.push({
    day: dayNumber, input: input.text, tags: input.tags, segmentId: result.segmentId,
    chars: result.content.length, excerpt: result.content.slice(0, 420),
    endingExcerpt: result.content.slice(-420),
    containsClock: result.content.includes('怀表') || result.content.includes('钟表'),
    finalized: finalized.success,
    plan: (() => {
      const plan = repos.storyPlanRepo.data.find(item => item.segment_id === result.segmentId)
      return plan ? {
        schemaVersion: plan.schema_version,
        source: plan.source,
        sceneCount: plan.plan?.scenes?.length || 0,
        repairCount: plan.repair_count || 0,
        finalVerificationStatus: plan.final_verification_status || null,
        reviewFindings: plan.reviewFindings || [],
      } : null
    })(),
    handoffQuality: (await repos.handoffRepo.getByDay(dayNumber))?.quality_status || null,
  })
  // 每完成一天就保存检查点；即使后续中断，已完成内容仍可作为测试案例复核。
  await saveReport()
}

const day3WriterPrompt = calls.find(call => call.kind === 'writer' && call.prompt.includes(days[2].text))?.prompt || ''
report.choiceInheritedInWriterPrompt = day3WriterPrompt.includes('主动追踪纹章来源') && day3WriterPrompt.includes('更高风险')
report.diaryInfluenceEvidence = report.days.map(day => ({ day: day.day, inputAppearsInWriterPrompt: calls.some(call => call.kind === 'writer' && call.prompt.includes(day.input)) }))

const day1 = report.days[0]
const day6 = report.days[5]
report.plannedDays = repos.storyPlanRepo.data.filter(plan => plan.status === 'used').length
report.handoffDays = repos.handoffRepo.data.length
const audit = await adapter.chat({
  apiKey, baseUrl: null, temperature: 0, maxTokens: 500,
  systemPrompt: '你是严格的连载小说连续性审计员。只输出 JSON。',
  userPrompt: `检查伏笔回收。第1天埋下“铜制怀表陌生纹章”的未解线索。\n第1天正文：${generatedStories.get(1)}\n第6天正文：${generatedStories.get(6)}\n输出 {"resolved":true|false,"evidence":"简述证据","issue":"如未回收说明原因"}`,
})
try { report.foreshadowAudit = JSON.parse(audit.content) } catch (_) { report.foreshadowAudit = { resolved: false, issue: '审计 JSON 解析失败', raw: audit.content?.slice(0, 300) } }

const influenceAudit = await adapter.chat({
  apiKey, baseUrl: null, temperature: 0, maxTokens: 700,
  systemPrompt: '你是严格的互动叙事审计员。只输出 JSON。',
  userPrompt: `验证用户选择和日记是否实质改变了剧情后果。\n既有选择：林墨选择“主动追踪纹章来源”，并承担更高风险。\n第4天日记：${days[3].text}\n第4天正文：${generatedStories.get(4)}\n输出 {"choiceHasConsequence":true|false,"diaryHasConsequence":true|false,"evidence":"具体场景与后果","issue":"如失败说明原因"}`,
})
try { report.influenceAudit = JSON.parse(influenceAudit.content) } catch (_) { report.influenceAudit = { choiceHasConsequence: false, diaryHasConsequence: false, issue: '审计 JSON 解析失败', raw: influenceAudit.content?.slice(0, 300) } }

const critical = new ReviewLoop()
report.critical = await critical.audit(
  '林墨从未见过任何怀表，也从未作出选择；他已经直接成为序列0真神，轻易毁掉整座城市。',
  '主角林墨目前仅是占卜家序列9，故事必须保持事实一致。',
  adapter, apiKey, null,
  { maxTokens: 900, continuityContext: '既有事实：林墨发现过铜制怀表；用户选择“主动追踪纹章来源”，并承担更高风险；林墨当前仅为序列9。', storyPlanContext: '合同：不得否认怀表与用户选择；主角不得无原因获得超越序列9的力量。' }
)

report.finishedAt = new Date().toISOString()
report.status = 'passed'
await saveReport()
console.log(`REPORT_JSON=${reportPaths.json}`)
console.log(`REPORT_MD=${reportPaths.markdown}`)
console.log(`RESULT choice=${report.choiceInheritedInWriterPrompt} foreshadow=${report.foreshadowAudit?.resolved} diary=${report.influenceAudit?.diaryHasConsequence} criticalRejected=${report.critical?.passed === false}`)
if (!report.choiceInheritedInWriterPrompt || !report.foreshadowAudit?.resolved || !report.influenceAudit?.choiceHasConsequence || !report.influenceAudit?.diaryHasConsequence || report.critical?.passed !== false || report.plannedDays !== 7 || report.handoffDays !== 7) process.exitCode = 2
} catch (error) {
  report.status = 'failed'
  report.finishedAt = new Date().toISOString()
  report.errors.push({ day: activeDay, stage: 'generation-or-finalize', message: error?.message || String(error) })
  await saveReport()
  console.log(`REPORT_JSON=${reportPaths.json}`)
  console.log(`REPORT_MD=${reportPaths.markdown}`)
  console.error(`TEST_FAILED_DAY=${activeDay ?? 'N/A'}: ${error?.message || String(error)}`)
  process.exitCode = 1
}
