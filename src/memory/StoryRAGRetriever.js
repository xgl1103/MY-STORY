// src/memory/StoryRAGRetriever.js
// 动态 RAG：从过去故事原文中检索相关段落
// 解决"远距离回调"问题——第50天能回忆起第5天的细节
//
// 检索策略：
// 1. 从用户日记提取关键词（行为、地点、人物名）
// 2. 用 LIKE 查询在 story_segments 中搜索匹配段落
// 3. 按相关度排序，取 Top N
// 4. 排除已在即时记忆中的段落（避免重复）

import { queryAll } from '../db/Database.js'
import TokenCounter from '../utils/TokenCounter.js'

// 同义词映射表（提高召回率）
const SYNONYMS = {
  '占卜': ['预言', '塔罗', '神秘', '启示'],
  '战斗': ['搏斗', '冲突', '厮杀', '对抗'],
  '逃跑': ['逃离', '撤退', '躲避'],
  '交谈': ['对话', '商议', '讨论', '询问'],
  '探索': ['搜索', '调查', '寻找', '巡查'],
  '休息': ['睡眠', '冥想', '恢复'],
  '阅读': ['翻阅', '研读', '查看'],
  '恐惧': ['害怕', '惊恐', '畏惧', '不安'],
  '愤怒': ['暴怒', '恼怒', '生气'],
  '悲伤': ['哀伤', '难过', '悲痛'],
  '怀表': ['时钟', '时间', '指针'],
  '匕首': ['短剑', '利刃', '刀'],
  '教堂': ['神殿', '圣堂'],
  '酒馆': ['酒吧', '客栈'],
}

export class StoryRAGRetriever {
  constructor(segmentRepo) {
    this.segmentRepo = segmentRepo
    this.topK = 5           // 默认检索 Top 5 段落
    this.fallbackK = 3      // 超限时降为 Top 3
    this.tokenBudget = 5000
    this.minSnippetLen = 50  // 最短片段长度
    this.contextRadius = 200 // 每个片段前后保留的字符数
    this._ftsAvailable = null // 缓存 FTS5 是否可用
  }

  // 检测 FTS5 是否可用
  _checkFTS() {
    if (this._ftsAvailable !== null) return this._ftsAvailable
    try {
      const result = queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name='story_fts'", [])
      this._ftsAvailable = result && result.length > 0
    } catch (e) {
      this._ftsAvailable = false
    }
    return this._ftsAvailable
  }

  // 扩展关键词（加入同义词）
  _expandKeywords(keywords) {
    const expanded = new Set(keywords)
    for (const kw of keywords) {
      if (SYNONYMS[kw]) {
        SYNONYMS[kw].forEach(syn => expanded.add(syn))
      }
      // 反向查找：关键词是某个词的同义词
      for (const [base, syns] of Object.entries(SYNONYMS)) {
        if (syns.includes(kw)) {
          expanded.add(base)
          syns.forEach(s => expanded.add(s))
        }
      }
    }
    return Array.from(expanded)
  }

  // 从日记和映射结果中提取检索关键词
  // diaryEntry: DiaryParser 输出 { events: string[], detectedBehaviors: string[], keywords: string[] }
  // mappedBehaviors: MappingEngine 输出 [{ behavior, worldBehavior, description }]
  extractQueryKeywords(diaryEntry, mappedBehaviors) {
    const keywords = new Set()

    // 从日记事件中提取（events 是字符串数组）
    if (diaryEntry?.events && Array.isArray(diaryEntry.events)) {
      for (const ev of diaryEntry.events) {
        if (typeof ev === 'string') {
          // 提取 2-6 字的中文词组
          const words = ev.match(/[\u4e00-\u9fa5]{2,6}/g) || []
          words.forEach(w => keywords.add(w))
        } else if (ev && typeof ev === 'object') {
          // 兼容对象格式（未来可能升级）
          const text = ev.action || ev.subject || ev.description || ''
          const words = text.match(/[\u4e00-\u9fa5]{2,6}/g) || []
          words.forEach(w => keywords.add(w))
        }
      }
    }

    // 从 DiaryParser 已提取的关键词中补充
    if (diaryEntry?.keywords && Array.isArray(diaryEntry.keywords)) {
      diaryEntry.keywords.forEach(k => { if (k && k.length >= 2) keywords.add(k) })
    }

    // 从映射后的世界观行为中提取（字段名 worldBehavior，驼峰）
    if (mappedBehaviors && Array.isArray(mappedBehaviors)) {
      for (const mb of mappedBehaviors) {
        // 兼容驼峰和下划线两种命名
        const worldText = mb.worldBehavior || mb.world_behavior || ''
        if (worldText) {
          const words = worldText.match(/[\u4e00-\u9fa5]{2,6}/g) || []
          words.forEach(w => keywords.add(w))
        }
        // 也从原始行为中提取
        if (mb.behavior) keywords.add(mb.behavior)
      }
    }

    // 从日记原文中提取人名和地名（简单启发式）
    // DiaryParser 没有 rawText，用 events 拼接代替
    const rawText = Array.isArray(diaryEntry?.events)
      ? diaryEntry.events.join(' ')
      : (diaryEntry?.rawText || '')
    if (rawText) {
      // 匹配引号内的内容（可能是人名或特殊术语）
      const quoted = rawText.match(/[「」""'']([^「」""'']{2,8})[「」""'']/g)
      if (quoted) {
        quoted.forEach(q => {
          const inner = q.replace(/[「」""'']/g, '')
          if (inner.length >= 2) keywords.add(inner)
        })
      }
    }

    // 过滤掉过于宽泛的词
    const stopWords = ['今天', '昨天', '感觉', '觉得', '什么', '一个', '这个', '那个', '可以', '没有', '已经']
    stopWords.forEach(w => keywords.delete(w))

    return Array.from(keywords).slice(0, 10) // 最多 10 个关键词
  }

