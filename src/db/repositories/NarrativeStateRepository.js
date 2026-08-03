// 叙事图运行时状态：将静态 story_outline 转化为可推进、可回溯的用户故事。
import { queryAll, queryOne, execute, markWrite } from '../Database.js'

export const NarrativeStateRepository = {
  get(nodeId) {
    return queryOne('SELECT * FROM narrative_node_state WHERE node_id = ?', [nodeId])
  },

  getAll() {
    return queryAll('SELECT * FROM narrative_node_state ORDER BY selected_day, completed_day, node_id')
  },

  async upsert(data) {
    execute(
      `INSERT INTO narrative_node_state
       (node_id, world_id, status, selected_option_id, selected_option_desc, selected_effect, selected_day, completed_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET
         world_id = excluded.world_id,
         status = excluded.status,
         selected_option_id = COALESCE(excluded.selected_option_id, narrative_node_state.selected_option_id),
         selected_option_desc = COALESCE(excluded.selected_option_desc, narrative_node_state.selected_option_desc),
         selected_effect = COALESCE(excluded.selected_effect, narrative_node_state.selected_effect),
         selected_day = COALESCE(excluded.selected_day, narrative_node_state.selected_day),
         completed_day = COALESCE(excluded.completed_day, narrative_node_state.completed_day),
         updated_at = CURRENT_TIMESTAMP`,
      [
        data.nodeId, data.worldId, data.status || 'pending',
        data.selectedOptionId || null, data.selectedOptionDesc || null, data.selectedEffect || null,
        data.selectedDay || null, data.completedDay || null,
      ]
    )
    await markWrite(true)
    return this.get(data.nodeId)
  },
}
