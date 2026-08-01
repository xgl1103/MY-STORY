// src/db/repositories/EntityRepository.js
// 实体记忆：追踪角色、物品、地点的状态变化

import { queryAll, queryOne, execute, markWrite } from '../Database.js'

export const EntityRepository = {
  getAll() {
    return queryAll('SELECT * FROM entity_state ORDER BY last_day DESC, entity_type')
  },

  getByType(type) {
    return queryAll('SELECT * FROM entity_state WHERE entity_type = ? AND status != ? ORDER BY last_day DESC', [type, 'lost'])
  },

  getActive() {
    return queryAll('SELECT * FROM entity_state WHERE status = ? ORDER BY entity_type, last_day DESC', ['active'])
  },

  getByName(type, name) {
    return queryOne('SELECT * FROM entity_state WHERE entity_type = ? AND entity_name = ?', [type, name])
  },

  async upsert(data) {
    const existing = this.getByName(data.entity_type, data.entity_name)
    if (existing) {
      execute(
        `UPDATE entity_state SET description = ?, status = ?, last_day = ?, relations = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          data.description || existing.description,
          data.status || 'active',
          data.last_day || existing.last_day,
          data.relations || existing.relations,
          data.notes || existing.notes,
          existing.id
        ]
      )
      await markWrite()
      return existing.id
    }
    execute(
      `INSERT INTO entity_state (entity_type, entity_name, description, status, first_day, last_day, relations, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.entity_type,
        data.entity_name,
        data.description || '',
        data.status || 'active',
        data.first_day || 0,
        data.last_day || 0,
        data.relations || null,
        data.notes || null
      ]
    )
    // execute() 返回受影响行数，需通过 queryOne 取 last_insert_rowid
    const row = queryOne('SELECT last_insert_rowid() AS id')
    await markWrite()
    return row ? row.id : 0
  },

  // 从故事内容中提取实体（Mock 版本，生产环境替换为 AI 提取）
  async extractFromContent(content, storyDay) {
    if (!content) return []
    const entities = []

    // 提取引号内的人名
    const namePattern = /[「」""'']([^「」""'']{2,6})[「」""'']/g
    let match
    const names = new Set()
    while ((match = namePattern.exec(content)) !== null) {
      names.add(match[1])
    }
    names.forEach(name => {
      entities.push({
        entity_type: 'character',
        entity_name: name,
        description: `在第${storyDay}天故事中出现`,
        status: 'mentioned',
        first_day: storyDay,
        last_day: storyDay
      })
    })

    // 提取常见物品关键词
    const itemKeywords = ['怀表', '匕首', '书信', '符咒', '药剂', '塔罗牌', '水晶球', '钥匙', '地图', '日记本']
    for (const item of itemKeywords) {
      if (content.includes(item)) {
        entities.push({
          entity_type: 'item',
          entity_name: item,
          description: `在第${storyDay}天故事中出现`,
          status: 'mentioned',
          first_day: storyDay,
          last_day: storyDay
        })
      }
    }

    // 提取地点关键词
    const locationKeywords = ['贝克兰德', '教堂', '酒馆', '码头', '墓地', '图书馆', '地下', '塔楼', '集市', '小巷']
    for (const loc of locationKeywords) {
      if (content.includes(loc)) {
        entities.push({
          entity_type: 'location',
          entity_name: loc,
          description: `在第${storyDay}天故事中出现`,
          status: 'mentioned',
          first_day: storyDay,
          last_day: storyDay
        })
      }
    }

    // 写入数据库（upsert）
    for (const e of entities) {
      await this.upsert(e)
    }
    return entities
  },

  // 格式化为 Prompt 文本
  formatForPrompt() {
    const active = this.getActive()
    if (active.length === 0) return ''

    const grouped = { character: [], item: [], location: [] }
    for (const e of active) {
      if (grouped[e.entity_type]) grouped[e.entity_type].push(e)
    }

    let text = ''
    if (grouped.character.length > 0) {
      text += '【已出场角色】\n'
      for (const c of grouped.character) {
        text += `- ${c.entity_name}：${c.description || '未知'}（首次出场：第${c.first_day}天）\n`
      }
    }
    if (grouped.item.length > 0) {
      text += '【已出现物品】\n'
      for (const i of grouped.item) {
        text += `- ${i.entity_name}：${i.description || '未知'}\n`
      }
    }
    if (grouped.location.length > 0) {
      text += '【已出现地点】\n'
      for (const l of grouped.location) {
        text += `- ${l.entity_name}：${l.description || '未知'}\n`
      }
    }
    return text
  }
}
