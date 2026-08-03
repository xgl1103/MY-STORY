// 不依赖模型的剧情计划校验器。V1 保持兼容；V2 把日记、选择和跨日承接
// 绑定到可执行场景，避免“字段存在但正文没有发生”的松散计划。
const asArray = value => Array.isArray(value) ? value : []
const text = value => String(value || '').trim()
const actionable = value => text(value).length >= 8 && /(?:将|把|嵌入|启动|打开|进入|离开|收起|前往|调查|确认|完成|提交|代班|调班|继续|联系|追查|准备|寻找|开始|处理)/.test(text(value))
const abstractImpact = value => /^(?:承担更高风险|推进剧情|改变关系或风险|产生影响|继续调查|自然推进)$/u.test(text(value))

export class StoryPlanValidator {
  static validate(plan, context = {}) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      return { valid: false, errors: [{ code: 'P001', path: '', message: '计划不是对象' }], normalizedPlan: null }
    }
    const version = Number(plan.schemaVersion || 1)
    if (context.requireSchemaVersion && version !== Number(context.requireSchemaVersion)) {
      return { valid: false, errors: [{ code: 'P001', path: 'schemaVersion', message: `当前生成必须使用计划版本 ${context.requireSchemaVersion}` }], normalizedPlan: null }
    }
    if (version === 2) return this._validateV2(plan, context)
    if (version === 1) return this._validateV1(plan, context)
    return { valid: false, errors: [{ code: 'P001', path: 'schemaVersion', message: '不支持的计划版本' }], normalizedPlan: null }
  }

  static _validateV1(plan, context) {
    const errors = []
    const expectedDay = context.dayNumber
    if (Number(plan.dayNumber) !== Number(expectedDay)) errors.push({ code: 'P002', path: 'dayNumber', message: '计划天数与当前生成天数不一致' })
    if (!text(plan.openingBridge?.sourceFact) || !text(plan.openingBridge?.firstSceneAction)) errors.push({ code: 'P003', path: 'openingBridge', message: '缺少跨日承接信息' })

    const anchors = asArray(plan.continuityAnchors)
    if (!anchors.length || anchors.some(item => !text(item?.fact) || !text(item?.requiredUsage))) errors.push({ code: 'P004', path: 'continuityAnchors', message: '连续性锚点为空或不完整' })

    const events = asArray(context.dailyEvents).map(text).filter(Boolean)
    const causality = asArray(plan.diaryCausality)
    if (events.length && (causality.length < events.length || causality.some(item => !text(item?.diaryEvent) || !text(item?.worldAction) || !text(item?.storyConsequence)))) {
      errors.push({ code: 'P005', path: 'diaryCausality', message: '核心日记事件未全部形成行动与后果' })
    }
    for (const event of events) {
      const matched = causality.some(item => {
        const stated = text(item?.diaryEvent)
        return stated.includes(event) || event.includes(stated)
      })
      if (!matched) errors.push({ code: 'P005', path: 'diaryCausality', message: `日记事件未被计划承接：${event}` })
    }

    this._validateChoiceV1(plan, context, errors)
    const beats = asArray(plan.beats)
    if (beats.length < 3 || beats.length > 5 || beats.some((item, index) => Number(item?.order) !== index + 1 || !text(item?.action) || !text(item?.stateChange))) {
      errors.push({ code: 'P007', path: 'beats', message: '剧情节拍必须为连续的 3～5 条行动与状态变化' })
    }
    if (!text(plan.endingTarget?.state)) errors.push({ code: 'P008', path: 'endingTarget', message: '缺少当天结束状态' })
    this._validateForbidden(plan.forbiddenChanges, context, errors)
    return { valid: errors.length === 0, errors, normalizedPlan: errors.length ? null : this.normalize(plan) }
  }

  static _validateChoiceV1(plan, context, errors) {
    const selectedChoices = asArray(context.choices).filter(item => text(item?.description) || text(item?.effect))
    if (selectedChoices.length && (!plan.choiceConsequence || !text(plan.choiceConsequence.choice) || !text(plan.choiceConsequence.consequence))) {
      errors.push({ code: 'P006', path: 'choiceConsequence', message: '已选命运没有具体后果' })
    }
    if (selectedChoices.length && plan.choiceConsequence) {
      const expected = selectedChoices[selectedChoices.length - 1]
      const choiceText = text(plan.choiceConsequence.choice)
      const expectedText = text(expected.description) || text(expected.effect)
      if (!choiceText.includes(expectedText) && !expectedText.includes(choiceText)) {
        errors.push({ code: 'P006', path: 'choiceConsequence.choice', message: '计划中的命运选择与用户实际选择不一致' })
      }
    }
  }

  static _validateV2(plan, context) {
    const errors = []
    if (Number(plan.dayNumber) !== Number(context.dayNumber)) errors.push({ code: 'P002', path: 'dayNumber', message: '计划天数与当前生成天数不一致' })
    const opening = plan.openingContract || {}
    if (!text(opening.previousState) || !actionable(opening.requiredFirstAction)) {
      errors.push({ code: 'P101', path: 'openingContract', message: '开场交接不是完整可执行动作' })
    }

    const scenes = asArray(plan.scenes)
    if (scenes.length < 3 || scenes.length > 6) {
      errors.push({ code: 'P007', path: 'scenes', message: '场景必须为连续的 3～6 个' })
    }
    const ids = new Set()
    for (const [index, scene] of scenes.entries()) {
      const sceneId = text(scene?.sceneId)
      if (!sceneId || ids.has(sceneId) || !text(scene?.purpose) || !text(scene?.time) || !text(scene?.location) || !asArray(scene?.requiredActions).some(actionable) || !asArray(scene?.stateChanges).some(value => text(value).length >= 6)) {
        errors.push({ code: 'P007', path: `scenes[${index}]`, message: '场景缺少唯一 ID、时空、可执行动作或状态变化' })
      }
      ids.add(sceneId)
    }
    if (scenes.length && !asArray(scenes[0]?.requiredActions).some(action => text(action).includes(text(opening.requiredFirstAction)) || text(opening.requiredFirstAction).includes(text(action)))) {
      errors.push({ code: 'P101', path: 'scenes[0]', message: '第一场景没有执行开场合同动作' })
    }

    const events = asArray(context.dailyEvents).map(text).filter(Boolean)
    const eventIds = this._eventIds(events)
    for (const { id, event } of eventIds) {
      const linked = scenes.filter(scene => asArray(scene?.diaryEventIds).map(text).includes(id))
      if (!linked.length) errors.push({ code: 'P102', path: 'scenes', message: `日记事件未绑定场景：${event}` })
      else if (!linked.some(scene => asArray(scene.requiredActions).some(actionable) && asArray(scene.stateChanges).some(change => text(change).length >= 8 && !abstractImpact(change)))) {
        errors.push({ code: 'P103', path: 'scenes', message: `日记事件没有具体动作和状态变化：${event}` })
      }
    }

    const selected = asArray(context.choices).filter(item => text(item?.description) || text(item?.effect))
    const choice = plan.choiceConsequence || null
    if (selected.length) {
      const expected = selected[selected.length - 1]
      const expectedText = text(expected.description) || text(expected.effect)
      const choiceText = text(choice?.choice)
      const impact = text(choice?.impactType)
      if (!choice || !choiceText || !impact || !text(choice?.consequence) || (!choiceText.includes(expectedText) && !expectedText.includes(choiceText))) {
        errors.push({ code: 'P006', path: 'choiceConsequence', message: '已选命运没有具体后果或与用户选择不一致' })
      } else if (abstractImpact(choice.consequence) || text(choice.consequence).length < 10) {
        errors.push({ code: 'P104', path: 'choiceConsequence.consequence', message: '命运后果过于抽象，必须说明具体代价或对象' })
      }
      const effectId = text(choice?.effectId) || 'C-selected'
      if (!scenes.some(scene => asArray(scene?.choiceEffectIds).map(text).includes(effectId))) {
        errors.push({ code: 'P104', path: 'scenes', message: '命运后果未绑定到具体场景' })
      }
    }

    const transitions = asArray(plan.transitionContracts)
    for (let index = 1; index < scenes.length; index++) {
      const previous = scenes[index - 1]
      const current = scenes[index]
      if (text(previous?.time) !== text(current?.time) || text(previous?.location) !== text(current?.location)) {
        const bridged = transitions.some(item => text(item?.fromSceneId) === text(previous?.sceneId) && text(item?.toSceneId) === text(current?.sceneId) && text(item?.mustExplain).length >= 8)
        if (!bridged) errors.push({ code: 'P105', path: 'transitionContracts', message: `场景 ${previous?.sceneId} 到 ${current?.sceneId} 缺少时间或地点桥接` })
      }
    }

    const ending = plan.endingContract || {}
    if (!text(ending.resultingState) || !actionable(ending.nextAction) || !text(ending.blockingRisk)) {
      errors.push({ code: 'P106', path: 'endingContract', message: '结束合同缺少结果状态、下一步动作或阻碍' })
    }
    this._validateForbidden(plan.forbiddenChanges, context, errors)
    return { valid: errors.length === 0, errors, normalizedPlan: errors.length ? null : this.normalize(plan) }
  }

  static _validateForbidden(value, context, errors) {
    const forbidden = asArray(value).map(text).filter(Boolean)
    if (!forbidden.length) errors.push({ code: 'P009', path: 'forbiddenChanges', message: '缺少禁止改变的事实' })
    const previous = asArray(context.previousHandoff?.prohibitedChanges).map(text).filter(Boolean)
    for (const prior of previous) {
      if (!forbidden.some(item => item.includes(prior) || prior.includes(item))) errors.push({ code: 'P009', path: 'forbiddenChanges', message: `未继承上一日禁止项：${prior}` })
    }
  }

  static _eventIds(events) {
    return events.map((event, index) => ({ id: `D${index + 1}`, event }))
  }

  static normalize(plan) {
    if (Number(plan.schemaVersion) === 2) return this._normalizeV2(plan)
    return {
      schemaVersion: 1,
      dayNumber: Number(plan.dayNumber),
      openingBridge: { sourceFact: text(plan.openingBridge.sourceFact), firstSceneAction: text(plan.openingBridge.firstSceneAction) },
      continuityAnchors: asArray(plan.continuityAnchors).slice(0, 8).map(item => ({ fact: text(item.fact), requiredUsage: text(item.requiredUsage) })),
      diaryCausality: asArray(plan.diaryCausality).slice(0, 4).map(item => ({ diaryEvent: text(item.diaryEvent), worldAction: text(item.worldAction), storyConsequence: text(item.storyConsequence) })),
      choiceConsequence: plan.choiceConsequence ? { choice: text(plan.choiceConsequence.choice), impactType: text(plan.choiceConsequence.impactType), consequence: text(plan.choiceConsequence.consequence) } : null,
      beats: asArray(plan.beats).slice(0, 5).map(item => ({ order: Number(item.order), purpose: text(item.purpose), action: text(item.action), stateChange: text(item.stateChange) })),
      entityChanges: asArray(plan.entityChanges).slice(0, 6), foreshadowActions: asArray(plan.foreshadowActions).slice(0, 4),
      endingTarget: { state: text(plan.endingTarget?.state), nextHook: text(plan.endingTarget?.nextHook) },
      forbiddenChanges: asArray(plan.forbiddenChanges).slice(0, 10).map(text).filter(Boolean),
    }
  }

  static _normalizeV2(plan) {
    return {
      schemaVersion: 2, dayNumber: Number(plan.dayNumber),
      openingContract: {
        previousState: text(plan.openingContract?.previousState), requiredFirstAction: text(plan.openingContract?.requiredFirstAction),
        timeBridgeRequired: Boolean(plan.openingContract?.timeBridgeRequired), completionEvidence: text(plan.openingContract?.completionEvidence),
      },
      scenes: asArray(plan.scenes).slice(0, 6).map(item => ({
        sceneId: text(item.sceneId), purpose: text(item.purpose), time: text(item.time), location: text(item.location),
        requiredActions: asArray(item.requiredActions).map(text).filter(Boolean).slice(0, 5),
        stateChanges: asArray(item.stateChanges).map(text).filter(Boolean).slice(0, 5),
        diaryEventIds: asArray(item.diaryEventIds).map(text).filter(Boolean).slice(0, 4),
        choiceEffectIds: asArray(item.choiceEffectIds).map(text).filter(Boolean).slice(0, 3),
        requiredFactIds: asArray(item.requiredFactIds).map(text).filter(Boolean).slice(0, 6),
      })),
      transitionContracts: asArray(plan.transitionContracts).slice(0, 6).map(item => ({ fromSceneId: text(item.fromSceneId), toSceneId: text(item.toSceneId), mustExplain: text(item.mustExplain) })),
      choiceConsequence: plan.choiceConsequence ? { choice: text(plan.choiceConsequence.choice), impactType: text(plan.choiceConsequence.impactType), consequence: text(plan.choiceConsequence.consequence), effectId: text(plan.choiceConsequence.effectId) || 'C-selected' } : null,
      endingContract: { resultingState: text(plan.endingContract?.resultingState), nextAction: text(plan.endingContract?.nextAction), blockingRisk: text(plan.endingContract?.blockingRisk) },
      forbiddenChanges: asArray(plan.forbiddenChanges).map(text).filter(Boolean).slice(0, 10),
      continuityAnchors: asArray(plan.continuityAnchors).slice(0, 8), entityChanges: asArray(plan.entityChanges).slice(0, 6), foreshadowActions: asArray(plan.foreshadowActions).slice(0, 4),
    }
  }
}

export default StoryPlanValidator
