// src/db/repositories/ChapterRepository.js
// 接口签名严格遵循角色分工 4.1 节接口 B 定义
import { queryOne, queryAll, execute, markWrite } from '../Database.js'

export const ChapterRepository = {
  async getById(id) {
    return queryOne('SELECT * FROM chapters WHERE id = ?', [id])
  },

  async getByNumber(chapterNumber) {
    return queryOne('SELECT * FROM chapters WHERE chapter_number = ?', [chapterNumber])
  },

  // 当前章节 = user_settings.current_chapter 对应的章节
  async getCurrent() {
    const row = queryOne(
      `SELECT c.* FROM chapters c
       JOIN user_settings u ON u.id = 1
       WHERE c.chapter_number = u.current_chapter`
    )
    return row || null
  },

  async getAll() {
    return queryAll('SELECT * FROM chapters ORDER BY chapter_number')
  },

  async create(data) {
    execute(
      `INSERT INTO chapters (chapter_number, title, content, summary,
        start_day, end_day, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.chapter_number, data.title, data.content, data.summary,
        data.start_day, data.end_day, data.status || 'ongoing'
      ]
    )
    // 同步取 last_insert_rowid，避免 await markWrite 期间被并发 INSERT 覆盖
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  async update(id, fields) {
    const allowed = ['title', 'content', 'summary', 'start_day', 'end_day',
                     'status', 'completed_at']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    const params = keys.map(k => fields[k])
    execute(`UPDATE chapters SET ${setClause} WHERE id = ?`, [...params, id])
    await markWrite()
    return true
  },

  // 追加段落内容到章节（每段定稿后拼接），用 COALESCE 处理 NULL
  async updateContent(chapterId, content) {
    execute(
      `UPDATE chapters SET content = COALESCE(content, '') || ? WHERE id = ?`,
      [content, chapterId]
    )
    await markWrite()
    return true
  },

  async updateSummary(chapterId, summary) {
    execute(`UPDATE chapters SET summary = ?, completed_at = CURRENT_TIMESTAMP,
             status = 'completed' WHERE id = ?`, [summary, chapterId])
    await markWrite(true) // 章节完成，强制写回
    return true
  },

  async updateHeatLevel(chapterNumber, heatLevel) {
    execute(`UPDATE chapters SET heat_level = ? WHERE chapter_number = ?`, [heatLevel, chapterNumber])
    await markWrite()
    return true
  }
}
