// Planner 命中率探针：用真实 DeepSeek 多次调用 StoryPlanner，
// 统计 source=ai / ai_retry / fallback 的分布与本地校验错误。
// 用途：验证“正常路径尽量一次 Planner 调用”的稳定性目标，诊断 JSON 模式退化。
// 运行：DEEPSEEK_API_KEY=... node tests/planner-hit-rate-probe.mjs [runsPerScenario]
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = relative => import(pathToFileURL(path.join(root, relative)).href)

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('需要 DEEPSEEK_API_KEY 环境变量（仅当前终端会话使用，不写入任何文件）。')
  process.exit(1)
}

const runsPerScenario = Math.max(1, Math.min(8, Number(process.argv[2] || 2)))
const [{ default: DeepSeekAdapter }, { StoryPlanner }, { default: HandoffCleaner }] = await Promise.all([
  load('src/ai/adapters/DeepSeekAdapter.js'),
  load('src/ai/StoryPlanner.js'),
  load('src/ai/HandoffCleaner.js'),
])

const adapter = new DeepSeekAdapter()
adapter.timeout = 60000
const planner = new StoryPlanner()

// 贴近真实 7 天测试输入构造场景，覆盖首日、带选择、带交接单三类主要路径。
const scenarios = [
  {
    name: 'day1-first',
    context: {
      dayNumber: 1,
      previousHandoff: null,
      dailyEvents: ['在下班回家路上从旧书摊买到一枚刻有陌生纹章的铜制怀表'],
      mappingDesc: '娱乐 → 在旧书摊偶遇异常物品；休息 → 夜晚被怀表异象困扰',
      narrativeText: '主线起始：林墨获得铜制怀表，纹章来源不明。',
      choices: [],
      entityMemory: '',
      foreshadowing: '',
      chapterPurpose: '建立悬念与世界观氛围',
      encounter: null,
    },
  },
  {
    name: 'day3-choice',
    context: {
      dayNumber: 3,
      previousHandoff: {
        dayNumber: 2,
        endingScene: { time: '深夜', location: '林墨的公寓', presentCharacters: ['林墨'], physicalState: '疲惫但坚持' },
        hardFacts: ['铜制怀表背面是衔橄榄枝乌鸦加三环纹章', '指针停在十点十七分'],
        activeGoal: '查明怀表纹章来源',
        unfinishedAction: '林墨确认纹章与北区旧仓库有关',
        immediateNextAction: '林墨前往旧仓库实地确认纹章位置',
        unresolvedThreads: [{ description: '纹章的来源与制作者', priority: 'high' }],
        prohibitedChanges: ['不得无解释改变怀表材质与纹章图案'],
      },
      dailyEvents: ['冒雨前往旧仓库确认纹章所在位置'],
      mappingDesc: '社交 → 与线人交换情报；健身 → 冒雨长途步行',
      narrativeText: '第 3 天命运抉择节点：主动追踪或谨慎观察。',
      // 真实链路（NarrativeGraph.getGenerationContext）只传用户已选中的那一个选择。
      choices: [
        { description: '主动追踪纹章来源', effect: '林墨主动调查，并承担更高风险以换取线索。' },
      ],
      entityMemory: '铜制怀表：旧书摊购得，背面有陌生纹章。',
      foreshadowing: '未回收伏笔：怀表指针停在十点十七分。',
      chapterPurpose: '让用户选择产生可观察的后果',
      encounter: null,
    },
  },
  {
    name: 'day4-handoff',
    context: {
      dayNumber: 4,
      previousHandoff: {
        dayNumber: 3,
        endingScene: { time: '深夜', location: '旧仓库暗门前', presentCharacters: ['林墨'], physicalState: '紧张' },
        hardFacts: ['林墨主动选择追踪纹章来源', '铜制怀表停在十点十七分'],
        activeGoal: '进入暗门后的通道继续追查纹章来源',
        unfinishedAction: '林墨将怀表嵌入暗门凹槽并转动机关',
        immediateNextAction: '林墨走进暗门后的通道继续探查',
        unresolvedThreads: [{ description: '暗门后藏着什么', priority: 'high' }, { description: '纹章制作者身份', priority: 'normal' }],
        prohibitedChanges: ['不得无解释改变怀表指针状态', '不得弱化主动追踪的风险代价'],
      },
      dailyEvents: ['完成会议报告很疲惫', '同事答应帮我调班，我因此能继续调查'],
      mappingDesc: '工作 → 完成并提交会议报告；社交 → 同事帮忙调班，欠下人情',
      narrativeText: '第 4 天：选择的后果显现，日记事件必须改变调查方式与代价。',
      choices: [
        { description: '主动追踪纹章来源', effect: '林墨主动调查，并承担更高风险以换取线索。' },
      ],
      entityMemory: '铜制怀表：暗门钥匙；林墨：主动追踪者，行踪开始暴露。',
      foreshadowing: '未回收伏笔：怀表指针停在十点十七分；暗门后的声音。',
      chapterPurpose: '让日记与命运选择形成实际行动与代价',
      encounter: null,
    },
  },
  {
    name: 'day6-resolve',
    context: {
      dayNumber: 6,
      previousHandoff: {
        dayNumber: 5,
        endingScene: { time: '凌晨', location: '旧仓库后门', presentCharacters: ['林墨'], physicalState: '失眠、压力大但坚定' },
        hardFacts: ['调查压力导致林墨连续失眠', '旧仓库内存在钟表匠留下的痕迹'],
        activeGoal: '回收纹章来源伏笔并解释钟表匠暗号',
        unfinishedAction: '林墨发现失踪钟表匠留下的求救暗号',
        immediateNextAction: '林墨返回旧仓库解密暗号并解释纹章来源',
        unresolvedThreads: [{ description: '钟表匠为何失踪', priority: 'high' }, { description: '纹章制作者身份', priority: 'high' }],
        prohibitedChanges: ['不得无解释改变纹章来源结论'],
      },
      dailyEvents: ['回到旧仓库找到失踪钟表匠留下的求救暗号，终于解释纹章来源'],
      mappingDesc: '学习 → 解读暗号与档案；娱乐 → 夜间探访旧仓库',
      narrativeText: '第 6 天：回收第 1 天埋下的伏笔，解释纹章来源。',
      choices: [
        { description: '主动追踪纹章来源', effect: '林墨主动调查，并承担更高风险以换取线索。' },
      ],
      entityMemory: '钟表匠：失踪的怀表制作者；旧仓库：暗门后的档案室。',
      foreshadowing: '未回收伏笔：铜制怀表陌生纹章的来源。',
      chapterPurpose: '完成伏笔回收并留下余波',
      encounter: null,
    },
  },
]

