// src/db/repositories/SegmentRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryOne, queryAll, execute, markWrite, runTransaction } from '../Database.js'

// 段落状态机（功能规划 5.2 节）合法值
const VALID_STATUS = [
  'pending', 'parsing', 'generating', 'draft_ready',
  'regenerating', 'editing', 'finalized', 'generate_failed'
]

export const SegmentRepository = {
  async create(data) {
    execute(
      `INSERT INTO story_segments (day_number, chapter_id, diary_id, status, content, mapping_desc, revision_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.day_number, data.chapter_id ?? null, data.diary_id ?? null, data.status || 'pending',
       data.content ?? null, data.mapping_desc ?? null, data.revision_count ?? 0]
    )
    // 同步取 last_insert_rowid，避免 await markWrite 期间被并发 INSERT 覆盖
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  async getById(id) {
    const row = queryOne('SELECT * FROM story_segments WHERE id = ?', [id])
    return row ? normalize(row) : null
  },

  async getAll() {
    const rows = queryAll('SELECT * FROM story_segments ORDER BY day_number')
    return rows.map(normalize)
  },

  async getByDay(dayNumber) {
    const row = queryOne(
      `SELECT * FROM story_segments WHERE day_number = ?
       ORDER BY id DESC LIMIT 1`, [dayNumber]
    )
    return row ? normalize(row) : null
  },

  // 最近 N 天已定稿段落（即时上下文用，功能规划 5.5 第一层）
  // 语义说明：参数 days 指"最近 N 天"，由于每天仅生成 1 个段落，
  // 等价于"最近 N 条 finalized 记录"，故用 LIMIT N 实现（与接口注释一致）
  // 取最近 N 条 finalized，按 day_number 正序返回
  async getRecent(days) {
    // 参数校验：确保 days 为合法正整数，默认 5，上限 100 防止全表扫描
    const limit = Math.max(1, Math.min(parseInt(days, 10) || 5, 100))
    const rows = queryAll(
      `SELECT * FROM story_segments
       WHERE status = 'finalized'
       ORDER BY id DESC LIMIT ?`,
      [limit]
    )
    return rows.reverse().map(normalize)
  },

  async getByChapter(chapterId) {
    const rows = queryAll(
      `SELECT * FROM story_segments WHERE chapter_id = ? ORDER BY day_number`,
      [chapterId]
    )
    return rows.map(normalize)
  },

  async updateContent(id, content) {
    execute(`UPDATE story_segments SET content = ? WHERE id = ?`, [content, id])
    await markWrite()
    return true
  },

  async updateStatus(id, status) {
    if (!VALID_STATUS.includes(status)) {
      throw new Error(`无效段落状态: ${status}`)
    }
    execute(`UPDATE story_segments SET status = ? WHERE id = ?`, [status, id])
    await markWrite()
    return true
  },

  async updateMapping(id, mappingDesc) {
    execute(`UPDATE story_segments SET mapping_desc = ? WHERE id = ?`, [mappingDesc, id])
    await markWrite()
    return true
  },

  async updateReferences(id, references) {
    execute(`UPDATE story_segments SET diary_references = ? WHERE id = ?`, [references, id])
    await markWrite()
    return true
  },

  // 将正文、引用与状态一次性提交。StoryEngine 与测试替身共用这一语义，
  // 避免业务层直接依赖 SQLite 全局连接。
  async commitDraft(id, { content, references = undefined, reviewCount = undefined, incrementRevision = false }) {
    runTransaction(() => {
      const changed = execute(`UPDATE story_segments SET content = ? WHERE id = ?`, [content, id])
      if (changed !== 1) throw new Error(`段落 ${id} 不存在，无法提交草稿`)
      if (references !== undefined) {
        execute(`UPDATE story_segments SET diary_references = ? WHERE id = ?`, [references, id])
      }
      if (reviewCount !== undefined) {
        execute(`UPDATE story_segments SET internal_review_count = ? WHERE id = ?`, [reviewCount, id])
      }
      if (incrementRevision) {
        execute(`UPDATE story_segments SET revision_count = revision_count + 1 WHERE id = ?`, [id])
      }
      execute(`UPDATE story_segments SET status = 'draft_ready' WHERE id = ?`, [id])
    })
    await markWrite(true)
    return true
  },

  // 用户重生成次数 +1（功能规划 5.3 节，最多 3 次）
  async incrementRevision(id) {
    execute(
      `UPDATE story_segments SET revision_count = revision_count + 1 WHERE id = ?`,
      [id]
    )
    await markWrite()
    return true
  },

  // 更新内部审查轮次数（AI 工程师阶段2新增）
  async updateReviewCount(id, reviewCount) {
    execute(
      `UPDATE story_segments SET internal_review_count = ? WHERE id = ?`,
      [reviewCount, id]
    )
    await markWrite()
    return true
  },

  async markEdited(id) {
    execute(`UPDATE story_segments SET is_edited = 1 WHERE id = ?`, [id])
    await markWrite()
    return true
  },

  // 定稿：状态置 finalized + 写入 finalized_at，强制落盘（功能规划 10.1）
  async markFinalized(id) {
    const affectedRows = execute(
      `UPDATE story_segments SET status = 'finalized', finalized_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [id]
    )
    if (affectedRows !== 1) {
      throw new Error(`段落 ${id} 不存在，无法定稿`)
    }
    await markWrite(true)
    return true
  }
}

function normalize(row) {
  return { ...row, is_edited: !!row.is_edited }
}
