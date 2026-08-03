class MockEntityRepository {
  constructor() { this.data = [] }
  async upsert(data) {
    const index = this.data.findIndex(item => item.entity_type === data.entity_type && item.entity_name === data.entity_name)
    const row = { ...(index >= 0 ? this.data[index] : {}), ...data }
    if (index >= 0) this.data[index] = row
    else this.data.push(row)
    return { ...row }
  }
  formatForPrompt() { return this.data.map(item => `${item.entity_name}：${item.description || '已出现'}`).join('\n') }
  async extractFromContent() { return [] }
}
export default MockEntityRepository
