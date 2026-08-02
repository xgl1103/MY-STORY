import StoryPlanValidator from './StoryPlanValidator.js'

const SYSTEM_PROMPT = `你是互动连载小说的编剧规划器。你的职责不是写小说正文，而是把“上一日结尾、用户日记、命运选择和长期记忆”转化为当天可执行的因果计划。

硬规则：
1. 今天必须从上一天结尾承接；若跳时，必须写明桥接结果。
2. 用户日记必须造成角色行动和剧情后果，不能只被提及。
3. 已选命运必须造成可观察的风险、资源、关系、信息、时间成本或目标变化。
4. 不得无解释改变实体、人物关系、物品、目标或已确认事实。
5. 只输出 JSON，不写小说正文、不加 Markdown。

输出 schema：
{
  "schemaVersion":1,"dayNumber":数字,
  "openingBridge":{"sourceFact":"...","firstSceneAction":"..."},
  "continuityAnchors":[{"fact":"...","requiredUsage":"..."}],
  "diaryCausality":[{"diaryEvent":"...","worldAction":"...","storyConsequence":"..."}],
  "choiceConsequence":{"choice":"...","impactType":"...","consequence":"..."}|null,
  "beats":[{"order":1,"purpose":"...","action":"...","stateChange":"..."}],
  "entityChanges":[],"foreshadowActions":[],
  "endingTarget":{"state":"...","nextHook":"..."},
  "forbiddenChanges":["..."]
}`

const safeJson = value => JSON.stringify(value ?? null).slice(0, 10000)

export class StoryPlanner {
  async plan(context, aiContext) {
    const validationContext = { dayNumber: context.dayNumber, dailyEvents: context.dailyEvents, choices: context.choices, previousHandoff: context.previousHandoff }
    if (aiContext?.adapter) {
      try {
        const first = await this._request(context, aiContext)
        const checked = this._validateResponse(first, validationContext)
        if (checked.valid) return { plan: checked.normalizedPlan, source: 'ai', validationErrors: [] }
        // 只在格式或约束不合格时增加一次短修复调用；正常路径始终只有一次 Planner 调用。
        const repair = await this._request(context, aiContext, checked.errors)
        const repaired = this._validateResponse(repair, validationContext)
        if (repaired.valid) return { plan: repaired.normalizedPlan, source: 'ai_retry', validationErrors: checked.errors }
        return { plan: this.createFallback(context), source: 'fallback', validationErrors: [...checked.errors, ...repaired.errors] }
      } catch (error) {
        return { plan: this.createFallback(context), source: 'fallback', validationErrors: [{ code: 'P000', path: '', message: error.message || '规划器调用失败' }] }
      }
    }
    return { plan: this.createFallback(context), source: 'fallback', validationErrors: [{ code: 'P000', path: '', message: '无可用 AI 规划器' }] }
  }

  async _request(context, aiContext, repairErrors = null) {
    const repairInstruction = repairErrors?.length
      ? `\n\n【上一次计划未通过本地校验】\n${repairErrors.map(item => `- ${item.code}：${item.message}`).join('\n')}\n请修正后重新输出完整 JSON，不要解释。`
      : ''
    const response = await aiContext.adapter.chat({
      apiKey: aiContext.apiKey,
      baseUrl: aiContext.baseUrl,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: this._buildPrompt(context) + repairInstruction,
      temperature: 0.2,
      maxTokens: 1400,
    })
    if (!response?.success) throw new Error(response?.error || '规划调用失败')
    return response.content
  }

  _validateResponse(content, validationContext) {
    try {
      return StoryPlanValidator.validate(this._parse(content), validationContext)
    } catch (error) {
      return { valid: false, errors: [{ code: 'P000', path: '', message: error.message || '规划 JSON 解析失败' }], normalizedPlan: null }
    }
  }

  createFallback(context) {
    const handoff = context.previousHandoff || {}
    const facts = Array.isArray(handoff.hardFacts) ? handoff.hardFacts : []
    const prohibited = Array.isArray(handoff.prohibitedChanges) ? handoff.prohibitedChanges : []
    const openingFact = handoff.unfinished_action || handoff.immediate_next_action || handoff.active_goal || (context.dayNumber === 1 ? '这是故事的开端，主角尚未经历前情。' : '承接上一日已经建立的故事状态。')
    const events = (context.dailyEvents || []).filter(Boolean).slice(0, 4)
    const choices = (context.choices || []).filter(item => item.description || item.effect)
    const choice = choices[choices.length - 1] || null
    const causality = (events.length ? events : ['将用户日记中的核心经历融入行动']).map(event => ({ diaryEvent: event, worldAction: `将“${event}”转化为主角在世界观内的实际行动`, storyConsequence: '该行动改变当天的资源、关系、风险或下一步目标。' }))
    const anchors = (facts.length ? facts : [openingFact]).slice(0, 5).map(fact => ({ fact, requiredUsage: '正文不得否定该事实，并让它影响当前行动。' }))
    const forbiddenChanges = [...prohibited, ...facts.map(fact => `不得无解释地否定或改变：${fact}`)].filter(Boolean).slice(0, 8)
    if (!forbiddenChanges.length) forbiddenChanges.push('不得无解释地改变上一日建立的场景、人物状态和当前目标。')
    const plan = {
      schemaVersion: 1, dayNumber: context.dayNumber,
      openingBridge: { sourceFact: openingFact, firstSceneAction: `从“${openingFact}”自然开始当天第一场景。` },
      continuityAnchors: anchors,
      diaryCausality: causality,
      choiceConsequence: choice ? { choice: choice.description || choice.effect, impactType: '行动与风险', consequence: choice.effect || '用户选择必须改变主角今天的行动方式和代价。' } : null,
      beats: [
        { order: 1, purpose: '承接上一日', action: `回应并推进：${openingFact}`, stateChange: '上一日未完成状态获得明确推进。' },
        { order: 2, purpose: '日记产生因果', action: causality[0].worldAction, stateChange: causality[0].storyConsequence },
        { order: 3, purpose: '留下连续钩子', action: '在不否定既有事实的前提下推进当前目标。', stateChange: '形成可由下一日继续承接的新状态。' },
      ],
      entityChanges: [], foreshadowActions: [],
      endingTarget: { state: '当前目标得到推进，并留下与既有线索一致的下一步行动。', nextHook: '下一日必须承接本日形成的新状态。' },
      forbiddenChanges,
    }
    return StoryPlanValidator.normalize(plan)
  }

  _buildPrompt(context) {
    return `【生成日】第${context.dayNumber}天\n【上一日日终交接单】\n${safeJson(context.previousHandoff || { note: '第1天，无前情。' })}\n\n【用户当日日记事件】\n${safeJson(context.dailyEvents || [])}\n\n【行为映射】\n${context.mappingDesc || '无'}\n\n【当前叙事节点】\n${context.narrativeText || '无固定节点'}\n\n【已选命运】\n${safeJson(context.choices || [])}\n\n【实体和伏笔】\n${String(context.entityMemory || '').slice(0, 3000)}\n${String(context.foreshadowing || '').slice(0, 1600)}\n\n【章节目的】\n${context.chapterPurpose || '自然推进当前章节'}\n\n请只输出符合 schema 的 JSON。`
  }

  _parse(text) {
    if (!text) throw new Error('规划器返回为空')
    try { return JSON.parse(text) } catch (_) { /* continue */ }
    const block = String(text).match(/```(?:json)?\s*([\s\S]*?)```/)
    if (block) return JSON.parse(block[1].trim())
    const match = String(text).match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('规划器未返回有效 JSON')
  }
}

export default StoryPlanner
