// 将剧情大纲节点、前置条件和用户选择连接成可执行的叙事状态图。
class NarrativeGraph {
  constructor(worldRepo, stateRepo) {
    this.worldRepo = worldRepo
    this.stateRepo = stateRepo
  }

  async getPendingChoiceForNextDay(user) {
    const nextDay = (user.current_day || 0) + 1
    const nodes = await this.worldRepo.getAllOutlineNodes(user.world_id)
    const states = await this.stateRepo.getAll()
    const stateMap = new Map(states.map(state => [state.node_id, state]))
    const node = nodes.find(item =>
      item.node_type === 'branch' && Number(item.trigger_day) === nextDay &&
      this._prerequisitesCompleted(item, stateMap)
    )
    if (!node) return null
    const state = stateMap.get(node.node_id)
    if (state?.selected_option_id) return null
    const options = this._parseJson(node.branch_options, [])
    if (!options.length) return null
    return {
      nodeId: node.node_id,
      triggerDay: Number(node.trigger_day),
      prompt: node.content,
      options: options.map(option => ({ id: option.id, desc: option.desc, effect: option.effect || '' })),
    }
  }

  async choose(nodeId, optionId, user) {
    const nodes = await this.worldRepo.getAllOutlineNodes(user.world_id)
    const node = nodes.find(item => item.node_id === nodeId && item.node_type === 'branch')
    if (!node) throw new Error('该命运节点不存在')
    if (Number(node.trigger_day) !== (user.current_day || 0) + 1) {
      throw new Error('该命运抉择尚未开放或已过期')
    }
    const states = await this.stateRepo.getAll()
    const stateMap = new Map(states.map(state => [state.node_id, state]))
    if (!this._prerequisitesCompleted(node, stateMap)) throw new Error('尚未满足该抉择的前置剧情')
    const option = this._parseJson(node.branch_options, []).find(item => item.id === optionId)
    if (!option) throw new Error('无效的命运选项')
    await this.stateRepo.upsert({
      nodeId, worldId: user.world_id, status: 'selected', selectedOptionId: option.id,
      selectedOptionDesc: option.desc, selectedEffect: option.effect || '', selectedDay: user.current_day || 0,
    })
    return { nodeId, optionId: option.id, description: option.desc, effect: option.effect || '' }
  }

  async completeNodesForDay(dayNumber, user) {
    const nodes = await this.worldRepo.getAllOutlineNodes(user.world_id)
    const states = await this.stateRepo.getAll()
    const stateMap = new Map(states.map(state => [state.node_id, state]))
    const dueNodes = nodes
      .filter(node => Number(node.trigger_day) <= dayNumber)
      .sort((a, b) => Number(a.trigger_day) - Number(b.trigger_day))
    for (const node of dueNodes) {
      const existing = stateMap.get(node.node_id)
      if (existing?.status === 'completed' || !this._prerequisitesCompleted(node, stateMap)) continue
      if (node.node_type === 'branch' && !existing?.selected_option_id) continue
      const saved = await this.stateRepo.upsert({
        nodeId: node.node_id, worldId: user.world_id, status: 'completed',
        selectedOptionId: existing?.selected_option_id,
        selectedOptionDesc: existing?.selected_option_desc,
        selectedEffect: existing?.selected_effect,
        selectedDay: existing?.selected_day,
        completedDay: dayNumber,
      })
      stateMap.set(node.node_id, saved)
    }
  }

  async getGenerationContext({ user, dayNumber }) {
    const nodes = await this.worldRepo.getAllOutlineNodes(user.world_id)
    const states = await this.stateRepo.getAll()
    const stateMap = new Map(states.map(state => [state.node_id, state]))
    const activeCandidates = nodes.filter(node =>
      Number(node.trigger_day) <= dayNumber && this._prerequisitesCompleted(node, stateMap) &&
      (node.node_type !== 'branch' || stateMap.get(node.node_id)?.selected_option_id)
    ).sort((a, b) => Number(b.trigger_day) - Number(a.trigger_day))
    const activeNode = activeCandidates[0] || null
    const choices = states.filter(state => state.selected_option_id).map(state => ({
      nodeId: state.node_id, optionId: state.selected_option_id,
      description: state.selected_option_desc, effect: state.selected_effect,
    }))
    return { activeNode, choices, text: this.formatForPrompt(activeNode, choices, dayNumber) }
  }

  formatForPrompt(activeNode, choices, dayNumber) {
    const active = activeNode
      ? `【当前剧情节点】${activeNode.node_id}（第${activeNode.trigger_day}天起）\n${activeNode.content}`
      : '【当前剧情节点】尚未触发固定节点；根据已知事实自然推进剧情。'
    const choiceText = choices.length
      ? choices.map(item => `- ${item.nodeId}：用户选择“${item.description}”。后续影响：${item.effect || '保持该选择带来的叙事后果。'}`).join('\n')
      : '（用户尚未作出关键命运选择。）'
    return `${active}\n\n【用户已作出的命运选择】\n${choiceText}\n\n【创作原则】第${dayNumber}天的日记会实质影响人物的行动方式、关系、代价与剧情结果；不要为了固定大纲而抹去用户当天经历。固定节点只定义叙事目标，不规定唯一发生方式。`
  }

  _prerequisitesCompleted(node, stateMap) {
    const prerequisites = this._parseJson(node.prerequisites, [])
    return prerequisites.every(id => stateMap.get(id)?.status === 'completed')
  }

  _parseJson(value, fallback) {
    if (Array.isArray(value)) return value
    try { return JSON.parse(value || '[]') } catch (_) { return fallback }
  }
}

export default NarrativeGraph
