// src/memory/SummaryMemory.js
//
// 第二层记忆：摘要记忆提供器。
// 从 ChapterRepository 获取所有已完成章节的摘要，让 AI 了解故事宏观进展。
//
// 数据来源：chapters 表中 status='completed' 且 summary 非空的记录
// Token 预算：约 800-1500 tokens（6 个章节 × 200-300 字）
// 降级策略：所有摘要总 Token 超过 1500 时，只保留最近 2 章摘要

import TokenCounter from '../utils/TokenCounter.js';

class SummaryMemory {
  constructor(chapterRepo) {
    this.chapterRepo = chapterRepo;
    this.maxChapters = 6;       // 最多 6 个章节
    this.fallbackChapters = 0;  // 0 = 不降级，保留全部
    this.tokenBudget = 3000;    // Token 预算上限（原 1500）
  }

  /**
   * 获取所有已完成章节的摘要
   * @returns {Promise<Array<{title: string, summary: string}>>}
   */
  async getAll() {
    try {
      const chapters = await this.chapterRepo.getAll();

      // 只取已完成且有摘要的章节
      let completed = chapters.filter(
        c => c.status === 'completed' && c.summary && c.summary.trim().length > 0
      );

      // 按章节号正序排列
      completed.sort((a, b) => a.chapter_number - b.chapter_number);

      // Token 预算检查
      const totalTokens = this._estimateTokens(completed);
      if (totalTokens > this.tokenBudget && completed.length > this.fallbackChapters) {
        // 降级：只保留最近 2 章摘要
        completed = completed.slice(-this.fallbackChapters);
      }

      return completed.map(c => ({
        title: this._getChapterTitle(c.chapter_number, c.title),
        summary: c.summary,
      }));
    } catch (error) {
      console.warn('摘要记忆获取失败:', error.message);
      return [];
    }
  }

  /**
   * 获取章节标题（优先用数据库存储的 title，否则按章节号推断）
   * @private
   */
  _getChapterTitle(chapterNumber, title) {
    if (title) return title;
    const names = ['序章', '第一章', '第二章', '第三章', '第四章', '终章'];
    return names[chapterNumber] || `第${chapterNumber}章`;
  }

  /**
   * 估算摘要数组的总 Token 数
   * @private
   */
  _estimateTokens(chapters) {
    return TokenCounter.estimateObjects(chapters, c => c.summary);
  }
}

export default SummaryMemory;
