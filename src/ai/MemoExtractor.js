// src/ai/MemoExtractor.js
// 记忆提取器：在章节定稿后，用一次轻量 AI 调用完成三件事：
//   1. 提取/更新实体状态（角色/物品/地点）
//   2. 检测新埋设的伏笔
//   3. 检测本段是否回收了既有伏笔
//
// 从第一性原理：正则提取噪音大、无语义理解；AI 提取精确但需控制成本。
// 策略：一次调用同时完成三项任务，输出结构化 JSON，Token 消耗约 800-1200。
// 降级：AI 调用失败时回退到正则提取（Mock 模式）。

import { EntityRepository } from '../db/repositories/EntityRepository.js'
import { ForeshadowingRepository } from '../db/repositories/ForeshadowingRepository.js'

const SYSTEM_PROMPT = `你是一个故事分析助手。请从给定的故事段落中提取以下信息，以 JSON 格式输出：

1. entities：本段出现的角色、物品、地点。每个实体包含：
   - type: "character" | "item" | "location"
   - name: 实体名称（2-10字）
   - description: 一句话描述当前状态（外貌/能力/用途/关系），不要只写"出现了"
   - status: "active"（活跃角色/重要物品/常驻地点）| "mentioned"（仅提及）

2. foreshadowing_planted：本段埋设的伏笔（暗示、悬念、未解释的异常）。每个包含：
   - description: 伏笔内容（10-30字，具体描述）
   - priority: "high"（关键悬念/重要线索）| "normal"（普通暗示）| "low"（细微异常）

3. foreshadowing_resolved：本段是否回收了某个之前埋设的伏笔。每个包含：
   - description: 被回收的伏笔内容（尽量与埋设时的描述匹配）
   - resolution: 回收方式简述

如果某项为空，输出空数组。只输出 JSON，不要其他文字。`

export class MemoExtractor {
  constructor({ entityRepo = EntityRepository, foreshadowRepo = ForeshadowingRepository } = {}) {
    this.maxContentChars = 3000  // 截取前 3000 字送给 AI，控制成本
    this.entityRepo = entityRepo
    this.foreshadowRepo = foreshadowRepo
  }

  /**
   * 提取记忆（实体+伏笔），支持 AI 和降级两种模式
   * @param {string} content - 故事段落内容
   * @param {number} storyDay - 故事天数
   * @param {number} chapterNumber - 章节号
   * @param {Object|null} aiContext - AI 上下文 { adapter, apiKey, baseUrl }，null 则用降级模式
   */
  async extract(content, storyDay, chapterNumber, aiContext = null) {
    if (!content || content.trim().length < 20) return { entities: [], planted: [], resolved: [] }

    // 获取当前未回收伏笔列表，供 AI 参考检测回收
    let unresolvedList = []
    try {
      unresolvedList = this.foreshadowRepo.getUnresolved()
    } catch (e) { /* ignore */ }

    if (aiContext && aiContext.adapter) {
      try {
        return await this._extractWithAI(content, storyDay, chapterNumber, aiContext, unresolvedList)
      } catch (e) {
        console.warn('[MemoExtractor] AI 提取失败，降级到正则模式:', e.message)
      }
    }

    // 降级：正则提取
    return this._extractWithRegex(content, storyDay, chapterNumber)
  }

  // AI 提取模式
  async _extractWithAI(content, storyDay, chapterNumber, aiContext, unresolvedList) {
    const truncated = content.length > this.maxContentChars
      ? content.substring(0, this.maxContentChars) + '...'
      : content

    let userPrompt = `故事段落（第${storyDay}天，第${chapterNumber}章）：\n${truncated}`

    // 提供未回收伏笔列表，帮助 AI 检测回收
    if (unresolvedList.length > 0) {
      const list = unresolvedList.slice(0, 10).map((f, i) =>
        `${i + 1}. ${f.description}（第${f.planted_day}天埋设）`
      ).join('\n')
      userPrompt += `\n\n当前未回收的伏笔列表：\n${list}\n\n请检查本段是否回收了其中任何一条。`
    }

    const response = await aiContext.adapter.chat({
      apiKey: aiContext.apiKey,
      baseUrl: aiContext.baseUrl,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 1500,
    })

    // 检查 AI 调用是否成功——失败时抛异常以触发 catch 块中的 regex 回退
    if (!response || !response.success) {
      throw new Error(`AI 调用失败: ${response?.error || '无响应'}`)
    }

    const parsed = this._parseAIResponse(response)

    // 写入数据库
    await this._persistEntities(parsed.entities || [], storyDay)
    await this._persistForeshadowingPlanted(parsed.foreshadowing_planted || [], storyDay, chapterNumber)
    await this._persistForeshadowingResolved(parsed.foreshadowing_resolved || [], unresolvedList, storyDay, chapterNumber)

    return {
      entities: parsed.entities || [],
      planted: parsed.foreshadowing_planted || [],
      resolved: parsed.foreshadowing_resolved || []
    }
  }

