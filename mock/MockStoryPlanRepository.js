class MockStoryPlanRepository {
  constructor() { this.data = []; this.idCounter = 1 }
  async getLatestForSegment(segmentId) {
    const row = this.data.slice().reverse().find(item => item.segment_id === segmentId && ['planned', 'used'].includes(item.status))
    return this._copy(row || null)
  }
  async getReusable(segmentId, inputFingerprint) {
    const row = this.data.slice().reverse().find(item => item.segment_id === segmentId && item.input_fingerprint === inputFingerprint && ['planned', 'used'].includes(item.status))
    return this._copy(row || null)
  }
  async upsert(data) {
    const reusable = await this.getReusable(data.segmentId, data.inputFingerprint)
    if (reusable) return reusable
    const row = { id: this.idCounter++, day_number: data.dayNumber, segment_id: data.segmentId, previous_handoff_day: data.previousHandoffDay ?? null, schema_version: data.schemaVersion || 1, plan: data.plan || {}, status: data.status || 'planned', source: data.source || 'ai', input_fingerprint: data.inputFingerprint, validationErrors: data.validationErrors || [] }
    this.data.push(row)
    return this._copy(row)
  }
  async markUsed(id) { const row = this.data.find(item => item.id === id); if (row) row.status = 'used' }
  async invalidateForSegment(segmentId) { this.data.filter(item => item.segment_id === segmentId && ['planned', 'used'].includes(item.status)).forEach(item => { item.status = 'invalidated' }) }
  _copy(value) { return value ? JSON.parse(JSON.stringify(value)) : null }
}
export default MockStoryPlanRepository
