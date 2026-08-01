// src/db/repositories/CommentRepository.js
// 章节 AI 读者评论（预生成，阅读时渐进展示）

import { queryAll, queryOne, execute, markWrite } from '../Database.js'

export const CommentRepository = {
  getByChapter(chapterNumber) {
    return queryAll(
      'SELECT * FROM chapter_comments WHERE chapter_number = ? ORDER BY paragraph_index, reveal_at',
      [chapterNumber]
    )
  },

  // 获取当前可见的评论（reveal_at <= now）
  getVisibleByChapter(chapterNumber) {
    const now = Date.now()
    return queryAll(
      'SELECT * FROM chapter_comments WHERE chapter_number = ? AND reveal_at <= ? ORDER BY paragraph_index, reveal_at',
      [chapterNumber, now]
    )
  },

  async create(data) {
    execute(
      `INSERT INTO chapter_comments (chapter_number, paragraph_index, persona, persona_name, avatar_color, content, likes, reveal_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.chapter_number,
        data.paragraph_index,
        data.persona,
        data.persona_name,
        data.avatar_color,
        data.content,
        data.likes || Math.floor(Math.random() * 50) + 1,
        data.reveal_at || 0
      ]
    )
    // R4 修复：execute() 返回受影响行数（数字），需通过 queryOne 取 ID
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  async deleteByChapter(chapterNumber) {
    execute('DELETE FROM chapter_comments WHERE chapter_number = ?', [chapterNumber])
    await markWrite()
  },

  async batchCreate(comments) {
    if (!comments || comments.length === 0) return
    for (const c of comments) {
      await this.create(c)
    }
  }
}
