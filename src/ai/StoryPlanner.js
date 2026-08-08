import StoryPlanValidator from './StoryPlanValidator.js'

const SYSTEM_PROMPT = `你是互动连载小说的编剧规划器，精通《诡秘之主》世界观。你的职责不是写小说正文，而是把“上一日结尾、用户日记、命运选择和长期记忆”转化为当天可执行的因果计划。

【世界观基础设定（所有计划必须符合）】
- 这是维多利亚时代风格的架空世界，存在非凡者和非凡特性。
- 世界共有 22 条神之途径，每条途径有 10 个等级（序列 9 到序列 0），序列 9 最弱，序列 0 相当于真神。
- 普通人无法感知非凡现象，世界大多数人不了解非凡者的存在。
- 服用对应魔药可以晋升序列，但魔药可能带来精神污染和失控风险。
- 主角当前途径：占卜家（序列 9）。
- 占卜家序列 9 的能力：灵视（看见灵体和非凡特性）、基础占卜（使用星象、塔罗牌等进行简单预测）、星象观测。
- 塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称，定期举行“雾之上”的聚会。
- 主角名由 context.heroName 指定，所有场景中的主角称呼必须使用该名字，不得自创名字。

【计划语言要求】
- 场景中的 time、location、requiredActions、stateChanges 必须使用符合维多利亚时代和诡秘之主世界观的表达。
- 不得出现现代职场用语（如“报告”“会议”“调班”“KPI”“项目”等），必须将其转化为世界观内的活动（如“完成塔罗会委托”“在占卜室研究”“与非凡者组织联络”等）。
- 行为映射结果已将用户日常行为转化为世界观内行为，计划应基于映射结果而非原始日记事件。

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
    const heroName = context.heroName || '主角'
    const handoff = context.previousHandoff || {}
    const facts = Array.isArray(handoff.hardFacts) ? handoff.hardFacts : []
    const prohibited = Array.isArray(handoff.prohibitedChanges) ? handoff.prohibitedChanges : []
    const openingFact = handoff.unfinishedAction || handoff.unfinished_action || handoff.immediateNextAction || handoff.immediate_next_action || handoff.activeGoal || handoff.active_goal || (context.dayNumber === 1 ? `${heroName}刚刚开始接触今天的非凡线索。` : `${heroName}正处于上一日已经建立的调查现场。`)
    const events = (context.dailyEvents || []).filter(Boolean).slice(0, 4)
    const choices = (context.choices || []).filter(item => item.description || item.effect)
    const choice = choices[choices.length - 1] || null
    const anchors = (facts.length ? facts : [openingFact]).slice(0, 5).map(fact => ({ fact, requiredUsage: '正文不得否定该事实，并让它影响当前行动。' }))
    const forbiddenChanges = [...prohibited, ...facts.map(fact => `不得无解释地否定或改变：${fact}`)].filter(Boolean).slice(0, 8)
    if (!forbiddenChanges.length) forbiddenChanges.push('不得无解释地改变上一日建立的场景、人物状态和当前目标。')
    const eventScenes = (events.length ? events : ['处理今天的核心经历']).map((event, index) => {
      const mapped = this._fallbackDiaryScene(event, index, heroName)
      return {
        sceneId: `S${index + 2}`,
        purpose: '让用户日记改变调查路径',
        time: index === 0 ? '当天白天' : '当天稍后',
        location: index === 0 ? '主角的日常活动场所' : '非凡事件相关地点',
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
        requiredActions: [`${heroName}确认当天行动的结果，并准备继续追查当前非凡线索`], stateChanges: ['形成可由下一日继续承接的新状态与明确阻碍'], diaryEventIds: [], choiceEffectIds: choice && !eventScenes.length ? ['C-selected'] : [], requiredFactIds: [],
      },
    ]
    const transitions = scenes.slice(1).map((scene, index) => ({
      fromSceneId: scenes[index].sceneId, toSceneId: scene.sceneId,
      mustExplain: `交代从${scenes[index].sceneId}到${scene.sceneId}的时间、地点或行动衔接。`,
    }))
    const choiceConsequence = choice ? {
      choice: choice.description || choice.effect,
      impactType: 'risk', effectId: 'C-selected',
      consequence: `${choice.effect || '主动调查'}使${heroName}必须亲自推进线索，并承担行踪暴露或欠下人情的具体代价。`,
    } : null
    const plan = {
      schemaVersion: 2, dayNumber: context.dayNumber,
      openingContract: { previousState: openingFact, requiredFirstAction: openingFact, timeBridgeRequired: false, completionEvidence: '正文前15%必须出现该动作及其直接结果。' },
      scenes,
      transitionContracts: transitions,
      continuityAnchors: anchors,
      choiceConsequence, entityChanges: [], foreshadowActions: [],
      endingContract: { resultingState: '当前目标得到推进，并留下与既有线索一致的新状态。', nextAction: `${heroName}继续追查今天形成的关键非凡线索。`, blockingRisk: choice ? '主动追踪已经增加暴露或人情债风险。' : '当前线索仍存在未知阻碍。' },
      forbiddenChanges,
    }
    return StoryPlanValidator.normalize(plan)
  }

  _fallbackDiaryScene(event, index, heroName = '主角') {
    const source = String(event || '').trim()
    if (/调班|代班|换班/.test(source)) return { action: `塔罗会成员或同伴明确为${heroName}提供掩护，${heroName}因此获得调查非凡线索的时间。`, consequence: `${heroName}获得调查窗口，并因同伴的协助欠下明确人情。` }
    if (/报告|会议|汇报/.test(source)) return { action: `${heroName}完成并提交与"${source}"对应的塔罗会委托或非凡者组织任务。`, consequence: '任务结果为{heroName}带来许可、情报或关系变化，并影响下一步调查。'.replace('{heroName}', heroName) }
    if (/学习|读书|看书|复习|研究/.test(source)) return { action: `${heroName}在占卜室或住所研读与"${source}"相关的神秘学典籍或非凡者知识。`, consequence: `${heroName}获得新的神秘学认知或占卜线索，影响下一步行动方向。` }
    if (/健身|运动|锻炼|跑步/.test(source)) return { action: `${heroName}进行非凡者体能训练，磨炼身体以承受非凡特性的负荷。`, consequence: `${heroName}的体能和精神抗性得到微弱提升，为后续行动打下基础。` }
    if (/社交|聚会|聚餐|见朋友/.test(source)) return { action: `${heroName}与塔罗会成员或非凡者同伴会面，交换情报或建立联系。`, consequence: `${heroName}获得新的人际关系或情报线索，改变后续调查路径。` }
    if (/上班|工作|加班|写代码|改bug|开发/.test(source)) return { action: `${heroName}完成塔罗会或非凡者组织分派的委托任务，将日常经历转化为非凡者行动。`, consequence: `${heroName}的任务成果带来许可、情报或资源变化，影响下一步调查。` }
    if (/游戏|电影|娱乐|逛街/.test(source)) return { action: `${heroName}在贝克兰德的街头观察非凡现象，或将日常消遣作为掩护进行暗中调查。`, consequence: `${heroName}在看似平常的活动中捕捉到非凡线索，改变调查方向。` }
    return { action: `${heroName}将"${source}"的经历转化为非凡者世界中的具体行动，并把结果用于当前调查。`, consequence: `"${source}"改变${heroName}的时间、资源或关系，使下一步调查路径发生具体变化。` }
  }

  _buildPrompt(context) {
    const heroName = context.heroName || '主角'
    return `【主角名】${heroName}（所有场景中必须使用此名字称呼主角）

【世界观提醒】这是《诡秘之主》世界观——维多利亚时代风格的架空世界，主角是占卜家途径序列9的非凡者。场景中的地点、行动和状态变化必须使用符合该世界观的表达，不得出现现代职场用语。

【生成日】第${context.dayNumber}天
【上一日日终交接单】
${safeJson(context.previousHandoff || { note: '第1天，无前情。' })}

【用户当日日记事件】
${safeJson(context.dailyEvents || [])}

【行为映射（已将日常行为转化为世界观内行为，请基于此而非原始日记事件规划）】
${context.mappingDesc || '无'}

【当前叙事节点】
${context.narrativeText || '无固定节点'}

【已选命运】
${safeJson(context.choices || [])}

【实体和伏笔】
${String(context.entityMemory || '').slice(0, 3000)}
${String(context.foreshadowing || '').slice(0, 1600)}

【章节目的】
${context.chapterPurpose || '自然推进当前章节'}

请只输出符合 schema 的 JSON。`
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