const summary = { runsPerScenario, totalCalls: 0, sources: {}, validationErrors: {}, scenarios: [] }

for (const scenario of scenarios) {
  const results = []
  for (let run = 0; run < runsPerScenario; run++) {
    const before = Date.now()
    const result = await planner.plan(scenario.context, { adapter, apiKey, baseUrl: null })
    const elapsedMs = Date.now() - before
    summary.sources[result.source] = (summary.sources[result.source] || 0) + 1
    summary.totalCalls += 1
    for (const error of result.validationErrors || []) {
      const key = error.code || 'unknown'
      summary.validationErrors[key] = (summary.validationErrors[key] || 0) + 1
    }
    results.push({
      source: result.source,
      sceneCount: result.plan?.scenes?.length || 0,
      elapsedMs,
      errors: (result.validationErrors || []).map(item => `${item.code}:${item.message}`),
    })
  }
  summary.scenarios.push({ name: scenario.name, results })
  console.log(`[${scenario.name}] ${results.map(item => `${item.source}(${item.sceneCount}场景,${item.elapsedMs}ms)`).join(' | ')}`)
}

const reportPath = path.join(root, 'test-reports', `planner-hit-rate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await fs.mkdir(path.dirname(reportPath), { recursive: true })
await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8')

const aiRate = (summary.sources.ai || 0) / Math.max(1, summary.totalCalls)
console.log(`\n命中率: ai=${summary.sources.ai || 0} ai_retry=${summary.sources.ai_retry || 0} fallback=${summary.sources.fallback || 0} 总计=${summary.totalCalls}`)
console.log(`纯 AI 计划占比: ${(aiRate * 100).toFixed(1)}%（目标 ≥ 80%）`)
if (Object.keys(summary.validationErrors).length) console.log('校验错误分布:', JSON.stringify(summary.validationErrors))
console.log(`报告: ${reportPath}`)
process.exitCode = aiRate >= 0.8 ? 0 : 1
