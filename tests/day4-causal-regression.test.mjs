import assert from 'node:assert/strict'
import StoryPlanValidator from '../src/ai/StoryPlanValidator.js'
import PromptBuilder from '../src/ai/PromptBuilder.js'

const context = {
  dayNumber: 4,
  dailyEvents: ['完成会议报告', '同事答应帮我调班', '继续调查'],
  choices: [{ description: '主动追踪纹章来源', effect: '承担更高风险以换取线索。' }],
  previousHandoff: { prohibitedChanges: ['不得把铜制怀表改成银制', '不得无解释跳过开启暗门'] },
}

const day4Plan = {
  schemaVersion: 2, dayNumber: 4,
  openingContract: { previousState: '林墨停在旧仓库暗门前，正准备使用铜制怀表开启机关。', requiredFirstAction: '林墨将铜制怀表嵌入凹槽，观察机关转动并打开铁门。', timeBridgeRequired: false, completionEvidence: '正文前15%出现嵌入、机关反应和铁门状态。' },
  scenes: [
    { sceneId: 'S1', purpose: '跨日承接', time: '深夜', location: '旧仓库暗门前', requiredActions: ['林墨将铜制怀表嵌入凹槽，观察机关转动并打开铁门。'], stateChanges: ['暗门从关闭变为开启，林墨获得进入地下区域的风险。'], diaryEventIds: [], choiceEffectIds: [], requiredFactIds: ['F-clock-material'] },
    { sceneId: 'S2', purpose: '会议报告产生资源变化', time: '清晨', location: '报社', requiredActions: ['林墨完成并提交会议报告，取得进入档案区的通行许可。'], stateChanges: ['林墨获得调查所需的通行资源，并消耗了休息时间。'], diaryEventIds: ['D1'], choiceEffectIds: [], requiredFactIds: [] },
    { sceneId: 'S3', purpose: '调班与主动追踪产生代价', time: '当天夜晚', location: '旧仓库周边', requiredActions: ['同事明确替林墨调班，林墨利用调查窗口主动追踪纹章来源。'], stateChanges: ['林墨欠下同事人情，且跟踪者发现了他的行踪。'], diaryEventIds: ['D2', 'D3'], choiceEffectIds: ['C-selected'], requiredFactIds: [] },
    { sceneId: 'S4', purpose: '形成下一日钩子', time: '深夜', location: '安全屋', requiredActions: ['林墨确认被跟踪后收起证据，继续制定查明跟踪者身份的计划。'], stateChanges: ['林墨掌握进入地下区域的线索，但身份暴露。'], diaryEventIds: [], choiceEffectIds: [], requiredFactIds: [] },
  ],
  transitionContracts: [
    { fromSceneId: 'S1', toSceneId: 'S2', mustExplain: '交代林墨离开仓库、度过余夜并在清晨抵达报社。' },
    { fromSceneId: 'S2', toSceneId: 'S3', mustExplain: '交代同事调班后林墨如何在夜晚前往旧仓库。' },
    { fromSceneId: 'S3', toSceneId: 'S4', mustExplain: '交代林墨发现跟踪后如何摆脱视线并回到安全屋。' },
  ],
  choiceConsequence: { choice: '主动追踪纹章来源', impactType: 'exposure', consequence: '林墨亲自追踪后被跟踪者发现行踪，并欠下同事代班的人情。', effectId: 'C-selected' },
  endingContract: { resultingState: '林墨拥有地下区域线索，但身份已暴露。', nextAction: '林墨继续查明跟踪者身份并准备进入地下区域。', blockingRisk: '跟踪者可能在林墨行动前夺走证据。' },
  forbiddenChanges: ['不得把铜制怀表改成银制', '不得无解释跳过开启暗门'],
}

assert.equal(StoryPlanValidator.validate(day4Plan, context).valid, true, '第4天完整因果合同应通过')
assert.equal(StoryPlanValidator.validate({ ...day4Plan, scenes: day4Plan.scenes.map(scene => ({ ...scene, diaryEventIds: scene.diaryEventIds.filter(id => id !== 'D2') })) }, context).valid, false, '调班没有场景绑定必须被拒绝')
assert.equal(StoryPlanValidator.validate({ ...day4Plan, choiceConsequence: { ...day4Plan.choiceConsequence, consequence: '承担更高风险' } }, context).valid, false, '抽象选择后果必须被拒绝')
assert.equal(StoryPlanValidator.validate({ ...day4Plan, transitionContracts: [] }, context).valid, false, '跨场景没有桥接必须被拒绝')

const builder = new PromptBuilder()
const prompt = builder.build({ heroName: '林墨', currentDay: 4, chapterNumber: 0, chapterTitle: '序章', chapterPurpose: '推进纹章调查', outlineContent: '', branchGuidance: '', isNewChapter: false, summaries: [], ragResults: [], storyRagResults: [], entityMemory: '', foreshadowing: '', immediateContext: [], rawText: '完成会议报告，同事调班后继续调查。', dailyEvents: context.dailyEvents, coverageKeywords: ['会议报告', '调班'], narrativeContext: null, storyPlan: day4Plan, mappingDesc: '[]', encounterTitle: null, encounterContent: null, isRegenerate: false })
assert.ok(prompt.userPrompt.includes('S1｜深夜｜旧仓库暗门前'), 'Writer 必须收到第4天开场场景合同')
assert.ok(prompt.userPrompt.includes('对应日记：D2、D3'), 'Writer 必须看到调班和继续调查的场景绑定')
assert.ok(prompt.userPrompt.includes('具体代价'), 'Writer 必须看到用户选择的具体代价')

console.log('DAY4_CAUSAL_REGRESSION_TEST_PASS')
