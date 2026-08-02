// 不依赖模型的剧情计划校验器。它保证 Writer 收到的是可执行契约，而非松散建议。
const asArray = value => Array.isArray(value) ? value : []
const text = value => String(value || '').trim()

export class StoryPlanValidator {
  static validate(plan, context = {}) {
    const errors = []
    const expectedDay = context.dayNumber
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      return { valid: false, errors: [{ code: 'P001', path: '', message: '计划不是对象' }], normalizedPlan: null }
    }
    if (Number(plan.schemaVersion || 1) !== 1) errors.push({ code: 'P001', path: 'schemaVersion', message: '不支持的计划版本' })
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

    const beats = asArray(plan.beats)
    if (beats.length < 3 || beats.length > 5 || beats.some((item, index) => Number(item?.order) !== index + 1 || !text(item?.action) || !text(item?.stateChange))) {
      errors.push({ code: 'P007', path: 'beats', message: '剧情节拍必须为连续的 3～5 条行动与状态变化' })
    }
    if (!text(plan.endingTarget?.state)) errors.push({ code: 'P008', path: 'endingTarget', message: '缺少当天结束状态' })
    const forbidden = asArray(plan.forbiddenChanges).map(text).filter(Boolean)
    if (!forbidden.length) errors.push({ code: 'P009', path: 'forbiddenChanges', message: '缺少禁止改变的事实' })
    const previousForbidden = asArray(context.previousHandoff?.prohibitedChanges).map(text).filter(Boolean)
    for (const prior of previousForbidden) {
      if (!forbidden.some(item => item.includes(prior) || prior.includes(item))) {
        errors.push({ code: 'P009', path: 'forbiddenChanges', message: `未继承上一日禁止项：${prior}` })
      }
    }

    return { valid: errors.length === 0, errors, normalizedPlan: errors.length ? null : this.normalize(plan) }
  }

  static normalize(plan) {
    return {
      schemaVersion: 1,
      dayNumber: Number(plan.dayNumber),
      openingBridge: { sourceFact: text(plan.openingBridge.sourceFact), firstSceneAction: text(plan.openingBridge.firstSceneAction) },
      continuityAnchors: asArray(plan.continuityAnchors).slice(0, 8).map(item => ({ fact: text(item.fact), requiredUsage: text(item.requiredUsage) })),
      diaryCausality: asArray(plan.diaryCausality).slice(0, 4).map(item => ({ diaryEvent: text(item.diaryEvent), worldAction: text(item.worldAction), storyConsequence: text(item.storyConsequence) })),
      choiceConsequence: plan.choiceConsequence ? { choice: text(plan.choiceConsequence.choice), impactType: text(plan.choiceConsequence.impactType), consequence: text(plan.choiceConsequence.consequence) } : null,
      beats: asArray(plan.beats).slice(0, 5).map(item => ({ order: Number(item.order), purpose: text(item.purpose), action: text(item.action), stateChange: text(item.stateChange) })),
      entityChanges: asArray(plan.entityChanges).slice(0, 6),
      foreshadowActions: asArray(plan.foreshadowActions).slice(0, 4),
      endingTarget: { state: text(plan.endingTarget?.state), nextHook: text(plan.endingTarget?.nextHook) },
      forbiddenChanges: asArray(plan.forbiddenChanges).slice(0, 10).map(text).filter(Boolean),
    }
  }
}

export default StoryPlanValidator
