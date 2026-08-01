// mock/MockDiaryRepository.js
//
// DiaryRepository 的 Mock 实现（接口 B）。
// 严格遵循角色分工总览 4.1 节 DiaryRepository 接口签名。
// behavior_tags 在存储时序列化为 JSON 字符串（与真实 SQLite 行为一致）。

class MockDiaryRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    this._seedTestData();
  }

  _seedTestData() {
    const samples = [
      {
        day_number: 5,
        raw_text: '今天看了两小时占卜相关的书，下午去健身房练了一个小时。',
        behavior_tags: ['学习', '健身'],
        is_blank_day: false,
      },
      {
        day_number: 6,
        raw_text: '今天上班开会讨论了新项目，晚上和朋友聚餐。',
        behavior_tags: ['工作', '社交'],
        is_blank_day: false,
      },
      {
        day_number: 7,
        raw_text: '今天在家休息，看了一部电影，下午睡了午觉。',
        behavior_tags: ['休息', '娱乐'],
        is_blank_day: false,
      },
    ];
    for (const sample of samples) {
      this.create(sample);
    }
  }

  async create({ day_number, raw_text, behavior_tags, is_blank_day = false }) {
    const id = this.idCounter++;
    this.data.push({
      id,
      day_number,
      raw_text,
      behavior_tags: JSON.stringify(behavior_tags || []),
      is_blank_day,
      created_at: new Date().toISOString(),
    });
    return id;
  }

  async getByDay(dayNumber) {
    const found = this.data.find(d => d.day_number === dayNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getById(id) {
    const found = this.data.find(d => d.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByRange(startDay, endDay) {
    const results = this.data.filter(
      d => d.day_number >= startDay && d.day_number <= endDay
    );
    return results.map(d => JSON.parse(JSON.stringify(d)));
  }

  async update(id, fields) {
    const item = this.data.find(d => d.id === id);
    if (item) {
      Object.assign(item, fields);
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

export default MockDiaryRepository;
