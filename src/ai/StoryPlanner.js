import StoryPlanValidator from './StoryPlanValidator.js'

const SYSTEM_PROMPT = `你是互动连载小说的编剧规划器。你的职责不是写小说正文，而是把“上一日结尾、用户日记、命运选择和长期记忆”转化为当天可执行的因果计划。

硬规则：
1. 今天必须从上一天结尾承接；若跳时，必须写明桥接结果。
2. 用户日记必须造成角色行动和剧情后果，不能只被提及。
3. 已选命运必须造成可观察的风险、资源、关系、信息、时间成本或目标变化。
4. 不得无解释改变实体、人物关系、物品、目标或已确认事实。
5. 只输出 JSON，不写小说正文、不加 Markdown。
6. scenes 必须恰好输出 3 至 6 个完整场景；每个场景都必须有 sceneId、purpose、time、location、至少一个 requiredActions 和至少一个 stateChanges，不能留空或使用“待定”。
7. openingContract.requiredFirstAction 必须是一个具体动作；并且 scenes[0].requiredActions 必须逐字包含同一句动作（直接复制，不要改写）。
8. endingContract.nextAction 也必须是一个具体、可执行的动作，不能只写“继续推进”“等待后续”之类的概述。

输出 schema：
{
  "schemaVersion":2,"dayNumber":数字,
  "openingContract":{"previousState":"完整状态","requiredFirstAction":"完整动作","timeBridgeRequired":false,"completionEvidence":"正文前15%出现动作和直接结果"},
  "scenes":[{"sceneId":"S1","purpose":"...","time":"...","location":"...","requiredActions":["..."],"stateChanges":["..."],"diaryEventIds":["D1"],"choiceEffectIds":["C-selected"],"requiredFactIds":[]}],
  "transitionContracts":[{"fromSceneId":"S1","toSceneId":"S2","mustExplain":"..."}],
  "choiceConsequence":{"choice":"...","impactType":"risk|loss|exposure|obligation|relationship|resource|goal","consequence":"具体对象和代价","effectId":"C-selected"}|null,
  "endingContract":{"resultingState":"...","nextAction":"完整可执行动作","blockingRisk":"..."},
  "continuityAnchors":[],"entityChanges":[],"foreshadowActions":[],
  "forbiddenChanges":["..."]
}`

const safeJson = value => JSON.stringify(value ?? null).slice(0, 10000)

export class StoryPlanner {
  async plan(context, aiContext) {
    const validationContext = { dayNumber: context.dayNumber, dailyEvents: context.dailyEvents, choices: context.choices, previousHandoff: context.previousHandoff, requireSchemaVersion: 2 }
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
      // The V2 plan is intentionally detailed.  JSON mode removes prose/code
      // fences, and the larger budget prevents truncated scene contracts.
      temperature: 0,
      maxTokens: 2400,
      jsonMode: true,
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
    const openingFact = handoff.unfinishedAction || handoff.unfinished_action || handoff.immediateNextAction || handoff.immediate_next_action || handoff.activeGoal || handoff.active_goal || (context.dayNumber === 1 ? '林墨刚刚开始接触今天的异常线索。' : '林墨正处于上一日已经建立的调查现场。')
    const events = (context.dailyEvents || []).filter(Boolean).slice(0, 4)
    const choices = (context.choices || []).filter(item => item.description || item.effect)
    const choice = choices[choices.length - 1] || null
    const anchors = (facts.length ? facts : [openingFact]).slice(0, 5).map(fact => ({ fact, requiredUsage: '正文不得否定该事实，并让它影响当前行动。' }))
    const forbiddenChanges = [...prohibited, ...facts.map(fact => `不得无解释地否定或改变：${fact}`)].filter(Boolean).slice(0, 8)
    if (!forbiddenChanges.length) forbiddenChanges.push('不得无解释地改变上一日建立的场景、人物状态和当前目标。')
    const eventScenes = (events.length ? events : ['处理今天的核心经历']).map((event, index) => {
      const mapped = this._fallbackDiaryScene(event, index)
      return {
        sceneId: `S${index + 2}`,
        purpose: '让用户日记改变调查路径',
        time: index === 0 ? '当天白天' : '当天稍后',
        location: index === 0 ? '主角的日常活动地点' : '调查线索所在地',
        requiredActions: [mapped.action],
        stateChanges: [mapped.consequence],
        diaryEventIds: [`D${index + 1}`],
        choiceEffectIds: index === events.length - 1 && choice ? ['C-selected'] : [],
        requiredFactIds: [],
      }
    })
    const scenes = [
      {
        sceneId: 'S1', purpose: '完成跨日承接', time: '上一日结尾后', location: '上一日结束场景',
        requiredActions: [openingFact], stateChanges: ['上一日未完成状态获得明确推进'], diaryEventIds: [], choiceEffectIds: [], requiredFactIds: [],
      },
      ...eventScenes,
      {
        sceneId: `S${eventScenes.length + 2}`, purpose: '形成下一日钩子', time: '当天结尾', location: '当前调查地点',
        requiredActions: ['林墨确认当天行动的结果，并准备继续追查当前线索'], stateChanges: ['形成可由下一日继续承接的新状态与明确阻碍'], diaryEventIds: [], choiceEffectIds: choice && !eventScenes.length ? ['C-selected'] : [], requiredFactIds: [],
      },
    ]
    const transitions = scenes.slice(1).map((scene, index) => ({
      fromSceneId: scenes[index].sceneId, toSceneId: scene.sceneId,
      mustExplain: `交代从${scenes[index].sceneId}到${scene.sceneId}的时间、地点或行动衔接。`,
    }))
    const choiceConsequence = choice ? {
      choice: choice.description || choice.effect,
      impactType: 'risk', effectId: 'C-selected',
      consequence: `${choice.effect || '主动调查'}使林墨必须亲自推进线索，并承担行踪暴露或欠下人情的具体代价。`,
    } : null
    const plan = {
      schemaVersion: 2, dayNumber: context.dayNumber,
      openingContract: { previousState: openingFact, requiredFirstAction: openingFact, timeBridgeRequired: false, completionEvidence: '正文前15%必须出现该动作及其直接结果。' },
      scenes,
      transitionContracts: transitions,
      continuityAnchors: anchors,
      choiceConsequence, entityChanges: [], foreshadowActions: [],
      endingContract: { resultingState: '当前目标得到推进，并留下与既有线索一致的新状态。', nextAction: '林墨继续追查今天形成的关键线索。', blockingRisk: choice ? '主动追踪已经增加暴露或人情债风险。' : '当前线索仍存在未知阻碍。' },
      forbiddenChanges,
    }
    return StoryPlanValidator.normalize(plan)
  }

  _fallbackDiaryScene(event, index) {
    const source = String(event || '').trim()
    if (/调班|代班/.test(source)) return { action: `同事明确替林墨调班或代班，林墨因此获得调查时间。`, consequence: '林墨获得调查窗口，并因同事的帮助欠下明确人情。' }
    if (/报告|会议/.test(source)) return { action: `林墨完成并提交与“${source}”对应的报告。`, consequence: '报告结果为林墨带来许可、情报或关系变化，并影响下一步调查。' }
    return { action: `林墨实际处理“${source}”，并把结果用于当前调查。`, consequence: `“${source}”改变林墨的时间、资源或关系，使下一步调查路径发生具体变化。` }
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
