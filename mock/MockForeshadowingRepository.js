class MockForeshadowingRepository {
  constructor() { this.data = []; this.idCounter = 1 }
  getUnresolved() { return this.data.filter(item => item.status === 'unresolved').map(item => ({ ...item })) }
  async create(data) { const row = { id: this.idCounter++, ...data, status: 'unresolved' }; this.data.push(row); return { ...row } }
  async resolve(id, storyDay, chapterNumber, resolution) {
    const row = this.data.find(item => item.id === id)
    if (row) Object.assign(row, { status: 'resolved', resolved_day: storyDay, resolved_chapter: chapterNumber, resolution })
  }
  formatForPrompt() { return this.getUnresolved().map(item => `- ${item.description}`).join('\n') }
  async extractFromContent() { return [] }
}
export default MockForeshadowingRepository
