class MockDayHandoffRepository {
  constructor() { this.data = [] }
  async getByDay(dayNumber) { return this._copy(this.data.find(item => item.day_number === dayNumber) || null) }
  async getLatestBefore(dayNumber) {
    const matches = this.data.filter(item => item.day_number < dayNumber).sort((a, b) => b.day_number - a.day_number)
    return this._copy(matches[0] || null)
  }
  async upsert(data) {
    const row = {
      id: this.data.find(item => item.day_number === data.dayNumber)?.id || this.data.length + 1,
      day_number: data.dayNumber, segment_id: data.segmentId, schema_version: data.schemaVersion || 1,
      endingScene: data.endingScene || {}, characterStates: data.characterStates || [], hardFacts: data.hardFacts || [],
      active_goal: data.activeGoal || null, unfinished_action: data.unfinishedAction || null,
      immediate_next_action: data.immediateNextAction || null, unresolvedThreads: data.unresolvedThreads || [],
      prohibitedChanges: data.prohibitedChanges || [], choiceContext: data.choiceContext || null,
      source: data.source || 'ai', source_content_hash: data.sourceContentHash || '', updated_at: new Date().toISOString(),
      quality_status: data.qualityStatus || 'valid', qualityIssues: data.qualityIssues || [],
      factRecords: data.factRecords || [], fallback_reason: data.fallbackReason || null,
    }
    const index = this.data.findIndex(item => item.day_number === data.dayNumber)
    if (index >= 0) this.data[index] = row
    else this.data.push(row)
    return this._copy(row)
  }
  _copy(value) { return value ? JSON.parse(JSON.stringify(value)) : null }
}
export default MockDayHandoffRepository
