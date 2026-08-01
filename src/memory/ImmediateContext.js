// src/memory/ImmediateContext.js
//
// 第一层记忆：即时上下文提供器。
// 从 SegmentRepository 获取最近 3 天已定稿的完整剧情原文，
// 保证最近剧情的细节连贯。
//
// 数据来源：story_segments 表中最近 3 条 status='finalized' 记录的 content 字段
// Token 预算：约 3000-4000 tokens
// 降级策略：3 天内容总 Token 超过 4000 时，降级为只取最近 2 天

import TokenCounter from '../utils/TokenCounter.js';

class ImmediateContext {
  constructor(segmentRepo) {
    this.segmentRepo = segmentRepo;
    this.maxDays = 5;           // 默认获取最近 5 天完整原文（原 3 天）
    this.fallbackDays = 3;      // Token 超限时降级为 3 天（原 2 天）
    this.tokenBudget = 8000;    // Token 预算上限提升（原 4000）
  }

  /**
   * 获取即时上下文
   * @param {number} currentDay - 当前天数
   * @returns {Promise<Array<{day_number: number, content: string}>>}
   */
  async get(currentDay) {
    // 第 1 天无历史数据
    if (currentDay <= 1) {
      return [];
    }

    try {
      // 从 SegmentRepository 获取最近 N 天已定稿段落
      let segments = await this.segmentRepo.getRecent(this.maxDays);

      // 过滤掉非 finalized 状态和内容为空的段落
      segments = segments.filter(
        s => s.status === 'finalized' && s.content && s.content.trim().length > 0
      );

      // 按天数正序排列（旧 → 新），便于 Prompt 中按时间线展示
      segments.sort((a, b) => a.day_number - b.day_number);

      // Token 预算检查
      const totalTokens = this._estimateTokens(segments);
      if (totalTokens > this.tokenBudget && segments.length > this.fallbackDays) {
        // 降级：只保留最近 2 天
        segments = segments.slice(-this.fallbackDays);
      }

      return segments.map(s => ({
        day_number: s.day_number,
        content: s.content,
      }));
    } catch (error) {
      // 获取失败返回空数组，不阻断生成流程
      console.warn('即时上下文获取失败:', error.message);
      return [];
    }
  }

  /**
   * 估算段落数组的总 Token 数
   * @private
   */
  _estimateTokens(segments) {
    return TokenCounter.estimateObjects(segments, s => s.content);
  }
}

export default ImmediateContext;
