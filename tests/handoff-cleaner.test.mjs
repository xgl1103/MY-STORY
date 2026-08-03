import assert from 'node:assert/strict'
import HandoffCleaner from '../src/ai/HandoffCleaner.js'

const cleaner = new HandoffCleaner()
const content = '林墨在旧仓库暗门前握紧铜制怀表。深夜的机关发出低响，他决定将怀表嵌入凹槽，确认暗门后的风险。'

const cleaned = cleaner.clean({
  endingScene: { time: '深夜', location: '旧仓库', presentCharacters: ['林墨'], physicalState: '警惕' },
  hardFacts: ['铜制怀表停在十点十七分'],
  activeGoal: '继续确认暗门后的线索',
  unfinishedAction: '声。林墨将怀表嵌入凹槽',
  immediateNextAction: '启动机关并确认风险',
  unresolvedThreads: [{ description: '暗门后有什么', priority: 'high' }],
  prohibitedChanges: ['不得把怀表改成银制'],
}, { content })

assert.equal(cleaned.handoff.unfinishedAction, '林墨将怀表嵌入凹槽', '残句前缀必须被清理')
assert.equal(cleaned.qualityStatus, 'cleaned', '清理过的完整动作应标记 cleaned')
assert.equal(cleaned.handoff.schemaVersion, 2)
assert.equal(cleaned.handoff.factRecords[0].value, '铜制怀表停在十点十七分')

const fallback = cleaner.clean({
  activeGoal: '的',
  unfinishedAction: '声。',
  immediateNextAction: '然后',
}, { content, choiceContext: { description: '主动追踪纹章来源', effect: '承担风险继续追查' } })

assert.equal(fallback.qualityStatus, 'fallback', '无法恢复的动作必须使用 fallback')
assert.equal(fallback.fallbackReason, 'invalid_or_truncated_action')
assert.ok(fallback.handoff.unfinishedAction.includes('继续处理本日结尾'), 'fallback 必须从正文结尾构造动作')
assert.ok(fallback.handoff.immediateNextAction.includes('从以下结尾状态'), 'fallback 必须提供下一步动作')

const multilingual = cleaner.clean({
  activeGoal: 'Identify the symbol source before dawn',
  unfinishedAction: 'Lin examines the mechanism behind the iron door',
  immediateNextAction: 'He enters the warehouse and follows the sound',
}, { content: '林墨站在铁门前，听见门后传来钟表声。' })
assert.equal(multilingual.qualityStatus, 'valid', '具体动作不能因动词语言不同被错误降级')
assert.ok(fallback.handoff.hardFacts.some(item => item.includes('主动追踪纹章来源')), 'fallback 必须继承用户选择')

console.log('HANDOFF_CLEANER_TEST_PASS')
