// src/memory/RAGRetriever.js
//
// 第三层记忆：RAG 检索器（档案记忆）。
// 从 WorldRepository 按关键词检索 Top 5 相关的世界观设定条目，
// 为 AI 提供精确的设定参考。
//
// 数据来源：world_settings 表，按 keywords 字段匹配检索
// 检索方式：
//   1. 合并日记解析关键词 + 途径相关关键词 + 基础世界观关键词
//   2. 从 world_settings 匹配 keywords 字段包含任一关键词的条目
//   3. 按 priority 权重降序，取 Top 5
// Token 预算：约 1000-2000 tokens
// 降级策略：检索结果总 Token 超过 2000 时，从 Top 5 降为 Top 3

import TokenCounter from '../utils/TokenCounter.js';

class RAGRetriever {
  constructor(worldRepo) {
    this.worldRepo = worldRepo;
    this.topN = 8;              // 检索 Top 8 设定条目（原 5）
    this.fallbackN = 5;         // 超限时降为 Top 5（原 3）
    this.tokenBudget = 3000;    // Token 预算（原 2000）
  }

  /**
   * 检索相关世界观设定
   * @param {string[]} keywords - 检索关键词（来自日记解析 + 章节阶段关键词）
   * @param {string} worldId - 世界观 ID
   * @param {string} pathId - 途径 ID
   * @returns {Promise<Array<Object>>} WorldSetting 数组
   */
  async retrieve(keywords, worldId, pathId) {
    try {
      // 合并关键词：日记解析关键词 + 途径相关关键词 + 基础世界观关键词
      const allKeywords = this._expandKeywords(keywords, pathId);

      if (allKeywords.length === 0) {
        return [];
      }

      // 从 WorldRepository 检索（多检索一些，后面做去重和筛选）
      let results = await this.worldRepo.searchByKeywords(
        worldId, allKeywords, this.topN * 2
      );

      // 去重（按 key 去重，保留 priority 更高的）
      results = this._deduplicate(results);

      // 按 priority 降序排序
      results.sort((a, b) => b.priority - a.priority);

      // 取 Top N
      results = results.slice(0, this.topN);

      // Token 预算检查
      const totalTokens = this._estimateTokens(results);
      if (totalTokens > this.tokenBudget && results.length > this.fallbackN) {
        results = results.slice(0, this.fallbackN);
      }

      return results;
    } catch (error) {
      console.warn('RAG 检索失败:', error.message);
      return [];
    }
  }

  /**
   * 扩展关键词
   * 加入途径相关关键词，确保途径设定总是被检索到
   * @private
   */
  _expandKeywords(keywords, pathId) {
    const expanded = [...(keywords || [])];

    // 途径相关关键词
    if (pathId === 'seer') {
      expanded.push('占卜家', '灵视', '占卜', '星象', '序列9', '塔罗会');
    }

    // 基础世界观关键词（始终包含）
    // 包含日常/势力/教会等维度，确保扮演机制和势力格局设定被可靠检索
    expanded.push('序列', '途径', '魔药', '非凡者', '日常', '势力', '教会', '塔罗会');

    // 去重
    return [...new Set(expanded)];
  }

  /**
   * 去重：按 key 字段去重，保留 priority 更高的
   * @private
   */
  _deduplicate(results) {
    const map = new Map();
    for (const item of results) {
      const existing = map.get(item.key);
      if (!existing || item.priority > existing.priority) {
        map.set(item.key, item);
      }
    }
    return Array.from(map.values());
  }

  /**
   * 估算检索结果的总 Token 数
   * @private
   */
  _estimateTokens(results) {
    return TokenCounter.estimateObjects(results, r => r.value);
  }
}

export default RAGRetriever;
