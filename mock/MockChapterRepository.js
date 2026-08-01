// mock/MockChapterRepository.js
//
// ChapterRepository 的 Mock 实现（接口 B）。
// 严格遵循角色分工总览 4.1 节 ChapterRepository 接口签名。
// 预置序章（已完成，含摘要）和第一章（进行中）用于测试摘要记忆与即时上下文。

class MockChapterRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    // 可设置的当前章节号，模拟真实 ChapterRepository.getCurrent() 的 JOIN 行为
    // 真实实现通过 user_settings.current_chapter 查找当前章节
    this._currentChapterNumber = 1; // 默认第一章
    this._seedTestData();
  }

  _seedTestData() {
    // 序章（已完成，含摘要，供 SummaryMemory 测试）
    this.data.push({
      id: this.idCounter++,
      chapter_number: 0,
      title: '序章',
      content: '林墨在日常生活中偶然接触到非凡现象，被一位神秘人引导觉醒为占卜家途径序列9...',
      summary: '主角林墨接触非凡现象，在神秘人引导下觉醒为占卜家途径序列9，获得了灵视和基础占卜能力，开始了非凡者之路。',
      start_day: 1,
      end_day: 5,
      status: 'completed',
      created_at: '2026-07-06T12:00:00',
      completed_at: '2026-07-06T18:00:00',
    });

    // 第一章（进行中，供 getCurrent 测试）
    this.data.push({
      id: this.idCounter++,
      chapter_number: 1,
      title: '第一章',
      content: '',
      summary: '',
      start_day: 6,
      end_day: 25,
      status: 'ongoing',
      created_at: '2026-07-06T18:00:00',
      completed_at: null,
    });
  }

  async getByNumber(chapterNumber) {
    const found = this.data.find(c => c.chapter_number === chapterNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getCurrent() {
    // 模拟真实 ChapterRepository.getCurrent() 的 JOIN user_settings.current_chapter 行为
    const found = this.data.find(c => c.chapter_number === this._currentChapterNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  // 设置当前章节号（模拟 user_settings.current_chapter）
  setCurrentChapterNumber(num) {
    this._currentChapterNumber = num;
  }

  async getAll() {
    return this.data.map(c => JSON.parse(JSON.stringify(c)));
  }

  async create(data) {
    const id = this.idCounter++;
    const chapter = {
      id,
      chapter_number: data.chapter_number || 0,
      title: data.title || '',
      content: data.content || '',
      summary: data.summary || '',
      start_day: data.start_day || 1,
      end_day: data.end_day || 5,
      status: data.status || 'ongoing',
      created_at: new Date().toISOString(),
      completed_at: null,
      ...data,
    };
    this.data.push(chapter);
    return id;
  }

  async update(id, fields) {
    const item = this.data.find(c => c.id === id);
    if (item) {
      Object.assign(item, fields);
      return true;
    }
    return false;
  }

  async updateContent(chapterId, content) {
    const item = this.data.find(c => c.id === chapterId);
    if (item) {
      item.content = content;
      return true;
    }
    return false;
  }

  async updateSummary(chapterId, summary) {
    const item = this.data.find(c => c.id === chapterId);
    if (item) {
      item.summary = summary;
      return true;
    }
    return false;
  }

  // ===== 测试辅助方法 =====
  clear() {
    this.data = [];
    this.idCounter = 1;
  }
}

export default MockChapterRepository;
