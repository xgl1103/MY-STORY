import assert from 'node:assert/strict'
import NarrativeGraph from '../src/core/NarrativeGraph.js'
import { ContentQualityGate } from '../src/ai/ContentQualityGate.js'
import ReviewLoop from '../src/ai/ReviewLoop.js'

class MemoryStateRepo {
  constructor() { this.rows = [] }
  getAll() { return this.rows.map(row => ({ ...row })) }
  async upsert(data) {
    const index = this.rows.findIndex(row => row.node_id === data.nodeId)
    const previous = index >= 0 ? this.rows[index] : {}
    const row = {
      ...previous, node_id: data.nodeId, world_id: data.worldId, status: data.status,
      selected_option_id: data.selectedOptionId || previous.selected_option_id || null,
      selected_option_desc: data.selectedOptionDesc || previous.selected_option_desc || null,
      selected_effect: data.selectedEffect || previous.selected_effect || null,
      selected_day: data.selectedDay ?? previous.selected_day ?? null,
      completed_day: data.completedDay ?? previous.completed_day ?? null,
    }
    if (index >= 0) this.rows[index] = row
    else this.rows.push(row)
    return { ...row }
  }
}

const nodes = [
  { node_id: 'awakening', node_type: 'mainline', trigger_day: 1, content: '主角觉醒。', prerequisites: '[]', branch_options: '[]' },
  { node_id: 'resolve', node_type: 'branch', trigger_day: 2, content: '主角必须决定下一步。', prerequisites: '["awakening"]', branch_options: '[{"id":"bold","desc":"主动调查","effect":"主角此后更主动地追踪线索"},{"id":"careful","desc":"谨慎观察","effect":"主角此后优先收集情报"}]' },
  { node_id: 'consequence', node_type: 'mainline', trigger_day: 3, content: '选择带来后果。', prerequisites: '["resolve"]', branch_options: '[]' },
]
const worldRepo = { async getAllOutlineNodes() { return nodes.map(node => ({ ...node })) } }
const states = new MemoryStateRepo()
const graph = new NarrativeGraph(worldRepo, states)
const user = { world_id: 'test-world', current_day: 1 }

await graph.completeNodesForDay(1, user)
let pending = await graph.getPendingChoiceForNextDay(user)
assert.equal(pending.nodeId, 'resolve')
assert.equal(pending.options.length, 2)

const selected = await graph.choose('resolve', 'bold', user)
assert.equal(selected.effect, '主角此后更主动地追踪线索')

let context = await graph.getGenerationContext({ user, dayNumber: 2 })
assert.equal(context.activeNode.node_id, 'resolve')
assert.match(context.text, /主动调查/)
assert.match(context.text, /实质影响/)

await graph.completeNodesForDay(2, { ...user, current_day: 2 })
context = await graph.getGenerationContext({ user, dayNumber: 3 })
assert.equal(context.activeNode.node_id, 'consequence')
assert.equal(states.rows.find(row => row.node_id === 'resolve').status, 'completed')

const coverage = ContentQualityGate.collectCoverageKeywords(
  { keywords: ['疲惫', '同事', '工作', '项目', '资料', '进度'] },
  '今天完成「会议报告」，同事答应帮我「调班」，这样才能继续调查。'
)
assert.deepEqual(coverage.slice(0, 2), ['会议报告', '调班'])

const review = new ReviewLoop()._parseReviewJson(
  '审查结论如下。 {"meta":"ignore"}\n{"passed":true,"issues":[],"revised_content":""}\n以上。'
)
assert.equal(review.passed, true)
assert.equal(new ReviewLoop()._parseReviewJson('"passed": true, "revised_content": "未转义\n多行"').passed, true)

console.log('narrative graph tests passed')
