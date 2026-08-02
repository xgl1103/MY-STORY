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
  schemaVersion: 1, dayNumber: 2,
  openingBridge: { sourceFact: '林墨正把怀表嵌入暗门凹槽', firstSceneAction: '从机关启动开始' },
  continuityAnchors: [{ fact: '铜制怀表带有陌生纹章', requiredUsage: '作为机关钥匙使用' }],
  diaryCausality: [{ diaryEvent: '同事答应帮我调班', worldAction: '同伴替林墨代班', storyConsequence: '林墨获得调查时间并欠下人情' }],
  choiceConsequence: { choice: '主动追踪纹章来源', impactType: '风险', consequence: '林墨亲自进入暗门并暴露行踪' },
  beats: [
    { order: 1, purpose: '承接', action: '启动暗门', stateChange: '暗门开启' },
    { order: 2, purpose: '日记影响', action: '同伴代班', stateChange: '获得时间并欠下人情' },
    { order: 3, purpose: '推进', action: '进入暗门发现证据', stateChange: '风险升级' },
  ],
  entityChanges: [], foreshadowActions: [],
  endingTarget: { state: '获得新证据并被未知者察觉', nextHook: '确认追踪者身份' },
  forbiddenChanges: ['不得把怀表改成银制'],
}

assert.equal(StoryPlanValidator.validate(validPlan, context).valid, true, '合法计划应通过本地校验')
assert.equal(StoryPlanValidator.validate({ ...validPlan, diaryCausality: [] }, context).valid, false, '遗漏日记因果必须被拒绝')
assert.equal(StoryPlanValidator.validate({ ...validPlan, choiceConsequence: null }, context).valid, false, '遗漏命运后果必须被拒绝')

const planner = new StoryPlanner()
const planned = await planner.plan(context, {
  adapter: { async chat() { return { success: true, content: JSON.stringify(validPlan) } } },
  apiKey: 'test', baseUrl: null,
})
assert.equal(planned.source, 'ai')
assert.equal(planned.plan.openingBridge.firstSceneAction, '从机关启动开始')

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
