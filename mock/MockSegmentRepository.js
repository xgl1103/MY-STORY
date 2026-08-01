// mock/MockSegmentRepository.js
//
// SegmentRepository 的 Mock 实现（接口 B）。
// 严格遵循角色分工总览 4.1 节 SegmentRepository 接口签名。
// 预置最近 3 天的已定稿段落（第 5/6/7 天），供 ImmediateContext 测试。

class MockSegmentRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    this._seedTestData();
  }

  _seedTestData() {
    const samples = [
      {
        day_number: 5,
        chapter_id: 1,
        diary_id: 1,
        content: '林墨翻开那本泛黄的神秘学典籍，烛光在书页上跳动。他感到一阵寒意从脊背升起，仿佛有什么东西正在暗处注视着他。灵视中，书页上的文字似乎在缓缓蠕动...',
        status: 'finalized',
      },
      {
        day_number: 6,
        chapter_id: 2,
        diary_id: 2,
        content: '塔罗会的聚会如期举行。林墨以「愚者」的代号参与了这次雾之上的集会。其他成员带来了关于城市中异常波动的情报，似乎有什么东西正在苏醒...',
        status: 'finalized',
      },
      {
        day_number: 7,
        chapter_id: 2,
        diary_id: 3,
        content: '午后的阳光透过窗帘的缝隙洒入房间，林墨从冥想中缓缓睁开双眼。灵性力量的恢复让他感到前所未有的清明。他取出一副塔罗牌，开始为今晚的行动进行占卜...',
        status: 'finalized',
      },
    ];

    for (const sample of samples) {
      const id = this.idCounter++;
      this.data.push({
        id,
        ...sample,
        mapping_desc: JSON.stringify([
          { behavior: '学习', world_behavior: '研读神秘学典籍', description: '研读神秘学相关书籍' },
        ]),
        revision_count: 0,
        internal_review_count: 2,
        is_edited: false,
        created_at: new Date(Date.now() - (8 - sample.day_number) * 86400000).toISOString(),
        finalized_at: new Date(Date.now() - (8 - sample.day_number) * 86400000 + 3600000).toISOString(),
      });
    }
  }

  async create({ day_number, chapter_id, diary_id, status = 'pending' }) {
    const id = this.idCounter++;
    this.data.push({
      id,
      day_number,
      chapter_id,
      diary_id,
      content: '',
      mapping_desc: '',
      revision_count: 0,
      internal_review_count: 0,
      is_edited: false,
      status,
      created_at: new Date().toISOString(),
      finalized_at: null,
    });
    return id;
  }

  async getById(id) {
    const found = this.data.find(s => s.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByDay(dayNumber) {
    const found = this.data.find(s => s.day_number === dayNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getRecent(days) {
    // 返回最近 N 条已定稿段落，按 day_number 正序（旧→新）
    // 与真实 SegmentRepository.getRecent 行为一致：取最近 N 条后 reverse
    const finalized = this.data
      .filter(s => s.status === 'finalized')
      .sort((a, b) => b.day_number - a.day_number)
      .slice(0, days)
      .reverse();
    return finalized.map(s => JSON.parse(JSON.stringify(s)));
  }

  async getByChapter(chapterId) {
    const results = this.data.filter(s => s.chapter_id === chapterId);
    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async updateContent(id, content) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.content = content;
      return true;
    }
    return false;
  }

  async updateStatus(id, status) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.status = status;
      return true;
    }
    return false;
  }

  async updateMapping(id, mappingDesc) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.mapping_desc = mappingDesc;
      return true;
    }
    return false;
  }

  async commitDraft(id, { content, references = undefined, reviewCount = undefined, incrementRevision = false }) {
    const item = this.data.find(s => s.id === id);
    if (!item) throw new Error(`段落 ${id} 不存在，无法提交草稿`);
    item.content = content;
    if (references !== undefined) item.diary_references = references;
    if (reviewCount !== undefined) item.internal_review_count = reviewCount;
    if (incrementRevision) item.revision_count++;
    item.status = 'draft_ready';
    return true;
  }

  // 更新内部审查轮次数（与真实 SegmentRepository 保持一致）
  async updateReviewCount(id, reviewCount) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.internal_review_count = reviewCount;
      return true;
    }
    return false;
  }

  async incrementRevision(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.revision_count++;
      return true;
    }
    return false;
  }

  async markEdited(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.is_edited = true;
      return true;
    }
    return false;
  }

  async markFinalized(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.status = 'finalized';
      item.finalized_at = new Date().toISOString();
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

export default MockSegmentRepository;
