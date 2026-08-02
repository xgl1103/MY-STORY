class MockNarrativeStateRepository {
  constructor() { this.data = [] }

  get(nodeId) {
    const item = this.data.find(state => state.node_id === nodeId)
    return item ? JSON.parse(JSON.stringify(item)) : null
  }

  getAll() { return this.data.map(item => JSON.parse(JSON.stringify(item))) }

  async upsert(data) {
    const index = this.data.findIndex(state => state.node_id === data.nodeId)
    const existing = index >= 0 ? this.data[index] : {}
    const next = {
      ...existing,
      node_id: data.nodeId,
      world_id: data.worldId,
      status: data.status || existing.status || 'pending',
      selected_option_id: data.selectedOptionId || existing.selected_option_id || null,
      selected_option_desc: data.selectedOptionDesc || existing.selected_option_desc || null,
      selected_effect: data.selectedEffect || existing.selected_effect || null,
      selected_day: data.selectedDay ?? existing.selected_day ?? null,
      completed_day: data.completedDay ?? existing.completed_day ?? null,
    }
    if (index >= 0) this.data[index] = next
    else this.data.push(next)
    return JSON.parse(JSON.stringify(next))
  }
}

export default MockNarrativeStateRepository
