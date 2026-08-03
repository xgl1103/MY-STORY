// 日终交接单质量门禁。
// 目标不是替 AI 再写一次剧情，而是在交接单进入 Planner 前阻止残句、空泛动作和
// 明显截断文本继续污染后续计划。所有规则纯本地执行，不增加 AI 调用。

const ACTION_VERBS = /(?:将|把|嵌入|启动|打开|进入|离开|收起|握住|前往|追查|调查|确认|决定|寻找|交给|返回|跟随|躲开|面对|等待|检查|完成|提交|代班|调班|联系|准备|继续)/
const LEADING_FRAGMENT = /^(?:[，。；：、\s"'“”‘’…—-]+|(?:的|了|着|和|但|而且|所以|于是|声|后|前|中|里)[，。；：、\s]*)+/u
const TRAILING_FRAGMENT = /(?:[，、；：\-—…]|的|了|着|和|但|而且|所以|于是)$/u

const string = value => String(value || '').replace(/\s+/g, ' ').trim()
const unique = values => [...new Set(values.filter(Boolean))]

export class HandoffCleaner {
  clean(rawHandoff, { content = '', unresolvedThreads = [], choiceContext = null } = {}) {
    const raw = rawHandoff && typeof rawHandoff === 'object' ? rawHandoff : {}
    const issues = []
    let wasCleaned = false

    const cleanText = (value, field, { requireAction = false, maxLength = 180 } = {}) => {
      const original = string(value)
      let result = original.replace(LEADING_FRAGMENT, '').trim()
      result = result.slice(0, maxLength).trim()
      if (result !== original) {
        wasCleaned = true
        issues.push(`${field}: 清除了残余前缀或超长文本`)
      }
      if (!result || TRAILING_FRAGMENT.test(result) || (requireAction && !this._isActionable(result))) {
        if (original) issues.push(`${field}: 不是完整可执行动作`)
        return ''
      }
      return result
    }

    const fallback = this._fallback(content, unresolvedThreads, choiceContext)
    const endingScene = this._cleanEndingScene(raw.endingScene, fallback.endingScene)
    const hardFacts = this._cleanTextArray(raw.hardFacts, 'hardFacts', issues)
    const prohibitedChanges = this._cleanTextArray(raw.prohibitedChanges, 'prohibitedChanges', issues)
    const unresolved = this._cleanThreads(raw.unresolvedThreads, unresolvedThreads)
    const activeGoal = cleanText(raw.activeGoal, 'activeGoal', { requireAction: true }) || fallback.activeGoal
    const unfinishedAction = cleanText(raw.unfinishedAction, 'unfinishedAction', { requireAction: true })
    const immediateNextAction = cleanText(raw.immediateNextAction, 'immediateNextAction', { requireAction: true })

    // 交接动作是下一天最重要的接口。任一动作不合法时，不把半截 AI 输出传入 Planner。
    const actionInvalid = !unfinishedAction || !immediateNextAction
    if (actionInvalid) issues.push('handoff: 使用正文结尾构造可执行的降级动作')

    const normalized = {
      schemaVersion: 2,
      endingScene,
      characterStates: this._cleanCharacterStates(raw.characterStates),
      hardFacts: hardFacts.length ? hardFacts : fallback.hardFacts,
      factRecords: this._factRecords(raw.factRecords, hardFacts.length ? hardFacts : fallback.hardFacts),
      activeGoal,
      unfinishedAction: unfinishedAction || fallback.unfinishedAction,
      immediateNextAction: immediateNextAction || fallback.immediateNextAction,
      unresolvedThreads: unresolved.length ? unresolved : fallback.unresolvedThreads,
      prohibitedChanges: prohibitedChanges.length ? prohibitedChanges : fallback.prohibitedChanges,
      choiceContext: choiceContext || raw.choiceContext || null,
    }

    return {
      handoff: normalized,
      qualityStatus: actionInvalid ? 'fallback' : (wasCleaned || issues.length ? 'cleaned' : 'valid'),
      qualityIssues: unique(issues).slice(0, 12),
      fallbackReason: actionInvalid ? 'invalid_or_truncated_action' : null,
    }
  }

  _isActionable(value) {
    return string(value).length >= 8 && ACTION_VERBS.test(value)
  }

  _cleanEndingScene(value, fallback) {
    const source = value && typeof value === 'object' ? value : {}
    const cleanField = (item, max = 160) => string(item).replace(LEADING_FRAGMENT, '').slice(0, max).trim()
    return {
      time: cleanField(source.time, 60) || fallback.time,
      location: cleanField(source.location, 80) || fallback.location,
      presentCharacters: Array.isArray(source.presentCharacters)
        ? unique(source.presentCharacters.map(item => cleanField(item, 30)).filter(Boolean)).slice(0, 8)
        : fallback.presentCharacters,
      physicalState: cleanField(source.physicalState, 240) || fallback.physicalState,
    }
  }

  _cleanTextArray(values, field, issues) {
    if (!Array.isArray(values)) return []
    const result = unique(values.map(value => string(value).replace(LEADING_FRAGMENT, '').slice(0, 180).trim()).filter(value => value && !TRAILING_FRAGMENT.test(value))).slice(0, 10)
    if (result.length !== values.filter(Boolean).length) issues.push(`${field}: 移除了空值、残句或重复项`)
    return result
  }

  _cleanThreads(value, fallback) {
    const list = Array.isArray(value) ? value : []
    const cleaned = list.map(item => ({
      description: string(item?.description).replace(LEADING_FRAGMENT, '').slice(0, 180).trim(),
      priority: ['high', 'normal', 'low'].includes(item?.priority) ? item.priority : 'normal',
    })).filter(item => item.description && !TRAILING_FRAGMENT.test(item.description)).slice(0, 8)
    return cleaned.length ? cleaned : fallback
  }

  _cleanCharacterStates(value) {
    if (!Array.isArray(value)) return []
    return value.map(item => ({
      name: string(item?.name).slice(0, 30),
      emotion: string(item?.emotion).slice(0, 100),
      possessions: Array.isArray(item?.possessions) ? unique(item.possessions.map(v => string(v).slice(0, 60)).filter(Boolean)).slice(0, 8) : [],
      relationshipChanges: Array.isArray(item?.relationshipChanges) ? unique(item.relationshipChanges.map(v => string(v).slice(0, 120)).filter(Boolean)).slice(0, 6) : [],
    })).filter(item => item.name)
  }

  _factRecords(value, hardFacts) {
    if (Array.isArray(value) && value.length) {
      return value.map(item => ({
        subject: string(item?.subject).slice(0, 60),
        attribute: string(item?.attribute).slice(0, 60),
        value: string(item?.value).slice(0, 160),
        confidence: item?.confidence === 'confirmed' ? 'confirmed' : 'inferred',
        sourceDay: Number(item?.sourceDay) || null,
      })).filter(item => item.subject && item.attribute && item.value).slice(0, 12)
    }
    return hardFacts.map(value => ({ subject: '故事事实', attribute: '不可无解释改变', value, confidence: 'confirmed', sourceDay: null }))
  }

  _fallback(content, unresolvedThreads, choiceContext) {
    const ending = this._lastCompleteSentence(content) || '林墨必须承接本日结尾，继续推进当前线索。'
    const threads = (Array.isArray(unresolvedThreads) ? unresolvedThreads : []).slice(0, 6).map(item => ({
      description: string(item?.description), priority: ['high', 'normal', 'low'].includes(item?.priority) ? item.priority : 'normal',
    })).filter(item => item.description)
    const choiceText = string(choiceContext?.description || choiceContext?.effect)
    return {
      endingScene: { time: '本日结尾', location: '以正文结尾场景为准', presentCharacters: [], physicalState: ending },
      hardFacts: unique([
        ...(choiceText ? [`用户已选择：${choiceText}`] : []),
        ...threads.map(item => `未解决线索：${item.description}`),
      ]),
      activeGoal: choiceText ? `落实用户选择并推进：${choiceText}` : '承接正文结尾并推进当前线索。',
      unfinishedAction: `继续处理本日结尾的未完成行动：${ending}`,
      immediateNextAction: `从以下结尾状态开始下一场行动：${ending}`,
      unresolvedThreads: threads,
      prohibitedChanges: ['不得无解释地改变本日结尾的场景、人物状态、物品和当前目标。'],
    }
  }

  _lastCompleteSentence(content) {
    const text = string(content).slice(-1800)
    const sentences = text.split(/(?<=[。！？])/u).map(item => string(item)).filter(Boolean)
    const candidate = sentences.reverse().find(item => item.length >= 12 && !TRAILING_FRAGMENT.test(item)) || ''
    return candidate.slice(0, 240)
  }
}

export default HandoffCleaner
