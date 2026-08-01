// src/core/ChapterManager.js
//
// 章节管理器：章节边界检测、新章节创建、摘要触发。
// 对应 10 步生成流程的步骤 10、功能规划 8.3 节章节边界检测。
//
// 章节边界定义（功能规划 8.1 节，从配置文件读取）：
//   序章：第 1-5 天
//   第一章：第 6-25 天
//   第二章：第 26-45 天
//   第三章：第 46-65 天
//   第四章：第 66-85 天
//   终章：第 86-90 天

class ChapterManager {
  /**
   * @param {Object} chapterRepo - ChapterRepository 实例（接口 B）
   * @param {Object} segmentRepo - SegmentRepository 实例（接口 B）
   * @param {Object} summaryGenerator - SummaryGenerator 实例
   */
  constructor(chapterRepo, segmentRepo, summaryGenerator, userRepo) {
    this.chapterRepo = chapterRepo;
    this.segmentRepo = segmentRepo;
    this.summaryGenerator = summaryGenerator;
    this.userRepo = userRepo;

    // 章节边界定义（与 MockStoryEngine.CHAPTER_BOUNDS 一致）
    this.chapterBounds = [
      { number: 0, end_day: 5 },
      { number: 1, end_day: 25 },
      { number: 2, end_day: 45 },
      { number: 3, end_day: 65 },
      { number: 4, end_day: 85 },
      { number: 5, end_day: 90 },
    ];

    // 章节标题
    this.chapterTitles = ['序章', '第一章', '第二章', '第三章', '第四章', '终章'];
  }

  /**
   * 检查章节边界
   * @param {number} dayNumber - 刚完成的天数
   * @param {Object} aiContext - AI 调用上下文（用于生成摘要）
   * @returns {Promise<{chapterCompleted: boolean, chapterSummary?: string}>}
   */
  async checkBoundary(dayNumber, aiContext = null) {
    const chapter = await this.chapterRepo.getCurrent();
    if (!chapter) {
      return { chapterCompleted: false };
    }

    // 判断是否到达章节边界（天数 >= 当前章节的 end_day）
    if (dayNumber < chapter.end_day) {
      return { chapterCompleted: false };
    }

    // ===== 章节完成 =====

    // 1. 收集本章所有段落内容
    const segments = await this.segmentRepo.getByChapter(chapter.id);
    const fullContent = segments
      .filter(s => s.content)
      .map(s => s.content)
      .join('\n\n');

    // 2. 生成章节摘要
    let summary = '';
    try {
      summary = await this.summaryGenerator.generate(fullContent, aiContext);
    } catch (e) {
      // 摘要生成失败，不阻断流程
      console.warn('摘要生成失败，稍后补生成:', e.message);
    }

    // 3. 更新章节状态为已完成
    await this.chapterRepo.update(chapter.id, {
      status: 'completed',
      content: fullContent,
      summary: summary,
      completed_at: new Date().toISOString(),
    });

    // 4. 创建下一章（如果还有下一章）
    const nextChapterNumber = chapter.chapter_number + 1;
    const existing = await this.chapterRepo.getByNumber(nextChapterNumber);
    if (!existing && nextChapterNumber <= 5) {
      await this._createNextChapter(nextChapterNumber);
    }

    // 5. 更新 user_settings.current_chapter 指向新章节
    // 真实 ChapterRepository.getCurrent() 通过 JOIN user_settings.current_chapter 查找，
    // 必须更新此字段，否则 getCurrent() 仍返回旧章节
    if (nextChapterNumber <= 5 && this.userRepo) {
      await this.userRepo.update({ current_chapter: nextChapterNumber });
      // 同步 MockChapterRepository 的当前章节号（真实 Repository 无此方法，不影响）
      if (typeof this.chapterRepo.setCurrentChapterNumber === 'function') {
        this.chapterRepo.setCurrentChapterNumber(nextChapterNumber);
      }
    }

    return {
      chapterCompleted: true,
      chapterSummary: summary,
    };
  }

  /**
   * 判断指定天数是否为章节边界
   * @param {number} dayNumber
   * @returns {boolean}
   */
  isChapterBoundary(dayNumber) {
    return this.chapterBounds.some(c => c.end_day === dayNumber);
  }

  /**
   * 获取指定天数所属的章节号
   * @param {number} dayNumber
   * @returns {number}
   */
  getChapterNumberByDay(dayNumber) {
    for (const bound of this.chapterBounds) {
      const startDay = bound.number === 0 ? 1 :
        this.chapterBounds[bound.number - 1].end_day + 1;
      if (dayNumber >= startDay && dayNumber <= bound.end_day) {
        return bound.number;
      }
    }
    return 0;
  }

  /**
   * 创建下一章
   * @private
   */
  async _createNextChapter(chapterNumber) {
    const prevBound = this.chapterBounds[chapterNumber - 1];
    const bound = this.chapterBounds[chapterNumber];
    if (!bound) return;

    const startDay = (prevBound ? prevBound.end_day : 0) + 1;
    const endDay = bound.end_day;
    const title = this.chapterTitles[chapterNumber] || `第${chapterNumber}章`;

    await this.chapterRepo.create({
      chapter_number: chapterNumber,
      title,
      content: '',
      summary: '',
      start_day: startDay,
      end_day: endDay,
      status: 'ongoing',
    });
  }
}

export default ChapterManager;
