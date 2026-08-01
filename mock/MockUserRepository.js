// mock/MockUserRepository.js
//
// UserRepository 的 Mock 实现（接口 B）。
// 严格遵循角色分工总览 4.1 节 UserRepository 接口签名。
// 阶段 1-2 AI 工程师独立开发使用，阶段 3 联调时替换为前端工程师的真实实现。

class MockUserRepository {
  constructor() {
    this.data = {
      id: 1,
      hero_name: '林墨',
      world_id: 'lord_of_mysteries',
      path_id: 'seer',
      duration_days: 90,
      current_day: 7,
      current_chapter: 1,
      ai_provider: 'deepseek',
      ai_base_url: null,
      api_key_encrypted: '',
      ai_temperature: 0.8,
      ai_max_tokens: 2000,
      story_started: true,
      created_at: '2026-07-06T12:00:00',
    };
  }

  async get() {
    // 返回深拷贝，防止外部修改内部数据
    return JSON.parse(JSON.stringify(this.data));
  }

  async update(fields) {
    Object.assign(this.data, fields);
    return true;
  }

  // ===== 测试辅助方法 =====
  reset() {
    this.data.current_day = 7;
    this.data.current_chapter = 1;
    this.data.story_started = true;
  }

  setState(state) {
    Object.assign(this.data, state);
  }
}

export default MockUserRepository;
