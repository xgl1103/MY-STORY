// src/db/repositories/ForeshadowingRepository.js
// 伏笔池：追踪未回收的伏笔，定期提醒 AI 回收

import { queryAll, queryOne, execute, markWrite } from '../Database.js'

export const ForeshadowingRepository = {
  // 获取所有未回收的伏笔
  getUnresolved() {
    return queryAll(
      'SELECT * FROM foreshadowing WHERE status = ? ORDER BY priority DESC, planted_day ASC',
      ['unresolved']
    )
  },

  // 获取高优先级未回收伏笔
  getHighPriority() {
    return queryAll(
      'SELECT * FROM foreshadowing WHERE status = ? AND priority = ? ORDER BY planted_day ASC',
      ['unresolved', 'high']
    )
  },

  // 获取需要提醒回收的伏笔（埋设超过 15 天仍未回收）
  getOverdue(currentDay) {
    return queryAll(
      'SELECT * FROM foreshadowing WHERE status = ? AND planted_day < ? ORDER BY planted_day ASC',
      ['unresolved', currentDay - 15]
    )
  },

  async create(data) {
    execute(
      `INSERT INTO foreshadowing (planted_day, planted_chapter, description, priority, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.planted_day,
        data.planted_chapter || null,
        data.description,
        data.priority || 'normal',
        data.status || 'unresolved'
      ]
    )
    // execute() 返回受影响行数，需通过 queryOne 取 last_insert_rowid
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  async resolve(id, resolvedDay, resolvedChapter, resolution) {
    execute(
      `UPDATE foreshadowing SET status = ?, resolved_day = ?, resolved_chapter = ?, resolution = ?
       WHERE id = ?`,
      ['resolved', resolvedDay, resolvedChapter, resolution, id]
    )
    await markWrite()
  },

  // 从故事内容中检测伏笔（Mock 版本，生产环境替换为 AI 提取）
  async extractFromContent(content, storyDay, chapterNumber) {
    if (!content) return []
    const planted = []

    // 检测伏笔关键词
    const foreshadowPatterns = [
      { pattern: /神秘[的]?[^，。]{2,10}/g, priority: 'high' },
      { pattern: /不知[道]?为什么/g, priority: 'normal' },
      { pattern: /似乎[有]?[^，。]{2,10}/g, priority: 'normal' },
      { pattern: /暗示[^，。]{2,10}/g, priority: 'high' },
      { pattern: /预感[^，。]{2,10}/g, priority: 'normal' },
      { pattern: /隐藏[的]?[^，。]{2,10}/g, priority: 'normal' },
      { pattern: /未解[的]?[^，。]{2,10}/g, priority: 'high' },
      { pattern: /奇怪[的]?[^，。]{2,10}/g, priority: 'low' },
    ]

    for (const { pattern, priority } of foreshadowPatterns) {
      const matches = content.match(pattern)
      if (matches) {
        for (const m of matches) {
          // 去重检查
          const existing = queryOne(
            'SELECT id FROM foreshadowing WHERE description = ? AND status = ?',
            [m, 'unresolved']
          )
          if (!existing) {
            await this.create({
              planted_day: storyDay,
              planted_chapter: chapterNumber,
              description: m,
              priority
            })
            planted.push({ description: m, priority })
          }
        }
      }
    }

    return planted
  },

  // 格式化为 Prompt 文本
  formatForPrompt(currentDay) {
    const unresolved = this.getUnresolved()
    if (unresolved.length === 0) return ''

    const high = unresolved.filter(f => f.priority === 'high')
    const normal = unresolved.filter(f => f.priority === 'normal')
    const overdue = unresolved.filter(f => currentDay && f.planted_day < currentDay - 15)

    let text = '【未回收伏笔】\n'
    if (high.length > 0) {
      text += '⚠ 高优先级（建议近期回收）：\n'
      for (const f of high) {
        const age = currentDay ? `（第${f.planted_day}天埋设，已${currentDay - f.planted_day}天）` : ''
        text += `- ${f.description}${age}\n`
      }
    }
    if (normal.length > 0) {
      text += '普通：\n'
      for (const f of normal.slice(0, 5)) {
        text += `- ${f.description}（第${f.planted_day}天）\n`
      }
      if (normal.length > 5) text += `...等${normal.length}条\n`
    }
    if (overdue.length > 0) {
      text += `\n⚡ 以下伏笔已超过15天未回收，强烈建议在近几章回收：\n`
      for (const f of overdue.slice(0, 3)) {
        text += `- ${f.description}（第${f.planted_day}天埋设，已${currentDay - f.planted_day}天）\n`
      }
    }
    return text
  }
}
