import assert from 'node:assert/strict'
import ReviewLoop from '../src/ai/ReviewLoop.js'
import { createMockStoryEngine } from '../mock/index.js'

const review = new ReviewLoop()
const p2 = await review.audit('正文', '系统设定', {
  async chat() { return { success: true, content: JSON.stringify({ passed: false, findings: [{ code: 'C108', severity: 'P2', contractId: 'style', issue: '心理描写偏薄', evidence: '缺少心理细节', repairInstruction: '可酌情补充' }] }) } },
}, 'key', null, { storyPlanContext: '合同', continuityContext: '事实' })
assert.equal(p2.passed, true, 'P2 文学建议不得阻断生成')

const p0 = await review.audit('正文', '系统设定', {
  async chat() { return { success: true, content: JSON.stringify({ passed: false, findings: [{ code: 'C102', severity: 'P0', contractId: 'D-shift', issue: '调班没有形成行动', evidence: '正文未出现同事代班', repairInstruction: '补写代班和人情债' }] }) } },
}, 'key', null, { storyPlanContext: '合同', continuityContext: '事实' })
assert.equal(p0.passed, false, 'P0 日记因果遗漏必须阻断')
assert.equal(p0.findings[0].severity, 'P0')

let auditCalls = 0
const adapter = {
  async chat(args) {
    if (args.userPrompt.includes('唯一终稿修复编辑')) return { success: true, content: '修复后的正文：同事替林墨代班，他因此获得时间并欠下人情。' }
    if (args.userPrompt.includes('互动连载小说的严格 Critical')) {
      auditCalls++
      if (auditCalls === 1) return { success: true, content: JSON.stringify({ passed: false, findings: [{ code: 'C102', severity: 'P0', contractId: 'D1', issue: '日记未落实', evidence: '没有代班', repairInstruction: '补写代班与人情债' }] }) }
      if (auditCalls === 2) return { success: true, content: JSON.stringify({ passed: true, findings: [] }) }
      return { success: true, content: JSON.stringify({ passed: false, findings: [{ code: 'C104', severity: 'P0', contractId: 'F-clock-material', issue: '材质矛盾', evidence: '改成银制', repairInstruction: '保留铜制' }] }) }
    }
    if (args.userPrompt.includes('润色')) return { success: true, content: '润色后却把铜制怀表改成了银制怀表。' }
    return { success: false, error: `unexpected prompt: ${args.userPrompt.slice(0, 40)}` }
  },
}

const { storyEngine } = createMockStoryEngine({ mockAdapter: adapter })
const prompt = { systemPrompt: '主角必须遵守既有事实', continuityContext: '怀表为铜制。', storyPlanContext: 'D1 必须出现同事代班与人情债。' }
const aiContext = { adapter, apiKey: 'key', baseUrl: null }
const contract = await storyEngine._runSceneContractPipeline('初稿正文，没有代班。', prompt, aiContext)
assert.equal(contract.success, true, 'P0 必须经唯一 Rewriter 修复后通过')
assert.ok(contract.content.includes('同事替林墨代班'))
assert.equal(contract.reviewCount, 2)

const preserved = await storyEngine._polishWithRollback(contract.content, prompt, aiContext, { ai_temperature: 0.8, ai_max_tokens: 1000 })
assert.equal(preserved, contract.content, '润色引入 P0 事实矛盾时必须回退到润色前版本')

console.log('GRADED_REVIEW_TEST_PASS')
