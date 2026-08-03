import ErrorHandler from '../utils/ErrorHandler.js'

// 唯一允许重写整段正文的角色。Critical 只定位问题，避免多轮审查器各自改稿造成事实漂移。
export class StoryRewriter {
  async rewrite({ content, findings, systemPrompt, aiContext, storyPlanContext = '', continuityContext = '' }) {
    const actionable = (findings || []).filter(item => ['P0', 'P1'].includes(item?.severity))
    if (!actionable.length) return { success: true, content, rewritten: false }
    const issueList = actionable.map(item => `- [${item.code || 'C000'}][${item.severity}] ${item.issue || item.message || '需要修复'}\n  正文证据：${item.evidence || '未提供'}\n  修复要求：${item.repairInstruction || '恢复合同要求的动作和状态变化。'}`).join('\n')
    const prompt = `你是连载小说的唯一终稿修复编辑。请只输出修复后的完整小说正文，不要标题、说明、JSON 或引用标注。

【必须修复的审查证据】
${issueList}

【场景级剧情合同（不可违反）】
${storyPlanContext}

【已确认叙事事实（不可改变）】
${continuityContext}

【修复规则】
1. 只修复 P0/P1 所涉及的场景；未被指出的硬事实、用户选择和有效情节必须保留。
2. 每个日记场景必须写出“实际行动 + 可观察状态变化”，不能只提及日记词语。
3. 用户选择必须产生具体代价：风险、损失、暴露、人情义务、关系或资源变化之一。
4. 场景切换如涉及时间或地点变化，必须交代桥接过程。
5. 禁止通过删除场景、改写选择或无解释跳时来规避问题。
6. 只有三个或以上场景同时失败时才允许整天重写；否则优先局部补足。
7. 正文不少于 800 字，并以完整句结束。

【待修复正文】
${content}`
    const result = await ErrorHandler.callWithRetry(async () => aiContext.adapter.chat({
      apiKey: aiContext.apiKey,
      baseUrl: aiContext.baseUrl,
      systemPrompt,
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: Math.max(2800, aiContext.maxTokens || 0),
    }), '场景合同定向修复')
    return result.success && result.content
      ? { success: true, content: result.content.trim(), rewritten: true }
      : { success: false, content, rewritten: false, error: result.error || '定向修复失败' }
  }
}

export default StoryRewriter
