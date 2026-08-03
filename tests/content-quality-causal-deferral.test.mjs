import assert from 'node:assert/strict'
import { createMockStoryEngine } from '../mock/index.js'

let semanticCalls = 0
const adapter = {
  async chat(args) {
    assert.equal(args.jsonMode, true, 'semantic audit must use structured JSON mode')
    assert.ok(args.userPrompt.includes('日记影响审计员'), 'coverage-only failure must not invoke legacy prose repair')
    semanticCalls += 1
    return { success: true, content: JSON.stringify({ passed: false, issues: ['事件尚未形成后果'], evidence: '只有字面提及' }) }
  },
}

const { storyEngine } = createMockStoryEngine({ mockAdapter: adapter })
const content = '林墨写下调班安排，却还没有把它转化成真正的调查行动。'.repeat(45)
const result = await storyEngine._enforceContentQuality(content, {
  coverageKeywords: ['调班', '会议报告'],
  dailyEvents: ['同事调班，林墨完成会议报告后继续调查'],
  aiContext: { adapter, apiKey: 'test', baseUrl: null },
  systemPrompt: '测试系统提示', continuityContext: '', user: { ai_max_tokens: 1200 },
})

assert.equal(result.success, true, 'coverage-only failure must defer to the causal contract stage')
assert.equal(result.assessment.semanticDiaryInfluenceVerified, undefined)
assert.equal(semanticCalls, 1, 'semantic audit runs once here; no legacy repair loop is allowed')
console.log('CONTENT_QUALITY_CAUSAL_DEFERRAL_PASS')
