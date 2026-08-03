import assert from 'node:assert/strict'
import StoryPlanner from '../src/ai/StoryPlanner.js'
import StoryPlanValidator from '../src/ai/StoryPlanValidator.js'
import ReviewLoop from '../src/ai/ReviewLoop.js'

const context = {
  dayNumber: 2,
  previousHandoff: {
    day_number: 1,
    hardFacts: ['铜制怀表带有陌生纹章', '林墨尚未打开暗门'],
    active_goal: '确认暗门后的求救线索',
    unfinished_action: '林墨正把怀表嵌入暗门凹槽',
    immediate_next_action: '启动机关并确认风险',
    prohibitedChanges: ['不得把怀表改成银制'],
    source_content_hash: 'test-handoff',
  },
  dailyEvents: ['同事答应帮我调班'],
  mappingDesc: '[]',
  narrativeText: '当前目标是追查怀表纹章。',
  choices: [{ description: '主动追踪纹章来源', effect: '承担更高风险以换取线索。' }],
  entityMemory: '铜制怀表：关键物品。',
  foreshadowing: '陌生纹章尚未解释。',
  chapterPurpose: '推进调查线索',
}

const validPlan = {
  schemaVersion: 2, dayNumber: 2,
  openingContract: { previousState: '林墨正把怀表嵌入暗门凹槽', requiredFirstAction: '林墨将铜制怀表嵌入暗门凹槽并启动机关', timeBridgeRequired: false, completionEvidence: '正文前15%出现机关反应' },
  scenes: [
    { sceneId: 'S1', purpose: '承接', time: '深夜', location: '旧仓库暗门前', requiredActions: ['林墨将铜制怀表嵌入暗门凹槽并启动机关'], stateChanges: ['暗门产生明确机关反应'], diaryEventIds: [], choiceEffectIds: [], requiredFactIds: [] },
    { sceneId: 'S2', purpose: '日记影响', time: '清晨', location: '报社', requiredActions: ['同事明确替林墨代班并让他获得调查时间'], stateChanges: ['林墨获得调查窗口并欠下具体人情'], diaryEventIds: ['D1'], choiceEffectIds: ['C-selected'], requiredFactIds: [] },
    { sceneId: 'S3', purpose: '推进', time: '当天夜晚', location: '调查地点', requiredActions: ['林墨确认新线索并继续追查追踪者身份'], stateChanges: ['林墨行踪暴露并获得新证据'], diaryEventIds: [], choiceEffectIds: [], requiredFactIds: [] },
  ],
  transitionContracts: [
    { fromSceneId: 'S1', toSceneId: 'S2', mustExplain: '说明林墨离开仓库、度过夜晚并抵达报社。' },
    { fromSceneId: 'S2', toSceneId: 'S3', mustExplain: '说明调班后林墨如何利用调查时间前往线索地点。' },
  ],
  continuityAnchors: [{ fact: '铜制怀表带有陌生纹章', requiredUsage: '作为机关钥匙使用' }],
  choiceConsequence: { choice: '主动追踪纹章来源', impactType: 'exposure', consequence: '林墨亲自进入暗门后被跟踪者发现行踪。', effectId: 'C-selected' },
  entityChanges: [], foreshadowActions: [],
  endingContract: { resultingState: '获得新证据并被未知者察觉', nextAction: '林墨继续确认追踪者身份', blockingRisk: '跟踪者已经掌握林墨的行踪' },
  forbiddenChanges: ['不得把怀表改成银制'],
}

assert.equal(StoryPlanValidator.validate(validPlan, context).valid, true, '合法计划应通过本地校验')
assert.equal(StoryPlanValidator.validate({ ...validPlan, openingContract: { ...validPlan.openingContract, requiredFirstAction: 'The colleague physically takes Lin’s newsroom shift, freeing the afternoon for the archive search.' } }, context).valid, false, '开场动作必须与第一场景的动作合同保持一致')
assert.equal(StoryPlanValidator.validate({ ...validPlan, scenes: validPlan.scenes.map(scene => ({ ...scene, diaryEventIds: [] })) }, context).valid, false, '遗漏日记场景绑定必须被拒绝')
assert.equal(StoryPlanValidator.validate({ ...validPlan, choiceConsequence: null }, context).valid, false, '遗漏命运后果必须被拒绝')

const planner = new StoryPlanner()
let plannerSystemPrompt = ''
const planned = await planner.plan(context, {
  adapter: { async chat(args) { plannerSystemPrompt = args.systemPrompt; assert.equal(args.jsonMode, true); assert.equal(args.temperature, 0); assert.equal(args.maxTokens, 2400); return { success: true, content: JSON.stringify(validPlan) } } },
  apiKey: 'test', baseUrl: null,
})
assert.equal(planned.source, 'ai')
assert.equal(planned.plan.openingContract.requiredFirstAction, '林墨将铜制怀表嵌入暗门凹槽并启动机关')
assert.ok(plannerSystemPrompt.includes('scenes[0].requiredActions'), 'Planner prompt must require an exact opening-action handoff')

let retryCalls = 0
const retried = await planner.plan(context, {
  adapter: { async chat() { retryCalls++; return { success: true, content: retryCalls === 1 ? '{"dayNumber":2}' : JSON.stringify(validPlan) } } },
  apiKey: 'test', baseUrl: null,
})
assert.equal(retried.source, 'ai_retry', '不完整计划应触发一次修复重试')
assert.equal(retryCalls, 2, '格式修复最多追加一次调用')

const fallback = await planner.plan(context, {
  adapter: { async chat() { return { success: true, content: 'not json' } } },
  apiKey: 'test', baseUrl: null,
})
assert.equal(fallback.source, 'fallback')
assert.equal(StoryPlanValidator.validate(fallback.plan, context).valid, true, '降级计划也必须可执行')
assert.ok(fallback.plan.forbiddenChanges.includes('不得把怀表改成银制'))

let criticalPrompt = ''
const review = new ReviewLoop()
const reviewResult = await review.verify(
  '林墨以铜制怀表启动暗门，同伴代班让他获得时间，却也欠下人情。'.repeat(20),
  '主角林墨必须遵守既有事实。',
  { async chat(args) { criticalPrompt = args.userPrompt; return { success: true, content: '{"passed":true,"issues":[],"revised_content":""}' } } },
  'test', null,
  { temperature: 0, maxTokens: 500, continuityContext: '怀表为铜制。', storyPlanContext: '【当天剧情执行计划】不得把怀表改成银制。' }
)
assert.equal(reviewResult.passed, true)
assert.ok(criticalPrompt.includes('当天剧情计划'), 'Critical 必须收到计划作为验收依据')

console.log('STORY_PLANNER_TEST_PASS')