  // 解析 AI 返回的 JSON
  _parseAIResponse(response) {
    if (!response) throw new Error('AI 返回为空')
    const text = typeof response === 'string' ? response : (response.content || response.text || '')
    if (!text || text.trim().length === 0) throw new Error('AI 返回内容为空')

    // 尝试直接解析
    try { return JSON.parse(text) } catch (_) { /* 继续 */ }

    // 尝试从 markdown 代码块中提取
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()) } catch (_) { /* 继续 */ }
    }

    // 尝试从花括号中提取
    const braceMatch = text.match(/\{[\s\S]*\}/)
    if (braceMatch) {
      try { return JSON.parse(braceMatch[0]) } catch (_) { /* 继续 */ }
    }

    console.warn('[MemoExtractor] 无法解析 AI 返回的 JSON')
    // R6 修复：抛出异常以触发外层 catch 中的正则回退
    throw new Error('AI 返回的 JSON 无法解析')
  }

  // 写入实体（AI 版本：description 是 AI 生成的真实描述）
  async _persistEntities(entities, storyDay) {
    for (const e of entities) {
      if (!e.name || !e.type) continue
      await this.entityRepo.upsert({
        entity_type: e.type,
        entity_name: e.name,
        description: e.description || `在第${storyDay}天出现`,
        status: e.status || 'mentioned',
        first_day: storyDay,
        last_day: storyDay
      })
    }
  }

  // 写入新伏笔
  async _persistForeshadowingPlanted(planted, storyDay, chapterNumber) {
    for (const f of planted) {
      if (!f.description) continue
      // 去重
      try {
        const existing = this.foreshadowRepo.getUnresolved()
          .find(x => x.description === f.description)
        if (existing) continue
      } catch (e) { /* ignore */ }
      await this.foreshadowRepo.create({
        planted_day: storyDay,
        planted_chapter: chapterNumber,
        description: f.description,
        priority: f.priority || 'normal'
      })
    }
  }

  // 标记回收的伏笔（闭环！）
  async _persistForeshadowingResolved(resolved, unresolvedList, storyDay, chapterNumber) {
    for (const r of resolved) {
      if (!r.description) continue
      // 模糊匹配未回收伏笔
      const matched = this._matchForeshadowing(r.description, unresolvedList)
      if (matched) {
        await this.foreshadowRepo.resolve(
          matched.id, storyDay, chapterNumber, r.resolution || '已在故事中回收'
        )
      }
    }
  }

  // 模糊匹配伏笔描述
  _matchForeshadowing(description, unresolvedList) {
    if (!unresolvedList || unresolvedList.length === 0) return null

    // 精确匹配
    let match = unresolvedList.find(f => f.description === description)
    if (match) return match

    // 包含匹配（AI 的描述可能更详细或略有不同）
    match = unresolvedList.find(f =>
      f.description.includes(description) || description.includes(f.description)
    )
    if (match) return match

    // 关键词重叠匹配
    const descWords = (description.match(/[\u4e00-\u9fa5]{2,}/g) || [])
    match = unresolvedList.find(f => {
      const fWords = f.description.match(/[\u4e00-\u9fa5]{2,}/g) || []
      const overlap = descWords.filter(w => fWords.some(fw => fw.includes(w) || w.includes(fw)))
      return overlap.length >= 2
    })
    return match || null
  }

  // 降级模式：正则提取（保留原有逻辑作为 fallback）
  async _extractWithRegex(content, storyDay, chapterNumber) {
    let entities = []
    let planted = []

    try {
      entities = await this.entityRepo.extractFromContent(content, storyDay)
      planted = await this.foreshadowRepo.extractFromContent(content, storyDay, chapterNumber)
    } catch (e) { /* ignore */ }

    // 正则模式无法检测回收，跳过
    return { entities, planted, resolved: [] }
  }
}