  // 检索相关故事段落
  async retrieve(keywords, excludeDays = []) {
    if (!keywords || keywords.length === 0) return []

    // 扩展同义词，提高召回率
    const expandedKeywords = this._expandKeywords(keywords)

    let segments = []

    // 优先使用 FTS5（支持 BM25 排序）
    if (this._checkFTS()) {
      segments = this._retrieveWithFTS(expandedKeywords, excludeDays)
    }

    // FTS5 不可用或无结果时，降级到 LIKE
    if (segments.length === 0) {
      segments = this._retrieveWithLike(expandedKeywords, excludeDays)
    }

    if (segments.length === 0) return []

    // 计算每个段落的相关度分数（纯关键词匹配，不做时间衰减）
    // StoryRAG 的核心目的是远距离回调——第 50 天能回忆起第 5 天的细节，
    // 时间衰减与这一目的矛盾，因此移除。
    const scored = segments.map(seg => {
      let score = 0
      const contentLower = seg.content
      for (const kw of expandedKeywords) {
        const matches = contentLower.split(kw).length - 1
        score += matches
      }
      return { ...seg, score }
    })

    scored.sort((a, b) => b.score - a.score)

    // 取 Top K，截取相关片段
    const top = scored.slice(0, this.topK)
    const snippets = top.map(seg => this.extractSnippet(seg, expandedKeywords))

    // Token 预算削减
    let result = snippets
    let totalTokens = TokenCounter.estimate(result.map(s => s.snippet).join('\n'))
    if (totalTokens > this.tokenBudget) {
      result = result.slice(0, this.fallbackK)
    }

    return result
  }

  // FTS5 检索（BM25 排序）
  _retrieveWithFTS(keywords, excludeDays) {
    try {
      // F8 修复：转义关键词中的双引号，防止破坏 MATCH 语法
      const safeKeywords = keywords.map(k => {
        const escaped = k.replace(/"/g, '""')
        return `"${escaped}"`
      })
      const matchQuery = safeKeywords.join(' OR ')
      let excludeClause = ''
      let params = [matchQuery]
      if (excludeDays.length > 0) {
        excludeClause = ` AND story_day NOT IN (${excludeDays.map(() => '?').join(',')})`
        params.push(...excludeDays)
      }
      return queryAll(
        `SELECT segment_id as id, story_day, chapter_id as chapter_id,
                content, bm25(story_fts) as rank
         FROM story_fts
         WHERE story_fts MATCH ?${excludeClause}
         ORDER BY rank
         LIMIT 20`,
        params
      )
    } catch (e) {
      console.warn('[StoryRAG] FTS5 检索失败，降级到 LIKE:', e.message)
      // F8 修复：不再永久禁用 FTS5，下次检索仍可尝试
      return []
    }
  }

  // LIKE 检索（降级方案）
  _retrieveWithLike(keywords, excludeDays) {
    const conditions = keywords.map(() => 'content LIKE ?').join(' OR ')
    const params = keywords.map(k => `%${k}%`)

    let excludeClause = ''
    if (excludeDays.length > 0) {
      excludeClause = ` AND day_number NOT IN (${excludeDays.map(() => '?').join(',')})`
      params.push(...excludeDays)
    }

    try {
      return queryAll(
        `SELECT id, chapter_id, day_number as story_day, content,
                LENGTH(content) as content_len
         FROM story_segments
         WHERE content IS NOT NULL AND LENGTH(content) > ?
         AND (${conditions})${excludeClause}
         ORDER BY content_len DESC
         LIMIT 20`,
        [this.minSnippetLen, ...params]
      )
    } catch (e) {
      console.warn('[StoryRAG] LIKE 检索失败:', e)
      return []
    }
  }

  // 从段落中提取相关片段（含上下文）
  extractSnippet(segment, keywords) {
    const content = segment.content
    if (content.length <= 600) {
      return {
        storyDay: segment.story_day,
        chapterId: segment.chapter_id,
        snippet: content,
        matchedKeywords: keywords.filter(kw => content.includes(kw))
      }
    }

    // 找到第一个匹配关键词的位置，截取上下文
    let matchPos = -1
    for (const kw of keywords) {
      const pos = content.indexOf(kw)
      if (pos >= 0) {
        matchPos = pos
        break
      }
    }
    if (matchPos < 0) matchPos = 0

    const start = Math.max(0, matchPos - this.contextRadius)
    const end = Math.min(content.length, matchPos + this.contextRadius + 200)
    let snippet = content.substring(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < content.length) snippet = snippet + '...'

    return {
      storyDay: segment.story_day,
      chapterId: segment.chapter_id,
      snippet,
      matchedKeywords: keywords.filter(kw => content.includes(kw))
    }
  }
}
